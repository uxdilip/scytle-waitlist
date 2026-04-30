'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById } from '@/types/canvas'
import type {
    FrameNode,
    LayoutConstraints,
    Sizing,
    TextNode,
    VectorNetwork,
    VectorNode,
} from '@/types/canvas'

// ============================================================
// Constants
// ============================================================

const RESIZE_THRESHOLD = 2 // px of movement before resize activates
const MIN_SIZE = 1 // minimum width/height in canvas units

const DEFAULT_CONSTRAINTS: LayoutConstraints = {
    horizontal: 'left',
    vertical: 'top',
}

// ============================================================
// Module-level resize flag (shared with page.tsx for Escape gating)
// ============================================================

let _isResizeActive = false

/** Check whether a node resize is in progress (for external Escape handling) */
export function isResizeActive(): boolean {
    return _isResizeActive
}

// ============================================================
// Types
// ============================================================

export type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface ResizeState {
    phase: 'idle' | 'pending' | 'resizing'
    nodeId: string
    handle: HandleDirection
    /** Starting pointer position in screen coords */
    startPointerX: number
    startPointerY: number
    /** Node's original bounds at drag start */
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    /** Aspect ratio at start (width / height) */
    aspectRatio: number
    /** Pointer ID for capture release */
    pointerId: number
    /** Original vectorNetwork for VectorNodes — used to scale vertices from pristine state */
    startVectorNetwork?: VectorNetwork
    /** Child snapshots for constraint-based repositioning when a frame is resized */
    constrainedChildren?: ConstraintChildSnapshot[]
}

interface ConstraintChildSnapshot {
    id: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    constraints: LayoutConstraints
}

const INITIAL_STATE: ResizeState = {
    phase: 'idle',
    nodeId: '',
    handle: 'se',
    startPointerX: 0,
    startPointerY: 0,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    aspectRatio: 1,
    pointerId: -1,
}

function clampDimension(value: number, min?: number, max?: number): number {
    let next = Math.max(MIN_SIZE, value)
    if (min != null) next = Math.max(next, min)
    if (max != null) next = Math.min(next, max)
    return next
}

function getConstrainedChildren(parentNode: FrameNode): ConstraintChildSnapshot[] {
    const isAutoLayoutParent = parentNode.layout.mode !== 'none'

    return parentNode.children
        .filter((child) => !isAutoLayoutParent || child.positioning === 'absolute')
        .map((child) => ({
            id: child.id,
            startX: child.x,
            startY: child.y,
            startWidth: child.width,
            startHeight: child.height,
            minWidth: child.minWidth,
            maxWidth: child.maxWidth,
            minHeight: child.minHeight,
            maxHeight: child.maxHeight,
            constraints: child.constraints ?? DEFAULT_CONSTRAINTS,
        }))
}

function resolveConstrainedChildBounds(
    child: ConstraintChildSnapshot,
    parentStartWidth: number,
    parentStartHeight: number,
    parentNextWidth: number,
    parentNextHeight: number
) {
    const safeStartWidth = Math.max(parentStartWidth, MIN_SIZE)
    const safeStartHeight = Math.max(parentStartHeight, MIN_SIZE)

    const left = child.startX
    const right = parentStartWidth - (child.startX + child.startWidth)
    const top = child.startY
    const bottom = parentStartHeight - (child.startY + child.startHeight)

    const centerOffsetX = child.startX + child.startWidth / 2 - parentStartWidth / 2
    const centerOffsetY = child.startY + child.startHeight / 2 - parentStartHeight / 2

    let nextX = child.startX
    let nextY = child.startY
    let nextWidth = child.startWidth
    let nextHeight = child.startHeight

    switch (child.constraints.horizontal) {
        case 'left':
            nextX = left
            nextWidth = child.startWidth
            break
        case 'right':
            nextWidth = child.startWidth
            nextX = parentNextWidth - right - nextWidth
            break
        case 'center':
            nextWidth = child.startWidth
            nextX = parentNextWidth / 2 + centerOffsetX - nextWidth / 2
            break
        case 'leftRight':
            nextX = left
            nextWidth = parentNextWidth - left - right
            break
        case 'scale': {
            const scaleX = parentNextWidth / safeStartWidth
            nextX = child.startX * scaleX
            nextWidth = child.startWidth * scaleX
            break
        }
    }

    switch (child.constraints.vertical) {
        case 'top':
            nextY = top
            nextHeight = child.startHeight
            break
        case 'bottom':
            nextHeight = child.startHeight
            nextY = parentNextHeight - bottom - nextHeight
            break
        case 'center':
            nextHeight = child.startHeight
            nextY = parentNextHeight / 2 + centerOffsetY - nextHeight / 2
            break
        case 'topBottom':
            nextY = top
            nextHeight = parentNextHeight - top - bottom
            break
        case 'scale': {
            const scaleY = parentNextHeight / safeStartHeight
            nextY = child.startY * scaleY
            nextHeight = child.startHeight * scaleY
            break
        }
    }

    nextWidth = clampDimension(nextWidth, child.minWidth, child.maxWidth)
    nextHeight = clampDimension(nextHeight, child.minHeight, child.maxHeight)

    // Re-apply anchors after clamping where anchor depends on dimension.
    if (child.constraints.horizontal === 'right') {
        nextX = parentNextWidth - right - nextWidth
    } else if (child.constraints.horizontal === 'center') {
        nextX = parentNextWidth / 2 + centerOffsetX - nextWidth / 2
    }

    if (child.constraints.vertical === 'bottom') {
        nextY = parentNextHeight - bottom - nextHeight
    } else if (child.constraints.vertical === 'center') {
        nextY = parentNextHeight / 2 + centerOffsetY - nextHeight / 2
    }

    return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
    }
}

// ============================================================
// Handle direction helpers
// ============================================================

/** Which axes does a handle affect? */
function handleAxes(handle: HandleDirection): { x: boolean; y: boolean } {
    switch (handle) {
        case 'n':
        case 's':
            return { x: false, y: true }
        case 'e':
        case 'w':
            return { x: true, y: false }
        default:
            return { x: true, y: true } // corners: nw, ne, sw, se
    }
}

/** Does this handle move the origin (top-left corner)? */
function handleMovesOrigin(
    handle: HandleDirection
): { moveX: boolean; moveY: boolean } {
    switch (handle) {
        case 'nw':
            return { moveX: true, moveY: true }
        case 'n':
            return { moveX: false, moveY: true }
        case 'ne':
            return { moveX: false, moveY: true }
        case 'w':
            return { moveX: true, moveY: false }
        case 'sw':
            return { moveX: true, moveY: false }
        default:
            return { moveX: false, moveY: false } // e, s, se
    }
}

/** Map handle direction to CSS cursor */
export function handleToCursor(handle: HandleDirection): string {
    switch (handle) {
        case 'nw':
        case 'se':
            return 'nwse-resize'
        case 'n':
        case 's':
            return 'ns-resize'
        case 'ne':
        case 'sw':
            return 'nesw-resize'
        case 'e':
        case 'w':
            return 'ew-resize'
    }
}

// ============================================================
// useNodeResize hook
// ============================================================

export function useNodeResize(
    viewportRef: React.RefObject<HTMLDivElement | null>
) {
    const [resizeInfo, setResizeInfo] = useState<{
        isResizing: boolean
        handle: HandleDirection | null
    }>({ isResizing: false, handle: null })

    const stateRef = useRef<ResizeState>({ ...INITIAL_STATE })
    const startSizingRef = useRef<{ horizontal: string; vertical: string } | null>(null)
    const latestPointerRef = useRef<{
        clientX: number
        clientY: number
        shiftKey: boolean
    } | null>(null)
    const resizeFrameRef = useRef<number>(0)

    // ── Start tracking a potential resize ────────────────────

    const startResize = useCallback(
        (
            handle: HandleDirection,
            nodeId: string,
            pointerX: number,
            pointerY: number,
            pointerId: number
        ) => {
            const store = useEditorStore.getState()
            const node = findNodeById(store.nodes, nodeId)
            if (!node || node.locked) return

            const constrainedChildren =
                node.type === 'frame' ? getConstrainedChildren(node as FrameNode) : undefined

            stateRef.current = {
                phase: 'pending',
                nodeId,
                handle,
                startPointerX: pointerX,
                startPointerY: pointerY,
                startX: node.x,
                startY: node.y,
                startWidth: node.width,
                startHeight: node.height,
                aspectRatio: node.width / Math.max(node.height, 1),
                pointerId,
                ...(node.type === 'vector'
                    ? { startVectorNetwork: (node as VectorNode).vectorNetwork }
                    : {}),
                ...(constrainedChildren && constrainedChildren.length > 0
                    ? { constrainedChildren }
                    : {}),
            }
        },
        []
    )

    const applyResizeStep = useCallback(
        (clientX: number, clientY: number, shiftKey: boolean) => {
            const s = stateRef.current
            if (s.phase !== 'resizing') return

            const screenDx = clientX - s.startPointerX
            const screenDy = clientY - s.startPointerY

            // Convert screen delta to canvas delta
            const zoom = useEditorStore.getState().zoom
            let canvasDx = screenDx / zoom
            let canvasDy = screenDy / zoom

            const axes = handleAxes(s.handle)
            const origin = handleMovesOrigin(s.handle)

            // Constrain to single axis for edge handles
            if (!axes.x) canvasDx = 0
            if (!axes.y) canvasDy = 0

            // Calculate new dimensions
            let newWidth = s.startWidth
            let newHeight = s.startHeight
            let newX = s.startX
            let newY = s.startY

            if (axes.x) {
                if (origin.moveX) {
                    // Left-side handle: x moves right, width shrinks
                    newWidth = s.startWidth - canvasDx
                    newX = s.startX + canvasDx
                } else {
                    // Right-side handle: width grows
                    newWidth = s.startWidth + canvasDx
                }
            }

            if (axes.y) {
                if (origin.moveY) {
                    // Top-side handle: y moves down, height shrinks
                    newHeight = s.startHeight - canvasDy
                    newY = s.startY + canvasDy
                } else {
                    // Bottom-side handle: height grows
                    newHeight = s.startHeight + canvasDy
                }
            }

            // Shift = lock aspect ratio (only for corner handles)
            if (shiftKey && axes.x && axes.y) {
                const ar = s.aspectRatio
                // Use the dominant axis delta to drive the constraint
                if (
                    Math.abs(newWidth - s.startWidth) >=
                    Math.abs(newHeight - s.startHeight)
                ) {
                    // Width is dominant — derive height from width
                    newHeight = newWidth / ar
                    if (origin.moveY) {
                        newY = s.startY + (s.startHeight - newHeight)
                    }
                } else {
                    // Height is dominant — derive width from height
                    newWidth = newHeight * ar
                    if (origin.moveX) {
                        newX = s.startX + (s.startWidth - newWidth)
                    }
                }
            }

            // Handle flip when dragging past the opposite edge, then clamp to MIN_SIZE
            let flipX = false
            let flipY = false

            if (axes.x && newWidth <= 0) {
                flipX = true
                // The new left edge is at newX + newWidth (newWidth is negative)
                newX = newX + newWidth
                newWidth = -newWidth
            }
            if (axes.y && newHeight <= 0) {
                flipY = true
                newY = newY + newHeight
                newHeight = -newHeight
            }

            // Minimum size clamping (after flip resolution)
            if (newWidth < MIN_SIZE) newWidth = MIN_SIZE
            if (newHeight < MIN_SIZE) newHeight = MIN_SIZE

            // Apply target node + constrained children in one store mutation to avoid transient visual states.
            const store = useEditorStore.getState()
            const updatePayload: Parameters<typeof store.updateNode>[1] = {
                width: newWidth,
                height: newHeight,
                x: newX,
                y: newY,
            }

            // For VectorNodes, scale the path vertices proportionally from their original positions.
            // When flipped, mirror the vertices across the new bounding box edge.
            if (s.startVectorNetwork) {
                const scaleX = newWidth / s.startWidth
                const scaleY = newHeight / s.startHeight
                // Sign used to flip tangent directions when axis is mirrored
                const signX = flipX ? -1 : 1
                const signY = flipY ? -1 : 1

                const scaledVertices = s.startVectorNetwork.vertices.map((v) => ({
                    ...v,
                    // When flipped, mirror: newWidth - v.x*scaleX  (= (startWidth-v.x)*scaleX)
                    x: flipX ? newWidth - v.x * scaleX : v.x * scaleX,
                    y: flipY ? newHeight - v.y * scaleY : v.y * scaleY,
                }))
                const scaledSegments = s.startVectorNetwork.segments.map((seg) => ({
                    ...seg,
                    ...(seg.tangentStart
                        ? { tangentStart: { x: seg.tangentStart.x * scaleX * signX, y: seg.tangentStart.y * scaleY * signY } }
                        : {}),
                    ...(seg.tangentEnd
                        ? { tangentEnd: { x: seg.tangentEnd.x * scaleX * signX, y: seg.tangentEnd.y * scaleY * signY } }
                        : {}),
                }))
                    ; (updatePayload as Record<string, unknown>).vectorNetwork = {
                        ...s.startVectorNetwork,
                        vertices: scaledVertices,
                        segments: scaledSegments,
                    }
            }

            const updates: Array<{ id: string; updates: Record<string, unknown> }> = [
                { id: s.nodeId, updates: updatePayload },
            ]

            if (s.constrainedChildren && s.constrainedChildren.length > 0) {
                for (const child of s.constrainedChildren) {
                    const childUpdates = resolveConstrainedChildBounds(
                        child,
                        s.startWidth,
                        s.startHeight,
                        newWidth,
                        newHeight
                    )
                    updates.push({ id: child.id, updates: childUpdates })
                }
            }

            store.updateNodes(updates)
        },
        []
    )

    const flushResizeFrame = useCallback(() => {
        resizeFrameRef.current = 0
        const latest = latestPointerRef.current
        if (!latest) return
        latestPointerRef.current = null
        applyResizeStep(latest.clientX, latest.clientY, latest.shiftKey)
    }, [applyResizeStep])

    const scheduleResizeFrame = useCallback(() => {
        if (resizeFrameRef.current !== 0) return
        resizeFrameRef.current = requestAnimationFrame(flushResizeFrame)
    }, [flushResizeFrame])

    // ── Pointer move (called continuously) ──────────────────

    const onResizePointerMove = useCallback(
        (clientX: number, clientY: number, shiftKey: boolean): boolean => {
            const s = stateRef.current
            if (s.phase === 'idle') return false

            const screenDx = clientX - s.startPointerX
            const screenDy = clientY - s.startPointerY

            // Threshold check — don't consume events until exceeded
            if (s.phase === 'pending') {
                if (Math.abs(screenDx) + Math.abs(screenDy) < RESIZE_THRESHOLD)
                    return false
                s.phase = 'resizing'
                _isResizeActive = true
                const store = useEditorStore.getState()
                store.beginBatch()
                store.setNodeResizeActive(true)
                setResizeInfo({ isResizing: true, handle: s.handle })

                // Capture original sizing before switching to 'fixed'
                const node = findNodeById(store.nodes, s.nodeId)
                if (node) {
                    startSizingRef.current = { ...node.sizing }
                    const axes = handleAxes(s.handle)
                    const newSizing: Sizing = { ...node.sizing }
                    let changed = false
                    const resizeStartUpdates: Record<string, unknown> = {}

                    if (axes.x && node.sizing.horizontal !== 'fixed') {
                        newSizing.horizontal = 'fixed'
                        changed = true
                    }
                    if (axes.y && node.sizing.vertical !== 'fixed') {
                        newSizing.vertical = 'fixed'
                        changed = true
                    }
                    if (changed) {
                        resizeStartUpdates.sizing = newSizing
                    }

                    // For TextNodes, sync the autoResize mode with the resize interaction (Figma parity)
                    if (node.type === 'text') {
                        const text = node as TextNode
                        let newAutoResize = text.autoResize
                        const isCorner = axes.x && axes.y

                        if (isCorner) {
                            newAutoResize = 'none' // Corner -> Fixed Size
                        } else if (axes.y) {
                            newAutoResize = 'none' // N/S side handle -> Fixed Size
                        } else if (axes.x && text.autoResize === 'width-and-height') {
                            newAutoResize = 'height' // E/W side handle -> Auto Height (wraps)
                        }

                        if (newAutoResize !== text.autoResize) {
                            resizeStartUpdates.autoResize = newAutoResize
                        }
                    }

                    if (Object.keys(resizeStartUpdates).length > 0) {
                        store.updateNode(s.nodeId, resizeStartUpdates)
                    }
                }
            }

            latestPointerRef.current = { clientX, clientY, shiftKey }
            scheduleResizeFrame()

            return true // consumed
        },
        [scheduleResizeFrame]
    )

    // ── Pointer up (commit) ─────────────────────────────────

    const onResizePointerUp = useCallback((): boolean => {
        const s = stateRef.current
        if (s.phase === 'idle') return false

        const wasResizing = s.phase === 'resizing'
        const store = useEditorStore.getState()

        if (resizeFrameRef.current !== 0) {
            cancelAnimationFrame(resizeFrameRef.current)
            resizeFrameRef.current = 0
        }

        const latest = latestPointerRef.current
        latestPointerRef.current = null
        if (wasResizing && latest) {
            applyResizeStep(latest.clientX, latest.clientY, latest.shiftKey)
        }

        // Release pointer capture
        if (s.pointerId >= 0) {
            viewportRef.current?.releasePointerCapture(s.pointerId)
        }

        stateRef.current = { ...INITIAL_STATE }
        startSizingRef.current = null
        _isResizeActive = false
        setResizeInfo({ isResizing: false, handle: null })

        if (wasResizing) {
            store.endBatch()
        }
        store.setNodeResizeActive(false)

        return true
    }, [applyResizeStep, viewportRef])

    // ── Cancel resize (Escape key) ──────────────────────────

    const cancelResize = useCallback(() => {
        const s = stateRef.current
        if (s.phase === 'idle') return

        if (resizeFrameRef.current !== 0) {
            cancelAnimationFrame(resizeFrameRef.current)
            resizeFrameRef.current = 0
        }
        latestPointerRef.current = null

        // Release pointer capture
        if (s.pointerId >= 0) {
            viewportRef.current?.releasePointerCapture(s.pointerId)
        }

        // Restore original dimensions AND sizing mode
        const store = useEditorStore.getState()
        if (s.phase === 'resizing') {
            const restoreUpdates: Record<string, unknown> = {
                x: s.startX,
                y: s.startY,
                width: s.startWidth,
                height: s.startHeight,
            }
            if (startSizingRef.current) {
                restoreUpdates.sizing = { ...startSizingRef.current }
            }

            const updates: Array<{ id: string; updates: Record<string, unknown> }> = [
                { id: s.nodeId, updates: restoreUpdates },
            ]

            if (s.constrainedChildren && s.constrainedChildren.length > 0) {
                for (const child of s.constrainedChildren) {
                    updates.push({
                        id: child.id,
                        updates: {
                            x: child.startX,
                            y: child.startY,
                            width: child.startWidth,
                            height: child.startHeight,
                        },
                    })
                }
            }

            store.updateNodes(updates)
            store.endBatch()
        }

        stateRef.current = { ...INITIAL_STATE }
        startSizingRef.current = null
        _isResizeActive = false
        setResizeInfo({ isResizing: false, handle: null })
        store.setNodeResizeActive(false)
    }, [viewportRef])

    // ── Escape key handler ──────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && stateRef.current.phase !== 'idle') {
                e.stopImmediatePropagation()
                cancelResize()
            }
        }
        // Use capture phase to fire before page.tsx's handler
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [cancelResize])

    useEffect(() => {
        return () => {
            if (resizeFrameRef.current !== 0) {
                cancelAnimationFrame(resizeFrameRef.current)
            }
            latestPointerRef.current = null
            const store = useEditorStore.getState()
            if (stateRef.current.phase === 'resizing') {
                store.endBatch()
            }
            stateRef.current = { ...INITIAL_STATE }
            startSizingRef.current = null
            _isResizeActive = false
            store.setNodeResizeActive(false)
        }
    }, [])

    return {
        resizeInfo,
        startResize,
        onResizePointerMove,
        onResizePointerUp,
        cancelResize,
    }
}
