import { memo, type CSSProperties } from 'react'
import { ImageIcon } from 'lucide-react'
import type { ImageNode } from '@/types/canvas'
import { computeBaseStyles } from './render-utils'
import type { RevealState } from '@/store/generation-store'

// ============================================================
// Props
// ============================================================

interface ImageRendererProps {
    node: ImageNode
    isTopLevel?: boolean
    parentDirection?: 'row' | 'column'
    parentLayoutMode?: 'flex' | 'grid' | 'none'
    /** Explicit z-index override (reverse canvas stacking) */
    zIndex?: number
    /** AI generation reveal state — applied as data-gen-state attribute */
    revealState?: RevealState
}

// ============================================================
// ImageRenderer — real <img> or styled placeholder
// ============================================================

export const ImageRenderer = memo(function ImageRenderer({
    node,
    isTopLevel = false,
    parentDirection,
    parentLayoutMode,
    zIndex,
    revealState,
}: ImageRendererProps) {
    const baseStyle = computeBaseStyles(node, isTopLevel, parentDirection, parentLayoutMode, zIndex)

    // ── Placeholder ───────────────────────────────────────────
    if (node.isPlaceholder || !node.src) {
        const placeholderStyle: CSSProperties = {
            ...baseStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: baseStyle.backgroundColor || '#f1f5f9',
            overflow: 'hidden',
        }

        return (
            <div data-node-id={node.id} data-gen-state={revealState} style={placeholderStyle}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        opacity: 0.5,
                    }}
                >
                    <ImageIcon
                        size={32}
                        strokeWidth={1.5}
                        style={{ color: '#94a3b8' }}
                    />
                    {node.placeholderLabel && (
                        <span
                            style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: '#94a3b8',
                                fontFamily: 'Inter, system-ui, sans-serif',
                            }}
                        >
                            {node.placeholderLabel}
                        </span>
                    )}
                </div>
            </div>
        )
    }

    // ── Real image ────────────────────────────────────────────
    const imgStyle: CSSProperties = {
        ...baseStyle,
        objectFit: node.fit,
        display: 'block',
    }

    return (
        <img
            data-node-id={node.id}
            data-gen-state={revealState}
            src={node.src}
            alt={node.alt}
            style={imgStyle}
        />
    )
})
