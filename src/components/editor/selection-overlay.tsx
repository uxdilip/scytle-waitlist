'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { ScytleNode } from '@/types/canvas'
import { findNodeById, findParentOfNode } from '@/types/canvas'
import type { InsertIndicator } from './hooks/use-node-drag'
import { gapFromMeasuredPx, isAutoGapLayout, toFixedGapLayout } from './layout-gap-utils'

// ============================================================
// Types
// ============================================================

interface ScreenRect {
    x: number
    y: number
    width: number
    height: number
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const CORNER_HANDLE_SIZE = 8
const EDGE_HIT_ZONE = 8 // invisible hit area thickness for edge resize
const CORNER_POSITIONS: HandlePosition[] = ['nw', 'ne', 'se', 'sw']
const EDGE_POSITIONS: HandlePosition[] = ['n', 'e', 's', 'w']

// ============================================================
// Helpers
// ============================================================

/**
 * Get a node's bounding rect in screen coordinates by querying
 * the DOM element with `data-node-id`.
 */
function getNodeScreenRect(
    nodeId: string,
    viewportEl: HTMLElement | null
): ScreenRect | null {
    if (!viewportEl) return null

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

/** Corner handle positioning — small visible dots at each corner */
function getCornerHandleStyle(
    pos: HandlePosition,
    rect: ScreenRect
): { left: number; top: number; cursor: string } {
    const halfH = CORNER_HANDLE_SIZE / 2
    const { x, y, width, height } = rect

    switch (pos) {
        case 'nw': return { left: x - halfH, top: y - halfH, cursor: 'nwse-resize' }
        case 'ne': return { left: x + width - halfH, top: y - halfH, cursor: 'nesw-resize' }
        case 'se': return { left: x + width - halfH, top: y + height - halfH, cursor: 'nwse-resize' }
        case 'sw': return { left: x - halfH, top: y + height - halfH, cursor: 'nesw-resize' }
        default: return { left: x, top: y, cursor: 'default' }
    }
}

/** Edge hit zone positioning — invisible strips along each edge for resize dragging */
function getEdgeHitZoneStyle(
    pos: HandlePosition,
    rect: ScreenRect
): { left: number; top: number; width: number; height: number; cursor: string } {
    const halfZ = EDGE_HIT_ZONE / 2
    const inset = CORNER_HANDLE_SIZE // don't overlap corner handles
    const { x, y, width, height } = rect

    switch (pos) {
        case 'n': return {
            left: x + inset, top: y - halfZ,
            width: Math.max(0, width - inset * 2), height: EDGE_HIT_ZONE,
            cursor: 'ns-resize',
        }
        case 's': return {
            left: x + inset, top: y + height - halfZ,
            width: Math.max(0, width - inset * 2), height: EDGE_HIT_ZONE,
            cursor: 'ns-resize',
        }
        case 'e': return {
            left: x + width - halfZ, top: y + inset,
            width: EDGE_HIT_ZONE, height: Math.max(0, height - inset * 2),
            cursor: 'ew-resize',
        }
        case 'w': return {
            left: x - halfZ, top: y + inset,
            width: EDGE_HIT_ZONE, height: Math.max(0, height - inset * 2),
            cursor: 'ew-resize',
        }
        default: return { left: x, top: y, width: 0, height: 0, cursor: 'default' }
    }
}

// ============================================================
// SelectionOverlay — blue outlines + 8 handles per selected node
// ============================================================

export function SelectionOverlay({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const imageCropEditingFillIdx = useEditorStore((s) => s.imageCropEditingFillIdx)
    // Figma: selection handles hide when in vector edit mode (anchor points take over)
    const vectorEditNodeId = useEditorStore((s) => s.vectorEditNodeId)
    // Hide selection bounds when actively inline-editing text
    const editingNodeId = useEditorStore((s) => s.editingNodeId)

    const [rects, setRects] = useState<Map<string, ScreenRect>>(new Map())
    const rafRef = useRef<number>(0)
    const rectsRef = useRef<Map<string, ScreenRect>>(new Map())
    const isMountedRef = useRef(true)

    // Update on every animation frame for smooth tracking during pan/zoom
    useEffect(() => {
        isMountedRef.current = true

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            if (!viewport || selectedIds.length === 0) {
                if (rectsRef.current.size > 0) {
                    rectsRef.current = new Map()
                    setRects(new Map())
                }
                // Schedule next frame only if we have selections
                if (selectedIds.length > 0) {
                    rafRef.current = requestAnimationFrame(loop)
                }
                return
            }

            const newRects = new Map<string, ScreenRect>()
            for (const id of selectedIds) {
                const rect = getNodeScreenRect(id, viewport)
                if (rect) newRects.set(id, rect)
            }

            // Compare with existing rects — use tolerance for floating point
            const prevRects = rectsRef.current
            let changed = prevRects.size !== newRects.size
            if (!changed) {
                for (const [id, newRect] of newRects) {
                    const prevRect = prevRects.get(id)
                    if (
                        !prevRect ||
                        Math.abs(prevRect.x - newRect.x) > 0.1 ||
                        Math.abs(prevRect.y - newRect.y) > 0.1 ||
                        Math.abs(prevRect.width - newRect.width) > 0.1 ||
                        Math.abs(prevRect.height - newRect.height) > 0.1
                    ) {
                        changed = true
                        break
                    }
                }
            }

            if (changed && isMountedRef.current) {
                rectsRef.current = newRects
                setRects(newRects)
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        // Always start RAF loop asynchronously to avoid synchronous setState cascades
        if (selectedIds.length > 0) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (rectsRef.current.size > 0) {
            rectsRef.current = new Map()
            setRects(new Map())
        }

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [selectedIds, viewportRef])

    if (rects.size === 0) return null

    // Hide selection overlay when in crop mode — crop overlay handles its own borders
    if (imageCropEditingFillIdx !== null) return null

    return (
        <>
            {Array.from(rects.entries()).map(([id, rect]) => (
                <div key={id}>
                    {/* Hide everything when this node is in vector edit mode or text edit mode */}
                    {vectorEditNodeId !== id && editingNodeId !== id && (
                        <>
                            {/* Blue outline */}
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: rect.x,
                                    top: rect.y,
                                    width: rect.width,
                                    height: rect.height,
                                    border: '1.5px solid #3b82f6',
                                    borderRadius: 1,
                                    zIndex: 999,
                                }}
                            />

                            {/* Resize handles */}
                            {!vectorEditNodeId && (
                                <>
                                    {/* 4 corner resize handles — visible dots */}
                                    {CORNER_POSITIONS.map((pos) => {
                                        const hs = getCornerHandleStyle(pos, rect)
                                        return (
                                            <div
                                                key={pos}
                                                data-handle={pos}
                                                data-node-handle={id}
                                                style={{
                                                    position: 'absolute',
                                                    left: hs.left,
                                                    top: hs.top,
                                                    width: CORNER_HANDLE_SIZE,
                                                    height: CORNER_HANDLE_SIZE,
                                                    backgroundColor: '#ffffff',
                                                    border: '1.5px solid #3b82f6',
                                                    borderRadius: 1,
                                                    cursor: hs.cursor,
                                                    zIndex: 1000,
                                                    pointerEvents: 'auto',
                                                }}
                                            />
                                        )
                                    })}

                                    {/* 4 edge resize hit zones — invisible but interactive */}
                                    {EDGE_POSITIONS.map((pos) => {
                                        const ez = getEdgeHitZoneStyle(pos, rect)
                                        return (
                                            <div
                                                key={pos}
                                                data-handle={pos}
                                                data-node-handle={id}
                                                style={{
                                                    position: 'absolute',
                                                    left: ez.left,
                                                    top: ez.top,
                                                    width: ez.width,
                                                    height: ez.height,
                                                    cursor: ez.cursor,
                                                    zIndex: 1000,
                                                    pointerEvents: 'auto',
                                                }}
                                            />
                                        )
                                    })}
                                </>
                            )}
                        </>
                    )}
                </div>
            ))}
        </>
    )
}

// ============================================================
// HoverOverlay — light blue dashed outline on hovered node
// ============================================================

export function HoverOverlay({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const hoveredId = useEditorStore((s) => s.hoveredId)
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const isNodeResizeActive = useEditorStore((s) => s.isNodeResizeActive)

    const [rect, setRect] = useState<ScreenRect | null>(null)
    const rafRef = useRef<number>(0)
    const rectRef = useRef<ScreenRect | null>(null)
    const isMountedRef = useRef(true)

    // Don't show hover on already-selected nodes
    const effectiveHoveredId =
        hoveredId && !selectedIds.includes(hoveredId) ? hoveredId : null

    useEffect(() => {
        isMountedRef.current = true

        if (isNodeResizeActive) {
            if (rectRef.current !== null) {
                rectRef.current = null
            }
            return () => {
                isMountedRef.current = false
                cancelAnimationFrame(rafRef.current)
            }
        }

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            if (!viewport || !effectiveHoveredId) {
                if (rectRef.current !== null) {
                    rectRef.current = null
                    setRect(null)
                }
                return
            }

            const newRect = getNodeScreenRect(effectiveHoveredId, viewport)
            const prev = rectRef.current

            const changed = !prev || !newRect ||
                Math.abs(prev.x - newRect.x) > 0.1 ||
                Math.abs(prev.y - newRect.y) > 0.1 ||
                Math.abs(prev.width - newRect.width) > 0.1 ||
                Math.abs(prev.height - newRect.height) > 0.1

            if (changed && isMountedRef.current) {
                rectRef.current = newRect
                setRect(newRect)
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        if (effectiveHoveredId) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (rectRef.current !== null) {
            rectRef.current = null
            setRect(null)
        }

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [effectiveHoveredId, isNodeResizeActive, viewportRef])

    if (!rect || isNodeResizeActive) return null

    return (
        <div
            className="pointer-events-none"
            style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                border: '1px solid #93c5fd',
                borderRadius: 1,
                zIndex: 998,
            }}
        />
    )
}

// ============================================================
// PaddingOverlay — Figma-style blue hatch pattern showing padding
// Supports directional display (horizontal, vertical, or individual sides)
// Also shows frame hover guides (4 blue padding lines + pink gap lines)
// ============================================================

type PaddingDirection = 'all' | 'horizontal' | 'vertical' | 'left' | 'right' | 'top' | 'bottom'

const HATCH_BG = (color: string) =>
    `repeating-linear-gradient(45deg, transparent, transparent 2px, ${color} 2px, ${color} 4px)`

const BLUE_HATCH = HATCH_BG('rgba(59, 130, 246, 0.12)')
const BLUE_LABEL = 'rgba(59, 130, 246, 0.9)'

function shouldShowSide(direction: PaddingDirection, side: 'top' | 'right' | 'bottom' | 'left'): boolean {
    if (direction === 'all') return true
    if (direction === 'horizontal') return side === 'left' || side === 'right'
    if (direction === 'vertical') return side === 'top' || side === 'bottom'
    return direction === side
}

export function PaddingOverlay({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const paddingOverlayNodeId = useEditorStore((s) => s.paddingOverlayNodeId)
    const paddingOverlayDirection = useEditorStore((s) => s.paddingOverlayDirection)
    const isNodeResizeActive = useEditorStore((s) => s.isNodeResizeActive)
    const nodes = useEditorStore((s) => s.nodes)
    const zoom = useEditorStore((s) => s.zoom)

    const [rect, setRect] = useState<ScreenRect | null>(null)
    const rafRef = useRef<number>(0)
    const rectRef = useRef<ScreenRect | null>(null)
    const isMountedRef = useRef(true)

    // Panel-triggered or canvas-triggered overlay node
    const overlayNode = paddingOverlayNodeId ? findNodeById(nodes, paddingOverlayNodeId) : null
    const overlayPadding = overlayNode && overlayNode.type === 'frame' ? overlayNode.padding : null

    useEffect(() => {
        isMountedRef.current = true

        if (isNodeResizeActive) {
            if (rectRef.current !== null) {
                rectRef.current = null
            }
            return () => {
                isMountedRef.current = false
                cancelAnimationFrame(rafRef.current)
            }
        }

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            if (!viewport || !paddingOverlayNodeId) {
                if (rectRef.current !== null) {
                    rectRef.current = null
                    setRect(null)
                }
                return
            }

            const newRect = getNodeScreenRect(paddingOverlayNodeId, viewport)
            const prev = rectRef.current

            const changed = !prev || !newRect ||
                Math.abs(prev.x - newRect.x) > 0.1 ||
                Math.abs(prev.y - newRect.y) > 0.1 ||
                Math.abs(prev.width - newRect.width) > 0.1 ||
                Math.abs(prev.height - newRect.height) > 0.1

            if (changed && isMountedRef.current) {
                rectRef.current = newRect
                setRect(newRect)
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        if (paddingOverlayNodeId) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (rectRef.current !== null) {
            rectRef.current = null
            setRect(null)
        }

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [paddingOverlayNodeId, isNodeResizeActive, viewportRef])

    const direction = paddingOverlayDirection ?? 'all'

    if (isNodeResizeActive || !rect || !overlayPadding) return null

    return (
        <div className="pointer-events-none" style={{ position: 'absolute', inset: 0, zIndex: 997 }}>
            <PaddingHatchRects
                rect={rect}
                padding={overlayPadding}
                zoom={zoom}
                direction={direction}
            />
        </div>
    )
}

/** Blue hatch rectangles for padding areas (panel hover) */
function PaddingHatchRects({
    rect,
    padding,
    zoom,
    direction,
}: {
    rect: ScreenRect
    padding: { top: number; right: number; bottom: number; left: number }
    zoom: number
    direction: PaddingDirection
}) {
    const pt = padding.top * zoom
    const pr = padding.right * zoom
    const pb = padding.bottom * zoom
    const pl = padding.left * zoom

    return (
        <>
            {/* Top padding */}
            {pt > 0 && shouldShowSide(direction, 'top') && (
                <div style={{
                    position: 'absolute',
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: pt,
                    background: BLUE_HATCH,
                    borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                }} />
            )}
            {/* Bottom padding */}
            {pb > 0 && shouldShowSide(direction, 'bottom') && (
                <div style={{
                    position: 'absolute',
                    left: rect.x,
                    top: rect.y + rect.height - pb,
                    width: rect.width,
                    height: pb,
                    background: BLUE_HATCH,
                    borderTop: '1px solid rgba(59, 130, 246, 0.3)',
                }} />
            )}
            {/* Left padding */}
            {pl > 0 && shouldShowSide(direction, 'left') && (
                <div style={{
                    position: 'absolute',
                    left: rect.x,
                    top: rect.y + (shouldShowSide(direction, 'top') ? pt : 0),
                    width: pl,
                    height: rect.height - (shouldShowSide(direction, 'top') ? pt : 0) - (shouldShowSide(direction, 'bottom') ? pb : 0),
                    background: BLUE_HATCH,
                    borderRight: '1px solid rgba(59, 130, 246, 0.3)',
                }} />
            )}
            {/* Right padding */}
            {pr > 0 && shouldShowSide(direction, 'right') && (
                <div style={{
                    position: 'absolute',
                    left: rect.x + rect.width - pr,
                    top: rect.y + (shouldShowSide(direction, 'top') ? pt : 0),
                    width: pr,
                    height: rect.height - (shouldShowSide(direction, 'top') ? pt : 0) - (shouldShowSide(direction, 'bottom') ? pb : 0),
                    background: BLUE_HATCH,
                    borderLeft: '1px solid rgba(59, 130, 246, 0.3)',
                }} />
            )}
        </>
    )
}

// ============================================================
// CanvasPaddingZones — interactive transparent divs over each
// padding area of selected auto-layout frames. Shows center
// handles for drag-to-resize; hover highlights with blue hatch.
// ============================================================

type PaddingSide = 'top' | 'right' | 'bottom' | 'left'
type PaddingDragMode = 'single' | 'opposite' | 'all'

const OPPOSITE_SIDE: Record<PaddingSide, PaddingSide> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
}

const ALL_PADDING_SIDES: PaddingSide[] = ['top', 'right', 'bottom', 'left']

// Center handle: small perpendicular line in the middle of each padding zone
const CENTER_HANDLE_LENGTH = 16
const CENTER_HANDLE_THICKNESS = 2
// Hit area around center handle — ONLY this area is interactive.
// The rest of the padding zone is pointer-events:none so resize handles
// remain accessible at edges/corners (fixes accidental padding drag).
const CENTER_HANDLE_HIT_WIDTH = 16  // along the edge (perpendicular to drag)
const CENTER_HANDLE_HIT_DEPTH = 12  // into the padding (parallel to drag)
const PADDING_DRAG_DEAD_ZONE = 3
const PADDING_BIG_NUDGE = 10

function getPaddingDragMode(altKey: boolean, shiftKey: boolean): PaddingDragMode {
    if (altKey && shiftKey) return 'all'
    if (altKey) return 'opposite'
    return 'single'
}

function getPaddingSidesForMode(side: PaddingSide, mode: PaddingDragMode): PaddingSide[] {
    if (mode === 'all') return ALL_PADDING_SIDES
    if (mode === 'opposite') return [side, OPPOSITE_SIDE[side]]
    return [side]
}

function getPaddingOverlayDirectionForMode(
    side: PaddingSide,
    mode: PaddingDragMode
): PaddingDirection {
    if (mode === 'all') return 'all'
    if (mode === 'opposite') {
        return side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
    }
    return side
}

function quantizePaddingDelta(delta: number, useBigNudge: boolean): number {
    if (!useBigNudge) return delta
    return Math.round(delta / PADDING_BIG_NUDGE) * PADDING_BIG_NUDGE
}

function computeDriverPaddingValue(
    startPadding: { top: number; right: number; bottom: number; left: number },
    side: PaddingSide,
    delta: number
): number {
    return Math.max(0, Math.round(startPadding[side] + delta))
}

export function CanvasPaddingZones({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const isNodeResizeActive = useEditorStore((s) => s.isNodeResizeActive)
    const nodes = useEditorStore((s) => s.nodes)
    const zoom = useEditorStore((s) => s.zoom)
    const updateNode = useEditorStore((s) => s.updateNode)
    const setPaddingOverlay = useEditorStore((s) => s.setPaddingOverlay)
    const beginBatch = useEditorStore((s) => s.beginBatch)
    const endBatch = useEditorStore((s) => s.endBatch)

    const [rect, setRect] = useState<ScreenRect | null>(null)
    const [hoveredSide, setHoveredSide] = useState<PaddingSide | null>(null)
    const [handleHoveredSide, setHandleHoveredSide] = useState<PaddingSide | null>(null)
    const [inlineInput, setInlineInput] = useState<{
        side: PaddingSide
        targetSides: PaddingSide[]
        x: number
        y: number
        value: number
    } | null>(null)
    const rafRef = useRef<number>(0)
    const [dragCursor, setDragCursor] = useState<{ x: number; y: number; value: number } | null>(null)
    const dragCursorRaf = useRef<number>(0)
    const dragRef = useRef<{
        side: PaddingSide
        startPadding: { top: number; right: number; bottom: number; left: number }
        startPos: number
        nodeId: string
    } | null>(null)
    const pointerSessionCleanupRef = useRef<(() => void) | null>(null)

    // Only show on single selected auto-layout frame
    const frameNode = selectedIds.length === 1
        ? (() => {
            const n = findNodeById(nodes, selectedIds[0])
            return n && n.type === 'frame' && n.layout.mode !== 'none' ? n : null
        })()
        : null

    const frameId = frameNode?.id ?? null
    const framePadding = frameNode?.padding ?? null

    const rectRef = useRef<ScreenRect | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true

        if (isNodeResizeActive) {
            if (rectRef.current !== null) {
                rectRef.current = null
            }
            return () => {
                isMountedRef.current = false
                cancelAnimationFrame(rafRef.current)
            }
        }

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            if (!viewport || !frameId) {
                if (rectRef.current !== null) {
                    rectRef.current = null
                    setRect(null)
                }
                return
            }

            const newRect = getNodeScreenRect(frameId, viewport)
            const prev = rectRef.current

            // Compare with tolerance
            const changed = !prev || !newRect ||
                Math.abs(prev.x - newRect.x) > 0.1 ||
                Math.abs(prev.y - newRect.y) > 0.1 ||
                Math.abs(prev.width - newRect.width) > 0.1 ||
                Math.abs(prev.height - newRect.height) > 0.1

            if (changed && isMountedRef.current) {
                rectRef.current = newRect
                setRect(newRect)
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        if (frameId) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (rectRef.current !== null) {
            rectRef.current = null
            setRect(null)
        }

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [frameId, isNodeResizeActive, viewportRef])

    // Close inline input when selection changes
    useEffect(() => {
        setInlineInput(null)
        setHoveredSide(null)
        setHandleHoveredSide(null)
    }, [frameId])

    // Ensure no orphaned pointer listeners/batches remain if the overlay unmounts.
    useEffect(() => {
        return () => {
            pointerSessionCleanupRef.current?.()
            pointerSessionCleanupRef.current = null
            cancelAnimationFrame(dragCursorRaf.current)
            if (dragRef.current) {
                dragRef.current = null
                endBatch()
            }
            setPaddingOverlay(null)
        }
    }, [endBatch, setPaddingOverlay])

    const handleMouseEnter = useCallback((side: PaddingSide) => {
        if (frameId && !dragRef.current) {
            setHoveredSide(side)
            setPaddingOverlay(frameId, side)
        }
    }, [frameId, setPaddingOverlay])

    const handleMouseLeave = useCallback((side: PaddingSide) => {
        if (!dragRef.current) {
            // Delay to allow center handle to capture enter
            setTimeout(() => {
                setHoveredSide((prev) => prev === side ? null : prev)
            }, 50)
            setPaddingOverlay(null)
        }
    }, [setPaddingOverlay])

    // Stable refs for drag handler — avoids stale closures
    const paddingZoomRef = useRef(zoom)
    paddingZoomRef.current = zoom
    const paddingRectRef = useRef(rect)
    paddingRectRef.current = rect
    const framePaddingRef = useRef(framePadding)
    framePaddingRef.current = framePadding

    // Unified pointer handler: drag if moved > dead zone, click if released without moving
    const handlePointerDown = useCallback((side: PaddingSide, e: React.PointerEvent) => {
        if (!frameId || !framePadding || !rect) return
        e.preventDefault()
        e.stopPropagation()

        // Close any open inline input
        setInlineInput(null)

        // Abort any stale pointer session before starting a new one.
        pointerSessionCleanupRef.current?.()
        pointerSessionCleanupRef.current = null

        // Capture pointer on the target element for reliable tracking during drag
        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)
        const pointerId = e.pointerId

        const isHorizontal = side === 'left' || side === 'right'
        const startClientX = e.clientX
        const startClientY = e.clientY
        const startPos = isHorizontal ? e.clientX : e.clientY
        let dragging = false

        const startPadding = {
            top: framePadding.top,
            right: framePadding.right,
            bottom: framePadding.bottom,
            left: framePadding.left,
        }

        const handleMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startClientX
            const dy = ev.clientY - startClientY
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (!dragging && dist > PADDING_DRAG_DEAD_ZONE) {
                dragging = true
                dragRef.current = {
                    side,
                    startPadding,
                    startPos,
                    nodeId: frameId,
                }
                beginBatch()
            }

            if (!dragging) return

            const isH = side === 'left' || side === 'right'
            const currentPos = isH ? ev.clientX : ev.clientY
            const invert = side === 'left' || side === 'top' ? -1 : 1
            const rawDelta = (currentPos - startPos) * invert / paddingZoomRef.current
            const delta = quantizePaddingDelta(rawDelta, ev.shiftKey)
            const dragMode = getPaddingDragMode(ev.altKey, ev.shiftKey)
            const targetSides = getPaddingSidesForMode(side, dragMode)

            const currentNode = findNodeById(useEditorStore.getState().nodes, frameId)
            if (!currentNode || currentNode.type !== 'frame') return
            const currentPadding = { ...currentNode.padding }
            const driverValue = computeDriverPaddingValue(startPadding, side, delta)

            for (const targetSide of targetSides) {
                currentPadding[targetSide] = driverValue
            }

            setPaddingOverlay(frameId, getPaddingOverlayDirectionForMode(side, dragMode))

            updateNode(frameId, { padding: currentPadding })

            // Track cursor position for drag tooltip (throttled via RAF)
            const viewportRect = viewportRef.current?.getBoundingClientRect()
            if (viewportRect) {
                cancelAnimationFrame(dragCursorRaf.current)
                const cursorData = {
                    x: ev.clientX - viewportRect.left,
                    y: ev.clientY - viewportRect.top,
                    value: currentPadding[side],
                }
                dragCursorRaf.current = requestAnimationFrame(() => {
                    setDragCursor(cursorData)
                })
            }
        }

        const handleUp = (ev: PointerEvent) => {
            pointerSessionCleanupRef.current?.()
            pointerSessionCleanupRef.current = null

            // Release pointer capture
            try { target.releasePointerCapture(pointerId) } catch { /* already released */ }

            if (dragging) {
                // Was a drag — end batch
                dragRef.current = null
                endBatch()
                setPaddingOverlay(null)
                setHoveredSide(null)
                cancelAnimationFrame(dragCursorRaf.current)
                setDragCursor(null)
            } else {
                // Was a click — open inline input at center handle position
                const currentPad = framePaddingRef.current
                const currentRect = paddingRectRef.current
                const currentZoom = paddingZoomRef.current
                if (!currentPad || !currentRect) return

                const pt = currentPad.top * currentZoom
                const pr = currentPad.right * currentZoom
                const pb = currentPad.bottom * currentZoom
                const pl = currentPad.left * currentZoom
                const clickMode = getPaddingDragMode(ev.altKey, ev.shiftKey)
                const targetSides = getPaddingSidesForMode(side, clickMode)

                let x: number, y: number
                switch (side) {
                    case 'top':
                        x = currentRect.x + currentRect.width / 2
                        y = currentRect.y + pt / 2
                        break
                    case 'bottom':
                        x = currentRect.x + currentRect.width / 2
                        y = currentRect.y + currentRect.height - pb / 2
                        break
                    case 'left':
                        x = currentRect.x + pl / 2
                        y = currentRect.y + currentRect.height / 2
                        break
                    case 'right':
                        x = currentRect.x + currentRect.width - pr / 2
                        y = currentRect.y + currentRect.height / 2
                        break
                }

                setInlineInput({ side, targetSides, x, y, value: currentPad[side] })
                setHoveredSide(null)
                setPaddingOverlay(null)
            }
        }

        const cleanupSession = () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            window.removeEventListener('pointercancel', handleUp)
        }

        pointerSessionCleanupRef.current = cleanupSession

        // Use window listeners so drag continues even if the originating handle re-renders.
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
        window.addEventListener('pointercancel', handleUp)
    }, [frameId, framePadding, rect, beginBatch, endBatch, updateNode, setPaddingOverlay, viewportRef])

    const handleInlineInputChange = useCallback((value: number) => {
        if (!frameId || !inlineInput) return
        const currentNode = findNodeById(useEditorStore.getState().nodes, frameId)
        if (!currentNode || currentNode.type !== 'frame') return
        const currentPadding = { ...currentNode.padding }
        for (const targetSide of inlineInput.targetSides) {
            currentPadding[targetSide] = Math.max(0, value)
        }
        updateNode(frameId, { padding: currentPadding })
        setInlineInput(null)
    }, [frameId, inlineInput, updateNode])

    if (isNodeResizeActive || !rect || !framePadding || !frameId) return null

    const pt = framePadding.top * zoom
    const pr = framePadding.right * zoom
    const pb = framePadding.bottom * zoom
    const pl = framePadding.left * zoom

    const MIN_HIT = 6
    const HANDLE_SAFE_OFFSET = Math.max(MIN_HIT / 2, EDGE_HIT_ZONE / 2 + 2)

    const zones: { side: PaddingSide; style: React.CSSProperties }[] = [
        {
            side: 'top',
            style: {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: Math.max(pt, MIN_HIT),
            },
        },
        {
            side: 'bottom',
            style: {
                left: rect.x,
                top: rect.y + rect.height - Math.max(pb, MIN_HIT),
                width: rect.width,
                height: Math.max(pb, MIN_HIT),
            },
        },
        {
            side: 'left',
            style: {
                left: rect.x,
                top: rect.y + Math.max(pt, MIN_HIT),
                width: Math.max(pl, MIN_HIT),
                height: rect.height - Math.max(pt, MIN_HIT) - Math.max(pb, MIN_HIT),
            },
        },
        {
            side: 'right',
            style: {
                left: rect.x + rect.width - Math.max(pr, MIN_HIT),
                top: rect.y + Math.max(pt, MIN_HIT),
                width: Math.max(pr, MIN_HIT),
                height: rect.height - Math.max(pt, MIN_HIT) - Math.max(pb, MIN_HIT),
            },
        },
    ]

    // Compute center handle positions for each side
    const getCenterHandle = (side: PaddingSide): { x: number; y: number; isVertical: boolean } => {
        const paddingPx = { top: pt, right: pr, bottom: pb, left: pl }
        const p = Math.max(paddingPx[side], MIN_HIT)
        const offset = Math.max(p / 2, HANDLE_SAFE_OFFSET)
        switch (side) {
            case 'top':
                return { x: rect.x + rect.width / 2, y: rect.y + offset, isVertical: false }
            case 'bottom':
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height - offset, isVertical: false }
            case 'left':
                return { x: rect.x + offset, y: rect.y + rect.height / 2, isVertical: true }
            case 'right':
                return { x: rect.x + rect.width - offset, y: rect.y + rect.height / 2, isVertical: true }
        }
    }

    return (
        <>
            {/* Hover-detection padding zones — pointer-events:auto at z:999
                (below resize handles at z:1000) so they detect hover everywhere
                EXCEPT where resize handles are. Pointer-down is intentionally
                reserved for the center handles to mirror Figma controls. */}
            {zones.map(({ side, style }) => (
                <div
                    key={`hover-${side}`}
                    style={{
                        position: 'absolute',
                        ...style,
                        zIndex: 999,
                        pointerEvents: 'auto',
                        cursor: 'default',
                    }}
                    onMouseEnter={() => handleMouseEnter(side)}
                    onMouseLeave={() => handleMouseLeave(side)}
                />
            ))}

            {/* Visual hatch overlay — shown on hovered side, hidden when inline input is active */}
            {hoveredSide && !inlineInput && (() => {
                const zone = zones.find(z => z.side === hoveredSide)
                if (!zone) return null
                return (
                    <div
                        key={`visual-${hoveredSide}`}
                        className="pointer-events-none"
                        style={{
                            position: 'absolute',
                            ...zone.style,
                            background: BLUE_HATCH,
                            zIndex: 998,
                        }}
                    />
                )
            })()}

            {/* Interactive center handles — ONLY these small areas accept
                pointer-down for drag. Positioned at z:1003 above resize handles
                so they always win at the center of the edge. */}
            {zones.map(({ side }) => {
                const handle = getCenterHandle(side)
                const isHovered = hoveredSide === side
                const isOnHandle = handleHoveredSide === side
                const isHorizontalSide = side === 'left' || side === 'right'

                // Hit area: wider along the edge, narrower into the padding
                const hitW = isHorizontalSide ? CENTER_HANDLE_HIT_DEPTH : CENTER_HANDLE_HIT_WIDTH
                const hitH = isHorizontalSide ? CENTER_HANDLE_HIT_WIDTH : CENTER_HANDLE_HIT_DEPTH

                return (
                    <div key={`handle-${side}`}>
                        <div
                            style={{
                                position: 'absolute',
                                left: handle.x - hitW / 2,
                                top: handle.y - hitH / 2,
                                width: hitW,
                                height: hitH,
                                zIndex: 1003,
                                cursor: isHorizontalSide ? 'ew-resize' : 'ns-resize',
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={() => {
                                handleMouseEnter(side)
                                setHandleHoveredSide(side)
                            }}
                            onMouseLeave={() => {
                                handleMouseLeave(side)
                                setHandleHoveredSide(null)
                            }}
                            onPointerDown={(e) => handlePointerDown(side, e)}
                        >
                            {/* Visual line indicator */}
                            <div
                                style={{
                                    width: handle.isVertical ? CENTER_HANDLE_THICKNESS : CENTER_HANDLE_LENGTH,
                                    height: handle.isVertical ? CENTER_HANDLE_LENGTH : CENTER_HANDLE_THICKNESS,
                                    backgroundColor: isHovered ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)',
                                    borderRadius: 1,
                                    transition: 'background-color 0.1s',
                                }}
                            />
                        </div>

                        {/* Figma-style dark tooltip with icon — shown on center handle hover only */}
                        {isOnHandle && !dragCursor && !inlineInput && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: handle.x,
                                    top: handle.y,
                                    transform: side === 'left' ? 'translate(-100%, -50%) translate(-8px, 0)' :
                                        side === 'right' ? 'translate(0%, -50%) translate(8px, 0)' :
                                            side === 'top' ? 'translate(-50%, -100%) translate(0, -8px)' :
                                                'translate(-50%, 0%) translate(0, 8px)',
                                    zIndex: 2000,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: '#1e1e2e',
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }}>
                                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                                        {isHorizontalSide ? (
                                            <>
                                                <line x1="1" y1="0" x2="1" y2="10" stroke="#3b82f6" strokeWidth="1.5" />
                                                <rect x="3" y="1" width="6" height="8" rx="1" stroke="#3b82f6" strokeWidth="1" fill="none" />
                                            </>
                                        ) : (
                                            <>
                                                <line x1="0" y1="1" x2="10" y2="1" stroke="#3b82f6" strokeWidth="1.5" />
                                                <rect x="1" y="3" width="8" height="6" rx="1" stroke="#3b82f6" strokeWidth="1" fill="none" />
                                            </>
                                        )}
                                    </svg>
                                    <span style={{
                                        color: '#ffffff',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        fontFamily: 'system-ui',
                                    }}>
                                        {framePadding[side]}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Drag cursor tooltip — dark floating badge following cursor during drag */}
            {dragCursor && (
                <div
                    className="pointer-events-none"
                    style={{
                        position: 'absolute',
                        left: dragCursor.x,
                        top: dragCursor.y,
                        transform: 'translate(-50%, -100%) translate(0, -12px)',
                        zIndex: 2000,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#1e1e2e',
                            padding: '3px 8px',
                            borderRadius: 4,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                    >
                        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                            <rect x="1" y="1" width="8" height="8" rx="1" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
                        </svg>
                        <span style={{ color: '#e0e0e0', fontSize: 11, fontWeight: 600, fontFamily: 'system-ui' }}>
                            {dragCursor.value}
                        </span>
                    </div>
                </div>
            )}

            {/* Inline value input */}
            {inlineInput && (
                <InlineValueInput
                    x={inlineInput.x}
                    y={inlineInput.y}
                    value={inlineInput.value}
                    color="blue"
                    side={inlineInput.side}
                    onSubmit={handleInlineInputChange}
                    onClose={() => setInlineInput(null)}
                />
            )}
        </>
    )
}

// ============================================================
// InlineValueInput — dark floating input for typing values
// Opens when clicking a center handle on padding/gap zones.
// ============================================================

function InlineValueInput({
    x, y, value, color, side, onSubmit, onClose,
}: {
    x: number
    y: number
    value: number
    color: 'blue' | 'pink' | 'orange'
    side?: PaddingSide | 'gap-row' | 'gap-col' | 'margin-top' | 'margin-right' | 'margin-bottom' | 'margin-left'
    onSubmit: (v: number) => void
    onClose: () => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [localValue, setLocalValue] = useState(String(value))

    useEffect(() => {
        // Focus and select all on mount
        const input = inputRef.current
        if (input) {
            input.focus()
            input.select()
        }
    }, [])

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
                onClose()
            }
        }
        // Delay to avoid the same click that opened it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handler)
        }, 50)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handler)
        }
    }, [onClose])

    const submit = () => {
        const parsed = parseInt(localValue, 10)
        if (!isNaN(parsed)) {
            onSubmit(parsed)
        } else {
            onClose()
        }
    }

    const iconColor = color === 'blue' ? '#3b82f6' : color === 'orange' ? '#f97316' : '#ec4899'
    const isHorizontalSide = side === 'left' || side === 'right' || side === 'margin-left' || side === 'margin-right'
    const isGap = side === 'gap-row' || side === 'gap-col'
    const isMargin = side?.startsWith('margin-')

    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                zIndex: 2000,
                pointerEvents: 'auto',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: '#1e1e2e',
                    borderRadius: 4,
                    padding: '3px 8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                }}
            >
                {isMargin ? (
                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <rect x="2" y="2" width="6" height="6" rx="1" stroke={iconColor} strokeWidth="1" fill="none" />
                        {isHorizontalSide ? (
                            <line x1={side === 'margin-left' ? 2 : 8} y1="5" x2={side === 'margin-left' ? 0 : 10} y2="5" stroke={iconColor} strokeWidth="1.2" />
                        ) : (
                            <line x1="5" y1={side === 'margin-top' ? 2 : 8} x2="5" y2={side === 'margin-top' ? 0 : 10} stroke={iconColor} strokeWidth="1.2" />
                        )}
                    </svg>
                ) : isGap ? (
                    <svg width={12} height={10} viewBox="0 0 12 10" fill="none">
                        <rect x="0" y="1" width="4" height="8" rx="1" stroke={iconColor} strokeWidth="1" fill="none" />
                        <rect x="8" y="1" width="4" height="8" rx="1" stroke={iconColor} strokeWidth="1" fill="none" />
                        <line x1="5" y1="5" x2="7" y2="5" stroke={iconColor} strokeWidth="1" />
                    </svg>
                ) : (
                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        {isHorizontalSide ? (
                            <>
                                <line x1="1" y1="0" x2="1" y2="10" stroke={iconColor} strokeWidth="1.5" />
                                <rect x="3" y="1" width="6" height="8" rx="1" stroke={iconColor} strokeWidth="1" fill="none" />
                            </>
                        ) : (
                            <>
                                <line x1="0" y1="1" x2="10" y2="1" stroke={iconColor} strokeWidth="1.5" />
                                <rect x="1" y="3" width="8" height="6" rx="1" stroke={iconColor} strokeWidth="1" fill="none" />
                            </>
                        )}
                    </svg>
                )}
                <input
                    ref={inputRef}
                    type="text"
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submit()
                        if (e.key === 'Escape') onClose()
                        e.stopPropagation()
                    }}
                    onBlur={submit}
                    style={{
                        width: 40,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#ffffff',
                        fontSize: 11,
                        fontFamily: 'system-ui',
                        fontWeight: 600,
                        textAlign: 'left',
                        padding: 0,
                    }}
                />
            </div>
        </div>
    )
}

// ============================================================
// CanvasGapZones — interactive zones between children in
// auto-layout frames. Hover highlights gap with pink hatch;
// center handle for drag-to-resize + click-to-edit.
// ============================================================

const PINK_HATCH = HATCH_BG('rgba(236, 72, 153, 0.15)')

interface GapZoneRect {
    x: number
    y: number
    width: number
    height: number
    index: number
    actualGapPx: number // absolute spacing magnitude in screen pixels
}

export function CanvasGapZones({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const isNodeResizeActive = useEditorStore((s) => s.isNodeResizeActive)
    const nodes = useEditorStore((s) => s.nodes)
    const zoom = useEditorStore((s) => s.zoom)
    const updateNode = useEditorStore((s) => s.updateNode)
    const beginBatch = useEditorStore((s) => s.beginBatch)
    const endBatch = useEditorStore((s) => s.endBatch)

    const [gapZones, setGapZones] = useState<GapZoneRect[]>([])
    const [frameRect, setFrameRect] = useState<ScreenRect | null>(null)
    const [activeZoneIndex, setActiveZoneIndex] = useState<number | null>(null)
    const [handleHoveredIndex, setHandleHoveredIndex] = useState<number | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [gapDragCursor, setGapDragCursor] = useState<{ x: number; y: number; value: number } | null>(null)
    const gapDragCursorRaf = useRef<number>(0)
    const [inlineInput, setInlineInput] = useState<{
        x: number
        y: number
        value: number
        index: number
    } | null>(null)
    const rafRef = useRef<number>(0)
    const dragRef = useRef<{
        startGap: number
        startPos: number
        nodeId: string
        isColumn: boolean
    } | null>(null)

    // Only show on single selected flex frame with 2+ in-flow children.
    // Ignore-auto-layout (absolute) children are excluded from gap semantics.
    const frameNode = selectedIds.length === 1
        ? (() => {
            const n = findNodeById(nodes, selectedIds[0])
            if (!n || n.type !== 'frame' || n.layout.mode !== 'flex') {
                return null
            }

            const flowChildren = n.children.filter((child) => child.positioning !== 'absolute')
            return flowChildren.length >= 2 ? n : null
        })()
        : null

    const frameId = frameNode?.id ?? null
    const frameGap = frameNode?.layout.gap ?? 0
    const isAutoGap = isAutoGapLayout(frameNode?.layout)
    const isColumn = frameNode?.layout.direction === 'column' || frameNode?.layout.direction === undefined
    const allowsNegativeGap = !(frameNode?.layout.wrap)

    const gapZonesRef = useRef<GapZoneRect[]>([])
    const prevFrameRectRef = useRef<ScreenRect | null>(null)
    const isMountedRef = useRef(true)

    // Store frameNode in a ref so the RAF loop can access the latest value
    const frameNodeRef = useRef(frameNode)
    frameNodeRef.current = frameNode
    const isColumnRef = useRef(isColumn)
    isColumnRef.current = isColumn

    useEffect(() => {
        isMountedRef.current = true

        if (isNodeResizeActive) {
            if (gapZonesRef.current.length > 0 || prevFrameRectRef.current !== null) {
                gapZonesRef.current = []
                prevFrameRectRef.current = null
            }
            return () => {
                isMountedRef.current = false
                cancelAnimationFrame(rafRef.current)
            }
        }

        const loop = () => {
            if (!isMountedRef.current) return

            const viewport = viewportRef.current
            const currentFrameNode = frameNodeRef.current
            const currentIsColumn = isColumnRef.current

            if (!viewport || !frameId || !currentFrameNode) {
                if (gapZonesRef.current.length > 0 || prevFrameRectRef.current !== null) {
                    gapZonesRef.current = []
                    prevFrameRectRef.current = null
                    setGapZones([])
                    setFrameRect(null)
                }
                return
            }

            const viewportRect = viewport.getBoundingClientRect()
            const children = currentFrameNode.children.filter((child) => child.positioning !== 'absolute')
            const zones: GapZoneRect[] = []

            // Track frame rect for inline input positioning
            const parentEl = viewport.querySelector(`[data-node-id="${frameId}"]`)
            let newFrameRect: ScreenRect | null = null
            if (parentEl) {
                const pr = parentEl.getBoundingClientRect()
                newFrameRect = {
                    x: pr.left - viewportRect.left,
                    y: pr.top - viewportRect.top,
                    width: pr.width,
                    height: pr.height,
                }
            }

            // Collect all child rects first to compute bounding box
            const childRects: DOMRect[] = []
            for (let i = 0; i < children.length; i++) {
                const el = viewport.querySelector(`[data-node-id="${children[i].id}"]`)
                if (!el) {
                    if (isMountedRef.current) {
                        rafRef.current = requestAnimationFrame(loop)
                    }
                    return
                }
                childRects.push(el.getBoundingClientRect())
            }

            // Compute children's bounding box
            let minLeft = Infinity, maxRight = -Infinity
            let minTop = Infinity, maxBottom = -Infinity
            for (const cr of childRects) {
                minLeft = Math.min(minLeft, cr.left)
                maxRight = Math.max(maxRight, cr.right)
                minTop = Math.min(minTop, cr.top)
                maxBottom = Math.max(maxBottom, cr.bottom)
            }

            const MIN_GAP_HIT = 6

            // Get current zoom for margin-to-screen conversion
            const currentZoom = useEditorStore.getState().zoom

            for (let i = 0; i < children.length - 1; i++) {
                const childRect = childRects[i]
                const nextChildRect = childRects[i + 1]

                // Subtract child margins from measured space so the gap zone
                // only covers the true flex gap, not margin space.
                // getBoundingClientRect excludes CSS margins, so the physical
                // distance between two children = marginBottom + gap + marginTop.
                const childNode = children[i]
                const nextChildNode = children[i + 1]

                if (currentIsColumn) {
                    const childMb = (childNode.margin?.bottom || 0) * currentZoom
                    const nextChildMt = (nextChildNode.margin?.top || 0) * currentZoom

                    const rawTop = childRect.bottom - viewportRect.top
                    const rawBottom = nextChildRect.top - viewportRect.top
                    // Shrink the zone by removing margin space
                    const gapTop = rawTop + childMb
                    const gapBottom = rawBottom - nextChildMt
                    const gapHeight = gapBottom - gapTop

                    if (gapHeight >= 0) {
                        const zoneHeight = Math.max(gapHeight, MIN_GAP_HIT)
                        const yOffset = gapHeight < MIN_GAP_HIT ? (MIN_GAP_HIT - gapHeight) / 2 : 0
                        zones.push({
                            x: minLeft - viewportRect.left,
                            y: gapTop - yOffset,
                            width: maxRight - minLeft,
                            height: zoneHeight,
                            index: i,
                            actualGapPx: Math.abs(gapHeight),
                        })
                    } else if (allowsNegativeGap) {
                        const overlapTop = gapBottom
                        const overlapBottom = gapTop
                        const overlapHeight = overlapBottom - overlapTop
                        const zoneHeight = Math.max(overlapHeight, MIN_GAP_HIT)
                        const yOffset = overlapHeight < MIN_GAP_HIT ? (MIN_GAP_HIT - overlapHeight) / 2 : 0
                        zones.push({
                            x: minLeft - viewportRect.left,
                            y: overlapTop - yOffset,
                            width: maxRight - minLeft,
                            height: zoneHeight,
                            index: i,
                            actualGapPx: Math.abs(gapHeight),
                        })
                    }
                } else {
                    const childMr = (childNode.margin?.right || 0) * currentZoom
                    const nextChildMl = (nextChildNode.margin?.left || 0) * currentZoom

                    const rawLeft = childRect.right - viewportRect.left
                    const rawRight = nextChildRect.left - viewportRect.left
                    // Shrink the zone by removing margin space
                    const gapLeft = rawLeft + childMr
                    const gapRight = rawRight - nextChildMl
                    const gapWidth = gapRight - gapLeft

                    if (gapWidth >= 0) {
                        const zoneWidth = Math.max(gapWidth, MIN_GAP_HIT)
                        const xOffset = gapWidth < MIN_GAP_HIT ? (MIN_GAP_HIT - gapWidth) / 2 : 0
                        zones.push({
                            x: gapLeft - xOffset,
                            y: minTop - viewportRect.top,
                            width: zoneWidth,
                            height: maxBottom - minTop,
                            index: i,
                            actualGapPx: Math.abs(gapWidth),
                        })
                    } else if (allowsNegativeGap) {
                        const overlapLeft = gapRight
                        const overlapRight = gapLeft
                        const overlapWidth = overlapRight - overlapLeft
                        const zoneWidth = Math.max(overlapWidth, MIN_GAP_HIT)
                        const xOffset = overlapWidth < MIN_GAP_HIT ? (MIN_GAP_HIT - overlapWidth) / 2 : 0
                        zones.push({
                            x: overlapLeft - xOffset,
                            y: minTop - viewportRect.top,
                            width: zoneWidth,
                            height: maxBottom - minTop,
                            index: i,
                            actualGapPx: Math.abs(gapWidth),
                        })
                    }
                }
            }

            // Compare and update zones (simplified - just check length and first item)
            const prevZones = gapZonesRef.current
            let zonesChanged = prevZones.length !== zones.length
            if (!zonesChanged && zones.length > 0) {
                for (let i = 0; i < zones.length; i++) {
                    const prev = prevZones[i]
                    const curr = zones[i]
                    if (
                        Math.abs(prev.x - curr.x) > 0.1 ||
                        Math.abs(prev.y - curr.y) > 0.1 ||
                        Math.abs(prev.width - curr.width) > 0.1 ||
                        Math.abs(prev.height - curr.height) > 0.1
                    ) {
                        zonesChanged = true
                        break
                    }
                }
            }

            // Compare frame rect
            const prevFrameRect = prevFrameRectRef.current
            const frameRectChanged = !prevFrameRect !== !newFrameRect ||
                (prevFrameRect && newFrameRect && (
                    Math.abs(prevFrameRect.x - newFrameRect.x) > 0.1 ||
                    Math.abs(prevFrameRect.y - newFrameRect.y) > 0.1 ||
                    Math.abs(prevFrameRect.width - newFrameRect.width) > 0.1 ||
                    Math.abs(prevFrameRect.height - newFrameRect.height) > 0.1
                ))

            if (isMountedRef.current) {
                if (zonesChanged) {
                    gapZonesRef.current = zones
                    setGapZones(zones)
                }
                if (frameRectChanged) {
                    prevFrameRectRef.current = newFrameRect
                    setFrameRect(newFrameRect)
                }
            }

            if (isMountedRef.current) {
                rafRef.current = requestAnimationFrame(loop)
            }
        }

        if (frameId) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (gapZonesRef.current.length > 0 || prevFrameRectRef.current !== null) {
            gapZonesRef.current = []
            prevFrameRectRef.current = null
            setGapZones([])
            setFrameRect(null)
        }

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(rafRef.current)
        }
    }, [frameId, viewportRef, allowsNegativeGap, isNodeResizeActive])

    // Close inline input when selection changes
    useEffect(() => {
        setInlineInput(null)
        setActiveZoneIndex(null)
        setHandleHoveredIndex(null)
    }, [frameId])

    // Stable refs for drag handler — avoids stale closures and listener leaks
    const frameGapRef = useRef(frameGap)
    frameGapRef.current = frameGap
    const frameRectRef = useRef(frameRect)
    frameRectRef.current = frameRect
    const zoomRef = useRef(zoom)
    zoomRef.current = zoom

    // Unified pointer handler: drag if moved > dead zone, click if released without moving
    const handlePointerDown = useCallback((zone: GapZoneRect, e: React.PointerEvent) => {
        if (!frameId) return
        e.preventDefault()
        e.stopPropagation()
        setInlineInput(null)
        setActiveZoneIndex(zone.index)
        setHandleHoveredIndex(zone.index)

        // Capture pointer on the target element for reliable tracking during drag
        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)
        const pointerId = e.pointerId

        const startClientX = e.clientX
        const startClientY = e.clientY
        const startPos = isColumn ? e.clientY : e.clientX
        const currentFrameNode = findNodeById(useEditorStore.getState().nodes, frameId)
        const startIsAutoGap = currentFrameNode?.type === 'frame' && isAutoGapLayout(currentFrameNode.layout)
        const startGap = startIsAutoGap
            ? gapFromMeasuredPx(zone.actualGapPx, zoomRef.current)
            : frameGapRef.current
        const DEAD_ZONE = 3
        let dragging = false

        const handleMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startClientX
            const dy = ev.clientY - startClientY
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (!dragging && dist > DEAD_ZONE) {
                dragging = true

                if (startIsAutoGap) {
                    const node = findNodeById(useEditorStore.getState().nodes, frameId)
                    if (node && node.type === 'frame') {
                        updateNode(frameId, { layout: toFixedGapLayout(node.layout, startGap) })
                    }
                }

                dragRef.current = {
                    startGap,
                    startPos,
                    nodeId: frameId,
                    isColumn,
                }
                setIsDragging(true)
                beginBatch()
            }

            if (!dragging) return

            const currentPos = isColumn ? ev.clientY : ev.clientX
            const delta = (currentPos - startPos) / zoomRef.current
            let newGap = Math.round(startGap + delta)
            if (!allowsNegativeGap) {
                newGap = Math.max(0, newGap)
            }

            const currentNode = findNodeById(useEditorStore.getState().nodes, frameId)
            if (!currentNode || currentNode.type !== 'frame') return
            updateNode(frameId, { layout: toFixedGapLayout(currentNode.layout, newGap) })

            // Track cursor position for drag tooltip (throttled via RAF)
            const viewportRect = viewportRef.current?.getBoundingClientRect()
            if (viewportRect) {
                cancelAnimationFrame(gapDragCursorRaf.current)
                const cursorData = {
                    x: ev.clientX - viewportRect.left,
                    y: ev.clientY - viewportRect.top,
                    value: newGap,
                }
                gapDragCursorRaf.current = requestAnimationFrame(() => {
                    setGapDragCursor(cursorData)
                })
            }
        }

        const handleUp = (ev: PointerEvent) => {
            // Release pointer capture
            try { target.releasePointerCapture(pointerId) } catch { /* already released */ }
            target.removeEventListener('pointermove', handleMove)
            target.removeEventListener('pointerup', handleUp)
            target.removeEventListener('pointercancel', handleUp)

            if (dragging) {
                dragRef.current = null
                setIsDragging(false)
                cancelAnimationFrame(gapDragCursorRaf.current)
                setGapDragCursor(null)
                endBatch()
                // RAF loop will automatically sync zones on next frame
                setActiveZoneIndex(null)
                setHandleHoveredIndex(null)
            } else {
                // Was a click — open inline input at bottom of frame (Figma-style)
                const fr = frameRectRef.current
                const currentNode = findNodeById(useEditorStore.getState().nodes, frameId)
                const currentIsAutoGap = currentNode?.type === 'frame' && isAutoGapLayout(currentNode.layout)
                const currentGap = currentIsAutoGap
                    ? gapFromMeasuredPx(zone.actualGapPx, zoomRef.current)
                    : frameGapRef.current
                if (fr) {
                    setInlineInput({
                        x: fr.x + fr.width / 2,
                        y: fr.y + fr.height + 20,
                        value: currentGap,
                        index: zone.index,
                    })
                } else {
                    setInlineInput({
                        x: zone.x + zone.width / 2,
                        y: zone.y + zone.height + 20,
                        value: currentGap,
                        index: zone.index,
                    })
                }
            }
        }

        // Use pointer events on the captured element, not window
        target.addEventListener('pointermove', handleMove)
        target.addEventListener('pointerup', handleUp)
        target.addEventListener('pointercancel', handleUp)
    }, [frameId, isColumn, allowsNegativeGap, beginBatch, endBatch, updateNode])

    const handleInlineSubmit = useCallback((value: number) => {
        if (!frameId) return
        const currentNode = findNodeById(useEditorStore.getState().nodes, frameId)
        if (!currentNode || currentNode.type !== 'frame') return
        const nextGap = allowsNegativeGap ? value : Math.max(0, value)
        updateNode(frameId, { layout: toFixedGapLayout(currentNode.layout, nextGap) })
        setInlineInput(null)
    }, [frameId, allowsNegativeGap, updateNode])

    if (isNodeResizeActive || gapZones.length === 0) return null

    const handleIsVertical = !isColumn // perpendicular to gap direction

    return (
        <>
            {gapZones.map((zone) => {
                const isActiveZone = activeZoneIndex === zone.index
                const isInlineZone = inlineInput?.index === zone.index
                const centerX = zone.x + zone.width / 2
                const centerY = zone.y + zone.height / 2

                // Hit area: small zone centered on the gap's midpoint
                // wider along the gap direction, narrower perpendicular
                const hitW = isColumn ? CENTER_HANDLE_HIT_WIDTH : CENTER_HANDLE_HIT_DEPTH
                const hitH = isColumn ? CENTER_HANDLE_HIT_DEPTH : CENTER_HANDLE_HIT_WIDTH

                return (
                    <div
                        key={zone.index}
                        onMouseEnter={() => {
                            if (dragRef.current) return
                            setActiveZoneIndex(zone.index)
                        }}
                        onMouseLeave={() => {
                            if (dragRef.current) return
                            setHandleHoveredIndex((prev) => (prev === zone.index ? null : prev))
                            setActiveZoneIndex((prev) => (prev === zone.index ? null : prev))
                        }}
                    >
                        {/* Hover-detection zone — full gap area at z:999
                            (below resize handles at z:1000). Detects hover to
                            show pink hatch but has NO onPointerDown — clicks/drags
                            pass through to child nodes or canvas underneath. */}
                        <div
                            style={{
                                position: 'absolute',
                                left: zone.x,
                                top: zone.y,
                                width: zone.width,
                                height: zone.height,
                                zIndex: 999,
                                pointerEvents: 'auto',
                                cursor: 'default',
                            }}
                        />

                        {/* Interactive center handle — ONLY this small area accepts
                            pointer-down for drag at z:1003 */}
                        <div
                            style={{
                                position: 'absolute',
                                left: centerX - hitW / 2,
                                top: centerY - hitH / 2,
                                width: hitW,
                                height: hitH,
                                zIndex: 1003,
                                cursor: isColumn ? 'ns-resize' : 'ew-resize',
                                pointerEvents: 'auto',
                            }}
                            onMouseEnter={() => {
                                if (dragRef.current) return
                                setActiveZoneIndex(zone.index)
                                setHandleHoveredIndex(zone.index)
                            }}
                            onMouseLeave={() => {
                                setHandleHoveredIndex((prev) => (prev === zone.index ? null : prev))
                            }}
                            onPointerDown={(e) => handlePointerDown(zone, e)}
                        />

                        {/* Pink hatch fill — only the active gap highlights on hover */}
                        {isActiveZone && !inlineInput && zone.actualGapPx > 0 && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: zone.x,
                                    top: zone.y,
                                    width: zone.width,
                                    height: zone.height,
                                    background: PINK_HATCH,
                                    border: '1px solid rgba(236, 72, 153, 0.25)',
                                    zIndex: 997,
                                }}
                            />
                        )}

                        {/* Pink outline — only the edited gap shows outline when inline input is open */}
                        {isInlineZone && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: zone.x,
                                    top: zone.y,
                                    width: zone.width,
                                    height: zone.height,
                                    border: '1px solid rgba(236, 72, 153, 0.5)',
                                    zIndex: 997,
                                }}
                            />
                        )}

                        {/* Dark tooltip with icon — shown on center handle hover only */}
                        {handleHoveredIndex === zone.index && !gapDragCursor && !inlineInput && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: centerX,
                                    top: centerY,
                                    transform: isColumn
                                        ? 'translate(8px, -50%)'
                                        : 'translate(-50%, -100%) translate(0, -8px)',
                                    zIndex: 2000,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: '#1e1e2e',
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }}>
                                    <svg width={12} height={10} viewBox="0 0 12 10" fill="none">
                                        <rect x="0" y="1" width="4" height="8" rx="1" stroke="#ec4899" strokeWidth="1" fill="none" />
                                        <rect x="8" y="1" width="4" height="8" rx="1" stroke="#ec4899" strokeWidth="1" fill="none" />
                                        <line x1="5" y1="5" x2="7" y2="5" stroke="#ec4899" strokeWidth="1" />
                                    </svg>
                                    <span style={{
                                        color: '#ffffff',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        fontFamily: 'system-ui',
                                    }}>
                                        {isAutoGap ? 'Auto' : frameGap}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Center handle — visual indicator for active/edited gap */}
                        {(isActiveZone || isInlineZone || (isDragging && isActiveZone)) && (
                            <div
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: centerX - CENTER_HANDLE_HIT_WIDTH / 2,
                                    top: centerY - CENTER_HANDLE_HIT_WIDTH / 2,
                                    width: CENTER_HANDLE_HIT_WIDTH,
                                    height: CENTER_HANDLE_HIT_WIDTH,
                                    zIndex: 1004,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <div
                                    style={{
                                        width: handleIsVertical ? CENTER_HANDLE_THICKNESS : CENTER_HANDLE_LENGTH,
                                        height: handleIsVertical ? CENTER_HANDLE_LENGTH : CENTER_HANDLE_THICKNESS,
                                        backgroundColor: '#ec4899',
                                        borderRadius: 1,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Inline value input for gap — positioned at bottom of frame */}
            {inlineInput && (
                <InlineValueInput
                    x={inlineInput.x}
                    y={inlineInput.y}
                    value={inlineInput.value}
                    color="pink"
                    side={isColumn ? 'gap-col' : 'gap-row'}
                    onSubmit={handleInlineSubmit}
                    onClose={() => setInlineInput(null)}
                />
            )}

            {/* Gap drag cursor tooltip — dark floating badge following cursor during drag */}
            {gapDragCursor && (
                <div
                    className="pointer-events-none"
                    style={{
                        position: 'absolute',
                        left: gapDragCursor.x,
                        top: gapDragCursor.y,
                        transform: 'translate(-50%, -100%) translate(0, -12px)',
                        zIndex: 2000,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#1e1e2e',
                            padding: '3px 8px',
                            borderRadius: 4,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                    >
                        <svg width={12} height={10} viewBox="0 0 12 10" fill="none">
                            <rect x="0" y="1" width="4" height="8" rx="1" stroke="#ec4899" strokeWidth="1" fill="none" />
                            <rect x="8" y="1" width="4" height="8" rx="1" stroke="#ec4899" strokeWidth="1" fill="none" />
                            <line x1="5" y1="5" x2="7" y2="5" stroke="#ec4899" strokeWidth="1" />
                        </svg>
                        <span style={{ color: '#e0e0e0', fontSize: 11, fontWeight: 600, fontFamily: 'system-ui' }}>
                            {gapDragCursor.value}
                        </span>
                    </div>
                </div>
            )}
        </>
    )
}

// ============================================================
// CanvasMarginZones — orange hatch overlay for child margins.
// Triggers when a CHILD node with margins is selected (not
// the parent frame). Supports hover, drag-to-resize, and
// click-to-edit inline input — mirrors CanvasPaddingZones.
// ============================================================

const ORANGE_HATCH = HATCH_BG('rgba(249, 115, 22, 0.15)')
const ORANGE_COLOR = '#f97316'

type MarginSide = 'top' | 'right' | 'bottom' | 'left'
const ALL_MARGIN_SIDES: MarginSide[] = ['top', 'right', 'bottom', 'left']
const MARGIN_DRAG_DEAD_ZONE = 3

export function CanvasMarginZones({
    viewportRef,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>
}) {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const isNodeResizeActive = useEditorStore((s) => s.isNodeResizeActive)
    const nodes = useEditorStore((s) => s.nodes)
    const zoom = useEditorStore((s) => s.zoom)
    const updateNode = useEditorStore((s) => s.updateNode)
    const beginBatch = useEditorStore((s) => s.beginBatch)
    const endBatch = useEditorStore((s) => s.endBatch)
    const setMarginDragActive = useEditorStore((s) => s.setMarginDragActive)

    const [rect, setRect] = useState<ScreenRect | null>(null)
    const [hoveredSide, setHoveredSide] = useState<MarginSide | null>(null)
    const [handleHoveredSide, setHandleHoveredSide] = useState<MarginSide | null>(null)
    const [inlineInput, setInlineInput] = useState<{
        side: MarginSide
        x: number; y: number; value: number
    } | null>(null)
    const [dragCursor, setDragCursor] = useState<{ x: number; y: number; value: number } | null>(null)
    const dragCursorRaf = useRef<number>(0)
    const rafRef = useRef<number>(0)
    const dragRef = useRef<{
        side: MarginSide
        startMargin: { top: number; right: number; bottom: number; left: number }
        startPos: number
        nodeId: string
    } | null>(null)

    // Trigger on single selected node that has margin data
    // (even if all zeros — keeps handles visible so user can drag to add margin)
    const targetNode = selectedIds.length === 1
        ? (() => {
            const n = findNodeById(nodes, selectedIds[0])
            if (!n) return null
            // Show if node has margin data OR is inside an auto-layout parent
            if (n.margin) return n
            // Check if inside auto-layout parent
            const parentResult = findParentOfNode(nodes, n.id)
            if (parentResult?.parent && parentResult.parent.layout.mode !== 'none') return n
            return null
        })()
        : null

    const nodeId = targetNode?.id ?? null
    const nodeMargin = targetNode?.margin ?? (targetNode ? { top: 0, right: 0, bottom: 0, left: 0 } : null)

    const rectRef = useRef<ScreenRect | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true
        if (isNodeResizeActive) {
            rectRef.current = null
            return () => { isMountedRef.current = false; cancelAnimationFrame(rafRef.current) }
        }

        const loop = () => {
            if (!isMountedRef.current) return
            const viewport = viewportRef.current
            if (!viewport || !nodeId) {
                if (rectRef.current !== null) { rectRef.current = null; setRect(null) }
                return
            }
            const newRect = getNodeScreenRect(nodeId, viewport)
            const prev = rectRef.current
            const changed = !prev || !newRect ||
                Math.abs(prev.x - newRect.x) > 0.1 || Math.abs(prev.y - newRect.y) > 0.1 ||
                Math.abs(prev.width - newRect.width) > 0.1 || Math.abs(prev.height - newRect.height) > 0.1
            if (changed && isMountedRef.current) { rectRef.current = newRect; setRect(newRect) }
            if (isMountedRef.current) rafRef.current = requestAnimationFrame(loop)
        }

        if (nodeId) {
            rafRef.current = requestAnimationFrame(loop)
        } else if (rectRef.current !== null) {
            rectRef.current = null; setRect(null)
        }
        return () => { isMountedRef.current = false; cancelAnimationFrame(rafRef.current) }
    }, [nodeId, isNodeResizeActive, viewportRef])

    useEffect(() => { setInlineInput(null); setHoveredSide(null); setHandleHoveredSide(null) }, [nodeId])

    const marginZoomRef = useRef(zoom)
    marginZoomRef.current = zoom
    const marginRectRef = useRef(rect)
    marginRectRef.current = rect
    const nodeMarginRef = useRef(nodeMargin)
    nodeMarginRef.current = nodeMargin

    const pointerSessionCleanupRef = useRef<(() => void) | null>(null)

    const handlePointerDown = useCallback((side: MarginSide, e: React.PointerEvent) => {
        if (!nodeId || !nodeMargin || !rect) return
        e.preventDefault(); e.stopPropagation()
        setInlineInput(null)

        // Abort any stale pointer session before starting a new one
        pointerSessionCleanupRef.current?.()
        pointerSessionCleanupRef.current = null

        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)
        const pointerId = e.pointerId
        const isHorizontal = side === 'left' || side === 'right'
        const startClientX = e.clientX
        const startClientY = e.clientY
        const startPos = isHorizontal ? e.clientX : e.clientY
        let dragging = false
        const startMargin = { ...nodeMargin }

        const handleMove = (ev: PointerEvent) => {
            const dist = Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY)
            if (!dragging && dist > MARGIN_DRAG_DEAD_ZONE) {
                dragging = true
                dragRef.current = { side, startMargin, startPos, nodeId }
                beginBatch()
                setMarginDragActive(true)
            }
            if (!dragging) return

            const currentPos = isHorizontal ? ev.clientX : ev.clientY
            const invert = side === 'left' || side === 'top' ? -1 : 1
            const delta = (currentPos - startPos) * invert / marginZoomRef.current
            const newValue = Math.round(startMargin[side] + delta)
            const currentNode = findNodeById(useEditorStore.getState().nodes, nodeId)
            if (!currentNode) return
            const newMargin = { ...(currentNode.margin || { top: 0, right: 0, bottom: 0, left: 0 }) }

            // Alt = mirror to opposite side, Alt+Shift = all 4 sides
            const dragMode = getPaddingDragMode(ev.altKey, ev.shiftKey)
            const targetSides = getPaddingSidesForMode(side as PaddingSide, dragMode) as MarginSide[]
            for (const s of targetSides) {
                newMargin[s] = newValue
            }

            updateNode(nodeId, { margin: newMargin })

            const viewportRect = viewportRef.current?.getBoundingClientRect()
            if (viewportRect) {
                cancelAnimationFrame(dragCursorRaf.current)
                const d = { x: ev.clientX - viewportRect.left, y: ev.clientY - viewportRect.top, value: newValue }
                dragCursorRaf.current = requestAnimationFrame(() => setDragCursor(d))
            }
        }

        const handleUp = () => {
            pointerSessionCleanupRef.current?.()
            pointerSessionCleanupRef.current = null
            try { target.releasePointerCapture(pointerId) } catch { /* already released */ }

            if (dragging) {
                dragRef.current = null; endBatch()
                setMarginDragActive(false)
                cancelAnimationFrame(dragCursorRaf.current); setDragCursor(null)
                setHoveredSide(null); setHandleHoveredSide(null)
            } else {
                // Click → open inline input
                const cr = marginRectRef.current; const cm = nodeMarginRef.current; const cz = marginZoomRef.current
                if (!cr || !cm) return
                const mp = { top: cm.top * cz, right: cm.right * cz, bottom: cm.bottom * cz, left: cm.left * cz }
                let x: number, y: number
                switch (side) {
                    case 'top': x = cr.x + cr.width / 2; y = cr.y - Math.max(Math.abs(mp.top), MIN_HIT) / 2; break
                    case 'bottom': x = cr.x + cr.width / 2; y = cr.y + cr.height + Math.max(Math.abs(mp.bottom), MIN_HIT) / 2; break
                    case 'left': x = cr.x - Math.max(Math.abs(mp.left), MIN_HIT) / 2; y = cr.y + cr.height / 2; break
                    case 'right': x = cr.x + cr.width + Math.max(Math.abs(mp.right), MIN_HIT) / 2; y = cr.y + cr.height / 2; break
                }
                setInlineInput({ side, x, y, value: cm[side] })
                setHoveredSide(null)
            }
        }

        const cleanupSession = () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            window.removeEventListener('pointercancel', handleUp)
        }
        pointerSessionCleanupRef.current = cleanupSession

        // Use window listeners so drag continues even if the handle element re-renders
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
        window.addEventListener('pointercancel', handleUp)
    }, [nodeId, nodeMargin, rect, beginBatch, endBatch, updateNode, viewportRef])

    const handleInlineSubmit = useCallback((value: number) => {
        if (!nodeId || !inlineInput) return
        const currentNode = findNodeById(useEditorStore.getState().nodes, nodeId)
        if (!currentNode) return
        const newMargin = { ...(currentNode.margin || { top: 0, right: 0, bottom: 0, left: 0 }) }
        newMargin[inlineInput.side] = value
        updateNode(nodeId, { margin: newMargin })
        setInlineInput(null)
    }, [nodeId, inlineInput, updateNode])

    if (isNodeResizeActive || !rect || !nodeMargin || !nodeId) return null

    const mt = nodeMargin.top * zoom
    const mr = nodeMargin.right * zoom
    const mb = nodeMargin.bottom * zoom
    const ml = nodeMargin.left * zoom
    const MIN_HIT = 6

    // Always show all 4 side zones (even at 0 or negative) so handles stay interactive.
    // For negative margins, the zone flips to the other side of the edge.
    const computeZoneStyle = (side: MarginSide): React.CSSProperties => {
        const marginPxMap = { top: mt, right: mr, bottom: mb, left: ml }
        const mPx = marginPxMap[side]
        const absPx = Math.abs(mPx)
        const zoneSize = Math.max(absPx, MIN_HIT)

        switch (side) {
            case 'top': return {
                left: rect.x, width: rect.width, height: zoneSize,
                top: mPx >= 0 ? rect.y - zoneSize : rect.y,
            }
            case 'bottom': return {
                left: rect.x, width: rect.width, height: zoneSize,
                top: mPx >= 0 ? rect.y + rect.height : rect.y + rect.height - zoneSize,
            }
            case 'left': return {
                top: rect.y, height: rect.height, width: zoneSize,
                left: mPx >= 0 ? rect.x - zoneSize : rect.x,
            }
            case 'right': return {
                top: rect.y, height: rect.height, width: zoneSize,
                left: mPx >= 0 ? rect.x + rect.width : rect.x + rect.width - zoneSize,
            }
        }
    }

    const allSides: MarginSide[] = ['top', 'right', 'bottom', 'left']
    const zones = allSides.map(side => ({ side, style: computeZoneStyle(side) }))

    const getCenterHandle = (side: MarginSide): { x: number; y: number; isVertical: boolean } => {
        const s = zones.find(z => z.side === side)!.style
        const zx = (s.left as number) ?? 0
        const zy = (s.top as number) ?? 0
        const zw = (s.width as number) ?? 0
        const zh = (s.height as number) ?? 0
        switch (side) {
            case 'top': return { x: zx + zw / 2, y: zy + zh / 2, isVertical: false }
            case 'bottom': return { x: zx + zw / 2, y: zy + zh / 2, isVertical: false }
            case 'left': return { x: zx + zw / 2, y: zy + zh / 2, isVertical: true }
            case 'right': return { x: zx + zw / 2, y: zy + zh / 2, isVertical: true }
        }
    }

    return (
        <>
            {zones.map(({ side, style }) => (
                <div key={`mhover-${side}`}
                    style={{ position: 'absolute', ...style, zIndex: 999, pointerEvents: 'auto', cursor: 'default' }}
                    onMouseEnter={() => { if (!dragRef.current) setHoveredSide(side) }}
                    onMouseLeave={() => { if (!dragRef.current) setTimeout(() => setHoveredSide((p) => p === side ? null : p), 50) }}
                />
            ))}

            {hoveredSide && !inlineInput && (() => {
                const zone = zones.find(z => z.side === hoveredSide)
                if (!zone) return null
                return (
                    <div key={`mvis-${hoveredSide}`} className="pointer-events-none"
                        style={{ position: 'absolute', ...zone.style, background: ORANGE_HATCH, zIndex: 998 }}
                    />
                )
            })()}

            {zones.map(({ side }) => {
                const handle = getCenterHandle(side)
                const isHovered = hoveredSide === side
                const isOnHandle = handleHoveredSide === side
                const isH = side === 'left' || side === 'right'
                const hitW = isH ? CENTER_HANDLE_HIT_DEPTH : CENTER_HANDLE_HIT_WIDTH
                const hitH = isH ? CENTER_HANDLE_HIT_WIDTH : CENTER_HANDLE_HIT_DEPTH

                return (
                    <div key={`mhandle-${side}`}>
                        <div
                            style={{
                                position: 'absolute', left: handle.x - hitW / 2, top: handle.y - hitH / 2,
                                width: hitW, height: hitH, zIndex: 1003,
                                cursor: isH ? 'ew-resize' : 'ns-resize', pointerEvents: 'auto',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={() => { if (!dragRef.current) { setHoveredSide(side); setHandleHoveredSide(side) }}}
                            onMouseLeave={() => { setHandleHoveredSide((p) => p === side ? null : p) }}
                            onPointerDown={(e) => handlePointerDown(side, e)}
                        >
                            <div style={{
                                width: handle.isVertical ? CENTER_HANDLE_THICKNESS : CENTER_HANDLE_LENGTH,
                                height: handle.isVertical ? CENTER_HANDLE_LENGTH : CENTER_HANDLE_THICKNESS,
                                backgroundColor: isHovered ? ORANGE_COLOR : 'rgba(249, 115, 22, 0.5)',
                                borderRadius: 1, transition: 'background-color 0.1s',
                            }} />
                        </div>

                        {isOnHandle && !dragCursor && !inlineInput && (
                            <div className="pointer-events-none" style={{
                                position: 'absolute', left: handle.x, top: handle.y,
                                transform: side === 'left' ? 'translate(-100%, -50%) translate(-8px, 0)' :
                                    side === 'right' ? 'translate(0%, -50%) translate(8px, 0)' :
                                    side === 'top' ? 'translate(-50%, -100%) translate(0, -8px)' :
                                    'translate(-50%, 0%) translate(0, 8px)',
                                zIndex: 2000, whiteSpace: 'nowrap',
                            }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    background: '#1e1e2e', padding: '3px 8px', borderRadius: 4,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }}>
                                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                                        <rect x="2" y="2" width="6" height="6" rx="1" stroke={ORANGE_COLOR} strokeWidth="1" fill="none" />
                                        {isH ? (
                                            <line x1={side === 'left' ? 2 : 8} y1="5" x2={side === 'left' ? 0 : 10} y2="5" stroke={ORANGE_COLOR} strokeWidth="1.2" />
                                        ) : (
                                            <line x1="5" y1={side === 'top' ? 2 : 8} x2="5" y2={side === 'top' ? 0 : 10} stroke={ORANGE_COLOR} strokeWidth="1.2" />
                                        )}
                                    </svg>
                                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'system-ui' }}>
                                        {nodeMargin[side]}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}

            {dragCursor && (
                <div className="pointer-events-none" style={{
                    position: 'absolute', left: dragCursor.x, top: dragCursor.y,
                    transform: 'translate(-50%, -100%) translate(0, -12px)', zIndex: 2000,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: '#1e1e2e', padding: '3px 8px', borderRadius: 4,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}>
                        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                            <rect x="2" y="2" width="6" height="6" rx="1" stroke={ORANGE_COLOR} strokeWidth="1" fill="none" />
                        </svg>
                        <span style={{ color: '#e0e0e0', fontSize: 11, fontWeight: 600, fontFamily: 'system-ui' }}>
                            {dragCursor.value}
                        </span>
                    </div>
                </div>
            )}

            {inlineInput && (
                <InlineValueInput
                    x={inlineInput.x} y={inlineInput.y} value={inlineInput.value}
                    color="orange" side={`margin-${inlineInput.side}` as const}
                    onSubmit={handleInlineSubmit} onClose={() => setInlineInput(null)}
                />
            )}
        </>
    )
}


// ============================================================
// DragInsertIndicator — blue line showing reorder insertion point
// ============================================================

export function DragInsertIndicator({
    indicator,
}: {
    indicator: InsertIndicator | null
}) {
    if (!indicator) return null

    return (
        <div
            className="pointer-events-none"
            style={{
                position: 'absolute',
                left: indicator.x,
                top: indicator.y,
                width: indicator.width,
                height: indicator.height,
                backgroundColor: '#3b82f6',
                borderRadius: 1,
                zIndex: 1001,
            }}
        />
    )
}

// ============================================================
// useNodeInteraction — hook for click/hover on rendered nodes
// ============================================================

/** Resolves which node ID to select based on entered-frame context */
function resolveClickTarget(
    targetEl: HTMLElement,
    nodes: ScytleNode[],
    enteredFrameId: string | null
): string | null {
    // Walk up the DOM to collect all data-node-id attrs from target to root
    const nodeIds: string[] = []
    let el: HTMLElement | null = targetEl
    while (el) {
        const nodeId = el.getAttribute('data-node-id')
        if (nodeId) nodeIds.push(nodeId)
        el = el.parentElement
    }

    if (nodeIds.length === 0) return null

    // If we're drilled into a frame, select the deepest child WITHIN that frame
    if (enteredFrameId) {
        // Find the clicked node that is a direct child of the entered frame
        const enteredFrame = findNodeById(nodes, enteredFrameId)
        if (enteredFrame && enteredFrame.type === 'frame') {
            const directChildIds = new Set(enteredFrame.children.map((c) => c.id))
            // The first nodeId in our list that is a direct child of entered frame
            for (const id of nodeIds) {
                if (directChildIds.has(id)) return id
            }
            // If none found, select deepest node in the list that's inside entered frame
            return nodeIds[0]
        }
    }

    // Not drilled in: select the topmost (deepest in DOM tree = first in our list)
    // that is a top-level node or direct child of a top-level node
    const topLevelIds = new Set(nodes.map((n) => n.id))

    // Walk from deepest up, return the first top-level node we find
    for (let i = nodeIds.length - 1; i >= 0; i--) {
        if (topLevelIds.has(nodeIds[i])) return nodeIds[i]
    }

    // Fallback to the deepest
    return nodeIds[0]
}

export function useNodeInteraction() {
    const handleNodePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            // Only respond in select tool mode, left click
            const state = useEditorStore.getState()
            if (state.activeTool !== 'select' || e.button !== 0) return

            // Find the target node element
            const targetEl = e.target as HTMLElement
            const nodeId = resolveClickTarget(
                targetEl,
                state.nodes,
                state.enteredFrameId
            )

            if (!nodeId) return

            e.stopPropagation()
            state.selectNode(nodeId, e.shiftKey)
        },
        []
    )

    const handleNodeDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const state = useEditorStore.getState()
            if (state.activeTool !== 'select') return

            // Find clicked node
            const targetEl = e.target as HTMLElement
            let el: HTMLElement | null = targetEl
            let clickedNodeId: string | null = null
            while (el) {
                const nodeId = el.getAttribute('data-node-id')
                if (nodeId) {
                    clickedNodeId = nodeId
                    break
                }
                el = el.parentElement
            }

            if (!clickedNodeId) return

            const node = findNodeById(state.nodes, clickedNodeId)
            if (!node) return

            // If it's a frame, drill into it
            if (node.type === 'frame' && node.children.length > 0) {
                e.stopPropagation()
                state.enterFrame(clickedNodeId)
            }
        },
        []
    )

    const handleNodePointerEnter = useCallback(
        (nodeId: string) => {
            const state = useEditorStore.getState()
            if (state.activeTool !== 'select') return
            state.setHoveredId(nodeId)
        },
        []
    )

    const handleNodePointerLeave = useCallback(() => {
        useEditorStore.getState().setHoveredId(null)
    }, [])

    return {
        handleNodePointerDown,
        handleNodeDoubleClick,
        handleNodePointerEnter,
        handleNodePointerLeave,
    }
}
