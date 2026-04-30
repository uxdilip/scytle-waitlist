import type { CSSProperties } from 'react'
import type {
    ScytleNode,
    FrameNode,
    Fill,
    ImageFill,
    Shadow,
    Border,
    NodeEffect,
    BorderRadius,
    Padding,
    GridTrack,
} from '@/types/canvas'
import { blendModeToCSS, hexOpacityToRgba, normaliseHex } from '@/lib/color-utils'
import { isAutoGapLayout } from './layout-gap-utils'

// ============================================================
// CSS Value Mappings
// ============================================================

const JUSTIFY_MAP: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
}

const ALIGN_MAP: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    stretch: 'stretch',
    baseline: 'baseline',
}

// ============================================================
// Individual Property Computations
// ============================================================

/** Convert a hex color + opacity to rgba() string */
function hexToRgba(hex: string, opacity: number): string {
    const h = hex.replace('#', '').slice(0, 6).padEnd(6, '0')
    const r = parseInt(h.slice(0, 2), 16) || 0
    const g = parseInt(h.slice(2, 4), 16) || 0
    const b = parseInt(h.slice(4, 6), 16) || 0
    return `rgba(${r},${g},${b},${opacity})`
}

/** Build background CSS from a fills array.
 *  Supports multiple fills, per-fill opacity, and visibility.
 *  First fill in array = topmost visual layer (CSS background shorthand
 *  renders first background on top). */
function computeBackground(fills: Fill[]): CSSProperties {
    const visible = fills.filter((f) => f.visible !== false)
    if (visible.length === 0) return {}

    // Single solid fill fast path — no layering needed
    if (visible.length === 1 && visible[0].type === 'solid') {
        const fill = visible[0]
        return { backgroundColor: hexToRgba(fill.color, fill.opacity ?? 1) }
    }

    const images: string[] = []
    const sizes: string[] = []
    const positions: string[] = []
    const repeats: string[] = []

    for (const fill of visible) {
        const opacity = fill.opacity ?? 1
        switch (fill.type) {
            case 'solid': {
                // Express as degenerate gradient so it works in backgroundImage
                // (plain colors are not valid backgroundImage values in multi-layer context)
                const color = hexToRgba(fill.color, opacity)
                images.push(`linear-gradient(${color}, ${color})`)
                sizes.push('100% 100%')
                positions.push('0 0')
                repeats.push('no-repeat')
                break
            }
            case 'gradient': {
                if (fill.gradient) {
                    // Legacy CSS gradient string
                    images.push(fill.gradient)
                } else if (fill.stops && fill.stops.length >= 2) {
                    const type = fill.gradientType ?? 'linear'
                    const angle = fill.angle ?? 90
                    const stops = fill.stops
                        .map((s) => `${hexToRgba(s.color, s.opacity ?? 1)} ${s.position * 100}%`)
                        .join(', ')
                    if (type === 'linear') images.push(`linear-gradient(${angle}deg, ${stops})`)
                    else if (type === 'radial') images.push(`radial-gradient(circle, ${stops})`)
                    else if (type === 'angular') images.push(`conic-gradient(${stops})`)
                    else images.push(`radial-gradient(circle, ${stops})`) // diamond fallback
                } else {
                    images.push('none')
                }
                sizes.push('100% 100%')
                positions.push('0 0')
                repeats.push('no-repeat')
                break
            }
            case 'image': {
                if (fill.src) {
                    // Per-layer opacity: overlay a translucent white layer on top
                    // (CSS background-image doesn't support native per-layer alpha)
                    if (opacity < 1) {
                        const fadeColor = `rgba(255,255,255,${1 - opacity})`
                        images.push(`linear-gradient(${fadeColor}, ${fadeColor})`)
                        sizes.push('100% 100%')
                        positions.push('0 0')
                        repeats.push('no-repeat')
                    }
                    images.push(`url(${fill.src})`)
                    const fit = fill.fit ?? 'cover'
                    if (fit === 'tile') {
                        sizes.push('auto')
                        positions.push('0 0')
                        repeats.push('repeat')
                    } else if (fit === 'fill') {
                        sizes.push('100% 100%')
                        positions.push('center')
                        repeats.push('no-repeat')
                    } else if (fit === 'crop') {
                        const cropZoom = fill.cropZoom ?? 1
                        // cover × zoom: at zoom=1 it's just cover; zoom>1 scales up
                        sizes.push(cropZoom <= 1 ? 'cover' : `${cropZoom * 100}%`)
                        positions.push(`${fill.cropX ?? 50}% ${fill.cropY ?? 50}%`)
                        repeats.push('no-repeat')
                    } else {
                        // 'cover' | 'contain'
                        sizes.push(fit)
                        positions.push('center')
                        repeats.push('no-repeat')
                    }
                } else {
                    images.push('none')
                    sizes.push('auto')
                    positions.push('0 0')
                    repeats.push('no-repeat')
                }
                break
            }
        }
    }

    if (images.length === 0) return {}

    // Use only longhand properties — never mix `background` shorthand with longhands
    // (React warns about conflicting shorthand/longhand background properties)
    return {
        backgroundImage: images.join(', '),
        backgroundSize: sizes.join(', '),
        backgroundPosition: positions.join(', '),
        backgroundRepeat: repeats.join(', '),
    }
}

/** Build CSS filter from image fill adjustments.
 *  Adjustments are -100 to +100 where 0 = no change.
 *  Returns a filter string, or undefined if no adjustments. */
function computeImageFillFilter(fill: ImageFill): string | undefined {
    const parts: string[] = []
    const { exposure = 0, contrast = 0, saturation = 0, temperature = 0 } = fill
    if (exposure !== 0) parts.push(`brightness(${1 + exposure / 100})`)
    if (contrast !== 0) parts.push(`contrast(${1 + contrast / 100})`)
    if (saturation !== 0) parts.push(`saturate(${1 + saturation / 100})`)
    // Temperature: warm (+) shifts hue toward orange/yellow (−30deg), cool (−) toward blue (+30deg)
    if (temperature !== 0) parts.push(`hue-rotate(${-(temperature * 0.3)}deg)`)
    return parts.length > 0 ? parts.join(' ') : undefined
}

/** Build CSS box-shadow from shadows array, scaled via CSS custom property */
function computeBoxShadow(shadows: Shadow[]): string | undefined {
    const visible = shadows.filter((s) => s.visible !== false)
    if (visible.length === 0) return undefined
    return visible
        .map((s) => {
            const inset = s.type === 'inner' ? 'inset ' : ''
            return `${inset}calc(${s.x}px * var(--z, 1)) calc(${s.y}px * var(--z, 1)) calc(${s.blur}px * var(--z, 1)) calc(${s.spread}px * var(--z, 1)) ${s.color}`
        })
        .join(', ')
}

/** Resolve canonical `effects` array with legacy fallback to `shadows` and blur fields. */
function resolveNodeEffects(node: ScytleNode): NodeEffect[] {
    if (node.effects && node.effects.length > 0) return node.effects

    const effects: NodeEffect[] = node.shadows.map((shadow) => ({
        type: shadow.type === 'drop' ? 'drop-shadow' : 'inner-shadow',
        color: shadow.color,
        x: shadow.x,
        y: shadow.y,
        blur: shadow.blur,
        spread: shadow.spread,
        visible: shadow.visible,
        blendMode: shadow.blendMode,
    }))

    if (node.layerBlur && node.layerBlur > 0) {
        effects.push({ type: 'layer-blur', radius: node.layerBlur, visible: true })
    }
    if (node.backgroundBlur && node.backgroundBlur > 0) {
        effects.push({ type: 'background-blur', radius: node.backgroundBlur, visible: true })
    }

    return effects
}

/** Build CSS box-shadow from canonical effect entries. */
function computeEffectShadows(effects: NodeEffect[]): string | undefined {
    const shadowEffects = effects.filter(
        (effect): effect is Extract<NodeEffect, { type: 'drop-shadow' | 'inner-shadow' }> =>
            (effect.type === 'drop-shadow' || effect.type === 'inner-shadow') && effect.visible !== false,
    )
    if (shadowEffects.length === 0) return undefined

    return shadowEffects
        .map((effect) => {
            const inset = effect.type === 'inner-shadow' ? 'inset ' : ''
            return `${inset}calc(${effect.x}px * var(--z, 1)) calc(${effect.y}px * var(--z, 1)) calc(${effect.blur}px * var(--z, 1)) calc(${effect.spread}px * var(--z, 1)) ${effect.color}`
        })
        .join(', ')
}

/** Extract first visible blur radius by type from canonical effect entries. */
function getBlurRadius(effects: NodeEffect[], blurType: 'layer-blur' | 'background-blur'): number {
    const blur = effects.find((effect) => effect.type === blurType && effect.visible !== false)
    if (!blur || blur.type !== blurType) return 0
    return blur.radius > 0 ? blur.radius : 0
}

/** Resolve canonical multi-stroke layers with legacy `border` fallback. */
function resolveStrokeLayers(node: ScytleNode): Border[] {
    const visibleStrokeLayers = (node.strokes ?? []).filter((stroke) => stroke.visible !== false && stroke.width > 0)
    if (visibleStrokeLayers.length > 0) return visibleStrokeLayers
    if (node.border && node.border.visible !== false && node.border.width > 0) return [node.border]
    return []
}

/** Non-solid stroke rendering path (dashed/dotted) — CSS can represent one effective layer only. */
function computeNonSolidStroke(strokes: Border[]): CSSProperties {
    const firstNonSolid = strokes.find((stroke) => stroke.style !== 'solid')
    return computeBorder(firstNonSolid)
}

/** Build box-shadow string from a solid border with inside/center/outside position support.
 *  Uses box-shadow exclusively so it never affects layout (unlike CSS border).
 *  Only applicable for solid borders — dashed/dotted fall back to CSS border.
 *  Supports per-side borders via the `sides` property. */
function computeBorderAsShadow(border: Border): string | undefined {
    if (border.visible === false) return undefined
    if (border.style !== 'solid' || border.width === 0) return undefined
    const { width, position = 'inside' } = border
    // Always use rgba — avoids rendering quirks with raw hex in box-shadow at opacity=1
    const color = hexOpacityToRgba(normaliseHex(border.color), border.opacity ?? 1)
    const w = `calc(${width}px * var(--z, 1))`

    // Per-side borders: use individual inset box-shadows for each active side
    if (border.sides) {
        const { top, right, bottom, left } = border.sides
        if (!top && !right && !bottom && !left) return undefined
        if (top && right && bottom && left) {
            // All sides = uniform, use the normal path
        } else {
            // Build per-side inset shadows
            const shadows: string[] = []
            const nw = `calc(${-width}px * var(--z, 1))` // negative width
            if (top) shadows.push(`inset 0 ${w} 0 0 ${color}`)
            if (bottom) shadows.push(`inset 0 ${nw} 0 0 ${color}`)
            if (left) shadows.push(`inset ${w} 0 0 0 ${color}`)
            if (right) shadows.push(`inset ${nw} 0 0 0 ${color}`)
            return shadows.join(', ')
        }
    }

    if (position === 'inside') {
        return `inset 0 0 0 ${w} ${color}`
    } else if (position === 'outside') {
        return `0 0 0 ${w} ${color}`
    } else {
        // center: half inset + half outset
        const half = width / 2
        const hw = `calc(${half}px * var(--z, 1))`
        return `inset 0 0 0 ${hw} ${color}, 0 0 0 ${hw} ${color}`
    }
}

/** Build border/outline CSS for non-solid styles (dashed/dotted).
 *  CSS `outline` is used for center/outside positions since `border` only supports inside
 *  (box-sizing: border-box shrinks content area). Outline is drawn outside the layout box. */
function computeBorder(border?: Border): CSSProperties {
    if (!border || border.visible === false || border.style === 'solid') return {}
    // Always use rgba for consistency
    const color = hexOpacityToRgba(normaliseHex(border.color), border.opacity ?? 1)
    const w = `calc(${border.width}px * var(--z, 1))`
    const position = border.position ?? 'inside'

    if (position === 'inside') {
        // Per-side support for dashed/dotted
        if (border.sides && !(border.sides.top && border.sides.right && border.sides.bottom && border.sides.left)) {
            const s = border.sides
            return {
                borderTopWidth: s.top ? w : '0',
                borderRightWidth: s.right ? w : '0',
                borderBottomWidth: s.bottom ? w : '0',
                borderLeftWidth: s.left ? w : '0',
                borderStyle: border.style,
                borderColor: color,
            }
        }
        return {
            borderWidth: w,
            borderStyle: border.style,
            borderColor: color,
        }
    }

    // center / outside → CSS outline (doesn't affect layout, follows border-radius in modern browsers)
    // outline-offset=0: outer edge of outline starts at element boundary → "outside"
    // outline-offset=-(width/2): outline straddles element boundary → "center"
    const outlineOffset = position === 'outside'
        ? '0px'
        : `calc(${-(border.width / 2)}px * var(--z, 1))`

    return {
        outlineWidth: w,
        outlineStyle: border.style as CSSProperties['outlineStyle'],
        outlineColor: color,
        outlineOffset,
    }
}

/** Build border-radius CSS, scaled via CSS custom property */
function computeBorderRadius(br: BorderRadius): CSSProperties {
    if (typeof br === 'number') {
        return br > 0 ? { borderRadius: `calc(${br}px * var(--z, 1))` } : {}
    }
    return {
        borderTopLeftRadius: `calc(${br.topLeft}px * var(--z, 1))`,
        borderTopRightRadius: `calc(${br.topRight}px * var(--z, 1))`,
        borderBottomRightRadius: `calc(${br.bottomRight}px * var(--z, 1))`,
        borderBottomLeftRadius: `calc(${br.bottomLeft}px * var(--z, 1))`,
    }
}

/** Build padding CSS from Padding object, scaled via CSS custom property */
function computePadding(p: Padding): CSSProperties {
    if (p.top === 0 && p.right === 0 && p.bottom === 0 && p.left === 0) return {}
    return {
        padding: `calc(${p.top}px * var(--z, 1)) calc(${p.right}px * var(--z, 1)) calc(${p.bottom}px * var(--z, 1)) calc(${p.left}px * var(--z, 1))`,
    }
}

// ============================================================
// Constraint-Based Positioning (Ignore Auto Layout)
// ============================================================

// Constraints (left/right/center/leftRight/scale, top/bottom/center/topBottom/scale)
// define how a child repositions/resizes when its PARENT is resized.
// They do NOT affect the child's current position — that's always stored
// in node.x / node.y. Parent-resize interactions update node.x/y/width/height
// according to these constraints, and rendering simply reflects that state.

// ============================================================
// CSS Position Resolution (Paper-style deferred positioning)
// ============================================================

/**
 * Resolve raw CSS position values into CSSProperties for rendering.
 * Instead of pre-computing pixel x/y in the parser, raw CSS values like
 * "50%", "16px", "calc(1/2 * 100%)" are stored on the node and resolved
 * here by the browser's CSS engine against actual parent dimensions.
 *
 * Zoom handling:
 * - Percentage values (e.g. "50%") don't need zoom scaling because
 *   the parent is already zoomed, so 50% of zoomed parent = correct.
 * - Pixel values (e.g. "16px") need zoom scaling via calc() * var(--z).
 * - translate percentages are self-relative, auto-correct with zoom.
 */
function resolveCssPosition(
    cssPos: NonNullable<ScytleNode['cssPosition']>,
): CSSProperties {
    const s: CSSProperties = { position: 'absolute' }

    // Helper: wrap pixel values in zoom calc, pass % values through
    const zoomScale = (val: string): string => {
        const trimmed = val.trim()
        // Percentage or calc with %: no zoom needed (parent is already zoomed)
        if (trimmed.endsWith('%') || trimmed.includes('%')) return trimmed
        // Pixel value: apply zoom
        return `calc(${trimmed} * var(--z, 1))`
    }

    // Horizontal: left takes priority over right
    if (cssPos.left != null) s.left = zoomScale(cssPos.left)
    else if (cssPos.right != null) s.right = zoomScale(cssPos.right)

    // Vertical: top takes priority over bottom
    if (cssPos.top != null) s.top = zoomScale(cssPos.top)
    else if (cssPos.bottom != null) s.bottom = zoomScale(cssPos.bottom)

    // Both edges set (stretch behavior)
    if (cssPos.left != null && cssPos.right != null) {
        s.left = zoomScale(cssPos.left)
        s.right = zoomScale(cssPos.right)
    }
    if (cssPos.top != null && cssPos.bottom != null) {
        s.top = zoomScale(cssPos.top)
        s.bottom = zoomScale(cssPos.bottom)
    }

    // CSS translate property (Tailwind v4: "-50% -50%", "calc(1/3 * 100%) calc(...)")
    if (cssPos.translate) s.translate = cssPos.translate

    // Legacy CSS transform (translate(), translateX(), translateY())
    if (cssPos.transform) s.transform = cssPos.transform

    return s
}

// ============================================================
// Composite Style Builders
// ============================================================

/**
 * Compute base CSS styles shared by all node types:
 * position, sizing, opacity, rotation, fills, border, radius, shadows.
 *
 * @param node             The node to style
 * @param isTopLevel       True for root-level canvas nodes (absolute at x,y)
 * @param parentDir        Parent flex direction — needed for fill sizing
 * @param parentLayoutMode Parent layout mode — children of 'none' frames are absolute
 */
export function computeBaseStyles(
    node: ScytleNode,
    isTopLevel: boolean,
    parentDir?: 'row' | 'column',
    parentLayoutMode?: 'flex' | 'grid' | 'none',
    /** Explicit z-index override (e.g. for reverse canvas stacking) */
    zIndexOverride?: number,
): CSSProperties {
    const s: CSSProperties = { boxSizing: 'border-box' }
    const effects = resolveNodeEffects(node)
    const strokeLayers = resolveStrokeLayers(node)

    // ── Position ──────────────────────────────────────────────
    // Absolute positioning when: top-level, explicit absolute, or child of freeform frame.
    // Top-level nodes include pan offset (--px/--py); nested absolute children position
    // relative to their parent's content box so only zoom scaling is applied.
    const isFreeformChild = parentLayoutMode === 'none'
    const isAbsoluteInAutoLayout = node.positioning === 'absolute' && parentLayoutMode != null && parentLayoutMode !== 'none'
    if (isTopLevel || node.positioning === 'absolute' || isFreeformChild) {
        if (node.cssPosition && !isTopLevel) {
            // Paper-style: let CSS resolve positions against actual parent dimensions.
            // Raw CSS values (e.g. "50%", "16px", "calc(1/2 * 100%)") are passed through
            // so the browser resolves percentages against the zoomed parent.
            Object.assign(s, resolveCssPosition(node.cssPosition))
        } else {
            // Legacy: pre-computed pixel positions (manual placement, drag-and-drop, top-level)
            s.position = 'absolute'
            if (isTopLevel) {
                s.left = `calc(${node.x}px * var(--z, 1) + var(--px, 0) * 1px)`
                s.top = `calc(${node.y}px * var(--z, 1) + var(--py, 0) * 1px)`
            } else {
                s.left = `calc(${node.x}px * var(--z, 1))`
                s.top = `calc(${node.y}px * var(--z, 1))`
            }
        }
    }

    // ── Sizing ────────────────────────────────────────────────
    // Absolute-positioned children in auto layout use fixed sizing (not flex)
    // Exception: if cssPosition has BOTH edges set on an axis (e.g. inset-0),
    // CSS handles sizing via stretch — don't override with explicit width/height.
    const cssStretchH = node.cssPosition?.left != null && node.cssPosition?.right != null
    const cssStretchV = node.cssPosition?.top != null && node.cssPosition?.bottom != null

    // Horizontal
    if (node.sizing.horizontal === 'fixed') {
        // Use raw CSS percentage if available (e.g. width: 75% from w-3/4)
        if (node.cssWidth) {
            s.width = node.cssWidth
        } else {
            s.width = `calc(${node.width}px * var(--z, 1))`
        }
    } else if (node.sizing.horizontal === 'fill') {
        if (isAbsoluteInAutoLayout && !cssStretchH) {
            // Absolute children can't use flex sizing — fall back to fixed width
            s.width = `calc(${node.width}px * var(--z, 1))`
        } else if (parentDir === 'row') {
            // Main axis in row → flex grow
            s.flex = '1 1 0%'
            s.minWidth = 0
        } else if (parentDir === 'column') {
            // Cross axis in column → stretch.
            // IMPORTANT: CSS spec says auto margins override align-self:stretch,
            // so if node has autoMargin (e.g. mx-auto), use width:100% instead.
            // This ensures max-width + margin:auto centering works correctly.
            if (node.autoMargin?.left || node.autoMargin?.right) {
                s.width = '100%'
            } else {
                s.alignSelf = 'stretch'
            }
        } else {
            s.width = '100%'
        }
    }
    // hug → width unset (auto) … EXCEPT when display is flex/grid,
    // which are block-level and fill by default.  Paper-style: use fit-content
    // so inline-flex / inline-grid elements hug their content instead of filling.
    if (node.sizing.horizontal === 'hug' && 'layout' in node && node.layout?.mode && node.layout.mode !== 'none') {
        s.width = 'fit-content'
    }

    // Vertical
    if (node.sizing.vertical === 'fixed') {
        if (node.cssHeight) {
            s.height = node.cssHeight
        } else {
            s.height = `calc(${node.height}px * var(--z, 1))`
        }
    } else if (node.sizing.vertical === 'fill') {
        if (isAbsoluteInAutoLayout && !cssStretchV) {
            // Absolute children can't use flex sizing — fall back to fixed height
            s.height = `calc(${node.height}px * var(--z, 1))`
        } else if (parentDir === 'column') {
            // Main axis in column → flex grow
            // (may override flex set by horizontal fill — intentional: vertical takes precedence in column)
            s.flex = '1 1 0%'
            s.minHeight = 0
        } else if (parentDir === 'row') {
            // Cross axis in row → stretch
            s.alignSelf = 'stretch'
        } else {
            s.height = '100%'
        }
    }
    // hug → height unset (auto)

    // ── Min/Max Constraints (Phase 4) ─────────────────────────
    // These override the flex-based minWidth/minHeight set above
    if (node.minWidth != null && node.minWidth > 0) {
        s.minWidth = `calc(${node.minWidth}px * var(--z, 1))`
    }
    if (node.maxWidth != null) {
        s.maxWidth = `calc(${node.maxWidth}px * var(--z, 1))`
    }
    if (node.minHeight != null && node.minHeight > 0) {
        s.minHeight = `calc(${node.minHeight}px * var(--z, 1))`
    }
    if (node.maxHeight != null) {
        s.maxHeight = `calc(${node.maxHeight}px * var(--z, 1))`
    }

    // ── Opacity ───────────────────────────────────────────────
    if (node.opacity < 1) s.opacity = node.opacity

    // ── Rotation + Flip ───────────────────────────────────────
    // Scale is applied first so flip stays relative to original axes when combined with rotation.
    // Both are encoded in one CSS transform string; separate assignments would overwrite each other.
    const transforms: string[] = []
    if (node.flipX) transforms.push('scaleX(-1)')
    if (node.flipY) transforms.push('scaleY(-1)')
    if (node.rotation !== 0) transforms.push(`rotate(${node.rotation}deg)`)
    if (transforms.length > 0) s.transform = transforms.join(' ')

    // ── Visual properties ─────────────────────────────────────
    if (node.type !== 'text') {
        Object.assign(s, computeBackground(node.fills))
    }
    Object.assign(s, computeNonSolidStroke(strokeLayers))
    Object.assign(s, computeBorderRadius(node.borderRadius))

    // ── Box shadow — merge stroke + drop/inner shadows ────────
    // Must be ONE declaration: a second s.boxShadow assignment would silently overwrite.
    // Solid border stroke uses box-shadow for layout-safe inside/center/outside positioning.
    const shadowParts: string[] = []
    for (const stroke of strokeLayers) {
        const borderShadow = computeBorderAsShadow(stroke)
        if (borderShadow) shadowParts.push(borderShadow)
    }
    const effectShadow = computeEffectShadows(effects)
    if (effectShadow) shadowParts.push(effectShadow)
    // Legacy fallback for projects that rely solely on shadows and have not migrated.
    if (!effectShadow) {
        const legacyShadow = computeBoxShadow(node.shadows)
        if (legacyShadow) shadowParts.push(legacyShadow)
    }
    if (shadowParts.length > 0) s.boxShadow = shadowParts.join(', ')

    // Apply CSS filter from image fill adjustments (single image fill only)
    const filterParts: string[] = []
    const visibleFills = node.fills.filter((f) => f.visible !== false)
    if (visibleFills.length === 1 && visibleFills[0].type === 'image') {
        const imgFilter = computeImageFillFilter(visibleFills[0])
        if (imgFilter) filterParts.push(imgFilter)
    }
    // Layer blur (CSS filter: blur)
    const layerBlur = getBlurRadius(effects, 'layer-blur')
    if (layerBlur > 0) {
        filterParts.push(`blur(calc(${layerBlur}px * var(--z, 1)))`)
    }
    if (filterParts.length > 0) s.filter = filterParts.join(' ')

    // Background blur (Figma: BACKGROUND_BLUR)
    const backgroundBlur = getBlurRadius(effects, 'background-blur')
    if (backgroundBlur > 0) {
        const blurValue = `blur(calc(${backgroundBlur}px * var(--z, 1)))`
        s.backdropFilter = blurValue
            // Safari fallback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ; (s as any).WebkitBackdropFilter = blurValue
    }

    // Apply blend mode from first visible fill (CSS mix-blend-mode on the element)
    const firstFill = visibleFills[0]
    if (firstFill?.blendMode && firstFill.blendMode !== 'NORMAL') {
        s.mixBlendMode = blendModeToCSS(firstFill.blendMode)
    }

    // ── Margin ───────────────────────────────────────────────
    if (node.margin) {
        const { top, right, bottom, left } = node.margin
        const am = node.autoMargin
        if (top || right || bottom || left || am) {
            const mt = am?.top ? 'auto' : `calc(${top}px * var(--z, 1))`
            const mr = am?.right ? 'auto' : `calc(${right}px * var(--z, 1))`
            const mb = am?.bottom ? 'auto' : `calc(${bottom}px * var(--z, 1))`
            const ml = am?.left ? 'auto' : `calc(${left}px * var(--z, 1))`
            s.margin = `${mt} ${mr} ${mb} ${ml}`
        }
    } else if (node.autoMargin) {
        const am = node.autoMargin
        const mt = am.top ? 'auto' : '0'
        const mr = am.right ? 'auto' : '0'
        const mb = am.bottom ? 'auto' : '0'
        const ml = am.left ? 'auto' : '0'
        s.margin = `${mt} ${mr} ${mb} ${ml}`
    }

    // Parsed CSS z-index — pass through so the browser handles
    // stacking natively without reordering children (preserves flex/grid layout)
    if (node.zIndex != null) {
        s.zIndex = node.zIndex
        // z-index only works on positioned elements
        if (!s.position) s.position = 'relative'
    }

    // Explicit z-index override (reverse canvas stacking — takes priority)
    if (zIndexOverride != null) {
        s.zIndex = zIndexOverride
        if (!s.position) s.position = 'relative'
    }

    return s
}

/**
 * Compute frame-specific layout styles (display, flex/grid, padding, overflow).
 * Applied **on top of** computeBaseStyles for FrameNode.
 *
 * Note: Does NOT set position — that's handled by computeBaseStyles
 * and the frame renderer for mode:'none' positioning context.
 */
/** Convert GridTrack[] → CSS grid-template value (zoom-aware for px units) */
function tracksToCSS(tracks: GridTrack[]): string {
    return tracks.map(t => {
        if (t.unit === 'auto') return 'auto'
        if (t.unit === 'fr') return `${t.value}fr`
        return `calc(${t.value}px * var(--z, 1))`
    }).join(' ')
}

export function computeFrameLayoutStyles(node: FrameNode): CSSProperties {
    const s: CSSProperties = {}

    if (node.layout.mode === 'flex') {
        const isAutoGap = isAutoGapLayout(node.layout)
        s.display = 'flex'
        s.flexDirection = node.layout.direction ?? 'column'
        if (node.layout.gap != null && !isAutoGap) {
            if (node.layout.gap >= 0) {
                const gapCSS = `calc(${node.layout.gap}px * var(--z, 1))`
                // Use longhand rowGap/columnGap to avoid React warning when
                // counter-axis gap overrides one of them during wrap.
                s.rowGap = gapCSS
                s.columnGap = gapCSS
            }
        }
        if (node.layout.justify)
            s.justifyContent = JUSTIFY_MAP[node.layout.justify] ?? node.layout.justify
        if (node.layout.align)
            s.alignItems = ALIGN_MAP[node.layout.align] ?? node.layout.align
        if (node.layout.wrap) {
            s.flexWrap = 'wrap'
            // Counter-axis gap for wrapped flex (overrides the primary-axis gap set above)
            const isRow = (node.layout.direction ?? 'column') === 'row'
            const counterGapValue = isRow ? node.layout.rowGap : node.layout.columnGap
            if (counterGapValue != null) {
                const counterGapCSS = `calc(${counterGapValue}px * var(--z, 1))`
                if (isRow) {
                    s.rowGap = counterGapCSS
                } else {
                    s.columnGap = counterGapCSS
                }
            }
            // Wrap alignment (align-content)
            if (node.layout.wrapAlign) {
                const WRAP_ALIGN_MAP: Record<string, string> = {
                    start: 'flex-start',
                    end: 'flex-end',
                    center: 'center',
                    between: 'space-between',
                    stretch: 'stretch',
                }
                s.alignContent = WRAP_ALIGN_MAP[node.layout.wrapAlign] ?? node.layout.wrapAlign
            }
        }
    } else if (node.layout.mode === 'grid') {
        s.display = 'grid'
        // Track-based templates take priority over legacy columns/rows
        if (node.layout.columnTracks?.length) {
            s.gridTemplateColumns = tracksToCSS(node.layout.columnTracks)
        } else if (node.layout.columns != null) {
            s.gridTemplateColumns =
                typeof node.layout.columns === 'number'
                    ? `repeat(${node.layout.columns}, 1fr)`
                    : node.layout.columns
        }
        if (node.layout.rowTracks?.length) {
            s.gridTemplateRows = tracksToCSS(node.layout.rowTracks)
        } else if (node.layout.rows != null) {
            s.gridTemplateRows =
                typeof node.layout.rows === 'number'
                    ? `repeat(${node.layout.rows}, 1fr)`
                    : node.layout.rows
        }
        // Grid alignment (items-center, items-start, etc.)
        if (node.layout.align)
            s.alignItems = ALIGN_MAP[node.layout.align] ?? node.layout.align
        if (node.layout.justify)
            s.justifyContent = JUSTIFY_MAP[node.layout.justify] ?? node.layout.justify
        // Grid gap: use specific columnGap/rowGap if set, otherwise fall back to generic gap
        const gridColGap = node.layout.columnGap ?? node.layout.gap
        const gridRowGap = node.layout.rowGap ?? node.layout.gap
        if (gridColGap != null) {
            const resolvedColGap = Math.max(0, gridColGap)
            s.columnGap = `calc(${resolvedColGap}px * var(--z, 1))`
        }
        if (gridRowGap != null) {
            const resolvedRowGap = Math.max(0, gridRowGap)
            s.rowGap = `calc(${resolvedRowGap}px * var(--z, 1))`
        }
    }
    // mode: 'none' → no display override; position context handled by renderer

    // ── Flex child properties (Phase 4) ───────────────────────
    // These apply when this frame is a child of a flex parent
    if (node.flexShrink != null) {
        s.flexShrink = node.flexShrink
    }
    if (node.flexBasis != null) {
        s.flexBasis = node.flexBasis === 0 ? '0px' : `calc(${node.flexBasis}px * var(--z, 1))`
    }
    if (node.order != null) {
        s.order = node.order
    }
    if (node.alignSelf && node.alignSelf !== 'auto') {
        s.alignSelf = ALIGN_MAP[node.alignSelf] ?? node.alignSelf
    }
    if (node.layoutGrow != null && node.layoutGrow > 0) {
        s.flexGrow = node.layoutGrow
    }

    // ── Grid child properties ────────────────────────────────
    if (node.gridColumnStart != null) {
        s.gridColumnStart = node.gridColumnStart
    }
    if (node.gridColumnSpan != null) {
        s.gridColumn = node.gridColumnStart != null
            ? `${node.gridColumnStart} / span ${node.gridColumnSpan === -1 ? node.gridColumnSpan : node.gridColumnSpan}`
            : node.gridColumnSpan === -1
                ? '1 / -1'
                : `span ${node.gridColumnSpan}`
    }
    if (node.gridRowStart != null) {
        s.gridRowStart = node.gridRowStart
    }
    if (node.gridRowSpan != null) {
        s.gridRow = node.gridRowStart != null
            ? `${node.gridRowStart} / span ${node.gridRowSpan === -1 ? node.gridRowSpan : node.gridRowSpan}`
            : node.gridRowSpan === -1
                ? '1 / -1'
                : `span ${node.gridRowSpan}`
    }

    // Padding
    Object.assign(s, computePadding(node.padding))

    // Overflow
    if (node.overflow === 'hidden') s.overflow = 'hidden'

    return s
}
