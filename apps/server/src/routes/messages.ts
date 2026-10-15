import { type FlaiPart, regenerateSchema, sendMessageSchema, textOf } from '@flai/shared'
import { createUIMessageStreamResponse } from 'ai'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { AppError, badRequest, notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { cancelGeneration, startGeneration } from '../llm/generation'
import { resolveThinking } from '../llm/models'
import { getConversation, loadPath, touchConversation } from '../services/conversations'
import { resolveModel } from '../services/providers'
import { ownedFiles } from './files'

const KEEP_ALIVE_MS = 15_000

async function assertNewAssistantId(id: string) {
  if (await db.query.messages.findFirst({ where: eq(schema.messages.id, id), columns: { id: true } })) {
    throw new AppError('CONFLICT', 'Assistant message id already exists')
  }
}

const samePartsJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const messageRoutes = new Hono<AppEnv>()
  .post('/conversations/:id/messages', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const input = await body(c, sendMessageSchema)
    const { provider, model } = resolveModel(input.model.providerId, input.model.modelId)
    resolveThinking(model, input.options.thinking)
    await assertNewAssistantId(input.assistantId)

    const { message } = input
    if (!message.text.trim() && message.fileIds.length === 0) throw badRequest('Message is empty')
    const files = await ownedFiles(user.id, message.fileIds)
    if (files.length > 0 && !model.attachment) throw badRequest('This model does not accept attachments')
    if (message.parentId) await loadPath(conversation.id, message.parentId)

    const parts: FlaiPart[] = [
      ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
      ...files.map(
        (f): FlaiPart => ({
          type: 'file',
          mediaType: f.mediaType,
          filename: f.name,
          url: f.url,
          providerMetadata: { flai: { fileId: f.id, size: f.size } },
        }),
      ),
    ]

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
    const stream = startGeneration({
      userId: user.id,
      conversationId: conversation.id,
      assistantId: input.assistantId,
      path,
      provider,
      model,
      options: input.options,
    })
    return createUIMessageStreamResponse({ stream, keepAliveMs: KEEP_ALIVE_MS })
  })
  .post('/conversations/:id/messages/:messageId/regenerate', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const input = await body(c, regenerateSchema)
    const { provider, model } = resolveModel(input.model.providerId, input.model.modelId)
    resolveThinking(model, input.options.thinking)
    await assertNewAssistantId(input.assistantId)

    const path = await loadPath(conversation.id, c.req.param('messageId'))
    if (path.at(-1)!.role !== 'user') throw badRequest('Only replies to user messages can be regenerated')
    if (path.some((m) => m.parts.some((p) => p.type === 'file')) && !model.attachment) {
      throw badRequest('This model does not accept attachments')
    }
    const stream = startGeneration({
      userId: user.id,
      conversationId: conversation.id,
      assistantId: input.assistantId,
      path,
      provider,
      model,
      options: input.options,
    })
    return createUIMessageStreamResponse({ stream, keepAliveMs: KEEP_ALIVE_MS })
  })
  .post('/generations/:assistantId/cancel', (c) => {
    if (!cancelGeneration(c.req.param('assistantId'), c.get('user').id)) throw notFound('Generation')
    return c.body(null, 204)
  })
