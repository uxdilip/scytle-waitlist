'use client'

import { useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { hexToRgb } from '@/lib/color-utils'

interface OpacitySliderProps {
    value: number    // 0-1
    hex: string      // current color hex (no '#') — for the gradient end color
    onChange: (opacity: number) => void
    className?: string
}

/** Opacity slider with checkerboard background — matches Figma's opacity bar */
export function OpacitySlider({ value, hex, onChange, className }: OpacitySliderProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const thumbRef = useRef<HTMLDivElement>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const isDragging = useRef(false)
    const hexRef = useRef(hex)
    hexRef.current = hex

    const positionThumb = useCallback((opacity: number) => {
        const el = thumbRef.current
        if (!el) return
        el.style.left = `${opacity * 100}%`
        const { r, g, b } = hexToRgb(hexRef.current)
        el.style.backgroundColor = `rgba(${r},${g},${b},${opacity})`
    }, [])

    useEffect(() => {
        if (isDragging.current) return
        positionThumb(value)
    }, [value, hex, positionThumb])

    const getOpacityFromEvent = useCallback((clientX: number) => {
        const el = trackRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const opacity = Math.round(x * 100) / 100
        positionThumb(opacity)
        onChangeRef.current(opacity)
    }, [positionThumb])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        isDragging.current = true
        getOpacityFromEvent(e.clientX)

        const onMove = (ev: PointerEvent) => {
            ev.stopPropagation()
            getOpacityFromEvent(ev.clientX)
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
    }, [getOpacityFromEvent])

    const { r, g, b } = hexToRgb(hex)

    return (
        <div
            ref={trackRef}
            className={cn('relative h-3 rounded-full cursor-pointer select-none touch-none', className)}
            style={{
                background: [
                    `linear-gradient(to right, rgba(${r},${g},${b},0) 0%, rgba(${r},${g},${b},1) 100%)`,
                    `repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`,
                ].join(', '),
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
