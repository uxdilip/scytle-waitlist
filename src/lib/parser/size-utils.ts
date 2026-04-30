// ============================================================
// Size Estimation Utilities
// Rough dimension estimates for canvas layout positioning.
// ============================================================

import type { ScytleNode, FrameNode, TextNode } from '@/types/canvas'

/** Canvas page width (desktop-first) */
export const PAGE_WIDTH = 1440

/** Average character width relative to font size (proportional fonts) */
const CHAR_WIDTH_RATIO = 0.55

/**
 * Estimate the rendered height of a text block.
 * Uses character count and container width to compute approximate line count.
 */
export function estimateTextHeight(
    text: string,
    fontSize: number,
    containerWidth: number,
    lineHeightMultiplier: number = 1.5,
): number {
    if (!text || containerWidth <= 0) return fontSize * lineHeightMultiplier

    const charWidth = fontSize * CHAR_WIDTH_RATIO
    const charsPerLine = Math.max(1, Math.floor(containerWidth / charWidth))
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine))
    return Math.ceil(lineCount * fontSize * lineHeightMultiplier)
}

/**
 * Estimate height of a container based on its children and layout.
 */
export function estimateContainerHeight(
    children: ScytleNode[],
    padding: { top: number; bottom: number },
    gap: number = 0,
    direction: 'row' | 'column' = 'column',
): number {
    const getChildHeight = (child: ScytleNode): number => {
        if (child.type === 'text') {
            const tn = child as TextNode
            const lh = typeof tn.lineHeight === 'number' ? (tn.lineHeight > 10 ? tn.lineHeight / (tn.fontSize || 16) : tn.lineHeight) : 1.5
            return estimateTextHeight(tn.characters, tn.fontSize, tn.width || containerFallbackWidth, lh)
        }
        if (child.type === 'frame') {
            const fn = child as FrameNode
            if (fn.sizing?.vertical === 'fixed' && fn.height) return fn.height
            return estimateContainerHeight(
                fn.children,
                { top: fn.padding?.top || 0, bottom: fn.padding?.bottom || 0 },
                fn.layout?.gap || 0,
                fn.layout?.direction || 'column',
            )
        }
        return child.height || 40
    }

    const containerFallbackWidth = 320

    if (children.length === 0) return padding.top + padding.bottom + 40 // min height

    if (direction === 'column') {
        // Vertical stack: sum heights + gaps
        const totalChildHeight = children.reduce((sum, child) => sum + getChildHeight(child), 0)
        const totalGaps = Math.max(0, children.length - 1) * gap
        return padding.top + padding.bottom + totalChildHeight + totalGaps
    } else {
        // Horizontal row: max height of children
        const maxChildHeight = Math.max(...children.map(getChildHeight))
        return padding.top + padding.bottom + maxChildHeight
    }
}

/**
 * Estimate width of a container based on its children and layout.
 * Used when no explicit width is set (hug behavior).
 */
export function estimateContainerWidth(
    children: ScytleNode[],
    padding: { left: number; right: number },
    gap: number = 0,
    direction: 'row' | 'column' = 'column',
): number {
    if (children.length === 0) return padding.left + padding.right + 100 // min width

    if (direction === 'row') {
        // Horizontal row: sum widths + gaps
        const totalChildWidth = children.reduce((sum, child) => sum + (child.width || 100), 0)
        const totalGaps = Math.max(0, children.length - 1) * gap
        return padding.left + padding.right + totalChildWidth + totalGaps
    } else {
        // Vertical stack: max width of children
        const maxChildWidth = Math.max(...children.map(c => c.width || 100))
        return padding.left + padding.right + maxChildWidth
    }
}

/**
 * Estimate the height of a ScytleNode.
 * Used when a node doesn't have an explicit height.
 */
export function estimateNodeHeight(node: ScytleNode, containerWidth: number = PAGE_WIDTH): number {
    switch (node.type) {
        case 'text': {
            const tn = node as TextNode
            const lh = typeof tn.lineHeight === 'number' ? tn.lineHeight : 1.5
            return estimateTextHeight(tn.characters, tn.fontSize, containerWidth, lh)
        }
        case 'frame': {
            const fn = node as FrameNode
            const childWidth = containerWidth - (fn.padding?.left || 0) - (fn.padding?.right || 0)
            return estimateContainerHeight(
                fn.children,
                fn.padding || { top: 0, bottom: 0 },
                fn.layout?.gap || 0,
                fn.layout?.direction || 'column',
            )
        }
        case 'image':
            return node.height || 300 // default image height
        default:
            return 40
    }
}
