import type { ContentMessage, TreeNode } from "../../types/chat";

const GOOGLE_FOOTNOTE_START_MARKER = "<!-- flai-google-footnotes:start -->";
const GOOGLE_FOOTNOTE_END_MARKER = "<!-- flai-google-footnotes:end -->";
const UTF8_ENCODER = new TextEncoder();

function byteOffsetToCharIndex(text: string, byteOffset: number): number {
    if (byteOffset <= 0) {
        return 0;
    }

    const totalBytes = UTF8_ENCODER.encode(text).length;
    if (byteOffset >= totalBytes) {
        return text.length;
    }

    let consumedBytes = 0;
    for (let i = 0; i < text.length; i += 1) {
        const codePoint = text.codePointAt(i);
        if (codePoint === undefined) {
            break;
        }

        const char = String.fromCodePoint(codePoint);
        const nextBytes = consumedBytes + UTF8_ENCODER.encode(char).length;
        if (nextBytes >= byteOffset) {
            return nextBytes === byteOffset ? i + char.length : i;
        }

        consumedBytes = nextBytes;
        if (char.length === 2) {
            i += 1;
        }
    }

    return text.length;
}

export function applyGoogleGroundingFootnotes(message: Pick<TreeNode, "content" | "meta_info">): void {
    const groundingData = message.meta_info?.google_grounding_data;
    if (!message.content || !groundingData?.groundingSupports?.length || !groundingData.groundingChunks?.length) {
        return;
    }

    const textBlocks: Array<{
        data: ContentMessage;
        text: string;
    }> = [];

    for (const content of message.content) {
        if (content.type !== "message") {
            continue;
        }

        const data = content.data as ContentMessage;
        if (data.content.includes(GOOGLE_FOOTNOTE_START_MARKER)) {
            return;
        }

        textBlocks.push({
            data,
            text: data.content,
        });
    }

    if (textBlocks.length === 0) {
        return;
    }

    const insertions = new Map<number, Map<number, number[]>>();
    for (const support of groundingData.groundingSupports) {
        const endByteIndex = support.segment?.endIndex;
        if (endByteIndex === undefined || endByteIndex < 0 || !support.groundingChunkIndices?.length) {
            continue;
        }

        const chunkIndices = Array.from(
            new Set(
                support.groundingChunkIndices.filter((chunkIndex) => {
                    const uri = groundingData.groundingChunks[chunkIndex]?.web?.uri;
                    return typeof uri === "string" && uri.length > 0;
                })
            )
        ).sort((a, b) => a - b);

        if (chunkIndices.length === 0) {
            continue;
        }

        const startByteIndex = support.segment?.startIndex ?? 0;
        const segmentText = support.segment?.text;

        let targetBlockIndex = -1;
        let targetCharIndex = -1;

        for (let blockIndex = 0; blockIndex < textBlocks.length; blockIndex += 1) {
            const block = textBlocks[blockIndex];
            const startCharIndex = byteOffsetToCharIndex(block.text, startByteIndex);
            const endCharIndex = byteOffsetToCharIndex(block.text, endByteIndex);
            const candidateText = block.text.slice(startCharIndex, endCharIndex);

            if (!segmentText || candidateText === segmentText) {
                targetBlockIndex = blockIndex;
                targetCharIndex = endCharIndex;
                break;
            }
        }

        if (targetBlockIndex === -1 && segmentText) {
            for (let blockIndex = textBlocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
                const block = textBlocks[blockIndex];
                const segmentIndex = block.text.lastIndexOf(segmentText);
                if (segmentIndex !== -1) {
                    targetBlockIndex = blockIndex;
                    targetCharIndex = segmentIndex + segmentText.length;
                    break;
                }
            }
        }

        if (targetBlockIndex === -1) {
            if (textBlocks.length !== 1) {
                continue;
            }

            targetBlockIndex = 0;
            targetCharIndex = byteOffsetToCharIndex(textBlocks[0].text, endByteIndex);
        }

        const blockInsertions = insertions.get(targetBlockIndex) ?? new Map<number, number[]>();
        const existingChunkIndices = blockInsertions.get(targetCharIndex) ?? [];
        for (const chunkIndex of chunkIndices) {
            if (!existingChunkIndices.includes(chunkIndex)) {
                existingChunkIndices.push(chunkIndex);
            }
        }
        existingChunkIndices.sort((a, b) => a - b);
        blockInsertions.set(targetCharIndex, existingChunkIndices);
        insertions.set(targetBlockIndex, blockInsertions);
    }

    if (insertions.size === 0) {
        return;
    }

    const referencedChunkIndices = new Set<number>();
    for (const [blockIndex, block] of textBlocks.entries()) {
        const relevantInsertions = Array.from(insertions.get(blockIndex)?.entries() ?? []).sort(
            (a, b) => b[0] - a[0]
        );

        if (relevantInsertions.length === 0) {
            continue;
        }

        let formattedText = block.text;
        for (const [charIndex, chunkIndices] of relevantInsertions) {
            const footnoteRefs = chunkIndices
                .map((chunkIndex) => {
                    referencedChunkIndices.add(chunkIndex);
                    return `[^${chunkIndex + 1}]`;
                })
                .join("");

            formattedText =
                formattedText.slice(0, charIndex) +
                footnoteRefs +
                formattedText.slice(charIndex);
        }

        block.data.content = formattedText;
    }

    if (referencedChunkIndices.size === 0) {
        return;
    }

    const footnoteLines = Array.from(referencedChunkIndices)
        .sort((a, b) => a - b)
        .map((chunkIndex) => {
            const web = groundingData.groundingChunks[chunkIndex]?.web;
            const uri = web?.uri;
            const title = web?.title?.trim();
            if (!uri) {
                return null;
            }
            if (title) {
                return `[^${chunkIndex + 1}]: [${title}](${uri})`;
            }
            return `[^${chunkIndex + 1}]: ${uri}`;
        })
        .filter((line): line is string => line !== null);

    if (footnoteLines.length === 0) {
        return;
    }

    const lastTextBlock = textBlocks[textBlocks.length - 1];
    lastTextBlock.data.content = `${lastTextBlock.data.content}\n\n${GOOGLE_FOOTNOTE_START_MARKER}\n${footnoteLines.join("\n")}\n${GOOGLE_FOOTNOTE_END_MARKER}`;
}
