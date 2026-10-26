import {
  answerQuestionSchema,
  askUserQuestionSchema,
  canReplyTo,
  type ChatOptions,
  chatOptionsSchema,
  type FlaiPart,
  isAskUserPart,
  isMultiSelect,
  type ModelRef,
  regenerateSchema,
  sendMessageSchema,
  textOf,
  toFilePart,
} from '@flai/shared'
import { formatQuestionAnswer } from '@mastra/core/tools'
import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { AppError, badRequest, notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { replyStreamResponse } from '../lib/reply-stream'
import { toMessage } from '../lib/serialize'
import { cancelGeneration, startGeneration } from '../llm/generation'
import { generationBus, isStreamPosition } from '../llm/stream-bus'
import { resolveThinking } from '../llm/models'
import { getConversation, loadPath, touchConversation } from '../services/conversations'
import { ownedFiles } from '../services/files'
import { resolveModel } from '../services/providers'

async function assertNewAssistantId(id: string) {
  if (
    await db.query.messages.findFirst({ where: eq(schema.messages.id, id), columns: { id: true } }) ||
    await generationBus().info(id)
  ) {
    throw new AppError('CONFLICT', 'Assistant message id already exists')
  }
}

/** Validate the model, options and reply id shared by every request that starts a reply. */
async function prepareReply(input: { assistantId: string; model: ModelRef; options: ChatOptions }) {
  const resolved = resolveModel(input.model.providerId, input.model.modelId)
  resolveThinking(resolved.model, input.options.thinking)
  await assertNewAssistantId(input.assistantId)
  return resolved
}

const samePartsJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const messageRoutes = new Hono<AppEnv>()
  .post('/conversations/:id/messages', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const input = await body(c, sendMessageSchema)
    const { provider, model } = await prepareReply(input)

    const { message } = input
    if (!message.text.trim() && message.fileIds.length === 0) throw badRequest('Message is empty')
    const files = await ownedFiles(user.id, message.fileIds)
    if (files.length > 0 && !model.attachment) throw badRequest('This model does not accept attachments')
    if (message.parentId) await loadPath(conversation.id, message.parentId)

    const parts: FlaiPart[] = [...(message.text ? [{ type: 'text' as const, text: message.text }] : []), ...files.map(toFilePart)]

    // Retrying the same send (e.g. after a dropped connection) must not fail or duplicate.
    const existing = await db.query.messages.findFirst({ where: eq(schema.messages.id, message.id) })
    if (existing) {
      if (
        existing.conversationId !== conversation.id ||
        existing.role !== 'user' ||
        existing.parentId !== message.parentId ||
        !samePartsJson(existing.parts, parts)
      ) {
        throw new AppError('CONFLICT', 'Message id already exists')
      }
    } else {
      await db.transaction(async (tx) => {
        await tx.insert(schema.messages).values({
          id: message.id,
          conversationId: conversation.id,
          parentId: message.parentId,
          role: 'user',
          parts,
          searchText: textOf(parts),
        })
        await touchConversation(conversation.id, tx)
      })
    }

    const path = await loadPath(conversation.id, message.id)
    await startGeneration({
      userId: user.id,
      chatHistory: user.preferences.chatHistory !== false,
      conversationId: conversation.id,
      assistantId: input.assistantId,
      path,
      provider,
      model,
      options: input.options,
    })
    return replyStreamResponse(input.assistantId, '0', c.req.raw.signal)
  })
  .post('/conversations/:id/messages/:messageId/regenerate', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const input = await body(c, regenerateSchema)
    const { provider, model } = await prepareReply(input)

    const path = await loadPath(conversation.id, c.req.param('messageId'))
    if (!canReplyTo(path.at(-1)!)) {
      throw badRequest('Only replies to user messages or answered questions can be regenerated')
    }
    if (path.some((m) => m.parts.some((p) => p.type === 'file')) && !model.attachment) {
      throw badRequest('This model does not accept attachments')
    }
    await startGeneration({
      userId: user.id,
      chatHistory: user.preferences.chatHistory !== false,
      conversationId: conversation.id,
      assistantId: input.assistantId,
      path,
      provider,
      model,
      options: input.options,
    })
    return replyStreamResponse(input.assistantId, '0', c.req.raw.signal)
  })
  .post('/conversations/:id/messages/:messageId/answer', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const input = await body(c, answerQuestionSchema)
    await assertNewAssistantId(input.assistantId)

    const result = await db.transaction(async (tx) => {
      // Serialize answers and message deletion within this conversation.
      const [locked] = await tx.select().from(schema.conversations)
        .where(and(eq(schema.conversations.id, conversation.id), isNull(schema.conversations.deletedAt))).for('update')
      if (!locked) throw notFound('Conversation')
      if (await generationBus().active(conversation.id)) throw new AppError('CONFLICT', 'A reply is still being generated')
      const [message] = await tx.select().from(schema.messages).where(and(
        eq(schema.messages.id, c.req.param('messageId')),
        eq(schema.messages.conversationId, conversation.id),
        isNull(schema.messages.deletedAt),
      )).for('update')
      if (!message || message.role !== 'assistant') throw notFound('Question')
      const child = await tx.query.messages.findFirst({ where: and(
        eq(schema.messages.parentId, message.id), isNull(schema.messages.deletedAt),
      ), columns: { id: true } })
      if (child) throw new AppError('CONFLICT', 'This conversation has already continued past the question')
      const part = message.parts.find((p) => isAskUserPart(p) && p.toolCallId === input.toolCallId)
      if (!part || !isAskUserPart(part)) throw notFound('Question')
      if (part.state !== 'input-available') throw new AppError('CONFLICT', 'This question is no longer awaiting an answer')
      const question = askUserQuestionSchema.safeParse(part.input)
      if (!question.success) throw badRequest('Invalid question')
      if (Array.isArray(input.answer) !== isMultiSelect(question.data)) throw badRequest('Answer does not match the question selection mode')

      const { providerId, modelId } = message.metadata
      if (!providerId || !modelId) throw badRequest('Question has no model configuration')
      const { provider, model } = resolveModel(providerId, modelId)
      const options = chatOptionsSchema.parse(message.metadata.chatOptions ?? {})
      resolveThinking(model, options.thinking)
      const parts = message.parts.map((p): FlaiPart => p === part ? {
        ...part,
        state: 'output-available',
        output: { answer: input.answer, content: `User answered: ${formatQuestionAnswer(input.answer)}`, isError: false },
      } : p)
      const [updated] = await tx.update(schema.messages).set({ parts }).where(eq(schema.messages.id, message.id)).returning()
      await touchConversation(conversation.id, tx)
      return {
        message: updated!, provider, model, options,
        path: await loadPath(conversation.id, message.id, tx),
        pending: parts.some((p) => isAskUserPart(p) && p.state === 'input-available'),
      }
    })

    if (!result.pending) await startGeneration({
      userId: user.id, conversationId: conversation.id, assistantId: input.assistantId,
      chatHistory: user.preferences.chatHistory !== false,
      path: result.path, provider: result.provider, model: result.model, options: result.options,
    })
    return c.json({
      message: toMessage(result.message),
      generation: result.pending ? null : { assistantId: input.assistantId, parentId: result.message.id },
    })
  })
  // Resume (or join) a reply's stream, e.g. after a dropped connection or a page reload.
  .get('/generations/:assistantId/stream', async (c) => {
    const assistantId = c.req.param('assistantId')
    const info = await generationBus().info(assistantId)
    if (!info || info.userId !== c.get('user').id) throw notFound('Generation')
    const after = c.req.query('after') ?? c.req.header('last-event-id') ?? '0'
    if (!isStreamPosition(after)) throw badRequest('Invalid stream position')
    return replyStreamResponse(assistantId, after, c.req.raw.signal)
  })
  .post('/generations/:assistantId/cancel', async (c) => {
    // Stopping a reply that already finished is fine: the client just reads the end of the stream.
    if ((await cancelGeneration(c.req.param('assistantId'), c.get('user').id)) === 'not-found') throw notFound('Generation')
    return c.body(null, 204)
  })
