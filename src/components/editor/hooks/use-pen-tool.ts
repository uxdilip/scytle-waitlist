import { useCallback, useRef } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { createVector, findNodeById } from '@/types/canvas'
import type { VectorVertex, VectorSegment, VectorNode } from '@/types/canvas'

/** Screen-space distance (px) within which pen tool clicks "hit" an existing segment */
const SEGMENT_HIT_THRESHOLD_PX = 8

/** Screen-space distance (px) within which pen tool clicks "hit" an existing vertex */
const VERTEX_HIT_THRESHOLD_PX = 8

/** Constrain a point to the nearest 45° angle relative to an origin */
function constrainTo45(origin: { x: number; y: number }, point: { x: number; y: number }): { x: number; y: number } {
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return point
    const angle = Math.atan2(dy, dx)
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    return {
        x: origin.x + dist * Math.cos(snapped),
        y: origin.y + dist * Math.sin(snapped),
    }
}

/** Snap threshold in screen pixels — cursor snaps to alignment within this distance */
const ALIGN_SNAP_THRESHOLD_PX = 6

/** Screen-space distance (px) within which cursor "snaps" to close the path */
const CLOSE_THRESHOLD_PX = 8

/** Minimum drag distance (px) to trigger bezier handle creation */
const DRAG_THRESHOLD_PX = 3

/**
 * Find the closest segment across all vector nodes to a screen-space point.
 * Returns the node, segment index, parameter t, and screen distance.
 */
function findClosestSegmentHit(
    screenX: number,
    screenY: number,
    store: ReturnType<typeof useEditorStore.getState>,
): { nodeId: string; segIdx: number; t: number; dist: number } | null {
    const { nodes, zoom, panX, panY } = store
    let best: { nodeId: string; segIdx: number; t: number; dist: number } | null = null

    for (const n of nodes) {
        if (n.type !== 'vector') continue
        const vn = (n as VectorNode).vectorNetwork
        const nx = n.x
        const ny = n.y
        const toScreen = (vx: number, vy: number) => ({
            x: (nx + vx) * zoom + panX,
            y: (ny + vy) * zoom + panY,
        })

        for (let si = 0; si < vn.segments.length; si++) {
            const seg = vn.segments[si]
            const sv = vn.vertices[seg.start]
            const ev = vn.vertices[seg.end]
            if (!sv || !ev) continue

            const ts = seg.tangentStart ?? { x: 0, y: 0 }
            const te = seg.tangentEnd ?? { x: 0, y: 0 }
            const p0 = toScreen(sv.x, sv.y)
            const cp1 = toScreen(sv.x + ts.x, sv.y + ts.y)
            const cp2 = toScreen(ev.x + te.x, ev.y + te.y)
            const p3 = toScreen(ev.x, ev.y)

            // Find closest t on this bezier
            const steps = 50
            let bestT = 0
            let bestDist = Infinity
            for (let i = 0; i <= steps; i++) {
                const t = i / steps
                const mt = 1 - t
                const bx = mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p3.x
                const by = mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p3.y
                const d = Math.sqrt((bx - screenX) ** 2 + (by - screenY) ** 2)
                if (d < bestDist) { bestDist = d; bestT = t }
            }

            if (!best || bestDist < best.dist) {
                best = { nodeId: n.id, segIdx: si, t: bestT, dist: bestDist }
            }
        }
    }

    return best
}

/**
 * Find the closest vertex across all vector nodes to a screen-space point.
 * Returns the node, vertex index, and screen distance.
 */
function findClosestVertexHit(
    screenX: number,
    screenY: number,
    store: ReturnType<typeof useEditorStore.getState>,
): { nodeId: string; vertexIdx: number; dist: number; canvasPos: { x: number; y: number } } | null {
    const { nodes, zoom, panX, panY } = store
    let best: { nodeId: string; vertexIdx: number; dist: number; canvasPos: { x: number; y: number } } | null = null

    for (const n of nodes) {
        if (n.type !== 'vector') continue
        const vn = (n as VectorNode).vectorNetwork
        for (let vi = 0; vi < vn.vertices.length; vi++) {
            const v = vn.vertices[vi]
            const sx = (n.x + v.x) * zoom + panX
            const sy = (n.y + v.y) * zoom + panY
            const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2)
            if (!best || d < best.dist) {
                best = { nodeId: n.id, vertexIdx: vi, dist: d, canvasPos: { x: n.x + v.x, y: n.y + v.y } }
            }
        }
    }

    return best
}

/** State tracked between pointerdown and pointerup during a single click-drag */
interface DragState {
    /** Canvas position where the pointerdown occurred */
    anchorPos: { x: number; y: number }
    /** Whether this pointerdown started a brand-new drawing (first vertex) */
    isFirstVertex: boolean
    /** Index of the vertex placed at pointerdown */
    vertexIndex: number
    /** Whether drag threshold has been exceeded (bezier mode) */
    isDragging: boolean
}

/**
 * Hook that encapsulates Pen tool pointer interactions.
 *
 * Supports:
 *  - Click to place straight-line anchor points
 *  - Click+drag to create bezier curve handles (tangentStart/tangentEnd)
 *  - Click near start vertex (≥3 vertices) to close the path
 *
 * Usage in canvas.tsx:
 *   const { handlePenPointerDown, handlePenPointerMove, handlePenPointerUp } = usePenTool(screenToCanvas)
 *
 *   // in handlePointerDown: if (activeTool === 'pen') { handlePenPointerDown(e); return }
 *   // in handlePointerMove: if (activeTool === 'pen') handlePenPointerMove(e.clientX, e.clientY)
 *   // in handlePointerUp:   if (activeTool === 'pen') handlePenPointerUp()
 */
export function usePenTool(
    screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number },
) {
    const dragRef = useRef<DragState | null>(null)
    /** Tracks the nodeId of the last committed (closed) path — so Enter/Esc can select it */
    const lastCommittedNodeIdRef = useRef<string | null>(null)

    /**
     * Left-click on canvas while pen tool is active.
     * First click: creates a VectorNode + initializes drawing state.
     * Subsequent clicks: appends a vertex + segment.
     * Click near start vertex (with >= 3 vertices): closes the path.
     *
     * The actual tangent handle computation happens in pointerup (after drag).
     */
    const handlePenPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (e.button !== 0) return

            const store = useEditorStore.getState()
            const pos = screenToCanvas(e.clientX, e.clientY)
            const ps = store.penDrawingState

            // ── Alt+click: retract outgoing handle ──
            if (e.altKey && ps && ps._outgoingTangent) {
                store.setPenDrawingState({
                    ...ps,
                    _outgoingTangent: undefined,
                })
                e.preventDefault()
                return
            }

            // ── Shift: constrain to 45° relative to last vertex ──
            let constrainedPos = pos
            if (e.shiftKey && ps && ps.vertices.length > 0) {
                const lastV = ps.vertices[ps.vertices.length - 1]
                constrainedPos = constrainTo45(lastV, pos)
            }

            // ── Extend mode: click near segment/vertex → insert + connect with a line ──
            if (ps && ps._extendFromVertexIndex != null && ps.vertices.length === 1 && ps.segments.length === 0) {
                const containerRect = (e.currentTarget as HTMLElement)?.closest?.('[data-canvas-viewport]')?.getBoundingClientRect()
                    ?? (e.currentTarget as HTMLElement)?.getBoundingClientRect()
                const screenX = e.clientX - (containerRect?.left ?? 0)
                const screenY = e.clientY - (containerRect?.top ?? 0)

                // Check vertex hit first — connect directly to existing vertex
                const vertexHit = findClosestVertexHit(screenX, screenY, store)
                if (vertexHit && vertexHit.dist < VERTEX_HIT_THRESHOLD_PX && vertexHit.nodeId === ps.nodeId) {
                    e.preventDefault()
                    // Snap to the existing vertex position — add it as vertex[1] and a connecting segment
                    const newIdx = ps.vertices.length
                    const newVertex: VectorVertex = { x: vertexHit.canvasPos.x, y: vertexHit.canvasPos.y }
                    const newSegment: VectorSegment = {
                        start: newIdx - 1,
                        end: newIdx,
                        ...(ps._outgoingTangent ? { tangentStart: ps._outgoingTangent } : {}),
                    }
                    // Commit immediately — this creates a line from extend vertex to target vertex
                    store.setPenDrawingState({
                        ...ps,
                        vertices: [...ps.vertices, newVertex],
                        segments: [...ps.segments, newSegment],
                        _outgoingTangent: undefined,
                        // Override extend target: the second vertex maps to vertexHit.vertexIdx
                        _extendToVertexIndex: vertexHit.vertexIdx,
                    } as typeof ps)
                    store.commitPenPath()
                    lastCommittedNodeIdRef.current = ps.nodeId
                    dragRef.current = null
                    return
                }

                // Check segment hit — insert point on segment, then connect with a line
                const hit = findClosestSegmentHit(screenX, screenY, store)
                if (hit && hit.dist < SEGMENT_HIT_THRESHOLD_PX && hit.nodeId === ps.nodeId) {
                    e.preventDefault()
                    const extendFromIdx = ps._extendFromVertexIndex!
                    const outgoingTangent = ps._outgoingTangent
                    const hitNodeId = hit.nodeId
                    // First: insert the point on the segment (this modifies the vector network inside immer)
                    store.insertPointOnSegment(hitNodeId, hit.segIdx, hit.t)
                    // Now add the connecting segment and set up new extend — must use set() for immer
                    useEditorStore.setState((state) => {
                        const node = findNodeById(state.nodes, hitNodeId) as VectorNode | null
                        if (!node) return
                        const insertedVertIdx = node.vectorNetwork.vertices.length - 1
                        const insertedVert = node.vectorNetwork.vertices[insertedVertIdx]
                        // Add segment from original extend vertex → newly inserted vertex
                        node.vectorNetwork.segments.push({
                            start: extendFromIdx,
                            end: insertedVertIdx,
                            ...(outgoingTangent ? { tangentStart: outgoingTangent } : {}),
                        })
                        // Start a new extend from the inserted point
                        const absX = node.x + insertedVert.x
                        const absY = node.y + insertedVert.y
                        state.penDrawingState = {
                            nodeId: hitNodeId,
                            vertices: [{ x: absX, y: absY }],
                            segments: [],
                            isDrawing: true,
                            cursorX: absX,
                            cursorY: absY,
                            nearStartPoint: false,
                            _extendFromVertexIndex: insertedVertIdx,
                        }
                    })
                    dragRef.current = null
                    return
                }
                // If not near segment/vertex, fall through to normal append logic below
            } else if (ps && ps._extendFromVertexIndex != null) {
                // Has _extendFromVertexIndex but conditions not met — skip extend mode
            }

            // ── Click near existing segment → insert anchor point ──
            // Works when not drawing, or when only 1 vertex placed (no edges yet)
            if (!ps || (ps && ps.vertices.length <= 1 && ps.segments.length === 0 && ps._extendFromVertexIndex == null)) {
                // Get the container offset for screen-space hit detection
                const containerRect = (e.currentTarget as HTMLElement)?.closest?.('[data-canvas-viewport]')?.getBoundingClientRect()
                    ?? (e.currentTarget as HTMLElement)?.getBoundingClientRect()
                const screenX = e.clientX - (containerRect?.left ?? 0)
                const screenY = e.clientY - (containerRect?.top ?? 0)

                // ── Click near existing vertex → start extending from that vertex ──
                const vertexHit = findClosestVertexHit(screenX, screenY, store)
                if (vertexHit && vertexHit.dist < VERTEX_HIT_THRESHOLD_PX) {
                    e.preventDefault()
                    // If we had a 1-vertex pen node with no edges, clean it up
                    // BUT NOT if it's an extend-from-vertex (that nodeId is the original shape!)
                    if (ps && ps.vertices.length <= 1 && ps._extendFromVertexIndex == null) {
                        store.deleteNode(ps.nodeId)
                        store.setPenDrawingState(null)
                    } else if (ps && ps._extendFromVertexIndex != null) {
                        store.setPenDrawingState(null)
                    }
                    // Start drawing from the existing vertex — create penDrawingState
                    // with vertex[0] being a copy of the clicked vertex. On commit,
                    // new vertices/segments merge into the existing vector network.
                    const vertex: VectorVertex = { x: vertexHit.canvasPos.x, y: vertexHit.canvasPos.y }
                    store.setPenDrawingState({
                        nodeId: vertexHit.nodeId,
                        vertices: [vertex],
                        segments: [],
                        isDrawing: true,
                        cursorX: vertexHit.canvasPos.x,
                        cursorY: vertexHit.canvasPos.y,
                        nearStartPoint: false,
                        _extendFromVertexIndex: vertexHit.vertexIdx,
                    })
                    dragRef.current = {
                        anchorPos: vertexHit.canvasPos,
                        isFirstVertex: true,
                        vertexIndex: 0,
                        isDragging: false,
                    }
                    return
                }

                const hit = findClosestSegmentHit(screenX, screenY, store)
                if (hit && hit.dist < SEGMENT_HIT_THRESHOLD_PX) {
                    e.preventDefault()
                    // If we had a 1-vertex pen node with no edges, clean it up
                    // BUT NOT if it's an extend-from-vertex (that nodeId is the original shape!)
                    if (ps && ps.vertices.length <= 1 && ps._extendFromVertexIndex == null) {
                        store.deleteNode(ps.nodeId)
                        store.setPenDrawingState(null)
                    } else if (ps && ps._extendFromVertexIndex != null) {
                        store.setPenDrawingState(null)
                    }
                    store.insertPointOnSegment(hit.nodeId, hit.segIdx, hit.t)
                    return
                }
            }

            if (!ps) {
                // ── First click — create a VectorNode and start drawing ──
                const vectorNode = createVector({ x: 0, y: 0 })
                store.addNode(vectorNode)
                // Don't select the node while drawing — it has zero size and
                // selecting it would show a stray selection box on the canvas.
                // Selection happens after commitPenPath().

                const vertex: VectorVertex = { x: constrainedPos.x, y: constrainedPos.y }
                store.setPenDrawingState({
                    nodeId: vectorNode.id,
                    vertices: [vertex],
                    segments: [],
                    isDrawing: true,
                    cursorX: constrainedPos.x,
                    cursorY: constrainedPos.y,
                    nearStartPoint: false,
                })

                dragRef.current = {
                    anchorPos: constrainedPos,
                    isFirstVertex: true,
                    vertexIndex: 0,
                    isDragging: false,
                }
            } else {
                // ── Close path when near start vertex ──
                if (ps.nearStartPoint && ps.vertices.length >= 3) {
                    const nodeId = ps.nodeId // capture before commit nulls state
                    const lastIdx = ps.vertices.length - 1
                    const closingSegment: VectorSegment = {
                        start: lastIdx,
                        end: 0,
                        ...(ps._outgoingTangent ? { tangentStart: ps._outgoingTangent } : {}),
                        ...(ps._firstVertexIncomingTangent ? { tangentEnd: ps._firstVertexIncomingTangent } : {}),
                    }
                    store.setPenDrawingState({
                        ...ps,
                        segments: [...ps.segments, closingSegment],
                        nearStartPoint: true,
                    })
                    store.commitPenPath()
                    // Remember the committed node so Enter/Esc can show the selection frame
                    lastCommittedNodeIdRef.current = nodeId
                    dragRef.current = null
                    return
                }

                // ── Normal click — append vertex + connecting segment ──
                const newIdx = ps.vertices.length
                const newVertex: VectorVertex = { x: constrainedPos.x, y: constrainedPos.y }
                const newSegment: VectorSegment = {
                    start: newIdx - 1,
                    end: newIdx,
                    // Carry forward outgoing tangent from previous vertex's drag
                    ...(ps._outgoingTangent ? { tangentStart: ps._outgoingTangent } : {}),
                }

                store.setPenDrawingState({
                    ...ps,
                    vertices: [...ps.vertices, newVertex],
                    segments: [...ps.segments, newSegment],
                    cursorX: constrainedPos.x,
                    cursorY: constrainedPos.y,
                    nearStartPoint: false,
                    _outgoingTangent: undefined, // consumed
                })

                dragRef.current = {
                    anchorPos: constrainedPos,
                    isFirstVertex: false,
                    vertexIndex: newIdx,
                    isDragging: false,
                }
            }

            e.preventDefault()
        },
        [screenToCanvas],
    )

    /**
     * Pointer move while pen tool is active.
     *
     * When dragging (pointerdown held): computes bezier tangent handles.
     * When not dragging: updates cursor position and nearStartPoint.
     */
    const handlePenPointerMove = useCallback(
        (clientX: number, clientY: number, shiftKey?: boolean, altKey?: boolean) => {
            const store = useEditorStore.getState()
            const ps = store.penDrawingState
            if (!ps) return

            const pos = screenToCanvas(clientX, clientY)
            const drag = dragRef.current

            if (drag) {
                // ── Dragging — compute tangent handles in real-time ──
                const dx = pos.x - drag.anchorPos.x
                const dy = pos.y - drag.anchorPos.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist > DRAG_THRESHOLD_PX / store.zoom) {
                    drag.isDragging = true

                    // Tangent = offset from anchor vertex to cursor
                    const tangent = {
                        x: pos.x - drag.anchorPos.x,
                        y: pos.y - drag.anchorPos.y,
                    }

                    // Shift: constrain tangent angle to 45° increments
                    let constrainedTangent = tangent
                    if (shiftKey) {
                        const tDist = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y)
                        const tAngle = Math.atan2(tangent.y, tangent.x)
                        const snapped = Math.round(tAngle / (Math.PI / 4)) * (Math.PI / 4)
                        constrainedTangent = {
                            x: tDist * Math.cos(snapped),
                            y: tDist * Math.sin(snapped),
                        }
                    }

                    // Update the vertex's mirroring
                    const updatedVertices = [...ps.vertices]

                    // Update the segment that ARRIVES at this vertex (tangentEnd)
                    // The tangent we set is the "outgoing" handle — the mirrored handle
                    // will be the "incoming" tangentEnd on the preceding segment.
                    const updatedSegments = [...ps.segments]

                    if (altKey) {
                        // Alt: break mirroring — only outgoing handle moves
                        updatedVertices[drag.vertexIndex] = {
                            ...updatedVertices[drag.vertexIndex],
                            handleMirroring: 'NONE',
                        }
                        // Don't update the incoming tangentEnd on preceding segment
                    } else {
                        updatedVertices[drag.vertexIndex] = {
                            ...updatedVertices[drag.vertexIndex],
                            handleMirroring: 'ANGLE_AND_LENGTH',
                        }
                        // Set mirrored tangentEnd on preceding segment (existing logic)
                        if (!drag.isFirstVertex && updatedSegments.length > 0) {
                            const prevSegIdx = updatedSegments.length - 1
                            updatedSegments[prevSegIdx] = {
                                ...updatedSegments[prevSegIdx],
                                tangentEnd: { x: -constrainedTangent.x, y: -constrainedTangent.y },
                            }
                        }
                    }

                    // For first vertex, store the mirrored handle for later use when closing
                    const firstVertexUpdate = drag.isFirstVertex
                        ? { _firstVertexIncomingTangent: { x: -constrainedTangent.x, y: -constrainedTangent.y } }
                        : {}

                    store.setPenDrawingState({
                        ...ps,
                        vertices: updatedVertices,
                        segments: updatedSegments,
                        cursorX: pos.x,
                        cursorY: pos.y,
                        // Store the outgoing tangent on the drawing state so the
                        // next segment can use it as tangentStart
                        _outgoingTangent: constrainedTangent,
                        _alignGuides: undefined,
                        ...firstVertexUpdate,
                    } as typeof ps)
                    return
                }
            }

            // ── Normal move (no drag) — update cursor + close detection + alignment guides ──
            const startV = ps.vertices[0]
            const sdx = pos.x - startV.x
            const sdy = pos.y - startV.y
            const distCanvas = Math.sqrt(sdx * sdx + sdy * sdy)
            const nearStart = ps.vertices.length >= 3 && distCanvas < CLOSE_THRESHOLD_PX / store.zoom

            // ── Alignment guide detection: snap cursor to X/Y of existing vertices ──
            const snapThreshold = ALIGN_SNAP_THRESHOLD_PX / store.zoom
            let snappedX = pos.x
            let snappedY = pos.y
            const guides: Array<{ axis: 'x' | 'y'; value: number; vertexX: number; vertexY: number }> = []

            if (ps.vertices.length >= 1) {
                const allTargets = ps.vertices
                let bestDx = snapThreshold + 1
                let bestDy = snapThreshold + 1
                let bestVxForX: { x: number; y: number } | null = null
                let bestVxForY: { x: number; y: number } | null = null

                for (const v of allTargets) {
                    const dx = Math.abs(pos.x - v.x)
                    const dy = Math.abs(pos.y - v.y)
                    if (dx < snapThreshold && dx < bestDx) {
                        bestDx = dx
                        snappedX = v.x
                        bestVxForX = v
                    }
                    if (dy < snapThreshold && dy < bestDy) {
                        bestDy = dy
                        snappedY = v.y
                        bestVxForY = v
                    }
                }

                // Record guides for snapped axes — store the source vertex so we can draw the guide line
                if (bestDx <= snapThreshold && bestVxForX) {
                    guides.push({ axis: 'x', value: snappedX, vertexX: bestVxForX.x, vertexY: bestVxForX.y })
                }
                if (bestDy <= snapThreshold && bestVxForY) {
                    guides.push({ axis: 'y', value: snappedY, vertexX: bestVxForY.x, vertexY: bestVxForY.y })
                }
            }

            store.setPenDrawingState({
                ...ps,
                cursorX: snappedX,
                cursorY: snappedY,
                nearStartPoint: nearStart,
                _alignGuides: guides.length > 0 ? guides : undefined,
            })
        },
        [screenToCanvas],
    )

    /**
     * Pointer up — finalizes the drag gesture.
     *
     * If the user dragged past the threshold, the tangent handles are already
     * set via handlePenPointerMove. We record the outgoing tangent so the
     * NEXT segment placed will use it as its tangentStart.
     */
    const handlePenPointerUp = useCallback(() => {
        const drag = dragRef.current
        if (!drag) return

        if (drag.isDragging) {
            // The outgoing tangent was stored during pointermove.
            // It will be picked up when the next segment is created.
            // Nothing else to do — state is already up-to-date.
        }

        dragRef.current = null
    }, [])

    /**
     * Keyboard handler for pen tool.
     * - Escape/Enter: end drawing and commit open path (or clean up if < 2 vertices)
     *   Also handles the case where path was already closed via click (ps is null but
     *   lastCommittedNodeIdRef holds the nodeId) — Enter/Esc should switch to select.
     * - Backspace/Delete: remove the last placed vertex
     */
    const handlePenKeyDown = useCallback((e: KeyboardEvent) => {
        const store = useEditorStore.getState()
        const ps = store.penDrawingState

        // ── Path already committed via click-to-close (ps is null) ──
        // Enter or Escape while pen is still active should show selection frame
        if (!ps) {
            const committedId = lastCommittedNodeIdRef.current
            if (committedId && (e.key === 'Enter' || e.key === 'Escape')) {
                e.preventDefault()
                e.stopPropagation()
                store.setActiveTool('select')
                useEditorStore.setState({ selectedIds: [committedId] })
                lastCommittedNodeIdRef.current = null
            }
            return
        }

        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            let committedNodeId: string | null = null
            if (ps.vertices.length >= 2) {
                committedNodeId = ps.nodeId
                store.commitPenPath()
            } else {
                store.deleteNode(ps.nodeId)
                store.setPenDrawingState(null)
            }
            // Switch to select and show selection frame
            store.setActiveTool('select')
            if (committedNodeId) {
                useEditorStore.setState({ selectedIds: [committedNodeId] })
            }
            dragRef.current = null
        }

        if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            const nodeId = ps.nodeId
            if (ps.vertices.length >= 2) {
                store.commitPenPath()
            } else {
                store.deleteNode(nodeId)
                store.setPenDrawingState(null)
            }
            // Enter: switch to select tool and show selection frame
            store.setActiveTool('select')
            useEditorStore.setState({ selectedIds: [nodeId] })
            lastCommittedNodeIdRef.current = null
            dragRef.current = null
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault()
            e.stopPropagation()
            if (ps.vertices.length <= 1) {
                // Remove the whole path
                store.deleteNode(ps.nodeId)
                store.setPenDrawingState(null)
                dragRef.current = null
            } else {
                // Remove last vertex and its segment
                const newVertices = ps.vertices.slice(0, -1)
                const newSegments = ps.segments.slice(0, -1)
                store.setPenDrawingState({
                    ...ps,
                    vertices: newVertices,
                    segments: newSegments,
                    _outgoingTangent: undefined,
                })
            }
        }
    }, [])

    return { handlePenPointerDown, handlePenPointerMove, handlePenPointerUp, handlePenKeyDown }
}
