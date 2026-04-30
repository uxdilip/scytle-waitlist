import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { extractLastUserText, getToolRoutingMode } from '@/lib/ai/intent'

function msg(input: {
    role: 'user' | 'assistant'
    parts?: Array<{ type: string; text?: string }>
    content?: Array<{ type: string; text?: string }>
    text?: string
}): UIMessage {
    return input as unknown as UIMessage
}

describe('extractLastUserText', () => {
    it('reads from parts and returns the newest user text', () => {
        const messages: UIMessage[] = [
            msg({ role: 'user', parts: [{ type: 'text', text: 'first prompt' }] }),
            msg({ role: 'assistant', parts: [{ type: 'text', text: 'response' }] }),
            msg({ role: 'user', parts: [{ type: 'text', text: 'redesign this hero' }] }),
        ]

        expect(extractLastUserText(messages)).toBe('redesign this hero')
    })

    it('falls back to content arrays used by some adapters', () => {
        const messages: UIMessage[] = [
            msg({
                role: 'user',
                content: [
                    { type: 'text', text: 'please' },
                    { type: 'text', text: 'make this more bold' },
                ],
            }),
        ]

        expect(extractLastUserText(messages)).toBe('please make this more bold')
    })
})

describe('getToolRoutingMode', () => {
    it('uses auto mode when there is no selection', () => {
        expect(
            getToolRoutingMode({
                context: { selectedNodeId: null },
                lastUserText: 'redesign the hero',
            })
        ).toBe('auto')
    })

    it('defaults to edit mode when selection exists and intent is modify/unclear', () => {
        expect(
            getToolRoutingMode({
                context: { selectedNodeId: 'node-1' },
                lastUserText: 'redesign this section with a cleaner layout',
            })
        ).toBe('force-edit')
    })

    it('keeps edit mode for additive-in-place requests', () => {
        expect(
            getToolRoutingMode({
                context: { selectedNodeId: 'node-1' },
                lastUserText: 'add a button to this section',
            })
        ).toBe('force-edit')
    })

    it('switches to add mode for explicit add-new section requests', () => {
        expect(
            getToolRoutingMode({
                context: { selectedNodeId: 'node-1' },
                lastUserText: 'add a new section below this one',
            })
        ).toBe('force-add')
    })

    it('switches to add mode for new page requests', () => {
        expect(
            getToolRoutingMode({
                context: { selectedNodeId: 'node-1' },
                lastUserText: 'create another page for pricing',
            })
        ).toBe('force-add')
    })
})
