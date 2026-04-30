'use client'

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import type { TextNode } from '@/types/canvas'
import { TypeSettingsBasics } from './type-settings-basics'

// ── Constants ────────────────────────────────────────────────────────────────

const OVERLAY_W = 260
const MAX_H = 520

// ── Props ────────────────────────────────────────────────────────────────────

interface TypeSettingsOverlayProps {
    node: TextNode
    anchorEl: HTMLElement | null
    onUpdate: (updates: Record<string, unknown>) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TypeSettingsOverlay({ node, anchorEl, onUpdate }: TypeSettingsOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null)
    const close = useEditorStore((s) => s.closeTypeSettings)

    // ── Drag-to-reposition ──
    const posRef = useRef({ left: 0, top: 0 })
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    const isDraggingHeader = useRef(false)
    const dragStart = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 })

    // ── Position beside the right panel — always on mount ──
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        if (!anchorEl || !overlayRef.current) return
        // Walk up from anchorEl to find the panel container
        const panelEl = anchorEl.closest('[data-properties-panel]') as HTMLElement | null
        const panelRect = (panelEl ?? anchorEl).getBoundingClientRect()
        const baseLeft = panelRect.left - OVERLAY_W - 8
        const anchorRect = anchorEl.getBoundingClientRect()
        let baseTop = anchorRect.top - 20
        if (baseTop + MAX_H > window.innerHeight - 8) baseTop = window.innerHeight - MAX_H - 8
        if (baseTop < 8) baseTop = 8
        posRef.current = { left: baseLeft, top: baseTop }
        dragOffsetRef.current = { x: 0, y: 0 }
        overlayRef.current.style.left = `${baseLeft}px`
        overlayRef.current.style.top = `${baseTop}px`
    }, []) // eslint-disable-line

    // ── Close on outside click ──
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
                close()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [close])

    // ── Close on Escape ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [close])

    // ── Drag handlers ──
    const handleHeaderPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return
        e.preventDefault()
        e.stopPropagation()
        isDraggingHeader.current = true
        dragStart.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            offsetX: dragOffsetRef.current.x,
            offsetY: dragOffsetRef.current.y,
        }
        ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    }, [])

    const handleHeaderPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        if (e.buttons === 0) { isDraggingHeader.current = false; return }
        const newX = dragStart.current.offsetX + (e.clientX - dragStart.current.pointerX)
        const newY = dragStart.current.offsetY + (e.clientY - dragStart.current.pointerY)
        dragOffsetRef.current = { x: newX, y: newY }
        if (overlayRef.current) {
            overlayRef.current.style.left = `${posRef.current.left + newX}px`
            overlayRef.current.style.top = `${posRef.current.top + newY}px`
        }
    }, [])

    const handleHeaderPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        isDraggingHeader.current = false
        const el = e.currentTarget as HTMLDivElement
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }, [])

    const overlay = (
        <div
            ref={overlayRef}
            className={cn(
                'fixed z-[9999] rounded-lg shadow-2xl',
                'bg-popover border border-border/60',
                'flex flex-col overflow-hidden',
            )}
            style={{ left: 0, top: 0, width: OVERLAY_W, maxHeight: MAX_H }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
        >
            {/* Header — draggable */}
            <div
                className="flex items-center px-2.5 pt-2 pb-1.5 cursor-move select-none border-b border-border/30"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
            >
                <span className="text-[11px] font-medium flex-1">Type Settings</span>
                <button
                    className="w-6 h-6 flex items-center justify-center rounded-sm
                        text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={close}
                >
                    <X size={12} />
                </button>
            </div>

            {/* Content */}
            <div className="px-2.5 pb-2.5 overflow-y-auto">
                <TypeSettingsBasics node={node} onUpdate={onUpdate} />
            </div>
        </div>
    )

    return createPortal(overlay, document.body)
}
