/**
 * DOMParser-Based HTML → ScytleNode Parser
 *
 * Parses HTML with DOMParser and reads element.style (inline styles) directly,
 * mapping CSS properties to ScytleNode properties. The HTML is expected to have
 * Tailwind classes already converted to inline styles before reaching this parser.
 *
 * Approach:
 *   - Reads el.style (CSSStyleDeclaration from inline styles)
 *   - Sizing inferred from CSS values (width:100% → fill, Npx → fixed, etc.)
 *   - Dimensions estimated (not measured)
 *
 * Pipeline:
 *   AI HTML → tailwind-to-inline → DOMParser → walkElement → ScytleNode tree
 */

import { generateId } from '@/lib/utils'
import {
    createFrame, createText, createImage, createVector,
    type FrameNode, type TextNode, type ImageNode, type VectorNode,
    type ScytleNode, type Fill, type Border, type Shadow,
    type Layout, type Padding, type Sizing, type BorderRadius,
    type LayoutConstraints,
} from '@/types/canvas'
import { parseSvgToNetwork, computeBoundingBox, normalizeNetwork } from './svg-path-parser'
import { estimateTextHeight } from './size-utils'
import { buildTextSolidFillFromColor } from '@/lib/text-paint'

// ═══════════════════════════════════════════════════
// Viewport Unit Resolution
// ═══════════════════════════════════════════════════

/** Module-level root width, set per parse call. Used for viewport unit resolution. */
let _rootWidth = 1440

/** Approximate viewport height from rootWidth assuming 16:9 aspect ratio. */
function viewportHeight(): number {
    return Math.round(_rootWidth * 9 / 16)
}

/**
 * Resolve a CSS length value to pixels. Handles px, viewport units (vh/vw/dvh/dvw/vmin/vmax).
 * Returns NaN for values it can't resolve (%, auto, etc.).
 */
function resolveLength(value: string): number {
    if (!value) return NaN
    const num = parseFloat(value)
    if (isNaN(num)) return NaN

    if (value.endsWith('px')) return num
    if (value.endsWith('rem')) return num * 16  // 1rem = 16px (browser default)
    if (value.endsWith('em')) return num * 16   // approximate: treat em as rem
    if (value.endsWith('dvh') || value.endsWith('vh')) return (num / 100) * viewportHeight()
    if (value.endsWith('dvw') || value.endsWith('vw')) return (num / 100) * _rootWidth
    if (value.endsWith('vmin')) return (num / 100) * Math.min(_rootWidth, viewportHeight())
    if (value.endsWith('vmax')) return (num / 100) * Math.max(_rootWidth, viewportHeight())

    return NaN
}

/**
 * Resolve a child's percentage height against its parent's known height.
 * Walks up to the parent element and reads its inline height/min-height.
 * Falls back to containerWidth as a rough approximation.
 */
function resolveParentHeight(el: HTMLElement, containerWidth: number): number {
    const parent = el.parentElement
    if (parent) {
        const ps = parent.style
        // Check explicit px height first
        const h = resolveLength(ps.height)
        if (!isNaN(h) && h > 0) return h
        // Check min-height as fallback
        const mh = resolveLength(ps.minHeight)
        if (!isNaN(mh) && mh > 0) return mh
    }
    // Last resort: use containerWidth (square-ish approximation)
    return containerWidth
}

function normalizeHex(hex: string): string {
    let h = hex.trim().toLowerCase()
    if (!h.startsWith('#')) h = '#' + h
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]
    return h
}

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface DOMParserOptions {
    rootWidth?: number
    fonts?: string[]
}

/**
 * CSS properties that are inherited in browsers but NOT in inline styles.
 * DOMParser reads `el.style` which only has explicitly set properties,
 * so we must manually thread inherited values down the tree.
 */
interface InheritedStyles {
    color?: string       // CSS `color` — inherited by default
    textAlign?: string   // CSS `text-align` — inherited by default
    fontSize?: string    // CSS `font-size` — inherited
    fontWeight?: string  // CSS `font-weight` — inherited
    fontStyle?: string   // CSS `font-style` — inherited
    fontFamily?: string  // CSS `font-family` — inherited
    lineHeight?: string  // CSS `line-height` — inherited
    letterSpacing?: string // CSS `letter-spacing` — inherited
    textDecoration?: string // CSS `text-decoration` — affects children visually
}

// ═══════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════

const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'meta', 'link', 'head', 'template',
    'br', 'wbr',
])

const TEXT_ONLY_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label'])

const INLINE_TAGS = new Set([
    'span', 'strong', 'em', 'b', 'i', 'a', 'code', 'small', 'sub', 'sup',
    'mark', 'abbr', 'cite', 'time', 'del', 'ins', 'kbd', 'var', 'u',
])

const HTML_TAG_MAP: Record<string, TextNode['htmlTag']> = {
    h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
    p: 'p', span: 'span', a: 'a',
    // Note: 'li' is intentionally omitted — using htmlTag='li' causes the renderer
    // to create an actual <li> element which shows browser-default bullet markers.
    // Tailwind resets list-style to none, so we should not show bullets.
}

const SEMANTIC_NAMES: Record<string, string> = {
    nav: 'Nav', header: 'Header', footer: 'Footer',
    main: 'Main', aside: 'Sidebar', section: 'Section',
    article: 'Article', form: 'Form', button: 'Button',
    ul: 'List', ol: 'List', figure: 'Figure',
}

/** Block-level display values — elements with these fill width by default */
const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'table-cell', 'table-row-group', 'table-header-group', 'table-footer-group'])

/**
 * Merge parent inherited styles with the current element's inline styles.
 * If the element has an explicit value, it overrides the inherited one.
 */
function mergeInherited(cs: CSSStyleDeclaration, parent?: InheritedStyles): InheritedStyles {
    return {
        color: cs.color || parent?.color,
        textAlign: cs.textAlign || parent?.textAlign,
        fontSize: cs.fontSize || parent?.fontSize,
        fontWeight: cs.fontWeight || parent?.fontWeight,
        fontStyle: cs.fontStyle || parent?.fontStyle,
        fontFamily: cs.fontFamily || parent?.fontFamily,
        lineHeight: cs.lineHeight || parent?.lineHeight,
        letterSpacing: cs.letterSpacing || parent?.letterSpacing,
        textDecoration: cs.textDecorationLine || cs.textDecoration || parent?.textDecoration,
    }
}

/**
 * Get the effective value of an inherited CSS property:
 * use the element's inline style if set, otherwise fall back to inherited.
 */
function eff(csVal: string, inheritedVal?: string): string {
    return csVal || inheritedVal || ''
}

// ═══════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════

/**
 * Parse HTML into a ScytleNode tree using DOMParser.
 *
 * This reads inline styles directly from element.style, which works because
 * the HTML has already been processed through tailwind-to-inline to convert
 * Tailwind classes to inline styles.
 */
export async function parseHtmlViaDOMParser(
    html: string,
    pageName: string = 'Page',
    options?: DOMParserOptions,
): Promise<FrameNode> {
    const width = options?.rootWidth ?? 1440
    _rootWidth = width  // Set for viewport unit resolution

    // Fix self-closing tags: <div /> → <div></div>
    // DOMParser (text/html) handles void elements (img, br, hr, input) natively,
    // but non-void self-closing tags like <div /> are invalid HTML and can break parsing.
    const fixedHtml = fixSelfClosingTags(html)

    // Parse with DOMParser
    const parser = new DOMParser()
    const doc = parser.parseFromString(fixedHtml, 'text/html')

    // Find the root element
    const rootEl = doc.body.firstElementChild as HTMLElement
    if (!rootEl) {
        return createEmptyPageFrame(pageName, width)
    }

    // Walk the DOM tree → ScytleNode tree
    const rootChildren: ScytleNode[] = []
    const rootStyle = rootEl.style

    // Check if root is a simple wrapper (no visual properties) with section children
    const isSimpleWrapper = !hasVisualProperties(rootStyle) && rootEl.children.length > 0

    if (isSimpleWrapper) {
        // Build inherited styles from the wrapper (e.g. text-align, color)
        const wrapperInherited = mergeInherited(rootStyle)
        for (const child of rootEl.children) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                const node = walkElement(child as HTMLElement, width, wrapperInherited)
                if (node) rootChildren.push(node)
            }
        }
    } else {
        const node = walkElement(rootEl, width)
        if (node) rootChildren.push(node)
    }

    // Estimate page height from children
    let pageHeight = 0
    for (const child of rootChildren) {
        pageHeight += child.height || 0
    }
    pageHeight = Math.max(pageHeight, 800)

    // Build the page frame
    const pageFrame = createFrame({
        id: generateId(),
        name: pageName,
        width,
        height: pageHeight,
        children: rootChildren,
        layout: {
            mode: 'flex',
            direction: 'column',
            gap: 0,
        },
        sizing: { horizontal: 'fixed', vertical: 'hug' },
        fills: isSimpleWrapper ? extractFills(rootStyle) : [],
    })

    // Assign sequential positions to children
    assignChildPositions(pageFrame)

    return pageFrame
}

// ═══════════════════════════════════════════════════
// Self-Closing Tag Fix
// ═══════════════════════════════════════════════════

/** Void elements that are legitimately self-closing in HTML */
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Fix self-closing non-void tags: <div /> → <div></div>
 * DOMParser handles void elements natively, but <div/>, <section/>, etc.
 * are invalid and can break the parse tree.
 */
function fixSelfClosingTags(html: string): string {
    return html.replace(/<(\w+)(\s[^>]*)?\s*\/>/g, (match, tag, attrs) => {
        if (VOID_ELEMENTS.has(tag.toLowerCase())) return match
        return `<${tag}${attrs || ''}></${tag}>`
    })
}

// ═══════════════════════════════════════════════════
// Core Walker
// ═══════════════════════════════════════════════════

/**
 * Recursively walk a DOM element and build a ScytleNode.
 * Reads el.style (inline styles) instead of getComputedStyle.
 */
function walkElement(
    el: HTMLElement,
    parentWidth: number,
    inherited?: InheritedStyles,
): ScytleNode | null {
    const tag = el.tagName.toLowerCase()

    // Skip non-visual elements
    if (SKIP_TAGS.has(tag)) return null

    // Read inline styles. SVG elements in DOMParser's SVG namespace don't
    // populate .style CSSStyleDeclaration from inline style attributes.
    // Workaround: copy the raw style attribute into a temp HTML element.
    let cs = el.style
    if (!cs.cssText && el.getAttribute('style')) {
        const tmp = el.ownerDocument.createElement('div')
        tmp.setAttribute('style', el.getAttribute('style')!)
        cs = tmp.style
    }

    // Skip hidden elements
    if (cs.display === 'none' || cs.visibility === 'collapse') return null

    // Merge inherited styles for this element
    const inh = mergeInherited(cs, inherited)

    // Dispatch by element type

    // Images
    if (tag === 'img') return buildImageNode(el as HTMLImageElement, cs, parentWidth)

    // SVGs
    if (tag === 'svg') return buildSvgNode(el as unknown as SVGSVGElement, cs, parentWidth)

    // Media placeholders
    if (tag === 'video' || tag === 'iframe') return buildMediaPlaceholder(el, cs, tag)

    // Form elements
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return buildInputNode(el as HTMLInputElement, cs, tag, parentWidth)
    }

    // HR dividers
    if (tag === 'hr') return buildDividerNode(el, cs, parentWidth)

    // Text-only elements
    const _isTextOnly = isTextOnlyElement(el, tag)
    const _hasVisual = hasVisualProperties(cs)
    if (_isTextOnly && !_hasVisual) {
        return buildTextNode(el, cs, tag, parentWidth, inh)
    }

    // Container elements
    return buildContainerNode(el, cs, tag, parentWidth, inh)
}

// ═══════════════════════════════════════════════════
// Node Builders
// ═══════════════════════════════════════════════════

function buildTextNode(
    el: HTMLElement,
    cs: CSSStyleDeclaration,
    tag: string,
    parentWidth: number,
    inherited?: InheritedStyles,
): TextNode {
    const { text, segments } = extractRichTextContent(el, cs, inherited)
    // Use inherited color if element doesn't have explicit color
    const effectiveColor = eff(cs.color, inherited?.color)
    const colorHex = rgbToHex(effectiveColor)
    const colorAlpha = rgbToOpacity(effectiveColor)
    const color = colorAlpha < 1 && colorHex !== 'transparent'
        ? `${colorHex}${Math.round(colorAlpha * 255).toString(16).padStart(2, '0')}`
        : colorHex
    const fontFamily = extractPrimaryFont(eff(cs.fontFamily, inherited?.fontFamily))
    const fontSize = parseFloat(eff(cs.fontSize, inherited?.fontSize)) || 16
    const fontWeight = parseInt(eff(cs.fontWeight, inherited?.fontWeight)) || 400
    const fontStyle = eff(cs.fontStyle, inherited?.fontStyle) === 'italic' ? 'italic' : undefined
    const textDecoration = parseTextDecoration(cs.textDecorationLine || cs.textDecoration || inherited?.textDecoration || '')
    
    const effectiveTextAlign = eff(cs.textAlign, inherited?.textAlign)
    const effectiveLineHeight = eff(cs.lineHeight, inherited?.lineHeight)
    const effectiveLetterSpacing = eff(cs.letterSpacing, inherited?.letterSpacing)
    const htmlTag = inferHtmlTag(tag)
    const sizing = inferTextSizing(tag, cs)
    const w = sizing.horizontal === 'fill' ? parentWidth : estimateTextWidth(text, fontSize)
    const lhMultiplier = parseLineHeightMultiplier(effectiveLineHeight, fontSize)
    const h = estimateTextHeight(text, fontSize, w, lhMultiplier)

    return createText({
        id: generateId(),
        name: text.slice(0, 40) || tag,
        x: 0,
        y: 0,
        width: Math.max(w, 1),
        height: Math.max(h, 1),
        characters: text,
        segments: segments.length > 0 ? segments : undefined,
        htmlTag,
        fontSize,
        fontWeight,
        fontFamily,
        fontStyle,
        lineHeight: !effectiveLineHeight || effectiveLineHeight === 'normal'
            ? 'auto'
            : parseFloat(effectiveLineHeight),
        letterSpacing: !effectiveLetterSpacing || effectiveLetterSpacing === 'normal'
            ? 0
            : parseFloat(effectiveLetterSpacing),
        textAlign: mapTextAlign(effectiveTextAlign),
        textTransform: mapTextTransform(cs.textTransform),
        textDecoration,
        color,
        autoResize: inferAutoResize(tag, cs),
        ...(cs.textOverflow === 'ellipsis' ? {
            autoResize: 'none' as const,
            textTruncation: 'ending' as const,
            maxLines: inferMaxLines(cs),
        } : {}),
        sizing,
        opacity: parseOpacity(cs.opacity),
        rotation: 0,
        overflow: 'visible',
        borderRadius: 0,
        fills: [buildTextSolidFillFromColor(color)],
        shadows: [],
        positioning: cs.position === 'absolute' || cs.position === 'fixed' ? 'absolute' : 'auto',
        margin: extractMargin(cs),
        autoMargin: extractAutoMargin(el),
        ...extractMinMaxConstraints(cs),
    })
}

function buildContainerNode(
    el: HTMLElement,
    cs: CSSStyleDeclaration,
    tag: string,
    parentWidth: number,
    inherited?: InheritedStyles,
): FrameNode {
    const inh = mergeInherited(cs, inherited)
    const layout = extractLayout(cs, tag, inherited, el)
    const padding = extractPadding(cs)
    let sizing = inferContainerSizing(el, cs)

    // Estimate this container's available width for children
    let containerWidth: number
    if (sizing.horizontal === 'fill') {
        containerWidth = parentWidth
    } else if (cs.width?.endsWith('%')) {
        // Percentage width: resolve against parent (e.g., w-[70%] → 70% of parentWidth)
        containerWidth = (parseFloat(cs.width) / 100) * parentWidth
    } else if (cs.width?.endsWith('px') || cs.width?.endsWith('rem') || cs.width?.endsWith('em')) {
        containerWidth = resolveLength(cs.width)
    } else {
        containerWidth = resolveLength(cs.width) || parseFloat(cs.width) || parentWidth
    }

    // Apply maxWidth constraint BEFORE grid/child division
    const maxW = parseFloat(cs.maxWidth)
    if (!isNaN(maxW) && cs.maxWidth !== 'none' && maxW < containerWidth) {
        containerWidth = maxW
    }

    let childAvailWidth = containerWidth - padding.left - padding.right

    // For grid containers, divide available width by number of columns
    if (layout.mode === 'grid' && layout.columns && typeof layout.columns === 'number') {
        const gridGap = layout.gap || 0
        const totalGap = gridGap * (layout.columns - 1)
        childAvailWidth = (childAvailWidth - totalGap) / layout.columns
    }

    // For table rows (<tr>), divide width equally among cells
    if (tag === 'tr') {
        const cellCount = Array.from(el.children).filter(c => {
            const t = c.tagName.toLowerCase()
            return t === 'td' || t === 'th'
        }).length
        if (cellCount > 0) {
            childAvailWidth = childAvailWidth / cellCount
        }
    }

    // For flex-row containers, estimate per-child width for flex-grow siblings
    // so images and text inside flex-1 divs get proper width estimates
    let flexRowPerGrowWidth = childAvailWidth
    let flexRowTotalGaps = 0
    const isFlexRow = layout.mode === 'flex' && layout.direction === 'row'
    if (isFlexRow) {
        const elementChildren = Array.from(el.children) as HTMLElement[]
        flexRowTotalGaps = (layout.gap || 0) * Math.max(elementChildren.length - 1, 0)
        let flexGrowCount = 0
        let fixedWidthTotal = 0
        for (const ch of elementChildren) {
            const s = ch.style
            const isGrow = (s.flexGrow && parseFloat(s.flexGrow) > 0) ||
                s.flex === '1' || s.flex?.startsWith('1 ')
            if (isGrow) {
                flexGrowCount++
            } else {
                const fw = s.width?.endsWith('px') ? parseFloat(s.width) : 0
                fixedWidthTotal += fw
            }
        }
        if (flexGrowCount > 0) {
            flexRowPerGrowWidth = Math.max((childAvailWidth - fixedWidthTotal - flexRowTotalGaps) / flexGrowCount, 40)
        }
    }

    // Recursively walk children
    const children: ScytleNode[] = []
    const isGrid = layout.mode === 'grid' && layout.columns && typeof layout.columns === 'number'
    const gridGap = layout.gap || 0
    for (const child of el.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            const childEl = child as HTMLElement
            // For grid children with col-span, adjust parentWidth to span multiple columns
            let childParentWidth = childAvailWidth
            if (isGrid) {
                const gc = childEl.style.gridColumn
                if (gc) {
                    const spanMatch = gc.match(/span\s+(\d+)/)
                    const span = spanMatch ? parseInt(spanMatch[1]) : (gc === '1 / -1' ? (layout.columns as number) : 1)
                    if (span > 1) {
                        childParentWidth = childAvailWidth * span + gridGap * (span - 1)
                    }
                }
            } else if (isFlexRow) {
                // Flex-grow children in a flex-row should share space, not each get full width
                const s = childEl.style
                const isGrow = (s.flexGrow && parseFloat(s.flexGrow) > 0) ||
                    s.flex === '1' || s.flex?.startsWith('1 ')
                if (isGrow) {
                    childParentWidth = flexRowPerGrowWidth
                } else if (s.width?.endsWith('px')) {
                    childParentWidth = parseFloat(s.width)
                } else if (s.width?.endsWith('%')) {
                    // DON'T pre-multiply by the percentage — buildContainerNode will
                    // resolve cs.width ('58.333%') against parentWidth itself.
                    // Just pass the gap-adjusted available width as the base.
                    childParentWidth = childAvailWidth - flexRowTotalGaps
                }
            }
            const node = walkElement(childEl, childParentWidth, inh)
            if (node) {
                children.push(node)
                // Store CSS z-index directly on the node for CSS-based stacking.
                // The renderer applies it as a CSS property — no child reordering
                // needed, which preserves flex/grid layout order.
                const rawZ = childEl.style.zIndex
                if (rawZ) {
                    const z = parseInt(rawZ)
                    if (!isNaN(z)) node.zIndex = z
                }
            }
        } else if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim()
            if (text) {
                // Use inherited values for bare text nodes
                const effectiveColor = eff(cs.color, inh.color)
                const fontSize = parseFloat(eff(cs.fontSize, inh.fontSize)) || 16
                const fontWeight = parseInt(eff(cs.fontWeight, inh.fontWeight)) || 400
                const inlineColorHex = rgbToHex(effectiveColor)
                const inlineColorAlpha = rgbToOpacity(effectiveColor)
                const inlineColor = inlineColorAlpha < 1 && inlineColorHex !== 'transparent'
                    ? `${inlineColorHex}${Math.round(inlineColorAlpha * 255).toString(16).padStart(2, '0')}`
                    : inlineColorHex
                const effectiveLineHeight = eff(cs.lineHeight, inh.lineHeight)
                const effectiveLetterSpacing = eff(cs.letterSpacing, inh.letterSpacing)
                const effectiveTextAlign = eff(cs.textAlign, inh.textAlign)
                const lhMultiplier = parseLineHeightMultiplier(effectiveLineHeight, fontSize)
                const estW = Math.min(estimateTextWidth(text, fontSize), childAvailWidth)
                const estH = estimateTextHeight(text, fontSize, estW, lhMultiplier)
                const textNode = createText({
                    id: generateId(),
                    name: text.slice(0, 40),
                    x: 0,
                    y: 0,
                    width: Math.max(estW, 1),
                    height: Math.max(estH, 1),
                    characters: text,
                    fontSize,
                    fontWeight,
                    fontFamily: extractPrimaryFont(eff(cs.fontFamily, inh.fontFamily)),
                    fontStyle: cs.fontStyle === 'italic' ? 'italic' : undefined,
                    lineHeight: !effectiveLineHeight || effectiveLineHeight === 'normal' ? 'auto' : parseFloat(effectiveLineHeight),
                    letterSpacing: !effectiveLetterSpacing || effectiveLetterSpacing === 'normal' ? 0 : parseFloat(effectiveLetterSpacing),
                    textDecoration: parseTextDecoration(cs.textDecorationLine || cs.textDecoration),
                    textTransform: mapTextTransform(cs.textTransform),
                    color: inlineColor,
                    textAlign: mapTextAlign(effectiveTextAlign),
                    autoResize: 'width-and-height',
                    sizing: { horizontal: 'hug', vertical: 'hug' },
                })
                children.push(textNode)
            }
        }
    }


    // Handle mixed content: container has text-only content not caught by isTextOnlyElement
    if (children.length === 0 && el.textContent?.trim()) {
        const textNode = buildTextNode(el, cs, tag, childAvailWidth, inh)
        if (hasVisualProperties(cs)) {
            textNode.positioning = 'auto'
            textNode.margin = undefined
            textNode.autoMargin = undefined
            textNode.sizing = { horizontal: 'hug', vertical: 'hug' }
            textNode.autoResize = 'width-and-height'
            children.push(textNode)
        } else {
            return textNode as unknown as FrameNode
        }
    }

    // ── Merge image + absolute gradient overlay ──
    // Common web pattern: <div class="relative"> <img .../> <div class="absolute inset-0 bg-gradient-...">text</div> </div>
    // In Figma, this is one frame with stacked fills [image, gradient] + text children.
    if ((cs.position === 'relative' || cs.position === 'static' || !cs.position) && children.length >= 2) {
        mergeImageWithGradientOverlay(children)
    }



    const fills = extractFills(cs)
    const border = extractBorder(cs)
    const borderRadius = extractBorderRadius(cs)
    const shadows = extractShadows(cs.boxShadow)

    // Estimate dimensions
    let estWidth = sizing.horizontal === 'fixed'
        ? (cs.width?.endsWith('%')
            ? (parseFloat(cs.width) / 100) * parentWidth  // Resolve percentage against PARENT width
            : (resolveLength(cs.width) || parseFloat(cs.width) || containerWidth))
        : sizing.horizontal === 'hug'
            ? estimateContainerWidth(children, padding, layout)
            : containerWidth
    let estHeight = sizing.vertical === 'fixed'
        ? (cs.height?.endsWith('%')
            ? (parseFloat(cs.height) / 100) * resolveParentHeight(el, containerWidth)
            : (resolveLength(cs.height) || parseFloat(cs.height) || estimateContainerHeight(children, padding, layout)))
        : estimateContainerHeight(children, padding, layout)


    // Apply maxWidth constraint to estimated width
    const maxWidthVal = parseFloat(cs.maxWidth)
    if (!isNaN(maxWidthVal) && cs.maxWidth !== 'none' && maxWidthVal < estWidth) {
        estWidth = maxWidthVal
    }

    // Aspect-ratio enforcement (circles, aspect-ratio containers)
    const explicitW = cs.width?.endsWith('px') ? parseFloat(cs.width) : null
    const explicitH = cs.height?.endsWith('px') ? parseFloat(cs.height) : null

    if (cs.aspectRatio && cs.aspectRatio !== 'auto') {
        const parts = cs.aspectRatio.split('/')
        const ratio = parts.length === 2
            ? parseFloat(parts[0]) / parseFloat(parts[1])
            : parseFloat(parts[0])
        if (ratio > 0 && isFinite(ratio)) {
            estHeight = (explicitW || estWidth) / ratio
            // Aspect-ratio defines height deterministically from width.
            // Mark as 'fixed' so the layout engine uses this value,
            // not hug (which would create circular collapse with fill children).
            sizing = { ...sizing, vertical: 'fixed' }
        }
    } else if (explicitW && explicitH) {
        // Both dimensions explicitly set (e.g., w-12 h-12) — always use CSS values
        estWidth = explicitW
        estHeight = explicitH
    }

    const frame = createFrame({
        id: generateId(),
        name: inferNodeName(el, tag, children),
        x: 0,
        y: 0,
        width: Math.max(estWidth, 1),
        height: Math.max(estHeight, 1),
        children,
        layout,
        padding,
        fills,
        border,
        borderRadius,
        shadows,
        opacity: parseOpacity(cs.opacity),
        ...(extractLayerBlur(cs.filter)),
        overflow: (cs.overflow === 'hidden' || cs.overflow === 'clip' || cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip')
            ? 'hidden'
            : 'visible',
        rotation: 0,
        sizing,
        positioning: cs.position === 'absolute' || cs.position === 'fixed' ? 'absolute' : 'auto',
        ...extractMinMaxConstraints(cs),
        ...extractFlexItemProps(cs),
        ...mapAlignSelf(cs.alignSelf),
        margin: extractMargin(cs),
        autoMargin: extractAutoMargin(el),
        // Grid child spans (col-span-2, row-span-2, etc.)
        ...extractGridSpan(cs),
    })

    // Store raw CSS percentage width/height for render-time resolution
    const widthPct = parseFloat(cs.width || '')
    if (cs.width?.endsWith('%') && !isNaN(widthPct) && widthPct < 99.5) {
        frame.cssWidth = cs.width
    }
    const heightPct = parseFloat(cs.height || '')
    if (cs.height?.endsWith('%') && !isNaN(heightPct) && heightPct < 99.5) {
        frame.cssHeight = cs.height
    }

    // Set x/y for absolute-positioned elements from CSS top/left/right/bottom + transform
    if (cs.position === 'absolute' || cs.position === 'fixed') {
        // Paper-style: store raw CSS position values, let canvas resolve at render time
        const { cssPosition, constraints } = extractCssPosition(cs)
        frame.cssPosition = cssPosition
        frame.constraints = constraints
        frame.x = 0  // Default; renderer will compute actual position from cssPosition
        frame.y = 0
    }

    // No need for fixAbsoluteChildPositions — canvas renderer resolves positions at render time

    assignChildPositions(frame)
    return frame
}

/**
 * Merge image + absolute gradient overlay into a single frame with stacked fills.
 *
 * Detects the common web pattern:
 *   <div class="relative">
 *     <img src="..." class="w-full h-full object-cover" />
 *     <div class="absolute inset-0" style="background: linear-gradient(...)">
 *       <span>text overlay</span>
 *     </div>
 *   </div>
 *
 * In Figma, this becomes one frame with fills: [image, gradient] and the
 * overlay's text children promoted into it. Mutates `children` in place.
 */
function mergeImageWithGradientOverlay(children: ScytleNode[]): void {
    // Find first image frame (has exactly one image fill, no text children)
    const imgIdx = children.findIndex(c =>
        c.type === 'frame' &&
        c.fills?.length === 1 &&
        c.fills[0].type === 'image' &&
        (c as FrameNode).children.length === 0
    )
    if (imgIdx === -1) return

    // Find first absolute overlay with gradient or semi-transparent solid fill
    const overlayIdx = children.findIndex((c, i) =>
        i !== imgIdx &&
        c.type === 'frame' &&
        c.positioning === 'absolute' &&
        c.fills &&
        c.fills.length > 0 &&
        c.fills.every(f => f.type === 'gradient' || (f.type === 'solid' && (f.opacity ?? 1) < 1))
    )
    if (overlayIdx === -1) return

    const imgFrame = children[imgIdx] as FrameNode
    const overlay = children[overlayIdx] as FrameNode

    // Merge: stack overlay fills on top of image fill
    // fills[0] = topmost CSS layer, so overlay goes FIRST
    imgFrame.fills = [...(overlay.fills || []), ...(imgFrame.fills || [])]

    // Promote overlay's children into the image frame
    if (overlay.children.length > 0) {
        imgFrame.children = [...overlay.children]
        // Image frame needs layout to position the promoted children
        imgFrame.layout = overlay.layout?.mode !== 'none' ? overlay.layout : { mode: 'flex', direction: 'column', gap: 0 }
        imgFrame.padding = overlay.padding || { top: 0, right: 0, bottom: 0, left: 0 }
    }

    // Inherit overflow hidden so gradient clips to image bounds
    imgFrame.overflow = 'hidden'

    // Remove the overlay from children
    children.splice(overlayIdx, 1)
}

/** Infer image sizing from CSS. */
function inferImageSizing(cs: CSSStyleDeclaration, el: HTMLImageElement): Sizing {
    const widthVal = cs.width
    const heightVal = cs.height
    const isAbs = cs.position === 'absolute' || cs.position === 'fixed'

    let horizontal: Sizing['horizontal'] = 'fill'  // images default to fill
    if (widthVal && (widthVal.endsWith('px') || widthVal.endsWith('rem') || widthVal.endsWith('em'))) {
        horizontal = 'fixed'
    } else if (widthVal && (widthVal === '100%' || (widthVal.endsWith('%') && parseFloat(widthVal) >= 99.5))) {
        horizontal = 'fill'
    } else if (el.getAttribute('width')) {
        horizontal = 'fixed'
    }

    let vertical: Sizing['vertical'] = 'fixed'  // images default to fixed height
    if (heightVal && (heightVal === '100%' || (heightVal.endsWith('%') && parseFloat(heightVal) >= 99.5))) {
        vertical = 'fill'  // 100% height → fill (works for both abs and normal flow in flex containers)
    } else if (heightVal && (heightVal.endsWith('px') || heightVal.endsWith('rem') || heightVal.endsWith('em') || /\d+d?v[hw]/.test(heightVal))) {
        vertical = 'fixed'
    }

    return { horizontal, vertical }
}

function buildImageNode(
    el: HTMLImageElement,
    cs: CSSStyleDeclaration,
    parentWidth: number,
): ScytleNode {
    const src = el.src || el.getAttribute('data-src') || el.getAttribute('src') || ''
    const alt = el.alt || el.getAttribute('alt') || ''

    // Resolve width: percentage → parentWidth, viewport units → px, px → px
    let width: number
    const widthVal = cs.width
    if (widthVal && (widthVal === '100%' || (widthVal.endsWith('%') && parseFloat(widthVal) >= 99.5))) {
        width = parentWidth
    } else if (widthVal && widthVal.endsWith('%')) {
        width = (parseFloat(widthVal) / 100) * parentWidth
    } else {
        width = resolveLength(widthVal) || parseFloat(widthVal) || parseInt(el.getAttribute('width') || '') || parentWidth
    }

    // Resolve height similarly
    let height: number
    const heightVal = cs.height
    if (heightVal && (heightVal === '100%' || (heightVal.endsWith('%') && parseFloat(heightVal) >= 99.5))) {
        height = width * 2 / 3  // Fallback aspect ratio for 100% height
    } else {
        height = resolveLength(heightVal) || parseFloat(heightVal) || parseInt(el.getAttribute('height') || '') || Math.round(width * 2 / 3)
    }

    // Determine sizing from CSS
    const sizing = inferImageSizing(cs, el)

    // Handle aspect-ratio CSS property
    let finalHeight = height
    if (cs.aspectRatio && cs.aspectRatio !== 'auto' && width > 0) {
        const parts = cs.aspectRatio.split('/')
        if (parts.length === 2) {
            const ratio = parseFloat(parts[0]) / parseFloat(parts[1])
            if (ratio > 0) finalHeight = width / ratio
        }
    }

    if (src && src !== '') {
        const isAbsImage = cs.position === 'absolute' || cs.position === 'fixed'
        const frame = createFrame({
            id: generateId(),
            name: alt || 'Image',
            width,
            height: finalHeight,
            fills: [{
                type: 'image',
                id: generateId(),
                src,
                fit: mapObjectFit(cs.objectFit) as 'cover' | 'contain' | 'fill' | 'tile' | 'crop',
                visible: true,
                opacity: 1,
            }],
            sizing,
            borderRadius: extractBorderRadius(cs),
            opacity: parseOpacity(cs.opacity),
            overflow: 'hidden',
            children: [],
            layout: { mode: 'none' },
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            positioning: isAbsImage ? 'absolute' : 'auto',
        })

        // Extract CSS position for absolute images (e.g. absolute inset-0)
        // so the renderer can stretch them via top/right/bottom/left
        if (isAbsImage) {
            const { cssPosition, constraints } = extractCssPosition(cs)
            frame.cssPosition = cssPosition
            frame.constraints = constraints
            frame.x = 0
            frame.y = 0
        }

        return frame
    }

    return createImage({
        id: generateId(),
        name: alt || 'Image',
        width,
        height: finalHeight,
        src: '',
        alt: alt || 'Image placeholder',
        fit: 'cover',
        isPlaceholder: true,
        placeholderLabel: alt || 'Image',
        sizing,
        borderRadius: extractBorderRadius(cs),
        opacity: parseOpacity(cs.opacity),
    })
}

// ═══════════════════════════════════════════════════
// SVG Handling
// ═══════════════════════════════════════════════════

function buildSvgNode(
    el: SVGSVGElement,
    cs: CSSStyleDeclaration,
    parentWidth: number,
): ScytleNode {
    const width = parseFloat(cs.width) || parseFloat(el.getAttribute('width') || '24')
    const height = parseFloat(cs.height) || parseFloat(el.getAttribute('height') || '24')

    const paths = el.querySelectorAll('path, circle, rect, ellipse, line, polygon, polyline')
    const hasComplexFeatures = el.querySelector(
        'mask, clipPath, linearGradient, radialGradient, use, filter, pattern, image'
    )

    // Simple icons → try VectorNode conversion
    if (paths.length > 0 && paths.length <= 8 && !hasComplexFeatures) {
        try {
            const network = parseSvgToNetwork(el)
            if (network && network.vertices.length > 0) {
                return buildVectorNodeFromNetwork(el, network, width, height, cs)
            }
        } catch {
            // Fall through to data URI fallback
        }
    }

    return buildSvgAsDataUri(el, width, height, cs)
}

function buildVectorNodeFromNetwork(
    el: SVGSVGElement,
    network: ReturnType<typeof parseSvgToNetwork>,
    width: number,
    height: number,
    cs: CSSStyleDeclaration,
): VectorNode {
    const offset = normalizeNetwork(network)
    const bbox = computeBoundingBox(network)

    // Resolve fill color — walk parent chain for currentColor
    const fillColor = resolveCurrentColor(el, cs)

    // Read stroke from SVG attributes
    const firstPath = el.querySelector('path, circle, rect, ellipse, line, polygon, polyline')
    const svgStrokeRaw =
        firstPath?.getAttribute('stroke') ||
        el.getAttribute('stroke') ||
        ''
    const svgStrokeWidthRaw =
        firstPath?.getAttribute('stroke-width') ||
        el.getAttribute('stroke-width') ||
        '0'

    let strokeColor = '#000000'
    if (svgStrokeRaw && svgStrokeRaw !== 'none') {
        if (svgStrokeRaw === 'currentColor') {
            strokeColor = resolveCurrentColorFromChain(el) || '#000000'
        } else if (svgStrokeRaw === 'white') {
            strokeColor = '#ffffff'
        } else if (svgStrokeRaw === 'black') {
            strokeColor = '#000000'
        } else if (svgStrokeRaw.startsWith('#') || svgStrokeRaw.startsWith('rgb')) {
            strokeColor = rgbToHex(svgStrokeRaw)
        } else {
            strokeColor = resolveCurrentColorFromChain(el) || '#000000'
        }
    }

    const strokeWeight = parseFloat(svgStrokeWidthRaw) || 0
    const hasStroke = svgStrokeRaw !== '' && svgStrokeRaw !== 'none' && strokeWeight > 0

    const rawCap = firstPath?.getAttribute('stroke-linecap') || el.getAttribute('stroke-linecap') || ''
    const rawJoin = firstPath?.getAttribute('stroke-linejoin') || el.getAttribute('stroke-linejoin') || ''

    const isAbsolute = cs.position === 'absolute' || cs.position === 'fixed'

    const node = createVector({
        id: generateId(),
        name: inferSvgName(el),
        width: bbox.width || width,
        height: bbox.height || height,
        vectorNetwork: network,
        positioning: isAbsolute ? 'absolute' : 'auto',
        margin: extractMargin(cs),
        fills: fillColor ? [{
            type: 'solid',
            id: generateId(),
            color: fillColor,
            opacity: 1,
            visible: true,
        }] : [],
        strokeColor,
        strokeWeight,
        strokeVisible: hasStroke,
        strokeCap: rawCap === 'round' ? 'ROUND' : rawCap === 'square' ? 'SQUARE' : 'NONE',
        strokeJoin: rawJoin === 'round' ? 'ROUND' : rawJoin === 'bevel' ? 'BEVEL' : 'MITER',
        opacity: parseOpacity(cs.opacity),
    })

    if (isAbsolute) {
        const { cssPosition, constraints } = extractCssPosition(cs)
        node.cssPosition = cssPosition
        node.constraints = constraints
        node.x = 0
        node.y = 0
    }

    return node
}

function buildSvgAsDataUri(
    el: SVGSVGElement,
    width: number,
    height: number,
    cs: CSSStyleDeclaration,
): FrameNode {
    const clone = el.cloneNode(true) as SVGSVGElement

    if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
    }
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // Resolve currentColor by walking parent chain
    const resolvedColor = resolveCurrentColorFromChain(el) || 'rgb(0, 0, 0)'
    const resolveCurrentColorInSvg = (node: Element) => {
        for (const attr of ['fill', 'stroke', 'color', 'stop-color', 'flood-color']) {
            const val = node.getAttribute(attr)
            if (val === 'currentColor') {
                node.setAttribute(attr, resolvedColor)
            }
        }
        const style = node.getAttribute('style')
        if (style && style.includes('currentColor')) {
            node.setAttribute('style', style.replace(/currentColor/g, resolvedColor))
        }
        for (const child of node.children) {
            resolveCurrentColorInSvg(child)
        }
    }
    for (const attr of ['fill', 'stroke']) {
        const val = clone.getAttribute(attr)
        if (val === 'currentColor') {
            clone.setAttribute(attr, resolvedColor)
        }
    }
    resolveCurrentColorInSvg(clone)

    const svgString = new XMLSerializer().serializeToString(clone)
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`

    const isAbsolute = cs.position === 'absolute' || cs.position === 'fixed'

    const frame = createFrame({
        id: generateId(),
        name: inferSvgName(el),
        width,
        height,
        sizing: { horizontal: 'fixed', vertical: 'fixed' },
        positioning: isAbsolute ? 'absolute' : 'auto',
        margin: extractMargin(cs),
        layout: { mode: 'none' },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        fills: [{
            type: 'image',
            id: generateId(),
            src: dataUri,
            fit: 'contain',
            visible: true,
            opacity: 1,
        }],
        borderRadius: 0,
        shadows: [],
        opacity: parseOpacity(cs.opacity),
        overflow: 'hidden',
        children: [],
    })

    if (isAbsolute) {
        const { cssPosition, constraints } = extractCssPosition(cs)
        frame.cssPosition = cssPosition
        frame.constraints = constraints
        frame.x = 0
        frame.y = 0
    }

    return frame
}

// ═══════════════════════════════════════════════════
// Edge Case Builders
// ═══════════════════════════════════════════════════

function buildMediaPlaceholder(
    el: HTMLElement,
    cs: CSSStyleDeclaration,
    tag: string,
): ScytleNode {
    const width = parseFloat(cs.width) || parseInt(el.getAttribute('width') || '') || 640
    const height = parseFloat(cs.height) || parseInt(el.getAttribute('height') || '') || 360

    return createImage({
        id: generateId(),
        name: tag === 'video' ? 'Video' : 'Embed',
        width,
        height,
        src: '',
        alt: tag === 'video' ? 'Video placeholder' : 'Embed placeholder',
        fit: 'cover',
        isPlaceholder: true,
        placeholderLabel: tag === 'video' ? 'Video' : 'Embed',
        sizing: { horizontal: 'fill', vertical: 'fixed' },
    })
}

function buildInputNode(
    el: HTMLInputElement,
    cs: CSSStyleDeclaration,
    tag: string,
    parentWidth: number,
): FrameNode {
    const placeholder = el.placeholder || el.value || el.getAttribute('placeholder') || el.textContent?.trim() || tag
    const fontSize = parseFloat(cs.fontSize) || 14

    // Line height: unitless values (e.g. 1.625) are multipliers, not px
    const rawLH = cs.lineHeight
    let lineHeight: number
    if (!rawLH || rawLH === 'normal' || rawLH === '') {
        lineHeight = fontSize * 1.5
    } else if (rawLH.endsWith('px')) {
        lineHeight = parseFloat(rawLH)
    } else {
        // Unitless multiplier (e.g. "1.625") → multiply by fontSize
        const parsed = parseFloat(rawLH)
        lineHeight = parsed < fontSize ? parsed * fontSize : parsed
    }

    const padding = extractPadding(cs)
    const isTextarea = tag === 'textarea'

    // Width: resolve percentage against parentWidth, use explicit px, or fill parent
    let width: number
    if (cs.width?.endsWith('%')) {
        width = (parseFloat(cs.width) / 100) * parentWidth
    } else if (parseFloat(cs.width) > 0) {
        width = parseFloat(cs.width)
    } else {
        width = Math.max(parentWidth, 100)
    }

    // Height: compute from padding + content, never hardcode
    let contentHeight: number
    if (parseFloat(cs.height) > 0) {
        contentHeight = parseFloat(cs.height)
    } else if (isTextarea) {
        const rows = parseInt(el.getAttribute('rows') || '4')
        contentHeight = rows * lineHeight + padding.top + padding.bottom
    } else {
        contentHeight = lineHeight + padding.top + padding.bottom
    }
    const height = Math.max(contentHeight, 28)

    const textChild = createText({
        id: generateId(),
        name: placeholder.slice(0, 40),
        characters: placeholder,
        color: rgbToHex(cs.color),
        fontFamily: extractPrimaryFont(cs.fontFamily),
        fontSize,
        fontWeight: parseInt(cs.fontWeight) || 400,
        lineHeight: parseFloat(cs.lineHeight) || 'auto',
        sizing: { horizontal: 'fill', vertical: 'hug' },
        // 'height' mode → whiteSpace:'pre-wrap' → text wraps in textareas
        // 'width-and-height' → whiteSpace:'nowrap' → single-line inputs
        autoResize: isTextarea ? 'height' : 'width-and-height',
        opacity: el.placeholder && !el.value ? 0.5 : 1,
    })

    return createFrame({
        id: generateId(),
        name: tag === 'select' ? 'Select' : isTextarea ? 'Textarea' : 'Input',
        width,
        height,
        children: [textChild],
        layout: { mode: 'flex', direction: isTextarea ? 'column' : 'row', align: isTextarea ? 'start' : 'center' },
        padding,
        fills: extractFills(cs),
        border: extractBorder(cs),
        borderRadius: extractBorderRadius(cs),
        sizing: { horizontal: 'fill', vertical: isTextarea ? 'fixed' : 'hug' },
        shadows: extractShadows(cs.boxShadow),
    })
}


function buildDividerNode(
    el: HTMLElement,
    cs: CSSStyleDeclaration,
    parentWidth: number,
): FrameNode {
    const color = rgbToHex(
        cs.borderTopColor || cs.borderColor || cs.backgroundColor || '#e5e7eb'
    )

    return createFrame({
        id: generateId(),
        name: 'Divider',
        width: parseFloat(cs.width) || parentWidth,
        height: parseFloat(cs.height) || 1,
        fills: [{
            type: 'solid',
            id: generateId(),
            color,
            opacity: 1,
            visible: true,
        }],
        sizing: { horizontal: 'fill', vertical: 'fixed' },
        children: [],
        layout: { mode: 'none' },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        margin: extractMargin(cs),
    })
}

// ═══════════════════════════════════════════════════
// Color Conversion Utilities
// ═══════════════════════════════════════════════════

/** Parse opacity string, correctly handling opacity: 0 (which || 1 would clobber) */
function parseOpacity(val: string): number {
    if (!val) return 1
    const n = parseFloat(val)
    if (isNaN(n)) return 1
    // Handle percentage values (e.g., "20%" → 0.2)
    if (val.trim().endsWith('%')) return n / 100
    return n
}

/**
 * Convert CSS color string to hex.
 *
 * Handles all formats that Tailwind v4 and inline style conversion may produce:
 *   - rgb(59, 130, 246)         — standard sRGB
 *   - rgba(59, 130, 246, 0.5)   — sRGB with alpha
 *   - oklch(0.623 0.214 259.1)  — Tailwind v4 default color space
 *   - oklab(L a b)              — Tailwind v4 near-achromatic
 *   - color(srgb 0.23 0.51 0.96)— modern color function
 *   - color(display-p3 ...)     — wide-gamut
 *   - #rrggbb / #rgb            — hex
 */
function rgbToHex(rgb: string): string {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent'

    // Unresolvable CSS keywords — DOMParser can't resolve inheritance
    const lower = rgb.trim().toLowerCase()
    if (lower === 'currentcolor' || lower === 'inherit' || lower === 'initial' || lower === 'unset' || lower === '') {
        return 'transparent'
    }

    // Already hex — strip alpha channel from 8-digit (#RRGGBBAA) and 4-digit (#RGBA)
    if (rgb.startsWith('#')) {
        const h = rgb.trim()
        if (h.length === 9) return normalizeHex(h.slice(0, 7))  // #RRGGBBAA → #RRGGBB
        if (h.length === 5) return normalizeHex(h.slice(0, 4))  // #RGBA → #RGB
        return normalizeHex(h)
    }

    // ── color-mix MUST be checked BEFORE rgb/rgba, because the browser transforms
    //    color-mix(in oklab, #fff 10%, transparent) to
    //    color-mix(rgb(255, 255, 255) 10%, transparent) in element.style,
    //    and the rgb() inside would falsely match the rgb/rgba regex below.
    if (rgb.includes('color-mix')) {
        // Browser-transformed format: color-mix(<color> <pct>%, transparent)
        // e.g. color-mix(rgb(255, 255, 255) 10%, transparent)
        const browserMixMatch = rgb.match(/color-mix\(\s*((?:rgba?\([^)]+\)|#[\da-fA-F]+|\w+))\s+[\d.]+%\s*,\s*transparent\s*\)/)
        if (browserMixMatch) return rgbToHex(browserMixMatch[1].trim())
        // Original CSS format: color-mix(in <colorspace>, <color> <pct>%, transparent)
        const cssMixMatch = rgb.match(/color-mix\(\s*in\s+\w+\s*,\s*([#\w().,\s]+?)\s+[\d.]+%\s*,\s*transparent\s*\)/)
        if (cssMixMatch) return rgbToHex(cssMixMatch[1].trim())
        // Reversed: color-mix(in <colorspace>, transparent, <color> <pct>%)
        const cssMixMatch2 = rgb.match(/color-mix\(\s*in\s+\w+\s*,\s*transparent\s*,\s*([#\w().,\s]+?)\s+[\d.]+%\s*\)/)
        if (cssMixMatch2) return rgbToHex(cssMixMatch2[1].trim())
    }

    // Standard rgb/rgba (comma-separated)
    const rgbMatch = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1])
        const g = parseInt(rgbMatch[2])
        const b = parseInt(rgbMatch[3])
        return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
    }

    // Modern space-separated rgb/rgba: rgb(59 130 246) or rgb(59 130 246 / 0.5)
    const rgbSpaceMatch = rgb.match(/rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    if (rgbSpaceMatch) {
        const r = Math.round(parseFloat(rgbSpaceMatch[1]))
        const g = Math.round(parseFloat(rgbSpaceMatch[2]))
        const b = Math.round(parseFloat(rgbSpaceMatch[3]))
        return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0')).join('')
    }

    // oklch(L C H) or oklch(L% C H) or oklch(L C H / alpha)
    const oklchMatch = rgb.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/)
    if (oklchMatch) {
        let L = parseFloat(oklchMatch[1])
        if (oklchMatch[2] === '%') L = L / 100
        return oklchToHex(
            L,
            parseFloat(oklchMatch[3]),
            parseFloat(oklchMatch[4]),
        )
    }

    // oklab(L a b) or oklab(L a b / alpha)
    const oklabMatch = rgb.match(/oklab\(\s*([\d.]+)(%?)\s+([-\d.]+)\s+([-\d.]+)/)
    if (oklabMatch) {
        let L = parseFloat(oklabMatch[1])
        if (oklabMatch[2] === '%') L = L / 100
        const a = parseFloat(oklabMatch[3])
        const b = parseFloat(oklabMatch[4])
        return oklabToHex(L, a, b)
    }

    // color(srgb r g b)
    const srgbMatch = rgb.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    if (srgbMatch) {
        const r = Math.round(parseFloat(srgbMatch[1]) * 255)
        const g = Math.round(parseFloat(srgbMatch[2]) * 255)
        const b = Math.round(parseFloat(srgbMatch[3]) * 255)
        return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0')).join('')
    }

    // color(display-p3 r g b) — approximate to sRGB
    const p3Match = rgb.match(/color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    if (p3Match) {
        const r = Math.round(parseFloat(p3Match[1]) * 255)
        const g = Math.round(parseFloat(p3Match[2]) * 255)
        const b = Math.round(parseFloat(p3Match[3]) * 255)
        return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0')).join('')
    }

    // Named colors (common ones from CSS)
    const named: Record<string, string> = {
        black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
        blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080',
    }
    if (named[lower]) return named[lower]

    return '#000000'
}

/**
 * Convert oklch to hex (approximate via Lab → XYZ → sRGB).
 */
function oklchToHex(L: number, C: number, H: number): string {
    const hRad = (H * Math.PI) / 180
    const a = C * Math.cos(hRad)
    const b = C * Math.sin(hRad)
    return oklabToHex(L, a, b)
}

/**
 * Convert oklab to hex (direct Cartesian form).
 */
function oklabToHex(L: number, a: number, b: number): string {
    // oklab → linear sRGB (via LMS)
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b

    const l = l_ * l_ * l_
    const m = m_ * m_ * m_
    const s = s_ * s_ * s_

    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    const bVal = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    const toSrgb = (x: number) => {
        if (x <= 0) return 0
        if (x >= 1) return 255
        return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255)
    }

    return '#' + [toSrgb(r), toSrgb(g), toSrgb(bVal)]
        .map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Extract opacity from color string.
 * Handles rgba(), oklch(... / alpha), color(... / alpha), space-separated rgb().
 */
function rgbToOpacity(rgb: string): number {
    if (!rgb) return 1
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 0

    // 8-digit hex: #RRGGBBAA → extract alpha from last 2 hex digits
    if (rgb.startsWith('#') && rgb.length === 9) {
        return parseInt(rgb.slice(7, 9), 16) / 255
    }
    // 4-digit hex: #RGBA → extract alpha from last hex digit
    if (rgb.startsWith('#') && rgb.length === 5) {
        const a = rgb[4]
        return parseInt(a + a, 16) / 255
    }

    // rgba(r, g, b, a) — comma-separated
    const rgbaMatch = rgb.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/)
    if (rgbaMatch) return parseFloat(rgbaMatch[1])

    // Modern format: rgb(r g b / a) or oklch(L C H / a) or color(srgb r g b / a)
    const slashMatch = rgb.match(/\/\s*([\d.]+)\s*\)/)
    if (slashMatch) return parseFloat(slashMatch[1])

    // color-mix — browser-transformed format (element.style):
    // color-mix(rgb(255, 255, 255) 10%, transparent)
    // Note: browser drops "in oklab" and converts hex to rgb() in element.style
    const browserMixMatch = rgb.match(/color-mix\(\s*(?:rgba?\([^)]+\)|#[\da-fA-F]+|\w+)\s+([\d.]+)%\s*,\s*transparent\s*\)/)
    if (browserMixMatch) return parseFloat(browserMixMatch[1]) / 100

    // color-mix(in oklab, <color> <percentage>%, transparent)
    // Tailwind v4: color-mix(in oklab, #fff 10%, transparent) → opacity = 0.10
    const colorMixMatch = rgb.match(/color-mix\(\s*in\s+\w+\s*,\s*[#\w().,\s]+?\s+([\d.]+)%\s*,\s*transparent\s*\)/)
    if (colorMixMatch) return parseFloat(colorMixMatch[1]) / 100
    const colorMixMatch2 = rgb.match(/color-mix\(\s*in\s+\w+\s*,\s*transparent\s*,\s*[#\w().,\s]+?\s+([\d.]+)%\s*\)/)
    if (colorMixMatch2) return parseFloat(colorMixMatch2[1]) / 100

    return 1
}

/**
 * Check if a color value represents transparent.
 */
function isTransparentColor(color: string): boolean {
    if (!color) return true
    if (color === 'transparent') return true
    if (color === 'rgba(0, 0, 0, 0)') return true
    const alphaMatch = color.match(/\/\s*([\d.]+)\s*\)$/)
    if (alphaMatch && parseFloat(alphaMatch[1]) === 0) return true
    // color-mix with 0% is transparent (both browser-transformed and original CSS formats)
    if (color.includes('color-mix') && color.includes('transparent')) {
        const pctMatch = color.match(/\s([\d.]+)%\s*,\s*transparent/)
        if (pctMatch && parseFloat(pctMatch[1]) === 0) return true
    }
    return false
}

// ═══════════════════════════════════════════════════
// Layout Extraction
// ═══════════════════════════════════════════════════

function extractLayout(cs: CSSStyleDeclaration, tag?: string, inherited?: InheritedStyles, el?: HTMLElement): Layout {
    const display = cs.display

    if (display === 'grid' || display === 'inline-grid') {
        return {
            mode: 'grid',
            direction: 'row',
            align: mapAlignItems(cs.alignItems),
            justify: mapJustifyContent(cs.justifyContent),
            gap: parseFloat(cs.gap) || 0,
            columns: parseGridTemplate(cs.gridTemplateColumns),
            rows: parseGridTemplate(cs.gridTemplateRows),
            columnGap: parseFloat(cs.columnGap) || undefined,
            rowGap: parseFloat(cs.rowGap) || undefined,
        }
    }

    if (display === 'flex' || display === 'inline-flex') {
        return {
            mode: 'flex',
            direction: (cs.flexDirection === 'column' || cs.flexDirection === 'column-reverse')
                ? 'column'
                : 'row',
            justify: mapJustifyContent(cs.justifyContent),
            align: mapAlignItems(cs.alignItems),
            wrap: cs.flexWrap === 'wrap' ? true : undefined,
            gap: parseFloat(cs.gap) || 0,
            columnGap: parseFloat(cs.columnGap) || undefined,
            rowGap: parseFloat(cs.rowGap) || undefined,
        }
    }

    // Block/inline elements → treat as flex column for Scytle canvas
    // Map text-align to flex alignment (text-center → align-items: center in flex-column)
    const textAlign = eff(cs.textAlign, inherited?.textAlign)
    const flexAlign = textAlign === 'center' ? 'center'
        : textAlign === 'right' || textAlign === 'end' ? 'end'
            : undefined

    // Table elements → map to flex layout
    if (tag === 'tr') {
        return { mode: 'flex', direction: 'row', gap: 0, align: 'center' }
    }
    if (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
        return { mode: 'flex', direction: 'column', gap: 0 }
    }

    // Exception: TEXT_ONLY_TAGS (p, h1-h6) with mixed inline children should flow horizontally
    // Enable wrap so inline spans don't overflow the container (e.g. large font titles)
    // BUT: if a <br> is present, children should stack vertically (column)
    // Exception: button/a with text should center content
    if (tag && TEXT_ONLY_TAGS.has(tag)) {
        const hasBR = el ? Array.from(el.childNodes).some(n => n.nodeName === 'BR') : false
        if (hasBR) {
            return { mode: 'flex', direction: 'column', gap: 0, align: flexAlign as Layout['align'], justify: flexAlign as Layout['justify'] }
        }
        return { mode: 'flex', direction: 'row', gap: 0, wrap: true, align: 'baseline' as Layout['align'], justify: flexAlign as Layout['justify'] }
    }
    if (tag === 'button' || tag === 'a') {
        return { mode: 'flex', direction: 'row', gap: 0, justify: 'center', align: 'center' }
    }
    return { mode: 'flex', direction: 'column', gap: 0, align: flexAlign as Layout['align'] }
}

/**
 * Parse grid-template-columns/rows from inline style.
 * Inline styles use the authored value: "repeat(3, 1fr)", "1fr 1fr 1fr", etc.
 */
function parseGridTemplate(template: string): number | string | undefined {
    if (!template || template === 'none') return undefined

    // repeat(N, ...) → extract N
    const repeatMatch = template.match(/repeat\(\s*(\d+)/)
    if (repeatMatch) return parseInt(repeatMatch[1])

    // Count space-separated tracks (e.g. "1fr 1fr 1fr" → 3)
    const tracks = template.split(/\s+/).filter(v => v && v !== 'none')
    if (tracks.length > 0) return tracks.length

    return undefined
}

// ═══════════════════════════════════════════════════
// Style Extraction Utilities
// ═══════════════════════════════════════════════════

function extractPadding(cs: CSSStyleDeclaration): Padding {
    const top = parseFloat(cs.paddingTop) || 0
    const right = parseFloat(cs.paddingRight) || 0
    const bottom = parseFloat(cs.paddingBottom) || 0
    const left = parseFloat(cs.paddingLeft) || 0

    // If longhand properties are all 0 but shorthand `padding` is set,
    // parse the shorthand (DOMParser may not expand shorthand to longhands)
    if (top === 0 && right === 0 && bottom === 0 && left === 0 && cs.padding) {
        const parts = cs.padding.trim().split(/\s+/)
        if (parts.length === 1) {
            const v = parseFloat(parts[0]) || 0
            return { top: v, right: v, bottom: v, left: v }
        } else if (parts.length === 2) {
            const vert = parseFloat(parts[0]) || 0
            const horiz = parseFloat(parts[1]) || 0
            return { top: vert, right: horiz, bottom: vert, left: horiz }
        } else if (parts.length === 3) {
            return {
                top: parseFloat(parts[0]) || 0,
                right: parseFloat(parts[1]) || 0,
                bottom: parseFloat(parts[2]) || 0,
                left: parseFloat(parts[1]) || 0,
            }
        } else if (parts.length === 4) {
            return {
                top: parseFloat(parts[0]) || 0,
                right: parseFloat(parts[1]) || 0,
                bottom: parseFloat(parts[2]) || 0,
                left: parseFloat(parts[3]) || 0,
            }
        }
    }

    return { top, right, bottom, left }
}

/** Parse line-height to a multiplier for height estimation.
 *  Unitless values (e.g. "1.333") are already multipliers.
 *  px values (e.g. "20px") must be divided by fontSize.
 */
function parseLineHeightMultiplier(lineHeight: string | undefined, fontSize: number): number {
    if (!lineHeight || lineHeight === 'normal' || lineHeight === 'auto') return 1.5
    const val = parseFloat(lineHeight)
    if (isNaN(val)) return 1.5
    // If ends with 'px', it's an absolute value → convert to multiplier
    if (lineHeight.endsWith('px')) return val / fontSize
    // Otherwise it's a unitless multiplier (e.g. "1.333", "1.5")
    return val
}

function extractMargin(cs: CSSStyleDeclaration): { top: number; right: number; bottom: number; left: number } {
    // Use parsePx instead of || 0 — preserves negative margins (e.g., -ml-3 → -12px)
    return {
        top: parsePx(cs.marginTop),
        right: parsePx(cs.marginRight),
        bottom: parsePx(cs.marginBottom),
        left: parsePx(cs.marginLeft),
    }
}

/** Parse a CSS px value, preserving negatives. Returns 0 for non-px/empty. */
function parsePx(val: string): number {
    if (!val) return 0
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
}

/** Like parsePx but resolves percentage values against a reference size.
 *  Handles: "50%" → 50% of refSize, "16px" → 16, "calc(1/2 * 100%)" → 50% of refSize */
function parsePxOrPercent(val: string, refSize: number): number {
    if (!val) return 0
    const trimmed = val.trim()
    // Direct percentage: "50%"
    if (trimmed.endsWith('%')) {
        const pct = parseFloat(trimmed)
        return isNaN(pct) ? 0 : (pct / 100) * refSize
    }
    // calc(N/M * 100%) → percentage
    if (trimmed.startsWith('calc(')) {
        const fracPctMatch = trimmed.match(/calc\(\s*(-?\d+)\s*\/\s*(\d+)\s*\*\s*100%\s*\)/)
        if (fracPctMatch) {
            return (parseInt(fracPctMatch[1]) / parseInt(fracPctMatch[2])) * refSize
        }
        // calc(N%) → percentage
        const simplePctMatch = trimmed.match(/calc\(\s*(-?[\d.]+)%\s*\)/)
        if (simplePctMatch) {
            return (parseFloat(simplePctMatch[1]) / 100) * refSize
        }
    }
    return parsePx(val)
}

/**
 * Detect auto margins by reading el.style directly.
 * No display:none trick needed — we read inline style values.
 */
function extractAutoMargin(el: HTMLElement): { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean } | undefined {
    const s = el.style
    const auto: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean } = {}
    if (s.marginTop === 'auto') auto.top = true
    if (s.marginRight === 'auto') auto.right = true
    if (s.marginBottom === 'auto') auto.bottom = true
    if (s.marginLeft === 'auto') auto.left = true

    // Also check shorthand margin
    if (s.margin) {
        const parts = s.margin.trim().split(/\s+/)
        if (parts.length === 1 && parts[0] === 'auto') {
            auto.top = auto.right = auto.bottom = auto.left = true
        } else if (parts.length === 2) {
            if (parts[0] === 'auto') { auto.top = true; auto.bottom = true }
            if (parts[1] === 'auto') { auto.left = true; auto.right = true }
        } else if (parts.length === 4) {
            if (parts[0] === 'auto') auto.top = true
            if (parts[1] === 'auto') auto.right = true
            if (parts[2] === 'auto') auto.bottom = true
            if (parts[3] === 'auto') auto.left = true
        }
    }

    const hasAny = auto.top || auto.right || auto.bottom || auto.left
    return hasAny ? auto : undefined
}

/**
 * Extract flex item properties (grow, shrink, basis) from computed style.
 * Reads longhands first; falls back to parsing the `flex` shorthand.
 * This handles Tailwind's `flex-1` → `flex: 1 1 0%` which may not
 * always expand to longhands depending on the DOMParser environment.
 */
function extractFlexItemProps(cs: CSSStyleDeclaration): {
    layoutGrow?: number; flexShrink?: number; flexBasis?: number
} {
    const result: { layoutGrow?: number; flexShrink?: number; flexBasis?: number } = {}

    let grow = parseFloat(cs.flexGrow)
    let shrink = parseFloat(cs.flexShrink)
    let basis = cs.flexBasis

    // Fall back to parsing shorthand: "grow shrink basis" or "grow" or "none"
    if (isNaN(grow) && cs.flex && cs.flex !== 'none' && cs.flex !== 'auto' && cs.flex !== 'initial') {
        const parts = cs.flex.trim().split(/\s+/)
        if (parts.length >= 1) grow = parseFloat(parts[0]) || 0
        if (parts.length >= 2) shrink = parseFloat(parts[1])
        if (parts.length >= 3) basis = parts[2]
    }

    if (!isNaN(grow) && grow > 0) result.layoutGrow = grow
    if (!isNaN(shrink) && shrink !== 1) result.flexShrink = shrink
    if (basis && basis !== 'auto') {
        if (basis === '0px' || basis === '0%' || basis === '0') {
            result.flexBasis = 0 // Critical for flex-1 (flex: 1 1 0%) — equal split
        } else {
            const basisNum = parseFloat(basis)
            if (!isNaN(basisNum) && basisNum > 0) result.flexBasis = basisNum
        }
    }

    return result
}

function extractMinMaxConstraints(cs: CSSStyleDeclaration): {
    minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number
} {
    const result: { minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number } = {}
    const minW = parseFloat(cs.minWidth)
    if (minW > 0) result.minWidth = minW
    const maxW = parseFloat(cs.maxWidth)
    if (!isNaN(maxW) && cs.maxWidth !== 'none') result.maxWidth = maxW
    const minH = parseFloat(cs.minHeight)
    if (minH > 0) result.minHeight = minH
    const maxH = parseFloat(cs.maxHeight)
    if (!isNaN(maxH) && cs.maxHeight !== 'none') result.maxHeight = maxH
    return result
}

/**
 * Extract grid column/row spans from inline CSS.
 * Tailwind: col-span-2 → grid-column: span 2 / span 2
 *           row-span-2 → grid-row: span 2 / span 2
 */
function extractGridSpan(cs: CSSStyleDeclaration): { gridColumnSpan?: number; gridRowSpan?: number } {
    const result: { gridColumnSpan?: number; gridRowSpan?: number } = {}

    const gc = cs.gridColumn
    if (gc) {
        if (gc === '1 / -1') {
            result.gridColumnSpan = -1  // Full width
        } else {
            const spanMatch = gc.match(/span\s+(\d+)/)
            if (spanMatch) result.gridColumnSpan = parseInt(spanMatch[1])
        }
    }

    const gr = cs.gridRow
    if (gr) {
        if (gr === '1 / -1') {
            result.gridRowSpan = -1
        } else {
            const spanMatch = gr.match(/span\s+(\d+)/)
            if (spanMatch) result.gridRowSpan = parseInt(spanMatch[1])
        }
    }

    return result
}

/**
 * Extract raw CSS position values for absolute-positioned elements.
 * Paper-style: stores raw CSS strings instead of computing pixel x/y.
 * The canvas renderer resolves these against actual parent dimensions at render time.
 */
function extractCssPosition(cs: CSSStyleDeclaration): {
    cssPosition: NonNullable<import('@/types/canvas').BaseNodeProperties['cssPosition']>
    constraints: LayoutConstraints
} {
    const cssPosition: NonNullable<import('@/types/canvas').BaseNodeProperties['cssPosition']> = {}
    let hConstraint: LayoutConstraints['horizontal'] = 'left'
    let vConstraint: LayoutConstraints['vertical'] = 'top'

    let hasLeft = cs.left && cs.left !== 'auto'
    let hasRight = cs.right && cs.right !== 'auto'
    let hasTop = cs.top && cs.top !== 'auto'
    let hasBottom = cs.bottom && cs.bottom !== 'auto'

    // Safety net: if DOMParser didn't expand `inset` shorthand to longhands,
    // parse it manually. Tailwind's `inset-0` → `inset: 0px`.
    if (!hasLeft && !hasRight && !hasTop && !hasBottom) {
        const insetVal = (cs as unknown as Record<string, string>).inset
        if (insetVal && insetVal !== 'auto') {
            const parts = insetVal.trim().split(/\s+/)
            const top = parts[0]
            const right = parts[1] ?? parts[0]
            const bottom = parts[2] ?? parts[0]
            const left = parts[3] ?? parts[1] ?? parts[0]
            if (top !== 'auto') { hasTop = true; cssPosition.top = top }
            if (right !== 'auto') { hasRight = true; cssPosition.right = right }
            if (bottom !== 'auto') { hasBottom = true; cssPosition.bottom = bottom }
            if (left !== 'auto') { hasLeft = true; cssPosition.left = left }
        }
    }

    if (hasLeft) { cssPosition.left = cs.left; hConstraint = 'left' }
    if (hasRight) { cssPosition.right = cs.right; hConstraint = hasLeft ? 'leftRight' : 'right' }
    if (hasTop) { cssPosition.top = cs.top; vConstraint = 'top' }
    if (hasBottom) { cssPosition.bottom = cs.bottom; vConstraint = hasTop ? 'topBottom' : 'bottom' }

    // CSS translate property (Tailwind v4 uses this instead of transform)
    const translateProp = (cs as unknown as Record<string, string>).translate
    if (translateProp && translateProp !== 'none') cssPosition.translate = translateProp

    // Legacy CSS transform (translate/translateX/translateY)
    if (cs.transform && cs.transform !== 'none') cssPosition.transform = cs.transform

    return { cssPosition, constraints: { horizontal: hConstraint, vertical: vConstraint } }
}

/** Split CSS translate values that may contain nested calc() with spaces */
function splitTranslateValues(translate: string): string[] {
    // Split on spaces that are NOT inside parentheses
    const parts: string[] = []
    let current = ''
    let depth = 0
    for (const char of translate) {
        if (char === '(') depth++
        if (char === ')') depth--
        if (char === ' ' && depth === 0 && current.trim()) {
            parts.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    if (current.trim()) parts.push(current.trim())
    return parts
}

/** Parse a translate value: Npx → N, N% → N% of reference, calc(...) with fractions */
function parseTranslateValue(val: string, refSize: number): number {
    val = val.trim()

    // Direct px value
    if (val.endsWith('px')) return parsePx(val)

    // Percentage
    if (val.endsWith('%')) {
        const pct = parseFloat(val) || 0
        return (pct / 100) * refSize
    }

    // calc(N/M * 100%) → percentage-based offset
    // TW v4: calc(1/3 * 100%) or calc(calc(1/2 * 100%) * -1)
    if (val.startsWith('calc(')) {
        // Simple calc percentage: calc(33.3333%) or calc(-50%)
        const simplePct = val.match(/calc\(\s*(-?[\d.]+)%\s*\)/)
        if (simplePct) {
            return (parseFloat(simplePct[1]) / 100) * refSize
        }
        // Fraction pattern: calc(1/3 * 100%)
        const pctMatch = val.match(/calc\(\s*(\d+)\s*\/\s*(\d+)\s*\*\s*100%\s*\)/)
        if (pctMatch) {
            const fraction = parseInt(pctMatch[1]) / parseInt(pctMatch[2])
            return fraction * refSize
        }
        // Negative pattern: calc(calc(N/M * 100%) * -1)
        const negPctMatch = val.match(/calc\(\s*calc\(\s*(\d+)\s*\/\s*(\d+)\s*\*\s*100%\s*\)\s*\*\s*-1\s*\)/)
        if (negPctMatch) {
            const fraction = parseInt(negPctMatch[1]) / parseInt(negPctMatch[2])
            return -fraction * refSize
        }
        // Simple calc with px
        const simplePx = val.match(/calc\(\s*([+-]?[\d.]+)px\s*\)/)
        if (simplePx) return parseFloat(simplePx[1]) || 0
    }

    // Plain number
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
}

function extractBorder(cs: CSSStyleDeclaration): Border | undefined {
    // Early return: if no border-related inline styles are set, skip entirely
    if (!cs.borderTopWidth && !cs.borderRightWidth && !cs.borderBottomWidth && !cs.borderLeftWidth && !cs.borderWidth) {
        return undefined
    }

    // Check individual sides and shorthand
    const sides = [
        { side: 'top' as const, width: parseFloat(cs.borderTopWidth) || 0, color: cs.borderTopColor, style: cs.borderTopStyle },
        { side: 'right' as const, width: parseFloat(cs.borderRightWidth) || 0, color: cs.borderRightColor, style: cs.borderRightStyle },
        { side: 'bottom' as const, width: parseFloat(cs.borderBottomWidth) || 0, color: cs.borderBottomColor, style: cs.borderBottomStyle },
        { side: 'left' as const, width: parseFloat(cs.borderLeftWidth) || 0, color: cs.borderLeftColor, style: cs.borderLeftStyle },
    ]

    // Also check shorthand border
    const shorthandWidth = parseFloat(cs.borderWidth) || 0
    const shorthandColor = cs.borderColor
    const shorthandStyle = cs.borderStyle

    // Determine which sides are active
    const activeSides = sides.filter(s => s.width > 0)

    // If shorthand sets all sides uniformly
    if (shorthandWidth > 0 && shorthandColor && !isTransparentColor(shorthandColor)) {
        const color = rgbToHex(shorthandColor)
        if (color === 'transparent') return undefined
        return {
            color,
            width: shorthandWidth,
            style: (shorthandStyle === 'dashed' ? 'dashed'
                : shorthandStyle === 'dotted' ? 'dotted'
                    : 'solid') as 'solid' | 'dashed' | 'dotted',
            position: 'inside',
            opacity: rgbToOpacity(shorthandColor),
            visible: true,
        }
    }

    // No active sides at all
    if (activeSides.length === 0) return undefined

    // Find the best (thickest) active side for color/style reference
    let best = activeSides[0]
    for (const side of activeSides) {
        if (side.width > best.width) best = side
    }

    // Resolve color: prefer side-specific color, fall back to shorthand border-color
    const resolvedColor = best.color || shorthandColor
    if (!resolvedColor || isTransparentColor(resolvedColor)) return undefined
    const color = rgbToHex(resolvedColor)
    if (color === 'transparent') return undefined

    // Build sides flags
    const sideFlags = {
        top: (sides[0].width > 0),
        right: (sides[1].width > 0),
        bottom: (sides[2].width > 0),
        left: (sides[3].width > 0),
    }
    const allSides = sideFlags.top && sideFlags.right && sideFlags.bottom && sideFlags.left

    return {
        color,
        width: best.width,
        style: (best.style === 'dashed' ? 'dashed'
            : best.style === 'dotted' ? 'dotted'
                : 'solid') as 'solid' | 'dashed' | 'dotted',
        position: 'inside',
        opacity: rgbToOpacity(resolvedColor),
        visible: true,
        // Only set sides if NOT all 4 — omit for uniform borders (backward compatible)
        ...(allSides ? {} : { sides: sideFlags }),
    }
}

function extractBorderRadius(cs: CSSStyleDeclaration): BorderRadius {
    // TW v4 outputs calc(infinity * 1px) for rounded-full. parseFloat returns NaN.
    const parseBR = (val: string): number => {
        if (!val) return 0
        if (val.includes('infinity') || val.includes('9999')) return 9999
        return parseFloat(val) || 0
    }

    const tl = parseBR(cs.borderTopLeftRadius)
    const tr = parseBR(cs.borderTopRightRadius)
    const br = parseBR(cs.borderBottomRightRadius)
    const bl = parseBR(cs.borderBottomLeftRadius)

    // Also check shorthand
    if (tl === 0 && tr === 0 && br === 0 && bl === 0 && cs.borderRadius) {
        const val = parseBR(cs.borderRadius)
        if (val > 0) return val
    }

    if (tl === tr && tr === br && br === bl) return tl
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl }
}

function extractFills(cs: CSSStyleDeclaration): Fill[] {
    const fills: Fill[] = []

    // Background image (gradients or URLs)
    const bgImage = cs.backgroundImage
    let hasGradientOrImage = false
    if (bgImage && bgImage !== 'none') {
        if (bgImage.includes('gradient')) {
            const gradientFill = parseGradientFromComputed(bgImage)
            if (gradientFill) {
                fills.push(gradientFill)
                hasGradientOrImage = true
            }
        } else if (bgImage.includes('url(')) {
            const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/)
            if (urlMatch) {
                fills.push({
                    type: 'image',
                    id: generateId(),
                    src: urlMatch[1],
                    fit: mapBackgroundSizeFit(cs.backgroundSize),
                    visible: true,
                    opacity: 1,
                })
                hasGradientOrImage = true
            }
        }
    }

    // Background color
    const bgColor = cs.backgroundColor
    if (!hasGradientOrImage && bgColor && !isTransparentColor(bgColor)) {
        fills.push({
            type: 'solid',
            id: generateId(),
            color: rgbToHex(bgColor),
            opacity: rgbToOpacity(bgColor),
            visible: true,
        })
    }

    return fills
}

function extractLayerBlur(filter: string): { layerBlur: number } | Record<string, never> {
    if (!filter || filter === 'none') return {}
    const match = filter.match(/blur\(\s*([\d.]+)px\s*\)/)
    if (!match) return {}
    const val = parseFloat(match[1])
    return val > 0 ? { layerBlur: val } : {}
}

function extractShadows(boxShadow: string): Shadow[] {
    if (!boxShadow || boxShadow === 'none') return []

    const shadows: Shadow[] = []
    const parts = splitBoxShadowParts(boxShadow)

    for (const part of parts) {
        const shadow = parseSingleShadow(part.trim())
        if (shadow) shadows.push(shadow)
    }

    return shadows
}

function splitBoxShadowParts(boxShadow: string): string[] {
    const parts: string[] = []
    let current = ''
    let depth = 0

    for (const char of boxShadow) {
        if (char === '(') depth++
        if (char === ')') depth--
        if (char === ',' && depth === 0) {
            parts.push(current)
            current = ''
        } else {
            current += char
        }
    }
    if (current.trim()) parts.push(current)
    return parts
}

function parseSingleShadow(shadow: string): Shadow | null {
    const isInner = shadow.includes('inset')
    const cleaned = shadow.replace('inset', '').trim()

    let color: string
    let colorRaw: string
    let numsStr: string

    // ── Handle color-mix() — uses balanced-paren matching ──
    // Tailwind v4 outputs: color-mix(color-mix(rgb(r,g,b) N%, transparent) M%, transparent)
    // The simple regex can't handle nested parens, so we extract the full expression first.
    const cmIdx = cleaned.indexOf('color-mix(')
    if (cmIdx !== -1) {
        let depth = 0
        let end = cmIdx
        for (let i = cmIdx; i < cleaned.length; i++) {
            if (cleaned[i] === '(') depth++
            else if (cleaned[i] === ')') {
                depth--
                if (depth === 0) { end = i + 1; break }
            }
        }
        colorRaw = cleaned.substring(cmIdx, end)
        numsStr = (cleaned.substring(0, cmIdx) + cleaned.substring(end)).trim()

        // Resolve color-mix: extract base rgb color + multiply opacity percentages
        // color-mix(color-mix(rgb(r,g,b) P1%, transparent) P2%, transparent) → rgba(r,g,b, P1*P2/10000)
        const rgbMatch = colorRaw.match(/rgba?\(([^)]+)\)/)
        const percentages = [...colorRaw.matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => parseFloat(m[1]) / 100)
        const combinedOpacity = percentages.reduce((a, b) => a * b, 1)

        if (rgbMatch) {
            const baseHex = rgbToHex(`rgb(${rgbMatch[1]})`)
            const baseOpacity = rgbToOpacity(`rgb(${rgbMatch[1]})`)
            const finalOpacity = baseOpacity * combinedOpacity
            color = baseHex
            if (finalOpacity < 1) {
                const hex = color.replace('#', '')
                const alphaHex = Math.round(finalOpacity * 255).toString(16).padStart(2, '0')
                color = `#${hex}${alphaHex}`
            }
        } else {
            color = '#00000019' // fallback: black 10%
        }
    } else {
        // ── Standard color extraction: rgb(), rgba(), oklch(), hex ──
        const funcColorMatch = cleaned.match(/((?:rgba?|oklch|oklab|color)\([^)]+\))/)
        const hexColorMatch = !funcColorMatch ? cleaned.match(/(#[0-9a-fA-F]{3,8})\b/) : null

        if (funcColorMatch) {
            colorRaw = funcColorMatch[1]
            color = rgbToHex(colorRaw)
        } else if (hexColorMatch) {
            colorRaw = hexColorMatch[1]
            color = normalizeHex(colorRaw)
        } else {
            colorRaw = ''
            color = '#000000'
        }

        const opacity = colorRaw ? rgbToOpacity(colorRaw) : 1
        if (opacity < 1 && color !== 'transparent') {
            const hex = color.replace('#', '')
            const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0')
            color = `#${hex}${alphaHex}`
        }

        numsStr = colorRaw
            ? cleaned.replace(colorRaw, '').trim()
            : cleaned
    }

    const nums = numsStr
        .split(/\s+/)
        .filter(n => n.length > 0)
        .map(n => parseFloat(n) || 0)

    if (nums.length < 2) return null

    return {
        type: isInner ? 'inner' : 'drop',
        x: nums[0],
        y: nums[1],
        blur: nums[2] || 0,
        spread: nums[3] || 0,
        color,
        visible: true,
    }
}

// ═══════════════════════════════════════════════════
// Gradient Parsing
// ═══════════════════════════════════════════════════

function directionToAngle(dir: string): number {
    const normalized = dir.toLowerCase().replace(/\s+/g, ' ').trim()
    const map: Record<string, number> = {
        'top': 0, 'right': 90, 'bottom': 180, 'left': 270,
        'top right': 45, 'right top': 45,
        'bottom right': 135, 'right bottom': 135,
        'bottom left': 225, 'left bottom': 225,
        'top left': 315, 'left top': 315,
    }
    return map[normalized] ?? 180
}

function parseGradientFromComputed(bgImage: string): Fill | null {
    // linear-gradient
    const linearMatch = bgImage.match(/linear-gradient\((.+)\)/)
    if (linearMatch) {
        let content = linearMatch[1]

        // Pre-process: resolve color-mix() expressions to rgba equivalents FIRST
        // (Must happen before stripping color space hints, which would break
        //  the "in oklab" inside color-mix() expressions)
        // Handles TWO formats:
        //   Original CSS: color-mix(in oklab, #1C1917 80%, transparent)
        //   Browser-normalized: color-mix(rgb(28, 25, 23) 80%, transparent)
        const resolveColorMix = (colorStr: string, pct: string): string => {
            const hex = rgbToHex(colorStr)
            if (hex === 'transparent') return 'transparent'
            const r = parseInt(hex.slice(1, 3), 16) || 0
            const g = parseInt(hex.slice(3, 5), 16) || 0
            const b = parseInt(hex.slice(5, 7), 16) || 0
            const baseOpacity = rgbToOpacity(colorStr)
            return `rgba(${r}, ${g}, ${b}, ${(parseFloat(pct) / 100) * baseOpacity})`
        }
        // Forward: color-mix([in oklab,] <color> pct%, transparent)
        content = content.replace(
            /color-mix\(\s*(?:in\s+\w+\s*,\s*)?((?:rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}))\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
            (_full, color, pct) => resolveColorMix(color, pct)
        )
        // Inverse: color-mix([in oklab,] transparent, <color> pct%)
        content = content.replace(
            /color-mix\(\s*(?:in\s+\w+\s*,\s*)?transparent\s*,\s*((?:rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}))\s+([\d.]+)%\s*\)/g,
            (_full, color, pct) => resolveColorMix(color, pct)
        )

        // NOW strip color space hints from direction: "to top in oklab" → "to top"
        // Safe because color-mix() expressions have already been resolved above
        content = content.replace(/\s+in\s+\w+/g, '')

        // Parse gradient direction
        let angle = 180
        const angleMatch = content.match(/^([\d.]+)deg/)
        if (angleMatch) {
            angle = parseFloat(angleMatch[1])
        } else {
            const dirMatch = content.match(/^to\s+([\w\s]+?)(?:\s*,)/)
            if (dirMatch) {
                angle = directionToAngle(dirMatch[1].trim())
            }
        }

        const stops: Array<{ position: number; color: string; opacity?: number }> = []

        // Match color functions + hex + transparent keyword
        const colorStopRegex = /((?:rgba?|oklch|oklab|color)\([^)]+\)|#[0-9a-fA-F]{3,8}|transparent)\s*([\d.]+%)?/g
        let match
        while ((match = colorStopRegex.exec(content)) !== null) {
            const raw = match[1]
            if (raw === 'transparent') {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: '#000000',
                    opacity: 0,
                })
            } else if (raw.startsWith('#')) {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: normalizeHex(raw),
                    opacity: 1,
                })
            } else {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: rgbToHex(raw),
                    opacity: rgbToOpacity(raw),
                })
            }
        }

        if (stops.length > 0) {
            const hasPositions = stops.some(s => s.position >= 0)
            if (!hasPositions) {
                stops.forEach((s, idx) => { s.position = idx / Math.max(1, stops.length - 1) })
            } else {
                stops.forEach((s, idx) => {
                    if (s.position < 0) s.position = idx / Math.max(1, stops.length - 1)
                })
            }
        }

        // Fallback: hex colors
        if (stops.length === 0) {
            const hexRegex = /(#[0-9a-fA-F]{3,8})\s*([\d.]+%)?/g
            while ((match = hexRegex.exec(content)) !== null) {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : stops.length,
                    color: normalizeHex(match[1]),
                    opacity: 1,
                })
            }
            if (stops.length > 1 && !content.includes('%')) {
                stops.forEach((s, idx) => { s.position = idx / (stops.length - 1) })
            }
        }

        if (stops.length < 2) return null

        return {
            type: 'gradient',
            id: generateId(),
            gradientType: 'linear',
            angle,
            stops: stops.map(s => ({
                id: generateId(),
                position: s.position,
                color: s.color,
                opacity: s.opacity,
            })),
            visible: true,
            opacity: 1,
        }
    }

    // radial-gradient
    const radialMatch = bgImage.match(/radial-gradient\((.+)\)/)
    if (radialMatch) {
        let content = radialMatch[1]
        // Resolve color-mix() FIRST (before stripping color space hints)
        // Handles both original CSS and browser-normalized formats
        const resolveColorMixR = (colorStr: string, pct: string): string => {
            const hex = rgbToHex(colorStr)
            if (hex === 'transparent') return 'transparent'
            const r = parseInt(hex.slice(1, 3), 16) || 0
            const g = parseInt(hex.slice(3, 5), 16) || 0
            const b = parseInt(hex.slice(5, 7), 16) || 0
            const baseOpacity = rgbToOpacity(colorStr)
            return `rgba(${r}, ${g}, ${b}, ${(parseFloat(pct) / 100) * baseOpacity})`
        }
        content = content.replace(
            /color-mix\(\s*(?:in\s+\w+\s*,\s*)?((?:rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}))\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
            (_full, color, pct) => resolveColorMixR(color, pct)
        )
        content = content.replace(
            /color-mix\(\s*(?:in\s+\w+\s*,\s*)?transparent\s*,\s*((?:rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}))\s+([\d.]+)%\s*\)/g,
            (_full, color, pct) => resolveColorMixR(color, pct)
        )
        // Strip color space hints
        content = content.replace(/\s+in\s+\w+/g, '')

        const stops: Array<{ position: number; color: string; opacity?: number }> = []
        const colorStopRegex = /((?:rgba?|oklch|oklab|color)\([^)]+\)|#[0-9a-fA-F]{3,8}|transparent)\s*([\d.]+%)?/g
        let match
        while ((match = colorStopRegex.exec(content)) !== null) {
            const raw = match[1]
            if (raw === 'transparent') {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: '#000000',
                    opacity: 0,
                })
            } else if (raw.startsWith('#')) {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: normalizeHex(raw),
                    opacity: 1,
                })
            } else {
                stops.push({
                    position: match[2] ? parseFloat(match[2]) / 100 : -1,
                    color: rgbToHex(raw),
                    opacity: rgbToOpacity(raw),
                })
            }
        }
        if (stops.length > 0) {
            stops.forEach((s, idx) => {
                if (s.position < 0) s.position = idx / Math.max(1, stops.length - 1)
            })
        }

        if (stops.length < 2) return null

        return {
            type: 'gradient',
            id: generateId(),
            gradientType: 'radial',
            stops: stops.map(s => ({
                id: generateId(),
                position: s.position,
                color: s.color,
                opacity: s.opacity,
            })),
            visible: true,
            opacity: 1,
        }
    }

    // Fallback: store raw CSS gradient string
    return {
        type: 'gradient',
        id: generateId(),
        gradient: bgImage,
        visible: true,
        opacity: 1,
    }
}

// ═══════════════════════════════════════════════════
// Sizing Inference — DIRECT from CSS (no display:none trick)
// ═══════════════════════════════════════════════════

/**
 * Infer container sizing directly from inline CSS values.
 *
 * Key rules:
 *   - width: 100%  → fill
 *   - width: Npx   → fixed
 *   - flex: 1 / flexGrow > 0 → fill (on main axis)
 *   - No width set + block-level display → fill
 *   - Otherwise → hug
 */
function inferContainerSizing(
    el: HTMLElement,
    cs: CSSStyleDeclaration,
): Sizing {
    const isAbsoluteOrFixed = cs.position === 'absolute' || cs.position === 'fixed'

    // ── Absolute/fixed elements: determine sizing from position + dimensions ──
    if (isAbsoluteOrFixed) {
        const widthVal = cs.width
        const heightVal = cs.height

        // Check if inset/left+right/top+bottom constrain both edges → fill
        const hasLeft = (cs.left && cs.left !== 'auto') || false
        const hasRight = (cs.right && cs.right !== 'auto') || false
        const hasTop = (cs.top && cs.top !== 'auto') || false
        const hasBottom = (cs.bottom && cs.bottom !== 'auto') || false
        const insetVal = (cs as unknown as Record<string, string>).inset
        const hasInset = !!insetVal && insetVal !== 'auto'

        let horizontal: Sizing['horizontal'] = 'hug'
        if (widthVal && widthVal.endsWith('px')) {
            horizontal = 'fixed'
        } else if (widthVal && (widthVal === '100%' || (widthVal.endsWith('%') && parseFloat(widthVal) >= 99.5))) {
            horizontal = 'fill'
        } else if (widthVal && widthVal.endsWith('%')) {
            // Non-100% percentage (e.g. w-[60%]): treat as fixed.
            // The raw CSS percentage is preserved via cssWidth for the renderer.
            horizontal = 'fixed'
        } else if (hasInset || (hasLeft && hasRight)) {
            horizontal = 'fill'
        }

        let vertical: Sizing['vertical'] = 'hug'
        if (heightVal && heightVal.endsWith('px')) {
            vertical = 'fixed'
        } else if (heightVal && (heightVal === '100%' || (heightVal.endsWith('%') && parseFloat(heightVal) >= 99.5))) {
            vertical = 'fill'
        } else if (heightVal && heightVal.endsWith('%')) {
            // Non-100% percentage (e.g. h-[60%]): treat as fixed.
            vertical = 'fixed'
        } else if (heightVal && /\d+v[hw]/.test(heightVal)) {
            vertical = 'fixed'  // viewport units → fixed, resolved later
        } else if (hasInset || (hasTop && hasBottom)) {
            vertical = 'fill'
        }

        return { horizontal, vertical }
    }

    // Read parent's inline style for context
    const parentEl = el.parentElement
    const parentStyle = parentEl?.style
    const pDisplay = parentStyle?.display
    const pIsFlex = pDisplay === 'flex' || pDisplay === 'inline-flex'
    const parentIsFlexRow = pIsFlex &&
        (parentStyle!.flexDirection === 'row' || parentStyle!.flexDirection === '' || !parentStyle!.flexDirection)
    const parentIsFlexCol = pIsFlex &&
        parentStyle!.flexDirection === 'column'
    const parentIsGrid = pDisplay === 'grid' || pDisplay === 'inline-grid'

    let horizontal: 'fixed' | 'hug' | 'fill' = 'hug'
    let vertical: 'fixed' | 'hug' | 'fill' = 'hug'

    const widthVal = cs.width
    const heightVal = cs.height

    // Helper: check if value is 100% (fill)
    const isFull = (val: string) => {
        if (val === '100%') return true
        const n = parseFloat(val)
        return val.endsWith('%') && n >= 99.5
    }

    // Helper: check if value is a fixed length (px, rem, em, viewport units, or non-100% percentages)
    const isFixedLength = (val: string) =>
        val.endsWith('px') || val.endsWith('rem') || val.endsWith('em') ||
        /\d+d?v[hwminax]+$/.test(val) ||
        (val.endsWith('%') && !isFull(val))

    // Helper: check if cross-axis is stretched
    const isCrossStretched = () => {
        const alignSelf = cs.alignSelf
        if (alignSelf === 'stretch') return true
        if (!alignSelf || alignSelf === 'auto') {
            const pai = parentStyle?.alignItems
            return !pai || pai === 'stretch'
        }
        return false
    }

    // ── Horizontal sizing ──
    if (parentIsGrid) {
        horizontal = 'fill'
    } else if (parentIsFlexRow) {
        const fgRow = parseFloat(cs.flexGrow)
        const flexGrowsRow = (!isNaN(fgRow) && fgRow > 0) || cs.flex === '1' || cs.flex?.startsWith('1 ')
        if (flexGrowsRow) {
            horizontal = 'fill'
        } else if (widthVal && isFixedLength(widthVal)) {
            horizontal = 'fixed'
        } else if (widthVal && isFull(widthVal)) {
            horizontal = 'fill'
        } else if (widthVal && widthVal.endsWith('%')) {
            // Non-100% percentage width (e.g. w-1/2 → 50%) → treat as fixed
            horizontal = 'fixed'
        } else {
            horizontal = 'hug'
        }
    } else if (parentIsFlexCol) {
        if (widthVal && isFixedLength(widthVal)) {
            horizontal = 'fixed'
        } else if (widthVal && isFull(widthVal)) {
            horizontal = 'fill'
        } else if (widthVal && widthVal.endsWith('%')) {
            // Non-100% percentage width (e.g. w-3/4 → 75%) → treat as fixed
            horizontal = 'fixed'
        } else if (isCrossStretched()) {
            horizontal = 'fill'
        } else {
            horizontal = 'hug'
        }
    } else if (widthVal && isFixedLength(widthVal)) {
        horizontal = 'fixed'
    } else if (widthVal && isFull(widthVal)) {
        horizontal = 'fill'
    } else if (widthVal && widthVal.endsWith('%')) {
        // Non-100% percentage width → treat as fixed (resolved to pixels)
        horizontal = 'fixed'
    } else if (!widthVal || widthVal === 'auto' || widthVal === '') {
        // No width set: check display, then fall back to tag semantics
        const display = cs.display
        const tag = el.tagName.toLowerCase()
        // Tags that are inline by default should hug, not fill
        const INLINE_DEFAULT_TAGS = new Set([
            'a', 'span', 'button', 'label', 'li', 'strong', 'em', 'b', 'i',
            'code', 'small', 'input', 'select', 'textarea', 'img',
        ])
        const isBlockLevel = display
            ? BLOCK_DISPLAYS.has(display)
            : !INLINE_DEFAULT_TAGS.has(tag) // no display set → check tag default
        horizontal = (isBlockLevel && !isAbsoluteOrFixed) ? 'fill' : 'hug'
    }

    // ── Vertical sizing ──
    if (parentIsFlexCol) {
        const fgCol = parseFloat(cs.flexGrow)
        const flexGrowsCol = (!isNaN(fgCol) && fgCol > 0) || cs.flex === '1' || cs.flex?.startsWith('1 ')
        if (flexGrowsCol) {
            vertical = 'fill'
        } else if (heightVal && isFixedLength(heightVal)) {
            vertical = 'fixed'
        } else if (heightVal && isFull(heightVal)) {
            vertical = 'fill'
        } else {
            vertical = 'hug'
        }
    } else if (parentIsFlexRow) {
        if (isCrossStretched()) {
            if (!heightVal || heightVal === 'auto' || heightVal === '') {
                vertical = 'fill'
            } else if (isFixedLength(heightVal)) {
                vertical = 'fixed'
            } else if (isFull(heightVal)) {
                vertical = 'fill'
            }
        } else if (heightVal && isFixedLength(heightVal)) {
            vertical = 'fixed'
        } else if (heightVal && isFull(heightVal)) {
            vertical = 'fill'
        } else {
            vertical = 'hug'
        }
    } else if (parentIsGrid && heightVal && isFull(heightVal)) {
        vertical = 'fill'
    } else if (heightVal && isFixedLength(heightVal)) {
        vertical = 'fixed'
    } else if (heightVal && isFull(heightVal)) {
        vertical = 'fill'
    }
    // else leave as 'hug'

    return { horizontal, vertical }
}

/** Tags that are block-level by default in HTML (fill width) */
const BLOCK_LEVEL_TEXT_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'figcaption',
])

/** Tags that are inline by default in HTML (hug content) */
const INLINE_TEXT_TAGS = new Set([
    'a', 'span', 'button', 'label', 'li', 'strong', 'em', 'b', 'i',
    'code', 'small', 'sub', 'sup', 'mark', 'abbr', 'cite', 'time',
    'del', 'ins', 'kbd', 'var', 'u',
])

function inferTextSizing(
    tag: string,
    cs: CSSStyleDeclaration,
): Sizing {
    const display = cs.display

    // Explicit pixel width
    if (cs.width && cs.width.endsWith('px')) {
        const vertical = cs.height && cs.height.endsWith('px') ? 'fixed' as const : 'hug' as const
        return { horizontal: 'fixed', vertical }
    }

    // Width: 100% → fill
    if (cs.width === '100%') return { horizontal: 'fill', vertical: 'hug' }

    // If max-width is set (e.g. max-w-xl), the element is width-constrained
    // and should NOT use 'fill' sizing (which forces alignSelf:stretch,
    // overriding parent align-items:center). Use 'fixed' instead.
    const maxW = parseFloat(cs.maxWidth)
    const hasMaxWidth = !isNaN(maxW) && cs.maxWidth !== 'none' && maxW < 9999

    // Explicit display overrides tag defaults
    if (display === 'inline' || display === 'inline-block' || display === 'inline-flex') {
        return { horizontal: 'hug', vertical: 'hug' }
    }
    if (display === 'block' || display === 'flex' || display === 'grid') {
        return { horizontal: hasMaxWidth ? 'fixed' : 'fill', vertical: 'hug' }
    }

    // No explicit display → use HTML tag defaults
    if (INLINE_TEXT_TAGS.has(tag)) return { horizontal: 'hug', vertical: 'hug' }
    if (BLOCK_LEVEL_TEXT_TAGS.has(tag)) return { horizontal: hasMaxWidth ? 'fixed' : 'fill', vertical: 'hug' }

    // Unknown tag with no display → hug (safe default)
    return { horizontal: 'hug', vertical: 'hug' }
}

function inferAutoResize(tag: string, cs: CSSStyleDeclaration): TextNode['autoResize'] {
    if (cs.textOverflow === 'ellipsis') return 'none'
    if (cs.overflow === 'hidden' && cs.whiteSpace === 'nowrap') return 'none'

    // Check explicit display first, then fall back to tag defaults
    const display = cs.display
    if (display === 'block' || display === 'flex' || display === 'grid') return 'height'
    if (display === 'inline' || display === 'inline-block' || display === 'inline-flex') return 'width-and-height'

    // No explicit display → use HTML tag default
    if (BLOCK_LEVEL_TEXT_TAGS.has(tag)) return 'height'
    return 'width-and-height'

    return 'width-and-height'
}

function inferMaxLines(cs: CSSStyleDeclaration): number {
    const clamp = (cs as unknown as Record<string, string>)['-webkit-line-clamp'] ||
        (cs as unknown as Record<string, string>)['webkitLineClamp']
    if (clamp && clamp !== 'none') return parseInt(clamp) || 1

    if (cs.whiteSpace === 'nowrap') return 1

    return 1
}

// ═══════════════════════════════════════════════════
// Text Content Extraction
// ═══════════════════════════════════════════════════

function extractTextContent(el: HTMLElement): string {
    const preserveWhitespace = el.style.whiteSpace === 'pre' || el.style.whiteSpace === 'pre-wrap'

    if (preserveWhitespace) {
        return el.textContent || ''
    }

    let text = ''
    for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent || ''
        } else if (child.nodeName === 'BR') {
            text += '\n'
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childEl = child as HTMLElement
            const childTag = childEl.tagName.toLowerCase()
            const display = childEl.style.display
            if (INLINE_TAGS.has(childTag) || display === 'inline' || display === 'inline-block' || !display) {
                // For inline elements with no explicit display, include text if they are inline tags
                if (INLINE_TAGS.has(childTag) || display === 'inline' || display === 'inline-block') {
                    text += childEl.textContent || ''
                }
            }
        }
    }

    return text.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
}

import type { TextSegment } from '@/types/canvas'

function extractRichTextContent(el: HTMLElement, baseCs: CSSStyleDeclaration, baseInh?: InheritedStyles): { text: string, segments: TextSegment[] } {
    let text = ''
    const segments: TextSegment[] = []
    
    // We establish the baseline styles for the TextNode itself
    const baseline = mergeInherited(baseCs, baseInh)
    const preserveWhitespace = baseCs.whiteSpace === 'pre' || baseCs.whiteSpace === 'pre-wrap'

    function walk(node: Node, currentInh: InheritedStyles) {
        if (node.nodeType === Node.TEXT_NODE) {
            let raw = node.textContent || ''
            if (!raw) return

            if (!preserveWhitespace) {
                // Collapse whitespace but preserve newlines
                raw = raw.replace(/[^\S\n]+/g, ' ')
            }

            if (!raw) return
            
            const start = text.length
            text += raw
            const end = text.length

            // If this text has styling that differs from the baseline, create a segment
            const seg: any = { start, end }
            let hasDiff = false

            if (currentInh.color && currentInh.color !== baseline.color) {
                const hex = rgbToHex(currentInh.color)
                const alpha = rgbToOpacity(currentInh.color)
                const color = alpha < 1 && hex !== 'transparent'
                    ? `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
                    : hex
                seg.fills = [buildTextSolidFillFromColor(color)]
                hasDiff = true
            }
            if (currentInh.fontFamily && currentInh.fontFamily !== baseline.fontFamily) {
                seg.fontFamily = extractPrimaryFont(currentInh.fontFamily)
                hasDiff = true
            }
            if (currentInh.fontSize && currentInh.fontSize !== baseline.fontSize) {
                seg.fontSize = parseFloat(currentInh.fontSize)
                hasDiff = true
            }
            if (currentInh.fontWeight && currentInh.fontWeight !== baseline.fontWeight) {
                seg.fontWeight = parseInt(currentInh.fontWeight)
                hasDiff = true
            }
            if (currentInh.fontStyle && currentInh.fontStyle !== baseline.fontStyle) {
                seg.fontStyle = currentInh.fontStyle === 'italic' ? 'italic' : 'normal'
                hasDiff = true
            }
            if (currentInh.textDecoration && currentInh.textDecoration !== baseline.textDecoration) {
                seg.textDecoration = parseTextDecoration(currentInh.textDecoration)
                hasDiff = true
            }
            if (currentInh.letterSpacing && currentInh.letterSpacing !== baseline.letterSpacing) {
                seg.letterSpacing = currentInh.letterSpacing === 'normal' ? 0 : parseFloat(currentInh.letterSpacing)
                hasDiff = true
            }

            if (hasDiff) {
                segments.push(seg as TextSegment)
            }
        } else if (node.nodeName === 'BR') {
            text += '\n'
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const childEl = node as HTMLElement
            const childTag = childEl.tagName.toLowerCase()
            const childStyle = childEl.style
            const display = childStyle.display
            
            if (INLINE_TAGS.has(childTag) || display === 'inline' || display === 'inline-block' || !display) {
                // Merge styles for this inline element
                const mergedInh = mergeInherited(childStyle, currentInh)
                for (const child of childEl.childNodes) {
                    walk(child, mergedInh)
                }
            }
        }
    }

    for (const child of el.childNodes) {
        walk(child, baseline)
    }

    if (!preserveWhitespace) {
        // We trim the final text for leading/trailing whitespace
        const originalText = text
        text = text.trim()
        const trimStart = originalText.length - originalText.trimStart().length
        
        // Adjust segment indices
        if (trimStart > 0 || text.length !== originalText.length) {
            for (let i = segments.length - 1; i >= 0; i--) {
                const seg = segments[i]
                seg.start -= trimStart
                seg.end -= trimStart
                // Clamp to bounds
                seg.start = Math.max(0, Math.min(seg.start, text.length))
                seg.end = Math.max(0, Math.min(seg.end, text.length))
                if (seg.start === seg.end) {
                    segments.splice(i, 1) // Remove empty segments
                }
            }
        }
    }

    return { text, segments }
}

function isTextOnlyElement(el: HTMLElement, tag: string): boolean {
    if (TEXT_ONLY_TAGS.has(tag)) {
        if (el.children.length === 0) return true
        // Check if inline children have distinct styling (visual OR text styling)
        for (const child of el.children) {
            const childStyle = (child as HTMLElement).style
            if (hasVisualProperties(childStyle)) return false
            // Check for distinct text styling that affects layout (font-size, font-weight).
            // Color-only and font-style differences are acceptable to flatten — the alternative
            // (flex-row wrap) can't replicate inline text flow and breaks word wrapping.
            if (childStyle.fontSize || childStyle.fontWeight) return false
        }
        return true
    }

    // Flex/grid containers should never be flattened
    const display = el.style.display
    if (display === 'flex' || display === 'grid' || display === 'inline-flex' || display === 'inline-grid') {
        return false
    }

    if (el.children.length === 0) return !!el.textContent?.trim()

    // Check if ALL children are inline with no visual properties
    for (const child of el.children) {
        const childEl = child as HTMLElement
        const childTag = childEl.tagName?.toLowerCase()
        const childDisplay = childEl.style?.display

        // Children with flex/grid layout are never inline text
        if (childDisplay === 'flex' || childDisplay === 'grid' || childDisplay === 'inline-flex' || childDisplay === 'inline-grid') return false

        // Children that have their own element children are structural, not inline text
        if (childEl.children.length > 0) return false

        const isInline = INLINE_TAGS.has(childTag) || childDisplay === 'inline' || childDisplay === 'inline-block'
        if (!isInline) return false
        if (hasVisualProperties(childEl.style)) return false
        // Check for distinct text styling that affects layout (font-size, font-weight).
        // Color-only differences are acceptable to flatten for proper text wrapping.
        const cStyle = childEl.style
        if (cStyle?.fontSize || cStyle?.fontWeight) return false
    }

    return true
}

// ═══════════════════════════════════════════════════
// Node Naming
// ═══════════════════════════════════════════════════

function inferNodeName(el: HTMLElement, tag: string, children: ScytleNode[]): string {
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) return ariaLabel

    const dataName = el.getAttribute('data-name')
    if (dataName) return dataName

    if (SEMANTIC_NAMES[tag]) return SEMANTIC_NAMES[tag]

    const cls = el.className
    if (typeof cls === 'string') {
        if (cls.includes('hero')) return 'Hero'
        if (cls.includes('card')) return 'Card'
        if (cls.includes('feature')) return 'Features'
        if (cls.includes('testimonial')) return 'Testimonials'
        if (cls.includes('cta')) return 'CTA'
        if (cls.includes('pricing')) return 'Pricing'
        if (cls.includes('faq')) return 'FAQ'
        if (cls.includes('contact')) return 'Contact'
    }

    const heading = el.querySelector('h1, h2, h3')
    if (heading?.textContent) return heading.textContent.trim().slice(0, 40)

    if (tag === 'button' || tag === 'a') {
        const text = el.textContent?.trim()
        if (text && text.length < 40) return text
    }

    return 'Frame'
}

function inferSvgName(el: SVGSVGElement): string {
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) return ariaLabel

    const title = el.querySelector('title')
    if (title?.textContent) return title.textContent.trim()

    const className = el.getAttribute('class') || ''
    if (className.includes('lucide-')) {
        const match = className.match(/lucide-(\S+)/)
        if (match) return match[1].replace(/-/g, ' ')
    }

    return 'Icon'
}

// ═══════════════════════════════════════════════════
// CSS Value Mappers
// ═══════════════════════════════════════════════════

function mapJustifyContent(value: string): Layout['justify'] {
    switch (value) {
        case 'flex-start': case 'start': return 'start'
        case 'flex-end': case 'end': return 'end'
        case 'center': return 'center'
        case 'space-between': return 'between'
        case 'space-around': return 'around'
        case 'space-evenly': return 'evenly'
        default: return 'start'
    }
}

function mapAlignItems(value: string): Layout['align'] {
    switch (value) {
        case 'flex-start': case 'start': return 'start'
        case 'flex-end': case 'end': return 'end'
        case 'center': return 'center'
        case 'stretch': return 'stretch'
        case 'baseline': return 'baseline'
        default: return 'stretch'
    }
}

function mapAlignSelf(value: string): { alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch' | 'baseline' } {
    switch (value) {
        case 'flex-start': case 'start': return { alignSelf: 'start' }
        case 'flex-end': case 'end': return { alignSelf: 'end' }
        case 'center': return { alignSelf: 'center' }
        case 'stretch': return { alignSelf: 'stretch' }
        case 'baseline': return { alignSelf: 'baseline' }
        default: return {}
    }
}

function mapTextAlign(value: string): TextNode['textAlign'] {
    switch (value) {
        case 'left': case 'start': return 'left'
        case 'right': case 'end': return 'right'
        case 'center': return 'center'
        case 'justify': return 'justify'
        default: return 'left'
    }
}

function mapTextTransform(value: string): TextNode['textTransform'] {
    switch (value) {
        case 'uppercase': return 'uppercase'
        case 'lowercase': return 'lowercase'
        case 'capitalize': return 'capitalize'
        default: return 'none'
    }
}

function parseTextDecoration(value: string): TextNode['textDecoration'] {
    if (!value) return 'none'
    if (value.includes('underline')) return 'underline'
    if (value.includes('line-through')) return 'line-through'
    return 'none'
}

function mapObjectFit(value: string): string {
    switch (value) {
        case 'cover': return 'cover'
        case 'contain': return 'contain'
        case 'fill': return 'fill'
        default: return 'cover'
    }
}

function mapBackgroundSizeFit(value: string): 'cover' | 'contain' | 'fill' | 'tile' | 'crop' {
    if (value === 'cover') return 'cover'
    if (value === 'contain') return 'contain'
    return 'cover'
}

function inferHtmlTag(tag: string): TextNode['htmlTag'] | undefined {
    return HTML_TAG_MAP[tag] ?? undefined
}

// ═══════════════════════════════════════════════════
// SVG Helpers
// ═══════════════════════════════════════════════════

/**
 * Resolve currentColor in SVG by walking the parent chain's el.style.color.
 * Walk up element.style to resolve currentColor.
 */
function resolveCurrentColor(el: SVGSVGElement, cs: CSSStyleDeclaration): string | undefined {
    const fill = el.getAttribute('fill')
    if (fill === 'none') return undefined
    if (fill === 'currentColor') {
        return resolveCurrentColorFromChain(el) || '#000000'
    }
    if (!fill) {
        const firstPath = el.querySelector('path, circle, rect, ellipse, polygon, polyline')
        const childFill = firstPath?.getAttribute('fill')
        if (childFill === 'none') return undefined
        if (childFill === 'currentColor' || !childFill) {
            return resolveCurrentColorFromChain(el) || '#000000'
        }
        if (childFill.startsWith('#')) return childFill
        if (childFill.startsWith('rgb')) return rgbToHex(childFill)
        return resolveCurrentColorFromChain(el) || '#000000'
    }
    if (fill.startsWith('#')) return fill
    if (fill.startsWith('rgb')) return rgbToHex(fill)
    return resolveCurrentColorFromChain(el) || '#000000'
}

/**
 * Walk parent chain reading el.style.color to resolve currentColor.
 * Returns hex color or undefined.
 */
function resolveCurrentColorFromChain(el: Element): string | undefined {
    let current: Element | null = el
    while (current) {
        if (current instanceof HTMLElement && current.style.color) {
            return rgbToHex(current.style.color)
        }
        current = current.parentElement
    }
    return undefined
}

// ═══════════════════════════════════════════════════
// Visual Property Detection
// ═══════════════════════════════════════════════════

function hasVisualProperties(cs: CSSStyleDeclaration): boolean {
    const hasBg = !!cs.backgroundColor && !isTransparentColor(cs.backgroundColor)
    const hasBorder = (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderWidth) > 0) &&
        (!!cs.borderTopColor ? !isTransparentColor(cs.borderTopColor) : !!cs.borderColor && !isTransparentColor(cs.borderColor))
    const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none'
    const hasBgImage = !!cs.backgroundImage && cs.backgroundImage !== 'none'
    const hasPadding = parseFloat(cs.paddingTop) > 0 ||
        parseFloat(cs.paddingRight) > 0 ||
        parseFloat(cs.paddingBottom) > 0 ||
        parseFloat(cs.paddingLeft) > 0 ||
        parseFloat(cs.padding) > 0
    const hasBorderRadius = parseFloat(cs.borderTopLeftRadius) > 0 ||
        parseFloat(cs.borderTopRightRadius) > 0 ||
        parseFloat(cs.borderBottomLeftRadius) > 0 ||
        parseFloat(cs.borderBottomRightRadius) > 0 ||
        parseFloat(cs.borderRadius) > 0

    return hasBg || hasBorder || hasShadow || hasBgImage || hasPadding || hasBorderRadius
}

// ═══════════════════════════════════════════════════
// Font Utilities
// ═══════════════════════════════════════════════════

function extractPrimaryFont(fontFamily: string): string {
    if (!fontFamily) return 'Inter'
    return fontFamily
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '')
}

// ═══════════════════════════════════════════════════
// Dimension Estimation
// ═══════════════════════════════════════════════════

const CHAR_WIDTH_RATIO = 0.55

function estimateTextWidth(text: string, fontSize: number): number {
    if (!text) return 50
    return Math.ceil(text.length * fontSize * CHAR_WIDTH_RATIO)
}

function estimateContainerWidth(
    children: ScytleNode[],
    padding: Padding,
    layout: Layout,
): number {
    const gap = layout.gap || 0
    const direction = layout.direction || 'column'
    const flowChildren = children.filter(c => c.positioning !== 'absolute')
    if (flowChildren.length === 0) return padding.left + padding.right + 40

    const childOuterWidth = (c: ScytleNode) => {
        const w = c.width || 40
        const ml = c.margin?.left || 0
        const mr = c.margin?.right || 0
        return w + ml + mr
    }

    if (direction === 'row') {
        let total = padding.left + padding.right
        for (let i = 0; i < flowChildren.length; i++) {
            total += childOuterWidth(flowChildren[i])
            if (i > 0) total += gap
        }
        return total
    } else {
        const maxW = Math.max(...flowChildren.map(childOuterWidth))
        return padding.left + padding.right + maxW
    }
}

function estimateContainerHeight(
    children: ScytleNode[],
    padding: Padding,
    layout: Layout,
): number {
    const gap = layout.gap || 0
    const direction = layout.direction || 'column'

    // Exclude absolute children from height estimation (they don't contribute to flow)
    const flowChildren = children.filter(c => c.positioning !== 'absolute')

    if (flowChildren.length === 0) return padding.top + padding.bottom + 40

    // Helper to get child height including its margins
    const childOuterHeight = (c: ScytleNode) => {
        const h = c.height || 40
        const mt = c.margin?.top || 0
        const mb = c.margin?.bottom || 0
        return h + mt + mb
    }

    if (layout.mode === 'grid' && layout.columns && typeof layout.columns === 'number') {
        // Grid: arrange children in rows of N columns
        const cols = layout.columns
        const rowGap = layout.rowGap || layout.gap || 0
        let totalH = padding.top + padding.bottom
        for (let i = 0; i < flowChildren.length; i += cols) {
            const rowChildren = flowChildren.slice(i, i + cols)
            const rowH = Math.max(...rowChildren.map(childOuterHeight))
            totalH += rowH
            if (i > 0) totalH += rowGap
        }
        return totalH
    }

    if (direction === 'column') {
        let total = padding.top + padding.bottom
        for (let i = 0; i < flowChildren.length; i++) {
            total += childOuterHeight(flowChildren[i])
            if (i > 0) total += gap
        }
        return total
    } else {
        const maxH = Math.max(...flowChildren.map(childOuterHeight))
        return padding.top + padding.bottom + maxH
    }
}

// ═══════════════════════════════════════════════════
// Position Assignment
// ═══════════════════════════════════════════════════

function assignChildPositions(frame: FrameNode): void {
    if (frame.layout.mode === 'none') return

    if (frame.layout.mode === 'grid') {
        for (const child of frame.children) {
            child.x = 0
            child.y = 0
            if (child.type === 'frame') {
                assignChildPositions(child)
            }
        }
        return
    }

    const direction = frame.layout.direction || 'column'
    const gap = frame.layout.gap || 0

    let offset = 0
    let prevChildProcessed = false

    for (const child of frame.children) {
        if (child.positioning === 'absolute') continue

        const margin = child.margin || { top: 0, right: 0, bottom: 0, left: 0 }

        if (prevChildProcessed) {
            offset += gap
        }

        if (direction === 'column') {
            offset += margin.top
            child.x = 0
            child.y = offset
            offset += child.height + margin.bottom
        } else {
            offset += margin.left
            child.x = offset
            child.y = 0
            offset += child.width + margin.right
        }

        prevChildProcessed = true

        if (child.type === 'frame') {
            assignChildPositions(child)
        }
    }
}

// ═══════════════════════════════════════════════════
// Empty Frame Helper
// ═══════════════════════════════════════════════════

function createEmptyPageFrame(name: string, width: number): FrameNode {
    return createFrame({
        id: generateId(),
        name,
        width,
        height: 800,
        children: [],
        layout: { mode: 'flex', direction: 'column' },
        sizing: { horizontal: 'fixed', vertical: 'hug' },
    })
}
