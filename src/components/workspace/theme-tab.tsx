'use client'

import { useState, useCallback } from 'react'
import { Moon, Sun, Shuffle, Plus, Trash2, Copy, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStyleGuideStore } from '@/store'
import { FONT_PAIRS, type FontPair, loadGoogleFonts } from '@/lib/theme/tokens/font-pairs'
import type { RadiusPreset, ButtonStyle, CardStyle } from '@/lib/theme/tokens'
import { Separator } from '@/components/ui/separator'

// ════════════════════════════════════════════════════════════
// Section wrapper
// ════════════════════════════════════════════════════════════

function Section({ title, action, children }: {
    title: string
    action?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {title}
                </h3>
                {action}
            </div>
            {children}
        </div>
    )
}

// ════════════════════════════════════════════════════════════
// Concept Switcher
// ════════════════════════════════════════════════════════════

function ConceptSwitcher() {
    const data = useStyleGuideStore(s => s.data)
    const switchConcept = useStyleGuideStore(s => s.switchConcept)
    const createConcept = useStyleGuideStore(s => s.createConcept)
    const duplicateConcept = useStyleGuideStore(s => s.duplicateConcept)
    const deleteConcept = useStyleGuideStore(s => s.deleteConcept)
    const [open, setOpen] = useState(false)

    const activeConcept = data.concepts.find(c => c.id === data.activeConceptId)

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 text-xs transition-colors"
            >
                <span className="font-medium truncate">{activeConcept?.name || 'Concept 1'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1">
                    {data.concepts.map(c => (
                        <button
                            key={c.id}
                            onClick={() => { switchConcept(c.id); setOpen(false) }}
                            className={cn(
                                'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/40 flex items-center gap-2',
                                c.id === data.activeConceptId && 'bg-muted/30 font-medium'
                            )}
                        >
                            <div className="flex gap-0.5">
                                {c.colors.accents.slice(0, 3).map(a => (
                                    <div key={a.id} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.hex }} />
                                ))}
                            </div>
                            <span className="flex-1 truncate">{c.name}</span>
                            {data.concepts.length > 1 && c.id !== data.activeConceptId && (
                                <Trash2
                                    className="w-3 h-3 text-muted-foreground/50 hover:text-destructive shrink-0"
                                    onClick={(e) => { e.stopPropagation(); deleteConcept(c.id) }}
                                />
                            )}
                        </button>
                    ))}
                    <Separator className="my-1" />
                    <button
                        onClick={() => { createConcept(); setOpen(false) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 flex items-center gap-2"
                    >
                        <Plus className="w-3 h-3" /> New Concept
                    </button>
                    {activeConcept && (
                        <button
                            onClick={() => { duplicateConcept(activeConcept.id); setOpen(false) }}
                            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 flex items-center gap-2"
                        >
                            <Copy className="w-3 h-3" /> Duplicate
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

// ════════════════════════════════════════════════════════════
// Mode Toggle + Accent Colors
// ════════════════════════════════════════════════════════════

function ThemeColors() {
    const concept = useStyleGuideStore(s => {
        const d = s.data
        return d.concepts.find(c => c.id === d.activeConceptId) ?? d.concepts[0]
    })
    const toggleMode = useStyleGuideStore(s => s.toggleMode)
    const shuffleColors = useStyleGuideStore(s => s.shuffleColors)
    const updateAccent = useStyleGuideStore(s => s.updateAccent)
    const setMainAccent = useStyleGuideStore(s => s.setMainAccent)
    const addAccent = useStyleGuideStore(s => s.addAccent)
    const removeAccent = useStyleGuideStore(s => s.removeAccent)

    const isLight = concept.colors.mode === 'light'

    return (
        <Section
            title="Colors"
            action={
                <div className="flex items-center gap-1">
                    <button
                        onClick={shuffleColors}
                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                        title="Shuffle colors"
                    >
                        <Shuffle className="w-3 h-3" />
                    </button>
                    <button
                        onClick={toggleMode}
                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                        title={isLight ? 'Switch to dark' : 'Switch to light'}
                    >
                        {isLight ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                    </button>
                </div>
            }
        >
            {/* Mode indicator */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/20 text-[11px] text-muted-foreground">
                {isLight ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                <span>{isLight ? 'Light' : 'Dark'} mode</span>
                <span className="ml-auto font-mono text-[10px]">{concept.colors.bgPrimary}</span>
            </div>

            {/* Accent colors */}
            <div className="space-y-0.5">
                {concept.colors.accents.map(accent => (
                    <div
                        key={accent.id}
                        className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors group',
                            accent.isMain && 'bg-muted/20'
                        )}
                    >
                        <label className="relative cursor-pointer">
                            <div
                                className={cn(
                                    'w-5 h-5 rounded border',
                                    accent.isMain ? 'border-foreground/40 ring-1 ring-foreground/20' : 'border-border/60'
                                )}
                                style={{ backgroundColor: accent.hex }}
                            />
                            <input
                                type="color"
                                value={accent.hex}
                                onChange={e => updateAccent(accent.id, { hex: e.target.value })}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                        </label>
                        <span
                            className="text-xs text-muted-foreground flex-1 cursor-pointer"
                            onClick={() => setMainAccent(accent.id)}
                        >
                            {accent.name}
                            {accent.isMain && <span className="ml-1 text-[9px] opacity-50">main</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40 font-mono">
                            {accent.hex}
                        </span>
                        {concept.colors.accents.length > 1 && (
                            <button
                                onClick={() => removeAccent(accent.id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/40 hover:text-destructive transition-opacity"
                            >
                                <Trash2 className="w-2.5 h-2.5" />
                            </button>
                        )}
                    </div>
                ))}
                {concept.colors.accents.length < 5 && (
                    <button
                        onClick={() => addAccent('New', '#6366f1')}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        Add accent
                    </button>
                )}
            </div>
        </Section>
    )
}

// ════════════════════════════════════════════════════════════
// Typography
// ════════════════════════════════════════════════════════════

function ThemeTypography() {
    const concept = useStyleGuideStore(s => {
        const d = s.data
        return d.concepts.find(c => c.id === d.activeConceptId) ?? d.concepts[0]
    })
    const applyFontPair = useStyleGuideStore(s => s.applyFontPair)
    const shuffleTypography = useStyleGuideStore(s => s.shuffleTypography)
    const setHeadingWeight = useStyleGuideStore(s => s.setHeadingWeight)
    const setSizeScale = useStyleGuideStore(s => s.setSizeScale)
    const [showFonts, setShowFonts] = useState(false)

    const headingFont = concept.typography.headingFont.replace(/['"]/g, '').split(',')[0].trim()
    const bodyFont = concept.typography.bodyFont.replace(/['"]/g, '').split(',')[0].trim()

    const handleApplyFont = useCallback((pair: FontPair) => {
        loadGoogleFonts(pair)
        applyFontPair(pair)
        setShowFonts(false)
    }, [applyFontPair])

    return (
        <Section
            title="Typography"
            action={
                <button
                    onClick={shuffleTypography}
                    className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                    title="Shuffle fonts"
                >
                    <Shuffle className="w-3 h-3" />
                </button>
            }
        >
            {/* Current fonts */}
            <button
                onClick={() => setShowFonts(!showFonts)}
                className="w-full space-y-1"
            >
                <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30 border border-border/30 hover:border-border/50 transition-colors">
                    <span className="text-[10px] text-muted-foreground">Heading</span>
                    <span className="text-xs font-medium truncate ml-2">{headingFont}</span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30 border border-border/30 hover:border-border/50 transition-colors">
                    <span className="text-[10px] text-muted-foreground">Body</span>
                    <span className="text-xs truncate ml-2">{bodyFont}</span>
                </div>
            </button>

            {/* Font browser */}
            {showFonts && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 bg-card">
                    {FONT_PAIRS.slice(0, 30).map(pair => (
                        <button
                            key={pair.id}
                            onClick={() => handleApplyFont(pair)}
                            className="w-full text-left px-2.5 py-2 hover:bg-muted/40 border-b border-border/10 last:border-0 transition-colors"
                        >
                            <div className="text-[11px] font-semibold">{pair.heading.googleName}</div>
                            <div className="text-[10px] text-muted-foreground">{pair.body.googleName}</div>
                        </button>
                    ))}
                </div>
            )}

            {/* Weight + Scale controls */}
            <div className="flex gap-2">
                <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">Weight</label>
                    <div className="flex gap-0.5">
                        {([400, 500, 600, 700, 800] as const).map(w => (
                            <button
                                key={w}
                                onClick={() => setHeadingWeight(w)}
                                className={cn(
                                    'flex-1 h-6 rounded text-[9px] transition-colors',
                                    concept.typography.headingWeight === w
                                        ? 'bg-foreground text-background'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                )}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="w-20">
                    <label className="text-[10px] text-muted-foreground block mb-1">Scale</label>
                    <div className="flex gap-0.5">
                        {([0.875, 1, 1.125] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setSizeScale(s)}
                                className={cn(
                                    'flex-1 h-6 rounded text-[9px] transition-colors',
                                    concept.typography.sizeScale === s
                                        ? 'bg-foreground text-background'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                )}
                            >
                                {s === 0.875 ? 'S' : s === 1 ? 'M' : 'L'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </Section>
    )
}

// ════════════════════════════════════════════════════════════
// UI Styling
// ════════════════════════════════════════════════════════════

const RADIUS_OPTIONS: { label: string; value: RadiusPreset }[] = [
    { label: '0', value: 0 },
    { label: '4', value: 4 },
    { label: '8', value: 8 },
    { label: '12', value: 12 },
    { label: 'Full', value: 9999 },
]

const BUTTON_STYLES: { label: string; value: ButtonStyle }[] = [
    { label: 'Solid', value: 'solid' },
    { label: 'Outline', value: 'outline' },
    { label: 'Ghost', value: 'ghost' },
    { label: 'Brick', value: 'brick' },
    { label: 'Gradient', value: 'gradient' },
]

const CARD_STYLES: { label: string; value: CardStyle }[] = [
    { label: 'Default', value: 'default' },
    { label: 'Outlined', value: 'outlined' },
    { label: 'Flat', value: 'flat' },
]

function ThemeUIStyling() {
    const concept = useStyleGuideStore(s => {
        const d = s.data
        return d.concepts.find(c => c.id === d.activeConceptId) ?? d.concepts[0]
    })
    const setButtonStyle = useStyleGuideStore(s => s.setButtonStyle)
    const setButtonRadius = useStyleGuideStore(s => s.setButtonRadius)
    const setCardStyle = useStyleGuideStore(s => s.setCardStyle)
    const setCardRadius = useStyleGuideStore(s => s.setCardRadius)
    const setImageRadius = useStyleGuideStore(s => s.setImageRadius)
    const shuffleUI = useStyleGuideStore(s => s.shuffleUI)

    return (
        <Section
            title="UI Style"
            action={
                <button
                    onClick={shuffleUI}
                    className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                    title="Shuffle UI style"
                >
                    <Shuffle className="w-3 h-3" />
                </button>
            }
        >
            {/* Button style */}
            <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Buttons</label>
                <div className="flex gap-0.5">
                    {BUTTON_STYLES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setButtonStyle(s.value)}
                            className={cn(
                                'flex-1 h-6 rounded text-[9px] transition-colors',
                                concept.ui.buttonStyle === s.value
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Button radius */}
            <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Button radius</label>
                <div className="flex gap-0.5">
                    {RADIUS_OPTIONS.map(r => (
                        <button
                            key={r.value}
                            onClick={() => setButtonRadius(r.value)}
                            className={cn(
                                'flex-1 h-6 rounded text-[9px] transition-colors',
                                concept.ui.buttonRadius === r.value
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Card style */}
            <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Cards</label>
                <div className="flex gap-0.5">
                    {CARD_STYLES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setCardStyle(s.value)}
                            className={cn(
                                'flex-1 h-6 rounded text-[9px] transition-colors',
                                concept.ui.cardStyle === s.value
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Card radius */}
            <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Card radius</label>
                <div className="flex gap-0.5">
                    {RADIUS_OPTIONS.map(r => (
                        <button
                            key={r.value}
                            onClick={() => setCardRadius(r.value)}
                            className={cn(
                                'flex-1 h-6 rounded text-[9px] transition-colors',
                                concept.ui.cardRadius === r.value
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Image radius */}
            <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Image radius</label>
                <div className="flex gap-0.5">
                    {RADIUS_OPTIONS.map(r => (
                        <button
                            key={r.value}
                            onClick={() => setImageRadius(r.value)}
                            className={cn(
                                'flex-1 h-6 rounded text-[9px] transition-colors',
                                concept.ui.imageRadius === r.value
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>
        </Section>
    )
}

// ════════════════════════════════════════════════════════════
// Theme Tab (composed)
// ════════════════════════════════════════════════════════════

export function ThemeTab() {
    return (
        <div className="h-full overflow-y-auto px-3 py-3 space-y-4">
            <ConceptSwitcher />
            <Separator />
            <ThemeColors />
            <Separator />
            <ThemeTypography />
            <Separator />
            <ThemeUIStyling />
        </div>
    )
}
