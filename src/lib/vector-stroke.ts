import type { Border, ScytleNode, VectorNode } from '@/types/canvas'

const DEFAULT_VECTOR_STROKE_COLOR = '#000000'

function normalizeStrokeColor(color: string | undefined): string {
    if (!color) return DEFAULT_VECTOR_STROKE_COLOR
    return color.startsWith('#') ? color : `#${color}`
}

export function vectorStrokeAlignToBorderPosition(
    align: VectorNode['strokeAlign'],
): NonNullable<Border['position']> {
    switch (align) {
        case 'INSIDE':
            return 'inside'
        case 'OUTSIDE':
            return 'outside'
        default:
            return 'center'
    }
}

export function borderPositionToVectorStrokeAlign(
    position: Border['position'],
): VectorNode['strokeAlign'] {
    switch (position) {
        case 'inside':
            return 'INSIDE'
        case 'outside':
            return 'OUTSIDE'
        default:
            return 'CENTER'
    }
}

/**
 * Resolve the primary vector stroke layer used by single-layer inspector controls.
 * Priority: canonical `strokes[0]` -> canonical `border` -> legacy vector stroke fields.
 */
export function getPrimaryVectorStrokeBorder(node: VectorNode): Border | undefined {
    const firstCanonicalStroke = node.strokes?.[0]
    if (firstCanonicalStroke) return firstCanonicalStroke

    if (node.border) return node.border

    if (!node.strokeVisible) return undefined

    return {
        color: normalizeStrokeColor(node.strokeColor),
        width: node.strokeWeight,
        style: 'solid',
        position: vectorStrokeAlignToBorderPosition(node.strokeAlign),
        opacity: node.strokeOpacity,
        visible: true,
    }
}

export function mapVectorBorderToLegacyStrokeUpdates(
    border: Border | undefined,
): Pick<VectorNode, 'strokeVisible' | 'strokeColor' | 'strokeWeight' | 'strokeOpacity' | 'strokeAlign'> {
    if (!border) {
        return {
            strokeVisible: false,
            strokeColor: DEFAULT_VECTOR_STROKE_COLOR,
            strokeWeight: 1,
            strokeOpacity: 1,
            strokeAlign: 'CENTER',
        }
    }

    return {
        strokeVisible: border.visible !== false && border.width > 0,
        strokeColor: normalizeStrokeColor(border.color),
        strokeWeight: border.width,
        strokeOpacity: border.opacity ?? 1,
        strokeAlign: borderPositionToVectorStrokeAlign(border.position),
    }
}

export interface ResolvedVectorStroke {
    visible: boolean
    color: string
    width: number
    opacity: number
    style: Border['style']
    position: NonNullable<Border['position']>
    cap: VectorNode['strokeCap']
    join: VectorNode['strokeJoin']
}

/**
 * Resolve stroke data for vector rendering/export with canonical stroke precedence.
 */
export function resolveVectorStroke(node: VectorNode): ResolvedVectorStroke {
    const border = getPrimaryVectorStrokeBorder(node)

    if (border) {
        return {
            visible: border.visible !== false && border.width > 0,
            color: normalizeStrokeColor(border.color),
            width: border.width,
            opacity: border.opacity ?? 1,
            style: border.style,
            position: border.position ?? 'inside',
            cap: node.strokeCap,
            join: node.strokeJoin,
        }
    }

    return {
        visible: node.strokeVisible,
        color: normalizeStrokeColor(node.strokeColor),
        width: node.strokeWeight,
        opacity: node.strokeOpacity,
        style: 'solid',
        position: vectorStrokeAlignToBorderPosition(node.strokeAlign),
        cap: node.strokeCap,
        join: node.strokeJoin,
    }
}

/**
 * Normalizes shared inspector stroke updates for vectors and mirrors into
 * legacy vector stroke fields while preserving canonical border/strokes.
 */
export function withVectorStrokeCompatibility(
    node: ScytleNode,
    updates: Record<string, unknown>,
): Record<string, unknown> {
    if (node.type !== 'vector') return updates

    const hasBorderUpdate = Object.prototype.hasOwnProperty.call(updates, 'border')
    const hasStrokesUpdate = Object.prototype.hasOwnProperty.call(updates, 'strokes')
    if (!hasBorderUpdate && !hasStrokesUpdate) return updates

    const next = { ...updates }

    let canonicalBorder: Border | undefined

    if (hasStrokesUpdate && Array.isArray(next.strokes)) {
        const firstStroke = next.strokes[0]
        canonicalBorder = firstStroke && typeof firstStroke === 'object'
            ? (firstStroke as Border)
            : undefined
    }

    if (hasBorderUpdate) {
        canonicalBorder = next.border as Border | undefined
    }

    const legacy = mapVectorBorderToLegacyStrokeUpdates(canonicalBorder)

    next.border = canonicalBorder
    next.strokes = canonicalBorder ? [canonicalBorder] : []

    return {
        ...next,
        ...legacy,
    }
}