'use client'

import { useRef, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { normaliseHex } from '@/lib/color-utils'
import type { GradientStop } from '@/types/canvas'
import { generateId } from '@/lib/utils'

interface GradientStopBarProps {
    stops: GradientStop[]
    selectedStopId: string | null
    onSelectStop: (id: string) => void
    onMoveStop: (id: string, position: number) => void
    onAddStop: (position: number) => void
    onDeleteStop: (id: string) => void
    /** Gradient angle for correct preview */
    angle?: number
}

/**
 * Gradient preview bar with draggable stop handles.
 * Matches Figma's gradient stop bar exactly.
 */
export function GradientStopBar({
    stops,
    selectedStopId,
    onSelectStop,
    onMoveStop,
    onAddStop,
    onDeleteStop,
    angle = 90,
}: GradientStopBarProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)

    /** Build the CSS gradient string from stops for the preview */
    const gradientCss = (() => {
        if (stops.length === 0) return 'transparent'
        const sorted = [...stops].sort((a, b) => a.position - b.position)
        const parts = sorted.map((s) => {
            const hex = normaliseHex(s.color)
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            return `rgba(${r},${g},${b},${s.opacity ?? 1}) ${s.position * 100}%`
        })
        return `linear-gradient(to right, ${parts.join(', ')})`
    })()

    const positionFromEvent = useCallback((clientX: number): number => {
        const el = trackRef.current
        if (!el) return 0
        const rect = el.getBoundingClientRect()
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    }, [])

    const handleTrackPointerDown = useCallback((e: React.PointerEvent) => {
        // Only handle clicks on the track itself (not on stop handles)
        if ((e.target as HTMLElement).closest('[data-stop-handle]')) return
        e.preventDefault()
        const pos = positionFromEvent(e.clientX)
        onAddStop(pos)
    }, [positionFromEvent, onAddStop])

    const handleStopPointerDown = useCallback((e: React.PointerEvent, stopId: string) => {
        e.preventDefault()
        e.stopPropagation()
        onSelectStop(stopId)
        setDraggingId(stopId)
        trackRef.current?.setPointerCapture(e.pointerId)
    }, [onSelectStop])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingId || e.buttons === 0) return
        const pos = positionFromEvent(e.clientX)
        onMoveStop(draggingId, pos)
    }, [draggingId, positionFromEvent, onMoveStop])

    const handlePointerUp = useCallback(() => {
        setDraggingId(null)
    }, [])

    return (
        <div className="relative select-none touch-none">
            {/* Gradient preview bar */}
            <div
                ref={trackRef}
                className="h-3 rounded-full cursor-crosshair"
                style={{ background: gradientCss }}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            />

            {/* Stop handles — positioned above/below bar */}
            {stops.map((stop) => {
                const hex = normaliseHex(stop.color)
                const isSelected = stop.id === selectedStopId
                const isDragging = stop.id === draggingId

                return (
                    <div
                        key={stop.id ?? stop.position}
                        data-stop-handle="true"
                        className={cn(
                            'absolute top-1/2 w-3.5 h-3.5 rounded-full',
                            'cursor-grab active:cursor-grabbing transition-shadow',
                            isSelected
                                ? 'shadow-[0_0_0_2px_white,0_0_0_3px_hsl(var(--primary)),0_0_0_4px_rgba(0,0,0,0.15)]'
                                : 'shadow-[0_0_0_2px_white,0_0_0_3px_rgba(0,0,0,0.3)]',
                        )}
                        style={{
                            left: `${stop.position * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: `#${hex}`,
                            zIndex: isSelected ? 10 : isDragging ? 20 : 5,
                        }}
                        onPointerDown={(e) => handleStopPointerDown(e, stop.id ?? '')}
                        onKeyDown={(e) => {
                            if ((e.key === 'Delete' || e.key === 'Backspace') && isSelected) {
                                e.preventDefault()
                                onDeleteStop(stop.id ?? '')
                            }
                        }}
                        tabIndex={0}
                    />
                )
            })}
        </div>
    )
}
