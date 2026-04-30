// ============================================================
// HTML Parser — Barrel Export
// ============================================================

import type { FrameNode } from '@/types/canvas'

// DOMParser-based parser (primary and only parser)
export { parseHtmlViaDOMParser } from './domparser'

// Shared utilities
export { resolveColor, buildReverseColorMap, TAILWIND_COLORS } from './color-map'
export { PAGE_WIDTH, estimateTextHeight, estimateContainerHeight, estimateNodeHeight } from './size-utils'

// ════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════

export interface ParseHtmlOptions {
    rootWidth?: number
    fonts?: string[]
}

// ════════════════════════════════════════════════════
// Main Parse Function (DOMParser only)
// ════════════════════════════════════════════════════

/**
 * Parse HTML into a ScytleNode tree.
 *
 * Pipeline:
 *   1. Convert Tailwind classes → inline styles (server API)
 *   2. Parse with DOMParser (reads element.style, preserves CSS intent)
 *
 * ~100-200ms total.
 */
export async function parseHtml(
    html: string,
    pageName: string = 'Page',
    options?: ParseHtmlOptions,
): Promise<FrameNode> {
    const inlinedHtml = await convertTailwindClasses(html)
    const { parseHtmlViaDOMParser } = await import('./domparser')
    return parseHtmlViaDOMParser(inlinedHtml, pageName, options)
}

/**
 * Convert Tailwind classes to inline styles via server API.
 */
async function convertTailwindClasses(html: string): Promise<string> {
    const res = await fetch('/api/tailwind-to-inline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
    })
    if (!res.ok) {
        throw new Error(`Tailwind conversion failed: ${res.status}`)
    }
    const { html: inlinedHtml } = await res.json()
    return inlinedHtml
}

// Legacy alias
export const parseHtmlAuto = parseHtml
