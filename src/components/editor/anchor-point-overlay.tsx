'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { VectorEditTool } from '@/store/editor-store'
import { findNodeById } from '@/types/canvas'
import type { VectorNode, VectorVertex, VectorSegment } from '@/types/canvas'

const ANCHOR_SIZE = 7
const HANDLE_R = 4
const BLUE = '#3b82f6'
const WHITE = '#ffffff'
const SEGMENT_HIT_WIDTH = 12 // px — invisible fat stroke for click target
const CORNER_HANDLE_SIZE = 8
const EDGE_HIT = 8

// Water-drop SVG cursor for the paint tool
const PAINT_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'%3E%3Cpath fill='%23ffffff' stroke='%23000000' stroke-width='1.5' d='M12 2C6 9 4 13 4 16a8 8 0 0 0 16 0c0-3-2-7-8-14z'/%3E%3C/svg%3E") 10 18, crosshair`

type BBoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'body'

/** State tracked during a vertex/handle drag */
interface DragInfo {
    type: 'vertex' | 'tangent-start' | 'tangent-end'
    /** Index of the vertex or segment being dragged */
    index: number
    /** Canvas-space position at drag start */
    startCanvasX: number
    startCanvasY: number
    /** Original position of the item being dragged */
    origX: number
    origY: number
    /** Original positions of all selected vertices at drag start (for multi-vertex drag) */
    origPositions?: Map<number, { x: number; y: number }>
}

/** Point in 2D space */
interface Pt { x: number; y: number }

/** Ray-casting point-in-polygon test */
function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y
        const xj = poly[j].x, yj = poly[j].y
        const intersect = yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
        if (intersect) inside = !inside
    }
    return inside
}

/**
 * Given a bezier segment, compute ~20 sample points along the curve
 * so we can find the closest point for bend-drag and cut-on-segment.
 */
function sampleBezier(p0: Pt, cp1: Pt, cp2: Pt, p1: Pt, steps = 20): Pt[] {
    const pts: Pt[] = []
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        pts.push({
            x: mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p1.x,
            y: mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p1.y,
        })
    }
    return pts
}

/** Find t parameter on a bezier segment closest to a given screen point */
function closestTOnSegment(
    screenPt: Pt,
    p0: Pt, cp1: Pt, cp2: Pt, p1: Pt,
    steps = 50,
): number {
    let bestT = 0
    let bestDist = Infinity
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x = mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p1.x
        const y = mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p1.y
        const d = (x - screenPt.x) ** 2 + (y - screenPt.y) ** 2
        if (d < bestDist) { bestDist = d; bestT = t }
    }
    return bestT
}

/**
 * AnchorPointOverlay — renders interactive anchor points, bezier handles,
 * and segment hit targets for vector edit mode.
 *
 * Supports:
 *  - **Move tool**: drag vertices to reposition, drag handles to reshape curves
 *  - **Bend tool**: click straight segment → add bezier handles; click smooth→corner toggle
 *  - **Cut tool**: click vertex → split path at that point
 *  - All tools: click vertex to select (Shift to add)
 */
export const AnchorPointOverlay = memo(function AnchorPointOverlay() {
    const vectorEditNodeId = useEditorStore((s) => s.vectorEditNodeId)
    const vectorEditTool = useEditorStore((s) => s.vectorEditTool)
    const selectedVertexIndices = useEditorStore((s) => s.selectedVertexIndices)
    const activeTool = useEditorStore((s) => s.activeTool)
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)
    const nodes = useEditorStore((s) => s.nodes)

    const dragRef = useRef<DragInfo | null>(null)
    // Ref to the SVG root to get bounding rect for coordinate conversion
    const svgRef = useRef<SVGSVGElement | null>(null)
    // Lasso tool state — container-relative polygon being drawn
    const [lassoPoints, setLassoPoints] = useState<Pt[]>([])

    // Clear lasso state when switching to a different vector node
    useEffect(() => {
        setLassoPoints([])
    }, [vectorEditNodeId])

    // ── Helpers ──────────────────────────────────────────────

    const screenToCanvas = useCallback(
        (clientX: number, clientY: number) => {
            const rect = svgRef.current?.closest('[data-canvas-viewport]')?.getBoundingClientRect()
                ?? svgRef.current?.getBoundingClientRect()
            const offsetX = rect?.left ?? 0
            const offsetY = rect?.top ?? 0
            return {
                x: (clientX - offsetX - panX) / zoom,
                y: (clientY - offsetY - panY) / zoom,
            }
        },
        [zoom, panX, panY],
    )

    // ── Lasso tool: freeform vertex selection ───────────────

    const handleLassoPointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.stopPropagation()
            e.preventDefault()
            const additive = e.shiftKey

            // Get the canvas container offset so we can store container-relative coords
            const containerRect = svgRef.current?.closest('[data-canvas-viewport]')?.getBoundingClientRect()
                ?? svgRef.current?.getBoundingClientRect()
            const offsetX = containerRect?.left ?? 0
            const offsetY = containerRect?.top ?? 0

            const startPt = { x: e.clientX - offsetX, y: e.clientY - offsetY }
            setLassoPoints([startPt])

            const onMove = (me: PointerEvent) => {
                setLassoPoints((prev) => [...prev, { x: me.clientX - offsetX, y: me.clientY - offsetY }])
            }

            const onUp = (ue: PointerEvent) => {
                window.removeEventListener('pointermove', onMove, true)
                window.removeEventListener('pointerup', onUp, true)

                // Collect final polygon snapshot synchronously via ref, then clear lasso
                setLassoPoints((finalPoly) => {
                    // Schedule the selection update outside of setState to avoid setState-in-render
                    if (finalPoly.length >= 3) {
                        setTimeout(() => {
                            const st = useEditorStore.getState()
                            const nodeId = st.vectorEditNodeId
                            if (!nodeId) return
                            const node = findNodeById(st.nodes, nodeId) as VectorNode | null
                            if (!node) return

                            const z = st.zoom
                            const px = st.panX
                            const py = st.panY
                            // Vertex screen positions are also container-relative (same space as lasso)
                            const inside: number[] = []
                            node.vectorNetwork.vertices.forEach((v, vi) => {
                                const sx = (node.x + v.x) * z + px
                                const sy = (node.y + v.y) * z + py
                                if (pointInPolygon({ x: sx, y: sy }, finalPoly)) {
                                    inside.push(vi)
                                }
                            })
                            if (inside.length > 0) {
                                st.selectVertices(inside, additive)
                                // Auto-switch to move tool so user can drag selected vertices
                                st.setVectorEditTool('move')
                            } else if (!additive) {
                                st.deselectVertices()
                            }
                        }, 0)
                    }
                    return []
                })
            }

            // Use CAPTURE phase (true) so events arrive before canvas steals pointer capture
            window.addEventListener('pointermove', onMove, true)
            window.addEventListener('pointerup', onUp, true)
        },
        [],
    )

    // ── Paint tool: click to toggle fill on closed region ───

    const handlePaintClick = useCallback(
        (e: React.PointerEvent) => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()

            const containerRect = svgRef.current?.closest('[data-canvas-viewport]')?.getBoundingClientRect()
                ?? svgRef.current?.getBoundingClientRect()
            const offsetX = containerRect?.left ?? 0
            const offsetY = containerRect?.top ?? 0
            // Click position in canvas space (absolute)
            const canvasX = (e.clientX - offsetX - store.panX) / store.zoom
            const canvasY = (e.clientY - offsetY - store.panY) / store.zoom

            // Helper: check if click is inside a vector node's closed loops
            const applyPaintToNode = (nodeId: string, targetNode: VectorNode) => {
                const vn = targetNode.vectorNetwork
                const cx = canvasX - targetNode.x
                const cy = canvasY - targetNode.y

                const adj = new Map<number, { neighbor: number; segIdx: number }[]>()
                vn.segments.forEach((seg, si) => {
                    if (!adj.has(seg.start)) adj.set(seg.start, [])
                    if (!adj.has(seg.end)) adj.set(seg.end, [])
                    adj.get(seg.start)!.push({ neighbor: seg.end, segIdx: si })
                    adj.get(seg.end)!.push({ neighbor: seg.start, segIdx: si })
                })

                const visited = new Set<string>()
                const loops: number[][] = []
                const dfs = (path: number[], startIdx: number) => {
                    const cur = path[path.length - 1]
                    const neighbors = adj.get(cur) ?? []
                    for (const { neighbor } of neighbors) {
                        if (neighbor === startIdx && path.length >= 3) { loops.push([...path]); continue }
                        if (path.includes(neighbor)) continue
                        const key = [...path, neighbor].sort((a, b) => a - b).join(',')
                        if (visited.has(key)) continue
                        visited.add(key)
                        path.push(neighbor)
                        dfs(path, startIdx)
                        path.pop()
                    }
                }
                for (const startIdx of adj.keys()) dfs([startIdx], startIdx)

                let bestLoop: number[] | null = null
                let bestArea = Infinity
                for (const loop of loops) {
                    const poly = loop.map((vi) => {
                        const v = vn.vertices[vi]
                        return v ? { x: v.x, y: v.y } : null
                    }).filter(Boolean) as Pt[]
                    if (poly.length < 3) continue
                    if (!pointInPolygon({ x: cx, y: cy }, poly)) continue
                    let area = 0
                    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                        area += poly[j].x * poly[i].y - poly[i].x * poly[j].y
                    }
                    area = Math.abs(area) / 2
                    if (area < bestArea) { bestArea = area; bestLoop = loop }
                }

                if (!bestLoop) return false

                // Switch active node if needed
                if (nodeId !== store.vectorEditNodeId) {
                    store.enterVectorEditMode(nodeId)
                    store.setVectorEditTool('paint')
                }

                const hasFill = targetNode.fills.length > 0 && targetNode.fills.some((f) => (f.opacity ?? 1) > 0)
                store.updateNode(nodeId, {
                    fills: hasFill
                        ? targetNode.fills.map((f) => ({ ...f, opacity: 0 }))
                        : [{ type: 'solid' as const, color: '#808080', opacity: 1 }],
                })
                return true
            }

            // Try active node first
            const activeNode = findNodeById(store.nodes, store.vectorEditNodeId ?? '') as VectorNode | null
            if (activeNode && activeNode.type === 'vector') {
                if (applyPaintToNode(activeNode.id, activeNode)) return
            }

            // Try all other vector nodes
            for (const n of store.nodes) {
                if (n.type === 'vector' && n.id !== store.vectorEditNodeId) {
                    if (applyPaintToNode(n.id, n as VectorNode)) return
                }
            }
        },
        [],
    )

    // ── Bend tool: click+drag segment to shape curve ────────

    const handleBendSegmentPointerDown = useCallback(
        (e: React.PointerEvent, segIdx: number) => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()
            if (store.vectorEditTool !== 'bend' || !store.vectorEditNodeId) return
            const node = findNodeById(store.nodes, store.vectorEditNodeId) as VectorNode | null
            if (!node) return
            const seg = node.vectorNetwork.segments[segIdx]
            if (!seg) return

            const startV = node.vectorNetwork.vertices[seg.start]
            const endV = node.vectorNetwork.vertices[seg.end]
            if (!startV || !endV) return

            store.beginBatch()

            // If segment is straight, add default curve handles first
            const ts = seg.tangentStart ?? { x: 0, y: 0 }
            const te = seg.tangentEnd ?? { x: 0, y: 0 }
            const wasStraight = ts.x === 0 && ts.y === 0 && te.x === 0 && te.y === 0
            if (wasStraight) {
                const dx = endV.x - startV.x
                const dy = endV.y - startV.y
                const updatedSegs = [...node.vectorNetwork.segments]
                updatedSegs[segIdx] = {
                    ...seg,
                    tangentStart: { x: dx / 3, y: dy / 3 },
                    tangentEnd: { x: -dx / 3, y: -dy / 3 },
                }
                store.updateVectorNetwork(store.vectorEditNodeId, {
                    ...node.vectorNetwork,
                    segments: updatedSegs,
                })
            }

            // Track drag: adjust the midpoint of the curve perpendicular to segment
            const startClient = { x: e.clientX, y: e.clientY }
            let didDrag = false

            const onMove = (me: PointerEvent) => {
                const distSq = (me.clientX - startClient.x) ** 2 + (me.clientY - startClient.y) ** 2
                if (distSq < 4) return // ignore tiny jitter
                didDrag = true

                const st = useEditorStore.getState()
                const nId = st.vectorEditNodeId
                if (!nId) return
                const n = findNodeById(st.nodes, nId) as VectorNode | null
                if (!n) return
                const s = n.vectorNetwork.segments[segIdx]
                if (!s) return
                const sv = n.vectorNetwork.vertices[s.start]
                const ev = n.vectorNetwork.vertices[s.end]
                if (!sv || !ev) return

                // Delta in canvas space
                const dx = (me.clientX - startClient.x) / st.zoom
                const dy = (me.clientY - startClient.y) / st.zoom

                // Segment direction vector (normalized)
                const segDx = ev.x - sv.x
                const segDy = ev.y - sv.y
                const len = Math.sqrt(segDx * segDx + segDy * segDy) || 1

                // Project drag onto perpendicular of segment to control curve bulge
                const perpX = -segDy / len
                const perpY = segDx / len
                const proj = dx * perpX + dy * perpY

                const updatedSegs = [...n.vectorNetwork.segments]
                updatedSegs[segIdx] = {
                    ...s,
                    tangentStart: { x: segDx / 3 + perpX * proj, y: segDy / 3 + perpY * proj },
                    tangentEnd: { x: -segDx / 3 + perpX * proj, y: -segDy / 3 + perpY * proj },
                }
                st.updateVectorNetwork(nId, { ...n.vectorNetwork, segments: updatedSegs })
            }

            const onUp = () => {
                useEditorStore.getState().endBatch()
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)

                // If no drag happened → it was a click: toggle straight/curved
                if (!didDrag) {
                    const st2 = useEditorStore.getState()
                    const nId2 = st2.vectorEditNodeId
                    if (!nId2) return
                    const n2 = findNodeById(st2.nodes, nId2) as VectorNode | null
                    if (!n2) return
                    const net2 = n2.vectorNetwork
                    const s2 = net2.segments[segIdx]
                    if (!s2) return
                    const ts2 = s2.tangentStart ?? { x: 0, y: 0 }
                    const te2 = s2.tangentEnd ?? { x: 0, y: 0 }
                    const isCurved = ts2.x !== 0 || ts2.y !== 0 || te2.x !== 0 || te2.y !== 0
                    const updSegs = [...net2.segments]
                    if (isCurved) {
                        updSegs[segIdx] = { ...s2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
                    } else {
                        const v0 = net2.vertices[s2.start]
                        const v1 = net2.vertices[s2.end]
                        if (v0 && v1) {
                            const dx2 = v1.x - v0.x
                            const dy2 = v1.y - v0.y
                            updSegs[segIdx] = {
                                ...s2,
                                tangentStart: { x: dx2 / 3, y: dy2 / 3 },
                                tangentEnd: { x: -dx2 / 3, y: -dy2 / 3 },
                            }
                        }
                    }
                    st2.updateVectorNetwork(nId2, { ...net2, segments: updSegs })
                }
            }

            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
        },
        [],
    )

    // ── Cut tool: click segment to insert vertex + split ────

    const handleCutSegmentPointerDown = useCallback(
        (e: React.PointerEvent, segIdx: number) => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()
            if (store.vectorEditTool !== 'cut' || !store.vectorEditNodeId) return
            const node = findNodeById(store.nodes, store.vectorEditNodeId) as VectorNode | null
            if (!node) return
            const net = node.vectorNetwork
            const seg = net.segments[segIdx]
            if (!seg) return

            const startV = net.vertices[seg.start]
            const endV = net.vertices[seg.end]
            if (!startV || !endV) return

            // Find t closest to click point on this segment
            const z = store.zoom
            const px = store.panX
            const py = store.panY
            const nx = node.x
            const ny = node.y

            const toScreen = (vx: number, vy: number): Pt => ({
                x: (nx + vx) * z + px,
                y: (ny + vy) * z + py,
            })

            const a = toScreen(startV.x, startV.y)
            const b = toScreen(endV.x, endV.y)
            const ts = seg.tangentStart ?? { x: 0, y: 0 }
            const te = seg.tangentEnd ?? { x: 0, y: 0 }
            const cp1 = toScreen(startV.x + ts.x, startV.y + ts.y)
            const cp2 = toScreen(endV.x + te.x, endV.y + te.y)

            const clickPt = {
                x: e.clientX - (svgRef.current?.closest('[data-canvas-viewport]')?.getBoundingClientRect().left ?? 0),
                y: e.clientY - (svgRef.current?.closest('[data-canvas-viewport]')?.getBoundingClientRect().top ?? 0),
            }
            const t = closestTOnSegment(clickPt, a, cp1, cp2, b)

            // Evaluate point on bezier at t (in canvas space)
            const mt = 1 - t
            const newX = mt * mt * mt * startV.x + 3 * mt * mt * t * (startV.x + ts.x) +
                3 * mt * t * t * (endV.x + te.x) + t * t * t * endV.x
            const newY = mt * mt * mt * startV.y + 3 * mt * mt * t * (startV.y + ts.y) +
                3 * mt * t * t * (endV.y + te.y) + t * t * t * endV.y

            // TWO coincident vertices at the cut point — both halves kept, path breaks here
            // newVert1 = end of first half, newVert2 = start of second half (same position)
            const newVert1Idx = net.vertices.length
            const newVert2Idx = net.vertices.length + 1
            const newVertex1: VectorVertex = { x: newX, y: newY, handleMirroring: 'NONE' }
            const newVertex2: VectorVertex = { x: newX, y: newY, handleMirroring: 'NONE' }

            // Subdivide bezier tangents using de Casteljau at t
            const p0 = { x: startV.x, y: startV.y }
            const p1 = { x: startV.x + ts.x, y: startV.y + ts.y }
            const p2 = { x: endV.x + te.x, y: endV.y + te.y }
            const p3 = { x: endV.x, y: endV.y }

            const q0 = p0
            const q1 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) }
            const q2 = {
                x: p0.x + t * (p1.x - p0.x) + t * (p1.x + t * (p2.x - p1.x) - p0.x - t * (p1.x - p0.x)),
                y: p0.y + t * (p1.y - p0.y) + t * (p1.y + t * (p2.y - p1.y) - p0.y - t * (p1.y - p0.y)),
            }
            const r1 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }
            const r2 = {
                x: p1.x + t * (p2.x - p1.x) + t * (p2.x + t * (p3.x - p2.x) - p1.x - t * (p2.x - p1.x)),
                y: p1.y + t * (p2.y - p1.y) + t * (p2.y + t * (p3.y - p2.y) - p1.y - t * (p2.y - p1.y)),
            }
            const r3 = p3

            // First half: seg.start → newVert1
            const firstHalf = {
                start: seg.start,
                end: newVert1Idx,
                tangentStart: { x: q1.x - q0.x, y: q1.y - q0.y },
                tangentEnd: { x: q2.x - newX, y: q2.y - newY },
            }
            // Second half: newVert2 → seg.end (no segment connecting newVert1 to newVert2 — that's the break)
            const secondHalf = {
                start: newVert2Idx,
                end: seg.end,
                tangentStart: { x: r1.x - newX, y: r1.y - newY },
                tangentEnd: { x: r2.x - r3.x, y: r2.y - r3.y },
            }

            const newSegments = net.segments.map((s, si) => si === segIdx ? firstHalf : s)
            newSegments.splice(segIdx + 1, 0, secondHalf)

            store.updateVectorNetwork(store.vectorEditNodeId, {
                ...net,
                vertices: [...net.vertices, newVertex1, newVertex2],
                segments: newSegments,
                regions: [], // path is now open — remove all fills
            })
            // Path is now open — clear node-level fills too
            store.updateNode(store.vectorEditNodeId, { fills: [] })
            // Select newVert2 (start of second half) — shows as one orange dot at cut point
            // Drag it to pull the second half away and open the gap
            store.selectVertices([newVert2Idx], false)
            // Keep cut tool active for consecutive cuts
        },
        [],
    )

    // ── Move tool: vertex drag ──────────────────────────────

    const handleVertexPointerDown = useCallback(
        (e: React.PointerEvent, idx: number) => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()
            const tool = store.vectorEditTool

            // Cut tool: split path at vertex (but if vertex is already selected, allow drag instead)
            if (tool === 'cut' && store.vectorEditNodeId) {
                const isAlreadySelected = store.selectedVertexIndices.includes(idx)
                if (!isAlreadySelected) {
                    handleCutVertex(store.vectorEditNodeId, idx)
                    return
                }
                // Fall through to drag logic for already-selected vertices
            }

            // Ctrl+click (or Cmd+click on Mac): toggle corner/smooth point
            // This converts the vertex between sharp corner (NONE) and smooth (ANGLE_AND_LENGTH)
            if ((e.ctrlKey || e.metaKey) && store.vectorEditNodeId) {
                const node = findNodeById(store.nodes, store.vectorEditNodeId) as VectorNode | null
                if (!node) return
                const vertex = node.vectorNetwork.vertices[idx]
                if (!vertex) return

                // Toggle between NONE (corner) and ANGLE_AND_LENGTH (smooth)
                const currentMirroring = vertex.handleMirroring ?? 'NONE'
                const newMirroring = currentMirroring === 'NONE' ? 'ANGLE_AND_LENGTH' : 'NONE'

                // If converting to corner (NONE), also clear tangent handles on connected segments
                if (newMirroring === 'NONE') {
                    const net = node.vectorNetwork
                    const updatedSegments = net.segments.map((seg, si) => {
                        if (seg.start === idx) {
                            return { ...seg, tangentStart: { x: 0, y: 0 } }
                        }
                        if (seg.end === idx) {
                            return { ...seg, tangentEnd: { x: 0, y: 0 } }
                        }
                        return seg
                    })
                    store.updateVectorNetwork(store.vectorEditNodeId, {
                        ...net,
                        vertices: net.vertices.map((v, vi) =>
                            vi === idx ? { ...v, handleMirroring: newMirroring } : v
                        ),
                        segments: updatedSegments,
                    })
                } else {
                    store.updateVertex(store.vectorEditNodeId, idx, { handleMirroring: newMirroring })
                }
                return
            }

            // Select the vertex
            // Figma spec: normal click = replace selection, Shift+click = additive
            const additive = e.shiftKey
            store.selectVertices([idx], additive)

            // Move tool, bend tool, or cut tool (after selecting cut result): begin vertex drag
            if ((tool === 'move' || tool === 'bend' || tool === 'cut') && store.vectorEditNodeId) {
                const node = findNodeById(store.nodes, store.vectorEditNodeId) as VectorNode | null
                if (!node) return
                const v = node.vectorNetwork.vertices[idx]
                if (!v) return

                const canvas = screenToCanvas(e.clientX, e.clientY)

                // Capture original positions of ALL selected vertices at drag start
                const origPositions = new Map<number, { x: number; y: number }>()
                for (const vi of store.selectedVertexIndices) {
                    const vert = node.vectorNetwork.vertices[vi]
                    if (vert) origPositions.set(vi, { x: vert.x, y: vert.y })
                }
                // Ensure the clicked vertex is included
                if (!origPositions.has(idx)) {
                    origPositions.set(idx, { x: v.x, y: v.y })
                }

                dragRef.current = {
                    type: 'vertex',
                    index: idx,
                    startCanvasX: canvas.x,
                    startCanvasY: canvas.y,
                    origX: v.x,
                    origY: v.y,
                    origPositions,
                }

                store.beginBatch()

                const onMove = (me: PointerEvent) => {
                    const drag = dragRef.current
                    if (!drag || drag.type !== 'vertex') return
                    const pos = screenToCanvas(me.clientX, me.clientY)
                    const dx = pos.x - drag.startCanvasX
                    const dy = pos.y - drag.startCanvasY
                    // Move all selected vertices by the same delta
                    const st = useEditorStore.getState()
                    const nodeId = st.vectorEditNodeId
                    if (!nodeId) return
                    for (const vi of st.selectedVertexIndices) {
                        const orig = drag.origPositions?.get(vi)
                        if (!orig) continue
                        st.updateVertex(nodeId, vi, { x: orig.x + dx, y: orig.y + dy })
                    }
                }

                const onUp = () => {
                    dragRef.current = null
                    useEditorStore.getState().endBatch()
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                }

                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onUp)
            }
        },
        [screenToCanvas],
    )

    // ── Move tool: bezier handle drag ───────────────────────

    const handleHandlePointerDown = useCallback(
        (e: React.PointerEvent, segIdx: number, which: 'tangent-start' | 'tangent-end') => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()
            // Allow handle drag in move AND bend modes
            if ((store.vectorEditTool !== 'move' && store.vectorEditTool !== 'bend') || !store.vectorEditNodeId) return

            const node = findNodeById(store.nodes, store.vectorEditNodeId) as VectorNode | null
            if (!node) return
            const seg = node.vectorNetwork.segments[segIdx]
            if (!seg) return

            const tangent = which === 'tangent-start' ? seg.tangentStart : seg.tangentEnd
            if (!tangent) return

            const vertIdx = which === 'tangent-start' ? seg.start : seg.end
            const vert = node.vectorNetwork.vertices[vertIdx]
            if (!vert) return

            const canvas = screenToCanvas(e.clientX, e.clientY)
            dragRef.current = {
                type: which,
                index: segIdx,
                startCanvasX: canvas.x,
                startCanvasY: canvas.y,
                origX: tangent.x,
                origY: tangent.y,
            }

            store.beginBatch()

            const onMove = (me: PointerEvent) => {
                const drag = dragRef.current
                if (!drag) return
                const pos = screenToCanvas(me.clientX, me.clientY)
                const st = useEditorStore.getState()
                const nodeId = st.vectorEditNodeId
                if (!nodeId) return

                const n = findNodeById(st.nodes, nodeId) as VectorNode | null
                if (!n) return
                const s = n.vectorNetwork.segments[segIdx]
                if (!s) return

                const vIdx = which === 'tangent-start' ? s.start : s.end
                const v = n.vectorNetwork.vertices[vIdx]
                if (!v) return

                // New tangent = cursor position minus vertex position (tangents are offsets)
                const newTangent = { x: pos.x - (n.x + v.x), y: pos.y - (n.y + v.y) }

                const updatedSegs = [...n.vectorNetwork.segments]
                updatedSegs[segIdx] = {
                    ...updatedSegs[segIdx],
                    [which === 'tangent-start' ? 'tangentStart' : 'tangentEnd']: newTangent,
                }
                st.updateVectorNetwork(nodeId, {
                    ...n.vectorNetwork,
                    segments: updatedSegs,
                })
            }

            const onUp = () => {
                dragRef.current = null
                useEditorStore.getState().endBatch()
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
            }

            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
        },
        [screenToCanvas],
    )

    // ── Bend segment: click or double-click → toggle curve ───
    // Works in bend tool mode OR with double-click from any tool

    const handleSegmentDoubleClick = useCallback(
        (e: React.MouseEvent, segIdx: number) => {
            e.stopPropagation()
            const store = useEditorStore.getState()
            if (!store.vectorEditNodeId) return

            // Double-click toggles curve from any tool
            toggleSegmentCurve(store.vectorEditNodeId, segIdx)
        },
        [],
    )

    /** Shared logic to toggle a segment between straight and curved */
    const toggleSegmentCurve = useCallback(
        (nodeId: string, segIdx: number) => {
            const store = useEditorStore.getState()
            const node = findNodeById(store.nodes, nodeId) as VectorNode | null
            if (!node) return
            const net = node.vectorNetwork
            const seg = net.segments[segIdx]
            if (!seg) return

            const ts = seg.tangentStart ?? { x: 0, y: 0 }
            const te = seg.tangentEnd ?? { x: 0, y: 0 }
            const isCurved = ts.x !== 0 || ts.y !== 0 || te.x !== 0 || te.y !== 0

            const updatedSegs = [...net.segments]

            if (isCurved) {
                // Remove curve → make straight
                updatedSegs[segIdx] = { ...seg, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
            } else {
                // Add default curve handles (1/3 of segment length perpendicular)
                const v0 = net.vertices[seg.start]
                const v1 = net.vertices[seg.end]
                const dx = v1.x - v0.x
                const dy = v1.y - v0.y
                const len = Math.sqrt(dx * dx + dy * dy) || 1
                // Perpendicular offset scaled to 1/4 segment length
                const off = len * 0.25
                const nx = -dy / len * off
                const ny = dx / len * off
                updatedSegs[segIdx] = {
                    ...seg,
                    tangentStart: { x: dx / 3 + nx, y: dy / 3 + ny },
                    tangentEnd: { x: -dx / 3 + nx, y: -dy / 3 + ny },
                }
            }

            store.updateVectorNetwork(nodeId, { ...net, segments: updatedSegs })
        },
        [],
    )

    // ── Cut tool: click vertex → split path ─────────────────

    const handleCutVertex = useCallback(
        (nodeId: string, vertIdx: number) => {
            const store = useEditorStore.getState()
            const node = findNodeById(store.nodes, nodeId) as VectorNode | null
            if (!node) return
            const net = node.vectorNetwork

            // Find segments connected to this vertex
            const connectedSegs = net.segments.filter(
                (s) => s.start === vertIdx || s.end === vertIdx
            )
            if (connectedSegs.length < 2) return // Can't split endpoint

            // Remove one segment connected to this vertex (splits the path)
            const segToRemove = connectedSegs[connectedSegs.length - 1]
            const newSegments = net.segments.filter((s) => s !== segToRemove)

            // Remove regions that referenced the removed segment
            const removedIdx = net.segments.indexOf(segToRemove)
            const newRegions = net.regions.filter(
                (r) => !r.loops.some((loop) => loop.includes(removedIdx))
            )

            store.updateVectorNetwork(nodeId, {
                ...net,
                segments: newSegments,
                regions: newRegions,
            })
        },
        [],
    )

    // ── Lasso bbox: move + resize selected vertices ──────────

    const handleBBoxPointerDown = useCallback(
        (e: React.PointerEvent, handle: BBoxHandle) => {
            e.stopPropagation()
            e.preventDefault()
            const store = useEditorStore.getState()
            const nodeId = store.vectorEditNodeId
            if (!nodeId) return
            const node = findNodeById(store.nodes, nodeId) as VectorNode | null
            if (!node) return

            const selIdxs = [...store.selectedVertexIndices]
            if (selIdxs.length === 0) return

            // Snapshot original positions + bbox at drag start
            const origPositions = new Map<number, { x: number; y: number }>()
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (const vi of selIdxs) {
                const v = node.vectorNetwork.vertices[vi]
                if (!v) continue
                origPositions.set(vi, { x: v.x, y: v.y })
                if (v.x < minX) minX = v.x
                if (v.y < minY) minY = v.y
                if (v.x > maxX) maxX = v.x
                if (v.y > maxY) maxY = v.y
            }
            const origW = maxX - minX || 1
            const origH = maxY - minY || 1

            const startClient = { x: e.clientX, y: e.clientY }
            store.beginBatch()

            const onMove = (me: PointerEvent) => {
                const st = useEditorStore.getState()
                const nId = st.vectorEditNodeId
                if (!nId) return

                // Delta in canvas space
                const dx = (me.clientX - startClient.x) / st.zoom
                const dy = (me.clientY - startClient.y) / st.zoom

                if (handle === 'body') {
                    // Translate all selected vertices
                    for (const vi of selIdxs) {
                        const orig = origPositions.get(vi)
                        if (!orig) continue
                        st.updateVertex(nId, vi, { x: orig.x + dx, y: orig.y + dy })
                    }
                } else {
                    // Scale selected vertices relative to the bbox
                    // Determine which edges are being dragged
                    const scaleLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
                    const scaleRight = handle === 'ne' || handle === 'e' || handle === 'se'
                    const scaleTop = handle === 'nw' || handle === 'n' || handle === 'ne'
                    const scaleBottom = handle === 'sw' || handle === 's' || handle === 'se'

                    // New bbox dimensions
                    let newMinX = minX, newMaxX = maxX, newMinY = minY, newMaxY = maxY
                    if (scaleLeft) newMinX = minX + dx
                    if (scaleRight) newMaxX = maxX + dx
                    if (scaleTop) newMinY = minY + dy
                    if (scaleBottom) newMaxY = maxY + dy

                    const newW = newMaxX - newMinX || 1
                    const newH = newMaxY - newMinY || 1

                    for (const vi of selIdxs) {
                        const orig = origPositions.get(vi)
                        if (!orig) continue
                        // Normalized position within original bbox
                        const tx = origW > 0 ? (orig.x - minX) / origW : 0
                        const ty = origH > 0 ? (orig.y - minY) / origH : 0
                        st.updateVertex(nId, vi, {
                            x: newMinX + tx * newW,
                            y: newMinY + ty * newH,
                        })
                    }
                }
            }

            const onUp = () => {
                useEditorStore.getState().endBatch()
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
            }

            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
        },
        [],
    )

    // ── Render ───────────────────────────────────────────────

    // Show overlay in vector edit mode OR when pen tool is active (to show ghost anchors)
    const isPenMode = !vectorEditNodeId && activeTool === 'pen'

    if (!vectorEditNodeId && !isPenMode) return null

    // In pen mode (no active vector edit node), show ghost anchors for ALL vector nodes
    if (isPenMode) {
        const allVectorNodes = nodes.filter((n) => n.type === 'vector') as VectorNode[]
        if (allVectorNodes.length === 0) return null

        return (
            <svg
                ref={svgRef}
                className="absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 30 }}
            >
                {allVectorNodes.map((gn) => {
                    const gvn = gn.vectorNetwork
                    const gx = gn.x
                    const gy = gn.y
                    const gs = (vx: number, vy: number) => ({
                        x: (gx + vx) * zoom + panX,
                        y: (gy + vy) * zoom + panY,
                    })
                    return (
                        <g key={`pen-ghost-${gn.id}`}>
                            {gvn.segments.map((seg: VectorSegment, si: number) => {
                                const sv = gvn.vertices[seg.start]
                                const ev = gvn.vertices[seg.end]
                                if (!sv || !ev) return null
                                const a = gs(sv.x, sv.y)
                                const b = gs(ev.x, ev.y)
                                const tStart = seg.tangentStart
                                const tEnd = seg.tangentEnd
                                const hasCurve = (tStart && (tStart.x !== 0 || tStart.y !== 0)) || (tEnd && (tEnd.x !== 0 || tEnd.y !== 0))
                                if (hasCurve) {
                                    const cp1 = tStart ? gs(sv.x + tStart.x, sv.y + tStart.y) : a
                                    const cp2 = tEnd ? gs(ev.x + tEnd.x, ev.y + tEnd.y) : b
                                    return <path key={`pgs-${si}`} d={`M ${a.x} ${a.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${b.x} ${b.y}`} fill="none" stroke={BLUE} strokeWidth={1} />
                                }
                                return <line key={`pgs-${si}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BLUE} strokeWidth={1} />
                            })}
                            {gvn.vertices.map((v: VectorVertex, vi: number) => {
                                const pos = gs(v.x, v.y)
                                return <circle key={`pga-${vi}`} cx={pos.x} cy={pos.y} r={ANCHOR_SIZE / 2} fill={WHITE} stroke={BLUE} strokeWidth={1.5} />
                            })}
                        </g>
                    )
                })}
            </svg>
        )
    }

    const node = findNodeById(nodes, vectorEditNodeId!)
    if (!node || node.type !== 'vector') return null

    const vn = (node as VectorNode).vectorNetwork
    const nodeX = node.x
    const nodeY = node.y

    // All OTHER vector nodes on canvas (ghost display)
    const otherVectorNodes = nodes
        .filter((n) => n.type === 'vector' && n.id !== vectorEditNodeId) as VectorNode[]

    const toScreen = (vx: number, vy: number, ox = nodeX, oy = nodeY) => ({
        x: (ox + vx) * zoom + panX,
        y: (oy + vy) * zoom + panY,
    })

    const selectedSet = new Set(selectedVertexIndices)

    // Cursor based on active tool
    const toolCursors: Record<VectorEditTool, string> = {
        'move': 'default',
        'lasso': 'crosshair',
        'paint': PAINT_CURSOR,
        'bend': 'pointer',
        'cut': 'crosshair',
    }
    const toolCursor = activeTool === 'pen' ? 'crosshair' : (toolCursors[vectorEditTool] || 'default')

    return (
        <>
            {/* Ghost SVG layer — shows anchor points/segments of ALL other vector nodes (decorative, no interaction) */}
            <svg
                className="absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 28 }}
            >
                {otherVectorNodes.map((gn) => {
                    const gvn = gn.vectorNetwork
                    const gx = gn.x
                    const gy = gn.y
                    const ts = (vx: number, vy: number) => toScreen(vx, vy, gx, gy)
                    return (
                        <g key={`ghost-${gn.id}`}>
                            {/* Ghost segments */}
                            {gvn.segments.map((seg: VectorSegment, si: number) => {
                                const sv = gvn.vertices[seg.start]
                                const ev = gvn.vertices[seg.end]
                                if (!sv || !ev) return null
                                const a = ts(sv.x, sv.y)
                                const b = ts(ev.x, ev.y)
                                const tStart = seg.tangentStart
                                const tEnd = seg.tangentEnd
                                const hasCurve = (tStart && (tStart.x !== 0 || tStart.y !== 0)) || (tEnd && (tEnd.x !== 0 || tEnd.y !== 0))
                                if (hasCurve) {
                                    const cp1 = tStart ? ts(sv.x + tStart.x, sv.y + tStart.y) : a
                                    const cp2 = tEnd ? ts(ev.x + tEnd.x, ev.y + tEnd.y) : b
                                    return <path key={`gs-${si}`} d={`M ${a.x} ${a.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${b.x} ${b.y}`} fill="none" stroke={BLUE} strokeWidth={1} />
                                }
                                return <line key={`gs-${si}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BLUE} strokeWidth={1} />
                            })}
                            {/* Ghost anchor points — same style as active node */}
                            {gvn.vertices.map((v: VectorVertex, vi: number) => {
                                const pos = ts(v.x, v.y)
                                return <circle key={`ga-${vi}`} cx={pos.x} cy={pos.y} r={ANCHOR_SIZE / 2} fill={WHITE} stroke={BLUE} strokeWidth={1.5} />
                            })}
                        </g>
                    )
                })}
            </svg>

            {/* Ghost interactive layer — clicking a ghost node switches to editing it + forwards the action */}
            <svg
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 30, pointerEvents: 'none' }}
            >
                <g style={{ pointerEvents: 'all' }}>
                    {otherVectorNodes.map((gn) => {
                        const gvn = gn.vectorNetwork
                        const gx = gn.x
                        const gy = gn.y
                        const ts = (vx: number, vy: number) => toScreen(vx, vy, gx, gy)

                        const switchToNode = (e: React.PointerEvent) => {
                            const store = useEditorStore.getState()
                            store.enterVectorEditMode(gn.id)
                            store.setVectorEditTool(vectorEditTool)
                        }

                        return (
                            <g key={`ghost-hit-${gn.id}`}>
                                {/* Fat transparent hit zones on ghost segments */}
                                {gvn.segments.map((seg: VectorSegment, si: number) => {
                                    const sv = gvn.vertices[seg.start]
                                    const ev = gvn.vertices[seg.end]
                                    if (!sv || !ev) return null
                                    const a = ts(sv.x, sv.y)
                                    const b = ts(ev.x, ev.y)
                                    const tStart = seg.tangentStart
                                    const tEnd = seg.tangentEnd
                                    const hasCurve = (tStart && (tStart.x !== 0 || tStart.y !== 0)) || (tEnd && (tEnd.x !== 0 || tEnd.y !== 0))

                                    const handleSegClick = (e: React.PointerEvent) => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        switchToNode(e)
                                        // Forward to appropriate tool handler now that node is switched
                                        if (vectorEditTool === 'bend') handleBendSegmentPointerDown(e, si)
                                        else if (vectorEditTool === 'cut') handleCutSegmentPointerDown(e, si)
                                        // Lasso: just switch node, user draws lasso on next interaction
                                    }

                                    if (hasCurve) {
                                        const cp1 = tStart ? ts(sv.x + tStart.x, sv.y + tStart.y) : a
                                        const cp2 = tEnd ? ts(ev.x + tEnd.x, ev.y + tEnd.y) : b
                                        return <path key={`gsh-${si}`} d={`M ${a.x} ${a.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${b.x} ${b.y}`} fill="none" stroke="transparent" strokeWidth={SEGMENT_HIT_WIDTH} style={{ cursor: toolCursor }} onPointerDown={handleSegClick} />
                                    }
                                    return <line key={`gsh-${si}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={SEGMENT_HIT_WIDTH} style={{ cursor: toolCursor }} onPointerDown={handleSegClick} />
                                })}
                                {/* Ghost anchor hit zones — switch node + forward vertex action */}
                                {gvn.vertices.map((v: VectorVertex, vi: number) => {
                                    const pos = ts(v.x, v.y)
                                    return (
                                        <circle
                                            key={`gah-${vi}`}
                                            cx={pos.x} cy={pos.y} r={ANCHOR_SIZE}
                                            fill="transparent"
                                            style={{ cursor: toolCursor }}
                                            onPointerDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                switchToNode(e)
                                                // Forward vertex action for cut/move
                                                if (vectorEditTool === 'cut' || vectorEditTool === 'move') {
                                                    handleVertexPointerDown(e, vi)
                                                }
                                                // Lasso/bend: just switch node, user interacts on next gesture
                                            }}
                                        />
                                    )
                                })}
                            </g>
                        )
                    })}
                </g>
            </svg>

            {/* Decorative SVG layer — non-interactive */}
            <svg
                ref={svgRef}
                className="absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 31 }}
            >
                {/* Bounding box outline around selected vertices — in lasso or move mode */}
                {(vectorEditTool === 'lasso' || vectorEditTool === 'move') && selectedVertexIndices.length >= 2 && (() => {
                    const screenPts = selectedVertexIndices.map((vi) => {
                        const v = vn.vertices[vi]
                        if (!v) return null
                        return toScreen(v.x, v.y)
                    }).filter(Boolean) as { x: number; y: number }[]
                    if (screenPts.length < 2) return null
                    const minSX = Math.min(...screenPts.map((p) => p.x))
                    const minSY = Math.min(...screenPts.map((p) => p.y))
                    const maxSX = Math.max(...screenPts.map((p) => p.x))
                    const maxSY = Math.max(...screenPts.map((p) => p.y))
                    const PAD = 6
                    return (
                        <rect
                            x={minSX - PAD} y={minSY - PAD}
                            width={(maxSX - minSX) + PAD * 2}
                            height={(maxSY - minSY) + PAD * 2}
                            fill="none"
                            stroke={BLUE}
                            strokeWidth={1}
                            strokeDasharray="4 2"
                        />
                    )
                })()}
                {/* Segment lines (thin blue for visibility) */}
                {vn.segments.map((seg: VectorSegment, si: number) => {
                    const startV = vn.vertices[seg.start]
                    const endV = vn.vertices[seg.end]
                    if (!startV || !endV) return null

                    const a = toScreen(startV.x, startV.y)
                    const b = toScreen(endV.x, endV.y)

                    const ts = seg.tangentStart
                    const te = seg.tangentEnd
                    const hasCurve =
                        (ts && (ts.x !== 0 || ts.y !== 0)) ||
                        (te && (te.x !== 0 || te.y !== 0))

                    if (hasCurve) {
                        const cp1 = ts ? toScreen(startV.x + ts.x, startV.y + ts.y) : a
                        const cp2 = te ? toScreen(endV.x + te.x, endV.y + te.y) : b
                        return (
                            <path
                                key={`seg-curve-${si}`}
                                d={`M ${a.x} ${a.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${b.x} ${b.y}`}
                                fill="none"
                                stroke={BLUE}
                                strokeWidth={1}
                                opacity={0.4}
                            />
                        )
                    }

                    return (
                        <line
                            key={`seg-line-${si}`}
                            x1={a.x} y1={a.y}
                            x2={b.x} y2={b.y}
                            stroke={BLUE}
                            strokeWidth={1}
                            opacity={0.4}
                        />
                    )
                })}

                {/* Bezier tangent handle lines */}
                {vn.segments.map((seg: VectorSegment, si: number) => {
                    const startV = vn.vertices[seg.start]
                    const endV = vn.vertices[seg.end]
                    if (!startV || !endV) return null

                    const elements: React.ReactNode[] = []

                    const ts = seg.tangentStart
                    if (ts && (ts.x !== 0 || ts.y !== 0)) {
                        const anchor = toScreen(startV.x, startV.y)
                        const cp = toScreen(startV.x + ts.x, startV.y + ts.y)
                        elements.push(
                            <line
                                key={`ts-line-${si}`}
                                x1={anchor.x} y1={anchor.y}
                                x2={cp.x} y2={cp.y}
                                stroke={BLUE} strokeWidth={1} opacity={0.6}
                            />,
                        )
                    }

                    const te = seg.tangentEnd
                    if (te && (te.x !== 0 || te.y !== 0)) {
                        const anchor = toScreen(endV.x, endV.y)
                        const cp = toScreen(endV.x + te.x, endV.y + te.y)
                        elements.push(
                            <line
                                key={`te-line-${si}`}
                                x1={anchor.x} y1={anchor.y}
                                x2={cp.x} y2={cp.y}
                                stroke={BLUE} strokeWidth={1} opacity={0.6}
                            />,
                        )
                    }

                    return elements.length > 0 ? <g key={`seg-handle-lines-${si}`}>{elements}</g> : null
                })}
            </svg>

            {/* Interactive SVG layer — handles clicks */}
            <svg
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 29, pointerEvents: 'none' }}
            >
                {/* All clickable elements in a group with pointer-events: all */}
                <g style={{ pointerEvents: 'all' }}>

                    {/* Invisible fat segment hit targets */}
                    {vn.segments.map((seg: VectorSegment, si: number) => {
                        const startV = vn.vertices[seg.start]
                        const endV = vn.vertices[seg.end]
                        if (!startV || !endV) return null

                        const a = toScreen(startV.x, startV.y)
                        const b = toScreen(endV.x, endV.y)

                        const ts = seg.tangentStart
                        const te = seg.tangentEnd
                        const hasCurve =
                            (ts && (ts.x !== 0 || ts.y !== 0)) ||
                            (te && (te.x !== 0 || te.y !== 0))

                        const cursor = (vectorEditTool === 'bend' || vectorEditTool === 'cut') ? 'crosshair' : 'default'

                        if (hasCurve) {
                            const cp1 = ts ? toScreen(startV.x + ts.x, startV.y + ts.y) : a
                            const cp2 = te ? toScreen(endV.x + te.x, endV.y + te.y) : b
                            return (
                                <path
                                    key={`seg-hit-${si}`}
                                    d={`M ${a.x} ${a.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${b.x} ${b.y}`}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={SEGMENT_HIT_WIDTH}
                                    style={{ cursor }}
                                    onPointerDown={(e) => {
                                        e.stopPropagation()
                                        if (vectorEditTool === 'bend') handleBendSegmentPointerDown(e, si)
                                        else if (vectorEditTool === 'cut') handleCutSegmentPointerDown(e, si)
                                    }}
                                    onDoubleClick={(e) => handleSegmentDoubleClick(e, si)}
                                />
                            )
                        }

                        return (
                            <line
                                key={`seg-hit-${si}`}
                                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                                stroke="transparent"
                                strokeWidth={SEGMENT_HIT_WIDTH}
                                style={{ cursor }}
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    if (vectorEditTool === 'bend') handleBendSegmentPointerDown(e, si)
                                    else if (vectorEditTool === 'cut') handleCutSegmentPointerDown(e, si)
                                }}
                                onDoubleClick={(e) => handleSegmentDoubleClick(e, si)}
                            />
                        )
                    })}

                    {/* Bezier tangent handle circles */}
                    {vn.segments.map((seg: VectorSegment, si: number) => {
                        const startV = vn.vertices[seg.start]
                        const endV = vn.vertices[seg.end]
                        if (!startV || !endV) return null

                        const elements: React.ReactNode[] = []

                        const ts = seg.tangentStart
                        if (ts && (ts.x !== 0 || ts.y !== 0)) {
                            const cp = toScreen(startV.x + ts.x, startV.y + ts.y)
                            elements.push(
                                <circle
                                    key={`ts-cp-${si}`}
                                    cx={cp.x} cy={cp.y} r={HANDLE_R}
                                    fill={WHITE} stroke={BLUE} strokeWidth={1}
                                    style={{ cursor: toolCursor }}
                                    onPointerDown={(e) => handleHandlePointerDown(e, si, 'tangent-start')}
                                />,
                            )
                        }

                        const te = seg.tangentEnd
                        if (te && (te.x !== 0 || te.y !== 0)) {
                            const cp = toScreen(endV.x + te.x, endV.y + te.y)
                            elements.push(
                                <circle
                                    key={`te-cp-${si}`}
                                    cx={cp.x} cy={cp.y} r={HANDLE_R}
                                    fill={WHITE} stroke={BLUE} strokeWidth={1}
                                    style={{ cursor: toolCursor }}
                                    onPointerDown={(e) => handleHandlePointerDown(e, si, 'tangent-end')}
                                />,
                            )
                        }

                        return elements.length > 0 ? <g key={`seg-handles-${si}`}>{elements}</g> : null
                    })}

                    {/* Anchor points (vertices) — circles like Figma */}
                    {vn.vertices.map((v: VectorVertex, vi: number) => {
                        const pos = toScreen(v.x, v.y)
                        const isSelected = selectedSet.has(vi)

                        return (
                            <circle
                                key={`anchor-${vi}`}
                                cx={pos.x}
                                cy={pos.y}
                                r={ANCHOR_SIZE / 2}
                                fill={isSelected ? BLUE : WHITE}
                                stroke={BLUE}
                                strokeWidth={1.5}
                                style={{ cursor: vectorEditTool === 'cut' ? 'crosshair' : 'move' }}
                                onPointerDown={(e) => handleVertexPointerDown(e, vi)}
                            />
                        )
                    })}

                </g>
            </svg>

            {/* Lasso bounding box: interactive move + resize frame for selected vertices */}
            {(vectorEditTool === 'lasso' || vectorEditTool === 'move') && selectedVertexIndices.length >= 2 && (() => {
                const screenPts = selectedVertexIndices.map((vi) => {
                    const v = vn.vertices[vi]
                    if (!v) return null
                    return toScreen(v.x, v.y)
                }).filter(Boolean) as { x: number; y: number }[]
                if (screenPts.length < 2) return null
                const minSX = Math.min(...screenPts.map((p) => p.x))
                const minSY = Math.min(...screenPts.map((p) => p.y))
                const maxSX = Math.max(...screenPts.map((p) => p.x))
                const maxSY = Math.max(...screenPts.map((p) => p.y))
                const PAD = 6
                const bx = minSX - PAD
                const by = minSY - PAD
                const bw = (maxSX - minSX) + PAD * 2
                const bh = (maxSY - minSY) + PAD * 2
                const H = CORNER_HANDLE_SIZE
                const halfH = H / 2

                const corners: { key: BBoxHandle; left: number; top: number; cursor: string }[] = [
                    { key: 'nw', left: bx - halfH, top: by - halfH, cursor: 'nwse-resize' },
                    { key: 'ne', left: bx + bw - halfH, top: by - halfH, cursor: 'nesw-resize' },
                    { key: 'se', left: bx + bw - halfH, top: by + bh - halfH, cursor: 'nwse-resize' },
                    { key: 'sw', left: bx - halfH, top: by + bh - halfH, cursor: 'nesw-resize' },
                ]
                const edges: { key: BBoxHandle; left: number; top: number; width: number; height: number; cursor: string }[] = [
                    { key: 'n', left: bx + EDGE_HIT, top: by - EDGE_HIT / 2, width: bw - EDGE_HIT * 2, height: EDGE_HIT, cursor: 'ns-resize' },
                    { key: 's', left: bx + EDGE_HIT, top: by + bh - EDGE_HIT / 2, width: bw - EDGE_HIT * 2, height: EDGE_HIT, cursor: 'ns-resize' },
                    { key: 'w', left: bx - EDGE_HIT / 2, top: by + EDGE_HIT, width: EDGE_HIT, height: bh - EDGE_HIT * 2, cursor: 'ew-resize' },
                    { key: 'e', left: bx + bw - EDGE_HIT / 2, top: by + EDGE_HIT, width: EDGE_HIT, height: bh - EDGE_HIT * 2, cursor: 'ew-resize' },
                ]

                return (
                    <>
                        {/* Draggable body — move selected vertices */}
                        <div
                            style={{
                                position: 'absolute',
                                left: bx, top: by,
                                width: bw, height: bh,
                                cursor: 'move',
                                zIndex: 32,
                            }}
                            onPointerDown={(e) => handleBBoxPointerDown(e, 'body')}
                        />
                        {/* Corner handles */}
                        {corners.map((c) => (
                            <div
                                key={c.key}
                                style={{
                                    position: 'absolute',
                                    left: c.left, top: c.top,
                                    width: H, height: H,
                                    backgroundColor: WHITE,
                                    border: `1.5px solid ${BLUE}`,
                                    borderRadius: 1,
                                    cursor: c.cursor,
                                    zIndex: 33,
                                    pointerEvents: 'auto',
                                }}
                                onPointerDown={(e) => handleBBoxPointerDown(e, c.key)}
                            />
                        ))}
                        {/* Edge hit zones */}
                        {edges.map((ed) => (
                            <div
                                key={ed.key}
                                style={{
                                    position: 'absolute',
                                    left: ed.left, top: ed.top,
                                    width: ed.width, height: ed.height,
                                    cursor: ed.cursor,
                                    zIndex: 33,
                                }}
                                onPointerDown={(e) => handleBBoxPointerDown(e, ed.key)}
                            />
                        ))}
                    </>
                )
            })()}

            {/* Paint tool: full-canvas overlay to capture region clicks */}
            {vectorEditTool === 'paint' && (
                <div
                    className="absolute inset-0"
                    style={{ zIndex: 29, cursor: PAINT_CURSOR }}
                    onPointerDown={handlePaintClick}
                />
            )}

            {/* Lasso tool: full-canvas overlay to capture freeform selection drags */}
            {vectorEditTool === 'lasso' && (
                <div
                    className="absolute inset-0"
                    style={{ zIndex: 999, cursor: 'crosshair', pointerEvents: 'auto' }}
                    onPointerDown={handleLassoPointerDown}
                />
            )}

            {/* Lasso polygon being drawn — screen-space SVG overlay */}
            {lassoPoints.length >= 2 && (
                <svg
                    className="absolute inset-0 pointer-events-none"
                    style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 34 }}
                >
                    <polyline
                        points={lassoPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="rgba(59,130,246,0.1)"
                        stroke={BLUE}
                        strokeWidth={1}
                        strokeDasharray="4 2"
                    />
                </svg>
            )}
        </>
    )
})
