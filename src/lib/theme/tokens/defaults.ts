/**
 * V2 Design Token System — Default Values
 *
 * Light and dark mode defaults. These are the "factory" settings
 * used when creating a new concept. They provide a clean, neutral
 * wireframe aesthetic (gray-scale + one blue accent).
 *
 * Sections can override scheme per-section to get dark/accent/light
 * via the `sectionSchemeOverrides` map in the store.
 */

import type {
    ColorTokens,
    TypographyTokens,
    UITokens,
    Concept,
    StyleGuideData,
    CSSTokenMap,
    ColorScheme,
} from './index'

// ============================================
// Default Color Tokens
// ============================================

export const DEFAULT_COLORS_LIGHT: ColorTokens = {
    mode: 'light',

    // Backgrounds
    bgPrimary: '#ffffff',
    bgSecondary: '#f9fafb',

    // Text
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    textOnAccent: '#ffffff',
    textOnDark: '#ffffff',

    // Borders
    border: '#e5e7eb',
    borderMuted: '#f3f4f6',

    // Neutrals
    neutralBase: '#6b7280',

    // Accents — one default blue
    accents: [
        { id: 'accent-1', name: 'Indigo', hex: '#4f46e5', isMain: true },
    ],
}

export const DEFAULT_COLORS_DARK: ColorTokens = {
    mode: 'dark',

    // Backgrounds
    bgPrimary: '#0c0a05',
    bgSecondary: '#1a1917',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    textOnAccent: '#ffffff',
    textOnDark: '#ffffff',

    // Borders
    border: '#2d2b26',
    borderMuted: '#1f1d1a',

    // Neutrals
    neutralBase: '#71717a',

    // Accents — same blue
    accents: [
        { id: 'accent-1', name: 'Indigo', hex: '#6366f1', isMain: true },
    ],
}

// ============================================
// Default Typography Tokens
// ============================================

export const DEFAULT_TYPOGRAPHY: TypographyTokens = {
    headingFont: "'Raleway', sans-serif",
    bodyFont: "'Inter', sans-serif",
    headingWeight: 500,
    bodyWeight: 400,
    sizeScale: 1,
    letterSpacingStyle: 'default',
}

// ============================================
// Default UI Tokens
// ============================================

export const DEFAULT_UI: UITokens = {
    buttonStyle: 'solid',
    buttonRadius: 8,
    cardStyle: 'default',
    cardRadius: 8,
    imageRadius: 0,
}

// ============================================
// Default Concept
// ============================================

export function createDefaultConcept(id = 'concept-1', name = 'Default'): Concept {
    return {
        id,
        name,
        colors: { ...DEFAULT_COLORS_LIGHT },
        typography: { ...DEFAULT_TYPOGRAPHY },
        ui: { ...DEFAULT_UI },
        createdAt: new Date().toISOString(),
    }
}

// ============================================
// Default StyleGuideData
// ============================================

export function createDefaultStyleGuideData(): StyleGuideData {
    const defaultConcept = createDefaultConcept()
    return {
        activeConceptId: defaultConcept.id,
        concepts: [defaultConcept],
        sectionSchemeOverrides: {},
    }
}

// ============================================
// Token Computation — Convert Store State to CSS Variables
// ============================================

/** Map letter-spacing style to CSS value */
function letterSpacingValue(style: TypographyTokens['letterSpacingStyle']): string {
    switch (style) {
        case 'tight': return '-0.04em'
        case 'wide': return '0.05em'
        default: return '-0.02em'
    }
}

/** Get the main accent color from accent array (first with isMain, or fallback to first) */
export function getMainAccent(colors: ColorTokens): string {
    const main = colors.accents.find(a => a.isMain)
    return main?.hex ?? colors.accents[0]?.hex ?? '#4f46e5'
}

/**
 * Compute CSS custom property map from a concept.
 *
 * This is the core function that bridges the Zustand store → CSS variables.
 * The returned object is applied as `style` on the TokenProvider wrapper div.
 */
export function computeTokenCSS(concept: Concept): CSSTokenMap {
    const { colors, typography, ui } = concept
    const accent = getMainAccent(colors)

    // Derive button colors from mode + accent
    const isLight = colors.mode === 'light'

    return {
        // ===== COLORS =====

        // Backgrounds
        '--sg-bg-primary': colors.bgPrimary,
        '--sg-bg-secondary': colors.bgSecondary,
        '--sg-bg-accent': accent,
        '--sg-bg-dark': isLight ? '#0c0a05' : colors.bgPrimary,

        // Text
        '--sg-text-primary': colors.textPrimary,
        '--sg-text-secondary': colors.textSecondary,
        '--sg-text-muted': colors.textMuted,
        '--sg-text-on-accent': colors.textOnAccent,
        '--sg-text-on-dark': colors.textOnDark,

        // Borders
        '--sg-border': colors.border,
        '--sg-border-muted': colors.borderMuted,

        // Buttons — primary uses accent in both light and dark modes
        '--sg-button-primary-bg': accent,
        '--sg-button-primary-text': '#ffffff',
        '--sg-button-secondary-bg': 'transparent',
        '--sg-button-secondary-text': isLight ? '#374151' : '#d1d5db',
        '--sg-button-secondary-border': colors.border,

        // Cards
        '--sg-card-bg': isLight ? '#ffffff' : '#1a1917',
        '--sg-card-border': colors.border,

        // ===== TYPOGRAPHY =====

        '--sg-font-heading': typography.headingFont,
        '--sg-font-body': typography.bodyFont,
        '--sg-heading-weight': String(typography.headingWeight),
        '--sg-body-weight': String(typography.bodyWeight),
        '--sg-heading-letter-spacing': letterSpacingValue(typography.letterSpacingStyle),

        // Size scale
        '--sg-size-scale': String(typography.sizeScale),

        // Computed heading sizes (base × scale)
        '--sg-h1-size': `calc(3.75rem * ${typography.sizeScale})`,
        '--sg-h2-size': `calc(3rem * ${typography.sizeScale})`,
        '--sg-h3-size': `calc(2.25rem * ${typography.sizeScale})`,
        '--sg-h4-size': `calc(1.875rem * ${typography.sizeScale})`,
        '--sg-h5-size': `calc(1.5rem * ${typography.sizeScale})`,
        '--sg-h6-size': `calc(1.25rem * ${typography.sizeScale})`,

        // Body sizes (not affected by heading scale)
        '--sg-body-size': '1rem',
        '--sg-body-large-size': '1.125rem',
        '--sg-caption-size': '0.875rem',

        // ===== UI STYLING =====

        '--sg-radius': `${ui.buttonRadius}px`,
        '--sg-button-radius': `${ui.buttonRadius}px`,
        '--sg-card-radius': `${ui.cardRadius}px`,
        '--sg-image-radius': `${ui.imageRadius}px`,
        '--sg-button-style': ui.buttonStyle,
        '--sg-card-style': ui.cardStyle,

        // ===== SCHEME =====
        '--sg-scheme': colors.mode,
    }
}

// ============================================
// Wireframe-Mode Neutral Token Map
// ============================================

/**
 * Hardcoded grayscale CSS token map for wireframe mode.
 * Overrides the active concept tokens so the canvas looks like
 * a neutral wireframe — white bg, dark text, gray borders, no accent.
 */
export const WIREFRAME_NEUTRAL_CSS: CSSTokenMap = {
    // Backgrounds
    '--sg-bg-primary': '#ffffff',
    '--sg-bg-secondary': '#f9fafb',
    '--sg-bg-accent': '#e5e7eb',
    '--sg-bg-dark': '#111827',

    // Text
    '--sg-text-primary': '#111827',
    '--sg-text-secondary': '#6b7280',
    '--sg-text-muted': '#9ca3af',
    '--sg-text-on-accent': '#ffffff',
    '--sg-text-on-dark': '#ffffff',

    // Borders
    '--sg-border': '#e5e7eb',
    '--sg-border-muted': '#f3f4f6',

    // Buttons — all neutral gray, no accent
    '--sg-button-primary-bg': '#111827',
    '--sg-button-primary-text': '#ffffff',
    '--sg-button-secondary-bg': 'transparent',
    '--sg-button-secondary-text': '#374151',
    '--sg-button-secondary-border': '#d1d5db',

    // Cards
    '--sg-card-bg': '#ffffff',
    '--sg-card-border': '#e5e7eb',

    // Typography — Raleway headings + Inter body (from Figma Relume kit)
    '--sg-font-heading': "'Raleway', sans-serif",
    '--sg-font-body': "'Inter', sans-serif",
    '--sg-heading-weight': '500',
    '--sg-body-weight': '400',
    '--sg-heading-letter-spacing': '-0.01em',

    '--sg-size-scale': '1',
    '--sg-h1-size': '4.5rem',
    '--sg-h2-size': '3.25rem',
    '--sg-h3-size': '2.75rem',
    '--sg-h4-size': '2.25rem',
    '--sg-h5-size': '1.75rem',
    '--sg-h6-size': '1.375rem',
    '--sg-body-size': '1rem',
    '--sg-body-large-size': '1.125rem',
    '--sg-caption-size': '0.875rem',

    // UI Styling — neutral defaults
    '--sg-radius': '8px',
    '--sg-button-radius': '8px',
    '--sg-card-radius': '12px',
    '--sg-image-radius': '8px',
    '--sg-button-style': 'filled',
    '--sg-card-style': 'outlined',

    // Scheme
    '--sg-scheme': 'light',
}

/**
 * Compute CSS custom property overrides for a specific color scheme.
 *
 * When a section has a scheme override (dark/accent), these tokens
 * override the global ones on that section's wrapper div.
 */
export function computeSchemeOverrideCSS(
    scheme: ColorScheme,
    concept: Concept,
): CSSTokenMap {
    const accent = getMainAccent(concept.colors)

    switch (scheme) {
        case 'dark':
            return {
                '--sg-bg-primary': '#0c0a05',
                '--sg-bg-secondary': '#1a1917',
                '--sg-text-primary': '#ffffff',
                '--sg-text-secondary': '#a1a1aa',
                '--sg-text-muted': '#71717a',
                '--sg-border': '#2d2b26',
                '--sg-border-muted': '#1f1d1a',
                '--sg-card-bg': '#1a1917',
                '--sg-card-border': '#2d2b26',
                '--sg-button-primary-bg': accent,
                '--sg-button-primary-text': '#ffffff',
                '--sg-button-secondary-text': '#d1d5db',
                '--sg-button-secondary-border': '#2d2b26',
                '--sg-scheme': 'dark',
            }

        case 'accent':
            return {
                '--sg-bg-primary': accent,
                '--sg-bg-secondary': accent,
                '--sg-text-primary': '#ffffff',
                '--sg-text-secondary': 'rgba(255,255,255,0.8)',
                '--sg-text-muted': 'rgba(255,255,255,0.6)',
                '--sg-border': 'rgba(255,255,255,0.2)',
                '--sg-border-muted': 'rgba(255,255,255,0.1)',
                '--sg-card-bg': 'rgba(255,255,255,0.1)',
                '--sg-card-border': 'rgba(255,255,255,0.2)',
                '--sg-button-primary-bg': '#ffffff',
                '--sg-button-primary-text': accent,
                '--sg-button-secondary-text': '#ffffff',
                '--sg-button-secondary-border': 'rgba(255,255,255,0.3)',
                '--sg-scheme': 'accent',
            }

        case 'light':
        default:
            return {
                '--sg-bg-primary': '#ffffff',
                '--sg-bg-secondary': '#f9fafb',
                '--sg-text-primary': '#111827',
                '--sg-text-secondary': '#6b7280',
                '--sg-text-muted': '#9ca3af',
                '--sg-border': '#e5e7eb',
                '--sg-border-muted': '#f3f4f6',
                '--sg-card-bg': '#ffffff',
                '--sg-card-border': '#e5e7eb',
                '--sg-button-primary-bg': accent,
                '--sg-button-primary-text': '#ffffff',
                '--sg-button-secondary-text': '#374151',
                '--sg-button-secondary-border': '#d1d5db',
                '--sg-scheme': 'light',
            }
    }
}
