/**
 * Style Guide Store — Design Token State + Concepts
 *
 * Single source of truth for all visual decisions in the wireframe.
 * Manages color tokens, typography, UI styling, concepts, and
 * per-section color scheme overrides.
 *
 * Architecture:
 *   useStyleGuideStore
 *       → activeConcept (Concept)
 *       → computedCSS (CSSTokenMap)  ← memoized CSS custom property object
 *       → applied by <TokenProvider> to canvas wrapper div
 *
 * Pattern: Zustand + immer + subscribeWithSelector
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'

import type {
    Concept,
    StyleGuideData,
    ColorTokens,
    TypographyTokens,
    UITokens,
    ColorScheme,
    CSSTokenMap,
    AccentColor,
    HeadingWeight,
    BodyWeight,
    SizeScale,
    LetterSpacingStyle,
    ButtonStyle,
    CardStyle,
    RadiusPreset,
} from '@/lib/theme/tokens'

import {
    createDefaultStyleGuideData,
    createDefaultConcept,
    computeTokenCSS,
    computeSchemeOverrideCSS,
} from '@/lib/theme/tokens/defaults'

import {
    type ColorPalette,
    getRandomPalette,
    getRandomPaletteExcluding,
} from '@/lib/theme/tokens/palettes'

import {
    type FontPair,
    getRandomFontPair,
    getRandomFontPairExcluding,
    loadGoogleFonts,
} from '@/lib/theme/tokens/font-pairs'

import { generateId } from '@/lib/utils'

// Old variable system types - kept as stubs for backward compat during migration
type VariableTable = Record<string, { light: string; dark: string }>
type ThemeMode = 'light' | 'dark'
function conceptToVariableTable(_concept: Concept): VariableTable { return {} }

// ============================================
// Store State Interface
// ============================================

interface StyleGuideState {
    // ---- Core Data ----
    /** Full style guide data (persisted to Appwrite) */
    data: StyleGuideData

    /** Currently active palette ID (for shuffle-excluding logic) */
    activePaletteId: string | null
    /** Currently active font pair ID (for shuffle-excluding logic) */
    activeFontPairId: string | null

    // ---- Computed (derived from data) ----
    /** Memoized CSS custom property map for the active concept */
    computedCSS: CSSTokenMap
    /** Flat variable table for canvas renderer ref resolution */
    variableTable: VariableTable
    /** Current theme mode (mirrors active concept's colors.mode) */
    themeMode: ThemeMode

    // ---- Actions: Data Lifecycle ----

    /** Load style guide data (e.g. from Appwrite on project open) */
    loadData: (data: StyleGuideData) => void
    /** Reset to factory defaults */
    resetToDefaults: () => void
    /** Export current data for persistence */
    exportData: () => StyleGuideData

    // ---- Actions: Concept Management ----

    /** Get the active concept */
    getActiveConcept: () => Concept
    /** Switch to a different concept by ID */
    switchConcept: (conceptId: string) => void
    /** Create a new concept (clones the active one) */
    createConcept: (name?: string) => string
    /** Duplicate an existing concept */
    duplicateConcept: (conceptId: string) => string
    /** Delete a concept (cannot delete last one) */
    deleteConcept: (conceptId: string) => void
    /** Rename a concept */
    renameConcept: (conceptId: string, name: string) => void

    // ---- Actions: Color Tokens ----

    /** Toggle light/dark mode */
    toggleMode: () => void
    /** Set mode explicitly */
    setMode: (mode: 'light' | 'dark') => void
    /** Apply a color palette (from palette library) */
    applyPalette: (palette: ColorPalette) => void
    /** Shuffle to a random palette */
    shuffleColors: () => void
    /** Update a specific accent color */
    updateAccent: (accentId: string, updates: Partial<AccentColor>) => void
    /** Add a new accent color */
    addAccent: (name: string, hex: string) => void
    /** Remove an accent color (must keep at least 1) */
    removeAccent: (accentId: string) => void
    /** Set which accent is the main one */
    setMainAccent: (accentId: string) => void

    // ---- Actions: Typography Tokens ----

    /** Apply a font pair (from font pair library) */
    applyFontPair: (pair: FontPair) => void
    /** Shuffle to a random font pair */
    shuffleTypography: () => void
    /** Set heading font family */
    setHeadingFont: (font: string) => void
    /** Set body font family */
    setBodyFont: (font: string) => void
    /** Set heading weight */
    setHeadingWeight: (weight: HeadingWeight) => void
    /** Set body weight */
    setBodyWeight: (weight: BodyWeight) => void
    /** Set size scale */
    setSizeScale: (scale: SizeScale) => void
    /** Set letter spacing style */
    setLetterSpacingStyle: (style: LetterSpacingStyle) => void

    // ---- Actions: UI Tokens ----

    /** Set button style */
    setButtonStyle: (style: ButtonStyle) => void
    /** Set button radius */
    setButtonRadius: (radius: RadiusPreset) => void
    /** Set card style */
    setCardStyle: (style: CardStyle) => void
    /** Set card radius */
    setCardRadius: (radius: RadiusPreset) => void
    /** Set image radius */
    setImageRadius: (radius: RadiusPreset) => void
    /** Shuffle all UI styling (random button+card style+radius) */
    shuffleUI: () => void

    // ---- Actions: Variable Table Direct Edits ----

    /** Update a single variable value for a specific mode. Maps back to concept properties. */
    updateVariableValue: (key: string, mode: 'light' | 'dark', value: string) => void

    // ---- Actions: Section Scheme Overrides ----

    /** Set a section's color scheme override */
    setSectionScheme: (sectionId: string, scheme: ColorScheme | null) => void
    /** Get a section's scheme override (null = inherit global) */
    getSectionScheme: (sectionId: string) => ColorScheme | null
    /** Get computed CSS overrides for a specific section */
    getSectionSchemeCSS: (sectionId: string) => CSSTokenMap | null
    /** Shuffle a section's scheme to a random one */
    shuffleSectionScheme: (sectionId: string) => void
    /** Clear all section scheme overrides */
    clearAllSectionSchemes: () => void
}

// ============================================
// Private Helpers
// ============================================

/** Recompute computed CSS from the active concept */
function recompute(data: StyleGuideData): CSSTokenMap {
    const concept = data.concepts.find(c => c.id === data.activeConceptId)
    if (!concept) return {}
    return computeTokenCSS(concept)
}

/** Recompute variable table from the active concept */
function recomputeVariableTable(data: StyleGuideData): VariableTable {
    const concept = data.concepts.find(c => c.id === data.activeConceptId)
    if (!concept) return {}
    return conceptToVariableTable(concept)
}

/** Get the theme mode from the active concept */
function getThemeModeFromData(data: StyleGuideData): ThemeMode {
    const concept = data.concepts.find(c => c.id === data.activeConceptId)
    return concept?.colors.mode ?? 'light'
}

/** Get a random item from an array */
function randomFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
}

const BUTTON_STYLES: ButtonStyle[] = ['solid', 'outline', 'ghost', 'brick', 'gradient']
const CARD_STYLES: CardStyle[] = ['default', 'outlined', 'flat']
const RADIUS_PRESETS: RadiusPreset[] = [0, 4, 8, 12, 9999]
const SCHEMES: ColorScheme[] = ['light', 'dark', 'accent']

// ============================================
// Persistence — localStorage key per project
// ============================================

const STORAGE_KEY_PREFIX = 'scytle-sg-'

/** Get project-scoped localStorage key */
function getStorageKey(): string {
    // Try to read the project ID from the URL (/project/[id])
    if (typeof window !== 'undefined') {
        const match = window.location.pathname.match(/\/project\/([^/?]+)/)
        if (match) return `${STORAGE_KEY_PREFIX}${match[1]}`
    }
    return `${STORAGE_KEY_PREFIX}default`
}

/** Attempt to load persisted data from localStorage */
function loadPersistedData(): StyleGuideData | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(getStorageKey())
        if (!raw) return null
        return JSON.parse(raw) as StyleGuideData
    } catch {
        return null
    }
}

/** Debounced save to localStorage */
let _saveTimer: ReturnType<typeof setTimeout> | null = null
function persistData(data: StyleGuideData) {
    if (typeof window === 'undefined') return
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(data))
        } catch {
            // Storage full or not available — ignore
        }
    }, 500)
}

// ============================================
// Store
// ============================================

export const useStyleGuideStore = create<StyleGuideState>()(
    subscribeWithSelector(
        immer((set, get) => {
            // Hydrate from localStorage if available, else use defaults
            const persisted = loadPersistedData()
            const initialData = persisted ?? createDefaultStyleGuideData()

            return {
                // ---- Core Data ----
                data: initialData,
                activePaletteId: null,
                activeFontPairId: null,
                computedCSS: recompute(initialData),
                variableTable: recomputeVariableTable(initialData),
                themeMode: getThemeModeFromData(initialData),

                // ============================================
                // Data Lifecycle
                // ============================================

                loadData: (data) => set((state) => {
                    state.data = data
                    state.computedCSS = recompute(data)
                    state.variableTable = recomputeVariableTable(data)
                    state.themeMode = getThemeModeFromData(data)
                }),

                resetToDefaults: () => set((state) => {
                    const fresh = createDefaultStyleGuideData()
                    state.data = fresh
                    state.activePaletteId = null
                    state.activeFontPairId = null
                    state.computedCSS = recompute(fresh)
                    state.variableTable = recomputeVariableTable(fresh)
                    state.themeMode = getThemeModeFromData(fresh)
                }),

                exportData: () => {
                    return JSON.parse(JSON.stringify(get().data)) as StyleGuideData
                },

                // ============================================
                // Concept Management
                // ============================================

                getActiveConcept: () => {
                    const { data } = get()
                    const concept = data.concepts.find(c => c.id === data.activeConceptId)
                    return concept ?? data.concepts[0]
                },

                switchConcept: (conceptId) => set((state) => {
                    const exists = state.data.concepts.some(c => c.id === conceptId)
                    if (!exists) return
                    state.data.activeConceptId = conceptId
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                createConcept: (name) => {
                    const newId = generateId()
                    set((state) => {
                        const active = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                        if (!active) return
                        // JSON round-trip to escape immer Proxy (structuredClone fails on drafts)
                        const clone: Concept = {
                            ...JSON.parse(JSON.stringify(active)),
                            id: newId,
                            name: name ?? `Concept ${state.data.concepts.length + 1}`,
                            createdAt: new Date().toISOString(),
                        }
                        state.data.concepts.push(clone)
                        state.data.activeConceptId = newId
                        state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                    })
                    return newId
                },

                duplicateConcept: (conceptId) => {
                    const newId = generateId()
                    set((state) => {
                        const source = state.data.concepts.find(c => c.id === conceptId)
                        if (!source) return
                        // JSON round-trip to escape immer Proxy (structuredClone fails on drafts)
                        const clone: Concept = {
                            ...JSON.parse(JSON.stringify(source)),
                            id: newId,
                            name: `${source.name} (Copy)`,
                            createdAt: new Date().toISOString(),
                        }
                        state.data.concepts.push(clone)
                    })
                    return newId
                },

                deleteConcept: (conceptId) => set((state) => {
                    if (state.data.concepts.length <= 1) return // Can't delete last

                    const idx = state.data.concepts.findIndex(c => c.id === conceptId)
                    if (idx === -1) return
                    state.data.concepts.splice(idx, 1)

                    // If we deleted the active, switch to first
                    if (state.data.activeConceptId === conceptId) {
                        state.data.activeConceptId = state.data.concepts[0].id
                        state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                    }
                }),

                renameConcept: (conceptId, name) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === conceptId)
                    if (concept) concept.name = name
                }),

                // ============================================
                // Color Tokens
                // ============================================

                toggleMode: () => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    const isLight = concept.colors.mode === 'light'
                    concept.colors = {
                        ...concept.colors,
                        mode: isLight ? 'dark' : 'light',
                        bgPrimary: isLight ? '#0c0a05' : '#ffffff',
                        bgSecondary: isLight ? '#1a1917' : '#f9fafb',
                        textPrimary: isLight ? '#ffffff' : '#111827',
                        textSecondary: isLight ? '#a1a1aa' : '#6b7280',
                        textMuted: isLight ? '#71717a' : '#9ca3af',
                        border: isLight ? '#2d2b26' : '#e5e7eb',
                        borderMuted: isLight ? '#1f1d1a' : '#f3f4f6',
                    }
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setMode: (mode) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept || concept.colors.mode === mode) return
                    // Use toggleMode logic
                    const isGoingDark = mode === 'dark'
                    concept.colors = {
                        ...concept.colors,
                        mode,
                        bgPrimary: isGoingDark ? '#0c0a05' : '#ffffff',
                        bgSecondary: isGoingDark ? '#1a1917' : '#f9fafb',
                        textPrimary: isGoingDark ? '#ffffff' : '#111827',
                        textSecondary: isGoingDark ? '#a1a1aa' : '#6b7280',
                        textMuted: isGoingDark ? '#71717a' : '#9ca3af',
                        border: isGoingDark ? '#2d2b26' : '#e5e7eb',
                        borderMuted: isGoingDark ? '#1f1d1a' : '#f3f4f6',
                    }
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                applyPalette: (palette) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return

                    concept.colors.neutralBase = palette.neutralBase
                    concept.colors.accents = palette.accents.map(a => ({ ...a }))

                    // Update bg/text/border based on current mode
                    const isLight = concept.colors.mode === 'light'
                    concept.colors.bgPrimary = isLight ? '#ffffff' : '#0c0a05'
                    concept.colors.bgSecondary = isLight ? '#f9fafb' : '#1a1917'
                    concept.colors.textPrimary = isLight ? '#111827' : '#ffffff'
                    concept.colors.textSecondary = isLight ? '#6b7280' : '#a1a1aa'
                    concept.colors.textMuted = isLight ? '#9ca3af' : '#71717a'
                    concept.colors.textOnAccent = '#ffffff'
                    concept.colors.border = isLight ? '#e5e7eb' : '#2d2b26'
                    concept.colors.borderMuted = isLight ? '#f3f4f6' : '#1f1d1a'

                    state.activePaletteId = palette.id
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                shuffleColors: () => {
                    const currentId = get().activePaletteId
                    const palette = currentId
                        ? getRandomPaletteExcluding(currentId)
                        : getRandomPalette()
                    get().applyPalette(palette)
                },

                updateAccent: (accentId, updates) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    const accent = concept.colors.accents.find(a => a.id === accentId)
                    if (!accent) return
                    Object.assign(accent, updates)
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                addAccent: (name, hex) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    if (concept.colors.accents.length >= 3) return // Max 3
                    concept.colors.accents.push({
                        id: `accent-${concept.colors.accents.length + 1}`,
                        name,
                        hex,
                        isMain: false,
                    })
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                removeAccent: (accentId) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    if (concept.colors.accents.length <= 1) return // Keep at least 1
                    const idx = concept.colors.accents.findIndex(a => a.id === accentId)
                    if (idx === -1) return
                    const wasMain = concept.colors.accents[idx].isMain
                    concept.colors.accents.splice(idx, 1)
                    // If we removed the main, promote the first remaining
                    if (wasMain && concept.colors.accents.length > 0) {
                        concept.colors.accents[0].isMain = true
                    }
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setMainAccent: (accentId) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    for (const a of concept.colors.accents) {
                        a.isMain = a.id === accentId
                    }
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                // ============================================
                // Typography Tokens
                // ============================================

                applyFontPair: (pair) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.headingFont = pair.heading.family
                    concept.typography.bodyFont = pair.body.family
                    state.activeFontPairId = pair.id

                    // Load the Google Fonts
                    loadGoogleFonts(pair, concept.typography.headingWeight, concept.typography.bodyWeight)

                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                shuffleTypography: () => {
                    const currentId = get().activeFontPairId
                    const pair = currentId
                        ? getRandomFontPairExcluding(currentId)
                        : getRandomFontPair()
                    get().applyFontPair(pair)
                },

                setHeadingFont: (font) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.headingFont = font
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setBodyFont: (font) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.bodyFont = font
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setHeadingWeight: (weight) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.headingWeight = weight
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setBodyWeight: (weight) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.bodyWeight = weight
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setSizeScale: (scale) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.sizeScale = scale
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setLetterSpacingStyle: (style) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.typography.letterSpacingStyle = style
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                // ============================================
                // UI Tokens
                // ============================================

                setButtonStyle: (style) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.buttonStyle = style
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setButtonRadius: (radius) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.buttonRadius = radius
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setCardStyle: (style) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.cardStyle = style
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setCardRadius: (radius) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.cardRadius = radius
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                setImageRadius: (radius) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.imageRadius = radius
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                shuffleUI: () => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return
                    concept.ui.buttonStyle = randomFrom(BUTTON_STYLES)
                    concept.ui.buttonRadius = randomFrom(RADIUS_PRESETS)
                    concept.ui.cardStyle = randomFrom(CARD_STYLES)
                    concept.ui.cardRadius = randomFrom(RADIUS_PRESETS)
                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                // ============================================
                // Variable Table Direct Edits
                // ============================================

                updateVariableValue: (key, mode, value) => set((state) => {
                    const concept = state.data.concepts.find(c => c.id === state.data.activeConceptId)
                    if (!concept) return

                    const isCurrentMode = concept.colors.mode === mode

                    // Map variable key → concept property
                    // Only update if the variable maps to the current mode's concept values
                    // (cross-mode values are derived defaults — the concept only stores one mode)
                    if (isCurrentMode) {
                        switch (key) {
                            case 'bg/primary':     concept.colors.bgPrimary = value; break
                            case 'bg/secondary':   concept.colors.bgSecondary = value; break
                            case 'text/primary':   concept.colors.textPrimary = value; break
                            case 'text/secondary': concept.colors.textSecondary = value; break
                            case 'text/on-accent': concept.colors.textOnAccent = value; break
                            case 'border':         concept.colors.border = value; break
                            case 'accent': {
                                const main = concept.colors.accents.find(a => a.isMain)
                                if (main) main.hex = value
                                break
                            }
                            case 'font/heading':      concept.typography.headingFont = `'${value}', sans-serif`; break
                            case 'font/body':         concept.typography.bodyFont = `'${value}', sans-serif`; break
                            case 'fontWeight/heading': {
                                const w = parseInt(value, 10)
                                if ([400, 500, 600, 700, 800].includes(w)) {
                                    concept.typography.headingWeight = w as 400 | 500 | 600 | 700 | 800
                                }
                                break
                            }
                            case 'fontWeight/body': {
                                const w = parseInt(value, 10)
                                if ([300, 400, 500].includes(w)) {
                                    concept.typography.bodyWeight = w as 300 | 400 | 500
                                }
                                break
                            }
                            // Radius, spacing, fontSize, shadows — these are derived from concept settings
                            // and not directly editable at the variable level in v1.
                            // They could be supported later by adding concept-level overrides.
                            default: break
                        }
                    }

                    state.computedCSS = recompute(state.data)
                    state.variableTable = recomputeVariableTable(state.data)
                    state.themeMode = getThemeModeFromData(state.data)
                }),

                // ============================================
                // Section Scheme Overrides
                // ============================================

                setSectionScheme: (sectionId, scheme) => set((state) => {
                    if (scheme === null) {
                        delete state.data.sectionSchemeOverrides[sectionId]
                    } else {
                        state.data.sectionSchemeOverrides[sectionId] = scheme
                    }
                }),

                getSectionScheme: (sectionId) => {
                    return get().data.sectionSchemeOverrides[sectionId] ?? null
                },

                getSectionSchemeCSS: (sectionId) => {
                    const scheme = get().data.sectionSchemeOverrides[sectionId]
                    if (!scheme) return null
                    const concept = get().getActiveConcept()
                    return computeSchemeOverrideCSS(scheme, concept)
                },

                shuffleSectionScheme: (sectionId) => set((state) => {
                    const current = state.data.sectionSchemeOverrides[sectionId] ?? null
                    const options = SCHEMES.filter(s => s !== current)
                    // Include null (inherit global) as an option
                    const allOptions = [...options, null] as (ColorScheme | null)[]
                    const picked = randomFrom(allOptions)
                    if (picked === null) {
                        delete state.data.sectionSchemeOverrides[sectionId]
                    } else {
                        state.data.sectionSchemeOverrides[sectionId] = picked
                    }
                }),

                clearAllSectionSchemes: () => set((state) => {
                    state.data.sectionSchemeOverrides = {}
                }),
            }
        })
    )
)

// ============================================
// Auto-persist: subscribe to data changes → localStorage
// ============================================

if (typeof window !== 'undefined') {
    useStyleGuideStore.subscribe(
        (state) => state.data,
        (data) => {
            persistData(data)
        }
    )
}
