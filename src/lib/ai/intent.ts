import type { UIMessage } from 'ai'
import type { SystemPromptContext } from '@/lib/ai/prompts/system'

export type ToolRoutingMode = 'force-edit' | 'force-add' | 'auto'

const ADD_SECTION_PATTERN =
    /\b(add|create|insert|append|generate)\b[\s\w-]{0,24}\b((a|an|new|another|extra)\s+(section|block|hero|navbar|footer|cta|feature|features|testimonial|testimonials|pricing|faq|gallery|team|blog|contact|page)|(hero|navbar|footer|cta|feature|features|testimonial|testimonials|pricing|faq|gallery|team|blog|contact|page))\b/i
const NEW_PAGE_PATTERN =
    /\b(add|create|start|make)\b[\s\w-]{0,18}\b(new|another)\s+page\b/i

type MessageLike = {
    role?: unknown
    parts?: unknown
    content?: unknown
    text?: unknown
}

type TextPart = {
    type?: unknown
    text?: unknown
}

function extractTextFromParts(parts: unknown): string[] {
    if (!Array.isArray(parts)) return []

    const textParts: string[] = []
    for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        const typedPart = part as TextPart
        if (typedPart.type !== 'text') continue
        if (typeof typedPart.text !== 'string') continue

        const trimmed = typedPart.text.trim()
        if (trimmed.length > 0) textParts.push(trimmed)
    }

    return textParts
}

function readMessageText(message: UIMessage): string {
    const typed = message as unknown as MessageLike

    const fromParts = extractTextFromParts(typed.parts)
    if (fromParts.length > 0) return fromParts.join(' ')

    const fromContent = extractTextFromParts(typed.content)
    if (fromContent.length > 0) return fromContent.join(' ')

    if (typeof typed.text === 'string') {
        const trimmed = typed.text.trim()
        if (trimmed.length > 0) return trimmed
    }

    return ''
}

export function extractLastUserText(messages: readonly UIMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i]
        const typed = message as unknown as MessageLike
        if (typed.role !== 'user') continue

        const text = readMessageText(message)
        if (text.length > 0) return text
    }

    return ''
}

type ToolRoutingInput = {
    context: SystemPromptContext
    lastUserText: string
}

export function getToolRoutingMode({ context, lastUserText }: ToolRoutingInput): ToolRoutingMode {
    if (!context.selectedNodeId) return 'auto'

    const text = lastUserText.trim()
    if (!text) return 'force-edit'

    if (NEW_PAGE_PATTERN.test(text)) return 'force-add'
    if (ADD_SECTION_PATTERN.test(text)) return 'force-add'

    // Selection defaults to in-place edits unless the user explicitly asks to add.
    return 'force-edit'
}
