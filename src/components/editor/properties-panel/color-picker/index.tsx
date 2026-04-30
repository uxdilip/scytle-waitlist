'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normaliseHex, type ColorFormat } from '@/lib/color-utils'
import { generateId } from '@/lib/utils'
import { SolidPicker } from './solid-picker'
import { GradientPicker, defaultGradientStops } from './gradient-picker'
import { ImagePicker } from './image-picker'
import type { Fill, SolidFill, GradientFill, ImageFill, BlendMode } from '@/types/canvas'

// ─────────────────────────────────────────────────────────────
// Blend mode options
// ─────────────────────────────────────────────────────────────

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
    { value: 'NORMAL', label: 'Normal' },
    { value: 'DARKEN', label: 'Darken' },
    { value: 'MULTIPLY', label: 'Multiply' },
    { value: 'PLUS_DARKER', label: 'Plus Darker' },
    { value: 'COLOR_BURN', label: 'Color Burn' },
    { value: 'LIGHTEN', label: 'Lighten' },
    { value: 'SCREEN', label: 'Screen' },
    { value: 'PLUS_LIGHTER', label: 'Plus Lighter' },
    { value: 'COLOR_DODGE', label: 'Color Dodge' },
    { value: 'OVERLAY', label: 'Overlay' },
    { value: 'SOFT_LIGHT', label: 'Soft Light' },
    { value: 'HARD_LIGHT', label: 'Hard Light' },
    { value: 'DIFFERENCE', label: 'Difference' },
    { value: 'EXCLUSION', label: 'Exclusion' },
    { value: 'HUE', label: 'Hue' },
    { value: 'SATURATION', label: 'Saturation' },
    { value: 'COLOR', label: 'Color' },
    { value: 'LUMINOSITY', label: 'Luminosity' },
]

// ─────────────────────────────────────────────────────────────
// Fill type tab icons (SVG inline)
// ─────────────────────────────────────────────────────────────

function SolidIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
    )
}
function LinearIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14">
            <defs>
                <linearGradient id="li" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="currentColor" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="10" height="10" rx="1.5" fill="url(#li)" />
        </svg>
    )
}
function ImageIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 9.5L5 6.5L7.5 9L9.5 7L12 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="5" r="1" fill="currentColor" />
        </svg>
    )
}

// ─────────────────────────────────────────────────────────────
// Document swatch palette
// ─────────────────────────────────────────────────────────────

function SwatchPalette({
    colors,
    onSelect,
}: {
    colors: string[]
    onSelect: (hex: string) => void
}) {
    if (colors.length === 0) return null
    return (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
            {colors.map((c) => (
                <button
                    key={c}
                    className="w-5 h-5 rounded-sm border border-border/40 shrink-0 hover:scale-110 transition-transform"
                    style={{ backgroundColor: `#${normaliseHex(c)}` }}
                    title={`#${normaliseHex(c).toUpperCase()}`}
                    onClick={() => onSelect(normaliseHex(c))}
                />
            ))}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// BlendModeDropdown — custom dropdown with hover preview
// ─────────────────────────────────────────────────────────────

function BlendModeDropdown({
    value,
    onChange,
    onPreview,
}: {
    value: BlendMode
    onChange: (mode: BlendMode) => void
    onPreview: (mode: BlendMode | null) => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const currentLabel = BLEND_MODES.find((bm) => bm.value === value)?.label ?? 'Normal'

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                onPreview(null)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen, onPreview])

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger button */}
            <button
                className={cn(
                    'h-5 px-1.5 flex items-center gap-0.5 rounded-sm text-[10px] transition-colors',
                    'bg-muted text-foreground hover:bg-muted/80',
                    isOpen && 'ring-1 ring-primary/40',
                )}
                onClick={() => setIsOpen((v) => !v)}
            >
                <span>{currentLabel}</span>
                <ChevronDown size={8} className="text-muted-foreground/50" />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    className={cn(
                        'absolute right-0 bottom-full mb-1 z-10000',
                        'w-32 max-h-48 overflow-y-auto py-0.5',
                        'bg-popover border border-border/60 rounded-md shadow-lg',
                    )}
                >
                    {BLEND_MODES.map((bm) => (
                        <button
                            key={bm.value}
                            className={cn(
                                'w-full h-6 px-2 text-left text-[10px] transition-colors',
                                'hover:bg-muted/60',
                                bm.value === value && 'bg-primary/10 text-primary font-medium',
                            )}
                            onPointerEnter={() => onPreview(bm.value)}
                            onPointerLeave={() => onPreview(null)}
                            onClick={() => {
                                onChange(bm.value)
                                setIsOpen(false)
                                onPreview(null)
                            }}
                        >
                            {bm.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface ColorPickerProps {
    /** The fill being edited */
    fill: Fill
    /** Called with the updated fill on every change */
    onChange: (fill: Fill) => void
    /** Anchor element — picker is positioned relative to this */
    anchorEl: HTMLElement | null
    /** Whether the picker is open */
    open: boolean
    onClose: () => void
    /** Document colors for the swatches panel */
    documentColors?: string[]
    /** Restrict to solid color only (hides gradient/image tabs) — for stroke and effect pickers */
    solidOnly?: boolean
    /** Optional element to dock against (used by effect settings popup parity). */
    dockToEl?: HTMLElement | null
    /** Horizontal docking gap in px (0 for Figma-like flush docking). */
    dockGap?: number
}

// ─────────────────────────────────────────────────────────────
// ColorPicker
// ─────────────────────────────────────────────────────────────

type FillTypeTab = 'solid' | 'gradient' | 'image'

const FILL_TYPE_TABS: { id: FillTypeTab; icon: React.ReactNode; label: string }[] = [
    { id: 'solid', icon: <SolidIcon />, label: 'Solid' },
    { id: 'gradient', icon: <LinearIcon />, label: 'Gradient' },
    { id: 'image', icon: <ImageIcon />, label: 'Image' },
]

/** Determine the initial tab from fill type */
function tabFromFill(fill: Fill): FillTypeTab {
    if (fill.type === 'gradient') return 'gradient'
    if (fill.type === 'image') return 'image'
    return 'solid'
}

export function ColorPicker({
    fill,
    onChange,
    anchorEl,
    open,
    onClose,
    documentColors = [],
    solidOnly = false,
    dockToEl = null,
    dockGap = 8,
}: ColorPickerProps) {
    const pickerRef = useRef<HTMLDivElement>(null)
    const [colorFormat, setColorFormat] = useState<ColorFormat>(() => {
        if (typeof window === 'undefined') return 'HEX'
        return (localStorage.getItem('scytle:colorFormat') as ColorFormat) ?? 'HEX'
    })

    // ── Refs for latest fill/onChange — prevents stale closures during drag ──
    const fillRef = useRef(fill)
    const onChangeRef = useRef(onChange)

    useEffect(() => {
        fillRef.current = fill
    }, [fill])

    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    // ── Drag-to-reposition (all refs — zero re-renders during drag) ──
    const posRef = useRef({ left: 0, top: 0 })         // base position (set on open)
    const dragOffsetRef = useRef({ x: 0, y: 0 })       // accumulated drag delta
    const isDraggingHeader = useRef(false)
    const dragStart = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 })

    // ── Blend mode hover preview ─────────────────────────────
    const savedBlendRef = useRef<BlendMode | null>(null)

    const handleBlendPreview = useCallback((mode: BlendMode | null) => {
        if (mode !== null) {
            // Save original blend mode on first Enter, then apply preview
            if (savedBlendRef.current === null) {
                savedBlendRef.current = fillRef.current.blendMode ?? 'NORMAL'
            }
            onChangeRef.current({ ...fillRef.current, blendMode: mode })
        } else {
            // Restore original on Leave
            if (savedBlendRef.current !== null) {
                onChangeRef.current({ ...fillRef.current, blendMode: savedBlendRef.current })
                savedBlendRef.current = null
            }
        }
    }, [])

    const handleBlendChange = useCallback((mode: BlendMode) => {
        savedBlendRef.current = null // commit — no need to restore
        onChangeRef.current({ ...fillRef.current, blendMode: mode })
    }, [])

    // Compute picker position once when it opens — runs before browser paint (no flicker)
    useLayoutEffect(() => {
        if (!open || !anchorEl || !pickerRef.current) return

        const anchorRect = anchorEl.getBoundingClientRect()
        const dockRect = dockToEl?.getBoundingClientRect()
        const PICKER_W = 240
        const PICKER_H = solidOnly ? 448 : 460

        let baseLeft = dockRect
            ? dockRect.left - PICKER_W - dockGap
            : anchorRect.left - PICKER_W - 8
        let baseTop = anchorRect.top

        if (baseLeft < 8) {
            baseLeft = dockRect
                ? dockRect.right + dockGap
                : anchorRect.right + 8
        }
        if (baseTop + PICKER_H > window.innerHeight - 8) {
            baseTop = window.innerHeight - PICKER_H - 8
        }
        if (baseTop < 8) baseTop = 8

        posRef.current = { left: baseLeft, top: baseTop }
        dragOffsetRef.current = { x: 0, y: 0 }
        pickerRef.current.style.left = `${baseLeft}px`
        pickerRef.current.style.top = `${baseTop}px`
    }, [open, anchorEl, dockToEl, dockGap, solidOnly])

    const handleFormatChange = useCallback((format: ColorFormat) => {
        setColorFormat(format)
        localStorage.setItem('scytle:colorFormat', format)
    }, [])

    const activeTab = tabFromFill(fill)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as Node
            if (
                pickerRef.current && !pickerRef.current.contains(target) &&
                anchorEl && !anchorEl.contains(target) &&
                (!dockToEl || !dockToEl.contains(target))
            ) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleMouseDown)
        return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [open, onClose, anchorEl, dockToEl])

    // Escape key
    useEffect(() => {
        if (!open) return
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [open, onClose])

    // Stable callbacks that always read the latest fill — critical for drag operations
    // MUST be before any early return to satisfy React's Rules of Hooks
    const handleSolidHexChange = useCallback((newHex: string) => {
        const f = fillRef.current
        if (f.type !== 'solid') return
        onChangeRef.current({ ...f, color: newHex })
    }, [])
    const handleSolidOpacityChange = useCallback((newOpacity: number) => {
        const f = fillRef.current
        if (f.type !== 'solid') return
        onChangeRef.current({ ...f, opacity: newOpacity })
    }, [])
    const handleFillChange = useCallback((newFill: Fill) => {
        onChangeRef.current(newFill)
    }, [])

    if (!open || !anchorEl) return null

    // Position is computed in useLayoutEffect and applied directly to the DOM.
    // We render with left:0/top:0 as a placeholder — useLayoutEffect corrects this
    // before the browser paints, so the user never sees the wrong position.

    const handleHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return // don't drag when clicking tab buttons
        e.preventDefault()   // prevent text-selection cursor during drag
        e.stopPropagation()  // prevent canvas from starting its own pan/drag
        isDraggingHeader.current = true
        dragStart.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            offsetX: dragOffsetRef.current.x,
            offsetY: dragOffsetRef.current.y,
        }
            ; (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    }

    const handleHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        if (e.buttons === 0) {
            isDraggingHeader.current = false
            return
        }
        const newX = dragStart.current.offsetX + (e.clientX - dragStart.current.pointerX)
        const newY = dragStart.current.offsetY + (e.clientY - dragStart.current.pointerY)
        dragOffsetRef.current = { x: newX, y: newY }
        // Direct DOM write — zero React re-renders, zero layout reflows
        if (pickerRef.current) {
            pickerRef.current.style.left = `${posRef.current.left + newX}px`
            pickerRef.current.style.top = `${posRef.current.top + newY}px`
        }
    }

    const handleHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingHeader.current) return
        isDraggingHeader.current = false
        const el = e.currentTarget as HTMLDivElement
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    const handleHeaderPointerCancel = () => {
        isDraggingHeader.current = false
    }

    // ── Tab switch logic ─────────────────────────────────────

    const handleTabChange = (tab: FillTypeTab) => {
        if (tab === fill.type) return // No conversion needed

        if (tab === 'solid') {
            // Gradient/image → solid: extract a representative color
            let color = 'ffffff'
            if (fill.type === 'gradient' && fill.stops && fill.stops.length > 0) {
                color = normaliseHex(fill.stops[0].color)
            }
            const solidFill: SolidFill = {
                type: 'solid',
                id: fill.id ?? generateId(),
                color,
                opacity: fill.opacity ?? 1,
                visible: fill.visible ?? true,
                blendMode: fill.blendMode ?? 'NORMAL',
            }
            onChange(solidFill)
        } else if (tab === 'gradient') {
            // Solid/image → gradient: use current color as first stop
            let stops = defaultGradientStops()
            if (fill.type === 'solid') {
                stops = defaultGradientStops(normaliseHex(fill.color))
            }
            const gradientFill: GradientFill = {
                type: 'gradient',
                id: fill.id ?? generateId(),
                gradientType: 'linear',
                stops,
                angle: 90,
                opacity: fill.opacity ?? 1,
                visible: fill.visible ?? true,
                blendMode: fill.blendMode ?? 'NORMAL',
            }
            onChange(gradientFill)
        } else if (tab === 'image') {
            // Solid/gradient → image: empty image fill
            const imageFill: ImageFill = {
                type: 'image',
                id: fill.id ?? generateId(),
                src: '',
                fit: 'cover',
                opacity: fill.opacity ?? 1,
                visible: fill.visible ?? true,
                blendMode: fill.blendMode ?? 'NORMAL',
            }
            onChange(imageFill)
        }
    }

    const solidFill = fill.type === 'solid' ? fill : null
    const gradientFill = fill.type === 'gradient' ? fill : null
    const imageFill = fill.type === 'image' ? fill : null

    const picker = (
        <div
            ref={pickerRef}
            data-color-picker-root
            className={cn(
                'fixed z-9999 w-60 rounded-lg shadow-2xl',
                'bg-popover border border-border/60',
                'flex flex-col overflow-hidden',
            )}
            style={{ left: 0, top: 0 }}  // overwritten by useLayoutEffect before paint
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
        >
            {/* Header: drag handle + fill type tabs + close */}
            <div
                className="flex items-center gap-1 px-2.5 pt-2.5 pb-2 cursor-move select-none"
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={handleHeaderPointerCancel}
            >
                <span className="text-[11px] font-medium text-muted-foreground mr-1">
                    {solidOnly ? 'Color' : 'Fill'}
                </span>
                {/* Fill type tab icons — hidden when solidOnly */}
                {!solidOnly && (
                    <div className="flex items-center gap-0.5 flex-1">
                        {FILL_TYPE_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                title={tab.label}
                                className={cn(
                                    'w-6 h-6 flex items-center justify-center rounded-sm transition-colors',
                                    activeTab === tab.id
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
                                )}
                                onClick={() => handleTabChange(tab.id)}
                            >
                                {tab.icon}
                            </button>
                        ))}
                    </div>
                )}
                {solidOnly && <div className="flex-1" />}
                <button
                    className="w-6 h-6 flex items-center justify-center rounded-sm
                        text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={onClose}
                >
                    <X size={12} />
                </button>
            </div>

            {/* Picker body */}
            <div className="px-2.5 pb-2.5">
                {activeTab === 'solid' && solidFill && (
                    <SolidPicker
                        hex={normaliseHex(solidFill.color)}
                        opacity={solidFill.opacity ?? 1}
                        onHexChange={handleSolidHexChange}
                        onOpacityChange={handleSolidOpacityChange}
                        colorFormat={colorFormat}
                        onColorFormatChange={handleFormatChange}
                    />
                )}
                {activeTab === 'gradient' && gradientFill && (
                    <GradientPicker
                        fill={gradientFill}
                        onChange={handleFillChange}
                        colorFormat={colorFormat}
                        onColorFormatChange={handleFormatChange}
                    />
                )}
                {activeTab === 'image' && imageFill && (
                    <ImagePicker
                        fill={imageFill}
                        onChange={handleFillChange}
                    />
                )}
                {activeTab === 'image' && !imageFill && (
                    <div className="py-4 text-[11px] text-muted-foreground text-center">
                        Switch to image fill to edit
                    </div>
                )}
            </div>

            {/* Document swatches — only for solid fills */}
            {!solidOnly && activeTab === 'solid' && documentColors.length > 0 && (
                <div className="px-2.5 pb-2.5 border-t border-border/40 pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground/60">Blend</span>
                        <BlendModeDropdown
                            value={(fill.blendMode ?? 'NORMAL') as BlendMode}
                            onChange={handleBlendChange}
                            onPreview={handleBlendPreview}
                        />
                    </div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground/60">Document</span>
                    </div>
                    <SwatchPalette
                        colors={documentColors}
                        onSelect={(newHex) => {
                            if (solidFill) onChange({ ...solidFill, color: newHex })
                        }}
                    />
                </div>
            )}
            {/* Blend mode for non-solid fills or when no document colors */}
            {!solidOnly && !(activeTab === 'solid' && documentColors.length > 0) && (
                <div className="px-2.5 pb-2.5 border-t border-border/40 pt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/60">Blend</span>
                        <BlendModeDropdown
                            value={(fill.blendMode ?? 'NORMAL') as BlendMode}
                            onChange={handleBlendChange}
                            onPreview={handleBlendPreview}
                        />
                    </div>
                </div>
            )}
        </div>
    )

    return createPortal(picker, document.body)
}
