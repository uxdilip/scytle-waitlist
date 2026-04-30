'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { TextNode } from '@/types/canvas'
import { Section, ToggleGroup } from './inputs'
import {
    AlignLeft,
    AlignCenter,
    AlignRight,
    Settings2,
    ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { FontFamilyPicker } from './typography/font-family-picker'
import { FontStylePicker } from './typography/font-style-picker'
import { TypeSettingsOverlay } from './typography/type-settings-overlay'
import { FontSizeCombobox } from './typography/font-size-combobox'
import { LineHeightInput } from './typography/line-height-input'
import { LetterSpacingInput } from './typography/letter-spacing-input'
import { loadFont, parseFontStyleName } from '@/lib/fonts/google-fonts'

// ── Custom inline SVG icons ────────────────────────────────────────────────────

function VAlignTopIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="1" y="1" width="10" height="1.5" rx="0.5" fill="currentColor" />
            <rect x="1.5" y="4" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="1.5" y="6.7" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
        </svg>
    )
}

function VAlignMiddleIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="1.5" y="2" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="1" y="5.25" width="10" height="1.5" rx="0.5" fill="currentColor" />
            <rect x="1.5" y="8.5" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
        </svg>
    )
}

function VAlignBottomIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="1.5" y="4" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="1.5" y="6.7" width="9" height="1.2" rx="0.4" fill="currentColor" opacity="0.5" />
            <rect x="1" y="9.5" width="10" height="1.5" rx="0.5" fill="currentColor" />
        </svg>
    )
}

// ── Option arrays ────────────────────────────────────────────────────────────────

/** Main panel: 3 H-align options (Justify moved to Type Settings Basics tab) */
const TEXT_ALIGN_OPTIONS: { value: TextNode['textAlign']; icon: React.ReactNode; title: string }[] = [
    { value: 'left', icon: <AlignLeft size={12} />, title: 'Align left' },
    { value: 'center', icon: <AlignCenter size={12} />, title: 'Align center' },
    { value: 'right', icon: <AlignRight size={12} />, title: 'Align right' },
]

const VALIGN_OPTIONS: { value: 'top' | 'center' | 'bottom'; icon: React.ReactNode; title: string }[] = [
    { value: 'top', icon: <VAlignTopIcon />, title: 'Align top' },
    { value: 'center', icon: <VAlignMiddleIcon />, title: 'Align middle' },
    { value: 'bottom', icon: <VAlignBottomIcon />, title: 'Align bottom' },
]

// ── Local class constants ──────────────────────────────────────────────────────

const INPUT_BASE = [
    'w-full h-7 px-2 text-[11px] rounded-sm',
    'bg-transparent border border-transparent',
    'hover:bg-muted/50',
    'focus:bg-muted/60 focus:border-border focus:outline-none',
    'transition-colors',
].join(' ')

// ── Sub-components ────────────────────────────────────────────────────────────

/** Clickable font family trigger that opens the floating FontFamilyPicker */
function FontFamilyTrigger({ value, nodeId }: { value: string; nodeId: string }) {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const fontPickerOpen = useEditorStore((s) => s.fontPickerOpen)
    const fontPickerNodeId = useEditorStore((s) => s.fontPickerNodeId)
    const openFontPicker = useEditorStore((s) => s.openFontPicker)

    const isOpen = fontPickerOpen && fontPickerNodeId === nodeId

    useEffect(() => {
        loadFont(value)
    }, [value])

    return (
        <button
            ref={triggerRef}
            className={cn(
                INPUT_BASE,
                'flex items-center gap-1 text-left',
                isOpen && 'bg-muted/60 border-border',
            )}
            onClick={() => {
                if (!isOpen) openFontPicker(nodeId)
            }}
        >
            <span
                className="truncate flex-1"
                style={{ fontFamily: `"${value}", sans-serif` }}
            >
                {value}
            </span>
            <ChevronDown size={10} className="shrink-0 text-muted-foreground/50" />
        </button>
    )
}

// ── Main section component ────────────────────────────────────────────────────

interface TypographySectionProps {
    node: TextNode
    onUpdate: (updates: Record<string, unknown>) => void
}

export function TypographySection({ node, onUpdate }: TypographySectionProps) {
    const [fontTriggerEl, setFontTriggerEl] = useState<HTMLDivElement | null>(null)
    const [settingsBtnEl, setSettingsBtnEl] = useState<HTMLButtonElement | null>(null)
    const [styleTriggerEl, setStyleTriggerEl] = useState<HTMLButtonElement | null>(null)
    const [stylePickerOpen, setStylePickerOpen] = useState(false)

    const displayFontFamily = node.fontFamily
    const displayFontSize = node.fontSize

    // Font picker state from store
    const fontPickerOpen = useEditorStore((s) => s.fontPickerOpen)
    const fontPickerNodeId = useEditorStore((s) => s.fontPickerNodeId)
    const closeFontPicker = useEditorStore((s) => s.closeFontPicker)
    const showFontPicker = fontPickerOpen && fontPickerNodeId === node.id

    // Type Settings overlay state from store
    const typeSettingsOpen = useEditorStore((s) => s.typeSettingsOpen)
    const openTypeSettings = useEditorStore((s) => s.openTypeSettings)
    const closeTypeSettings = useEditorStore((s) => s.closeTypeSettings)

    // ── Font preview save/restore (same pattern as ColorPicker blend preview) ──
    const savedFontRef = useRef<string | null>(null)

    const handleFontSelect = useCallback((family: string) => {
        savedFontRef.current = null
        onUpdate({ fontFamily: family })
    }, [onUpdate])

    const handleFontPreview = useCallback((family: string | null) => {
        if (family !== null) {
            if (savedFontRef.current === null) {
                savedFontRef.current = node.fontFamily
            }
            onUpdate({ fontFamily: family })
        } else {
            if (savedFontRef.current !== null) {
                onUpdate({ fontFamily: savedFontRef.current })
                savedFontRef.current = null
            }
        }
    }, [onUpdate, node.fontFamily])

    const handleFontPickerClose = useCallback(() => {
        if (savedFontRef.current !== null) {
            onUpdate({ fontFamily: savedFontRef.current })
            savedFontRef.current = null
        }
        closeFontPicker()
    }, [onUpdate, closeFontPicker])

    // ── Font style preview save/restore ──
    const savedStyleRef = useRef<{ fontStyleName: string; fontWeight: number; fontStyle: string } | null>(null)

    const handleStylePreview = useCallback((styleName: string | null) => {
        if (styleName !== null) {
            if (savedStyleRef.current === null) {
                savedStyleRef.current = {
                    fontStyleName: node.fontStyleName ?? 'Regular',
                    fontWeight: node.fontWeight,
                    fontStyle: node.fontStyle ?? 'normal',
                }
            }
            const { fontWeight, fontStyle } = parseFontStyleName(styleName)
            onUpdate({ fontStyleName: styleName, fontWeight, fontStyle })
        } else {
            if (savedStyleRef.current !== null) {
                onUpdate(savedStyleRef.current)
                savedStyleRef.current = null
            }
        }
    }, [onUpdate, node.fontStyleName, node.fontWeight, node.fontStyle])

    const handleStyleSelect = useCallback((styleName: string) => {
        savedStyleRef.current = null
        const { fontWeight, fontStyle } = parseFontStyleName(styleName)
        onUpdate({ fontStyleName: styleName, fontWeight, fontStyle })
    }, [onUpdate])

    const handleStylePickerClose = useCallback(() => {
        if (savedStyleRef.current !== null) {
            onUpdate(savedStyleRef.current)
            savedStyleRef.current = null
        }
        setStylePickerOpen(false)
    }, [onUpdate])

    // ── Font size preview save/restore ──
    const savedFontSizeRef = useRef<number | null>(null)

    const handleFontSizePreview = useCallback((size: number | null) => {
        if (size !== null) {
            if (savedFontSizeRef.current === null) savedFontSizeRef.current = node.fontSize
            onUpdate({ fontSize: size })
        } else {
            if (savedFontSizeRef.current !== null) {
                onUpdate({ fontSize: savedFontSizeRef.current })
                savedFontSizeRef.current = null
            }
        }
    }, [onUpdate, node.fontSize])

    return (
        <Section
            title="Typography"
            action={
                <button
                    ref={setSettingsBtnEl}
                    data-section-action
                    title="Type Settings"
                    onClick={(e) => {
                        e.stopPropagation()
                        if (typeSettingsOpen) closeTypeSettings()
                        else openTypeSettings()
                    }}
                    className={cn(
                        'flex items-center justify-center w-5 h-5 rounded-sm transition-colors',
                        typeSettingsOpen
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                    )}
                >
                    <Settings2 size={11} />
                </button>
            }
        >
            {/* ── Row 1: Font family ─────────────────────────────────── */}
            <div className="flex items-center">
                <div ref={setFontTriggerEl} className="flex-1">
                    <FontFamilyTrigger value={displayFontFamily} nodeId={node.id} />
                </div>
            </div>
            {showFontPicker && (
                <FontFamilyPicker
                    currentFamily={displayFontFamily}
                    anchorEl={fontTriggerEl}
                    onSelect={handleFontSelect}
                    onPreview={handleFontPreview}
                    onClose={handleFontPickerClose}
                />
            )}

            {/* ── Row 2: Font style (dynamic) + Size ────────────────── */}
            <div className="flex items-center gap-1.5">
                <button
                    ref={setStyleTriggerEl}
                    className={cn(
                        INPUT_BASE,
                        'flex items-center gap-1 text-left flex-1',
                        stylePickerOpen && 'bg-muted/60 border-border',
                    )}
                    onClick={() => setStylePickerOpen((v) => !v)}
                >
                    <span className="truncate flex-1">
                        {node.fontStyleName ?? 'Regular'}
                    </span>
                    <ChevronDown size={10} className="shrink-0 text-muted-foreground/50" />
                </button>
                {stylePickerOpen && (
                    <FontStylePicker
                        fontFamily={node.fontFamily}
                        currentStyle={node.fontStyleName ?? 'Regular'}
                        anchorEl={styleTriggerEl}
                        onSelect={handleStyleSelect}
                        onPreview={handleStylePreview}
                        onClose={handleStylePickerClose}
                    />
                )}
                <FontSizeCombobox
                    value={displayFontSize}
                    onChange={(v) => {
                        savedFontSizeRef.current = null
                        onUpdate({ fontSize: v })
                    }}
                    onPreview={handleFontSizePreview}
                    className="w-[4.5rem]"
                />
            </div>

            {/* ── Row 3: Line height + Letter spacing ────────────────── */}
            <div className="flex items-center gap-2">
                <LineHeightInput
                    value={node.lineHeight}
                    unit={node.lineHeightUnit ?? (node.lineHeight === 'auto' ? 'auto' : 'px')}
                    fontSize={node.fontSize}
                    onChange={(v, u) => onUpdate({ lineHeight: v, lineHeightUnit: u })}
                />
                <LetterSpacingInput
                    value={node.letterSpacing}
                    unit={node.letterSpacingUnit ?? '%'}
                    onChange={(v, u) => onUpdate({ letterSpacing: v, letterSpacingUnit: u })}
                />
            </div>

            {/* ── Row 4: H-align (3) + V-align (3) + Tag ─────────────── */}
            <div className="flex items-center gap-1.5">
                <ToggleGroup
                    value={node.textAlign}
                    options={TEXT_ALIGN_OPTIONS}
                    onChange={(v) => onUpdate({ textAlign: v })}
                    className="flex-1"
                />
                <ToggleGroup
                    value={node.textAlignVertical ?? 'top'}
                    options={VALIGN_OPTIONS}
                    onChange={(v) => onUpdate({ textAlignVertical: v })}
                />
            </div>

            {/* ── Type Settings Overlay (floating, portal) ───────────── */}
            {typeSettingsOpen && (
                <TypeSettingsOverlay
                    node={node}
                    anchorEl={settingsBtnEl}
                    onUpdate={onUpdate}
                />
            )}
        </Section>
    )
}
