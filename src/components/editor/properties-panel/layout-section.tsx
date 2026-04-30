'use client'

import type { FrameNode, Layout, Padding, GridTrack } from '@/types/canvas'
import { Section, NumberInput, SelectInput, Checkbox } from './inputs'
import {
    ArrowDown,
    ArrowRight,
    LayoutGrid,
    Minus,
    Move,
    Plus,
    WrapText,
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { isAutoGapLayout } from '../layout-gap-utils'

// ── Figma-style flow radio group ─────────────────────────────

type LayoutMode = 'none' | 'flex-col' | 'flex-row' | 'grid'

function layoutToMode(l: Layout): LayoutMode {
    if (l.mode === 'none') return 'none'
    if (l.mode === 'grid') return 'grid'
    return l.direction === 'row' ? 'flex-row' : 'flex-col'
}

function modeToLayout(mode: LayoutMode, prev: Layout): Partial<Layout> {
    switch (mode) {
        case 'none': return { mode: 'none' }
        case 'flex-col': return { mode: 'flex', direction: 'column' }
        case 'flex-row': return { mode: 'flex', direction: 'row' }
        case 'grid': {
            const cols = typeof prev.columns === 'number' ? prev.columns : 2
            const tracks: GridTrack[] = Array.from({ length: cols }, () => ({ value: 1, unit: 'fr' as const }))
            const normalizedGap = Math.max(0, prev.gap ?? 0)
            return {
                mode: 'grid',
                columns: cols,
                columnTracks: tracks,
                columnGap: Math.max(0, prev.columnGap ?? normalizedGap),
                rowGap: Math.max(0, prev.rowGap ?? normalizedGap),
            }
        }
    }
}

function shouldForceFixedSizingOnAutoLayout(node: FrameNode): boolean {
    // Auto-layout hug sizing with no in-flow children collapses to 0x0.
    // Figma keeps fixed dimensions in this edge case instead of making the frame invisible.
    return node.children.every((child) => child.positioning === 'absolute')
}

const FLOW_OPTIONS: { value: LayoutMode; icon: React.ReactNode; label: string }[] = [
    { value: 'none', icon: <Move size={14} />, label: 'Free' },
    { value: 'flex-col', icon: <ArrowDown size={14} />, label: 'V' },
    { value: 'flex-row', icon: <ArrowRight size={14} />, label: 'H' },
    { value: 'grid', icon: <LayoutGrid size={14} />, label: 'Grid' },
]

// ── Padding icons (Figma-style inline SVGs) ─────────────────

function HorizontalPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="1" y1="2" x2="1" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="2" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function VerticalPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function LeftPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="1" y1="2" x2="1" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function RightPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="11" y1="2" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function TopPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function BottomPaddingIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function IndividualPaddingIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" className="text-muted-foreground shrink-0">
            {expanded ? (
                <>
                    <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
                    <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
                    <circle cx="9.5" cy="4.5" r="1" fill="currentColor" />
                    <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
                    <circle cx="9.5" cy="9.5" r="1" fill="currentColor" />
                </>
            ) : (
                <>
                    <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
                    <line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 1" />
                    <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 1" />
                </>
            )}
        </svg>
    )
}

// ── Gap direction icons ──────────────────────────────────────

function VerticalGapIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="3" y1="1" x2="9" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="3" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

function HorizontalGapIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="1" y1="3" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3" x2="6" y2="9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="11" y1="3" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

// ── Space between icon ──────────────────────────────────────

function SpaceBetweenIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="shrink-0">
            <line x1="1" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4.5" y1="4" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="7.5" y1="4" x2="7.5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
    )
}

function PackedIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="shrink-0">
            <line x1="1" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="5" y1="4" x2="5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
    )
}

// ── Scrub-on-label hook ──────────────────────────────────────

function useScrub(value: number, onChange: (v: number) => void, step = 1, min = 0) {
    const scrubRef = useRef<{ startX: number; startVal: number } | null>(null)

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        scrubRef.current = { startX: e.clientX, startVal: value }
        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)
        target.style.cursor = 'ew-resize'

        const onMove = (me: PointerEvent) => {
            if (!scrubRef.current) return
            const dx = me.clientX - scrubRef.current.startX
            const delta = Math.round(dx / 2) * step
            const newVal = Math.max(min, scrubRef.current.startVal + delta)
            onChange(newVal)
        }

        const onUp = () => {
            scrubRef.current = null
            target.style.cursor = ''
            target.removeEventListener('pointermove', onMove)
            target.removeEventListener('pointerup', onUp)
        }

        target.addEventListener('pointermove', onMove)
        target.addEventListener('pointerup', onUp)
    }, [value, onChange, step, min])

    return { onPointerDown }
}

// ── 3×3 Alignment grid (Figma-style, space-between aware) ────

type Align3x3 = `${'start' | 'center' | 'end'}-${'start' | 'center' | 'end'}`

function getAlign3x3(j: Layout['justify'], a: Layout['align']): Align3x3 {
    const jj = j === 'between' ? 'start' : (j || 'start')
    const aa = a === 'stretch' ? 'start' : (a || 'start')
    return `${jj}-${aa}` as Align3x3
}

/** SVG cell for the alignment grid. Shows 3 lines packed or spread. */
function AlignmentDot({
    justify,
    align,
    isSpaceBetween,
    isRow,
}: {
    justify: 'start' | 'center' | 'end'
    align: 'start' | 'center' | 'end'
    isSpaceBetween: boolean
    isRow: boolean
}) {
    // Positions for 3 lines representing items
    // mainPos: position along main axis, crossPos: position along cross axis
    const getMainPositions = (): number[] => {
        if (isSpaceBetween) return [2, 8, 14] // spread to edges
        switch (justify) {
            case 'start': return [2, 5, 8]
            case 'center': return [5, 8, 11]
            case 'end': return [8, 11, 14]
        }
    }

    const getCrossOffset = (): number => {
        switch (align) {
            case 'start': return 3
            case 'center': return 8
            case 'end': return 13
        }
    }

    const mainPositions = getMainPositions()
    const crossOffset = getCrossOffset()

    return (
        <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            {mainPositions.map((pos, i) => {
                const x = isRow ? pos : crossOffset
                const y = isRow ? crossOffset : pos
                const w = isRow ? 1.5 : 4
                const h = isRow ? 4 : 1.5
                return (
                    <rect
                        key={i}
                        x={x - w / 2}
                        y={y - h / 2}
                        width={w}
                        height={h}
                        rx={0.5}
                        fill="currentColor"
                    />
                )
            })}
        </svg>
    )
}

function AlignmentGrid({
    value,
    onChange,
    direction,
    isSpaceBetween,
}: {
    value: Align3x3
    onChange: (justify: 'start' | 'center' | 'end', align: 'start' | 'center' | 'end') => void
    direction: 'column' | 'row'
    isSpaceBetween: boolean
}) {
    const rows: ('start' | 'center' | 'end')[] = ['start', 'center', 'end']
    const cols: ('start' | 'center' | 'end')[] = ['start', 'center', 'end']
    const isRow = direction === 'row'

    return (
        <div className="grid grid-cols-3 gap-0 w-fit border border-border/40 rounded-sm overflow-hidden">
            {rows.map((r) =>
                cols.map((c) => {
                    const justify = isRow ? c : r
                    const align = isRow ? r : c
                    const key = `${justify}-${align}` as Align3x3
                    const active = isSpaceBetween
                        ? align === value.split('-')[1] // only cross-axis matters
                        : value === key

                    return (
                        <button
                            key={key}
                            className={cn(
                                'w-5 h-5 flex items-center justify-center transition-colors',
                                active
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground/40 hover:bg-muted/60 hover:text-muted-foreground'
                            )}
                            onClick={() => onChange(justify, align)}
                            title={`${justify} / ${align}`}
                        >
                            <AlignmentDot
                                justify={justify}
                                align={align}
                                isSpaceBetween={isSpaceBetween}
                                isRow={isRow}
                            />
                        </button>
                    )
                })
            )}
        </div>
    )
}

// ── Padding controls (Figma-exact, with directional hover) ──

function PaddingControls({
    padding,
    onChange,
    nodeId,
}: {
    padding: Padding
    onChange: (p: Partial<Padding>) => void
    nodeId: string
}) {
    const hMixed = padding.left !== padding.right
    const vMixed = padding.top !== padding.bottom
    const [individualMode, setIndividualMode] = useState(false)
    const setPaddingOverlay = useEditorStore((s) => s.setPaddingOverlay)

    // Comma-separated shorthand handler: "10" = all, "10,20" = V,H, "10,20,30,40" = T,R,B,L
    const handleShorthand = useCallback((values: number[]) => {
        const clamped = values.map((v) => Math.max(0, v))
        if (clamped.length === 1) {
            onChange({ top: clamped[0], right: clamped[0], bottom: clamped[0], left: clamped[0] })
        } else if (clamped.length === 2) {
            onChange({ top: clamped[0], bottom: clamped[0], left: clamped[1], right: clamped[1] })
        } else if (clamped.length === 3) {
            onChange({ top: clamped[0], right: clamped[1], bottom: clamped[2], left: clamped[1] })
        } else if (clamped.length >= 4) {
            onChange({ top: clamped[0], right: clamped[1], bottom: clamped[2], left: clamped[3] })
        }
    }, [onChange])

    const hScrub = useScrub(padding.left, (v) => onChange({ left: v, right: v }))
    const vScrub = useScrub(padding.top, (v) => onChange({ top: v, bottom: v }))
    const lScrub = useScrub(padding.left, (v) => onChange({ left: v }))
    const rScrub = useScrub(padding.right, (v) => onChange({ right: v }))
    const tScrub = useScrub(padding.top, (v) => onChange({ top: v }))
    const bScrub = useScrub(padding.bottom, (v) => onChange({ bottom: v }))

    // Show expanded mode when explicitly toggled OR when values are mixed
    const showExpanded = individualMode || hMixed || vMixed

    return (
        <div
            className="pt-0.5"
            onMouseLeave={() => setPaddingOverlay(null)}
        >
            <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground flex-1">Padding</span>
            </div>
            <div className="flex items-start gap-1 mt-1">
                <div className="flex-1 space-y-1">
                    {showExpanded ? (
                        /* Individual mode: 2x2 grid — Left, Top / Right, Bottom */
                        <>
                            <div className="flex gap-1">
                                <div
                                    className="flex items-center gap-0.5 flex-1"
                                    onMouseEnter={() => setPaddingOverlay(nodeId, 'left')}
                                >
                                    <span className="cursor-ew-resize select-none flex items-center" title="Left padding" {...lScrub}>
                                        <LeftPaddingIcon />
                                    </span>
                                    <NumberInput
                                        value={padding.left}
                                        onChange={(v) => onChange({ left: v })}
                                        onShorthand={handleShorthand}
                                        min={0} step={1} className="flex-1"
                                    />
                                </div>
                                <div
                                    className="flex items-center gap-0.5 flex-1"
                                    onMouseEnter={() => setPaddingOverlay(nodeId, 'top')}
                                >
                                    <span className="cursor-ew-resize select-none flex items-center" title="Top padding" {...tScrub}>
                                        <TopPaddingIcon />
                                    </span>
                                    <NumberInput
                                        value={padding.top}
                                        onChange={(v) => onChange({ top: v })}
                                        onShorthand={handleShorthand}
                                        min={0} step={1} className="flex-1"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <div
                                    className="flex items-center gap-0.5 flex-1"
                                    onMouseEnter={() => setPaddingOverlay(nodeId, 'right')}
                                >
                                    <span className="cursor-ew-resize select-none flex items-center" title="Right padding" {...rScrub}>
                                        <RightPaddingIcon />
                                    </span>
                                    <NumberInput
                                        value={padding.right}
                                        onChange={(v) => onChange({ right: v })}
                                        onShorthand={handleShorthand}
                                        min={0} step={1} className="flex-1"
                                    />
                                </div>
                                <div
                                    className="flex items-center gap-0.5 flex-1"
                                    onMouseEnter={() => setPaddingOverlay(nodeId, 'bottom')}
                                >
                                    <span className="cursor-ew-resize select-none flex items-center" title="Bottom padding" {...bScrub}>
                                        <BottomPaddingIcon />
                                    </span>
                                    <NumberInput
                                        value={padding.bottom}
                                        onChange={(v) => onChange({ bottom: v })}
                                        onShorthand={handleShorthand}
                                        min={0} step={1} className="flex-1"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Compact mode: H + V (only when both pairs are equal) */
                        <div className="flex gap-1">
                            <div
                                className="flex items-center gap-0.5 flex-1"
                                onMouseEnter={() => setPaddingOverlay(nodeId, 'horizontal')}
                            >
                                <span className="cursor-ew-resize select-none flex items-center" title="Horizontal padding" {...hScrub}>
                                    <HorizontalPaddingIcon />
                                </span>
                                <NumberInput
                                    value={padding.left}
                                    onChange={(v) => onChange({ left: v, right: v })}
                                    onShorthand={handleShorthand}
                                    min={0} step={1} className="flex-1"
                                />
                            </div>
                            <div
                                className="flex items-center gap-0.5 flex-1"
                                onMouseEnter={() => setPaddingOverlay(nodeId, 'vertical')}
                            >
                                <span className="cursor-ew-resize select-none flex items-center" title="Vertical padding" {...vScrub}>
                                    <VerticalPaddingIcon />
                                </span>
                                <NumberInput
                                    value={padding.top}
                                    onChange={(v) => onChange({ top: v, bottom: v })}
                                    onShorthand={handleShorthand}
                                    min={0} step={1} className="flex-1"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Individual toggle button — highlighted when values differ */}
                <button
                    className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-sm transition-colors shrink-0',
                        showExpanded
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                    )}
                    onClick={() => {
                        if (showExpanded) {
                            // Switching to uniform: equalize padding (left→right, top→bottom)
                            if (hMixed || vMixed) {
                                onChange({
                                    left: padding.left,
                                    right: padding.left,
                                    top: padding.top,
                                    bottom: padding.top,
                                })
                            }
                            setIndividualMode(false)
                        } else {
                            setIndividualMode(true)
                        }
                    }}
                    title={showExpanded ? 'Uniform padding' : 'Individual padding'}
                >
                    <IndividualPaddingIcon expanded={showExpanded} />
                </button>
            </div>
        </div>
    )
}

// ── Button dropdown for Packed/Space between ─────────────────

function DistributionDropdown({
    isSpaceBetween,
    onChange,
}: {
    isSpaceBetween: boolean
    onChange: (spaceBetween: boolean) => void
}) {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    return (
        <div className="relative shrink-0" ref={dropdownRef}>
            <button
                className={cn(
                    'h-7 px-1.5 rounded-sm flex items-center gap-1 transition-colors',
                    'text-muted-foreground hover:bg-muted/50',
                    open && 'bg-muted/60'
                )}
                onClick={() => setOpen(!open)}
                title={isSpaceBetween ? 'Space between' : 'Packed'}
            >
                {isSpaceBetween ? <SpaceBetweenIcon size={12} /> : <PackedIcon size={12} />}
                <svg width={6} height={6} viewBox="0 0 6 6" fill="none" className="text-muted-foreground/50">
                    <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-50 py-1 min-w-35">
                    <button
                        className={cn(
                            'w-full px-3 py-1.5 text-[11px] text-left flex items-center gap-2 transition-colors',
                            !isSpaceBetween ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:bg-muted/30'
                        )}
                        onClick={() => { onChange(false); setOpen(false) }}
                    >
                        <PackedIcon size={12} />
                        Packed
                    </button>
                    <button
                        className={cn(
                            'w-full px-3 py-1.5 text-[11px] text-left flex items-center gap-2 transition-colors',
                            isSpaceBetween ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:bg-muted/30'
                        )}
                        onClick={() => { onChange(true); setOpen(false) }}
                    >
                        <SpaceBetweenIcon size={12} />
                        Space between
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Gap input (Figma-style with direction icon + button dropdown) ───

function GapInput({
    layout,
    onChange,
}: {
    layout: Layout
    onChange: (partial: Partial<Layout>) => void
}) {
    const isColumn = layout.direction === 'column' || layout.direction === undefined
    const isSpaceBetween = isAutoGapLayout(layout)
    const isGrid = layout.mode === 'grid'

    const resolvedGap = layout.gap ?? 0
    const resolvedGridColumnGap = Math.max(0, layout.columnGap ?? resolvedGap)
    const resolvedGridRowGap = Math.max(0, layout.rowGap ?? resolvedGap)
    const primaryGapMin = layout.wrap ? 0 : -999

    const handleGapChange = useCallback((partial: Partial<Layout>) => {
        if (isSpaceBetween && partial.gap != null) {
            onChange({ justify: 'start', gap: partial.gap })
            return
        }
        onChange(partial)
    }, [isSpaceBetween, onChange])

    // All hooks called unconditionally (React rules of hooks)
    const gapScrub = useScrub(resolvedGap, (v) => handleGapChange({ gap: v }), 1, primaryGapMin)
    const colGapScrub = useScrub(resolvedGridColumnGap, (v) => handleGapChange({ columnGap: v }))
    const rowGapScrub = useScrub(resolvedGridRowGap, (v) => handleGapChange({ rowGap: v }))

    if (isGrid) {
        return (
            <div className="flex gap-1">
                <div className="flex items-center gap-0.5 flex-1">
                    <span className="cursor-ew-resize select-none flex items-center" title="Column gap" {...colGapScrub}>
                        <HorizontalGapIcon />
                    </span>
                    <NumberInput
                        value={resolvedGridColumnGap}
                        onChange={(v) => handleGapChange({ columnGap: v })}
                        min={0}
                        step={1}
                        className="flex-1"
                    />
                </div>
                <div className="flex items-center gap-0.5 flex-1">
                    <span className="cursor-ew-resize select-none flex items-center" title="Row gap" {...rowGapScrub}>
                        <VerticalGapIcon />
                    </span>
                    <NumberInput
                        value={resolvedGridRowGap}
                        onChange={(v) => handleGapChange({ rowGap: v })}
                        min={0}
                        step={1}
                        className="flex-1"
                    />
                </div>
            </div>
        )
    }

    // Flex mode: direction icon + gap value/auto + distribution button dropdown
    return (
        <div className="flex items-center gap-0.5">
            <span className="cursor-ew-resize select-none flex items-center" title="Gap between items" {...gapScrub}>
                {isColumn ? <VerticalGapIcon /> : <HorizontalGapIcon />}
            </span>
            {isSpaceBetween ? (
                <span className="flex-1 h-7 px-2 text-[11px] flex items-center text-muted-foreground">
                    Auto
                </span>
            ) : (
                <NumberInput
                    value={resolvedGap}
                    onChange={(v) => handleGapChange({ gap: v })}
                    min={primaryGapMin}
                    step={1}
                    className="flex-1"
                />
            )}
            <DistributionDropdown
                isSpaceBetween={isSpaceBetween}
                onChange={(spaceBetween) => {
                    if (spaceBetween) {
                        onChange({ justify: 'between' })
                    } else {
                        onChange({ justify: 'start' })
                    }
                }}
            />
        </div>
    )
}

// ── Grid track helpers ──────────────────────────────────────

/** Convert legacy columns/rows to GridTrack[] */
function legacyToTracks(value: number | string | undefined): GridTrack[] {
    if (value == null) return [{ value: 1, unit: 'fr' }, { value: 1, unit: 'fr' }]
    if (typeof value === 'number') {
        return Array.from({ length: value }, () => ({ value: 1, unit: 'fr' as const }))
    }
    return value.split(/\s+/).map(parseTrackString)
}

function parseTrackString(s: string): GridTrack {
    const t = s.trim()
    if (t === 'auto') return { value: 0, unit: 'auto' }
    if (t.endsWith('fr')) return { value: parseFloat(t) || 1, unit: 'fr' }
    if (t.endsWith('px')) return { value: parseFloat(t) || 0, unit: 'px' }
    return { value: parseFloat(t) || 1, unit: 'fr' }
}

const UNIT_OPTIONS: { value: GridTrack['unit']; label: string }[] = [
    { value: 'fr', label: 'Fill' },
    { value: 'auto', label: 'Hug' },
    { value: 'px', label: 'Fixed' },
]

/** Read the browser's computed track sizes for a grid node */
function getComputedTrackSizes(nodeId: string, axis: 'col' | 'row'): number[] {
    const el = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null
    if (!el) return []
    const style = window.getComputedStyle(el)
    const raw = axis === 'col' ? style.gridTemplateColumns : style.gridTemplateRows
    if (!raw || raw === 'none') return []
    return raw.split(/\s+/).map(s => parseFloat(s)).filter(n => !isNaN(n))
}

// ── Grid track list UI (Figma-style per-track controls) ─────

function TrackListSection({
    label,
    axis,
    tracks,
    nodeId,
    onChange,
}: {
    label: string
    axis: 'col' | 'row'
    tracks: GridTrack[]
    nodeId: string
    /** Called with new tracks array. If a track was removed, removedIndex is the 0-based index that was deleted. */
    onChange: (tracks: GridTrack[], removedIndex?: number) => void
}) {
    const gridSelectedTrackAxis = useEditorStore((s) => s.gridSelectedTrackAxis)
    const gridSelectedTrackIndex = useEditorStore((s) => s.gridSelectedTrackIndex)
    const setGridSelectedTrack = useEditorStore((s) => s.setGridSelectedTrack)

    const addTrack = () => {
        onChange([...tracks, { value: 1, unit: 'fr' }])
    }

    const removeTrack = (index: number) => {
        if (tracks.length <= 1) return
        if (gridSelectedTrackAxis === axis && gridSelectedTrackIndex === index) {
            setGridSelectedTrack(null)
        }
        onChange(tracks.filter((_, i) => i !== index), index)
    }

    const updateTrack = (index: number, update: Partial<GridTrack>) => {
        const next = tracks.map((t, i) => {
            if (i !== index) return t
            const merged = { ...t, ...update }
            if (update.unit && update.unit !== t.unit) {
                // Unit changed — compute smart default
                const computedSizes = getComputedTrackSizes(nodeId, axis)
                const computedPx = computedSizes[i] ?? 100

                if (merged.unit === 'auto') {
                    merged.value = 0
                } else if (merged.unit === 'px') {
                    // Use current computed pixel size (Figma: "Fixed width (136)")
                    merged.value = Math.round(computedPx)
                } else if (merged.unit === 'fr') {
                    merged.value = 1
                }
            }
            return merged
        })
        onChange(next)
    }

    // Read computed sizes for displaying in Hug tracks
    const computedSizes = nodeId ? getComputedTrackSizes(nodeId, axis) : []

    return (
        <div>
            {/* Section header: label + add button */}
            <div className="flex items-center justify-between py-1.5 border-t border-border/30">
                <span className="text-[11px] font-medium text-foreground">{label}</span>
                <button
                    className="w-5 h-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    onClick={addTrack}
                    title={`Add ${label.toLowerCase().slice(0, -1)}`}
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Track rows */}
            <div className="space-y-0.5">
                {tracks.map((track, i) => {
                    const isSelected = gridSelectedTrackAxis === axis && gridSelectedTrackIndex === i

                    return (
                        <div
                            key={i}
                            className={cn(
                                'flex items-center gap-1 group rounded-sm px-0.5 -mx-0.5 transition-colors',
                                isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'
                            )}
                            onClick={() => setGridSelectedTrack(
                                isSelected ? null : axis,
                                isSelected ? null : i
                            )}
                        >
                            {/* Track index */}
                            <span className={cn(
                                'text-[10px] w-4 text-center shrink-0 select-none',
                                isSelected ? 'text-primary font-medium' : 'text-muted-foreground/60'
                            )}>
                                {i + 1}
                            </span>

                            {/* Unit dropdown (Figma style: "fr", "px", "auto") */}
                            <select
                                value={track.unit}
                                onChange={(e) => {
                                    e.stopPropagation()
                                    updateTrack(i, { unit: e.target.value as GridTrack['unit'] })
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                    'h-7 rounded-sm text-[10px] px-1.5 outline-none cursor-pointer transition-colors appearance-none w-14 shrink-0',
                                    isSelected
                                        ? 'bg-primary/15 text-foreground'
                                        : 'bg-muted/40 text-foreground hover:bg-muted/60'
                                )}
                            >
                                {UNIT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>

                            {/* Value input — shows computed size for Hug, editable for Fill/Fixed */}
                            <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                                <NumberInput
                                    value={track.unit === 'auto'
                                        ? Math.round(computedSizes[i] ?? 0)
                                        : track.value}
                                    onChange={(v) => updateTrack(i, { value: Math.max(track.unit === 'fr' ? 0.1 : 1, v) })}
                                    min={track.unit === 'fr' ? 0.1 : 0}
                                    step={track.unit === 'fr' ? 0.1 : 1}
                                    disabled={track.unit === 'auto'}
                                    className="flex-1"
                                />
                            </div>

                            {/* Remove button — visible on hover or when selected */}
                            <button
                                className={cn(
                                    'w-5 h-5 flex items-center justify-center rounded-sm transition-colors shrink-0',
                                    tracks.length <= 1
                                        ? 'text-muted-foreground/20 cursor-not-allowed'
                                        : isSelected
                                            ? 'text-muted-foreground hover:text-foreground'
                                            : 'text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 opacity-0 group-hover:opacity-100'
                                )}
                                onClick={(e) => { e.stopPropagation(); removeTrack(i) }}
                                disabled={tracks.length <= 1}
                                title="Remove track"
                            >
                                <Minus size={12} />
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main component ───────────────────────────────────────────

interface LayoutSectionProps {
    node: FrameNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function LayoutSection({ node, onUpdate }: LayoutSectionProps) {
    const { layout, padding } = node
    const mode = layoutToMode(layout)
    const isFlex = layout.mode === 'flex'
    const isGrid = layout.mode === 'grid'
    const hasLayout = isFlex || isGrid
    const isSpaceBetween = isAutoGapLayout(layout)
    const updateNode = useEditorStore((s) => s.updateNode)

    const updateLayout = (partialLayout: Partial<Layout>) => {
        onUpdate({ layout: { ...layout, ...partialLayout } })
    }

    const handleModeChange = (nextMode: LayoutMode) => {
        const partial = modeToLayout(nextMode, layout)
        const updates: Record<string, unknown> = {
            layout: { ...layout, ...partial },
        }

        // Prevent a visibility cliff when entering auto layout with no in-flow children.
        if (nextMode !== 'none' && shouldForceFixedSizingOnAutoLayout(node)) {
            const nextSizing = { ...node.sizing }
            let changed = false

            if (nextSizing.horizontal === 'hug') {
                nextSizing.horizontal = 'fixed'
                changed = true
            }
            if (nextSizing.vertical === 'hug') {
                nextSizing.vertical = 'fixed'
                changed = true
            }

            if (changed) {
                updates.sizing = nextSizing
            }
        }

        onUpdate(updates)
    }

    const updatePadding = (partialPad: Partial<Padding>) => {
        onUpdate({ padding: { ...padding, ...partialPad } })
    }

    return (
        <>
            <Section title={hasLayout ? 'Auto layout' : 'Layout'}>
                {/* Flow radio group — Figma: Freeform / Vertical / Horizontal / Grid */}
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-px bg-muted/50 rounded-sm p-0.5 flex-1">
                        {FLOW_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                className={cn(
                                    'flex items-center gap-1 px-2 h-7 rounded-sm text-[11px] transition-all flex-1 justify-center',
                                    mode === opt.value
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                )}
                                onClick={() => handleModeChange(opt.value)}
                                title={opt.label}
                            >
                                {opt.icon}
                                <span className="text-[10px]">{opt.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Wrap toggle — horizontal flow only */}
                    {mode === 'flex-row' && (
                        <button
                            className={cn(
                                'w-7 h-7 flex items-center justify-center rounded-sm transition-colors shrink-0',
                                layout.wrap
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground/40 hover:text-foreground hover:bg-muted/40'
                            )}
                            onClick={() => updateLayout({ wrap: !layout.wrap })}
                            title={layout.wrap ? 'Disable wrap' : 'Enable wrap'}
                        >
                            <WrapText size={14} />
                        </button>
                    )}
                </div>

                {/* Alignment + Gap row (flex & grid) */}
                {hasLayout && (
                    <>
                        <div className="flex items-start gap-3 pt-1">
                            {/* Alignment grid */}
                            <div>
                                <span className="text-[10px] text-muted-foreground mb-1 block">Alignment</span>
                                <AlignmentGrid
                                    value={getAlign3x3(layout.justify, layout.align)}
                                    onChange={(j, a) => updateLayout({ justify: j, align: a })}
                                    direction={layout.direction || 'column'}
                                    isSpaceBetween={isFlex && isSpaceBetween}
                                />
                            </div>

                            {/* Gap controls */}
                            <div className="flex-1">
                                <span className="text-[10px] text-muted-foreground mb-1 block">Gap</span>
                                <GapInput layout={layout} onChange={updateLayout} />
                            </div>
                        </div>

                        {/* Wrap-specific controls: counter-axis gap + wrap alignment */}
                        {isFlex && layout.wrap && (
                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-0.5 flex-1">
                                    <span className="cursor-ew-resize select-none flex items-center" title="Cross-axis gap">
                                        {(layout.direction ?? 'column') === 'row'
                                            ? <VerticalGapIcon />
                                            : <HorizontalGapIcon />
                                        }
                                    </span>
                                    <NumberInput
                                        value={(layout.direction ?? 'column') === 'row'
                                            ? (layout.rowGap ?? layout.gap ?? 0)
                                            : (layout.columnGap ?? layout.gap ?? 0)
                                        }
                                        onChange={(v) => {
                                            if ((layout.direction ?? 'column') === 'row') {
                                                updateLayout({ rowGap: v })
                                            } else {
                                                updateLayout({ columnGap: v })
                                            }
                                        }}
                                        min={0}
                                        step={1}
                                        className="flex-1"
                                    />
                                </div>
                                <SelectInput
                                    value={layout.wrapAlign ?? 'start'}
                                    options={[
                                        { value: 'start', label: 'Start' },
                                        { value: 'center', label: 'Center' },
                                        { value: 'end', label: 'End' },
                                        { value: 'between', label: 'Space' },
                                        { value: 'stretch', label: 'Stretch' },
                                    ]}
                                    onChange={(v) => updateLayout({ wrapAlign: v === 'start' ? undefined : v as Layout['wrapAlign'] })}
                                    className="w-17.5"
                                />
                            </div>
                        )}

                        {/* Padding controls (Figma-style compact H/V with individual toggle) */}
                        <PaddingControls padding={padding} onChange={updatePadding} nodeId={node.id} />
                    </>
                )}

                {/* Clip content — Figma-style checkbox */}
                <Checkbox
                    checked={node.overflow === 'hidden'}
                    onChange={(checked) => onUpdate({ overflow: checked ? 'hidden' : 'visible' })}
                    label="Clip content"
                />

                {/* Reverse stacking order (Figma: first on top vs last on top) */}
                {hasLayout && (
                    <Checkbox
                        checked={layout.reverseZIndex ?? false}
                        onChange={(checked) => updateLayout({ reverseZIndex: checked || undefined })}
                        label="Reverse canvas stacking"
                    />
                )}
            </Section>

            {/* Grid track lists — separate section below Auto layout (like Figma) */}
            {isGrid && (
                <div className="border-b border-border/40 px-3 py-1">
                    <TrackListSection
                        label="Columns"
                        axis="col"
                        nodeId={node.id}
                        tracks={layout.columnTracks?.length ? layout.columnTracks : legacyToTracks(layout.columns)}
                        onChange={(tracks, removedIndex) => {
                            updateLayout({ columnTracks: tracks, columns: tracks.length })
                            if (removedIndex != null && node.children) {
                                for (const child of node.children) {
                                    const start = child.gridColumnStart
                                    const span = child.gridColumnSpan
                                    const updates: Record<string, unknown> = {}
                                    if (start != null && start > removedIndex + 1) {
                                        updates.gridColumnStart = start - 1
                                    }
                                    if (span != null && span > 1 && span !== -1) {
                                        const childEnd = (start ?? 1) + span - 1
                                        if (childEnd > removedIndex + 1) {
                                            updates.gridColumnSpan = Math.max(1, span - 1)
                                        }
                                    }
                                    if (Object.keys(updates).length > 0) {
                                        updateNode(child.id, updates)
                                    }
                                }
                            }
                        }}
                    />
                    <TrackListSection
                        label="Rows"
                        axis="row"
                        nodeId={node.id}
                        tracks={layout.rowTracks?.length ? layout.rowTracks : (layout.rows != null ? legacyToTracks(layout.rows) : [])}
                        onChange={(tracks, removedIndex) => {
                            updateLayout({
                                rowTracks: tracks.length > 0 ? tracks : undefined,
                                rows: tracks.length > 0 ? tracks.length : undefined,
                            })
                            if (removedIndex != null && node.children) {
                                for (const child of node.children) {
                                    const start = child.gridRowStart
                                    const span = child.gridRowSpan
                                    const updates: Record<string, unknown> = {}
                                    if (start != null && start > removedIndex + 1) {
                                        updates.gridRowStart = start - 1
                                    }
                                    if (span != null && span > 1 && span !== -1) {
                                        const childEnd = (start ?? 1) + span - 1
                                        if (childEnd > removedIndex + 1) {
                                            updates.gridRowSpan = Math.max(1, span - 1)
                                        }
                                    }
                                    if (Object.keys(updates).length > 0) {
                                        updateNode(child.id, updates)
                                    }
                                }
                            }
                        }}
                    />
                </div>
            )}
        </>
    )
}
