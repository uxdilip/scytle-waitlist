import { memo } from 'react'
import type { ScytleNode } from '@/types/canvas'
import { FrameRenderer } from './frame-renderer'
import { TextRenderer } from './text-renderer'
import { ImageRenderer } from './image-renderer'
import { VectorRenderer } from './vector-renderer'
import { useGenerationStore, type RevealState } from '@/store/generation-store'

// ============================================================
// Props
// ============================================================

export interface NodeRendererProps {
    node: ScytleNode
    /** True for root-level canvas nodes (positioned absolutely at x,y) */
    isTopLevel?: boolean
    /** Parent flex direction — needed for fill sizing computation */
    parentDirection?: 'row' | 'column'
    /** Parent layout mode — children of 'none' frames are absolutely positioned */
    parentLayoutMode?: 'flex' | 'grid' | 'none'
    /** Explicit z-index override (used for reverse canvas stacking) */
    zIndex?: number
}

// ============================================================
// NodeRenderer — dispatches to type-specific renderer
// ============================================================
//
// v3: NO wrapper div. Reveal state is passed as a `revealState`
// prop to each renderer, which applies it as a `data-gen-state`
// attribute on its root element. CSS attribute selectors handle
// the animation. This prevents layout breakage from extra divs.

export const NodeRenderer = memo(function NodeRenderer({
    node,
    isTopLevel = false,
    parentDirection,
    parentLayoutMode,
    zIndex,
}: NodeRendererProps) {
    if (!node.visible) return null

    // ── AI Generation reveal state ────────────────────────────
    const nodeRevealStates = useGenerationStore((s) => s.nodeRevealStates)
    const revealState: RevealState | undefined = nodeRevealStates.get(node.id)

    switch (node.type) {
        case 'frame':
            return (
                <FrameRenderer
                    node={node}
                    isTopLevel={isTopLevel}
                    parentDirection={parentDirection}
                    parentLayoutMode={parentLayoutMode}
                    zIndex={zIndex}
                    revealState={revealState}
                />
            )
        case 'text':
            return (
                <TextRenderer
                    node={node}
                    isTopLevel={isTopLevel}
                    parentDirection={parentDirection}
                    parentLayoutMode={parentLayoutMode}
                    zIndex={zIndex}
                    revealState={revealState}
                />
            )
        case 'image':
            return (
                <ImageRenderer
                    node={node}
                    isTopLevel={isTopLevel}
                    parentDirection={parentDirection}
                    parentLayoutMode={parentLayoutMode}
                    zIndex={zIndex}
                    revealState={revealState}
                />
            )
        case 'vector':
            return (
                <VectorRenderer
                    node={node}
                    isTopLevel={isTopLevel}
                    parentDirection={parentDirection}
                    parentLayoutMode={parentLayoutMode}
                    zIndex={zIndex}
                    revealState={revealState}
                />
            )
        default:
            return null
    }
})
