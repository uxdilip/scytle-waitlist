'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById, findParentOfNode } from '@/types/canvas'
import type { FrameNode } from '@/types/canvas'

// ============================================================
// Types
// ============================================================

interface ScreenRect {
    x: number
    y: number
    width: number
    height: number
}

interface AlignmentLine {
    direction: 'horizontal' | 'vertical'
    /** Position on perpendicular axis (screen coords) */
    position: number
    /** Start on parallel axis */
    start: number
    /** End on parallel axis */
    end: number
}

interface MeasurementLine {
    x1: number
    y1: number
    x2: number
    y2: number
    distance: number
    direction: 'horizontal' | 'vertical'
    isDashed?: boolean
}

// ============================================================
// Helpers
// ============================================================

function getNodeScreenRect(
    nodeId: string,
    viewportEl: HTMLElement
): ScreenRect | null {
    const el = viewportEl.querySelector(`[data-node-id="${nodeId}"]`)
    if (!el) return null

    const nodeRect = el.getBoundingClientRect()
    const viewportRect = viewportEl.getBoundingClientRect()

    return {
        x: nodeRect.left - viewportRect.left,
        y: nodeRect.top - viewportRect.top,
        width: nodeRect.width,
        height: nodeRect.height,
    }
}

// Alignment threshold in screen pixels
const ALIGN_THRESHOLD = 4

/**
 * Calculate alignment guide lines between the dragged node and its siblings/parent.
 * Checks center and edge alignment. Returns snap targets for position snapping.
 */
function calculateAlignmentLines(
    nodeRect: ScreenRect,
    siblingRects: ScreenRect[],
    parentRect: ScreenRect | null,
): { lines: AlignmentLine[]; snapX: number | null; snapY: number | null } {
    const lines: AlignmentLine[] = []
    const seen = new Set<string>()

    let snapX: number | null = null
    let snapY: number | null = null

    const nodeCenterX = nodeRect.x + nodeRect.width / 2
    const nodeCenterY = nodeRect.y + nodeRect.height / 2
    const nodeLeft = nodeRect.x
    const nodeRight = nodeRect.x + nodeRect.width
    const nodeTop = nodeRect.y
    const nodeBottom = nodeRect.y + nodeRect.height

    const addLine = (dir: 'horizontal' | 'vertical', pos: number, s: number, e: number) => {
        const key = `${dir}-${Math.round(pos)}`
        if (seen.has(key)) {
            const existing = lines.find(l => l.direction === dir && Math.abs(l.position - pos) < 1)
            if (existing) {
                existing.start = Math.min(existing.start, s)
                existing.end = Math.max(existing.end, e)
            }
            return
        }
        seen.add(key)
        lines.push({ direction: dir, position: pos, start: s, end: e })
    }

    // Check alignment with parent center
    if (parentRect) {
        const parentCenterX = parentRect.x + parentRect.width / 2
        const parentCenterY = parentRect.y + parentRect.height / 2

        if (Math.abs(nodeCenterX - parentCenterX) < ALIGN_THRESHOLD) {
            addLine('vertical', parentCenterX, parentRect.y, parentRect.y + parentRect.height)
            snapX = parentCenterX - nodeRect.width / 2 // snap node center to parent center
        }
        if (Math.abs(nodeCenterY - parentCenterY) < ALIGN_THRESHOLD) {
            addLine('horizontal', parentCenterY, parentRect.x, parentRect.x + parentRect.width)
            snapY = parentCenterY - nodeRect.height / 2
        }
    }

    for (const sib of siblingRects) {
        const sibCenterX = sib.x + sib.width / 2
        const sibCenterY = sib.y + sib.height / 2
        const sibLeft = sib.x
        const sibRight = sib.x + sib.width
        const sibTop = sib.y
        const sibBottom = sib.y + sib.height

        const vStart = Math.min(nodeTop, sibTop) - 10
        const vEnd = Math.max(nodeBottom, sibBottom) + 10
        const hStart = Math.min(nodeLeft, sibLeft) - 10
        const hEnd = Math.max(nodeRight, sibRight) + 10

        // Center alignment
        if (Math.abs(nodeCenterX - sibCenterX) < ALIGN_THRESHOLD) {
            addLine('vertical', sibCenterX, vStart, vEnd)
            if (snapX === null) snapX = sibCenterX - nodeRect.width / 2
        }
        if (Math.abs(nodeCenterY - sibCenterY) < ALIGN_THRESHOLD) {
            addLine('horizontal', sibCenterY, hStart, hEnd)
            if (snapY === null) snapY = sibCenterY - nodeRect.height / 2
        }

        // Edge alignments - vertical guides
        if (Math.abs(nodeLeft - sibLeft) < ALIGN_THRESHOLD) {
            addLine('vertical', sibLeft, vStart, vEnd)
            if (snapX === null) snapX = sibLeft
        }
        if (Math.abs(nodeRight - sibRight) < ALIGN_THRESHOLD) {
            addLine('vertical', sibRight, vStart, vEnd)
            if (snapX === null) snapX = sibRight - nodeRect.width
        }
        if (Math.abs(nodeLeft - sibRight) < ALIGN_THRESHOLD) {
            addLine('vertical', sibRight, vStart, vEnd)
            if (snapX === null) snapX = sibRight
        }
        if (Math.abs(nodeRight - sibLeft) < ALIGN_THRESHOLD) {
            addLine('vertical', sibLeft, vStart, vEnd)
            if (snapX === null) snapX = sibLeft - nodeRect.width
        }

        // Edge alignments - horizontal guides
        if (Math.abs(nodeTop - sibTop) < ALIGN_THRESHOLD) {
            addLine('horizontal', sibTop, hStart, hEnd)
            if (snapY === null) snapY = sibTop
        }
        if (Math.abs(nodeBottom - sibBottom) < ALIGN_THRESHOLD) {
            addLine('horizontal', sibBottom, hStart, hEnd)
            if (snapY === null) snapY = sibBottom - nodeRect.height
        }
        if (Math.abs(nodeTop - sibBottom) < ALIGN_THRESHOLD) {
            addLine('horizontal', sibBottom, hStart, hEnd)
            if (snapY === null) snapY = sibBottom
        }
        if (Math.abs(nodeBottom - sibTop) < ALIGN_THRESHOLD) {
            addLine('horizontal', sibTop, hStart, hEnd)
            if (snapY === null) snapY = sibTop - nodeRect.height
        }
    }

    return { lines, snapX, snapY }
}

/**
 * Calculate measurement lines from a node to its parent frame edges.
 */
function calculateParentMeasurements(
    nodeRect: ScreenRect,
    parentRect: ScreenRect,
    zoom: number
): MeasurementLine[] {
    const lines: MeasurementLine[] = []
    const MIN_DISTANCE = 1

    const nodeCenter = {
        x: nodeRect.x + nodeRect.width / 2,
        y: nodeRect.y + nodeRect.height / 2,
    }

    const topDist = Math.round((nodeRect.y - parentRect.y) / zoom)
    if (topDist >= MIN_DISTANCE) {
        lines.push({
            x1: nodeCenter.x, y1: parentRect.y,
            x2: nodeCenter.x, y2: nodeRect.y,
            distance: topDist, direction: 'vertical',
        })
    }

    const bottomDist = Math.round(
        (parentRect.y + parentRect.height - (nodeRect.y + nodeRect.height)) / zoom
    )
    if (bottomDist >= MIN_DISTANCE) {
        lines.push({
            x1: nodeCenter.x, y1: nodeRect.y + nodeRect.height,
            x2: nodeCenter.x, y2: parentRect.y + parentRect.height,
            distance: bottomDist, direction: 'vertical',
        })
    }

    const leftDist = Math.round((nodeRect.x - parentRect.x) / zoom)
    if (leftDist >= MIN_DISTANCE) {
        lines.push({
            x1: parentRect.x, y1: nodeCenter.y,
            x2: nodeRect.x, y2: nodeCenter.y,
            distance: leftDist, direction: 'horizontal',
        })
    }

    const rightDist = Math.round(
        (parentRect.x + parentRect.width - (nodeRect.x + nodeRect.width)) / zoom
    )
    if (rightDist >= MIN_DISTANCE) {
        lines.push({
            x1: nodeRect.x + nodeRect.width, y1: nodeCenter.y,
            x2: parentRect.x + parentRect.width, y2: nodeCenter.y,
            distance: rightDist, direction: 'horizontal',
        })
    }

    return lines
}

/**
 * Calculate measurement lines from a node to a SPECIFIC target node.
 * Uses exact center-plane projection geometry.
 */
function calculateTargetMeasurements(
    S: ScreenRect,
    H: ScreenRect,
    zoom: number
): MeasurementLine[] {
    const lines: MeasurementLine[] = []
    const MIN_DISTANCE = 1

    const scx = S.x + S.width / 2
    const scy = S.y + S.height / 2

    // Check if one completely contains the other
    const isInsideH = S.x >= H.x && S.x + S.width <= H.x + H.width && S.y >= H.y && S.y + S.height <= H.y + H.height
    const hInsideS = H.x >= S.x && H.x + H.width <= S.x + S.width && H.y >= S.y && H.y + H.height <= S.y + S.height

    if (isInsideH) return calculateParentMeasurements(S, H, zoom)
    if (hInsideS) return calculateParentMeasurements(H, S, zoom)

    const targetIsLeft = H.x + H.width <= S.x
    const targetIsRight = H.x >= S.x + S.width
    const targetIsAbove = H.y + H.height <= S.y
    const targetIsBelow = H.y >= S.y + S.height

    // Y-axis measurement (vertical solid line + horizontal dashed extension)
    if (targetIsAbove || targetIsBelow) {
        const sy = targetIsAbove ? S.y : S.y + S.height
        const hy = targetIsAbove ? H.y + H.height : H.y
        const logicalDist = Math.round(Math.abs(sy - hy) / zoom)

        if (logicalDist >= MIN_DISTANCE) {
            lines.push({ x1: scx, y1: sy, x2: scx, y2: hy, distance: logicalDist, direction: 'vertical' })

            if (scx < H.x) {
                lines.push({ x1: scx, y1: hy, x2: H.x, y2: hy, distance: 0, direction: 'horizontal', isDashed: true })
            } else if (scx > H.x + H.width) {
                lines.push({ x1: H.x + H.width, y1: hy, x2: scx, y2: hy, distance: 0, direction: 'horizontal', isDashed: true })
            }
        }
    }

    // X-axis measurement (horizontal solid line + vertical dashed extension)
    if (targetIsLeft || targetIsRight) {
        const sx = targetIsLeft ? S.x : S.x + S.width
        const hx = targetIsLeft ? H.x + H.width : H.x
        const logicalDist = Math.round(Math.abs(sx - hx) / zoom)

        if (logicalDist >= MIN_DISTANCE) {
            lines.push({ x1: sx, y1: scy, x2: hx, y2: scy, distance: logicalDist, direction: 'horizontal' })

            if (scy < H.y) {
                lines.push({ x1: hx, y1: scy, x2: hx, y2: H.y, distance: 0, direction: 'vertical', isDashed: true })
            } else if (scy > H.y + H.height) {
                lines.push({ x1: hx, y1: H.y + H.height, x2: hx, y2: scy, distance: 0, direction: 'vertical', isDashed: true })
            }
        }
    }

    return lines
}

// ============================================================
// MeasurementOverlay
// Behavior (matches Figma):
//   - Alt held (no drag): show red measurement lines with numbers
//     to parent edges AND sibling frames
//   - Dragging: show magenta alignment guide lines only (no numbers)
//   - Alt+drag: duplicate + alignment guides only
//   - While auto-layout spacing handles are active (padding/gap),
//     suppress generic Alt measurement redlines.
// ============================================================

export function MeasurementOverlay({
    viewportRef,
    isDragging,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
    isDragging: boolean
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const nodes = useEditorStore((s) => s.nodes)
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)
    const hoveredId = useEditorStore((s) => s.hoveredId)
    const paddingOverlayNodeId = useEditorStore((s) => s.paddingOverlayNodeId)
    const gapOverlayNodeId = useEditorStore((s) => s.gapOverlayNodeId)

    const [alignmentLines, setAlignmentLines] = useState<AlignmentLine[]>([])
    const [measurementLines, setMeasurementLines] = useState<MeasurementLine[]>([])
    const [altHeld, setAltHeld] = useState(false)
    const rafRef = useRef<number>(0)
    const marginDragActive = useEditorStore((s) => s.marginDragActive)
    const spacingHandlesActive = paddingOverlayNodeId !== null || gapOverlayNodeId !== null || marginDragActive

    // Track Alt key state
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setAltHeld(true)
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setAltHeld(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // Gather sibling rects and parent rect for the selected node
    const getContext = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport || selectedIds.length !== 1) return null

        const nodeId = selectedIds[0]
        const nodeRect = getNodeScreenRect(nodeId, viewport)
        if (!nodeRect) return null

        const result = findParentOfNode(nodes, nodeId)
        const siblingRects: ScreenRect[] = []
        let parentRect: ScreenRect | null = null

        if (result?.parent) {
            parentRect = getNodeScreenRect(result.parent.id, viewport)
            const parent = findNodeById(nodes, result.parent.id) as FrameNode | null
            if (parent) {
                for (const child of parent.children) {
                    if (child.id === nodeId) continue
                    const sibRect = getNodeScreenRect(child.id, viewport)
                    if (sibRect) siblingRects.push(sibRect)
                }
            }
        } else {
            // Top-level node — siblings are other top-level nodes
            for (const n of nodes) {
                if (n.id === nodeId) continue
                const sibRect = getNodeScreenRect(n.id, viewport)
                if (sibRect) siblingRects.push(sibRect)
            }
        }

        return { nodeId, nodeRect, siblingRects, parentRect }
    }, [viewportRef, selectedIds, nodes])

    // DRAG MODE: show alignment guides only (no measurements)
    const updateDragOverlay = useCallback(() => {
        const ctx = getContext()
        if (!ctx) {
            setAlignmentLines([])
            setMeasurementLines([])
            return
        }

        const { lines } = calculateAlignmentLines(ctx.nodeRect, ctx.siblingRects, ctx.parentRect)
        setAlignmentLines(lines)
        setMeasurementLines([]) // Never show measurement numbers during drag
    }, [getContext])

    // ALT (no drag) MODE: show measurement lines with numbers
    const updateAltOverlay = useCallback(() => {
        if (spacingHandlesActive) {
            return
        }

        const ctx = getContext()
        if (!ctx) {
            setMeasurementLines([])
            setAlignmentLines([])
            return
        }

        const lines: MeasurementLine[] = []

        if (hoveredId && hoveredId !== ctx.nodeId) {
            const viewport = viewportRef.current
            const targetRect = viewport ? getNodeScreenRect(hoveredId, viewport) : null
            if (targetRect) {
                const targetMeasurements = calculateTargetMeasurements(
                    ctx.nodeRect, targetRect, zoom
                )
                lines.push(...targetMeasurements)
            }
        } else if (ctx.parentRect) {
            const parentMeasurements = calculateParentMeasurements(ctx.nodeRect, ctx.parentRect, zoom)
            lines.push(...parentMeasurements)
        }

        setMeasurementLines(lines)
        setAlignmentLines([]) // No alignment guides in static measurement mode
    }, [getContext, zoom, hoveredId, viewportRef, spacingHandlesActive])

    // RAF loop for drag alignment
    useEffect(() => {
        let running = true
        const loop = () => {
            if (!running) return
            updateDragOverlay()
            rafRef.current = requestAnimationFrame(loop)
        }
        if (isDragging) {
            loop()
        }
        return () => {
            running = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [isDragging, updateDragOverlay])

    // Alt (no drag) measurement mode
    useEffect(() => {
        if (spacingHandlesActive && !isDragging) {
            return
        }

        if (altHeld && !isDragging && selectedIds.length === 1) {
            const rafId = requestAnimationFrame(() => {
                updateAltOverlay()
            })
            return () => cancelAnimationFrame(rafId)
        } else if (!isDragging) {
            const rafId = requestAnimationFrame(() => {
                setMeasurementLines([])
            })
            return () => cancelAnimationFrame(rafId)
        }
    }, [altHeld, isDragging, selectedIds, updateAltOverlay, panX, panY, zoom, hoveredId, spacingHandlesActive])

    const visibleAlignmentLines = isDragging ? alignmentLines : []
    const visibleMeasurementLines = spacingHandlesActive && !isDragging ? [] : measurementLines

    if (visibleAlignmentLines.length === 0 && visibleMeasurementLines.length === 0) return null

    return (
        <>
            {/* Alignment guide lines — magenta (drag only) */}
            {visibleAlignmentLines.map((line, i) => {
                const isV = line.direction === 'vertical'
                const length = line.end - line.start
                if (length < 2) return null

                return (
                    <div
                        key={`align-${i}`}
                        className="pointer-events-none"
                        style={{
                            position: 'absolute',
                            left: isV ? line.position - 0.5 : line.start,
                            top: isV ? line.start : line.position - 0.5,
                            width: isV ? 1 : length,
                            height: isV ? length : 1,
                            backgroundColor: '#c026d3',
                            opacity: 0.8,
                            zIndex: 1002,
                        }}
                    />
                )
            })}

            {/* Measurement lines — red with distance labels (Alt, no drag) */}
            {visibleMeasurementLines.map((m, i) => {
                const isH = m.direction === 'horizontal'
                const lineLength = isH
                    ? Math.abs(m.x2 - m.x1)
                    : Math.abs(m.y2 - m.y1)

                if (lineLength < 1) return null

                const midX = (m.x1 + m.x2) / 2
                const midY = (m.y1 + m.y2) / 2

                const color = '#f24e1e' // Figma's red orange

                return (
                    <div key={`meas-${i}`}>
                        {/* Line */}
                        <div
                            className="pointer-events-none"
                            style={{
                                boxSizing: 'border-box',
                                position: 'absolute',
                                left: isH ? Math.min(m.x1, m.x2) : m.x1 - 0.5,
                                top: isH ? m.y1 - 0.5 : Math.min(m.y1, m.y2),
                                width: isH ? lineLength : 0,
                                height: !isH ? lineLength : 0,
                                borderTop: isH ? `1px ${m.isDashed ? 'dashed' : 'solid'} ${color}` : 'none',
                                borderLeft: !isH ? `1px ${m.isDashed ? 'dashed' : 'solid'} ${color}` : 'none',
                                zIndex: 1002,
                            }}
                        />

                        {/* Distance label */}
                        {!m.isDashed && m.distance > 0 && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: midX,
                                    top: midY,
                                    transform: `translate(-50%, -50%) ${lineLength < 36
                                            ? isH ? 'translateY(-16px)' : 'translateX(16px)'
                                            : ''
                                        }`,
                                    backgroundColor: color,
                                    color: '#ffffff',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                    whiteSpace: 'nowrap',
                                    lineHeight: '14px',
                                    zIndex: 1003,
                                }}
                            >
                                {m.distance}
                            </div>
                        )}

                        {/* End caps */}
                        {!m.isDashed && isH && (
                            <>
                                <div className="pointer-events-none" style={{ position: 'absolute', left: m.x1 - 0.5, top: m.y1 - 3, width: 1, height: 6, backgroundColor: color, zIndex: 1002 }} />
                                <div className="pointer-events-none" style={{ position: 'absolute', left: m.x2 - 0.5, top: m.y2 - 3, width: 1, height: 6, backgroundColor: color, zIndex: 1002 }} />
                            </>
                        )}
                        {!m.isDashed && !isH && (
                            <>
                                <div className="pointer-events-none" style={{ position: 'absolute', left: m.x1 - 3, top: m.y1 - 0.5, width: 6, height: 1, backgroundColor: color, zIndex: 1002 }} />
                                <div className="pointer-events-none" style={{ position: 'absolute', left: m.x2 - 3, top: m.y2 - 0.5, width: 6, height: 1, backgroundColor: color, zIndex: 1002 }} />
                            </>
                        )}
                    </div>
                )
            })}
        </>
    )
}

/**
 * Export the alignment calculation for use by the drag hook (snap-to-guide).
 */
export { calculateAlignmentLines, getNodeScreenRect }
export type { ScreenRect, AlignmentLine }
