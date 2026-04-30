import { memo, type CSSProperties } from 'react'
import type { FrameNode } from '@/types/canvas'
import { computeBaseStyles, computeFrameLayoutStyles } from './render-utils'
import { NodeRenderer } from './node-renderer'
import { useGenerationStore, type RevealState } from '@/store/generation-store'

// ============================================================
// Props
// ============================================================

interface FrameRendererProps {
    node: FrameNode
    isTopLevel?: boolean
    parentDirection?: 'row' | 'column'
    parentLayoutMode?: 'flex' | 'grid' | 'none'
    /** Explicit z-index override (reverse canvas stacking) */
    zIndex?: number
    /** AI generation reveal state — applied as data-gen-state attribute */
    revealState?: RevealState
}

function applySyntheticNegativeGap(node: FrameNode): FrameNode['children'] {
    const gap = node.layout.gap ?? 0
    if (node.layout.mode !== 'flex' || node.layout.wrap || gap >= 0) {
        return node.children
    }

    const direction = node.layout.direction ?? 'column'

    return node.children.map((child, index) => {
        if (index === 0 || child.positioning === 'absolute') return child

        // Keep auto margins authoritative on the adjusted axis.
        if (direction === 'row' && child.autoMargin?.left) return child
        if (direction === 'column' && child.autoMargin?.top) return child

        const margin = child.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }

        if (direction === 'row') {
            return {
                ...child,
                margin: { ...margin, left: margin.left + gap },
            }
        }

        return {
            ...child,
            margin: { ...margin, top: margin.top + gap },
        }
    }) as FrameNode['children']
}

// ============================================================
// FrameRenderer — container div with flex/grid/freeform layout
// ============================================================

export const FrameRenderer = memo(function FrameRenderer({
    node,
    isTopLevel = false,
    parentDirection,
    parentLayoutMode,
    zIndex,
    revealState,
}: FrameRendererProps) {
    // Merge base styles (position, sizing, visuals) with frame layout styles
    const style: CSSProperties = {
        ...computeBaseStyles(node, isTopLevel, parentDirection, parentLayoutMode, zIndex),
        ...computeFrameLayoutStyles(node),
    }

    // Freeform (mode: 'none') frames need a positioning context for absolute children
    // but only if they aren't already absolutely positioned themselves.
    // Flex/grid frames also need position:relative if they contain absolute children,
    // otherwise those children position relative to a distant ancestor instead of their parent.
    if (style.position !== 'absolute') {
        const hasAbsoluteChild = node.children.some(c => c.positioning === 'absolute')
        if (node.layout.mode === 'none' || hasAbsoluteChild) {
            style.position = 'relative'
        }
    }

    // Determine child flex direction for passing to children
    const childDirection =
        node.layout.mode === 'flex'
            ? (node.layout.direction ?? 'column')
            : undefined

    const renderedChildren = applySyntheticNegativeGap(node)

    // ── Active generating frame glow ──────────────────────────
    const activeGeneratingFrameId = useGenerationStore((s) => s.activeGeneratingFrameId)
    const isActiveGenFrame = isTopLevel && activeGeneratingFrameId === node.id

    // Build className — gen-frame-active for glow effect
    const className = isActiveGenFrame ? 'gen-frame-active' : undefined

    return (
        <div
            data-node-id={node.id}
            data-gen-state={revealState}
            style={style}
            className={className}
        >
            {renderedChildren.map((child, index) => (
                <NodeRenderer
                    key={child.id}
                    node={child}
                    parentDirection={childDirection}
                    parentLayoutMode={node.layout.mode}
                    zIndex={node.layout.reverseZIndex ? renderedChildren.length - index : undefined}
                />
            ))}
        </div>
    )
})
