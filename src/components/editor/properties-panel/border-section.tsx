'use client'

import { useState, useCallback } from 'react'
import type { ScytleNode, Border, Fill, SolidFill } from '@/types/canvas'
import { NumberInput, SelectInput } from './inputs'
import { Plus, Eye, EyeOff, CornerUpRight, Blend } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normaliseHex, hexOpacityToRgba } from '@/lib/color-utils'
import { ColorPicker } from './color-picker'
import { InlineHexValueInput, InlinePercentInput } from './paint-row-inputs'
import { useEditorStore } from '@/store/editor-store'

interface SectionProps {
    node: ScytleNode
    onUpdate: (updates: Record<string, unknown>) => void
    showCornerRadius?: boolean
}

/* ── Rounded-corner icon for the radius label ─────────────── */

function RadiusCornerIcon({ size = 12 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 12 12"
            fill="none"
            className="text-muted-foreground shrink-0"
        >
            <path
                d="M10 10 L10 4.5 Q10 2 7.5 2 L2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
            />
        </svg>
    )
}

/* ── Appearance Section — opacity + corner radius ─────────── */

export function AppearanceSection({ node, onUpdate, showCornerRadius = true }: SectionProps) {
    const radius = node.borderRadius

    const isUniformRadius = typeof radius === 'number'
    const [perCorner, setPerCorner] = useState(!isUniformRadius)
    const rawUniformRadius = typeof radius === 'number' ? radius : radius.topLeft
    const uniformRadius = rawUniformRadius

    const updateRadius = (
        value: number | Partial<Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', number>>
    ) => {
        if (typeof value === 'number') {
            onUpdate({ borderRadius: value })
        } else {
            const current =
                typeof radius === 'number'
                    ? { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius }
                    : radius
            // Per-corner update
            onUpdate({ borderRadius: { ...current, ...value } })
        }
    }

    return (
        <div className="border-b border-border/40">
            {/* Section header */}
            <div className="flex items-center gap-1.5 px-3 h-8">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground/60 shrink-0">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    <path d="M6 3v6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                    <path d="M3 6h6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                </svg>
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">Appearance</span>
            </div>

            <div className="px-3 pb-2">
                <div className="grid grid-cols-2 gap-x-2">
                    {/* Opacity */}
                    <div className="flex items-center gap-1">
                        <Blend
                            size={11}
                            className="text-muted-foreground/70 shrink-0"
                            style={{ minWidth: 18 }}
                        />
                        <NumberInput
                            value={Math.round(node.opacity * 100)}
                            onChange={(v) => onUpdate({ opacity: v / 100 })}
                            min={0}
                            max={100}
                            step={1}
                            suffix="%"
                        />
                    </div>

                    {showCornerRadius && (
                        <div className="flex items-center gap-1">
                            <RadiusCornerIcon size={12} />
                            <NumberInput
                                value={uniformRadius}
                                onChange={(v) => {
                                    if (perCorner) {
                                        updateRadius({
                                            topLeft: v,
                                            topRight: v,
                                            bottomLeft: v,
                                            bottomRight: v,
                                        })
                                    } else {
                                        updateRadius(v)
                                    }
                                }}
                                min={0}
                                step={1}
                                className="flex-1"
                            />
                            <button
                                className={cn(
                                    'p-1 rounded-sm transition-colors shrink-0',
                                    perCorner
                                        ? 'text-foreground bg-muted/60'
                                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                                )}
                                onClick={() => {
                                    if (perCorner) updateRadius(uniformRadius)
                                    setPerCorner(!perCorner)
                                }}
                                title={perCorner ? 'Uniform corners' : 'Individual corners'}
                            >
                                <CornerUpRight size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {showCornerRadius && perCorner && (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-1.5">
                        <NumberInput
                            label="TL"
                            value={typeof radius === 'number' ? radius : radius.topLeft}
                            onChange={(v) => updateRadius({ topLeft: v })}
                            min={0}
                            step={1}
                            labelWidth="w-5"
                        />
                        <NumberInput
                            label="TR"
                            value={typeof radius === 'number' ? radius : radius.topRight}
                            onChange={(v) => updateRadius({ topRight: v })}
                            min={0}
                            step={1}
                            labelWidth="w-5"
                        />
                        <NumberInput
                            label="BL"
                            value={typeof radius === 'number' ? radius : radius.bottomLeft}
                            onChange={(v) => updateRadius({ bottomLeft: v })}
                            min={0}
                            step={1}
                            labelWidth="w-5"
                        />
                        <NumberInput
                            label="BR"
                            value={typeof radius === 'number' ? radius : radius.bottomRight}
                            onChange={(v) => updateRadius({ bottomRight: v })}
                            min={0}
                            step={1}
                            labelWidth="w-5"
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

/* ── Helpers ───────────────────────────────────────────────── */

/** Collect all unique solid fill hex colors from the entire node tree */
function collectDocumentColors(nodes: ScytleNode[]): string[] {
    const seen = new Set<string>()
    const collect = (nodeList: ScytleNode[]) => {
        for (const node of nodeList) {
            for (const fill of node.fills ?? []) {
                if (fill.type === 'solid') seen.add(normaliseHex(fill.color))
            }
            if (node.type === 'frame') collect(node.children)
        }
    }
    collect(nodes)
    return Array.from(seen)
}

/** Convert Border to a SolidFill for the ColorPicker */
function borderToFill(border: Border): SolidFill {
    return {
        type: 'solid',
        color: normaliseHex(border.color).replace('#', ''),
        opacity: border.opacity ?? 1,
    }
}

/* ── StrokeRow — Figma-style fill row for stroke ──────────── */

interface StrokeRowProps {
    border: Border
    onUpdate: (partial: Partial<Border>) => void
    onRemove: () => void
    documentColors: string[]
}

function StrokeRow({ border, onUpdate, onRemove, documentColors }: StrokeRowProps) {
    const [swatchEl, setSwatchEl] = useState<HTMLButtonElement | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)

    const resolvedColor = border.color

    const fill = borderToFill({ ...border, color: resolvedColor })
    const isVisible = border.visible !== false
    const opacity = border.opacity ?? 1
    const hex = normaliseHex(resolvedColor)

    const handlePickerChange = useCallback((updated: Fill) => {
        if (updated.type === 'solid') {
            onUpdate({
                color: normaliseHex(updated.color),
                opacity: updated.opacity ?? 1,
            })
        }
    }, [onUpdate])

    return (
        <div
            className={cn(
                'group flex items-center gap-1 h-8 rounded-sm px-1 -mx-1',
                'transition-colors',
                pickerOpen ? 'bg-muted/40' : 'hover:bg-muted/20',
            )}
        >
            {/* Main value control: swatch + editable hex + opacity */}
            <div
                className={cn(
                    'flex items-center min-w-0 flex-1 h-7 rounded-sm border overflow-hidden',
                    'border-border/35 bg-muted/20',
                    pickerOpen && 'ring-1 ring-primary/40 ring-inset',
                    !isVisible && 'opacity-40',
                )}
            >
                {/* Color swatch */}
                <button
                    ref={setSwatchEl}
                    className={cn(
                        'w-6 h-6 rounded-md border shrink-0 ml-0.5 mr-1 transition-all',
                        'border-border/40 hover:border-border/80',
                        pickerOpen && 'ring-1 ring-primary/40',
                    )}
                    style={{ backgroundColor: hexOpacityToRgba(normaliseHex(resolvedColor), opacity) }}
                    onClick={() => setPickerOpen(true)}
                    title="Edit stroke color"
                />

                <div className="w-px h-full bg-border/35 shrink-0" />

                <InlineHexValueInput
                    value={hex}
                    onCommit={(nextHex) => onUpdate({ color: nextHex })}
                    className="flex-1 min-w-0 h-full border-0 hover:bg-transparent focus:bg-transparent"
                />

                <div className="w-px h-full bg-border/35 shrink-0" />

                <div className="flex items-center w-13 shrink-0 pr-1">
                    <InlinePercentInput
                        value={opacity}
                        onCommit={(nextOpacity) => onUpdate({ opacity: nextOpacity })}
                        className="w-9 h-full border-0 hover:bg-transparent focus:bg-transparent"
                    />
                    <span className="text-[10px] text-muted-foreground/45">%</span>
                </div>
            </div>

            {/* Visibility toggle */}
            <button
                className={cn(
                    'w-5 h-5 flex items-center justify-center rounded-sm transition-colors shrink-0',
                    'text-muted-foreground/40 hover:text-foreground hover:bg-muted/50',
                    !isVisible && 'text-muted-foreground/25',
                )}
                onClick={() => onUpdate({ visible: !isVisible })}
                title={isVisible ? 'Hide stroke' : 'Show stroke'}
            >
                {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>

            {/* Remove button */}
            <button
                className={cn(
                    'w-5 h-5 flex items-center justify-center rounded-sm transition-all shrink-0',
                    'text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10',
                )}
                onClick={onRemove}
                title="Remove stroke"
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>

            {/* ColorPicker portal */}
            <ColorPicker
                fill={fill}
                onChange={handlePickerChange}
                anchorEl={swatchEl}
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                documentColors={documentColors}
                solidOnly
            />
        </div>
    )
}

/* ── Stroke position options ──────────────────────────────── */

const STROKE_POSITION_OPTIONS = [
    { value: 'inside', label: 'Inside' },
    { value: 'center', label: 'Center' },
    { value: 'outside', label: 'Outside' },
]

const STROKE_STYLE_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
]

/* ── StrokeSection — Figma-parity stroke panel ─────────────── */

export function StrokeSection({ node, onUpdate }: SectionProps) {
    const allNodes = useEditorStore((s) => s.nodes)
    const documentColors = collectDocumentColors(allNodes)

    const border = node.border

    const addStroke = useCallback(() => {
        onUpdate({
            border: {
                color: '000000',
                width: 1,
                style: 'solid',
                position: 'inside',
                opacity: 1,
                visible: true,
            },
        })
    }, [onUpdate])

    const removeStroke = useCallback(() => {
        onUpdate({ border: undefined })
    }, [onUpdate])

    const updateBorder = useCallback(
        (partial: Partial<Border>) => {
            if (!border) return
            onUpdate({ border: { ...border, ...partial } })
        },
        [border, onUpdate]
    )

    return (
        <div className="border-b border-border/40">
            {/* Section header */}
            <div className="flex items-center gap-1.5 px-3 h-8">
                {/* Stroke icon — nested rectangles */}
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-muted-foreground/60 shrink-0"
                >
                    <rect
                        x="1.5"
                        y="1.5"
                        width="9"
                        height="9"
                        rx="1.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        fill="none"
                    />
                </svg>
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">
                    Stroke
                </span>
                <button
                    className="w-5 h-5 flex items-center justify-center rounded-sm transition-colors
                        text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"
                    onClick={addStroke}
                    title="Add stroke"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Stroke row + controls */}
            {border && (
                <div className="px-3 pb-2 space-y-1.5">
                    <StrokeRow
                        border={border}
                        onUpdate={updateBorder}
                        onRemove={removeStroke}
                        documentColors={documentColors}
                    />

                    {/* Position + Style + Weight row */}
                    <div className="flex items-center gap-2">
                        <SelectInput
                            value={border.position ?? 'inside'}
                            options={STROKE_POSITION_OPTIONS}
                            onChange={(v) =>
                                updateBorder({ position: v as Border['position'] })
                            }
                            className="flex-1"
                        />
                        <SelectInput
                            value={border.style}
                            options={STROKE_STYLE_OPTIONS}
                            onChange={(v) => updateBorder({ style: v as Border['style'] })}
                            className="flex-1"
                        />
                        <NumberInput
                            value={border.width}
                            onChange={(v) => updateBorder({ width: v })}
                            min={0}
                            step={1}
                            className="w-14"
                        />
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!border && (
                <div className="px-3 pb-2">
                    <button
                        className="w-full h-7 text-[11px] text-muted-foreground/40 hover:text-muted-foreground
                            border border-dashed border-border/30 hover:border-border/60
                            rounded-sm transition-colors flex items-center justify-center gap-1"
                        onClick={addStroke}
                    >
                        <Plus size={10} />
                        Add stroke
                    </button>
                </div>
            )}
        </div>
    )
}
