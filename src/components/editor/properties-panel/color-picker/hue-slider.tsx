'use client'

import { useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface HueSliderProps {
    value: number   // 0-360
    onChange: (hue: number) => void
    className?: string
}

/** Rainbow hue slider — matches Figma's hue bar exactly */
export function HueSlider({ value, onChange, className }: HueSliderProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const thumbRef = useRef<HTMLDivElement>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const isDragging = useRef(false)

    const positionThumb = useCallback((hue: number) => {
        const el = thumbRef.current
        if (!el) return
        el.style.left = `${(hue / 360) * 100}%`
        el.style.backgroundColor = `hsl(${hue}, 100%, 50%)`
    }, [])

    useEffect(() => {
        if (isDragging.current) return
        positionThumb(value)
    }, [value, positionThumb])

    const getHueFromEvent = useCallback((clientX: number) => {
        const el = trackRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const hue = Math.round(x * 360)
        positionThumb(hue)
        onChangeRef.current(hue)
    }, [positionThumb])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        isDragging.current = true
        getHueFromEvent(e.clientX)

        const onMove = (ev: PointerEvent) => {
            ev.stopPropagation()
            getHueFromEvent(ev.clientX)
        }
        const onUp = () => {
            isDragging.current = false
            document.removeEventListener('pointermove', onMove, true)
            document.removeEventListener('pointerup', onUp, true)
            document.removeEventListener('pointercancel', onUp, true)
        }
        document.addEventListener('pointermove', onMove, true)
        document.addEventListener('pointerup', onUp, true)
        document.addEventListener('pointercancel', onUp, true)
    }, [getHueFromEvent])

    return (
        <div
            ref={trackRef}
            className={cn(
                'relative h-3 rounded-full cursor-pointer select-none touch-none',
                className
            )}
            style={{
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            }}
            onPointerDown={handlePointerDown}
        >
            {/* Thumb — positioned only via ref */}
            <div
                ref={thumbRef}
                className="absolute top-1/2 w-3 h-3 rounded-full pointer-events-none"
                style={{
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 0 0 2px white, 0 0 0 3px rgba(0,0,0,0.25)',
                }}
            />
        </div>
    )
}
