'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DesignTab } from './design-tab'

const MIN_WIDTH = 240
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 256

export function RightPanel() {
    const [width, setWidth] = useState(DEFAULT_WIDTH)
    const isDragging = useRef(false)
    const startX = useRef(0)
    const startWidth = useRef(DEFAULT_WIDTH)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true
        startX.current = e.clientX
        startWidth.current = width
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        e.preventDefault()
    }, [width])

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return

            // Dragging left should increase right panel width, dragging right should decrease it.
            const delta = e.clientX - startX.current
            const nextWidth = startWidth.current - delta
            setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)))
        }

        const handleMouseUp = () => {
            if (!isDragging.current) return
            isDragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    return (
        <div className="relative flex shrink-0" style={{ width }}>
            {/* ── Drag handle (resize only, no collapse) ── */}
            <div
                onMouseDown={handleMouseDown}
                className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-20"
                title="Resize design panel"
            />

            <div className="flex flex-col flex-1 bg-card border-l border-border/60 select-none overflow-hidden">
                {/* ── Tab bar ── */}
                <div className="flex h-10 border-b border-border/40 shrink-0 items-center px-3">
                    <span className="text-xs font-medium text-foreground">Design</span>
                </div>

                {/* ── Tab content ── */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    <DesignTab />
                </div>
            </div>
        </div>
    )
}
