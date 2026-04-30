/**
 * V2 Design Token System — Type Definitions
 *
 * All visual decisions flow through these tokens.
 * Components reference tokens via CSS custom properties (--sg-*),
 * never hardcoded colors, fonts, or radii.
 *
 * Architecture:
 *   useStyleGuideStore (Zustand)
 *       → computed CSS property object
 *       → applied via <TokenProvider> wrapper div
 *       → every block reads via var(--sg-*)
 */

// ============================================
// Color Tokens
// ============================================

/**
 * A single named accent color.
 * Projects typically have 1–3 accents; the first with `isMain: true`
 * is promoted to primary brand color.
 */
export interface AccentColor {
    /** Unique id within the palette (e.g. 'accent-1') */
    id: string
    /** Human-readable name (e.g. "Curious Blue") */
    name: string
    /** Hex value (e.g. "#1E88E5") */
    hex: string
    /** Is this the primary brand accent? */
    isMain: boolean
}

/**
 * Full color configuration for one mode (light OR dark).
 */
export interface ColorTokens {
    /** Global mode */
    mode: 'light' | 'dark'

    // ---- Backgrounds ----
    /** Main page background (#ffffff light, #0c0a05 dark) */
    bgPrimary: string
    /** Alternate section bg (#f9fafb light, #1a1917 dark) */
    bgSecondary: string

    // ---- Text ----
    /** Headings, main text (#111827 light, #ffffff dark) */
    textPrimary: string
    /** Body, descriptions (#6b7280 light, #a1a1aa dark) */
    textSecondary: string
    /** Captions, meta (#9ca3af light, #71717a dark) */
    textMuted: string
    /** Text on accent bg */
    textOnAccent: string
    /** Text on dark bg */
    textOnDark: string

    // ---- Borders ----
    /** Default border (#e5e7eb light, #2d2b26 dark) */
    border: string
    /** Subtle dividers (#f3f4f6 light, #1f1d1a dark) */
    borderMuted: string

    // ---- Neutrals ----
    /** Base neutral gray from which the scale is derived */
    neutralBase: string

    // ---- Accents ----
    /** 1-3 accent colors; at least one with isMain: true */
    accents: AccentColor[]
}

// ============================================
// Typography Tokens
// ============================================

/** Supported heading weight values */
export type HeadingWeight = 400 | 500 | 600 | 700 | 800

/** Supported body weight values */
export type BodyWeight = 300 | 400 | 500

/** Size scale multiplier — affects all heading sizes proportionally */
export type SizeScale = 0.875 | 1 | 1.125

/** Letter spacing style presets */
export type LetterSpacingStyle = 'default' | 'tight' | 'wide'

/**
 * Typography configuration.
 */
export interface TypographyTokens {
    /** Heading font family (e.g. "'Raleway', sans-serif") */
    headingFont: string
    /** Body font family (e.g. "'Inter', sans-serif") */
    bodyFont: string
    /** Heading weight (400–800) */
    headingWeight: HeadingWeight
    /** Body weight (300–500) */
    bodyWeight: BodyWeight
    /** Size scale multiplier */
    sizeScale: SizeScale
    /** Letter spacing style */
    letterSpacingStyle: LetterSpacingStyle
}

// ============================================
// UI Styling Tokens
// ============================================

/** Button style keyword — determines ButtonBlock visual treatment */
export type ButtonStyle = 'solid' | 'outline' | 'ghost' | 'brick' | 'gradient'

/** Card style keyword — determines CardBlock visual treatment */
export type CardStyle = 'default' | 'outlined' | 'flat'

/** Radius preset in pixels (0 = sharp, 9999 = pill) */
export type RadiusPreset = 0 | 4 | 8 | 12 | 9999

/**
 * UI styling configuration for buttons, cards, and images.
 */
export interface UITokens {
    /** Button visual style */
    buttonStyle: ButtonStyle
    /** Button corner radius in px */
    buttonRadius: RadiusPreset
    /** Card visual style */
    cardStyle: CardStyle
    /** Card corner radius in px */
    cardRadius: RadiusPreset
    /** Image corner radius in px */
    imageRadius: RadiusPreset
}

// ============================================
// Color Scheme (per-section override)
// ============================================

/**
 * Color scheme applied at section level.
 * - `light`: uses light-mode tokens
 * - `dark`: uses dark-mode tokens (inverted bg/text)
 * - `accent`: uses accent color as background
 * - `null`: inherits global scheme
 */
export type ColorScheme = 'light' | 'dark' | 'accent'

// ============================================
// Concept — Complete Style Snapshot
// ============================================

/**
 * A Concept is a complete snapshot of the style guide.
 * Users can create multiple concepts and switch between them
 * to see the same wireframe with different visual treatments.
 */
export interface Concept {
    /** Unique ID */
    id: string
    /** Display name ("Concept 1", "Bold Modern", etc.) */
    name: string
    /** Full color configuration */
    colors: ColorTokens
    /** Full typography configuration */
    typography: TypographyTokens
    /** Full UI styling configuration */
    ui: UITokens
    /** When this concept was created */
    createdAt: string
}

// ============================================
// Style Guide Data — Full Project Configuration
// ============================================

/**
 * Complete style guide state for a project.
 * Persisted to Appwrite STYLE_GUIDES collection.
 */
export interface StyleGuideData {
    /** Which concept is currently active */
    activeConceptId: string
    /** All concepts (usually 1–3) */
    concepts: Concept[]
    /** Per-section color scheme overrides. key = sectionId, value = scheme */
    sectionSchemeOverrides: Record<string, ColorScheme>
}

// ============================================
// Computed CSS Custom Property Map
// ============================================

/**
 * The computed CSS custom property object applied to the canvas wrapper.
 * Keys are CSS property names (e.g. '--sg-bg-primary'), values are CSS values.
 */
export type CSSTokenMap = Record<string, string>

// ============================================
// Token Utility Types
// ============================================

/** All token CSS variable names (for type safety when referencing) */
export type TokenCSSVar =
    // Backgrounds
    | '--sg-bg-primary'
    | '--sg-bg-secondary'
    | '--sg-bg-accent'
    | '--sg-bg-dark'
    // Text
    | '--sg-text-primary'
    | '--sg-text-secondary'
    | '--sg-text-muted'
    | '--sg-text-on-accent'
    | '--sg-text-on-dark'
    // Borders
    | '--sg-border'
    | '--sg-border-muted'
    // Buttons
    | '--sg-button-primary-bg'
    | '--sg-button-primary-text'
    | '--sg-button-secondary-bg'
    | '--sg-button-secondary-text'
    | '--sg-button-secondary-border'
    // Cards
    | '--sg-card-bg'
    | '--sg-card-border'
    // Typography
    | '--sg-font-heading'
    | '--sg-font-body'
    | '--sg-heading-weight'
    | '--sg-body-weight'
    | '--sg-heading-letter-spacing'
    | '--sg-size-scale'
    | '--sg-h1-size'
    | '--sg-h2-size'
    | '--sg-h3-size'
    | '--sg-h4-size'
    | '--sg-h5-size'
    | '--sg-h6-size'
    | '--sg-body-size'
    | '--sg-body-large-size'
    | '--sg-caption-size'
    // UI Styling
    | '--sg-radius'
    | '--sg-card-radius'
    | '--sg-button-radius'
    | '--sg-image-radius'
    | '--sg-button-style'
    | '--sg-card-style'
    // Scheme
    | '--sg-scheme'

// ============================================
// Section Design Props (Design Mode)
// ============================================

/** How images are used in this section template */
export type ImageRole = 'inline' | 'background' | 'none'

/** Background type for sections that support it */
export type BackgroundType = 'none' | 'image' | 'video'

/** Asset type for sections with media slots */
export type AssetType = 'image' | 'video'

/** 9-point position grid */
export type ImagePosition =
    | 'top-left' | 'top-center' | 'top-right'
    | 'center-left' | 'center' | 'center-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Image shape */
export type ImageShape = 'rectangle' | 'rounded'

/**
 * Per-section design configuration.
 * Only populated when user uploads images or tweaks design controls.
 * null/undefined = use section template defaults.
 */
export interface SectionDesignProps {
    /** Background type (for CTA-type sections that support bg images) */
    backgroundType?: BackgroundType
    /** Asset type (for split-layout sections: image vs video) */
    assetType?: AssetType

    /** Section background image */
    backgroundImage?: {
        /** Image URL (Appwrite storage or external) */
        url: string
        /** Object position */
        position: ImagePosition
        /** Dark overlay toggle */
        overlay: boolean
        /** Overlay opacity (0–1) */
        overlayOpacity?: number
    }

    /** Inline image configuration (for split-image layouts) */
    inlineImage?: {
        /** Image URL */
        url: string
        /** Aspect ratio */
        ratio: 'auto' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4'
        /** Object position */
        position: ImagePosition
        /** Object fit */
        fillMode: 'cover' | 'contain'
        /** Width constraint */
        width?: 'full' | '3/4' | '2/3' | '1/2' | '1/3'
        /** Shape */
        shape: ImageShape
        /** Overlay */
        overlay: boolean
        /** Foreground tint */
        foreground: 'color' | 'none'
    }

    /** Video configuration */
    video?: {
        /** Video URL (YouTube, Vimeo, or direct mp4) */
        url: string
        /** Poster/thumbnail image URL */
        posterUrl?: string
        /** Autoplay */
        autoplay?: boolean
        /** Loop */
        loop?: boolean
        /** Muted (required for autoplay) */
        muted?: boolean
    }
}
