/**
 * V2 Design Token System — Curated Font Pair Library
 *
 * ~80 heading + body font pairs from Google Fonts.
 * When a pair is selected, the fonts are loaded dynamically
 * via <link> injection into <head>.
 *
 * Categories help users browse:
 * - modern: Clean sans-serif combos for tech/SaaS
 * - classic: Serif headings with clean body text
 * - creative: Distinctive display fonts for portfolio/agency
 * - minimal: Ultra-clean, geometric sans-serif
 * - editorial: Magazine/blog-style typographic combos
 */

// ============================================
// Font Pair Interface
// ============================================

export interface FontPair {
    /** Unique pair ID */
    id: string
    /** Human-readable name */
    name: string
    /** Category for browsing */
    category: FontPairCategory
    /** Heading font */
    heading: FontInfo
    /** Body font */
    body: FontInfo
}

export interface FontInfo {
    /** CSS font-family value (e.g. "'Inter', sans-serif") */
    family: string
    /** Google Font name for URL loading (e.g. "Inter") */
    googleName: string
    /** Font source */
    source: 'google' | 'system'
    /** Is this a free font? */
    free: boolean
    /** CSS generic fallback */
    fallback: 'sans-serif' | 'serif' | 'monospace' | 'cursive'
}

export type FontPairCategory =
    | 'modern'
    | 'classic'
    | 'creative'
    | 'minimal'
    | 'editorial'

// ============================================
// Helper
// ============================================

function googleFont(
    googleName: string,
    fallback: FontInfo['fallback'] = 'sans-serif',
): FontInfo {
    return {
        family: `'${googleName}', ${fallback}`,
        googleName,
        source: 'google',
        free: true,
        fallback,
    }
}

// ============================================
// Font Pair Library
// ============================================

export const FONT_PAIRS: FontPair[] = [
    // ──────────────────── MODERN ────────────────────
    {
        id: 'inter-inter',
        name: 'Inter + Inter',
        category: 'modern',
        heading: googleFont('Inter'),
        body: googleFont('Inter'),
    },
    {
        id: 'plus-jakarta-inter',
        name: 'Plus Jakarta + Inter',
        category: 'modern',
        heading: googleFont('Plus Jakarta Sans'),
        body: googleFont('Inter'),
    },
    {
        id: 'manrope-inter',
        name: 'Manrope + Inter',
        category: 'modern',
        heading: googleFont('Manrope'),
        body: googleFont('Inter'),
    },
    {
        id: 'outfit-inter',
        name: 'Outfit + Inter',
        category: 'modern',
        heading: googleFont('Outfit'),
        body: googleFont('Inter'),
    },
    {
        id: 'sora-dm-sans',
        name: 'Sora + DM Sans',
        category: 'modern',
        heading: googleFont('Sora'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'cabinet-grotesk-inter',
        name: 'Space Grotesk + Inter',
        category: 'modern',
        heading: googleFont('Space Grotesk'),
        body: googleFont('Inter'),
    },
    {
        id: 'urbanist-dm-sans',
        name: 'Urbanist + DM Sans',
        category: 'modern',
        heading: googleFont('Urbanist'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'figtree-inter',
        name: 'Figtree + Inter',
        category: 'modern',
        heading: googleFont('Figtree'),
        body: googleFont('Inter'),
    },
    {
        id: 'geist-geist',
        name: 'Geist + Geist',
        category: 'modern',
        heading: googleFont('Geist'),
        body: googleFont('Geist'),
    },
    {
        id: 'lexend-inter',
        name: 'Lexend + Inter',
        category: 'modern',
        heading: googleFont('Lexend'),
        body: googleFont('Inter'),
    },
    {
        id: 'rubik-inter',
        name: 'Rubik + Inter',
        category: 'modern',
        heading: googleFont('Rubik'),
        body: googleFont('Inter'),
    },
    {
        id: 'red-hat-display-text',
        name: 'Red Hat Display + Text',
        category: 'modern',
        heading: googleFont('Red Hat Display'),
        body: googleFont('Red Hat Text'),
    },
    {
        id: 'nunito-sans-inter',
        name: 'Nunito Sans + Inter',
        category: 'modern',
        heading: googleFont('Nunito Sans'),
        body: googleFont('Inter'),
    },
    {
        id: 'poppins-dm-sans',
        name: 'Poppins + DM Sans',
        category: 'modern',
        heading: googleFont('Poppins'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'albert-sans-inter',
        name: 'Albert Sans + Inter',
        category: 'modern',
        heading: googleFont('Albert Sans'),
        body: googleFont('Inter'),
    },
    {
        id: 'be-vietnam-inter',
        name: 'Be Vietnam Pro + Inter',
        category: 'modern',
        heading: googleFont('Be Vietnam Pro'),
        body: googleFont('Inter'),
    },

    // ──────────────────── CLASSIC ────────────────────
    {
        id: 'playfair-source-sans',
        name: 'Playfair + Source Sans',
        category: 'classic',
        heading: googleFont('Playfair Display', 'serif'),
        body: googleFont('Source Sans 3'),
    },
    {
        id: 'lora-inter',
        name: 'Lora + Inter',
        category: 'classic',
        heading: googleFont('Lora', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'fraunces-inter',
        name: 'Fraunces + Inter',
        category: 'classic',
        heading: googleFont('Fraunces', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'dm-serif-display-dm-sans',
        name: 'DM Serif Display + DM Sans',
        category: 'classic',
        heading: googleFont('DM Serif Display', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'crimson-pro-inter',
        name: 'Crimson Pro + Inter',
        category: 'classic',
        heading: googleFont('Crimson Pro', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'libre-baskerville-inter',
        name: 'Libre Baskerville + Inter',
        category: 'classic',
        heading: googleFont('Libre Baskerville', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'cormorant-dm-sans',
        name: 'Cormorant + DM Sans',
        category: 'classic',
        heading: googleFont('Cormorant Garamond', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'merriweather-source-sans',
        name: 'Merriweather + Source Sans',
        category: 'classic',
        heading: googleFont('Merriweather', 'serif'),
        body: googleFont('Source Sans 3'),
    },
    {
        id: 'noto-serif-noto-sans',
        name: 'Noto Serif + Noto Sans',
        category: 'classic',
        heading: googleFont('Noto Serif', 'serif'),
        body: googleFont('Noto Sans'),
    },
    {
        id: 'bitter-inter',
        name: 'Bitter + Inter',
        category: 'classic',
        heading: googleFont('Bitter', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'eb-garamond-inter',
        name: 'EB Garamond + Inter',
        category: 'classic',
        heading: googleFont('EB Garamond', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'spectral-dm-sans',
        name: 'Spectral + DM Sans',
        category: 'classic',
        heading: googleFont('Spectral', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'georgia-system',
        name: 'Literata + Inter',
        category: 'classic',
        heading: googleFont('Literata', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'source-serif-inter',
        name: 'Source Serif + Inter',
        category: 'classic',
        heading: googleFont('Source Serif 4', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'old-standard-inter',
        name: 'Old Standard TT + Inter',
        category: 'classic',
        heading: googleFont('Old Standard TT', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'cardo-dm-sans',
        name: 'Cardo + DM Sans',
        category: 'classic',
        heading: googleFont('Cardo', 'serif'),
        body: googleFont('DM Sans'),
    },

    // ──────────────────── CREATIVE ────────────────────
    {
        id: 'bricolage-inter',
        name: 'Bricolage + Inter',
        category: 'creative',
        heading: googleFont('Bricolage Grotesque'),
        body: googleFont('Inter'),
    },
    {
        id: 'clash-display-satoshi',
        name: 'Syne + DM Sans',
        category: 'creative',
        heading: googleFont('Syne'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'unbounded-inter',
        name: 'Unbounded + Inter',
        category: 'creative',
        heading: googleFont('Unbounded'),
        body: googleFont('Inter'),
    },
    {
        id: 'archivo-black-inter',
        name: 'Archivo Black + Inter',
        category: 'creative',
        heading: googleFont('Archivo Black'),
        body: googleFont('Inter'),
    },
    {
        id: 'space-mono-inter',
        name: 'Space Mono + Inter',
        category: 'creative',
        heading: googleFont('Space Mono', 'monospace'),
        body: googleFont('Inter'),
    },
    {
        id: 'bebas-neue-inter',
        name: 'Bebas Neue + Inter',
        category: 'creative',
        heading: googleFont('Bebas Neue'),
        body: googleFont('Inter'),
    },
    {
        id: 'righteous-dm-sans',
        name: 'Righteous + DM Sans',
        category: 'creative',
        heading: googleFont('Righteous'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'josefin-sans-open-sans',
        name: 'Josefin Sans + Open Sans',
        category: 'creative',
        heading: googleFont('Josefin Sans'),
        body: googleFont('Open Sans'),
    },
    {
        id: 'dm-serif-text-dm-sans',
        name: 'DM Serif Text + DM Sans',
        category: 'creative',
        heading: googleFont('DM Serif Text', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'instrument-serif-inter',
        name: 'Instrument Serif + Inter',
        category: 'creative',
        heading: googleFont('Instrument Serif', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'monoton-inter',
        name: 'Monoton + Inter',
        category: 'creative',
        heading: googleFont('Monoton', 'cursive'),
        body: googleFont('Inter'),
    },
    {
        id: 'major-mono-inter',
        name: 'Major Mono + Inter',
        category: 'creative',
        heading: googleFont('Major Mono Display', 'monospace'),
        body: googleFont('Inter'),
    },
    {
        id: 'bowlby-one-inter',
        name: 'Bowlby One + Inter',
        category: 'creative',
        heading: googleFont('Bowlby One'),
        body: googleFont('Inter'),
    },
    {
        id: 'raleway-inter',
        name: 'Raleway + Inter',
        category: 'modern',
        heading: googleFont('Raleway'),
        body: googleFont('Inter'),
    },
    {
        id: 'raleway-open-sans',
        name: 'Raleway + Open Sans',
        category: 'creative',
        heading: googleFont('Raleway'),
        body: googleFont('Open Sans'),
    },
    {
        id: 'oswald-dm-sans',
        name: 'Oswald + DM Sans',
        category: 'creative',
        heading: googleFont('Oswald'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'anton-inter',
        name: 'Anton + Inter',
        category: 'creative',
        heading: googleFont('Anton'),
        body: googleFont('Inter'),
    },

    // ──────────────────── MINIMAL ────────────────────
    {
        id: 'dm-sans-dm-sans',
        name: 'DM Sans + DM Sans',
        category: 'minimal',
        heading: googleFont('DM Sans'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'work-sans-work-sans',
        name: 'Work Sans + Work Sans',
        category: 'minimal',
        heading: googleFont('Work Sans'),
        body: googleFont('Work Sans'),
    },
    {
        id: 'lato-lato',
        name: 'Lato + Lato',
        category: 'minimal',
        heading: googleFont('Lato'),
        body: googleFont('Lato'),
    },
    {
        id: 'libre-franklin-franklin',
        name: 'Libre Franklin',
        category: 'minimal',
        heading: googleFont('Libre Franklin'),
        body: googleFont('Libre Franklin'),
    },
    {
        id: 'karla-karla',
        name: 'Karla + Karla',
        category: 'minimal',
        heading: googleFont('Karla'),
        body: googleFont('Karla'),
    },
    {
        id: 'jost-jost',
        name: 'Jost + Jost',
        category: 'minimal',
        heading: googleFont('Jost'),
        body: googleFont('Jost'),
    },
    {
        id: 'public-sans-public-sans',
        name: 'Public Sans',
        category: 'minimal',
        heading: googleFont('Public Sans'),
        body: googleFont('Public Sans'),
    },
    {
        id: 'outfit-outfit',
        name: 'Outfit + Outfit',
        category: 'minimal',
        heading: googleFont('Outfit'),
        body: googleFont('Outfit'),
    },
    {
        id: 'general-sans-inter',
        name: 'General Sans + Inter',
        category: 'minimal',
        heading: googleFont('General Sans'),
        body: googleFont('Inter'),
    },
    {
        id: 'ibm-plex-sans-plex',
        name: 'IBM Plex Sans',
        category: 'minimal',
        heading: googleFont('IBM Plex Sans'),
        body: googleFont('IBM Plex Sans'),
    },

    // ──────────────────── EDITORIAL ────────────────────
    {
        id: 'playfair-lora',
        name: 'Playfair + Lora',
        category: 'editorial',
        heading: googleFont('Playfair Display', 'serif'),
        body: googleFont('Lora', 'serif'),
    },
    {
        id: 'fraunces-outfit',
        name: 'Fraunces + Outfit',
        category: 'editorial',
        heading: googleFont('Fraunces', 'serif'),
        body: googleFont('Outfit'),
    },
    {
        id: 'young-serif-inter',
        name: 'Young Serif + Inter',
        category: 'editorial',
        heading: googleFont('Young Serif', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'newsreader-inter',
        name: 'Newsreader + Inter',
        category: 'editorial',
        heading: googleFont('Newsreader', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'instrument-serif-dm-sans',
        name: 'Instrument Serif + DM Sans',
        category: 'editorial',
        heading: googleFont('Instrument Serif', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'cormorant-lato',
        name: 'Cormorant + Lato',
        category: 'editorial',
        heading: googleFont('Cormorant Garamond', 'serif'),
        body: googleFont('Lato'),
    },
    {
        id: 'vollkorn-open-sans',
        name: 'Vollkorn + Open Sans',
        category: 'editorial',
        heading: googleFont('Vollkorn', 'serif'),
        body: googleFont('Open Sans'),
    },
    {
        id: 'gelasio-inter',
        name: 'Gelasio + Inter',
        category: 'editorial',
        heading: googleFont('Gelasio', 'serif'),
        body: googleFont('Inter'),
    },
    {
        id: 'crimson-text-dm-sans',
        name: 'Crimson Text + DM Sans',
        category: 'editorial',
        heading: googleFont('Crimson Text', 'serif'),
        body: googleFont('DM Sans'),
    },
    {
        id: 'alegreya-inter',
        name: 'Alegreya + Inter',
        category: 'editorial',
        heading: googleFont('Alegreya', 'serif'),
        body: googleFont('Inter'),
    },
]

// ============================================
// Font Pair Utilities
// ============================================

/** Get font pairs by category */
export function getFontPairsByCategory(category: FontPairCategory): FontPair[] {
    return FONT_PAIRS.filter(p => p.category === category)
}

/** Get a random font pair */
export function getRandomFontPair(): FontPair {
    return FONT_PAIRS[Math.floor(Math.random() * FONT_PAIRS.length)]
}

/** Get a random font pair excluding the current one */
export function getRandomFontPairExcluding(currentId: string): FontPair {
    const filtered = FONT_PAIRS.filter(p => p.id !== currentId)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

/** Find font pair by ID */
export function getFontPairById(id: string): FontPair | undefined {
    return FONT_PAIRS.find(p => p.id === id)
}

/**
 * Build a Google Fonts <link> URL for a font pair.
 * Loads only the weights we need (heading weight + body weight).
 *
 * @example
 * buildGoogleFontsUrl(pair, 700, 400)
 * → "https://fonts.googleapis.com/css2?family=Raleway:wght@700&family=Inter:wght@400&display=swap"
 */
export function buildGoogleFontsUrl(
    pair: FontPair,
    headingWeight = 700,
    bodyWeight = 400,
): string {
    const families: string[] = []

    if (pair.heading.source === 'google') {
        const name = pair.heading.googleName.replace(/ /g, '+')
        families.push(`family=${name}:wght@${headingWeight}`)
    }
    if (pair.body.source === 'google' && pair.body.googleName !== pair.heading.googleName) {
        const name = pair.body.googleName.replace(/ /g, '+')
        families.push(`family=${name}:wght@${bodyWeight}`)
    }

    if (families.length === 0) return ''
    return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

/**
 * Inject a Google Fonts <link> into the document <head>.
 * Idempotent — skips if already loaded.
 * Returns the <link> element (or existing one).
 */
export function loadGoogleFonts(pair: FontPair, headingWeight = 700, bodyWeight = 400): HTMLLinkElement | null {
    if (typeof document === 'undefined') return null

    const url = buildGoogleFontsUrl(pair, headingWeight, bodyWeight)
    if (!url) return null

    // Check if already loaded
    const existing = document.querySelector(`link[href="${url}"]`)
    if (existing) return existing as HTMLLinkElement

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
    return link
}

/** All font pair categories with labels */
export const FONT_PAIR_CATEGORIES: { id: FontPairCategory; label: string }[] = [
    { id: 'modern', label: 'Modern' },
    { id: 'classic', label: 'Classic' },
    { id: 'creative', label: 'Creative' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'editorial', label: 'Editorial' },
]
