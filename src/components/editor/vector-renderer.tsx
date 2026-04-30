import { memo, type CSSProperties } from 'react'
import type { VectorNode } from '@/types/canvas'
import { networkToSVGPath } from '@/lib/vector-utils'
import { hexOpacityToRgba, normaliseHex, hexToHashHex } from '@/lib/color-utils'
import { computeBaseStyles } from './render-utils'
import { resolveVectorStroke } from '@/lib/vector-stroke'
import type { RevealState } from '@/store/generation-store'

// ============================================================
// Props
// ============================================================

interface VectorRendererProps {
    node: VectorNode
    isTopLevel?: boolean
    parentDirection?: 'row' | 'column'
    parentLayoutMode?: 'flex' | 'grid' | 'none'
    /** Explicit z-index override (reverse canvas stacking) */
    zIndex?: number
    /** AI generation reveal state — applied as data-gen-state attribute */
    revealState?: RevealState
}

// ============================================================
// VectorRenderer — renders a VectorNode as an inline SVG
// ============================================================

/**
 * Renders a VectorNode as a positioned div wrapper containing an inline SVG.
 *
 * Layout:  The wrapper div uses computeBaseStyles (same as all other renderers)
 *          for position/sizing so it participates correctly in flex/grid layout.
 *          Fills are applied ONLY to the SVG path element, not the wrapper.
 *
 * Fill:    Solid fills from node.fills[0] are mapped to the SVG fill attribute.
 *          Gradient / multi-fill support is a future phase.
 *
 * Stroke:  canonical stroke data (`strokes[]`/`border`) is preferred, with
 *          legacy vector stroke field fallback for backward compatibility.
 */
export const VectorRenderer = memo(function VectorRenderer({
    node,
    isTopLevel = false,
    parentDirection,
    parentLayoutMode,
    zIndex,
    revealState,
}: VectorRendererProps) {
    // ── Wrapper styles — use computeBaseStyles for correct layout participation ──
    // computeBaseStyles handles: position, sizing (fixed/fill/hug), opacity,
    // rotation, flip, margins, min/max constraints — same as FrameRenderer/TextRenderer.
    // We strip background/border/shadow since VectorNode visuals are on the SVG path.
    const baseStyle = computeBaseStyles(node, isTopLevel, parentDirection, parentLayoutMode, zIndex)

    const wrapStyle: CSSProperties = {
        ...baseStyle,
        // Vector-specific: allow SVG content to extend beyond wrapper (stroke overshoot)
        overflow: 'visible',
        // Ensure wrapper is a positioning context for the inner SVG
        position: baseStyle.position || 'relative',
        // Strip all visual properties — those are on the SVG path, not the wrapper
        background: undefined,
        backgroundColor: undefined,
        backgroundImage: undefined,
        backgroundSize: undefined,
        backgroundPosition: undefined,
        backgroundRepeat: undefined,
        border: undefined,
        boxShadow: undefined,
        outlineWidth: undefined,
        outlineStyle: undefined,
        outlineColor: undefined,
        outlineOffset: undefined,
        filter: undefined,
        mixBlendMode: undefined,
    }

    // ── Path data ─────────────────────────────────────────────
    const net = node.vectorNetwork
    const hasGeometry = net.vertices.length > 0 && net.segments.length > 0
    const pathD = hasGeometry ? networkToSVGPath(net) : ''

    // ── Fill (SVG path only, NOT wrapper div) ─────────────────
    let svgFill = 'none'
    const visibleFills = node.fills.filter((f) => f.visible !== false)
    const firstFill = visibleFills[0]
    if (firstFill && firstFill.type === 'solid') {
        svgFill = hexOpacityToRgba(
            normaliseHex(firstFill.color),
            firstFill.opacity ?? 1,
        )
    }

    // ── Stroke ────────────────────────────────────────────────
    const stroke = resolveVectorStroke(node)
    const svgStroke = stroke.visible ? hexToHashHex(stroke.color) : 'none'

    // StrokeCap: Figma NONE/LINE_ARROW/TRIANGLE_ARROW/etc. fall back to 'butt'
    const strokeLinecap: 'round' | 'square' | 'butt' =
        stroke.cap === 'ROUND' ? 'round' :
            stroke.cap === 'SQUARE' ? 'square' :
                'butt'

    // StrokeJoin: Figma ROUND/BEVEL/MITER map directly
    const strokeLinejoin: 'round' | 'bevel' | 'miter' =
        stroke.join === 'ROUND' ? 'round' :
            stroke.join === 'BEVEL' ? 'bevel' :
                'miter'

    // ── SVG viewBox ───────────────────────────────────────────
    // Guard against zero dimensions mid-draw (width/height set to 0 initially)
    const vbW = Math.max(node.width, 1)
    const vbH = Math.max(node.height, 1)

    return (
        <div
            data-node-id={node.id}
            data-gen-state={revealState}
            style={wrapStyle}
        >
            <svg
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                    pointerEvents: 'none', // let the wrapper div handle clicks
                }}
                viewBox={`0 0 ${vbW} ${vbH}`}
                xmlns="http://www.w3.org/2000/svg"
            >
                {pathD && (
                    <path
                        d={pathD}
                        fill={svgFill}
                        fillRule="nonzero"
                        stroke={svgStroke}
                        strokeOpacity={stroke.opacity}
                        strokeWidth={stroke.width}
                        strokeLinecap={strokeLinecap}
                        strokeLinejoin={strokeLinejoin}
                    />
                )}
            </svg>
        </div>
    )
})
