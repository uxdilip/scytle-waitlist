'use client'

import { memo } from 'react'
import { useEditorStore } from '@/store/editor-store'

/**
 * PenOverlay — renders the in-progress pen drawing on top of the canvas.
 *
 * Renders in screen space (sibling of the transform container):
 *  - Committed segments (straight lines or cubic bezier curves)
 *  - Rubber-band line from last vertex to cursor
 *  - Bezier handle arms + nubs when a vertex has tangent handles
 *  - Anchor point circles at each placed vertex
 *  - Close-path indicator circle when hovering near start vertex
 */
export const PenOverlay = memo(function PenOverlay() {
    const ps = useEditorStore((s) => s.penDrawingState)
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)

    if (!ps || ps.vertices.length === 0) return null

    /** Convert canvas coord to viewport screen coord */
    const toScreen = (cx: number, cy: number) => ({
        x: cx * zoom + panX,
        y: cy * zoom + panY,
    })

    const verts = ps.vertices.map((v) => toScreen(v.x, v.y))
    const cursor = toScreen(ps.cursorX, ps.cursorY)
    const lastVert = verts[verts.length - 1]

    const ANCHOR_R = 4
    const HANDLE_R = 3
    const CLOSE_R = 7

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 30 }}
        >
            {/* Alignment guides — orange lines from the aligned anchor vertex to the cursor position */}
            {ps._alignGuides && ps._alignGuides.map((guide, i) => {
                // axis:'x' → cursor X snapped to vertex X → vertical line from vertex to cursor
                // axis:'y' → cursor Y snapped to vertex Y → horizontal line from vertex to cursor
                const vs = toScreen(guide.vertexX, guide.vertexY)
                // The guide line endpoint: for 'x' snap, line stays at snapped X; for 'y' snap, stays at snapped Y
                const ex = guide.axis === 'x' ? vs.x : cursor.x
                const ey = guide.axis === 'x' ? cursor.y : vs.y
                return (
                    <line
                        key={`guide-${i}`}
                        x1={vs.x} y1={vs.y} x2={ex} y2={ey}
                        stroke="#ff6b00"
                        strokeWidth={1}
                        opacity={0.9}
                    />
                )
            })}
            {/* Committed segments — straight lines or cubic bezier */}
            {ps.segments.map((seg, i) => {
                const a = verts[seg.start]
                const b = verts[seg.end]
                if (!a || !b) return null

                const ts = seg.tangentStart
                const te = seg.tangentEnd
                const hasCurve = (ts && (ts.x !== 0 || ts.y !== 0)) || (te && (te.x !== 0 || te.y !== 0))

                if (hasCurve) {
                    // Cubic bezier — control points are offsets from their vertex
                    const cp1x = a.x + (ts ? ts.x * zoom : 0)
                    const cp1y = a.y + (ts ? ts.y * zoom : 0)
                    const cp2x = b.x + (te ? te.x * zoom : 0)
                    const cp2y = b.y + (te ? te.y * zoom : 0)
                    return (
                        <path
                            key={`seg-${i}`}
                            d={`M ${a.x} ${a.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${b.x} ${b.y}`}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                        />
                    )
                }

                return (
                    <line
                        key={`seg-${i}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                    />
                )
            })}

            {/* Rubber-band from last vertex to cursor */}
            {verts.length > 0 && (
                ps._outgoingTangent &&
                (ps._outgoingTangent.x !== 0 || ps._outgoingTangent.y !== 0) ? (
                    <path
                        d={`M ${lastVert.x} ${lastVert.y} C ${lastVert.x + ps._outgoingTangent.x * zoom} ${lastVert.y + ps._outgoingTangent.y * zoom} ${cursor.x} ${cursor.y} ${cursor.x} ${cursor.y}`}
                        stroke="#3b82f6"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        opacity={0.7}
                        fill="none"
                    />
                ) : (
                    <line
                        x1={lastVert.x}
                        y1={lastVert.y}
                        x2={cursor.x}
                        y2={cursor.y}
                        stroke="#3b82f6"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        opacity={0.7}
                    />
                )
            )}

            {/* Close preview — dashed path from last vertex to first vertex when near start */}
            {ps.nearStartPoint && verts.length >= 3 && (() => {
                const first = verts[0]
                const last = verts[verts.length - 1]
                const outT = ps._outgoingTangent
                const inT = (ps as any)._firstVertexIncomingTangent as { x: number; y: number } | undefined
                const hasOut = outT && (outT.x !== 0 || outT.y !== 0)
                const hasIn = inT && (inT.x !== 0 || inT.y !== 0)
                if (hasOut || hasIn) {
                    const cp1x = last.x + (hasOut ? outT!.x * zoom : 0)
                    const cp1y = last.y + (hasOut ? outT!.y * zoom : 0)
                    const cp2x = first.x + (hasIn ? inT!.x * zoom : 0)
                    const cp2y = first.y + (hasIn ? inT!.y * zoom : 0)
                    return (
                        <path
                            d={`M ${last.x} ${last.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${first.x} ${first.y}`}
                            stroke="#3b82f6"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                            opacity={0.5}
                            fill="none"
                        />
                    )
                }
                return (
                    <line
                        x1={last.x}
                        y1={last.y}
                        x2={first.x}
                        y2={first.y}
                        stroke="#3b82f6"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        opacity={0.5}
                    />
                )
            })()}

            {/* Bezier handle arms + nubs for vertices with tangents */}
            {ps.segments.map((seg, i) => {
                const elements: React.ReactNode[] = []
                const a = verts[seg.start]
                const b = verts[seg.end]
                if (!a || !b) return null

                if (seg.tangentStart && (seg.tangentStart.x !== 0 || seg.tangentStart.y !== 0)) {
                    const hx = a.x + seg.tangentStart.x * zoom
                    const hy = a.y + seg.tangentStart.y * zoom
                    elements.push(
                        <line key={`h-ts-${i}`} x1={a.x} y1={a.y} x2={hx} y2={hy} stroke="#3b82f6" strokeWidth={1} opacity={0.6} />,
                        <circle key={`h-tsn-${i}`} cx={hx} cy={hy} r={HANDLE_R} fill="#3b82f6" />,
                    )
                }
                if (seg.tangentEnd && (seg.tangentEnd.x !== 0 || seg.tangentEnd.y !== 0)) {
                    const hx = b.x + seg.tangentEnd.x * zoom
                    const hy = b.y + seg.tangentEnd.y * zoom
                    elements.push(
                        <line key={`h-te-${i}`} x1={b.x} y1={b.y} x2={hx} y2={hy} stroke="#3b82f6" strokeWidth={1} opacity={0.6} />,
                        <circle key={`h-ten-${i}`} cx={hx} cy={hy} r={HANDLE_R} fill="#3b82f6" />,
                    )
                }
                return elements.length > 0 ? <g key={`handles-${i}`}>{elements}</g> : null
            })}

            {/* Active drag handle — outgoing tangent from current vertex */}
            {ps._outgoingTangent && verts.length > 0 && (() => {
                const lastV = verts[verts.length - 1]
                const hx = lastV.x + ps._outgoingTangent!.x * zoom
                const hy = lastV.y + ps._outgoingTangent!.y * zoom
                // Mirrored handle
                const mhx = lastV.x - ps._outgoingTangent!.x * zoom
                const mhy = lastV.y - ps._outgoingTangent!.y * zoom
                return (
                    <g>
                        <line x1={mhx} y1={mhy} x2={hx} y2={hy} stroke="#3b82f6" strokeWidth={1} opacity={0.6} />
                        <circle cx={hx} cy={hy} r={HANDLE_R} fill="#3b82f6" />
                        <circle cx={mhx} cy={mhy} r={HANDLE_R} fill="#3b82f6" />
                    </g>
                )
            })()}

            {/* Anchor points */}
            {verts.map((v, i) => (
                <circle
                    key={`anchor-${i}`}
                    cx={v.x}
                    cy={v.y}
                    r={ANCHOR_R}
                    fill="white"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                />
            ))}

            {/* Close-path indicator — larger ring around start vertex */}
            {ps.nearStartPoint && verts.length >= 3 && (
                <circle
                    cx={verts[0].x}
                    cy={verts[0].y}
                    r={CLOSE_R}
                    fill="rgba(59, 130, 246, 0.1)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    opacity={1}
                />
            )}
        </svg>
    )
})
