import type { GoogleGroundingChunk, GoogleGroundingSupport, OpenaiGroundingData } from "./types";

/**
 * Apply Google grounding citations to text content
 */
export function applyGoogleCitations(
    text: string,
    supports: GoogleGroundingSupport[],
    chunks: GoogleGroundingChunk[]
): string {
    if (!supports || supports.length === 0) return text;

    let newText = text;

    supports.forEach((support) => {
        const segmentText = support.segment.text;
        if (segmentText) {
            const indices = support.groundingChunkIndices
                .map((i) => {
                    const chunk = chunks[i];
                    if (chunk?.web?.uri) {
                        return `[[${i + 1}]](${chunk.web.uri})`;
                    }
                    return `[${i + 1}]`;
                })
                .join("");
            if (indices) {
                if (segmentText.endsWith("```")) {
                    newText = newText.replace(segmentText, `${segmentText}\n${indices}`);
                } else {
                    newText = newText.replace(segmentText, `${segmentText} ${indices}`);
                }
            }
        }
    });

    return newText;
}

/**
 * Apply OpenAI grounding citations to text content
 */
export function applyOpenaiCitations(
    text: string,
    openaiGroundingData: OpenaiGroundingData[]
): string {
    let newText = text;
    openaiGroundingData.forEach((groundingData, index) => {
        const segmentText = text.substring(groundingData.start_index, groundingData.end_index);
        if (segmentText) {
            if (segmentText.endsWith("```")) {
                newText = newText.replace(
                    segmentText,
                    `${segmentText}\n[[${index + 1}]](${groundingData.url})`
                );
            } else {
                newText = newText.replace(
                    segmentText,
                    `${segmentText} [[${index + 1}]](${groundingData.url})`
                );
            }
        }
    });
    return newText;
}
