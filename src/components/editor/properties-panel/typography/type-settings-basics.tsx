'use client'

import { useEffect, useState } from 'react'
import type { TextNode } from '@/types/canvas'
import { NumberInput } from '../inputs'
import {
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Underline,
    Strikethrough,
    Minus,
    List,
    ListOrdered,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadFont } from '@/lib/fonts/google-fonts'
import { getTextPaintStyle } from '@/lib/text-paint'

// ── Option arrays ──────────────────────────────────────────────────────────────

const ALIGN_OPTIONS: { value: TextNode['textAlign']; icon: React.ReactNode; title: string }[] = [
    { value: 'left', icon: <AlignLeft size={12} />, title: 'Align left' },
    { value: 'center', icon: <AlignCenter size={12} />, title: 'Align center' },
    { value: 'right', icon: <AlignRight size={12} />, title: 'Align right' },
    { value: 'justify', icon: <AlignJustify size={12} />, title: 'Justify' },
]

const DECORATION_OPTIONS: { value: TextNode['textDecoration']; icon: React.ReactNode; title: string }[] = [
    { value: 'none', icon: <Minus size={12} />, title: 'No decoration' },
    { value: 'underline', icon: <Underline size={12} />, title: 'Underline' },
    { value: 'line-through', icon: <Strikethrough size={12} />, title: 'Strikethrough' },
]

const TRANSFORM_OPTIONS: { value: TextNode['textTransform']; icon: React.ReactNode; title: string }[] = [
    {
        value: 'none',
        icon: <span className="text-[9px] font-mono leading-none select-none">—</span>,
        title: 'As typed',
    },
    {
        value: 'uppercase',
        icon: <span className="text-[8px] font-bold font-mono leading-none tracking-wide select-none">AG</span>,
        title: 'UPPERCASE',
    },
    {
        value: 'lowercase',
        icon: <span className="text-[9px] font-mono leading-none select-none">ag</span>,
        title: 'lowercase',
    },
    {
        value: 'capitalize',
        icon: <span className="text-[9px] font-mono leading-none select-none">Ag</span>,
        title: 'Title Case',
    },
    {
        value: 'small-caps',
        icon: (
            <span className="font-mono leading-none select-none" style={{ fontSize: 9 }}>
                A<span style={{ fontSize: 6.5 }}>A</span>
            </span>
        ),
        title: 'Small caps',
    },
]

const LIST_OPTIONS: { value: 'none' | 'unordered' | 'ordered'; icon: React.ReactNode; title: string }[] = [
    { value: 'none', icon: <Minus size={12} />, title: 'No list' },
    { value: 'unordered', icon: <List size={12} />, title: 'Bulleted list' },
    { value: 'ordered', icon: <ListOrdered size={12} />, title: 'Numbered list' },
]

const TRUNCATION_OPTIONS: { value: 'disabled' | 'ending'; icon: React.ReactNode; title: string }[] = [
    { value: 'disabled', icon: <Minus size={12} />, title: 'No truncation' },
    {
        value: 'ending',
        icon: <span className="text-[9px] font-mono leading-none select-none">A…</span>,
        title: 'Truncate with ellipsis',
    },
]

// ── Hover-aware toggle group for preview updates ─────────────────────────────

interface PreviewToggleGroupProps<T extends string> {
    value: T
    options: { value: T; icon: React.ReactNode; title: string }[]
    onChange: (v: T) => void
    onPreview?: (v: T | null) => void
}

function PreviewToggleGroup<T extends string>({
    value,
    options,
    onChange,
    onPreview,
}: PreviewToggleGroupProps<T>) {
    return (
        <div
            className="flex items-center bg-muted/50 rounded-sm p-0.5 gap-px"
            onPointerLeave={() => onPreview?.(null)}
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    title={opt.title}
                    onPointerEnter={() => onPreview?.(opt.value)}
                    onClick={() => { onPreview?.(null); onChange(opt.value) }}
                    className={cn(
                        'flex items-center justify-center w-7 h-6 rounded-sm transition-all text-[11px]',
                        value === opt.value
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                >
                    {opt.icon}
                </button>
            ))}
        </div>
    )
}

// ── Component ──────────────────────────────────────────────────────────────────

interface TypeSettingsBasicsProps {
    node: TextNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function TypeSettingsBasics({ node, onUpdate }: TypeSettingsBasicsProps) {
    const truncation = node.textTruncation ?? 'disabled'
    const previewPaintStyle = getTextPaintStyle(node)

    // Ensure the font is loaded for the preview box
    useEffect(() => { loadFont(node.fontFamily) }, [node.fontFamily])

    // ── Hover preview overrides ──
    const [previewOverrides, setPreviewOverrides] = useState<{
        textAlign?: TextNode['textAlign']
        textDecoration?: TextNode['textDecoration']
        textTransform?: TextNode['textTransform']
        listStyle?: 'none' | 'unordered' | 'ordered'
        textTruncation?: 'disabled' | 'ending'
    }>({})

    // Merged preview values — hover overrides node's committed state
    const previewAlign = previewOverrides.textAlign ?? node.textAlign
    const previewDecoration = previewOverrides.textDecoration ?? node.textDecoration
    const previewTransform = previewOverrides.textTransform ?? node.textTransform
    const previewList = previewOverrides.listStyle ?? (node.listStyle ?? 'none')
    const previewTrunc = previewOverrides.textTruncation ?? (node.textTruncation ?? 'disabled')

    // Preview text: use actual node text (first 40 chars) or fallback specimen
    const previewText = node.characters.trim().slice(0, 40) || 'Aa Bb Cc 012'

    // Letter spacing for preview (unit-aware)
    const lsUnit = node.letterSpacingUnit ?? 'px'
    const letterSpacingCSS = node.letterSpacing !== 0
        ? (lsUnit === '%' ? `${node.letterSpacing / 100}em` : `${node.letterSpacing}px`)
        : undefined

    // List prefix character (avoids display:list-item layout thrash on hover)
    const listPrefix = previewList === 'unordered' ? '• ' : previewList === 'ordered' ? '1. ' : ''

    return (
        <div className="space-y-3 py-1">
            {/* ── Live preview box — updates on hover ── */}
            <div
                className="rounded-sm bg-muted/40 px-3 py-2 overflow-hidden min-h-[52px] flex items-center"
                style={{
                    fontFamily: `"${node.fontFamily}", sans-serif`,
                    fontSize: Math.min(node.fontSize, 24),
                    fontWeight: node.fontWeight,
                    fontStyle: node.fontStyle === 'italic' ? 'italic' : undefined,
                    textDecoration: previewDecoration !== 'none' ? previewDecoration : undefined,
                    // Skip small-caps synthesis (expensive browser op — causes hang on hover)
                    textTransform: (previewTransform !== 'none' && previewTransform !== 'small-caps')
                        ? previewTransform as React.CSSProperties['textTransform']
                        : undefined,
                    letterSpacing: letterSpacingCSS,
                    textAlign: previewAlign as React.CSSProperties['textAlign'],
                    ...previewPaintStyle,
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                    // Truncation preview
                    ...(previewTrunc === 'ending' ? {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                    } : {}),
                }}
            >
                <span style={previewTrunc === 'ending' ? undefined : { display: 'block', width: '100%' }}>
                    {listPrefix}{previewText}
                </span>
            </div>

            {/* Alignment — all 4 including Justify */}
            <LabelRow label="Alignment">
                <PreviewToggleGroup
                    value={node.textAlign}
                    options={ALIGN_OPTIONS}
                    onChange={(v) => onUpdate({ textAlign: v })}
                    onPreview={(v) => setPreviewOverrides((p) => ({ ...p, textAlign: v ?? undefined }))}
                />
            </LabelRow>

            {/* Decoration */}
            <LabelRow label="Decoration">
                <PreviewToggleGroup
                    value={node.textDecoration}
                    options={DECORATION_OPTIONS}
                    onChange={(v) => onUpdate({ textDecoration: v })}
                    onPreview={(v) => setPreviewOverrides((p) => ({ ...p, textDecoration: v ?? undefined }))}
                />
            </LabelRow>

            {/* Case / Transform */}
            <LabelRow label="Case">
                <PreviewToggleGroup
                    value={node.textTransform}
                    options={TRANSFORM_OPTIONS}
                    onChange={(v) => onUpdate({ textTransform: v })}
                    onPreview={(v) => setPreviewOverrides((p) => ({ ...p, textTransform: v ?? undefined }))}
                />
            </LabelRow>

            {/* Vertical trim */}
            <LabelRow label="Vertical trim">
                <div className="flex items-center bg-muted/50 rounded-sm p-0.5 gap-px">
                    {([
                        { value: 'none' as const, label: 'Std', title: 'Standard' },
                        { value: 'cap-height' as const, label: 'Cap', title: 'Cap-height trim' },
                    ]).map((opt) => (
                        <button
                            key={opt.value}
                            title={opt.title}
                            onClick={() => onUpdate({ leadingTrim: opt.value })}
                            className={cn(
                                'h-6 px-2 rounded-sm text-[10px] transition-all',
                                (node.leadingTrim ?? 'none') === opt.value
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </LabelRow>

            {/* List style */}
            <LabelRow label="List style">
                <PreviewToggleGroup
                    value={node.listStyle ?? 'none'}
                    options={LIST_OPTIONS}
                    onChange={(v) => onUpdate({ listStyle: v })}
                    onPreview={(v) => setPreviewOverrides((p) => ({ ...p, listStyle: v ?? undefined }))}
                />
            </LabelRow>

            {/* Paragraph spacing */}
            <LabelRow label="Paragraph spacing">
                <NumberInput
                    value={node.paragraphSpacing ?? 0}
                    onChange={(v) => onUpdate({ paragraphSpacing: v })}
                    min={0}
                    step={1}
                    className="w-20"
                />
            </LabelRow>

            {/* Truncate text */}
            <LabelRow label="Truncate text">
                <PreviewToggleGroup
                    value={truncation}
                    options={TRUNCATION_OPTIONS}
                    onChange={(v) => onUpdate({ textTruncation: v })}
                    onPreview={(v) => setPreviewOverrides((p) => ({ ...p, textTruncation: v ?? undefined }))}
                />
            </LabelRow>

            {/* Max lines — only if truncation is enabled */}
            {truncation === 'ending' && (
                <LabelRow label="Max lines">
                    <NumberInput
                        value={node.maxLines ?? 1}
                        onChange={(v) => onUpdate({ maxLines: v })}
                        min={1}
                        step={1}
                        className="w-20"
                    />
                </LabelRow>
            )}
        </div>
    )
}

// ── Shared label+control row ────────────────────────────────────────────────────

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground/70 shrink-0">{label}</span>
            {children}
        </div>
    )
}
