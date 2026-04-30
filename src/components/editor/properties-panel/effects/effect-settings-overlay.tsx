'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Blend, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BlendMode, Fill, Shadow, SolidFill } from '@/types/canvas'
import { hexOpacityToRgba, normaliseHex } from '@/lib/color-utils'
import { NumberInput } from '../inputs'
import { BLEND_MODES, ColorPicker } from '../color-picker'
import { InlineHexValueInput, InlinePercentInput } from '../paint-row-inputs'

const OVERLAY_W = 240
const OVERLAY_H_ESTIMATE = 300
const VIEWPORT_GUTTER = 8

const SHADOW_TYPE_OPTIONS = [
    { value: 'drop', label: 'Drop shadow' },
    { value: 'inner', label: 'Inner shadow' },
] as const

const BLEND_MODE_LABELS: Record<BlendMode, string> = BLEND_MODES.reduce(
    (acc, mode) => {
        acc[mode.value] = mode.label
        return acc
    },
    {} as Record<BlendMode, string>,
)

const BLEND_DIVIDERS_AFTER = new Set<BlendMode>(['COLOR_BURN', 'COLOR_DODGE', 'EXCLUSION'])

interface EffectSettingsOverlayProps {
    shadow: Shadow
    colorFill: SolidFill
    open: boolean
    anchorEl: HTMLElement | null
    documentColors: string[]
    onUpdate: (partial: Partial<Shadow>) => void
    onColorFillChange: (fill: SolidFill) => void
    onClose: () => void
}

export function EffectSettingsOverlay({
    shadow,
    colorFill,
    open,
    anchorEl,
    documentColors,
    onUpdate,
    onColorFillChange,
    onClose,
}: EffectSettingsOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null)
    const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null)

    const basePositionRef = useRef({ left: 0, top: 0 })
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 })
    const isDraggingHeaderRef = useRef(false)

    const [swatchEl, setSwatchEl] = useState<HTMLButtonElement | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [blendMenuOpen, setBlendMenuOpen] = useState(false)

    const blendMenuRef = useRef<HTMLDivElement>(null)

    const activeBlendMode = shadow.blendMode ?? 'NORMAL'
    const activeBlendLabel = BLEND_MODE_LABELS[activeBlendMode]

    const handleOverlayRef = useCallback((el: HTMLDivElement | null) => {
        overlayRef.current = el
        setOverlayEl(el)
    }, [])

    const handleRequestClose = useCallback(() => {
        setBlendMenuOpen(false)
        setPickerOpen(false)
        onClose()
    }, [onClose])

    useLayoutEffect(() => {
        if (!open || !anchorEl || !overlayRef.current) return

        const panelEl = anchorEl.closest('[data-properties-panel]') as HTMLElement | null
        const panelRect = (panelEl ?? anchorEl).getBoundingClientRect()
        const anchorRect = anchorEl.getBoundingClientRect()

        let left = panelRect.left - OVERLAY_W
        if (left < VIEWPORT_GUTTER) left = anchorRect.right

        let top = anchorRect.top
        const maxTop = window.innerHeight - OVERLAY_H_ESTIMATE - VIEWPORT_GUTTER
        if (top > maxTop) top = Math.max(VIEWPORT_GUTTER, maxTop)
        if (top < VIEWPORT_GUTTER) top = VIEWPORT_GUTTER

        basePositionRef.current = { left, top }
        dragOffsetRef.current = { x: 0, y: 0 }
        overlayRef.current.style.left = `${left}px`
        overlayRef.current.style.top = `${top}px`
    }, [open, anchorEl])

    useEffect(() => {
        if (!open) return

        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            if (overlayRef.current?.contains(target)) return
            if (anchorEl?.contains(target)) return
            if (pickerOpen && target instanceof Element && target.closest('[data-color-picker-root]')) return
            handleRequestClose()
        }

        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open, anchorEl, pickerOpen, handleRequestClose])

    useEffect(() => {
        if (!open || !blendMenuOpen) return

        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            if (blendMenuRef.current?.contains(target)) return
            setBlendMenuOpen(false)
        }

        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open, blendMenuOpen])

    useEffect(() => {
        if (!open) return

        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return

            if (blendMenuOpen) {
                setBlendMenuOpen(false)
                return
            }

            if (pickerOpen) {
                setPickerOpen(false)
                return
            }

            handleRequestClose()
        }

        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, blendMenuOpen, pickerOpen, handleRequestClose])

    const handleHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button,select,input,textarea,[role="combobox"]')) return

        e.preventDefault()
        e.stopPropagation()

        isDraggingHeaderRef.current = true
        dragStartRef.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            offsetX: dragOffsetRef.current.x,
            offsetY: dragOffsetRef.current.y,
        }

            ; (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    }

    const handleHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeaderRef.current) return
        if (e.buttons === 0) {
            isDraggingHeaderRef.current = false
            return
        }

        const newX = dragStartRef.current.offsetX + (e.clientX - dragStartRef.current.pointerX)
        const newY = dragStartRef.current.offsetY + (e.clientY - dragStartRef.current.pointerY)

        dragOffsetRef.current = { x: newX, y: newY }

        if (overlayRef.current) {
            overlayRef.current.style.left = `${basePositionRef.current.left + newX}px`
            overlayRef.current.style.top = `${basePositionRef.current.top + newY}px`
        }
    }

    const handleHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeaderRef.current) return
        isDraggingHeaderRef.current = false

        const el = e.currentTarget as HTMLDivElement
        if (el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId)
        }
    }

    const handleHeaderPointerCancel = () => {
        isDraggingHeaderRef.current = false
    }

    if (!open || !anchorEl) return null

    const opacity = colorFill.opacity ?? 1

    return createPortal(
        <div
            ref={handleOverlayRef}
            data-effect-settings-overlay
            className={cn(
                'fixed z-9999 rounded-xl shadow-2xl',
                'bg-popover border border-border/60',
                'flex flex-col overflow-visible',
            )}
            style={{
                left: 0,
                top: 0,
                width: OVERLAY_W,
                maxHeight: 'calc(100vh - 16px)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div
                className="flex items-center gap-1 px-2 py-1.5 border-b border-border/35 cursor-move select-none"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={handleHeaderPointerCancel}
            >
                <select
                    value={shadow.type}
                    className={cn(
                        'h-7 px-2.5 pr-7 text-[11px] rounded-md min-w-36 appearance-none',
                        'bg-muted/30 border border-border/45 text-foreground',
                        'hover:bg-muted/45 focus:outline-none focus:bg-muted/50',
                        'transition-colors',
                    )}
                    onChange={(e) => onUpdate({ type: e.target.value as Shadow['type'] })}
                >
                    {SHADOW_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>

                <div className="flex-1" />

                <div ref={blendMenuRef} className="relative">
                    <button
                        className={cn(
                            'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
                            blendMenuOpen
                                ? 'text-foreground bg-muted/55'
                                : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50',
                        )}
                        onClick={() => setBlendMenuOpen((v) => !v)}
                        title={`Blend mode: ${activeBlendLabel}`}
                    >
                        <Blend size={14} />
                    </button>

                    {blendMenuOpen && (
                        <div
                            className={cn(
                                'absolute right-0 bottom-full mb-1 z-10000',
                                'min-w-28 max-h-60 overflow-y-auto rounded-md',
                                'border border-white/10 bg-[#1a1b1f] py-1 shadow-2xl',
                            )}
                        >
                            {BLEND_MODES.map((mode) => {
                                const selected = activeBlendMode === mode.value
                                return (
                                    <div key={mode.value}>
                                        <button
                                            className={cn(
                                                'w-full h-7 px-2.5 flex items-center gap-1.5 text-left text-[11px] transition-colors',
                                                selected
                                                    ? 'text-white bg-white/7'
                                                    : 'text-white/88 hover:bg-white/10',
                                            )}
                                            onClick={() => {
                                                setBlendMenuOpen(false)
                                                onUpdate({ blendMode: mode.value })
                                            }}
                                        >
                                            <span className="w-3 h-3 flex items-center justify-center shrink-0">
                                                {selected && <Check size={11} className="text-white" />}
                                            </span>
                                            <span>{mode.label}</span>
                                        </button>

                                        {BLEND_DIVIDERS_AFTER.has(mode.value) && (
                                            <div className="mx-2 my-0.5 border-t border-white/12" />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <button
                    className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center',
                        'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors',
                    )}
                    onClick={handleRequestClose}
                    title="Close"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Body */}
            <div className="px-2.5 py-2 overflow-y-auto flex-1 min-h-0 space-y-2">
                <div className="grid grid-cols-[62px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/80">Position</span>
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput
                            label="X"
                            value={shadow.x}
                            onChange={(v) => onUpdate({ x: v })}
                            step={1}
                            labelWidth="w-3"
                        />
                        <NumberInput
                            label="Y"
                            value={shadow.y}
                            onChange={(v) => onUpdate({ y: v })}
                            step={1}
                            labelWidth="w-3"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-[62px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/80">Blur</span>
                    <NumberInput
                        value={shadow.blur}
                        onChange={(v) => onUpdate({ blur: Math.max(0, v) })}
                        min={0}
                        step={1}
                    />
                </div>

                <div className="grid grid-cols-[62px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/80">Spread</span>
                    <NumberInput
                        value={shadow.spread}
                        onChange={(v) => onUpdate({ spread: v })}
                        step={1}
                    />
                </div>

                <div className="grid grid-cols-[62px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/80">Color</span>
                    <div
                        className={cn(
                            'flex items-center min-w-0 h-7 rounded-sm border overflow-hidden',
                            'border-border/35 bg-muted/20',
                        )}
                    >
                        <button
                            ref={setSwatchEl}
                            className={cn(
                                'w-5 h-5 rounded-sm border shrink-0 ml-0.5 mr-1 transition-all',
                                'border-border/40 hover:border-border/80',
                                pickerOpen && 'ring-1 ring-primary/40',
                            )}
                            style={{ backgroundColor: hexOpacityToRgba(normaliseHex(colorFill.color), opacity) }}
                            onClick={() => {
                                setBlendMenuOpen(false)
                                setPickerOpen(true)
                            }}
                            title="Edit effect color"
                        />

                        <div className="w-px h-full bg-border/35 shrink-0" />

                        <InlineHexValueInput
                            value={colorFill.color}
                            onCommit={(nextHex) => onColorFillChange({ ...colorFill, color: nextHex })}
                            className="flex-1 min-w-0 h-full border-0 hover:bg-transparent focus:bg-transparent"
                        />

                        <div className="w-px h-full bg-border/35 shrink-0" />

                        <div className="flex items-center w-13 shrink-0 pr-1">
                            <InlinePercentInput
                                value={opacity}
                                onCommit={(nextOpacity) => onColorFillChange({ ...colorFill, opacity: nextOpacity })}
                                className="w-9 h-full border-0 hover:bg-transparent focus:bg-transparent"
                            />
                            <span className="text-[10px] text-muted-foreground/45">%</span>
                        </div>
                    </div>
                </div>
            </div>

            <ColorPicker
                fill={colorFill}
                onChange={(updated: Fill) => {
                    if (updated.type === 'solid') {
                        onColorFillChange(updated)
                    }
                }}
                anchorEl={swatchEl}
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                documentColors={documentColors}
                solidOnly
                dockToEl={overlayEl}
                dockGap={0}
            />
        </div>,
        document.body,
    )
}
