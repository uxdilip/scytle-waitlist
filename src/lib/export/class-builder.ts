// ============================================================
// ScytleNode Properties → Tailwind CSS Classes
// Reverse of class-parser.ts — converts node properties back
// to Tailwind utility classes for HTML export.
// ============================================================

import type {
    FrameNode, TextNode, ImageNode,
    Fill, Border, Shadow, Padding, Layout, BorderRadius,
} from '@/types/canvas'
import { buildReverseColorMap } from '@/lib/parser/color-map'
import { getTextColorHexForExport } from '@/lib/text-paint'

// ---- Reverse Lookup Maps ----

const SPACING_MAP: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5',
    12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8',
    36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20',
    96: '24', 112: '28', 128: '32', 144: '36', 160: '40', 176: '44',
    192: '48', 208: '52', 224: '56', 240: '60', 256: '64', 288: '72',
    320: '80', 384: '96',
}

const FONT_SIZE_MAP: Record<number, string> = {
    12: 'text-xs', 14: 'text-sm', 16: 'text-base', 18: 'text-lg', 20: 'text-xl',
    24: 'text-2xl', 30: 'text-3xl', 36: 'text-4xl', 48: 'text-5xl', 60: 'text-6xl',
    72: 'text-7xl', 96: 'text-8xl', 128: 'text-9xl',
}

const FONT_WEIGHT_MAP: Record<number, string> = {
    100: 'font-thin', 200: 'font-extralight', 300: 'font-light', 400: 'font-normal',
    500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black',
}

const BORDER_RADIUS_MAP: Record<number, string> = {
    0: '', 2: 'rounded-sm', 4: 'rounded', 6: 'rounded-md', 8: 'rounded-lg',
    12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl', 9999: 'rounded-full',
}

const LINE_HEIGHT_MAP: Record<number, string> = {
    1: 'leading-none', 1.25: 'leading-tight', 1.375: 'leading-snug',
    1.5: 'leading-normal', 1.625: 'leading-relaxed', 2: 'leading-loose',
}

// Lazy-initialized reverse color map
let reverseColors: Record<string, string> | null = null
function getReverseColorMap(): Record<string, string> {
    if (!reverseColors) reverseColors = buildReverseColorMap()
    return reverseColors
}

// ---- Public API ----

/** Build Tailwind classes for a FrameNode */
export function buildFrameClasses(node: FrameNode): string {
    const c: string[] = []

    // Width / height — emit explicit size classes for fixed-dimension frames.
    // Without these, the browser auto-sizes the element differently from the canvas,
    // causing child elements (especially icons/buttons) to shift position.
    if (node.sizing.horizontal === 'fixed' && node.width) {
        c.push(sizeToClass('w', node.width))
    } else if (node.sizing.horizontal === 'fill') {
        c.push('w-full')
    }
    if (node.sizing.vertical === 'fixed' && node.height) {
        c.push(sizeToClass('h', node.height))
    }

    // Layout
    buildLayoutClasses(node.layout, c)

    // Padding
    buildPaddingClasses(node.padding, c)

    // Background fills
    if (node.fills.length > 0) {
        c.push(fillToClass(node.fills[0]))
    }

    // Border
    if (node.border) {
        buildBorderClasses(node.border, c)
    }

    // Border radius
    const rc = borderRadiusToClass(node.borderRadius)
    if (rc) c.push(rc)

    // Overflow
    if (node.overflow === 'hidden') c.push('overflow-hidden')

    // Opacity
    if (node.opacity < 1) c.push(`opacity-${Math.round(node.opacity * 100)}`)

    // Shadows
    for (const shadow of node.shadows) {
        const sc = shadowToClass(shadow)
        if (sc) c.push(sc)
    }

    return c.filter(Boolean).join(' ')
}

/** Build Tailwind classes for a TextNode */
export function buildTextClasses(node: TextNode): string {
    const c: string[] = []

    // Font size
    c.push(fontSizeToClass(node.fontSize))

    // Font weight (skip 'normal' since it's default)
    if (node.fontWeight !== 400) {
        c.push(FONT_WEIGHT_MAP[node.fontWeight] || `font-[${node.fontWeight}]`)
    }

    // Text align (skip 'left' since it's default)
    if (node.textAlign !== 'left') c.push(`text-${node.textAlign}`)

    // Text transform
    if (node.textTransform !== 'none') c.push(node.textTransform)

    // Text decoration
    if (node.textDecoration === 'underline') c.push('underline')
    else if (node.textDecoration === 'line-through') c.push('line-through')

    // Letter spacing
    if (node.letterSpacing !== 0) {
        const lsClass = letterSpacingToClass(node.letterSpacing)
        if (lsClass) c.push(lsClass)
    }

    // Line height
    if (typeof node.lineHeight === 'number') {
        const lhClass = lineHeightToClass(node.lineHeight)
        if (lhClass) c.push(lhClass)
    }

    // White-space — must match the canvas TextRenderer behaviour:
    // 'width-and-height' (Figma "Auto width") = single line, no wrap
    // 'height' / 'none' = wraps inside fixed width
    if (node.autoResize === 'width-and-height') {
        c.push('whitespace-nowrap')
    }

    // Text color
    const textColorHex = getTextColorHexForExport(node)
    if (textColorHex) {
        c.push(colorToTextClass(textColorHex))
    }

    return c.filter(Boolean).join(' ')
}

/** Build Tailwind classes for an ImageNode */
export function buildImageClasses(node: ImageNode): string {
    const c: string[] = []

    // Width/height as explicit classes if fixed
    if (node.sizing.horizontal === 'fixed' && node.width) {
        c.push(sizeToClass('w', node.width))
    } else if (node.sizing.horizontal === 'fill') {
        c.push('w-full')
    }

    if (node.sizing.vertical === 'fixed' && node.height) {
        c.push(sizeToClass('h', node.height))
    }

    // Object fit
    if (node.fit === 'cover') c.push('object-cover')
    else if (node.fit === 'contain') c.push('object-contain')

    // Border radius
    const rc = borderRadiusToClass(node.borderRadius)
    if (rc) c.push(rc)

    return c.filter(Boolean).join(' ')
}

// ---- Internal Converters ----

function buildLayoutClasses(layout: Layout, c: string[]): void {
    if (layout.mode === 'flex') {
        c.push('flex')
        if (layout.direction === 'column') c.push('flex-col')
        if (layout.justify && layout.justify !== 'start') c.push(`justify-${layout.justify}`)
        if (layout.align && layout.align !== 'stretch') c.push(`items-${layout.align}`)
        if (layout.wrap) c.push('flex-wrap')
        if (layout.gap) c.push(`gap-${pxToSpacing(layout.gap)}`)
    } else if (layout.mode === 'grid') {
        c.push('grid')
        if (layout.columns && layout.columns !== 1) c.push(`grid-cols-${layout.columns}`)
        if (layout.gap) c.push(`gap-${pxToSpacing(layout.gap)}`)
    }
}

function buildPaddingClasses(padding: Padding, c: string[]): void {
    const { top, right, bottom, left } = padding
    if (top === 0 && right === 0 && bottom === 0 && left === 0) return

    // All sides equal
    if (top === right && right === bottom && bottom === left) {
        c.push(`p-${pxToSpacing(top)}`)
        return
    }

    // X and Y pairs
    const xEqual = left === right
    const yEqual = top === bottom

    if (xEqual && yEqual) {
        if (top > 0) c.push(`py-${pxToSpacing(top)}`)
        if (left > 0) c.push(`px-${pxToSpacing(left)}`)
        return
    }

    // Individual sides
    if (top > 0) c.push(`pt-${pxToSpacing(top)}`)
    if (right > 0) c.push(`pr-${pxToSpacing(right)}`)
    if (bottom > 0) c.push(`pb-${pxToSpacing(bottom)}`)
    if (left > 0) c.push(`pl-${pxToSpacing(left)}`)
}

function buildBorderClasses(border: Border, c: string[]): void {
    if (border.width === 1) c.push('border')
    else if (border.width > 0) c.push(`border-${border.width}`)

    if (border.style !== 'solid') c.push(`border-${border.style}`)

    const colorName = hexToColorName(border.color)
    if (colorName && colorName !== 'gray-200') {
        c.push(`border-${colorName}`)
    }
}

function fillToClass(fill: Fill): string {
    if (fill.type === 'solid') {
        const name = hexToColorName(fill.color)
        return name ? `bg-${name}` : `bg-[${fill.color}]`
    }
    if (fill.type === 'gradient') {
        // Can't reverse a full CSS gradient to Tailwind classes easily;
        // use arbitrary value as fallback
        return `bg-[${fill.gradient}]`
    }
    return ''
}

function borderRadiusToClass(radius: BorderRadius): string {
    if (typeof radius === 'number') {
        return BORDER_RADIUS_MAP[radius] ?? (radius > 0 ? `rounded-[${radius}px]` : '')
    }
    // Per-corner radius
    const { topLeft, topRight, bottomRight, bottomLeft } = radius
    if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
        return BORDER_RADIUS_MAP[topLeft] ?? (topLeft > 0 ? `rounded-[${topLeft}px]` : '')
    }
    // Mixed: just use arbitrary
    return `rounded-[${topLeft}px_${topRight}px_${bottomRight}px_${bottomLeft}px]`
}

function shadowToClass(shadow: Shadow): string {
    // Match against known Tailwind shadows
    if (shadow.y === 1 && shadow.blur === 2 && shadow.spread === 0) return 'shadow-sm'
    if (shadow.y === 1 && shadow.blur === 3) return 'shadow'
    if (shadow.y === 4 && shadow.blur === 6) return 'shadow-md'
    if (shadow.y === 10 && shadow.blur === 15) return 'shadow-lg'
    if (shadow.y === 20 && shadow.blur === 25) return 'shadow-xl'
    if (shadow.y === 25 && shadow.blur === 50) return 'shadow-2xl'
    if (shadow.type === 'inner') return 'shadow-inner'
    return 'shadow'
}

function fontSizeToClass(px: number): string {
    return FONT_SIZE_MAP[px] || `text-[${px}px]`
}

function colorToTextClass(hex: string): string {
    const name = hexToColorName(hex)
    return name ? `text-${name}` : `text-[${hex}]`
}

function letterSpacingToClass(em: number): string {
    if (em <= -0.05) return 'tracking-tighter'
    if (em <= -0.025) return 'tracking-tight'
    if (em === 0) return ''
    if (em <= 0.025) return 'tracking-wide'
    if (em <= 0.05) return 'tracking-wider'
    return 'tracking-widest'
}

function lineHeightToClass(lh: number): string {
    return LINE_HEIGHT_MAP[lh] || ''
}

function pxToSpacing(px: number): string {
    return SPACING_MAP[px] || `[${px}px]`
}

function sizeToClass(prefix: 'w' | 'h', px: number): string {
    const spacing = SPACING_MAP[px]
    return spacing ? `${prefix}-${spacing}` : `${prefix}-[${px}px]`
}

function hexToColorName(hex: string): string | null {
    if (!hex) return null
    const map = getReverseColorMap()
    return map[hex.toLowerCase()] || null
}
