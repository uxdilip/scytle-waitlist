/**
 * CIELAB Color Distance — perceptual color matching
 *
 * Replaces RGB Euclidean distance with CIE76 ΔE* which closely matches
 * how humans perceive color differences.
 *
 * Pipeline: hex → sRGB → linear RGB → XYZ (D65) → CIELAB → ΔE
 *
 * Reference thresholds:
 *   ΔE < 1    — not perceptible
 *   ΔE < 2.3  — just noticeable difference (JND)
 *   ΔE < 5    — barely distinguishable
 *   ΔE < 15   — same hue family
 *   ΔE > 30   — clearly different colors
 */

// D65 reference white point
const D65_X = 0.95047
const D65_Y = 1.00000
const D65_Z = 1.08883

/** Parse hex string to [r, g, b] in 0-255 range */
function hexToRgb(hex: string): [number, number, number] {
    let h = hex.replace('#', '').trim()
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return [
        parseInt(h.slice(0, 2), 16) || 0,
        parseInt(h.slice(2, 4), 16) || 0,
        parseInt(h.slice(4, 6), 16) || 0,
    ]
}

/** sRGB gamma → linear RGB */
function srgbToLinear(c: number): number {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Linear RGB → CIE XYZ (D65 illuminant) */
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
    const lr = srgbToLinear(r)
    const lg = srgbToLinear(g)
    const lb = srgbToLinear(b)

    // sRGB → XYZ matrix (IEC 61966-2-1)
    return [
        lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
        lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750,
        lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041,
    ]
}

/** XYZ → CIELAB f(t) transfer function */
function labF(t: number): number {
    const delta = 6 / 29
    return t > delta ** 3
        ? Math.cbrt(t)
        : t / (3 * delta * delta) + 4 / 29
}

/** Convert hex color to CIELAB [L*, a*, b*] */
export function hexToLab(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb(hex)
    const [x, y, z] = rgbToXyz(r, g, b)

    const fx = labF(x / D65_X)
    const fy = labF(y / D65_Y)
    const fz = labF(z / D65_Z)

    const L = 116 * fy - 16
    const a = 500 * (fx - fy)
    const bStar = 200 * (fy - fz)

    return [L, a, bStar]
}

/**
 * CIE76 color difference (ΔE*ab).
 * Returns a perceptual distance — lower = more similar.
 */
export function deltaE(hex1: string, hex2: string): number {
    const [L1, a1, b1] = hexToLab(hex1)
    const [L2, a2, b2] = hexToLab(hex2)
    return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}
