/**
 * Google Fonts loading + search utilities.
 *
 * - loadFont(): injects a <link> to fonts.googleapis.com (idempotent)
 * - searchFonts(): filters the manifest by query
 * - getFontStyles(): returns available styles for a font family
 * - getRecentFonts() / addRecentFont(): localStorage-backed recents
 */

import { FONT_MANIFEST, getFontMeta, type FontMeta } from './font-manifest'

// ── Constants ────────────────────────────────────────────────────────────────

const RECENT_FONTS_KEY = 'scytle:recentFonts'
const MAX_RECENT = 12

/** Font families that don't need loading (system/generic) */
const SYSTEM_FONTS = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'])

/** Track which fonts we've already injected a <link> for */
const _loadedFonts = new Set<string>()

/** Track fonts currently being loaded */
const _loadingFonts = new Map<string, Promise<void>>()

// ── Font Loading ─────────────────────────────────────────────────────────────

/**
 * Load a Google Font into the document by injecting a <link> element.
 * Idempotent — calling multiple times for the same font is a no-op.
 * Returns a promise that resolves when the font is available for rendering.
 */
export function loadFont(family: string): Promise<void> {
    if (SYSTEM_FONTS.has(family) || _loadedFonts.has(family)) {
        return Promise.resolve()
    }

    // Return existing promise if already in-flight
    const existing = _loadingFonts.get(family)
    if (existing) return existing

    const promise = new Promise<void>((resolve) => {
        const encoded = family.replace(/ /g, '+')
        // Use discrete weight values — works for BOTH variable and static fonts.
        // Range notation (100..900) only works for variable fonts and returns HTTP 400
        // for static fonts like Poppins, Lato, etc.
        const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@100;200;300;400;500;600;700;800;900&display=swap`

        // Check if a link already exists (from prior session or pre-loaded)
        const existingLink = document.querySelector(`link[data-font="${family}"]`) as HTMLLinkElement | null
        if (existingLink) {
            // If the existing link has a stale/broken URL, remove it and re-create
            if (!existingLink.href.includes('wght@100;200;300')) {
                existingLink.remove()
            } else {
                _loadedFonts.add(family)
                _loadingFonts.delete(family)
                resolve()
                return
            }
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        link.dataset.font = family

        link.onload = () => {
            _loadedFonts.add(family)
            _loadingFonts.delete(family)
            resolve()
        }

        link.onerror = () => {
            // Font load failed (maybe not on Google Fonts) — mark as loaded anyway
            // so we don't retry endlessly. The browser will use fallback.
            _loadedFonts.add(family)
            _loadingFonts.delete(family)
            resolve()
        }

        document.head.appendChild(link)
    })

    _loadingFonts.set(family, promise)
    return promise
}

/** Check if a font is already loaded (link injected and resolved) */
export function isFontLoaded(family: string): boolean {
    return SYSTEM_FONTS.has(family) || _loadedFonts.has(family)
}

// ── Font Search ──────────────────────────────────────────────────────────────

/**
 * Search fonts by query string. Case-insensitive prefix + substring match.
 * Returns sorted: exact prefix matches first, then substring matches.
 */
export function searchFonts(query: string, limit = 50): FontMeta[] {
    if (!query.trim()) return FONT_MANIFEST.slice(0, limit)

    const q = query.toLowerCase().trim()
    const prefixMatches: FontMeta[] = []
    const substringMatches: FontMeta[] = []

    for (const font of FONT_MANIFEST) {
        const name = font.family.toLowerCase()
        if (name.startsWith(q)) {
            prefixMatches.push(font)
        } else if (name.includes(q)) {
            substringMatches.push(font)
        }
        if (prefixMatches.length + substringMatches.length >= limit) break
    }

    return [...prefixMatches, ...substringMatches].slice(0, limit)
}

// ── Font Styles ──────────────────────────────────────────────────────────────

/**
 * Get available font styles for a family.
 * Falls back to a generic set if the font isn't in our manifest.
 */
export function getFontStyles(family: string): string[] {
    const meta = getFontMeta(family)
    if (meta) return meta.styles

    // Unknown font — return basic styles
    return ['Regular', 'Italic', 'Bold', 'Bold Italic']
}

// ── Recent Fonts (localStorage) ──────────────────────────────────────────────

export function getRecentFonts(): string[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(RECENT_FONTS_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function addRecentFont(family: string): void {
    if (typeof window === 'undefined') return
    try {
        const recent = getRecentFonts().filter((f) => f !== family)
        recent.unshift(family)
        localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
    } catch {
        // localStorage full or blocked — ignore
    }
}

/**
 * Parse a font style name into weight + italic.
 * e.g. "Bold Italic" → { fontWeight: 700, fontStyle: 'italic' }
 */
export function parseFontStyleName(name: string): { fontWeight: number; fontStyle: 'normal' | 'italic' } {
    const lower = name.toLowerCase()
    const italic = /italic/i.test(lower)
    let weight = 400

    if (/\bthin\b/.test(lower)) weight = 100
    else if (/\bultra.?light\b|\bextra.?light\b/.test(lower)) weight = 200
    else if (/\blight\b/.test(lower)) weight = 300
    else if (/\bmedium\b/.test(lower)) weight = 500
    else if (/\bsemi.?bold\b|\bdemi\b/.test(lower)) weight = 600
    else if (/\bextra.?bold\b|\bultra.?bold\b/.test(lower)) weight = 800
    else if (/\bblack\b|\bheavy\b/.test(lower)) weight = 900
    else if (/\bbold\b/.test(lower)) weight = 700

    return { fontWeight: weight, fontStyle: italic ? 'italic' : 'normal' }
}
