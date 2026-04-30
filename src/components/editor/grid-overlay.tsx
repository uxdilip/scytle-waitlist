'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById, findParentOfNode } from '@/types/canvas'
import type { FrameNode, GridTrack } from '@/types/canvas'

// ============================================================
// Constants
// ============================================================

const GRID_COLOR = '156, 39, 176'          // Purple (Figma uses pink — we differentiate)
const CELL_FILL = `rgba(${GRID_COLOR}, 0.06)`
const LINE_COLOR = `rgba(${GRID_COLOR}, 0.35)`
const LABEL_BG = `rgba(${GRID_COLOR}, 0.85)`
const LABEL_TEXT = '#fff'
const LABEL_FONT = '10px ui-monospace, SFMono-Regular, monospace'
const LABEL_HEIGHT = 16
const LABEL_PADDING_X = 5
const LABEL_OFFSET_Y = -22  // Above the grid container

const HANDLE_RADIUS = 4       // Resize handle circle radius
const HANDLE_HIT_RADIUS = 8   // Larger invisible hit area for easier clicking
const HANDLE_COLOR = `rgba(${GRID_COLOR}, 0.9)`
const HANDLE_ACTIVE_COLOR = `rgb(${GRID_COLOR})`
const CELL_HIGHLIGHT = `rgba(${GRID_COLOR}, 0.2)` // Highlighted cell during drag

// ============================================================
// Helpers
// ============================================================

/** Parse a computed CSS grid-template value like "200px 400px 200px" into pixel numbers */
function parseComputedTrackSizes(computed: string): number[] {
    if (!computed || computed === 'none') return []
    return computed.split(/\s+/).map(s => parseFloat(s)).filter(n => !isNaN(n))
}

/** Format a GridTrack for display: "1fr", "200px", "Hug" */
function formatTrack(track: GridTrack): string {
    if (track.unit === 'auto') return 'Hug'
    if (track.unit === 'fr') return `${track.value}fr`
    return `${Math.round(track.value)}px`
}

/** Generate default labels from count (e.g. columns: 3 → ["1fr", "1fr", "1fr"]) */
function defaultTrackLabels(count: number): string[] {
    return Array.from({ length: count }, () => '1fr')
}

/** Get track labels from the node's layout config */
function getTrackLabels(
    node: FrameNode,
    axis: 'col' | 'row',
    computedCount: number
): string[] {
    const tracks = axis === 'col' ? node.layout?.columnTracks : node.layout?.rowTracks
    if (tracks?.length) {
        return tracks.map(formatTrack)
    }
    const legacy = axis === 'col' ? node.layout?.columns : node.layout?.rows
    if (typeof legacy === 'number') {
        return defaultTrackLabels(legacy)
    }
    if (typeof legacy === 'string') {
        return legacy.split(/\s+/)
    }
    return defaultTrackLabels(computedCount)
}

/**
 * Ensure a node has columnTracks/rowTracks (auto-migrate from legacy columns/rows).
 * Returns the tracks array — never mutates the node directly.
 */
function ensureTracks(node: FrameNode, axis: 'col' | 'row', computedCount: number): GridTrack[] {
    const existing = axis === 'col' ? node.layout?.columnTracks : node.layout?.rowTracks
    if (existing?.length) return [...existing.map(t => ({ ...t }))]

    const legacy = axis === 'col' ? node.layout?.columns : node.layout?.rows
    if (typeof legacy === 'number') {
        return Array.from({ length: legacy }, () => ({ value: 1, unit: 'fr' as const }))
    }
    if (typeof legacy === 'string') {
        return legacy.split(/\s+/).map(parseTrackString)
    }
    // Fallback: use computed count as uniform fr tracks
    return Array.from({ length: computedCount }, () => ({ value: 1, unit: 'fr' as const }))
}

/** Parse a track string like "1fr", "200px", "auto" into a GridTrack */
function parseTrackString(s: string): GridTrack {
    const trimmed = s.trim()
    if (trimmed === 'auto') return { value: 0, unit: 'auto' }
    if (trimmed.endsWith('fr')) return { value: parseFloat(trimmed) || 1, unit: 'fr' }
    if (trimmed.endsWith('px')) return { value: parseFloat(trimmed) || 0, unit: 'px' }
    return { value: parseFloat(trimmed) || 1, unit: 'fr' }
}

// ============================================================
// Types
// ============================================================

interface GridInfo {
    /** The grid node id */
    nodeId: string
    /** Screen-space bounding rect of the grid container (relative to viewport) */
    rect: { x: number; y: number; width: number; height: number }
    /** Computed column sizes in screen pixels */
    colSizes: number[]
    /** Computed row sizes in screen pixels */
    rowSizes: number[]
    /** Column gap in screen pixels */
    colGap: number
    /** Row gap in screen pixels */
    rowGap: number
    /** Track labels for columns */
    colLabels: string[]
    /** Track labels for rows */
    rowLabels: string[]
}

interface ResizeDragState {
    axis: 'col' | 'row'
    /** Index of the track to the LEFT (or ABOVE) the boundary being dragged */
    trackIndex: number
    /** Starting pointer position (screen px) */
    startPos: number
    /** Snapshot of tracks at drag start */
    startTracks: GridTrack[]
    /** Computed pixel sizes of all tracks at drag start (screen px) */
    startSizes: number[]
    /** Total content size of the grid along this axis (screen px, excluding gaps) */
    totalContentSize: number
}

// ============================================================
// GridOverlay Component
// ============================================================

/**
 * Visual grid overlay — renders grid lines, cell shading, track
 * labels, and interactive resize handles over a selected grid
 * container. Uses RAF for smooth tracking.
 *
 * Pattern follows SelectionOverlay / MeasurementOverlay:
 *   - screen-space SVG, pointer-events: none (except resize handles)
 *   - reads DOM via data-node-id + getComputedStyle
 *   - RAF loop for position tracking during pan/zoom
 */
export function GridOverlay({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const nodes = useEditorStore((s) => s.nodes)
    const viewportRect = useEditorStore((s) => s.viewportRect)
    const zoom = useEditorStore((s) => s.zoom)
    const updateNode = useEditorStore((s) => s.updateNode)
    const gridHighlightNodeId = useEditorStore((s) => s.gridHighlightNodeId)
    const gridHighlightCol = useEditorStore((s) => s.gridHighlightCol)
    const gridHighlightRow = useEditorStore((s) => s.gridHighlightRow)
    const gridSelectedTrackAxis = useEditorStore((s) => s.gridSelectedTrackAxis)
    const gridSelectedTrackIndex = useEditorStore((s) => s.gridSelectedTrackIndex)
    const setGridSelectedTrack = useEditorStore((s) => s.setGridSelectedTrack)

    const [gridInfo, setGridInfo] = useState<GridInfo | null>(null)
    const [hoveredHandle, setHoveredHandle] = useState<string | null>(null)
    const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null)
    const [hoveredTrack, setHoveredTrack] = useState<string | null>(null) // "col-0", "row-1" — for label expand
    const [dragState, setDragState] = useState<ResizeDragState | null>(null)
    const rafRef = useRef<number>(0)
    const prevInfoRef = useRef<GridInfo | null>(null)
    const isMountedRef = useRef(true)
    const dragRef = useRef<ResizeDragState | null>(null)

    // Find the grid node: either the selected node IS a grid, or the selected
    // node's parent is a grid (show grid when editing items inside a grid)
    const getGridNode = useCallback((): FrameNode | null => {
        if (selectedIds.length === 0) return null
        const primaryId = selectedIds[0]
        const node = findNodeById(nodes, primaryId)
        if (!node) return null

        // Selected node is a grid container
        if (node.type === 'frame' && node.layout?.mode === 'grid') {
            return node as FrameNode
        }

        // Selected node's parent might be a grid container
        const parentResult = findParentOfNode(nodes, primaryId)
        if (parentResult?.parent?.layout?.mode === 'grid') {
            return parentResult.parent
        }

        return null
    }, [selectedIds, nodes])

    // Clear track selection when grid node changes or is deselected
    const currentGridNodeId = getGridNode()?.id ?? null
    const prevGridNodeIdRef = useRef<string | null>(null)
    useEffect(() => {
        if (prevGridNodeIdRef.current !== currentGridNodeId) {
            if (gridSelectedTrackAxis !== null) setGridSelectedTrack(null)
            setHoveredTrack(null)
            prevGridNodeIdRef.current = currentGridNodeId
        }
    }, [currentGridNodeId, gridSelectedTrackAxis, setGridSelectedTrack])

    // RAF loop — measure DOM, compute grid info
    useEffect(() => {
        isMountedRef.current = true

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            const gridNode = getGridNode()

            if (!viewport || !gridNode) {
                if (prevInfoRef.current !== null) {
                    prevInfoRef.current = null
                    setGridInfo(null)
                }
                rafRef.current = requestAnimationFrame(loop)
                return
            }

            // Find the DOM element
            const el = viewport.querySelector(`[data-node-id="${gridNode.id}"]`) as HTMLElement | null
            if (!el) {
                if (prevInfoRef.current !== null) {
                    prevInfoRef.current = null
                    setGridInfo(null)
                }
                rafRef.current = requestAnimationFrame(loop)
                return
            }

            const elRect = el.getBoundingClientRect()
            const vpRect = viewport.getBoundingClientRect()

            const style = window.getComputedStyle(el)
            const colSizes = parseComputedTrackSizes(style.gridTemplateColumns)
            const rowSizes = parseComputedTrackSizes(style.gridTemplateRows)

            if (colSizes.length === 0 && rowSizes.length === 0) {
                rafRef.current = requestAnimationFrame(loop)
                return
            }

            const colGap = parseFloat(style.columnGap) || 0
            const rowGap = parseFloat(style.rowGap) || 0

            const info: GridInfo = {
                nodeId: gridNode.id,
                rect: {
                    x: elRect.left - vpRect.left,
                    y: elRect.top - vpRect.top,
                    width: elRect.width,
                    height: elRect.height,
                },
                colSizes,
                rowSizes,
                colGap,
                rowGap,
                colLabels: getTrackLabels(gridNode, 'col', colSizes.length),
                rowLabels: getTrackLabels(gridNode, 'row', rowSizes.length),
            }

            // Diff check — only update state if something changed
            const prev = prevInfoRef.current
            if (
                !prev ||
                Math.abs(prev.rect.x - info.rect.x) > 0.1 ||
                Math.abs(prev.rect.y - info.rect.y) > 0.1 ||
                Math.abs(prev.rect.width - info.rect.width) > 0.1 ||
                Math.abs(prev.rect.height - info.rect.height) > 0.1 ||
                prev.colSizes.length !== info.colSizes.length ||
                prev.rowSizes.length !== info.rowSizes.length ||
                prev.colSizes.some((s, i) => Math.abs(s - info.colSizes[i]) > 0.1) ||
                prev.rowSizes.some((s, i) => Math.abs(s - info.rowSizes[i]) > 0.1)
            ) {
                prevInfoRef.current = info
                if (isMountedRef.current) setGridInfo(info)
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        rafRef.current = requestAnimationFrame(loop)

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [viewportRef, getGridNode])

    // ── Resize handle drag logic ─────────────────────────────

    const handlePointerDown = useCallback((
        e: React.PointerEvent,
        axis: 'col' | 'row',
        trackIndex: number,
    ) => {
        e.stopPropagation()
        e.preventDefault()

        const gridNode = getGridNode()
        if (!gridNode || !gridInfo) return

        const sizes = axis === 'col' ? gridInfo.colSizes : gridInfo.rowSizes
        const tracks = ensureTracks(gridNode, axis, sizes.length)

        // Total content size = sum of track sizes (gaps excluded)
        const totalContentSize = sizes.reduce((a, b) => a + b, 0)

        const state: ResizeDragState = {
            axis,
            trackIndex,
            startPos: axis === 'col' ? e.clientX : e.clientY,
            startTracks: tracks,
            startSizes: [...sizes],
            totalContentSize,
        }

        dragRef.current = state
        setDragState(state)

        // If node doesn't have tracks yet, migrate now
        const trackKey = axis === 'col' ? 'columnTracks' : 'rowTracks'
        const existingTracks = axis === 'col' ? gridNode.layout?.columnTracks : gridNode.layout?.rowTracks
        if (!existingTracks?.length) {
            updateNode(gridNode.id, {
                layout: {
                    ...gridNode.layout,
                    [trackKey]: tracks,
                },
            })
        }

        const onPointerMove = (ev: PointerEvent) => {
            const ds = dragRef.current
            if (!ds) return

            const delta = (ds.axis === 'col' ? ev.clientX : ev.clientY) - ds.startPos
            const newTracks = [...ds.startTracks.map(t => ({ ...t }))]

            const leftTrack = newTracks[ds.trackIndex]
            const rightTrack = ds.trackIndex + 1 < newTracks.length ? newTracks[ds.trackIndex + 1] : null

            if (leftTrack.unit === 'px') {
                // Direct pixel adjustment (convert screen delta to canvas px via zoom)
                const canvasDelta = delta / zoom
                leftTrack.value = Math.max(1, Math.round(ds.startTracks[ds.trackIndex].value + canvasDelta))

                // If right neighbor is also px, compensate
                if (rightTrack && rightTrack.unit === 'px') {
                    rightTrack.value = Math.max(1, Math.round(ds.startTracks[ds.trackIndex + 1].value - canvasDelta))
                }
            } else if (leftTrack.unit === 'fr') {
                // Convert screen delta to proportional fr change
                // 1fr = totalContentSize / totalFr screen pixels
                const totalFr = ds.startTracks.reduce((s, t) => s + (t.unit === 'fr' ? t.value : 0), 0)
                if (totalFr <= 0 || ds.totalContentSize <= 0) return

                const pxPerFr = ds.totalContentSize / totalFr
                const frDelta = delta / pxPerFr

                leftTrack.value = Math.max(0.1, Math.round((ds.startTracks[ds.trackIndex].value + frDelta) * 100) / 100)

                // Compensate on right neighbor if it's fr too
                if (rightTrack && rightTrack.unit === 'fr') {
                    rightTrack.value = Math.max(0.1, Math.round((ds.startTracks[ds.trackIndex + 1].value - frDelta) * 100) / 100)
                }
            }
            // auto tracks: no resize (ignore)

            // Update the node
            const gn = getGridNode()
            if (gn) {
                const tKey = ds.axis === 'col' ? 'columnTracks' : 'rowTracks'
                updateNode(gn.id, {
                    layout: {
                        ...gn.layout,
                        [tKey]: newTracks,
                    },
                })
            }
        }

        const onPointerUp = () => {
            dragRef.current = null
            setDragState(null)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
    }, [getGridNode, gridInfo, zoom, updateNode])

    // Track hovered cell via passive pointermove on the viewport (no event interception)
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport || !gridInfo) {
            if (hoveredCell) setHoveredCell(null)
            return
        }

        const MARGIN = 30 // px — extend detection zone above/left for dots
        const { rect, colSizes: cs, rowSizes: rs, colGap: cg, rowGap: rg } = gridInfo

        const onMove = (e: PointerEvent) => {
            const vpRect = viewport.getBoundingClientRect()
            const sx = e.clientX - vpRect.left
            const sy = e.clientY - vpRect.top

            if (
                sx >= rect.x - MARGIN && sx <= rect.x + rect.width &&
                sy >= rect.y - MARGIN && sy <= rect.y + rect.height
            ) {
                const relX = Math.max(0, sx - rect.x)
                const relY = Math.max(0, sy - rect.y)
                let col = 0, acc = 0
                for (let i = 0; i < cs.length; i++) {
                    acc += cs[i]; if (relX < acc) { col = i; break }; acc += cg
                    if (i === cs.length - 1) col = i
                }
                let row = 0; acc = 0
                for (let i = 0; i < rs.length; i++) {
                    acc += rs[i]; if (relY < acc) { row = i; break }; acc += rg
                    if (i === rs.length - 1) row = i
                }
                setHoveredCell(prev =>
                    prev?.col === col && prev?.row === row ? prev : { col, row }
                )
            } else {
                setHoveredCell(prev => prev === null ? prev : null)
            }
        }

        const onLeave = () => setHoveredCell(null)

        viewport.addEventListener('pointermove', onMove)
        viewport.addEventListener('pointerleave', onLeave)
        return () => {
            viewport.removeEventListener('pointermove', onMove)
            viewport.removeEventListener('pointerleave', onLeave)
        }
    }, [viewportRef, gridInfo])
    const getCellFromScreenPoint = useCallback((screenX: number, screenY: number): { col: number; row: number } | null => {
        if (!gridInfo) return null
        const { rect, colSizes, rowSizes, colGap, rowGap } = gridInfo
        const relX = screenX - rect.x
        const relY = screenY - rect.y
        if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null

        // Recompute positions inline (cheap for small track counts)
        let col = 0, accum = 0
        for (let i = 0; i < colSizes.length; i++) {
            accum += colSizes[i]
            if (relX < accum) { col = i; break }
            accum += colGap
            if (i === colSizes.length - 1) col = i
        }
        let row = 0
        accum = 0
        for (let i = 0; i < rowSizes.length; i++) {
            accum += rowSizes[i]
            if (relY < accum) { row = i; break }
            accum += rowGap
            if (i === rowSizes.length - 1) row = i
        }
        return { col, row }
    }, [gridInfo])

    // ── Render ────────────────────────────────────────────────

    if (!gridInfo) return null

    const { rect, colSizes, rowSizes, colGap, rowGap, colLabels, rowLabels } = gridInfo
    const vW = viewportRect?.width ?? window.innerWidth
    const vH = viewportRect?.height ?? window.innerHeight

    // Compute cumulative positions (accounting for gaps)
    const colPositions: number[] = []
    let cx = 0
    for (let i = 0; i < colSizes.length; i++) {
        colPositions.push(cx)
        cx += colSizes[i] + (i < colSizes.length - 1 ? colGap : 0)
    }

    const rowPositions: number[] = []
    let ry = 0
    for (let i = 0; i < rowSizes.length; i++) {
        rowPositions.push(ry)
        ry += rowSizes[i] + (i < rowSizes.length - 1 ? rowGap : 0)
    }

    // Compute boundary positions for resize handles
    // Column boundaries: between col[i] end and col[i+1] start
    const colBoundaries: number[] = []
    for (let i = 0; i < colSizes.length - 1; i++) {
        colBoundaries.push(colPositions[i] + colSizes[i] + colGap / 2)
    }

    const rowBoundaries: number[] = []
    for (let i = 0; i < rowSizes.length - 1; i++) {
        rowBoundaries.push(rowPositions[i] + rowSizes[i] + rowGap / 2)
    }

    return (
        <>
            {/* Main SVG: grid lines + highlights — pointer-events: none */}
            <svg
                className="absolute inset-0 pointer-events-none"
                style={{ width: vW, height: vH, overflow: 'visible', zIndex: 55 }}
            >
                {/* Highlighted cell during grid-place drag */}
                {gridHighlightNodeId === gridInfo.nodeId &&
                    gridHighlightCol != null && gridHighlightRow != null &&
                    gridHighlightCol >= 1 && gridHighlightCol <= colSizes.length &&
                    gridHighlightRow >= 1 && gridHighlightRow <= rowSizes.length && (
                    <rect
                        x={rect.x + colPositions[gridHighlightCol - 1]}
                        y={rect.y + rowPositions[gridHighlightRow - 1]}
                        width={colSizes[gridHighlightCol - 1]}
                        height={rowSizes[gridHighlightRow - 1]}
                        fill={CELL_HIGHLIGHT}
                        stroke={HANDLE_ACTIVE_COLOR}
                        strokeWidth={2}
                        rx={2}
                    />
                )}

                {/* Selected track highlight — only when explicitly clicked */}
                {gridSelectedTrackAxis === 'col' && gridSelectedTrackIndex != null &&
                    gridSelectedTrackIndex < colSizes.length && (
                    <rect
                        x={rect.x + colPositions[gridSelectedTrackIndex]}
                        y={rect.y}
                        width={colSizes[gridSelectedTrackIndex]}
                        height={rect.height}
                        fill={CELL_HIGHLIGHT}
                        stroke={HANDLE_ACTIVE_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        rx={1}
                    />
                )}
                {gridSelectedTrackAxis === 'row' && gridSelectedTrackIndex != null &&
                    gridSelectedTrackIndex < rowSizes.length && (
                    <rect
                        x={rect.x}
                        y={rect.y + rowPositions[gridSelectedTrackIndex]}
                        width={rect.width}
                        height={rowSizes[gridSelectedTrackIndex]}
                        fill={CELL_HIGHLIGHT}
                        stroke={HANDLE_ACTIVE_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        rx={1}
                    />
                )}

                {/* Column boundary lines (vertical) */}
                {colBoundaries.map((bx, i) => (
                    <line
                        key={`col-line-${i}`}
                        x1={rect.x + bx}
                        y1={rect.y}
                        x2={rect.x + bx}
                        y2={rect.y + rect.height}
                        stroke={LINE_COLOR}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                    />
                ))}

                {/* Row boundary lines (horizontal) */}
                {rowBoundaries.map((by, i) => (
                    <line
                        key={`row-line-${i}`}
                        x1={rect.x}
                        y1={rect.y + by}
                        x2={rect.x + rect.width}
                        y2={rect.y + by}
                        stroke={LINE_COLOR}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                    />
                ))}

                {/* Container outline */}
                <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill="none"
                    stroke={LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    rx={2}
                />
            </svg>

            {/* Interactive layer: context-aware dots + resize handles */}
            <svg
                className="absolute inset-0"
                style={{
                    width: vW,
                    height: vH,
                    overflow: 'visible',
                    zIndex: 56,
                    pointerEvents: 'none',
                }}
            >
                {/* Column dot/label — only for hovered col or selected col */}
                {colSizes.map((cw, i) => {
                    const trackKey = `col-${i}`
                    const isSelected = gridSelectedTrackAxis === 'col' && gridSelectedTrackIndex === i
                    const visible = hoveredCell?.col === i || isSelected
                    if (!visible) return null

                    const isLabelHovered = hoveredTrack === trackKey
                    const showLabel = isLabelHovered || isSelected
                    const centerX = rect.x + colPositions[i] + cw / 2
                    const dotY = rect.y + LABEL_OFFSET_Y + LABEL_HEIGHT / 2
                    const label = colLabels[i] ?? `${Math.round(cw)}px`
                    const labelWidth = Math.max(label.length * 7 + LABEL_PADDING_X * 2, 28)

                    return (
                        <g key={trackKey}>
                            <rect
                                x={centerX - Math.max(labelWidth, 16) / 2}
                                y={dotY - LABEL_HEIGHT / 2 - 2}
                                width={Math.max(labelWidth, 16)}
                                height={LABEL_HEIGHT + 4}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onPointerEnter={() => setHoveredTrack(trackKey)}
                                onPointerLeave={() => setHoveredTrack(null)}
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setGridSelectedTrack(isSelected ? null : 'col', isSelected ? null : i)
                                }}
                            />
                            {showLabel ? (
                                <>
                                    <rect x={centerX - labelWidth / 2} y={dotY - LABEL_HEIGHT / 2}
                                        width={labelWidth} height={LABEL_HEIGHT} rx={4}
                                        fill={isSelected ? HANDLE_ACTIVE_COLOR : LABEL_BG}
                                        style={{ pointerEvents: 'none' }} />
                                    <text x={centerX} y={dotY}
                                        textAnchor="middle" dominantBaseline="central"
                                        fill={LABEL_TEXT} style={{ font: LABEL_FONT, pointerEvents: 'none' }}>
                                        {label}
                                    </text>
                                </>
                            ) : (
                                <circle cx={centerX} cy={dotY} r={3}
                                    fill={`rgba(${GRID_COLOR}, 0.4)`}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    )
                })}

                {/* Row dot/label — only for hovered row or selected row */}
                {rowSizes.map((rh, i) => {
                    const trackKey = `row-${i}`
                    const isSelected = gridSelectedTrackAxis === 'row' && gridSelectedTrackIndex === i
                    const visible = hoveredCell?.row === i || isSelected
                    if (!visible) return null

                    const isLabelHovered = hoveredTrack === trackKey
                    const showLabel = isLabelHovered || isSelected
                    const centerY = rect.y + rowPositions[i] + rh / 2
                    const dotX = rect.x - 12
                    const label = rowLabels[i] ?? `${Math.round(rh)}px`
                    const labelWidth = Math.max(label.length * 7 + LABEL_PADDING_X * 2, 28)
                    const labelX = rect.x - labelWidth - 6

                    return (
                        <g key={trackKey}>
                            <rect x={labelX - 2} y={centerY - LABEL_HEIGHT / 2 - 2}
                                width={labelWidth + 10} height={LABEL_HEIGHT + 4}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onPointerEnter={() => setHoveredTrack(trackKey)}
                                onPointerLeave={() => setHoveredTrack(null)}
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setGridSelectedTrack(isSelected ? null : 'row', isSelected ? null : i)
                                }}
                            />
                            {showLabel ? (
                                <>
                                    <rect x={labelX} y={centerY - LABEL_HEIGHT / 2}
                                        width={labelWidth} height={LABEL_HEIGHT} rx={4}
                                        fill={isSelected ? HANDLE_ACTIVE_COLOR : LABEL_BG}
                                        style={{ pointerEvents: 'none' }} />
                                    <text x={labelX + labelWidth / 2} y={centerY}
                                        textAnchor="middle" dominantBaseline="central"
                                        fill={LABEL_TEXT} style={{ font: LABEL_FONT, pointerEvents: 'none' }}>
                                        {label}
                                    </text>
                                </>
                            ) : (
                                <circle cx={dotX} cy={centerY} r={3}
                                    fill={`rgba(${GRID_COLOR}, 0.4)`}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    )
                })}

                {/* Column resize handles — vertical boundary dots */}
                {colBoundaries.map((bx, i) => {
                    const handleId = `col-${i}`
                    const isHovered = hoveredHandle === handleId
                    const isDragging = dragState?.axis === 'col' && dragState.trackIndex === i
                    const screenX = rect.x + bx
                    const screenY = rect.y + rect.height / 2

                    return (
                        <g key={handleId}>
                            {/* Invisible larger hit area */}
                            <circle
                                cx={screenX}
                                cy={screenY}
                                r={HANDLE_HIT_RADIUS}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'col-resize' }}
                                onPointerEnter={() => setHoveredHandle(handleId)}
                                onPointerLeave={() => { if (!dragState) setHoveredHandle(null) }}
                                onPointerDown={(e) => handlePointerDown(e, 'col', i)}
                            />
                            {/* Visible dot */}
                            {(isHovered || isDragging) && (
                                <circle
                                    cx={screenX}
                                    cy={screenY}
                                    r={HANDLE_RADIUS}
                                    fill={isDragging ? HANDLE_ACTIVE_COLOR : HANDLE_COLOR}
                                    stroke="#fff"
                                    strokeWidth={1.5}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                            {/* Extended drag line when active */}
                            {isDragging && (
                                <line
                                    x1={screenX}
                                    y1={rect.y}
                                    x2={screenX}
                                    y2={rect.y + rect.height}
                                    stroke={HANDLE_ACTIVE_COLOR}
                                    strokeWidth={2}
                                    opacity={0.6}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                        </g>
                    )
                })}

                {/* Row resize handles — horizontal boundary dots */}
                {rowBoundaries.map((by, i) => {
                    const handleId = `row-${i}`
                    const isHovered = hoveredHandle === handleId
                    const isDragging = dragState?.axis === 'row' && dragState.trackIndex === i
                    const screenX = rect.x + rect.width / 2
                    const screenY = rect.y + by

                    return (
                        <g key={handleId}>
                            {/* Invisible larger hit area */}
                            <circle
                                cx={screenX}
                                cy={screenY}
                                r={HANDLE_HIT_RADIUS}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'row-resize' }}
                                onPointerEnter={() => setHoveredHandle(handleId)}
                                onPointerLeave={() => { if (!dragState) setHoveredHandle(null) }}
                                onPointerDown={(e) => handlePointerDown(e, 'row', i)}
                            />
                            {/* Visible dot */}
                            {(isHovered || isDragging) && (
                                <circle
                                    cx={screenX}
                                    cy={screenY}
                                    r={HANDLE_RADIUS}
                                    fill={isDragging ? HANDLE_ACTIVE_COLOR : HANDLE_COLOR}
                                    stroke="#fff"
                                    strokeWidth={1.5}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                            {/* Extended drag line when active */}
                            {isDragging && (
                                <line
                                    x1={rect.x}
                                    y1={screenY}
                                    x2={rect.x + rect.width}
                                    y2={screenY}
                                    stroke={HANDLE_ACTIVE_COLOR}
                                    strokeWidth={2}
                                    opacity={0.6}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                        </g>
                    )
                })}
            </svg>
        </>
    )
}
