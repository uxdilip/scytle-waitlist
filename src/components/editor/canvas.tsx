'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { useGenerationStore } from '@/store/generation-store'
import { cn } from '@/lib/utils'
import { MIN_ZOOM, MAX_ZOOM, findNodeById, findParentOfNode, createFrame, createText, getNodeCanvasPosition } from '@/types/canvas'
import type { ScytleNode } from '@/types/canvas'
import {
    findContainingFrameAtPoint,
    isNodeWithinFrameScope,
    shouldExitEnteredFrameOnCanvasClick,
} from './canvas-parenting'
import { NodeRenderer } from './node-renderer'
import { SelectionOverlay, HoverOverlay, DragInsertIndicator, PaddingOverlay, CanvasPaddingZones, CanvasGapZones, CanvasMarginZones } from './selection-overlay'
import { MeasurementOverlay } from './measurement-overlay'
import { GradientHandleOverlay } from './gradient-handle-overlay'
import { ImageCropOverlay } from './image-crop-overlay'
import { SnapGuideOverlay } from './snap-guide-overlay'
import { Toolbar } from './toolbar'
import { useNodeDrag } from './hooks/use-node-drag'
import { useNodeResize, handleToCursor } from './hooks/use-node-resize'
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts'
import { usePenTool } from './hooks/use-pen-tool'
import { PenOverlay } from './pen-overlay'
import { VectorEditToolbar } from './vector-edit-toolbar'
import { AnchorPointOverlay } from './anchor-point-overlay'
import { GridOverlay } from './grid-overlay'
import { GenerationOverlay } from './generation-overlay'

import type { HandleDirection } from './hooks/use-node-resize'

function areIdArraysEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function mergeUniqueIds(base: readonly string[], incoming: readonly string[]): string[] {
    return Array.from(new Set([...base, ...incoming]))
}

const DOUBLE_TAP_WINDOW_MS = 360
const DOUBLE_TAP_MAX_DISTANCE = 10

interface TapSnapshot {
    time: number
    x: number
    y: number
    clickTargetId: string | null
    pathIds: string[]
}

// ============================================================
// Canvas Component
// ============================================================

export function EditorCanvas({ showToolbar = true }: { showToolbar?: boolean } = {}) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const transformRef = useRef<HTMLDivElement>(null)

    // Store subscriptions (granular selectors for performance)
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)
    const nodes = useEditorStore((s) => s.nodes)
    const activeTool = useEditorStore((s) => s.activeTool)
    const canvasColor = useEditorStore((s) => s.canvasColor)
    const penNearStart = useEditorStore((s) => s.penDrawingState?.nearStartPoint ?? false)
    const penIsDrawing = useEditorStore((s) => s.penDrawingState?.isDrawing ?? false)
    const isViewportAnimating = useEditorStore((s) => s.isViewportAnimating)
    const selectedCount = useEditorStore((s) => s.selectedIds.length)
    const clipboardCount = useEditorStore((s) => s._clipboard.length)

    // Local state for interactions
    const [spaceHeld, setSpaceHeld] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const panSourceRef = useRef<'space' | 'middle' | null>(null)
    const lastPointerRef = useRef({ x: 0, y: 0 })
    const lastHoverPointerRef = useRef<{ x: number; y: number } | null>(null)
    const lastTapRef = useRef<TapSnapshot | null>(null)
    const lastManualDoubleTapAtRef = useRef<number>(-Infinity)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

    const isHandMode = activeTool === 'hand' || spaceHeld

    // ── Draw state for frame creation tool ─────────────────────
    const [drawState, setDrawState] = useState<{
        startCanvasX: number
        startCanvasY: number
        currentCanvasX: number
        currentCanvasY: number
    } | null>(null)

    // ── Marquee (rubber-band) selection state ────────────────
    const [marquee, setMarquee] = useState<{
        /** Canvas-space start X */
        startX: number
        /** Canvas-space start Y */
        startY: number
        /** Canvas-space current X */
        currentX: number
        /** Canvas-space current Y */
        currentY: number
        /** Whether the marquee has exceeded threshold and is active */
        active: boolean
        /** Whether shift was held at marquee start (merge with existing selection) */
        shiftHeld: boolean
        /** Whether deep marquee selection is active (Cmd/Ctrl) */
        deepSelect: boolean
        /** Selection snapshot before marquee started (used for stable Shift union) */
        baseSelectionIds: string[]
    } | null>(null)
    const MARQUEE_THRESHOLD = 3 // px before marquee activates

    const marqueeSelectionRafRef = useRef<number | null>(null)
    const marqueeSelectionQueuedRef = useRef<string[] | null>(null)
    const marqueeSelectionLastRef = useRef<string[] | null>(null)

    const queueMarqueeSelection = useCallback((ids: string[]) => {
        marqueeSelectionQueuedRef.current = ids
        if (marqueeSelectionRafRef.current !== null) return

        marqueeSelectionRafRef.current = requestAnimationFrame(() => {
            marqueeSelectionRafRef.current = null
            const nextIds = marqueeSelectionQueuedRef.current
            marqueeSelectionQueuedRef.current = null
            if (!nextIds) return

            const prevIds = marqueeSelectionLastRef.current ?? useEditorStore.getState().selectedIds
            if (areIdArraysEqual(prevIds, nextIds)) return

            useEditorStore.getState().setSelectedIds(nextIds)
            marqueeSelectionLastRef.current = nextIds
        })
    }, [])

    useEffect(() => {
        return () => {
            if (marqueeSelectionRafRef.current !== null) {
                cancelAnimationFrame(marqueeSelectionRafRef.current)
            }
        }
    }, [])

    /** Convert screen coordinates (clientX/Y) to canvas coordinates */
    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = viewportRef.current?.getBoundingClientRect()
        if (!rect) return { x: 0, y: 0 }
        const { panX, panY, zoom } = useEditorStore.getState()
        return {
            x: (clientX - rect.left - panX) / zoom,
            y: (clientY - rect.top - panY) / zoom,
        }
    }, [])

    /** Find all top-level node IDs whose bounding boxes overlap a canvas-space rect */
    const getNodesInRect = useCallback((
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        options?: { deepSelect?: boolean }
    ): string[] => {
        const left = Math.min(x1, x2)
        const top = Math.min(y1, y2)
        const right = Math.max(x1, x2)
        const bottom = Math.max(y1, y2)
        const deepSelect = options?.deepSelect ?? false

        const candidates: Array<{ id: string; left: number; top: number; right: number; bottom: number }> = []

        const collectCandidates = (
            list: readonly ScytleNode[],
            offsetX: number,
            offsetY: number,
            parentLocked: boolean,
        ) => {
            for (const node of list) {
                const nodeLocked = parentLocked || node.locked
                if (node.visible === false || nodeLocked) continue

                const nodeLeft = offsetX + node.x
                const nodeTop = offsetY + node.y
                const nodeRight = nodeLeft + node.width
                const nodeBottom = nodeTop + node.height

                // Deep marquee prefers selecting nested descendants over their parent frames.
                const shouldSkipSelf = deepSelect && node.type === 'frame' && node.children.length > 0
                if (!shouldSkipSelf) {
                    candidates.push({
                        id: node.id,
                        left: nodeLeft,
                        top: nodeTop,
                        right: nodeRight,
                        bottom: nodeBottom,
                    })
                }

                if (deepSelect && node.type === 'frame' && node.children.length > 0) {
                    collectCandidates(node.children, nodeLeft, nodeTop, nodeLocked)
                }
            }
        }

        const state = useEditorStore.getState()
        const enteredId = state.enteredFrameId

        if (enteredId) {
            const enteredFrame = findNodeById(state.nodes, enteredId) as import('@/types/canvas').FrameNode | null
            if (enteredFrame) {
                const parentPos = getNodeCanvasPosition(state.nodes, enteredId)
                collectCandidates(
                    enteredFrame.children,
                    parentPos?.x ?? 0,
                    parentPos?.y ?? 0,
                    enteredFrame.locked,
                )
            }
        } else {
            collectCandidates(state.nodes, 0, 0, false)
        }

        const ids: string[] = []
        for (const candidate of candidates) {
            if (
                candidate.right > left &&
                candidate.left < right &&
                candidate.bottom > top &&
                candidate.top < bottom
            ) {
                ids.push(candidate.id)
            }
        }
        return ids
    }, [])

    // Node drag hook
    const {
        dragInfo,
        startPotentialDrag,
        onDragPointerMove,
        onDragPointerUp,
    } = useNodeDrag(viewportRef)

    // Node resize hook
    const {
        resizeInfo,
        startResize,
        onResizePointerMove,
        onResizePointerUp,
    } = useNodeResize(viewportRef)

    // Global keyboard shortcuts (Delete, Undo/Redo, Copy/Paste, etc.)
    useKeyboardShortcuts()

    // Pen tool drawing hook
    const { handlePenPointerDown, handlePenPointerMove, handlePenPointerUp, handlePenKeyDown } = usePenTool(screenToCanvas)

    // ----------------------------------------------------------
    // Wheel handler: scroll = pan, Cmd/Ctrl+scroll = zoom
    // Attached via addEventListener for { passive: false }
    // ----------------------------------------------------------
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault()

        const state = useEditorStore.getState()
        const rect = viewportRef.current?.getBoundingClientRect()
        if (!rect) return

        if (e.ctrlKey || e.metaKey) {
            // Zoom to cursor position
            const focalX = e.clientX - rect.left
            const focalY = e.clientY - rect.top
            const delta = -e.deltaY * 0.01
            const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * (1 + delta)))
            state.zoomTo(newZoom, focalX, focalY)
        } else {
            // Pan
            state.setPan(state.panX - e.deltaX, state.panY - e.deltaY)
        }
    }, [])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.addEventListener('wheel', handleWheel, { passive: false })
        return () => viewport.removeEventListener('wheel', handleWheel)
    }, [handleWheel])

    // ----------------------------------------------------------
    // Viewport size tracking (for zoomIn/zoomOut centering)
    // ----------------------------------------------------------
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (entry) {
                useEditorStore.getState().setViewportRect({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                })
            }
        })

        observer.observe(viewport)
        return () => observer.disconnect()
    }, [])

    // ----------------------------------------------------------
    // Space key: temporary hand tool
    // ----------------------------------------------------------
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                e.code === 'Space' &&
                !e.repeat &&
                document.activeElement?.tagName !== 'INPUT' &&
                document.activeElement?.tagName !== 'TEXTAREA' &&
                !(document.activeElement as HTMLElement)?.isContentEditable
            ) {
                e.preventDefault()
                setSpaceHeld(true)
            }
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setSpaceHeld(false)
                // Only stop pan-dragging if space was the cause (not middle-click)
                if (panSourceRef.current === 'space') {
                    setIsDragging(false)
                    panSourceRef.current = null
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // ----------------------------------------------------------
    // Pen tool keyboard shortcuts (Escape/Enter/Backspace)
    // ----------------------------------------------------------
    useEffect(() => {
        window.addEventListener('keydown', handlePenKeyDown)
        return () => window.removeEventListener('keydown', handlePenKeyDown)
    }, [handlePenKeyDown])

    useEffect(() => {
        if (!contextMenu) return

        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (target.closest('[data-editor-context-menu="true"]')) return
            setContextMenu(null)
        }

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setContextMenu(null)
            }
        }

        window.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('keydown', handleEscape)
        return () => {
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [contextMenu])

    const collectNodePathIds = useCallback((targetEl: HTMLElement): string[] => {
        const nodeIds: string[] = []
        let el: HTMLElement | null = targetEl
        while (el && el !== viewportRef.current) {
            const nodeId = el.getAttribute('data-node-id')
            if (nodeId) nodeIds.push(nodeId)
            el = el.parentElement
        }
        return nodeIds
    }, [])

    /** Resolve which node ID to select given entry context.
     *  Implements Figma-like click-through:
     *  - First click selects top-level parent (or direct child of entered frame)
     *  - Second click on same spot drills one level deeper into the selected frame
     *  - Siblings at the same level are selectable directly
     *  - Cmd/Ctrl+Click deep-selects the deepest node under cursor
     */
    const resolveClickTarget = useCallback(
        (targetEl: HTMLElement, deepSelect = false): string | null => {
            const state = useEditorStore.getState()

            // Collect all node IDs from target up to viewport (deepest first)
            const nodeIds = collectNodePathIds(targetEl)

            if (nodeIds.length === 0) return null

            // ── Deep select (Cmd/Ctrl+Click): pick the deepest node ──
            if (deepSelect) {
                return nodeIds[0]
            }

            // ── If drilled into a frame, scope to its children ───────
            if (state.enteredFrameId) {
                const enteredFrame = findNodeById(state.nodes, state.enteredFrameId)
                if (enteredFrame && enteredFrame.type === 'frame') {
                    const directChildIds = new Set(
                        enteredFrame.children.map((c) => c.id)
                    )

                    // If currently selected child is a frame and it's in the click path,
                    // drill one level deeper into it
                    if (state.selectedIds.length === 1) {
                        const selectedId = state.selectedIds[0]
                        if (directChildIds.has(selectedId) && nodeIds.includes(selectedId)) {
                            const selectedNode = findNodeById(state.nodes, selectedId)
                            if (selectedNode && selectedNode.type === 'frame' && selectedNode.children.length > 0) {
                                const childIds = new Set(selectedNode.children.map(c => c.id))
                                for (const id of nodeIds) {
                                    if (childIds.has(id)) return id
                                }
                            }
                        }

                        // Sibling selection: if a child is selected, clicking another child selects directly
                        if (directChildIds.has(selectedId)) {
                            for (const id of nodeIds) {
                                if (directChildIds.has(id)) return id
                            }
                        }

                        // Already deeper than entered frame — check sibling selection at current depth
                        const selectedParent = findParentOfNode(state.nodes, selectedId)
                        if (selectedParent?.parent) {
                            const siblingIds = new Set(selectedParent.parent.children.map(c => c.id))
                            for (const id of nodeIds) {
                                if (siblingIds.has(id)) return id
                            }
                        }
                    }

                    // Default: select the nearest direct child of entered frame
                    for (const id of nodeIds) {
                        if (directChildIds.has(id)) return id
                    }
                    return nodeIds[0]
                }
            }

            // ── Find the top-level node in the click path ────────────
            const topLevelIds = new Set(state.nodes.map((n) => n.id))
            let topLevelId: string | null = null
            for (let i = nodeIds.length - 1; i >= 0; i--) {
                if (topLevelIds.has(nodeIds[i])) {
                    topLevelId = nodeIds[i]
                    break
                }
            }

            if (!topLevelId) return nodeIds[0]

            if (state.selectedIds.length === 1) {
                const selectedId = state.selectedIds[0]

                // ── Progressive drill-down ────────────────────────────
                // If the currently selected node is in the click path AND is a
                // frame, drill one level deeper into its direct child
                if (nodeIds.includes(selectedId)) {
                    const selectedNode = findNodeById(state.nodes, selectedId)
                    if (selectedNode && selectedNode.type === 'frame' && selectedNode.children.length > 0) {
                        const childIds = new Set(selectedNode.children.map(c => c.id))
                        for (const id of nodeIds) {
                            if (childIds.has(id)) return id
                        }
                    }
                }

                // ── Sibling selection ─────────────────────────────────
                // If a child node is currently selected, clicking another
                // child of the SAME parent selects it directly
                if (selectedId !== topLevelId || !topLevelIds.has(selectedId)) {
                    const selectedParent = findParentOfNode(state.nodes, selectedId)
                    if (selectedParent?.parent) {
                        const siblingIds = new Set(
                            selectedParent.parent.children.map((c) => c.id)
                        )
                        for (const id of nodeIds) {
                            if (siblingIds.has(id)) return id
                        }
                    }
                }
            }

            return topLevelId
        },
        [collectNodePathIds]
    )

    /**
     * Resolve pointer-down target for drag interactions.
     *
     * When a frame is already selected, dragging from within its descendants
     * should move that selected frame (unless deep-select is explicitly requested).
     * This prevents accidental child drags in nested auto-layout content.
     */
    const resolvePointerDownTarget = useCallback(
        (targetEl: HTMLElement, deepSelect = false): string | null => {
            const clickTargetId = resolveClickTarget(targetEl, deepSelect)
            if (!clickTargetId || deepSelect) return clickTargetId

            const state = useEditorStore.getState()
            if (state.selectedIds.length !== 1) return clickTargetId

            const selectedId = state.selectedIds[0]
            if (selectedId === clickTargetId) return clickTargetId

            const selectedNode = findNodeById(state.nodes, selectedId)
            if (!selectedNode || selectedNode.type !== 'frame') return clickTargetId

            if (!isNodeWithinFrameScope(state.nodes, clickTargetId, selectedId)) {
                return clickTargetId
            }

            return selectedId
        },
        [resolveClickTarget]
    )

    const activateNodeByDoubleTap = useCallback(
        (nodeId: string, clickPathIds: readonly string[]): boolean => {
            const state = useEditorStore.getState()
            const node = findNodeById(state.nodes, nodeId)
            if (!node) return false

            // Double-click node with image fill → enter crop mode
            const imgFillIdx = node.fills.findIndex((f) => f.type === 'image' && f.src)
            if (imgFillIdx >= 0) {
                const fill = node.fills[imgFillIdx]
                if (fill.type === 'image' && fill.fit !== 'crop') {
                    const newFills = node.fills.map((f, i) =>
                        i === imgFillIdx ? { ...f, fit: 'crop' as const } : f
                    )
                    state.updateNode(nodeId, { fills: newFills })
                }
                state.setImageCropEditingFillIdx(imgFillIdx)
                return true
            }

            if (node.type === 'text') {
                state.setEditingNodeId(nodeId)
                return true
            }

            if (node.type === 'vector') {
                state.enterVectorEditMode(nodeId)
                return true
            }

            if (node.type === 'frame' && node.children.length > 0) {
                const directChildIds = new Set(node.children.map((child) => child.id))
                const clickedChildId = clickPathIds.find((id) => directChildIds.has(id))
                const childId = clickedChildId ?? node.children[0]?.id

                state.enterFrame(nodeId)
                if (childId) {
                    state.selectNode(childId)
                }
                return true
            }

            return false
        },
        []
    )

    const triggerDoubleTapAction = useCallback(
        (targetEl: HTMLElement, clickTargetId: string | null): boolean => {
            const state = useEditorStore.getState()
            const clickPathIds = collectNodePathIds(targetEl)

            // Match Figma cadence: first try the currently selected node for progressive drill-in.
            if (state.selectedIds.length === 1) {
                const selectedId = state.selectedIds[0]
                if (activateNodeByDoubleTap(selectedId, clickPathIds)) {
                    return true
                }
            }

            if (!clickTargetId) return false

            if (!state.selectedIds.includes(clickTargetId)) {
                state.selectNode(clickTargetId, false)
            }

            return activateNodeByDoubleTap(clickTargetId, clickPathIds)
        },
        [activateNodeByDoubleTap, collectNodePathIds]
    )

    // ----------------------------------------------------------
    // Pointer handlers: hand-drag to pan + node selection + drag
    // ----------------------------------------------------------
    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            // ── Commit any active text editing (including TopBar inputs) ──
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur()
            }

            const editorState = useEditorStore.getState()
            if (editorState.editingNodeId) {
                const editingEl = viewportRef.current?.querySelector(
                    `[data-node-id="${editorState.editingNodeId}"]`
                ) as HTMLElement
                if (editingEl) editingEl.blur()
            }

            const pointerCanvas = screenToCanvas(e.clientX, e.clientY)
            useEditorStore.getState().setPasteAnchor(pointerCanvas.x, pointerCanvas.y)

            // ── Middle mouse / hand tool → pan ────────────────────
            if (e.button === 1 || isHandMode) {
                lastTapRef.current = null
                setIsDragging(true)
                panSourceRef.current = e.button === 1 ? 'middle' : 'space'
                lastPointerRef.current = { x: e.clientX, y: e.clientY }
                    ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                e.preventDefault()
                return
            }

            // Only handle left click from here
            if (e.button !== 0) {
                lastTapRef.current = null
                return
            }

            // ── Generation lock gate ──────────────────────────────
            // Block all mutating pointer interactions during AI generation.
            // Pan/zoom (above) is still allowed.
            if (useGenerationStore.getState().isLocked) {
                return
            }

            // ── Frame tool → start drawing ────────────────────────
            if (activeTool === 'frame') {
                lastTapRef.current = null
                const pos = screenToCanvas(e.clientX, e.clientY)
                setDrawState({
                    startCanvasX: pos.x,
                    startCanvasY: pos.y,
                    currentCanvasX: pos.x,
                    currentCanvasY: pos.y,
                })
                viewportRef.current?.setPointerCapture(e.pointerId)
                e.preventDefault()
                return
            }

            // ── Text tool → click to create + edit ────────────────
            if (activeTool === 'text') {
                lastTapRef.current = null
                const pos = screenToCanvas(e.clientX, e.clientY)
                const store = useEditorStore.getState()

                // Figma-like behavior: parent by pointer location, not stale selection context.
                let parentId: string | undefined
                let adjustedX = pos.x
                let adjustedY = pos.y

                const container = findContainingFrameAtPoint(store.nodes, pos.x, pos.y)
                if (container) {
                    parentId = container.frameId
                    adjustedX = container.relX
                    adjustedY = container.relY
                }

                const textNode = createText({
                    x: adjustedX,
                    y: adjustedY,
                    characters: '',
                })
                store.addNode(textNode, parentId)
                store.selectNode(textNode.id)
                store.setActiveTool('select')
                store.setEditingNodeId(textNode.id)
                e.preventDefault()
                return
            }

            // ── Pen tool → place vertices ──────────────────────────
            if (activeTool === 'pen') {
                lastTapRef.current = null
                handlePenPointerDown(e)
                return
            }

            // ── Select tool ───────────────────────────────────────
            if (activeTool === 'select') {
                const target = e.target as HTMLElement

                // Single-click while in vector edit mode → exit it (recomputes bbox, shows selection frame)
                const currentVectorEditId = useEditorStore.getState().vectorEditNodeId
                if (currentVectorEditId) {
                    lastTapRef.current = null
                    useEditorStore.getState().exitVectorEditMode()
                    return
                }

                // Check if clicking a resize handle
                const handleDir = target.dataset.handle as HandleDirection | undefined
                const handleNodeId = target.dataset.nodeHandle
                if (handleDir && handleNodeId) {
                    lastTapRef.current = null
                    startResize(handleDir, handleNodeId, e.clientX, e.clientY, e.pointerId)
                    viewportRef.current?.setPointerCapture(e.pointerId)
                    e.preventDefault()
                    return
                }

                // Cmd/Ctrl modifier enables deep target resolution.
                // Combined with Shift, this becomes deep multi-select.
                const isDeepSelect = e.metaKey || e.ctrlKey
                const clickPathIds = collectNodePathIds(target)
                const clickTargetId = resolveClickTarget(target, isDeepSelect)
                const dragTargetId = e.shiftKey
                    ? clickTargetId
                    : resolvePointerDownTarget(target, isDeepSelect)

                if (clickTargetId && !e.shiftKey && !isDeepSelect && !e.altKey) {
                    const previousTap = lastTapRef.current
                    const elapsed = previousTap ? e.timeStamp - previousTap.time : Number.POSITIVE_INFINITY
                    const distance = previousTap
                        ? Math.hypot(e.clientX - previousTap.x, e.clientY - previousTap.y)
                        : Number.POSITIVE_INFINITY

                    const targetMatches = !!previousTap && previousTap.clickTargetId !== null && (
                        previousTap.clickTargetId === clickTargetId ||
                        previousTap.pathIds.includes(clickTargetId) ||
                        clickPathIds.includes(previousTap.clickTargetId)
                    )

                    const isDoubleTap = elapsed <= DOUBLE_TAP_WINDOW_MS &&
                        distance <= DOUBLE_TAP_MAX_DISTANCE &&
                        targetMatches

                    if (isDoubleTap) {
                        lastTapRef.current = null
                        if (triggerDoubleTapAction(target, clickTargetId)) {
                            lastManualDoubleTapAtRef.current = e.timeStamp
                            e.preventDefault()
                            return
                        }
                    }

                    lastTapRef.current = {
                        time: e.timeStamp,
                        x: e.clientX,
                        y: e.clientY,
                        clickTargetId,
                        pathIds: clickPathIds,
                    }
                } else {
                    lastTapRef.current = null
                }

                if (clickTargetId && dragTargetId) {
                    const currentState = useEditorStore.getState()

                    if (
                        currentState.enteredFrameId &&
                        !isNodeWithinFrameScope(currentState.nodes, clickTargetId, currentState.enteredFrameId)
                    ) {
                        // Clicking outside the entered frame should clear drill-in context first.
                        currentState.exitFrame()
                        currentState.deselectAll()
                    }

                    if (e.shiftKey) {
                        // Shift-click: toggle in selection
                        currentState.selectNode(clickTargetId, true)
                        // Only start drag if the node is still selected after toggle
                        const updatedState = useEditorStore.getState()
                        if (updatedState.selectedIds.includes(clickTargetId)) {
                            startPotentialDrag(
                                clickTargetId,
                                e.clientX,
                                e.clientY,
                                e.pointerId,
                                true,
                                clickTargetId,
                            )
                            viewportRef.current?.setPointerCapture(e.pointerId)
                        }
                    } else {
                        const shouldDeferClickSelection =
                            !isDeepSelect &&
                            dragTargetId !== clickTargetId &&
                            currentState.selectedIds.length === 1 &&
                            currentState.selectedIds[0] === dragTargetId

                        if (!shouldDeferClickSelection && !currentState.selectedIds.includes(clickTargetId)) {
                            // Click on unselected node: replace selection
                            currentState.selectNode(clickTargetId, false)
                        }

                        // Drag uses drag target while click intent is preserved for pointer-up commit.
                        startPotentialDrag(
                            dragTargetId,
                            e.clientX,
                            e.clientY,
                            e.pointerId,
                            false,
                            clickTargetId,
                        )
                        // Set pointer capture for smooth out-of-bounds tracking
                        viewportRef.current?.setPointerCapture(e.pointerId)
                    }
                } else {
                    lastTapRef.current = null
                    // Clicked on empty canvas → start marquee selection
                    const state = useEditorStore.getState()
                    const pos = screenToCanvas(e.clientX, e.clientY)
                    const baseSelectionIds = [...state.selectedIds]

                    if (!e.shiftKey) {
                        if (shouldExitEnteredFrameOnCanvasClick(state.nodes, state.enteredFrameId, pos.x, pos.y)) {
                            state.exitFrame()
                        }
                        state.deselectAll()
                    }

                    if (marqueeSelectionRafRef.current !== null) {
                        cancelAnimationFrame(marqueeSelectionRafRef.current)
                        marqueeSelectionRafRef.current = null
                    }
                    marqueeSelectionQueuedRef.current = null
                    marqueeSelectionLastRef.current = e.shiftKey ? baseSelectionIds : []

                    setMarquee({
                        startX: pos.x,
                        startY: pos.y,
                        currentX: pos.x,
                        currentY: pos.y,
                        active: false,
                        shiftHeld: e.shiftKey,
                        deepSelect: e.metaKey || e.ctrlKey,
                        baseSelectionIds,
                    })
                    viewportRef.current?.setPointerCapture(e.pointerId)
                    e.preventDefault()
                }
            }
        },
        [
            isHandMode,
            activeTool,
            collectNodePathIds,
            resolveClickTarget,
            resolvePointerDownTarget,
            startPotentialDrag,
            startResize,
            screenToCanvas,
            handlePenPointerDown,
            triggerDoubleTapAction,
        ]
    )

    // ----------------------------------------------------------
    // Double-click: drill into frames
    // ----------------------------------------------------------
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (activeTool !== 'select') return

            // Ignore native dblclick if this gesture was already handled
            // via manual pointer-based double-tap detection.
            if (e.timeStamp - lastManualDoubleTapAtRef.current <= DOUBLE_TAP_WINDOW_MS) {
                return
            }

            const target = e.target as HTMLElement
            const clickTargetId = resolveClickTarget(target)
            if (!clickTargetId) return

            if (triggerDoubleTapAction(target, clickTargetId)) {
                lastManualDoubleTapAtRef.current = e.timeStamp
            }
        },
        [activeTool, resolveClickTarget, triggerDoubleTapAction]
    )

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault()

            // Block context menu during AI generation
            if (useGenerationStore.getState().isLocked) return

            const pos = screenToCanvas(e.clientX, e.clientY)
            const store = useEditorStore.getState()
            store.setPasteAnchor(pos.x, pos.y)

            const target = e.target as HTMLElement
            const nodeId = resolveClickTarget(target)
            if (nodeId && !store.selectedIds.includes(nodeId)) {
                store.selectNode(nodeId)
            }

            setContextMenu({ x: e.clientX, y: e.clientY })
        },
        [resolveClickTarget, screenToCanvas]
    )

    // ----------------------------------------------------------
    // Hover tracking: pointermove event delegation
    // ----------------------------------------------------------
    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            // Frame drawing takes priority
            if (drawState) {
                const pos = screenToCanvas(e.clientX, e.clientY)
                setDrawState(prev => prev ? {
                    ...prev,
                    currentCanvasX: pos.x,
                    currentCanvasY: pos.y,
                } : null)
                return
            }

            // Marquee selection tracking
            if (marquee) {
                const pos = screenToCanvas(e.clientX, e.clientY)
                const dx = pos.x - marquee.startX
                const dy = pos.y - marquee.startY
                const isActive = marquee.active || (Math.abs(dx) + Math.abs(dy)) > MARQUEE_THRESHOLD

                const shiftHeld = e.shiftKey
                const deepSelect = e.metaKey || e.ctrlKey

                if (isActive) {
                    const ids = getNodesInRect(
                        marquee.startX,
                        marquee.startY,
                        pos.x,
                        pos.y,
                        { deepSelect },
                    )
                    const nextSelection = shiftHeld
                        ? mergeUniqueIds(marquee.baseSelectionIds, ids)
                        : ids
                    queueMarqueeSelection(nextSelection)
                }

                setMarquee(prev => prev ? {
                    ...prev,
                    currentX: pos.x,
                    currentY: pos.y,
                    active: isActive,
                    shiftHeld,
                    deepSelect,
                } : null)
                return
            }

            // Resize takes highest priority
            if (onResizePointerMove(e.clientX, e.clientY, e.shiftKey)) return

            // Node drag takes priority
            if (onDragPointerMove(e.clientX, e.clientY, e.altKey)) return

            // Pan dragging (hand tool / middle mouse)
            if (isDragging) {
                const dx = e.clientX - lastPointerRef.current.x
                const dy = e.clientY - lastPointerRef.current.y
                const state = useEditorStore.getState()
                state.setPan(state.panX + dx, state.panY + dy)
                lastPointerRef.current = { x: e.clientX, y: e.clientY }
                return
            }

            // Pen tool cursor tracking
            if (activeTool === 'pen') {
                handlePenPointerMove(e.clientX, e.clientY, e.shiftKey, e.altKey)
                return
            }

            // Hover tracking — context-aware so hover matches what
            // would be selected on click (Figma behaviour)
            if (activeTool === 'select') {
                const target = e.target as HTMLElement
                lastHoverPointerRef.current = { x: e.clientX, y: e.clientY }
                const deepSelect = e.metaKey || e.ctrlKey
                const state = useEditorStore.getState()
                const nextHoveredId = resolveClickTarget(target, deepSelect)
                if (nextHoveredId !== state.hoveredId) {
                    state.setHoveredId(nextHoveredId)
                }
            }
        },
        [
            isDragging,
            activeTool,
            drawState,
            marquee,
            resolveClickTarget,
            onDragPointerMove,
            onResizePointerMove,
            screenToCanvas,
            handlePenPointerMove,
            getNodesInRect,
            queueMarqueeSelection,
        ]
    )

    useEffect(() => {
        const isModifierKey = (key: string) => key === 'Meta' || key === 'Control' || key === 'Shift'

        const refreshHoverFromModifierState = (e: KeyboardEvent) => {
            if (!isModifierKey(e.key)) return
            if (activeTool !== 'select') return
            if (isDragging || dragInfo.isDragging || resizeInfo.isResizing || drawState || marquee) return

            const viewport = viewportRef.current
            const pointer = lastHoverPointerRef.current
            if (!viewport || !pointer) return

            const target = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null
            const state = useEditorStore.getState()
            if (!target || !viewport.contains(target)) {
                if (state.hoveredId !== null) {
                    state.setHoveredId(null)
                }
                return
            }

            const deepSelect = e.metaKey || e.ctrlKey
            const nextHoveredId = resolveClickTarget(target, deepSelect)
            if (nextHoveredId !== state.hoveredId) {
                state.setHoveredId(nextHoveredId)
            }
        }

        window.addEventListener('keydown', refreshHoverFromModifierState)
        window.addEventListener('keyup', refreshHoverFromModifierState)
        return () => {
            window.removeEventListener('keydown', refreshHoverFromModifierState)
            window.removeEventListener('keyup', refreshHoverFromModifierState)
        }
    }, [activeTool, isDragging, dragInfo.isDragging, resizeInfo.isResizing, drawState, marquee, resolveClickTarget])

    const handlePointerUp = useCallback(() => {
        // Pen tool: finalize drag gesture (bezier handle)
        if (activeTool === 'pen') {
            handlePenPointerUp()
            return
        }

        // Marquee selection complete → select all nodes within the rect
        if (marquee) {
            if (marquee.active) {
                const ids = getNodesInRect(
                    marquee.startX, marquee.startY,
                    marquee.currentX, marquee.currentY,
                    { deepSelect: marquee.deepSelect },
                )

                const nextSelection = marquee.shiftHeld
                    ? mergeUniqueIds(marquee.baseSelectionIds, ids)
                    : ids

                const prevSelection = marqueeSelectionLastRef.current ?? useEditorStore.getState().selectedIds
                if (!areIdArraysEqual(prevSelection, nextSelection)) {
                    useEditorStore.getState().setSelectedIds(nextSelection)
                }
            }

            if (marqueeSelectionRafRef.current !== null) {
                cancelAnimationFrame(marqueeSelectionRafRef.current)
                marqueeSelectionRafRef.current = null
            }
            marqueeSelectionQueuedRef.current = null
            marqueeSelectionLastRef.current = null

            setMarquee(null)
            return
        }

        // Frame drawing complete → create the frame
        if (drawState) {
            const x = Math.min(drawState.startCanvasX, drawState.currentCanvasX)
            const y = Math.min(drawState.startCanvasY, drawState.currentCanvasY)
            const w = Math.abs(drawState.currentCanvasX - drawState.startCanvasX)
            const h = Math.abs(drawState.currentCanvasY - drawState.startCanvasY)

            const MIN_DRAW = 3
            const frameX = w > MIN_DRAW ? x : drawState.startCanvasX - 50
            const frameY = h > MIN_DRAW ? y : drawState.startCanvasY - 50
            const frameW = w > MIN_DRAW ? w : 100
            const frameH = h > MIN_DRAW ? h : 100

            const store = useEditorStore.getState()

            // Auto-detect parent frame: if drawing starts inside an existing frame, nest into it
            // Only auto-nest if the ENTIRE drawn rectangle fits inside the target frame.
            let parentId: string | undefined
            let adjustedX = frameX
            let adjustedY = frameY

            const container = findContainingFrameAtPoint(
                store.nodes,
                drawState.startCanvasX,
                drawState.startCanvasY,
            )
            if (container) {
                const potentialParent = findNodeById(store.nodes, container.frameId)
                // Check entire drawn rect fits inside the parent frame
                const fitsInside = potentialParent &&
                    frameX >= container.frameAbsX &&
                    frameY >= container.frameAbsY &&
                    frameX + frameW <= container.frameAbsX + potentialParent.width &&
                    frameY + frameH <= container.frameAbsY + potentialParent.height

                if (fitsInside) {
                    parentId = container.frameId
                    adjustedX = frameX - container.frameAbsX
                    adjustedY = frameY - container.frameAbsY
                }
            }

            const frame = createFrame({
                x: adjustedX,
                y: adjustedY,
                width: frameW,
                height: frameH,
                fills: [{ type: 'solid', color: '#FFFFFF' }],
                layout: { mode: 'none' },
            })

            store.addNode(frame, parentId)
            store.selectNode(frame.id)
            store.setActiveTool('select')

            setDrawState(null)
            return
        }

        // Resize takes priority
        if (onResizePointerUp()) return

        // Node drag takes priority
        if (onDragPointerUp()) return

        if (isDragging) {
            setIsDragging(false)
            panSourceRef.current = null
        }
    }, [isDragging, activeTool, drawState, marquee, getNodesInRect, onDragPointerUp, onResizePointerUp, handlePenPointerUp])

    const handlePointerLeave = useCallback(() => {
        lastTapRef.current = null
        lastHoverPointerRef.current = null
        useEditorStore.getState().setHoveredId(null)
    }, [])

    // ----------------------------------------------------------
    // Cursor
    // ----------------------------------------------------------
    // Pen tool SVG cursors (pen nib shape, hotspot at tip)
    const penCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23111' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 19l7-7 3 3-7 7-3-3z'/%3E%3Cpath d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='M2 2l7.586 7.586'/%3E%3Ccircle cx='11' cy='11' r='2'/%3E%3C/svg%3E") 1 1, crosshair`
    const penCloseCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23111' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 19l7-7 3 3-7 7-3-3z'/%3E%3Cpath d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='M2 2l7.586 7.586'/%3E%3Ccircle cx='11' cy='11' r='2'/%3E%3Ccircle cx='20' cy='20' r='3' stroke='%231a6dff'/%3E%3C/svg%3E") 1 1, crosshair`

    const cursor = resizeInfo.isResizing
        ? handleToCursor(resizeInfo.handle!)
        : isHandMode
            ? isDragging
                ? 'grabbing'
                : 'grab'
            : drawState
                ? 'crosshair'
                : dragInfo.isDragging
                    ? 'grabbing'
                    : activeTool === 'pen'
                        ? penNearStart
                            ? penCloseCursor
                            : penIsDrawing
                                ? penCursor
                                : penCursor
                        : (activeTool === 'frame' || activeTool === 'text')
                            ? 'crosshair'
                            : 'default'
    // ----------------------------------------------------------
    // Render
    // ----------------------------------------------------------
    return (
        <div
            ref={viewportRef}
            data-canvas-viewport
            className="relative w-full h-full overflow-hidden select-none"
            style={{
                cursor,
                backgroundColor: canvasColor,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            {/* Transform container — CSS custom properties drive coordinate-space rendering */}
            <div
                ref={transformRef}
                className={cn("absolute top-0 left-0", isViewportAnimating && "transition-viewport")}
                style={{ '--z': zoom, '--px': panX, '--py': panY } as unknown as CSSProperties}
            >
                {nodes.map((node) => (
                    <NodeRenderer key={node.id} node={node} isTopLevel />
                ))}

                {/* Frame draw preview (canvas coordinates scaled via CSS vars) */}
                {drawState && (
                    <div
                        className="absolute border border-primary/70 bg-primary/5 pointer-events-none"
                        style={{
                            left: `calc(${Math.min(drawState.startCanvasX, drawState.currentCanvasX)}px * var(--z, 1) + var(--px, 0) * 1px)`,
                            top: `calc(${Math.min(drawState.startCanvasY, drawState.currentCanvasY)}px * var(--z, 1) + var(--py, 0) * 1px)`,
                            width: `calc(${Math.abs(drawState.currentCanvasX - drawState.startCanvasX)}px * var(--z, 1))`,
                            height: `calc(${Math.abs(drawState.currentCanvasY - drawState.startCanvasY)}px * var(--z, 1))`,
                            borderWidth: `calc(2px * var(--z, 1))`,
                            borderRadius: `calc(1px * var(--z, 1))`,
                        }}
                    />
                )}
            </div>

            {/* Selection & hover overlays (screen coordinates, above content) */}
            <HoverOverlay viewportRef={viewportRef} />
            <PaddingOverlay viewportRef={viewportRef} />
            <CanvasPaddingZones viewportRef={viewportRef} />
            <CanvasGapZones viewportRef={viewportRef} />
            <CanvasMarginZones viewportRef={viewportRef} />
            <GridOverlay viewportRef={viewportRef} />
            <SelectionOverlay viewportRef={viewportRef} />

            {/* Gradient handles (shown when gradient fill picker is open) */}
            <GradientHandleOverlay viewportRef={viewportRef} />

            {/* Image crop handles (shown when an image fill has fit=crop) */}
            <ImageCropOverlay viewportRef={viewportRef} />

            {/* Pen tool drawing overlay (shown while placing vertices) */}
            <PenOverlay />

            {/* Vector edit anchor points + bezier handles (shown in vector edit mode) */}
            <AnchorPointOverlay />

            {/* Snap alignment guides (shown while dragging freeform) */}
            <SnapGuideOverlay dragInfo={dragInfo} />

            {/* Measurement lines (show distances when dragging inside a frame) */}
            <MeasurementOverlay viewportRef={viewportRef} isDragging={dragInfo.isDragging} />

            {/* Drag insertion indicator (reorder mode) */}
            <DragInsertIndicator indicator={dragInfo.indicator} />

            {/* Marquee selection rectangle (screen coordinates) */}
            {marquee && marquee.active && (() => {
                const left = Math.min(marquee.startX, marquee.currentX) * zoom + panX
                const top = Math.min(marquee.startY, marquee.currentY) * zoom + panY
                const width = Math.abs(marquee.currentX - marquee.startX) * zoom
                const height = Math.abs(marquee.currentY - marquee.startY) * zoom
                return (
                    <div
                        className="absolute pointer-events-none border border-blue-500/80 bg-blue-500/10 rounded-[1px]"
                        style={{ left, top, width, height }}
                    />
                )
            })()}

            {contextMenu && (
                <div
                    data-editor-context-menu="true"
                    className="fixed z-50 min-w-55 rounded-lg bg-popover border border-border shadow-lg py-1"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store.selectedIds.length > 0) {
                                store.copyNodes(store.selectedIds)
                            }
                            setContextMenu(null)
                        }}
                        disabled={selectedCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            selectedCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Copy
                    </button>
                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store.selectedIds.length > 0) {
                                store.cutNodes(store.selectedIds)
                            }
                            setContextMenu(null)
                        }}
                        disabled={selectedCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            selectedCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Cut
                    </button>

                    <div className="my-1 h-px bg-border/70" />

                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store._clipboard.length > 0) {
                                store.pasteNodes()
                            }
                            setContextMenu(null)
                        }}
                        disabled={clipboardCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            clipboardCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Paste
                    </button>
                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store._clipboard.length > 0 && store.selectedIds.length > 0) {
                                store.pasteOverSelection()
                            }
                            setContextMenu(null)
                        }}
                        disabled={clipboardCount === 0 || selectedCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            clipboardCount === 0 || selectedCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Paste Over Selection
                    </button>
                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store._clipboard.length > 0) {
                                store.pasteHere()
                            }
                            setContextMenu(null)
                        }}
                        disabled={clipboardCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            clipboardCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Paste Here
                    </button>

                    <div className="my-1 h-px bg-border/70" />

                    <button
                        onClick={() => {
                            const store = useEditorStore.getState()
                            if (store.selectedIds.length > 0) {
                                store.duplicateNodes(store.selectedIds)
                            }
                            setContextMenu(null)
                        }}
                        disabled={selectedCount === 0}
                        className={cn(
                            'flex items-center w-full px-3 py-1.5 text-xs transition-colors',
                            selectedCount === 0
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-muted/80 text-popover-foreground'
                        )}
                    >
                        Duplicate
                    </button>
                </div>
            )}

            {/* Floating toolbar — centered at top of canvas */}
            {showToolbar && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                    <Toolbar />
                </div>
            )}

            {/* Vector edit mode toolbar — bottom center, above main toolbar */}
            <VectorEditToolbar />

            {/* AI Generation overlay — lock indicator + pointer blocker */}
            <GenerationOverlay />

        </div>
    )
}
