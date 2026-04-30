'use client'

import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById } from '@/types/canvas'
import type { GradientFill, GradientStop } from '@/types/canvas'
import { generateId } from '@/lib/utils'
import { normaliseHex } from '@/lib/color-utils'

// ─────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────

function angleToHandles(
    angleDeg: number,
): [{ x: number; y: number }, { x: number; y: number }] {
    const rad = (angleDeg * Math.PI) / 180
    const dx = Math.sin(rad) * 0.5
    const dy = -Math.cos(rad) * 0.5
    return [
        { x: 0.5 - dx, y: 0.5 - dy }, // start
        { x: 0.5 + dx, y: 0.5 + dy }, // end
    ]
}

function handlesToAngle(
    start: { x: number; y: number },
    end: { x: number; y: number },
): number {
    const dx = end.x - start.x
    const dy = end.y - start.y
    return (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360
}

/** Interpolate the gradient color at position t (0–1) from the stops array */
function interpolateStopColor(
    stops: GradientStop[],
    t: number,
): { color: string; opacity: number } {
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    if (sorted.length === 0) return { color: 'ffffff', opacity: 1 }
    if (t <= sorted[0].position) return { color: sorted[0].color, opacity: sorted[0].opacity ?? 1 }
    const last = sorted[sorted.length - 1]
    if (t >= last.position) return { color: last.color, opacity: last.opacity ?? 1 }
    const before = sorted.filter((s) => s.position <= t).pop()!
    const after = sorted.find((s) => s.position > t)!
    const frac = (t - before.position) / (after.position - before.position)
    const lHex = normaliseHex(before.color)
    const rHex = normaliseHex(after.color)
    const [lr, lg, lb] = [0, 2, 4].map((o) => parseInt(lHex.slice(o, o + 2), 16))
    const [rr, rg, rb] = [0, 2, 4].map((o) => parseInt(rHex.slice(o, o + 2), 16))
    const color = [lr + (rr - lr) * frac, lg + (rg - lg) * frac, lb + (rb - lb) * frac]
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('')
    const opacity = (before.opacity ?? 1) + ((after.opacity ?? 1) - (before.opacity ?? 1)) * frac
    return { color, opacity }
}

// ─────────────────────────────────────────────────────────────
// DOM helper
// ─────────────────────────────────────────────────────────────

interface ScreenRect {
    x: number
    y: number
    width: number
    height: number
}

function getNodeScreenRect(
    nodeId: string,
    viewportEl: HTMLElement | null,
): ScreenRect | null {
    if (!viewportEl) return null
    const el = viewportEl.querySelector(`[data-node-id="${nodeId}"]`)
    if (!el) return null
    const nodeRect = el.getBoundingClientRect()
    const vRect = viewportEl.getBoundingClientRect()
    return {
        x: nodeRect.left - vRect.left,
        y: nodeRect.top - vRect.top,
        width: nodeRect.width,
        height: nodeRect.height,
    }
}

// ─────────────────────────────────────────────────────────────
// DragHandle — a single draggable gradient control point
// ─────────────────────────────────────────────────────────────

interface DragHandleProps {
    cx: number
    cy: number
    normPos: { x: number; y: number }
    screenRect: ScreenRect
    isStart: boolean
    onPositionChange: (pos: { x: number; y: number }) => void
}

function DragHandle({
    cx,
    cy,
    normPos,
    screenRect,
    isStart,
    onPositionChange,
}: DragHandleProps) {
    const isDragging = useRef(false)
    const startClient = useRef({ x: 0, y: 0 })
    const startNorm = useRef({ x: 0, y: 0 })
    const rectRef = useRef<ScreenRect>(screenRect)

    useEffect(() => {
        rectRef.current = screenRect
    }, [screenRect])

    return (
        <circle
            cx={cx}
            cy={cy}
            r={5}
            fill={isStart ? 'white' : 'rgba(255,255,255,0.85)'}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={1.5}
            style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
            onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                isDragging.current = true
                startClient.current = { x: e.clientX, y: e.clientY }
                startNorm.current = { ...normPos }
                ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
                if (!isDragging.current) return
                e.stopPropagation()
                const rect = rectRef.current
                if (rect.width < 1 || rect.height < 1) return
                const newX =
                    startNorm.current.x + (e.clientX - startClient.current.x) / rect.width
                const newY =
                    startNorm.current.y + (e.clientY - startClient.current.y) / rect.height
                onPositionChange({ x: newX, y: newY })
            }}
            onPointerUp={(e) => {
                isDragging.current = false
                ;(e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId)
            }}
        />
    )
}

// ─────────────────────────────────────────────────────────────
// GradientHandleOverlay
// ─────────────────────────────────────────────────────────────

interface GradientHandleOverlayProps {
    viewportRef: React.RefObject<HTMLDivElement | null>
}

export function GradientHandleOverlay({ viewportRef }: GradientHandleOverlayProps) {
    // Subscribe to viewport transforms so handles re-render when canvas zooms/pans.
    // getBoundingClientRect() reads the current DOM state, so re-rendering is all we need.
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)

    const gradientEditingFillIdx = useEditorStore((s) => s.gradientEditingFillIdx)
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const nodes = useEditorStore((s) => s.nodes)
    const updateNode = useEditorStore((s) => s.updateNode)

    const nodeId = selectedIds[0] ?? null
    const node = nodeId ? findNodeById(nodes, nodeId) : null
    const fill =
        node && gradientEditingFillIdx !== null
            ? (node.fills[gradientEditingFillIdx] as GradientFill | undefined)
            : null

    // Only render for linear gradient (undefined gradientType defaults to linear)
    if (!fill || fill.type !== 'gradient') return null
    if (fill.gradientType && fill.gradientType !== 'linear') return null

    const screenRect = getNodeScreenRect(nodeId!, viewportRef.current)
    // zoom is used to gate – also suppresses unused-variable lint while keeping subscription
    if (!screenRect || screenRect.width < 4 || screenRect.height < 4 || zoom <= 0) return null
    void panX; void panY // subscribed above; BoundingClientRect handles coordinates

    const angle = fill.angle ?? 90
    const [defaultStart, defaultEnd] = angleToHandles(angle)
    const startNorm = fill.handles?.[0] ?? defaultStart
    const endNorm = fill.handles?.[1] ?? defaultEnd

    const startPx = {
        x: screenRect.x + startNorm.x * screenRect.width,
        y: screenRect.y + startNorm.y * screenRect.height,
    }
    const endPx = {
        x: screenRect.x + endNorm.x * screenRect.width,
        y: screenRect.y + endNorm.y * screenRect.height,
    }

    const handleMove =
        (which: 'start' | 'end') => (newNorm: { x: number; y: number }) => {
            if (!nodeId || !node || gradientEditingFillIdx === null) return
            const cur0 = fill.handles?.[0] ?? defaultStart
            const cur1 = fill.handles?.[1] ?? defaultEnd
            const newStart = which === 'start' ? newNorm : cur0
            const newEnd = which === 'end' ? newNorm : cur1
            const newAngle = handlesToAngle(newStart, newEnd)
            const newFills = node.fills.map((f, i) =>
                i === gradientEditingFillIdx
                    ? { ...f, handles: [newStart, newEnd], angle: newAngle }
                    : f,
            )
            updateNode(nodeId, { fills: newFills })
        }

    /** Click on the gradient line to insert a new stop at that position */
    const handleLineClick = (e: React.MouseEvent<SVGLineElement>) => {
        if (!nodeId || !node || gradientEditingFillIdx === null) return
        e.stopPropagation()
        const vRect = viewportRef.current?.getBoundingClientRect()
        if (!vRect) return
        const clickX = e.clientX - vRect.left
        const clickY = e.clientY - vRect.top
        // Project click onto the line vector to compute t ∈ [0, 1]
        const dx = endPx.x - startPx.x
        const dy = endPx.y - startPx.y
        const len2 = dx * dx + dy * dy
        if (len2 < 1) return
        const t = Math.max(0, Math.min(1, ((clickX - startPx.x) * dx + (clickY - startPx.y) * dy) / len2))
        // Interpolate color at t from existing stops
        const stops = fill.stops ?? []
        const { color, opacity } = interpolateStopColor(stops, t)
        const newStop: GradientStop = { id: generateId(), position: t, color, opacity }
        const newStops = [...stops, newStop].sort((a, b) => a.position - b.position)
        const newFills = node.fills.map((f, i) =>
            i === gradientEditingFillIdx ? { ...f, stops: newStops } : f,
        )
        updateNode(nodeId, { fills: newFills })
    }

    return (
        <svg
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none', overflow: 'visible', zIndex: 45 }}
        >
            {/* Wide transparent hit area for click-to-add-stop (10px wide) */}
            <line
                x1={startPx.x}
                y1={startPx.y}
                x2={endPx.x}
                y2={endPx.y}
                stroke="transparent"
                strokeWidth={10}
                style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                onClick={handleLineClick}
            />
            {/* Visible connecting line */}
            <line
                x1={startPx.x}
                y1={startPx.y}
                x2={endPx.x}
                y2={endPx.y}
                stroke="rgba(255,255,255,0.65)"
                strokeWidth={1}
            />
            {/* Start handle */}
            <DragHandle
                cx={startPx.x}
                cy={startPx.y}
                normPos={startNorm}
                screenRect={screenRect}
                isStart
                onPositionChange={handleMove('start')}
            />
            {/* End handle */}
            <DragHandle
                cx={endPx.x}
                cy={endPx.y}
                normPos={endNorm}
                screenRect={screenRect}
                isStart={false}
                onPositionChange={handleMove('end')}
            />
        </svg>
    )
}
