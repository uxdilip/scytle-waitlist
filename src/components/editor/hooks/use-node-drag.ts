'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById, findParentOfNode, deepCloneWithNewIds, getNodeCanvasPosition, findContainingFrame, getEffectiveFrameSize, collectNodeIds } from '@/types/canvas'
import type { FrameNode, ScytleNode } from '@/types/canvas'

// ============================================================
// Constants
// ============================================================

const DRAG_THRESHOLD = 5 // px of movement before drag activates
const REPARENT_INSET = 12
const REPARENT_OVERLAP_THRESHOLD = 0.25

// ============================================================
// Module-level drag flag (shared with page.tsx for Escape gating)
// ============================================================

let _isDragActive = false

/** Check whether a node drag is in progress (for external Escape handling) */
export function isDragActive(): boolean {
    return _isDragActive
}

// ============================================================
// Types
// ============================================================

export interface InsertIndicator {
    /** Screen-space x relative to viewport */
    x: number
    /** Screen-space y relative to viewport */
    y: number
    width: number
    height: number
}

export interface DragInfo {
    isDragging: boolean
    mode: 'freeform' | 'reorder' | 'grid-place' | null
    indicator: InsertIndicator | null
    /** Canvas-space snap guide lines shown while dragging (x = vertical line, y = horizontal line) */
    snapLines: { axis: 'x' | 'y'; canvasPos: number }[]
}

interface InternalDragState {
    phase: 'idle' | 'pending' | 'dragging'
    nodeId: string
    startPointerX: number
    startPointerY: number
    startNodeX: number
    startNodeY: number
    mode: 'freeform' | 'reorder' | 'grid-place'
    /** Parent frame ID (null for top-level freeform) */
    parentId: string | null
    /** Flex direction of parent (for reorder) */
    parentDirection: 'row' | 'column'
    /** Node's original index in parent's children */
    originalIndex: number
    /** Current insertion gap index (0..N) during reorder */
    currentGapIndex: number
    /** Pointer ID for capture release */
    pointerId: number
    /** Node intended by click selection (can differ from drag anchor) */
    clickTargetId: string
    /** Other selected nodes' starting positions (for multi-select drag) */
    additionalNodes: { id: string; startX: number; startY: number }[]
    /** Whether shift was held during pointer down (skip reduce-to-single on up) */
    shiftHeld: boolean
    /** Grid cell placement: current column (1-based) */
    gridCol: number
    /** Grid cell placement: current row (1-based) */
    gridRow: number
    /** Grid cell placement: original column before drag (for swap) */
    originalGridCol: number | null
    /** Grid cell placement: original row before drag (for swap) */
    originalGridRow: number | null
}

const INITIAL_STATE: InternalDragState = {
    phase: 'idle',
    nodeId: '',
    startPointerX: 0,
    startPointerY: 0,
    startNodeX: 0,
    startNodeY: 0,
    mode: 'freeform',
    parentId: null,
    parentDirection: 'column',
    originalIndex: -1,
    currentGapIndex: -1,
    pointerId: -1,
    clickTargetId: '',
    additionalNodes: [],
    shiftHeld: false,
    gridCol: 1,
    gridRow: 1,
    originalGridCol: null,
    originalGridRow: null,
}

// ============================================================
// Insertion gap helpers
// ============================================================

/**
 * Calculate which gap (0..N) the cursor falls into among a parent's children.
 * Gap 0 = before first child, gap N = after last child.
 *
 * Uses the midpoint of each child along the flex direction axis.
 */
function calculateInsertionGap(
    clientX: number,
    clientY: number,
    parentId: string,
    direction: 'row' | 'column',
    viewportEl: HTMLElement
): number {
    const parentEl = viewportEl.querySelector(
        `[data-node-id="${parentId}"]`
    ) as HTMLElement | null
    if (!parentEl) return 0

    // Direct children with node IDs
    const children = Array.from(
        parentEl.querySelectorAll(':scope > [data-node-id]')
    ) as HTMLElement[]

    if (children.length === 0) return 0

    const cursorPos = direction === 'row' ? clientX : clientY

    for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect()
        const mid =
            direction === 'row'
                ? rect.left + rect.width / 2
                : rect.top + rect.height / 2

        if (cursorPos < mid) return i
    }

    return children.length
}

/**
 * Calculate the screen-space position of the insertion indicator line.
 */
function calculateIndicatorPosition(
    gapIndex: number,
    parentId: string,
    direction: 'row' | 'column',
    viewportEl: HTMLElement
): InsertIndicator | null {
    const parentEl = viewportEl.querySelector(
        `[data-node-id="${parentId}"]`
    ) as HTMLElement | null
    if (!parentEl) return null

    const children = Array.from(
        parentEl.querySelectorAll(':scope > [data-node-id]')
    ) as HTMLElement[]

    if (children.length === 0) return null

    const viewportRect = viewportEl.getBoundingClientRect()
    const parentRect = parentEl.getBoundingClientRect()

    const LINE_THICKNESS = 2
    const LINE_INSET = 4 // inset from parent edges
    const GAP_OFFSET = 2 // space from nearest child edge

    if (direction === 'column') {
        // Horizontal line
        let lineY: number
        if (gapIndex === 0) {
            lineY =
                children[0].getBoundingClientRect().top -
                viewportRect.top -
                GAP_OFFSET
        } else if (gapIndex >= children.length) {
            const lastRect =
                children[children.length - 1].getBoundingClientRect()
            lineY = lastRect.bottom - viewportRect.top + GAP_OFFSET
        } else {
            const prevRect =
                children[gapIndex - 1].getBoundingClientRect()
            const nextRect = children[gapIndex].getBoundingClientRect()
            lineY =
                (prevRect.bottom + nextRect.top) / 2 - viewportRect.top
        }

        return {
            x: parentRect.left - viewportRect.left + LINE_INSET,
            y: lineY - LINE_THICKNESS / 2,
            width: parentRect.width - LINE_INSET * 2,
            height: LINE_THICKNESS,
        }
    } else {
        // Vertical line
        let lineX: number
        if (gapIndex === 0) {
            lineX =
                children[0].getBoundingClientRect().left -
                viewportRect.left -
                GAP_OFFSET
        } else if (gapIndex >= children.length) {
            const lastRect =
                children[children.length - 1].getBoundingClientRect()
            lineX = lastRect.right - viewportRect.left + GAP_OFFSET
        } else {
            const prevRect =
                children[gapIndex - 1].getBoundingClientRect()
            const nextRect = children[gapIndex].getBoundingClientRect()
            lineX =
                (prevRect.right + nextRect.left) / 2 - viewportRect.left
        }

        return {
            x: lineX - LINE_THICKNESS / 2,
            y: parentRect.top - viewportRect.top + LINE_INSET,
            width: LINE_THICKNESS,
            height: parentRect.height - LINE_INSET * 2,
        }
    }
}

// ============================================================
// Grid cell detection helpers
// ============================================================

/** Parse "200px 400px 200px" into [200, 400, 200] */
function parseComputedTrackSizes(computed: string): number[] {
    if (!computed || computed === 'none') return []
    return computed.split(/\s+/).map(s => parseFloat(s)).filter(n => !isNaN(n))
}

/**
 * Determine which grid cell (1-based col, row) a screen-space point falls into.
 * Returns null if the point is outside the grid.
 */
function getGridCellAtScreenPoint(
    clientX: number,
    clientY: number,
    parentId: string,
    viewportEl: HTMLElement
): { col: number; row: number } | null {
    const parentEl = viewportEl.querySelector(
        `[data-node-id="${parentId}"]`
    ) as HTMLElement | null
    if (!parentEl) return null

    const style = window.getComputedStyle(parentEl)
    const colSizes = parseComputedTrackSizes(style.gridTemplateColumns)
    const rowSizes = parseComputedTrackSizes(style.gridTemplateRows)
    if (colSizes.length === 0 || rowSizes.length === 0) return null

    const colGap = parseFloat(style.columnGap) || 0
    const rowGap = parseFloat(style.rowGap) || 0

    const rect = parentEl.getBoundingClientRect()
    const relX = clientX - rect.left
    const relY = clientY - rect.top

    // Find column (1-based)
    let col = 1
    let accum = 0
    for (let i = 0; i < colSizes.length; i++) {
        accum += colSizes[i]
        if (relX < accum) { col = i + 1; break }
        accum += colGap
        if (i === colSizes.length - 1) col = colSizes.length
    }

    // Find row (1-based)
    let row = 1
    accum = 0
    for (let i = 0; i < rowSizes.length; i++) {
        accum += rowSizes[i]
        if (relY < accum) { row = i + 1; break }
        accum += rowGap
        if (i === rowSizes.length - 1) row = rowSizes.length
    }

    return { col, row }
}

interface CanvasRect {
    x: number
    y: number
    width: number
    height: number
}

function getIntersectionArea(a: CanvasRect, b: CanvasRect): number {
    const left = Math.max(a.x, b.x)
    const top = Math.max(a.y, b.y)
    const right = Math.min(a.x + a.width, b.x + b.width)
    const bottom = Math.min(a.y + a.height, b.y + b.height)

    const width = right - left
    const height = bottom - top

    if (width <= 0 || height <= 0) return 0
    return width * height
}

function getFrameDropRect(
    nodes: readonly ScytleNode[],
    frameId: string,
): CanvasRect | null {
    const frame = findNodeById(nodes, frameId)
    if (!frame || frame.type !== 'frame') return null

    const frameCanvasPos = getNodeCanvasPosition(nodes, frameId)
    if (!frameCanvasPos) return null

    const frameSize = getEffectiveFrameSize(frame)

    return {
        x: frameCanvasPos.x,
        y: frameCanvasPos.y,
        width: frameSize.width,
        height: frameSize.height,
    }
}

// ============================================================
// useNodeDrag hook
// ============================================================

export function useNodeDrag(
    viewportRef: React.RefObject<HTMLDivElement | null>
) {
    const [dragInfo, setDragInfo] = useState<DragInfo>({
        isDragging: false,
        mode: null,
        indicator: null,
        snapLines: [],
    })

    const stateRef = useRef<InternalDragState>({ ...INITIAL_STATE })

    // ── Start tracking a potential drag ─────────────────────────

    const startPotentialDrag = useCallback(
        (
            nodeId: string,
            pointerX: number,
            pointerY: number,
            pointerId: number,
            shiftHeld: boolean = false,
            clickTargetId?: string,
        ) => {
            const store = useEditorStore.getState()
            const node = findNodeById(store.nodes, nodeId)
            if (!node || node.locked) return

            const parentResult = findParentOfNode(store.nodes, nodeId)
            const parent = parentResult?.parent

            // Determine drag mode:
            // - Top-level (no parent) → freeform
            // - Parent with layout.mode === 'none' → freeform (absolute children)
            // - Node with positioning === 'absolute' (ignoring auto layout) → freeform
            // - Parent with layout.mode === 'grid' → grid-place (cell-based placement)
            // - Parent with layout.mode === 'flex' → reorder
            const isAbsolute = !parent || parent.layout.mode === 'none' || node.positioning === 'absolute'
            const isGrid = !!parent && parent.layout.mode === 'grid' && node.positioning !== 'absolute'
            const isReorder = !!parent && parent.layout.mode !== 'none' && !isGrid && node.positioning !== 'absolute'
            const mode = isAbsolute ? 'freeform' : isGrid ? 'grid-place' : 'reorder'

            // Capture other selected nodes' starting positions (multi-select drag)
            const additionalNodes: { id: string; startX: number; startY: number }[] = []
            if (mode === 'freeform') {
                for (const selectedId of store.selectedIds) {
                    if (selectedId === nodeId) continue
                    const selectedNode = findNodeById(store.nodes, selectedId)
                    if (selectedNode && !selectedNode.locked) {
                        additionalNodes.push({
                            id: selectedId,
                            startX: selectedNode.x,
                            startY: selectedNode.y,
                        })
                    }
                }
            }

            stateRef.current = {
                phase: 'pending',
                nodeId,
                startPointerX: pointerX,
                startPointerY: pointerY,
                startNodeX: node.x,
                startNodeY: node.y,
                mode,
                parentId: parent?.id ?? null,
                parentDirection: isReorder
                    ? (parent!.layout.direction ?? 'column')
                    : 'column',
                originalIndex: parentResult?.index ?? -1,
                currentGapIndex: parentResult?.index ?? -1,
                pointerId,
                clickTargetId: clickTargetId ?? nodeId,
                additionalNodes,
                shiftHeld,
                gridCol: node.gridColumnStart ?? 1,
                gridRow: node.gridRowStart ?? 1,
                originalGridCol: node.gridColumnStart ?? null,
                originalGridRow: node.gridRowStart ?? null,
            }
        },
        []
    )

    // ── Pointer move (called continuously) ──────────────────────

    const onDragPointerMove = useCallback(
        (clientX: number, clientY: number, altKey: boolean = false): boolean => {
            const s = stateRef.current
            if (s.phase === 'idle') return false

            const dx = clientX - s.startPointerX
            const dy = clientY - s.startPointerY

            // Threshold check — don't consume events until exceeded
            if (s.phase === 'pending') {
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return false

                s.phase = 'dragging'
                _isDragActive = true

                const store = useEditorStore.getState()
                store.beginBatch()

                // Alt+drag duplicate: clone the node, drag the clone
                if (altKey && s.mode === 'freeform') {
                    const original = findNodeById(store.nodes, s.nodeId)
                    if (original) {
                        const clone = deepCloneWithNewIds(original)
                        const result = findParentOfNode(store.nodes, s.nodeId)
                        store.addNode(
                            clone,
                            result?.parent?.id ?? undefined,
                            result ? result.index + 1 : undefined
                        )
                        // Switch to dragging the clone — original stays in place
                        s.nodeId = clone.id
                        s.startNodeX = clone.x
                        s.startNodeY = clone.y
                        store.selectNode(clone.id)
                    }
                }

                setDragInfo({
                    isDragging: true,
                    mode: s.mode,
                    indicator: null,
                    snapLines: [],
                })
            }

            if (s.mode === 'freeform') {
                // Convert screen delta → canvas delta
                const store = useEditorStore.getState()
                const zoom = store.zoom
                const canvasDx = dx / zoom
                const canvasDy = dy / zoom
                let newX = s.startNodeX + canvasDx
                let newY = s.startNodeY + canvasDy

                // ── Snap-to-guide logic ──────────────────────────────
                const SNAP_THRESHOLD = 5 // canvas pixels
                const node = findNodeById(store.nodes, s.nodeId)
                if (node) {
                    const parentResult = findParentOfNode(store.nodes, s.nodeId)
                    const parent = parentResult?.parent as FrameNode | null

                    // Collect snap reference points from parent and siblings
                    const snapXTargets: number[] = [] // x positions to snap node-left/node-center/node-right to
                    const snapYTargets: number[] = []

                    // Build set of all dragged IDs (primary + additional) to exclude from snap targets
                    const draggedIds = new Set([s.nodeId, ...s.additionalNodes.map(n => n.id)])

                    if (parent) {
                        // Parent center (relative to parent = content area)
                        const parentCenterX = (parent.width - (parent.padding?.left ?? 0) - (parent.padding?.right ?? 0)) / 2 + (parent.padding?.left ?? 0)
                        const parentCenterY = (parent.height - (parent.padding?.top ?? 0) - (parent.padding?.bottom ?? 0)) / 2 + (parent.padding?.top ?? 0)
                        snapXTargets.push(parentCenterX) // center snap
                        snapYTargets.push(parentCenterY)

                        // Sibling edges and centers
                        for (const child of parent.children) {
                            if (draggedIds.has(child.id)) continue
                            snapXTargets.push(child.x) // left edge
                            snapXTargets.push(child.x + child.width) // right edge
                            snapXTargets.push(child.x + child.width / 2) // center
                            snapYTargets.push(child.y) // top edge
                            snapYTargets.push(child.y + child.height) // bottom edge
                            snapYTargets.push(child.y + child.height / 2) // center
                        }
                    } else {
                        // Top-level: snap to other top-level nodes
                        for (const n of store.nodes) {
                            if (draggedIds.has(n.id)) continue
                            snapXTargets.push(n.x)
                            snapXTargets.push(n.x + n.width)
                            snapXTargets.push(n.x + n.width / 2)
                            snapYTargets.push(n.y)
                            snapYTargets.push(n.y + n.height)
                            snapYTargets.push(n.y + n.height / 2)
                        }
                    }

                    const nodeW = node.width
                    const nodeH = node.height
                    const nodeCenterX = newX + nodeW / 2
                    const nodeCenterY = newY + nodeH / 2
                    const nodeRight = newX + nodeW
                    const nodeBottom = newY + nodeH

                    // Snap X axis: check node-left, node-center, node-right against targets
                    let bestSnapX: number | null = null
                    let snapXGuidePos: number | null = null
                    let bestSnapDist = SNAP_THRESHOLD + 1
                    for (const target of snapXTargets) {
                        // Node left → target
                        const dLeft = Math.abs(newX - target)
                        if (dLeft < bestSnapDist) { bestSnapDist = dLeft; bestSnapX = target; snapXGuidePos = target }
                        // Node center → target
                        const dCenter = Math.abs(nodeCenterX - target)
                        if (dCenter < bestSnapDist) { bestSnapDist = dCenter; bestSnapX = target - nodeW / 2; snapXGuidePos = target }
                        // Node right → target
                        const dRight = Math.abs(nodeRight - target)
                        if (dRight < bestSnapDist) { bestSnapDist = dRight; bestSnapX = target - nodeW; snapXGuidePos = target }
                    }
                    if (bestSnapX !== null) newX = bestSnapX

                    // Snap Y axis
                    let bestSnapY: number | null = null
                    let snapYGuidePos: number | null = null
                    bestSnapDist = SNAP_THRESHOLD + 1
                    for (const target of snapYTargets) {
                        const dTop = Math.abs(newY - target)
                        if (dTop < bestSnapDist) { bestSnapDist = dTop; bestSnapY = target; snapYGuidePos = target }
                        const dCenter = Math.abs(nodeCenterY - target)
                        if (dCenter < bestSnapDist) { bestSnapDist = dCenter; bestSnapY = target - nodeH / 2; snapYGuidePos = target }
                        const dBottom = Math.abs(nodeBottom - target)
                        if (dBottom < bestSnapDist) { bestSnapDist = dBottom; bestSnapY = target - nodeH; snapYGuidePos = target }
                    }
                    if (bestSnapY !== null) newY = bestSnapY

                    // Emit snap guide lines
                    const snapLines: DragInfo['snapLines'] = []
                    if (bestSnapX !== null && snapXGuidePos !== null) snapLines.push({ axis: 'x', canvasPos: snapXGuidePos })
                    if (bestSnapY !== null && snapYGuidePos !== null) snapLines.push({ axis: 'y', canvasPos: snapYGuidePos })
                    setDragInfo((prev) => ({ ...prev, snapLines }))
                } else {
                    // No node found — clear any stale snap lines
                    setDragInfo((prev) => prev.snapLines.length > 0 ? { ...prev, snapLines: [] } : prev)
                }

                // Calculate the effective delta (may differ from raw due to snapping)
                const effectiveDx = newX - s.startNodeX
                const effectiveDy = newY - s.startNodeY

                store.updateNode(s.nodeId, { x: newX, y: newY })

                // Move additional selected nodes by the same effective delta
                for (const extra of s.additionalNodes) {
                    store.updateNode(extra.id, {
                        x: extra.startX + effectiveDx,
                        y: extra.startY + effectiveDy,
                    })
                }
            } else if (s.mode === 'reorder' && s.parentId) {
                const viewport = viewportRef.current
                if (!viewport) return true

                const gapIndex = calculateInsertionGap(
                    clientX,
                    clientY,
                    s.parentId,
                    s.parentDirection,
                    viewport
                )

                if (gapIndex !== s.currentGapIndex) {
                    s.currentGapIndex = gapIndex
                    const indicator = calculateIndicatorPosition(
                        gapIndex,
                        s.parentId,
                        s.parentDirection,
                        viewport
                    )
                    setDragInfo({
                        isDragging: true,
                        mode: 'reorder',
                        indicator,
                        snapLines: [],
                    })
                }
            } else if (s.mode === 'grid-place' && s.parentId) {
                // Grid cell placement: detect which cell the pointer is over
                const viewport = viewportRef.current
                if (!viewport) return true

                const cell = getGridCellAtScreenPoint(clientX, clientY, s.parentId, viewport)
                if (cell && (cell.col !== s.gridCol || cell.row !== s.gridRow)) {
                    s.gridCol = cell.col
                    s.gridRow = cell.row
                    // Update grid highlight in store for overlay rendering
                    useEditorStore.getState().setGridHighlight(s.parentId, cell.col, cell.row)
                    setDragInfo({
                        isDragging: true,
                        mode: 'grid-place',
                        indicator: null,
                        snapLines: [],
                    })
                }
            }

            return true // consumed
        },
        [viewportRef]
    )

    // ── Pointer up (commit) ─────────────────────────────────────

    const onDragPointerUp = useCallback((): boolean => {
        const s = stateRef.current
        if (s.phase === 'idle') return false

        // Release pointer capture
        if (s.pointerId >= 0) {
            viewportRef.current?.releasePointerCapture(s.pointerId)
        }

        // Click without drag — commit click-intended selection
        // (but NOT if shift was held — shift-click adds/removes from selection)
        if (s.phase === 'pending' && !s.shiftHeld) {
            const store = useEditorStore.getState()
            if (store.selectedIds.length !== 1 || store.selectedIds[0] !== s.clickTargetId) {
                store.selectNode(s.clickTargetId, false)
            }
        }

        if (s.phase === 'dragging') {
            if (s.mode === 'reorder' && s.parentId) {
                // Commit reorder
                useEditorStore
                    .getState()
                    .reorderNode(s.nodeId, s.currentGapIndex)
            }

            if (s.mode === 'grid-place' && s.parentId) {
                // Commit grid cell placement — swap with any occupant
                const store = useEditorStore.getState()
                const parent = findNodeById(store.nodes, s.parentId) as FrameNode | undefined

                if (parent) {
                    // Find any child already occupying the target cell
                    const occupant = parent.children.find(c => {
                        if (c.id === s.nodeId) return false
                        // Check explicitly placed children
                        if (c.gridColumnStart === s.gridCol && c.gridRowStart === s.gridRow) return true
                        // Check auto-placed children (no explicit position) —
                        // their visual cell is determined by DOM order (index)
                        if (c.gridColumnStart == null && c.gridRowStart == null) {
                            const childIdx = parent.children.indexOf(c)
                            const colCount = parent.layout?.columnTracks?.length
                                ?? (typeof parent.layout?.columns === 'number' ? parent.layout.columns : 2)
                            const autoCol = (childIdx % colCount) + 1
                            const autoRow = Math.floor(childIdx / colCount) + 1
                            return autoCol === s.gridCol && autoRow === s.gridRow
                        }
                        return false
                    })

                    store.beginBatch()

                    if (occupant) {
                        // Swap: give the occupant the dragged node's original position
                        if (s.originalGridCol != null && s.originalGridRow != null) {
                            // Dragged node had explicit position — swap positions
                            store.updateNode(occupant.id, {
                                gridColumnStart: s.originalGridCol,
                                gridRowStart: s.originalGridRow,
                            })
                        } else {
                            // Dragged node was auto-placed — give occupant explicit
                            // position at the dragged node's original DOM-order cell
                            const draggedIdx = parent.children.findIndex(c => c.id === s.nodeId)
                            const colCount = parent.layout?.columnTracks?.length
                                ?? (typeof parent.layout?.columns === 'number' ? parent.layout.columns : 2)
                            const origAutoCol = (draggedIdx % colCount) + 1
                            const origAutoRow = Math.floor(draggedIdx / colCount) + 1
                            store.updateNode(occupant.id, {
                                gridColumnStart: origAutoCol,
                                gridRowStart: origAutoRow,
                            })
                        }
                    }

                    // Place the dragged node at the target cell
                    store.updateNode(s.nodeId, {
                        gridColumnStart: s.gridCol,
                        gridRowStart: s.gridRow,
                    })

                    store.endBatch()
                }

                // Clear grid highlight
                useEditorStore.getState().setGridHighlight(null)
            }

            // Freeform: check reparent (into frame) or un-reparent (to top level)
            if (s.mode === 'freeform') {
                // Collect all dragged node IDs (primary + additional)
                const allDraggedIds = [s.nodeId, ...s.additionalNodes.map(n => n.id)]

                // Build exclusion set once (all dragged nodes and their descendants)
                const excludeIds = new Set<string>()
                {
                    const snap = useEditorStore.getState()
                    for (const id of allDraggedIds) {
                        const n = findNodeById(snap.nodes, id)
                        if (n) {
                            for (const cid of collectNodeIds(n)) {
                                excludeIds.add(cid)
                            }
                        }
                    }
                }

                for (const draggedId of allDraggedIds) {
                    // Re-read fresh state each iteration (prior reparent may have changed tree)
                    const store = useEditorStore.getState()
                    const node = findNodeById(store.nodes, draggedId)
                    if (!node) continue

                    const canvasPos = getNodeCanvasPosition(store.nodes, draggedId)
                    if (!canvasPos) continue

                    const centerX = canvasPos.x + node.width / 2
                    const centerY = canvasPos.y + node.height / 2
                    const draggedRect: CanvasRect = {
                        x: canvasPos.x,
                        y: canvasPos.y,
                        width: node.width,
                        height: node.height,
                    }

                    const currentParent = findParentOfNode(store.nodes, draggedId)
                    const container = findContainingFrame(
                        store.nodes,
                        centerX,
                        centerY,
                        0,
                        0,
                        excludeIds,
                        REPARENT_INSET,
                        true,
                    )

                    if (container) {
                        const frameDropRect = getFrameDropRect(store.nodes, container.frameId)
                        const overlapArea = frameDropRect
                            ? getIntersectionArea(draggedRect, frameDropRect)
                            : 0
                        const draggedArea = Math.max(draggedRect.width * draggedRect.height, 1)
                        const overlapRatio = overlapArea / draggedArea
                        const shouldReparent = overlapRatio >= REPARENT_OVERLAP_THRESHOLD

                        // Dropped onto a frame interior — reparent if different from current parent
                        if (shouldReparent && container.frameId !== currentParent?.parent?.id) {
                            store.moveNodeToFrame(draggedId, container.frameId)
                        }
                    } else if (currentParent?.parent) {
                        // Dropped outside all frames but currently inside one → move to top level
                        store.moveNodeToTopLevel(draggedId)
                    }
                }
            }

            useEditorStore.getState().endBatch()
        }

        // Reset
        stateRef.current = { ...INITIAL_STATE }
        _isDragActive = false
        useEditorStore.getState().setGridHighlight(null)
        setDragInfo({ isDragging: false, mode: null, indicator: null, snapLines: [] })

        return true
    }, [viewportRef])

    // ── Cancel drag (Escape key) ────────────────────────────────

    const cancelDrag = useCallback(() => {
        const s = stateRef.current
        if (s.phase === 'idle') return

        // Release pointer capture
        if (s.pointerId >= 0) {
            viewportRef.current?.releasePointerCapture(s.pointerId)
        }

        if (s.phase === 'dragging' && s.mode === 'freeform') {
            // Restore original positions (primary + additional nodes)
            const store = useEditorStore.getState()
            store.updateNode(s.nodeId, {
                x: s.startNodeX,
                y: s.startNodeY,
            })
            for (const extra of s.additionalNodes) {
                store.updateNode(extra.id, {
                    x: extra.startX,
                    y: extra.startY,
                })
            }
        }
        // Reorder: nothing to undo since we haven't committed yet

        if (s.phase === 'dragging') {
            useEditorStore.getState().endBatch()
        }

        stateRef.current = { ...INITIAL_STATE }
        _isDragActive = false
        setDragInfo({ isDragging: false, mode: null, indicator: null, snapLines: [] })
    }, [viewportRef])

    // ── Escape key handler ──────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && stateRef.current.phase !== 'idle') {
                e.stopImmediatePropagation()
                cancelDrag()
            }
        }
        // Use capture phase to fire before page.tsx's handler
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [cancelDrag])

    return {
        dragInfo,
        startPotentialDrag,
        onDragPointerMove,
        onDragPointerUp,
        cancelDrag,
    }
}
