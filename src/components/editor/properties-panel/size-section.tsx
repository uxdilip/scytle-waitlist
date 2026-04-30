'use client'

import type { FrameNode, ScytleNode, Sizing, TextNode } from '@/types/canvas'
import { Section, NumberInput } from './inputs'
import {
    Lock,
    AlignHorizontalSpaceBetween,
    AlignVerticalSpaceBetween,
    Square,
    ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { getAllowedSizingModes, normalizeSizingMode } from './layout-capabilities'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SIZE_MODE_LABELS: Record<Sizing['horizontal'], string> = {
    fixed: 'Fixed',
    hug: 'Hug contents',
    fill: 'Fill container',
}

type SizingMode = Sizing['horizontal']
type DimensionAxis = 'width' | 'height'

function toAxisLabel(axis: DimensionAxis): string {
    return axis === 'width' ? 'width' : 'height'
}

function toAxisModeLabel(mode: SizingMode, axis: DimensionAxis): string {
    if (mode === 'fixed') return `Fixed ${toAxisLabel(axis)}`
    return SIZE_MODE_LABELS[mode]
}

type TextResizeMode = 'auto-width' | 'auto-height' | 'fixed'

function getTextResizeMode(node: TextNode): TextResizeMode {
    if (node.autoResize === 'width-and-height') return 'auto-width'
    if (node.autoResize === 'height') return 'auto-height'
    return 'fixed'
}

function DimensionModeIcon({ axis, constrained }: { axis: DimensionAxis; constrained: boolean }) {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
            {axis === 'width' ? (
                <>
                    <line x1="1.2" y1="6" x2="10.8" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    <line x1="1.2" y1="3.2" x2="1.2" y2="8.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="10.8" y1="3.2" x2="10.8" y2="8.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </>
            ) : (
                <>
                    <line x1="6" y1="1.2" x2="6" y2="10.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                    <line x1="3.2" y1="1.2" x2="8.8" y2="1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="3.2" y1="10.8" x2="8.8" y2="10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </>
            )}
            {constrained && (
                <>
                    {axis === 'width' ? (
                        <>
                            <line x1="3.4" y1="3" x2="3.4" y2="9" stroke="currentColor" strokeWidth="0.9" opacity="0.8" />
                            <line x1="8.6" y1="3" x2="8.6" y2="9" stroke="currentColor" strokeWidth="0.9" opacity="0.8" />
                        </>
                    ) : (
                        <>
                            <line x1="3" y1="3.4" x2="9" y2="3.4" stroke="currentColor" strokeWidth="0.9" opacity="0.8" />
                            <line x1="3" y1="8.6" x2="9" y2="8.6" stroke="currentColor" strokeWidth="0.9" opacity="0.8" />
                        </>
                    )}
                </>
            )}
        </svg>
    )
}

interface DimensionModeMenuProps {
    axis: DimensionAxis
    mode: SizingMode
    allowedModes: SizingMode[]
    hasMinLimit: boolean
    hasMaxLimit: boolean
    onChangeMode: (mode: SizingMode) => void
    onAddMin: () => void
    onAddMax: () => void
    onRemoveMin: () => void
    onRemoveMax: () => void
    onRemoveMinAndMax: () => void
}

function DimensionModeMenu({
    axis,
    mode,
    allowedModes,
    hasMinLimit,
    hasMaxLimit,
    onChangeMode,
    onAddMin,
    onAddMax,
    onRemoveMin,
    onRemoveMax,
    onRemoveMinAndMax,
}: DimensionModeMenuProps) {
    const axisLabel = toAxisLabel(axis)
    const hasAnyLimit = hasMinLimit || hasMaxLimit
    const supportsSizeVariables = false

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'h-7 min-w-32 px-2 rounded-sm border border-border/40',
                        'bg-muted/20 hover:bg-muted/45 text-[10px] text-foreground/85',
                        'inline-flex items-center gap-1.5 transition-colors',
                    )}
                    title={`${axisLabel[0].toUpperCase() + axisLabel.slice(1)} mode`}
                >
                    <DimensionModeIcon axis={axis} constrained={hasAnyLimit} />
                    <span className="truncate">{toAxisModeLabel(mode, axis)}</span>
                    <ChevronDown size={10} className="ml-auto text-muted-foreground/70" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48 p-1">
                {allowedModes.map((allowedMode) => (
                    <DropdownMenuItem
                        key={allowedMode}
                        onSelect={() => onChangeMode(allowedMode)}
                        variant="inspector"
                        className="h-7 text-[11px]"
                    >
                        <span className="w-3 text-[10px] text-foreground">{allowedMode === mode ? '✓' : ''}</span>
                        <span>{toAxisModeLabel(allowedMode, axis)}</span>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                {hasMinLimit ? (
                    <DropdownMenuItem onSelect={onRemoveMin} variant="inspector" className="h-7 text-[11px]">
                        Remove min {axisLabel}
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onSelect={onAddMin} variant="inspector" className="h-7 text-[11px]">
                        Add min {axisLabel}...
                    </DropdownMenuItem>
                )}

                {hasMaxLimit ? (
                    <DropdownMenuItem onSelect={onRemoveMax} variant="inspector" className="h-7 text-[11px]">
                        Remove max {axisLabel}
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onSelect={onAddMax} variant="inspector" className="h-7 text-[11px]">
                        Add max {axisLabel}...
                    </DropdownMenuItem>
                )}

                {hasAnyLimit && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={onRemoveMinAndMax}
                            variant="destructive"
                            className="h-7 text-[11px]"
                        >
                            Remove min and max
                        </DropdownMenuItem>
                    </>
                )}

                {supportsSizeVariables && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled variant="inspector" className="h-7 text-[11px]">
                            Apply variable...
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface AxisLimitsRowProps {
    axis: DimensionAxis
    minValue?: number
    maxValue?: number
    onChangeMin: (value: number | undefined) => void
    onChangeMax: (value: number | undefined) => void
    onClear: () => void
}

function AxisLimitsRow({ axis, minValue, maxValue, onChangeMin, onChangeMax, onClear }: AxisLimitsRowProps) {
    const title = axis === 'width' ? 'Width limits' : 'Height limits'
    const minLabel = axis === 'width' ? 'Min W' : 'Min H'
    const maxLabel = axis === 'width' ? 'Max W' : 'Max H'

    return (
        <div className="rounded-sm border border-border/35 bg-muted/20 p-1.5 space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-medium text-muted-foreground/80">{title}</span>
                <button
                    type="button"
                    className="text-[10px] text-muted-foreground/65 hover:text-foreground transition-colors"
                    onClick={onClear}
                >
                    Clear
                </button>
            </div>

            <div className="flex items-center gap-1.5">
                <NumberInput
                    label={minLabel}
                    value={minValue ?? 0}
                    onChange={(v) => onChangeMin(v === 0 ? undefined : v)}
                    min={0}
                    step={1}
                    className="flex-1"
                    labelWidth="w-8"
                />
                <NumberInput
                    label={maxLabel}
                    value={maxValue ?? 0}
                    onChange={(v) => onChangeMax(v === 0 ? undefined : v)}
                    min={0}
                    step={1}
                    className="flex-1"
                    labelWidth="w-8"
                />
            </div>
        </div>
    )
}

interface SizeSectionProps {
    node: ScytleNode
    parentNode: FrameNode | null
    onUpdate: (updates: Record<string, unknown>) => void
}

export function SizeSection({ node, parentNode, onUpdate }: SizeSectionProps) {
    const [lockRatio, setLockRatio] = useState(false)
    const ratio = node.width / (node.height || 1)

    const isText = node.type === 'text'
    const textResizeMode = isText ? getTextResizeMode(node as TextNode) : null

    const allowedSizingModes = useMemo(
        () => getAllowedSizingModes(node, parentNode),
        [node, parentNode],
    )

    const normalizedHorizontal = normalizeSizingMode(node.sizing.horizontal, allowedSizingModes.horizontal)
    const normalizedVertical = normalizeSizingMode(node.sizing.vertical, allowedSizingModes.vertical)

    const hasWidthLimits = node.minWidth != null || node.maxWidth != null
    const hasHeightLimits = node.minHeight != null || node.maxHeight != null
    const [showWidthLimits, setShowWidthLimits] = useState(hasWidthLimits)
    const [showHeightLimits, setShowHeightLimits] = useState(hasHeightLimits)

    const widthLimitsVisible = hasWidthLimits || showWidthLimits
    const heightLimitsVisible = hasHeightLimits || showHeightLimits

    useEffect(() => {
        if (isText) return

        if (
            node.sizing.horizontal !== normalizedHorizontal ||
            node.sizing.vertical !== normalizedVertical
        ) {
            onUpdate({
                sizing: {
                    ...node.sizing,
                    horizontal: normalizedHorizontal,
                    vertical: normalizedVertical,
                },
            })
        }
    }, [
        isText,
        node.sizing,
        normalizedHorizontal,
        normalizedVertical,
        onUpdate,
    ])

    const updateSizing = (axis: 'horizontal' | 'vertical', mode: SizingMode) => {
        const allowed = axis === 'horizontal' ? allowedSizingModes.horizontal : allowedSizingModes.vertical
        if (!allowed.includes(mode)) return

        onUpdate({
            sizing: {
                ...node.sizing,
                [axis]: mode,
            },
        })
    }

    const withFixedSizingForAxes = (
        updates: Record<string, unknown>,
        axes: Array<'horizontal' | 'vertical'>,
    ): Record<string, unknown> => {
        if (isText) return updates

        let nextSizing = node.sizing
        let changed = false

        for (const axis of axes) {
            if (axis === 'horizontal' && normalizedHorizontal !== 'fixed') {
                nextSizing = { ...nextSizing, horizontal: 'fixed' }
                changed = true
            }
            if (axis === 'vertical' && normalizedVertical !== 'fixed') {
                nextSizing = { ...nextSizing, vertical: 'fixed' }
                changed = true
            }
        }

        if (!changed) return updates
        return { ...updates, sizing: nextSizing }
    }

    const handleWidthChange = (w: number) => {
        if (lockRatio) {
            onUpdate(
                withFixedSizingForAxes(
                    { width: w, height: Math.max(1, Math.round(w / ratio)) },
                    ['horizontal', 'vertical'],
                ),
            )
        } else {
            onUpdate(withFixedSizingForAxes({ width: w }, ['horizontal']))
        }
    }

    const handleHeightChange = (h: number) => {
        if (lockRatio) {
            onUpdate(
                withFixedSizingForAxes(
                    { width: Math.max(1, Math.round(h * ratio)), height: h },
                    ['horizontal', 'vertical'],
                ),
            )
        } else {
            onUpdate(withFixedSizingForAxes({ height: h }, ['vertical']))
        }
    }

    const addMinLimit = (axis: DimensionAxis) => {
        if (axis === 'width') {
            const nextMin = Math.max(1, Math.round(node.width))
            setShowWidthLimits(true)
            onUpdate({
                minWidth: nextMin,
                ...(node.maxWidth != null && node.maxWidth < nextMin ? { maxWidth: nextMin } : {}),
            })
            return
        }

        const nextMin = Math.max(1, Math.round(node.height))
        setShowHeightLimits(true)
        onUpdate({
            minHeight: nextMin,
            ...(node.maxHeight != null && node.maxHeight < nextMin ? { maxHeight: nextMin } : {}),
        })
    }

    const addMaxLimit = (axis: DimensionAxis) => {
        if (axis === 'width') {
            const nextMax = Math.max(1, Math.round(node.width))
            setShowWidthLimits(true)
            onUpdate({
                maxWidth: nextMax,
                ...(node.minWidth != null && node.minWidth > nextMax ? { minWidth: nextMax } : {}),
            })
            return
        }

        const nextMax = Math.max(1, Math.round(node.height))
        setShowHeightLimits(true)
        onUpdate({
            maxHeight: nextMax,
            ...(node.minHeight != null && node.minHeight > nextMax ? { minHeight: nextMax } : {}),
        })
    }

    const removeMinLimit = (axis: DimensionAxis) => {
        if (axis === 'width') {
            onUpdate({ minWidth: undefined })
            return
        }
        onUpdate({ minHeight: undefined })
    }

    const removeMaxLimit = (axis: DimensionAxis) => {
        if (axis === 'width') {
            onUpdate({ maxWidth: undefined })
            return
        }
        onUpdate({ maxHeight: undefined })
    }

    const removeLimits = (axis: DimensionAxis) => {
        if (axis === 'width') {
            setShowWidthLimits(false)
            onUpdate({ minWidth: undefined, maxWidth: undefined })
            return
        }

        setShowHeightLimits(false)
        onUpdate({ minHeight: undefined, maxHeight: undefined })
    }

    const handleTextResizeMode = (mode: TextResizeMode) => {
        switch (mode) {
            case 'auto-width':
                onUpdate({
                    autoResize: 'width-and-height',
                    sizing: { horizontal: 'hug', vertical: 'hug' },
                })
                break
            case 'auto-height':
                onUpdate({
                    autoResize: 'height',
                    sizing: { horizontal: 'fixed', vertical: 'hug' },
                })
                break
            case 'fixed':
                onUpdate({
                    autoResize: 'none',
                    sizing: { horizontal: 'fixed', vertical: 'fixed' },
                })
                break
        }
    }

    return (
        <Section title="Size">
            {isText && (
                <div className="flex items-center gap-0.5 mb-1.5">
                    <button
                        type="button"
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors',
                            textResizeMode === 'auto-width'
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40',
                        )}
                        onClick={() => handleTextResizeMode('auto-width')}
                        title="Auto width — text grows horizontally, no wrapping"
                    >
                        <AlignHorizontalSpaceBetween size={12} />
                        <span>Auto W</span>
                    </button>
                    <button
                        type="button"
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors',
                            textResizeMode === 'auto-height'
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40',
                        )}
                        onClick={() => handleTextResizeMode('auto-height')}
                        title="Auto height — fixed width, grows vertically"
                    >
                        <AlignVerticalSpaceBetween size={12} />
                        <span>Auto H</span>
                    </button>
                    <button
                        type="button"
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors',
                            textResizeMode === 'fixed'
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40',
                        )}
                        onClick={() => handleTextResizeMode('fixed')}
                        title="Fixed size — fixed width and height"
                    >
                        <Square size={12} />
                        <span>Fixed</span>
                    </button>
                </div>
            )}

            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <NumberInput
                        label="W"
                        value={Math.round(node.width)}
                        onChange={handleWidthChange}
                        min={1}
                        step={1}
                        className="flex-1"
                        disabled={isText && textResizeMode === 'auto-width'}
                    />
                    {!isText && (
                        <DimensionModeMenu
                            axis="width"
                            mode={normalizedHorizontal}
                            allowedModes={allowedSizingModes.horizontal}
                            hasMinLimit={node.minWidth != null}
                            hasMaxLimit={node.maxWidth != null}
                            onChangeMode={(mode) => updateSizing('horizontal', mode)}
                            onAddMin={() => addMinLimit('width')}
                            onAddMax={() => addMaxLimit('width')}
                            onRemoveMin={() => removeMinLimit('width')}
                            onRemoveMax={() => removeMaxLimit('width')}
                            onRemoveMinAndMax={() => removeLimits('width')}
                        />
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <NumberInput
                        label="H"
                        value={Math.round(node.height)}
                        onChange={handleHeightChange}
                        min={1}
                        step={1}
                        className="flex-1"
                        disabled={isText && (textResizeMode === 'auto-width' || textResizeMode === 'auto-height')}
                    />
                    {!isText && (
                        <DimensionModeMenu
                            axis="height"
                            mode={normalizedVertical}
                            allowedModes={allowedSizingModes.vertical}
                            hasMinLimit={node.minHeight != null}
                            hasMaxLimit={node.maxHeight != null}
                            onChangeMode={(mode) => updateSizing('vertical', mode)}
                            onAddMin={() => addMinLimit('height')}
                            onAddMax={() => addMaxLimit('height')}
                            onRemoveMin={() => removeMinLimit('height')}
                            onRemoveMax={() => removeMaxLimit('height')}
                            onRemoveMinAndMax={() => removeLimits('height')}
                        />
                    )}
                </div>

                {!isText && widthLimitsVisible && (
                    <AxisLimitsRow
                        axis="width"
                        minValue={node.minWidth}
                        maxValue={node.maxWidth}
                        onChangeMin={(value) => {
                            if (value == null) {
                                onUpdate({ minWidth: undefined })
                                return
                            }
                            onUpdate({
                                minWidth: value,
                                ...(node.maxWidth != null && node.maxWidth < value ? { maxWidth: value } : {}),
                            })
                        }}
                        onChangeMax={(value) => {
                            if (value == null) {
                                onUpdate({ maxWidth: undefined })
                                return
                            }
                            onUpdate({
                                maxWidth: value,
                                ...(node.minWidth != null && node.minWidth > value ? { minWidth: value } : {}),
                            })
                        }}
                        onClear={() => removeLimits('width')}
                    />
                )}

                {!isText && heightLimitsVisible && (
                    <AxisLimitsRow
                        axis="height"
                        minValue={node.minHeight}
                        maxValue={node.maxHeight}
                        onChangeMin={(value) => {
                            if (value == null) {
                                onUpdate({ minHeight: undefined })
                                return
                            }
                            onUpdate({
                                minHeight: value,
                                ...(node.maxHeight != null && node.maxHeight < value ? { maxHeight: value } : {}),
                            })
                        }}
                        onChangeMax={(value) => {
                            if (value == null) {
                                onUpdate({ maxHeight: undefined })
                                return
                            }
                            onUpdate({
                                maxHeight: value,
                                ...(node.minHeight != null && node.minHeight > value ? { minHeight: value } : {}),
                            })
                        }}
                        onClear={() => removeLimits('height')}
                    />
                )}

                <button
                    type="button"
                    className={cn(
                        'flex items-center gap-1.5 text-[10px] transition-colors',
                        lockRatio
                            ? 'text-foreground'
                            : 'text-muted-foreground/50 hover:text-muted-foreground',
                    )}
                    onClick={() => setLockRatio(!lockRatio)}
                    title={lockRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                >
                    <Lock size={10} />
                    <span>{lockRatio ? 'Constrain proportions' : 'Lock ratio'}</span>
                </button>
            </div>
        </Section>
    )
}
