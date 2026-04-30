/**
 * Color conversion utilities for the fill system.
 * Internal representation: HSB (hue 0-360, saturation 0-100, brightness 0-100)
 * External representation: 6-digit hex string (without '#')
 */

// ─────────────────────────────────────────────────────────────
// Hex helpers
// ─────────────────────────────────────────────────────────────

/** Normalise any hex input to a 6-digit lowercase string without '#'.
 *  Returns 'ffffff' for invalid input. */
export function normaliseHex(raw: string): string {
    const h = raw.replace('#', '').toLowerCase()
    if (h.length === 3) {
        return h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    }
    if (/^[0-9a-f]{6}$/.test(h)) return h
    if (/^[0-9a-f]{8}$/.test(h)) return h.slice(0, 6) // strip alpha
    return 'ffffff'
}

/** Returns '#rrggbb' from a normalised 6-digit hex string */
export function hexToHashHex(hex: string): string {
    return `#${normaliseHex(hex)}`
}

// ─────────────────────────────────────────────────────────────
// Hex ↔ RGB
// ─────────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number }

export function hexToRgb(hex: string): RGB {
    const h = normaliseHex(hex)
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    }
}

export function rgbToHex(r: number, g: number, b: number): string {
    return [r, g, b]
        .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
        .join('')
}

// ─────────────────────────────────────────────────────────────
// HSB (HSV) ↔ RGB ↔ Hex
// ─────────────────────────────────────────────────────────────

export interface HSB { h: number; s: number; b: number }

/** Convert RGB (0-255) to HSB (h: 0-360, s: 0-100, b: 0-100) */
export function rgbToHsb(r: number, g: number, b: number): HSB {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min

    let h = 0
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6
        else if (max === gn) h = (bn - rn) / delta + 2
        else h = (rn - gn) / delta + 4
        h = Math.round((h * 60 + 360) % 360)
    }

    const s = max === 0 ? 0 : Math.round((delta / max) * 100)
    const bv = Math.round(max * 100)
    return { h, s, b: bv }
}

/** Convert HSB (h: 0-360, s: 0-100, b: 0-100) to RGB (0-255) */
export function hsbToRgb(h: number, s: number, b: number): RGB {
    const S = s / 100, B = b / 100
    const i = Math.floor(h / 60) % 6
    const f = h / 60 - Math.floor(h / 60)
    const p = B * (1 - S)
    const q = B * (1 - f * S)
    const t = B * (1 - (1 - f) * S)

    let r = 0, g = 0, bv = 0
    switch (i) {
        case 0: r = B; g = t; bv = p; break
        case 1: r = q; g = B; bv = p; break
        case 2: r = p; g = B; bv = t; break
        case 3: r = p; g = q; bv = B; break
        case 4: r = t; g = p; bv = B; break
        case 5: r = B; g = p; bv = q; break
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(bv * 255),
    }
}

export function hexToHsb(hex: string): HSB {
    const { r, g, b } = hexToRgb(hex)
    return rgbToHsb(r, g, b)
}

export function hsbToHex(h: number, s: number, b: number): string {
    const rgb = hsbToRgb(h, s, b)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}

// ─────────────────────────────────────────────────────────────
// HSL ↔ RGB ↔ Hex
// ─────────────────────────────────────────────────────────────

export interface HSL { h: number; s: number; l: number }

export function rgbToHsl(r: number, g: number, b: number): HSL {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    let h = 0, s = 0
    if (max !== min) {
        const delta = max - min
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
        if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6
        else if (max === gn) h = ((bn - rn) / delta + 2) / 6
        else h = ((rn - gn) / delta + 4) / 6
    }
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    }
}

function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
}

export function hslToRgb(h: number, s: number, l: number): RGB {
    const H = h / 360, S = s / 100, L = l / 100
    if (S === 0) {
        const v = Math.round(L * 255)
        return { r: v, g: v, b: v }
    }
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S
    const p = 2 * L - q
    return {
        r: Math.round(hue2rgb(p, q, H + 1 / 3) * 255),
        g: Math.round(hue2rgb(p, q, H) * 255),
        b: Math.round(hue2rgb(p, q, H - 1 / 3) * 255),
    }
}

export function hexToHsl(hex: string): HSL {
    const { r, g, b } = hexToRgb(hex)
    return rgbToHsl(r, g, b)
}

export function hslToHex(h: number, s: number, l: number): string {
    const { r, g, b } = hslToRgb(h, s, l)
    return rgbToHex(r, g, b)
}

// ─────────────────────────────────────────────────────────────
// Format display helpers
// ─────────────────────────────────────────────────────────────

export type ColorFormat = 'HEX' | 'RGB' | 'HSL' | 'HSB'

/** Get the CSS color string from hex + opacity (0-1) for rendering */
export function hexOpacityToRgba(hex: string, opacity: number): string {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r},${g},${b},${opacity})`
}

// ─────────────────────────────────────────────────────────────
// Parse flexible color input
// ─────────────────────────────────────────────────────────────

/**
 * Parse a user-typed color string.
 * Accepts: '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r,g,b)', 'rgba(r,g,b,a)', 'hsl(h,s%,l%)'
 * Returns normalised 6-digit hex (no '#') or null if invalid.
 */
export function parseColorInput(input: string): string | null {
    const v = input.trim()

    // Hex shorthand or full
    const hexMatch = v.match(/^#?([0-9a-fA-F]{3,8})$/)
    if (hexMatch) {
        const h = hexMatch[1]
        if (h.length === 3 || h.length === 6 || h.length === 8) {
            return normaliseHex(h)
        }
    }

    // rgb() or rgba()
    const rgbMatch = v.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (rgbMatch) {
        return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]))
    }

    // hsl()
    const hslMatch = v.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/)
    if (hslMatch) {
        return hslToHex(parseInt(hslMatch[1]), parseInt(hslMatch[2]), parseInt(hslMatch[3]))
    }

    return null
}

// ─────────────────────────────────────────────────────────────
// CSS blend mode mapping
// ─────────────────────────────────────────────────────────────

import type { BlendMode } from '@/types/canvas'

export function blendModeToCSS(mode: BlendMode | undefined): React.CSSProperties['mixBlendMode'] {
    const map: Record<BlendMode, React.CSSProperties['mixBlendMode']> = {
        NORMAL: 'normal',
        DARKEN: 'darken',
        MULTIPLY: 'multiply',
        PLUS_DARKER: 'darken',
        COLOR_BURN: 'color-burn',
        LIGHTEN: 'lighten',
        SCREEN: 'screen',
        PLUS_LIGHTER: 'screen',
        COLOR_DODGE: 'color-dodge',
        OVERLAY: 'overlay',
        SOFT_LIGHT: 'soft-light',
        HARD_LIGHT: 'hard-light',
        DIFFERENCE: 'difference',
        EXCLUSION: 'exclusion',
        HUE: 'hue',
        SATURATION: 'saturation',
        COLOR: 'color',
        LUMINOSITY: 'luminosity',
    }
    return map[mode ?? 'NORMAL'] ?? 'normal'
}
