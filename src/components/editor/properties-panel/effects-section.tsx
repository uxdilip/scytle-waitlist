'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Fill, ScytleNode, Shadow, SolidFill } from '@/types/canvas'
import { ChevronDown, Eye, EyeOff, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hexOpacityToRgba, normaliseHex } from '@/lib/color-utils'
import { useEditorStore } from '@/store/editor-store'
import { EffectSettingsOverlay } from './effects/effect-settings-overlay'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

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

function shadowColorToFill(color: string): SolidFill {
    const m = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/)
    if (m) {
        const r = parseInt(m[1], 10)
        const g = parseInt(m[2], 10)
        const b = parseInt(m[3], 10)
        const hex = `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        return { type: 'solid', color: hex, opacity: m[4] ? parseFloat(m[4]) : 1 }
    }
    return { type: 'solid', color: normaliseHex(color), opacity: 1 }
}

function fillToShadowColor(fill: Fill): string {
    if (fill.type !== 'solid') return '#000000'

    const hex = normaliseHex(fill.color)
    const opacity = fill.opacity ?? 1
    if (opacity >= 1) return `#${hex}`

    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${opacity})`
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────

interface ShadowRowProps {
    shadow: Shadow
    index: number
    isSettingsOpen: boolean
    documentColors: string[]
    onOpenSettings: (index: number) => void
    onCloseSettings: () => void
    onUpdate: (index: number, partial: Partial<Shadow>) => void
    onRemove: (index: number) => void
}

const ShadowRow = memo(function ShadowRow({
    shadow,
    index,
    isSettingsOpen,
    documentColors,
    onOpenSettings,
    onCloseSettings,
    onUpdate,
    onRemove,
}: ShadowRowProps) {
    const [settingsAnchorEl, setSettingsAnchorEl] = useState<HTMLButtonElement | null>(null)

    const fill = useMemo(() => shadowColorToFill(shadow.color), [shadow.color])
    const isVisible = shadow.visible !== false
    const effectLabel = shadow.type === 'drop' ? 'Drop shadow' : 'Inner shadow'

    const handleToggleSettings = useCallback(() => {
        if (isSettingsOpen) {
            onCloseSettings()
            return
        }
        onOpenSettings(index)
    }, [index, isSettingsOpen, onCloseSettings, onOpenSettings])

    const swatchBg = useMemo(
        () => hexOpacityToRgba(normaliseHex(fill.color), fill.opacity ?? 1),
        [fill.color, fill.opacity],
    )

    return (
        <>
            <div
                className={cn(
                    'group flex items-center gap-1 h-8 rounded-sm px-1 -mx-1',
                    'transition-colors',
                    isSettingsOpen ? 'bg-muted/40' : 'hover:bg-muted/20',
                )}
            >
                {/* Settings / preview chip */}
                <button
                    ref={setSettingsAnchorEl}
                    className={cn(
                        'w-7 h-7 rounded-md border flex items-center justify-center shrink-0 transition-all',
                        isSettingsOpen
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-border/35 bg-muted/20 text-muted-foreground/75 hover:text-foreground hover:border-border/55',
                    )}
                    onClick={handleToggleSettings}
                    title="Effect settings"
                >
                    <span
                        className="w-4 h-4 rounded-[3px] border border-black/10"
                        style={{ backgroundColor: swatchBg }}
                    />
                </button>

                {/* Effect type row control */}
                <button
                    className={cn(
                        'flex items-center gap-1.5 min-w-0 flex-1 h-7 px-2 rounded-md border',
                        'border-border/35 bg-muted/20 hover:bg-muted/35 transition-colors',
                    )}
                    onClick={handleToggleSettings}
                    title="Open effect settings"
                >
                    <span className="text-[11px] text-foreground/90 truncate">{effectLabel}</span>
                    <ChevronDown size={12} className="text-muted-foreground/45 shrink-0" />
                </button>

                {/* Visibility */}
                <button
                    className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-md transition-colors shrink-0',
                        isVisible
                            ? 'text-muted-foreground/45 hover:text-foreground hover:bg-muted/50'
                            : 'text-muted-foreground/30 hover:text-muted-foreground',
                    )}
                    onClick={() => onUpdate(index, { visible: !isVisible })}
                    title={isVisible ? 'Hide effect' : 'Show effect'}
                >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Remove */}
                <button
                    className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-md transition-colors shrink-0',
                        'text-muted-foreground/45 hover:text-destructive hover:bg-destructive/10',
                    )}
                    onClick={() => onRemove(index)}
                    title="Remove effect"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            <EffectSettingsOverlay
                key={isSettingsOpen ? 'open' : 'closed'}
                shadow={shadow}
                colorFill={fill}
                open={isSettingsOpen}
                anchorEl={settingsAnchorEl}
                documentColors={documentColors}
                onUpdate={(partial) => onUpdate(index, partial)}
                onColorFillChange={(nextFill) => onUpdate(index, { color: fillToShadowColor(nextFill) })}
                onClose={onCloseSettings}
            />
        </>
    )
})

// ─────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────

interface EffectsSectionProps {
    node: ScytleNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function EffectsSection({ node, onUpdate }: EffectsSectionProps) {
    const allNodes = useEditorStore((s) => s.nodes)
    const documentColors = useMemo(() => collectDocumentColors(allNodes), [allNodes])

    const [openSettingsIndex, setOpenSettingsIndex] = useState<number | null>(null)

    const shadows = node.shadows

    // Keep callbacks stable for row memoization during high-frequency edits.
    const shadowsRef = useRef(shadows)
    const onUpdateRef = useRef(onUpdate)

    useEffect(() => {
        shadowsRef.current = shadows
    }, [shadows])

    useEffect(() => {
        onUpdateRef.current = onUpdate
    }, [onUpdate])

    const updateShadow = useCallback((index: number, partial: Partial<Shadow>) => {
        onUpdateRef.current({
            shadows: shadowsRef.current.map((s, i) => (i === index ? { ...s, ...partial } : s)),
        })
    }, [])

    const addShadow = useCallback(() => {
        onUpdateRef.current({
            shadows: [
                {
                    type: 'drop',
                    color: 'rgba(0,0,0,0.25)',
                    x: 0,
                    y: 4,
                    blur: 4,
                    spread: 0,
                    visible: true,
                    blendMode: 'NORMAL',
                },
                ...shadowsRef.current,
            ],
        })
        setOpenSettingsIndex(0)
    }, [])

    const removeShadow = useCallback((index: number) => {
        onUpdateRef.current({ shadows: shadowsRef.current.filter((_, i) => i !== index) })
        setOpenSettingsIndex((current) => {
            if (current === null) return null
            if (current === index) return null
            if (current > index) return current - 1
            return current
        })
    }, [])

    const safeOpenSettingsIndex =
        openSettingsIndex !== null && openSettingsIndex < shadows.length
            ? openSettingsIndex
            : null

    return (
        <div className="border-b border-border/40">
            {/* Header */}
            <div className="flex items-center gap-1.5 px-3 h-8">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground/60 shrink-0">
                    <path
                        d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5L6 1Z"
                        stroke="currentColor"
                        strokeWidth="1.1"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </svg>
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">Effects</span>
                <button
                    className={cn(
                        'w-5 h-5 flex items-center justify-center rounded-sm transition-colors',
                        'text-muted-foreground/40 hover:text-foreground hover:bg-muted/50',
                    )}
                    onClick={addShadow}
                    title="Add effect"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Rows */}
            {shadows.length > 0 && (
                <div className="px-3 pb-2 space-y-0.5">
                    {shadows.map((shadow, i) => (
                        <ShadowRow
                            key={i}
                            shadow={shadow}
                            index={i}
                            isSettingsOpen={safeOpenSettingsIndex === i}
                            documentColors={documentColors}
                            onOpenSettings={setOpenSettingsIndex}
                            onCloseSettings={() => setOpenSettingsIndex(null)}
                            onUpdate={updateShadow}
                            onRemove={removeShadow}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {shadows.length === 0 && (
                <div className="px-3 pb-2">
                    <button
                        className={cn(
                            'w-full h-7 text-[11px] text-muted-foreground/40 hover:text-muted-foreground',
                            'border border-dashed border-border/30 hover:border-border/60',
                            'rounded-sm transition-colors flex items-center justify-center gap-1',
                        )}
                        onClick={addShadow}
                    >
                        <Plus size={10} />
                        Add effect
                    </button>
                </div>
            )}
        </div>
    )
}
