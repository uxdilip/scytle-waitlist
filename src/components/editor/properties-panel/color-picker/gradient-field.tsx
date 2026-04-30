'use client'

import { useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface GradientFieldProps {
    hue: number          // 0-360
    saturation: number   // 0-100
    brightness: number   // 0-100 (value)
    onChange: (saturation: number, brightness: number) => void
    className?: string
}


export function GradientField({
    hue,
    saturation,
    brightness,
    onChange,
    className,
}: GradientFieldProps) {
    const fieldRef = useRef<HTMLDivElement>(null)
    const reticleRef = useRef<HTMLDivElement>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const isDragging = useRef(false)
    const hueRef = useRef(hue)
    hueRef.current = hue

    // Position the reticle via direct DOM write — bypasses React entirely
    const positionReticle = useCallback((s: number, b: number) => {
        const el = reticleRef.current
        if (!el) return
        el.style.left = `${s}%`
        el.style.top = `${100 - b}%`
        const l = b / 2 + (100 - s) * b / 200
        el.style.backgroundColor = `hsl(${hueRef.current}, ${s}%, ${l}%)`
    }, [])

    // Sync reticle from props ONLY when not dragging
    useEffect(() => {
        if (isDragging.current) return
        positionReticle(saturation, brightness)
    }, [saturation, brightness, hue, positionReticle])

    const getValuesFromEvent = useCallback((clientX: number, clientY: number) => {
        const el = fieldRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
        const s = Math.round(x * 100)
        const b = Math.round((1 - y) * 100)
        // Move reticle immediately via DOM — no waiting for React round-trip
        positionReticle(s, b)
        onChangeRef.current(s, b)
    }, [positionReticle])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        isDragging.current = true
        getValuesFromEvent(e.clientX, e.clientY)

        let pendingX = 0, pendingY = 0, rafId: number | null = null
        const onMove = (ev: PointerEvent) => {
            ev.stopPropagation()
            pendingX = ev.clientX
            pendingY = ev.clientY
            if (rafId !== null) return
            rafId = requestAnimationFrame(() => {
                rafId = null
                getValuesFromEvent(pendingX, pendingY)
            })
        }
        const onUp = () => {
            isDragging.current = false
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            document.removeEventListener('pointermove', onMove, true)
            document.removeEventListener('pointerup', onUp, true)
            document.removeEventListener('pointercancel', onUp, true)
        }
        document.addEventListener('pointermove', onMove, true)
        document.addEventListener('pointerup', onUp, true)
        document.addEventListener('pointercancel', onUp, true)
    }, [getValuesFromEvent])

    return (
        <div
            ref={fieldRef}
            className={cn('relative rounded-sm overflow-hidden cursor-crosshair select-none touch-none', className)}
            style={{
                background: [
                    `linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 100%)`,
                    `linear-gradient(to right, rgba(255,255,255,1) 0%, hsl(${hue}, 100%, 50%) 100%)`,
                ].join(', '),
            }}
            onPointerDown={handlePointerDown}
        >
            {/* Reticle — positioned ONLY via ref, never via React style props */}
            <div
                ref={reticleRef}
                className="absolute w-3.5 h-3.5 rounded-full pointer-events-none"
                style={{
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 0 0 2px white, 0 0 0 3px rgba(0,0,0,0.3)',
                }}
            />
        </div>
    )
}
