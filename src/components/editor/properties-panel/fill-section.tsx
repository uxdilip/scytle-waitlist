'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, Eye, EyeOff, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateId } from '@/lib/utils'
import { normaliseHex, hexOpacityToRgba } from '@/lib/color-utils'
import { ColorPicker } from './color-picker'
import { InlineHexValueInput, InlinePercentInput } from './paint-row-inputs'
import type { ScytleNode, Fill, SolidFill } from '@/types/canvas'
import { getResolvedTextPaints } from '@/lib/text-paint'
import { useEditorStore } from '@/store/editor-store'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

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

/** Get a descriptive label for a fill row */
function fillLabel(fill: Fill): string {
    switch (fill.type) {
        case 'solid': return 'Solid'
        case 'gradient': return fill.gradientType
            ? fill.gradientType.charAt(0).toUpperCase() + fill.gradientType.slice(1)
            : 'Gradient'
        case 'image': return 'Image'
    }
}

/** Get a short blend mode label */
function blendLabel(mode: string | undefined): string | null {
    if (!mode || mode === 'NORMAL') return null
    const found = BLEND_MODE_LABELS[mode]
    return found ?? mode.charAt(0) + mode.slice(1).toLowerCase().replace(/_/g, ' ')
}

const BLEND_MODE_LABELS: Record<string, string> = {
    DARKEN: 'Darken',
    MULTIPLY: 'Multiply',
    PLUS_DARKER: 'Plus Darker',
    COLOR_BURN: 'Color Burn',
    LIGHTEN: 'Lighten',
    SCREEN: 'Screen',
    PLUS_LIGHTER: 'Plus Lighter',
    COLOR_DODGE: 'Color Dodge',
    OVERLAY: 'Overlay',
    SOFT_LIGHT: 'Soft Light',
    HARD_LIGHT: 'Hard Light',
    DIFFERENCE: 'Difference',
    EXCLUSION: 'Exclusion',
    HUE: 'Hue',
    SATURATION: 'Saturation',
    COLOR: 'Color',
    LUMINOSITY: 'Luminosity',
}

/** Get the swatch background style for a fill, using an optional resolved color */
function fillSwatchStyle(fill: Fill, resolvedColor?: string): React.CSSProperties {
    if (fill.type === 'solid') {
        const hex = normaliseHex(resolvedColor ?? fill.color)
        const opacity = fill.opacity ?? 1
        return { backgroundColor: hexOpacityToRgba(hex, opacity) }
    }
    if (fill.type === 'gradient' && fill.stops && fill.stops.length >= 2) {
        const stops = fill.stops
            .map((s) => `${hexOpacityToRgba(normaliseHex(s.color), s.opacity ?? 1)} ${s.position * 100}%`)
            .join(', ')
        const angle = fill.angle ?? 90
        return { background: `linear-gradient(${angle}deg, ${stops})` }
    }
    if (fill.type === 'image' && fill.src) {
        return { backgroundImage: `url(${fill.src})`, backgroundSize: 'cover' }
    }
    return { backgroundColor: 'transparent' }
}

// ─────────────────────────────────────────────────────────────
// FillRow
// ─────────────────────────────────────────────────────────────

interface FillRowProps {
    fill: Fill
    fillId: string
    onUpdate: (newFill: Fill) => void
    onRemove: () => void
    documentColors: string[]
    onPickerOpenChange: (open: boolean) => void
}

function FillRow({ fill, fillId, onUpdate, onRemove, documentColors, onPickerOpenChange }: FillRowProps) {
    const [swatchEl, setSwatchEl] = useState<HTMLButtonElement | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)

    const isSolid = fill.type === 'solid'
    const resolvedColor = isSolid ? fill.color : undefined
    const solidHex = isSolid ? normaliseHex(fill.color) : ''

    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: fillId })
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const isVisible = fill.visible !== false
    const opacity = fill.opacity ?? 1

    const handleSwatchClick = useCallback(() => {
        setPickerOpen(true)
        onPickerOpenChange(true)
    }, [onPickerOpenChange])

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'group relative flex items-center gap-1 h-8 rounded-sm px-1 -mx-1',
                'transition-colors',
                pickerOpen ? 'bg-muted/40' : 'hover:bg-muted/20',
            )}
        >
            {/* Drag handle (kept for multi-fill ordering without affecting row alignment) */}
            <button
                className={cn(
                    'absolute -left-2 top-1/2 -translate-y-1/2 z-10',
                    'w-3 h-5 flex items-center justify-center rounded-sm',
                    'text-muted-foreground/0 group-hover:text-muted-foreground/30 opacity-0 group-hover:opacity-100',
                    'hover:!text-muted-foreground/60 cursor-grab active:cursor-grabbing transition-colors',
                )}
                {...attributes}
                {...listeners}
                tabIndex={-1}
            >
                <GripVertical size={10} />
            </button>

            {/* Main value control: swatch + value + opacity */}
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
                        'relative w-6 h-6 rounded-[4px] border shrink-0 ml-0.5 mr-1',
                        'border-border/40 hover:border-border/80 transition-all',
                        pickerOpen && 'ring-1 ring-primary/40',
                    )}
                    style={fillSwatchStyle(fill, resolvedColor)}
                    onClick={handleSwatchClick}
                    title="Edit fill"
                >
                    {/* Checkerboard for transparent fills */}
                    {isSolid && opacity < 0.05 && (
                        <div
                            className="absolute inset-0 rounded-[4px]"
                            style={{ background: 'repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 6px 6px' }}
                        />
                    )}
                </button>

                <div className="w-px h-full bg-border/35 shrink-0" />

                {/* Value: editable HEX for solid, type label for gradient/image */}
                {isSolid ? (
                    <InlineHexValueInput
                        value={solidHex}
                        onCommit={(nextHex) => onUpdate({ ...fill, color: nextHex })}
                        className="flex-1 min-w-0 h-full border-0 hover:bg-transparent focus:bg-transparent"
                    />
                ) : (
                    <button
                        className={cn(
                            'flex-1 min-w-0 h-full px-1.5 text-left text-[11px] text-muted-foreground truncate',
                            'hover:bg-muted/30 transition-colors',
                        )}
                        onClick={handleSwatchClick}
                        title={blendLabel(fill.blendMode) ? `${fillLabel(fill)} · ${blendLabel(fill.blendMode)}` : fillLabel(fill)}
                    >
                        {fillLabel(fill)}
                        {blendLabel(fill.blendMode) && (
                            <span className="text-[10px] text-primary/60 ml-1">
                                · {blendLabel(fill.blendMode)}
                            </span>
                        )}
                    </button>
                )}

                <div className="w-px h-full bg-border/35 shrink-0" />

                {/* Opacity */}
                <div className="flex items-center w-[52px] shrink-0 pr-1">
                    <InlinePercentInput
                        value={opacity}
                        onCommit={(nextOpacity) => onUpdate({ ...fill, opacity: nextOpacity })}
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
                onClick={() => onUpdate({ ...fill, visible: !isVisible })}
                title={isVisible ? 'Hide fill' : 'Show fill'}
            >
                {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>

            {/* Remove button — always visible */}
            <button
                className={cn(
                    'w-5 h-5 flex items-center justify-center rounded-sm transition-all shrink-0',
                    'text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10',
                )}
                onClick={onRemove}
                title="Remove fill"
            >
                {/* Minus icon inline SVG for compact size */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>

            {/* ColorPicker portal */}
            <ColorPicker
                fill={fill.type === 'solid' && resolvedColor
                    ? { ...fill, color: resolvedColor }
                    : fill}
                onChange={(updated) => {
                    onUpdate(updated)
                }}
                anchorEl={swatchEl}
                open={pickerOpen}
                onClose={() => { setPickerOpen(false); onPickerOpenChange(false) }}
                documentColors={documentColors}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// FillSection
// ─────────────────────────────────────────────────────────────

interface FillSectionProps {
    node: ScytleNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function FillSection({ node, onUpdate }: FillSectionProps) {
    const allNodes = useEditorStore((s) => s.nodes)
    const setGradientEditingFillIdx = useEditorStore((s) => s.setGradientEditingFillIdx)
    const setImageCropEditingFillIdx = useEditorStore((s) => s.setImageCropEditingFillIdx)
    const imageCropEditingFillIdx = useEditorStore((s) => s.imageCropEditingFillIdx)
    const fills = useMemo(() => {
        if (node.type === 'text' && (node.fills?.length ?? 0) === 0) {
            return getResolvedTextPaints(node)
        }
        return node.fills ?? []
    }, [node])
    const documentColors = collectDocumentColors(allNodes)

    // Ensure stable DnD IDs — use fill.id if set, fallback to index-based
    const fillIds = fills.map((f, i) => f.id ?? String(i))

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIdx = fillIds.indexOf(active.id as string)
            const newIdx = fillIds.indexOf(over.id as string)
            if (oldIdx !== -1 && newIdx !== -1) {
                onUpdate({ fills: arrayMove(fills, oldIdx, newIdx) })
            }
        }
    }, [fills, fillIds, onUpdate])

    const updateFill = useCallback((index: number, newFill: Fill) => {
        const newFills = fills.map((f, i) => (i === index ? newFill : f))
        onUpdate({ fills: newFills })
        // Auto-enter crop mode when a fill switches to crop
        if (newFill.type === 'image' && newFill.fit === 'crop') {
            setImageCropEditingFillIdx(index)
        }
    }, [fills, onUpdate, setImageCropEditingFillIdx])

    const removeFill = useCallback((index: number) => {
        onUpdate({ fills: fills.filter((_, i) => i !== index) })
        // Update crop editing index: clear if own fill removed, shift down if a fill above was removed
        if (index === imageCropEditingFillIdx) {
            setImageCropEditingFillIdx(null)
        } else if (imageCropEditingFillIdx !== null && index < imageCropEditingFillIdx) {
            setImageCropEditingFillIdx(imageCropEditingFillIdx - 1)
        }
    }, [fills, onUpdate, imageCropEditingFillIdx, setImageCropEditingFillIdx])

    const addSolidFill = useCallback(() => {
        const newFill: SolidFill = {
            type: 'solid',
            id: generateId(),
            color: '000000',
            opacity: 0.2,
            visible: true,
            blendMode: 'NORMAL',
        }
        onUpdate({ fills: [newFill, ...fills] })
        // New fill is prepended — shift the crop editing index so it still points to the same fill
        if (imageCropEditingFillIdx !== null) {
            setImageCropEditingFillIdx(imageCropEditingFillIdx + 1)
        }
    }, [fills, onUpdate, imageCropEditingFillIdx, setImageCropEditingFillIdx])

    return (
        <div className="border-b border-border/40">
            {/* Section header */}
            <div className="flex items-center gap-1.5 px-3 h-8">
                {/* Fill icon */}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground/60 shrink-0">
                    <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="3.5" y="3.5" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
                </svg>
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">Fill</span>
                <button
                    className="w-5 h-5 flex items-center justify-center rounded-sm transition-colors
                        text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"
                    onClick={addSolidFill}
                    title="Add fill"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Fill rows */}
            {fills.length > 0 && (
                <div className="px-3 pb-2 space-y-0.5">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={fillIds} strategy={verticalListSortingStrategy}>
                            {fills.map((fill, i) => (
                                <FillRow
                                    key={fillIds[i]}
                                    fill={fill}
                                    fillId={fillIds[i]}
                                    onUpdate={(newFill) => updateFill(i, newFill)}
                                    onRemove={() => removeFill(i)}
                                    documentColors={documentColors}
                                    onPickerOpenChange={(open) => {
                                        if (open && fill.type === 'gradient') setGradientEditingFillIdx(i)
                                        else if (!open) setGradientEditingFillIdx(null)
                                        if (open && fill.type === 'image' && fill.fit === 'crop') setImageCropEditingFillIdx(i)
                                        // Don't clear imageCropEditingFillIdx on close — crop overlay persists while fit=crop
                                    }}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            )}

            {/* Empty state */}
            {fills.length === 0 && (
                <div className="px-3 pb-2">
                    <button
                        className="w-full h-7 text-[11px] text-muted-foreground/40 hover:text-muted-foreground
                            border border-dashed border-border/30 hover:border-border/60
                            rounded-sm transition-colors flex items-center justify-center gap-1"
                        onClick={addSolidFill}
                    >
                        <Plus size={10} />
                        Add fill
                    </button>
                </div>
            )}
        </div>
    )
}
