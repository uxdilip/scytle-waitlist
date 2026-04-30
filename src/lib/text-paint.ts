import type { CSSProperties } from 'react'
import type { Fill, SolidFill, TextNode } from '@/types/canvas'
import { hexOpacityToRgba, normaliseHex } from '@/lib/color-utils'

type TextPaintSource = Pick<TextNode, 'fills' | 'color'>

const TRANSPARENT_PAINT = 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))'

interface ParsedLegacyColor {
    hex: string
    opacity: number
}

function parseLegacyTextColor(rawColor: string | undefined): ParsedLegacyColor {
    if (!rawColor) {
        return { hex: '#000000', opacity: 1 }
    }

    const raw = rawColor.trim().toLowerCase()
    if (raw === 'transparent') {
        return { hex: '#000000', opacity: 0 }
    }

    const stripped = raw.replace(/^#/, '')

    if (/^[0-9a-f]{8}$/.test(stripped)) {
        const hex = `#${stripped.slice(0, 6)}`
        const alpha = parseInt(stripped.slice(6, 8), 16) / 255
        return { hex, opacity: Number.isFinite(alpha) ? alpha : 1 }
    }

    if (/^[0-9a-f]{4}$/.test(stripped)) {
        const r = stripped[0] + stripped[0]
        const g = stripped[1] + stripped[1]
        const b = stripped[2] + stripped[2]
        const a = stripped[3] + stripped[3]
        const hex = `#${r}${g}${b}`
        const alpha = parseInt(a, 16) / 255
        return { hex, opacity: Number.isFinite(alpha) ? alpha : 1 }
    }

    if (/^[0-9a-f]{6}$/.test(stripped) || /^[0-9a-f]{3}$/.test(stripped)) {
        return { hex: `#${normaliseHex(stripped)}`, opacity: 1 }
    }

    return { hex: '#000000', opacity: 1 }
}

export function buildTextSolidFillFromColor(rawColor?: string): SolidFill {
    const parsed = parseLegacyTextColor(rawColor)
    return {
        type: 'solid',
        color: parsed.hex,
        opacity: parsed.opacity,
        visible: true,
        blendMode: 'NORMAL',
    }
}

export function getResolvedTextPaints(source: TextPaintSource): Fill[] {
    if (source.fills?.length) {
        return source.fills
    }
    return [buildTextSolidFillFromColor(source.color)]
}

export function getTextPreviewColor(source: TextPaintSource): string {
    const visible = getResolvedTextPaints(source).filter((fill) => fill.visible !== false)
    const primary = visible[0]

    if (!primary) {
        return '#000000'
    }

    if (primary.type === 'solid') {
        return hexOpacityToRgba(normaliseHex(primary.color), primary.opacity ?? 1)
    }

    if (primary.type === 'gradient' && primary.stops?.length) {
        const stop = primary.stops[0]
        return hexOpacityToRgba(normaliseHex(stop.color), (stop.opacity ?? 1) * (primary.opacity ?? 1))
    }

    return '#000000'
}

function gradientToCss(fill: Extract<Fill, { type: 'gradient' }>): string {
    if ((!fill.stops || fill.stops.length < 2) && fill.gradient) {
        return fill.gradient
    }

    const stops = (fill.stops ?? []).map((stop) => {
        const alpha = (stop.opacity ?? 1) * (fill.opacity ?? 1)
        return `${hexOpacityToRgba(normaliseHex(stop.color), alpha)} ${stop.position * 100}%`
    })

    if (stops.length < 2) {
        return TRANSPARENT_PAINT
    }

    const angle = fill.angle ?? 90
    const gradientType = fill.gradientType ?? 'linear'

    switch (gradientType) {
        case 'radial':
            return `radial-gradient(circle at center, ${stops.join(', ')})`
        case 'angular':
            return `conic-gradient(from ${angle}deg at center, ${stops.join(', ')})`
        case 'diamond':
            // Approximation: CSS has no direct diamond gradient primitive.
            return `radial-gradient(circle at center, ${stops.join(', ')})`
        case 'linear':
        default:
            return `linear-gradient(${angle}deg, ${stops.join(', ')})`
    }
}

function imageSizeForFit(fit: Extract<Fill, { type: 'image' }>['fit']): string {
    switch (fit) {
        case 'contain':
            return 'contain'
        case 'fill':
            return '100% 100%'
        case 'tile':
            return 'auto'
        case 'crop':
            return 'cover'
        case 'cover':
        default:
            return 'cover'
    }
}

export function getTextPaintStyle(source: TextPaintSource): CSSProperties {
    const resolved = getResolvedTextPaints(source)
    const visible = resolved.filter((fill) => fill.visible !== false)

    if (visible.length === 0) {
        if (resolved.length > 0) {
            return {
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
            }
        }
        return { color: '#000000' }
    }

    if (visible.length === 1 && visible[0].type === 'solid') {
        return {
            color: hexOpacityToRgba(normaliseHex(visible[0].color), visible[0].opacity ?? 1),
            WebkitTextFillColor: undefined,
            backgroundImage: undefined,
            backgroundClip: undefined,
            WebkitBackgroundClip: undefined,
            backgroundSize: undefined,
            backgroundPosition: undefined,
            backgroundRepeat: undefined,
        }
    }

    const images: string[] = []
    const sizes: string[] = []
    const positions: string[] = []
    const repeats: string[] = []

    for (const fill of visible) {
        switch (fill.type) {
            case 'solid': {
                const color = hexOpacityToRgba(normaliseHex(fill.color), fill.opacity ?? 1)
                images.push(`linear-gradient(${color}, ${color})`)
                sizes.push('100% 100%')
                positions.push('0 0')
                repeats.push('no-repeat')
                break
            }
            case 'gradient': {
                images.push(gradientToCss(fill))
                sizes.push('100% 100%')
                positions.push('0 0')
                repeats.push('no-repeat')
                break
            }
            case 'image': {
                images.push(fill.src ? `url(${fill.src})` : TRANSPARENT_PAINT)
                sizes.push(imageSizeForFit(fill.fit))
                positions.push('center')
                repeats.push(fill.fit === 'tile' ? 'repeat' : 'no-repeat')
                break
            }
        }
    }

    return {
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        backgroundImage: images.join(', '),
        backgroundSize: sizes.join(', '),
        backgroundPosition: positions.join(', '),
        backgroundRepeat: repeats.join(', '),
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
    }
}

export function getTextColorHexForExport(source: TextPaintSource): string | null {
    const visible = getResolvedTextPaints(source).filter((fill) => fill.visible !== false)
    const first = visible[0]

    if (!first) {
        return parseLegacyTextColor(source.color).hex
    }

    if (first.type === 'solid') {
        return `#${normaliseHex(first.color)}`
    }

    return null
}
