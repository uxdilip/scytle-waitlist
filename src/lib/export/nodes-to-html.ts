// ============================================================
// ScytleNode Tree → HTML String
// Recursive converter: FrameNode→<div>, TextNode→<h1>/<p>,
// ImageNode→<img>. Produces clean, semantic HTML+Tailwind.
// ============================================================

import type { ScytleNode, FrameNode, TextNode, ImageNode, VectorNode, Fill, ImageFill } from '@/types/canvas'
import { buildFrameClasses, buildTextClasses, buildImageClasses } from './class-builder'
import { networkToSVGPath } from '@/lib/vector-utils'
import { resolveVectorStroke } from '@/lib/vector-stroke'

// ---- Public API ----

/**
 * Convert a single ScytleNode (and its children) to HTML.
 */
export function nodeToHtml(node: ScytleNode, indent: number = 0): string {
    switch (node.type) {
        case 'frame': return frameToHtml(node, indent)
        case 'text': return textToHtml(node, indent)
        case 'image': return imageToHtml(node, indent)
        case 'vector': return vectorToHtml(node, indent)
        default: return ''
    }
}

/**
 * Convert a page frame's children to body HTML.
 * Does NOT include the page frame itself — just its content.
 */
export function nodesToBodyHtml(pageFrame: FrameNode): string {
    return pageFrame.children.map(child => nodeToHtml(child, 0)).join('\n')
}

/**
 * Convert a page frame to a complete root HTML structure.
 * Wraps in a root <div> with the page frame's background/layout classes.
 */
export function pageFrameToHtml(pageFrame: FrameNode): string {
    const classes = buildFrameClasses(pageFrame)
    const inner = pageFrame.children.map(child => nodeToHtml(child, 1)).join('\n')
    return classes
        ? `<div class="${classes}">\n${inner}\n</div>`
        : `<div>\n${inner}\n</div>`
}

// ---- Node Converters ----

function frameToHtml(node: FrameNode, indent: number): string {
    const pad = '  '.repeat(indent)
    const tag = inferSemanticTag(node)
    let classes = buildFrameClasses(node)

    // If this is a frame with an image fill and no children, emit <img>
    const imageFill = node.fills.find((f): f is ImageFill => f.type === 'image' && 'src' in f && !!f.src)
    if (imageFill && node.children.length === 0) {
        const src = escapeAttr(imageFill.src)
        const alt = escapeAttr(node.name || 'Image')
        const imgClasses = [classes, 'object-cover'].filter(Boolean).join(' ')
        return `${pad}<img src="${src}" alt="${alt}" class="${imgClasses}" />`
    }

    // If this is a button-like frame, emit <button>
    if (isButtonLikeFrame(node)) {
        const textChild = node.children[0] as TextNode
        const btnClasses = classes
        const text = escapeHtml(textChild.characters)
        const textClasses = buildTextClasses(textChild)
        // Merge text classes into button classes
        return `${pad}<button class="${btnClasses} ${textClasses}">${text}</button>`
    }

    if (node.children.length === 0) {
        return classes
            ? `${pad}<${tag} class="${classes}"></${tag}>`
            : `${pad}<${tag}></${tag}>`
    }

    // Add `relative` if any child uses absolute positioning (vector nodes, or
    // explicitly absolute-positioned frames). Without it, position:absolute on
    // a child escapes to a distant ancestor and the element appears in the wrong place.
    const hasAbsoluteChild = node.children.some(
        (c) => c.type === 'vector' || c.positioning === 'absolute'
    )
    if (hasAbsoluteChild) {
        const existingClasses = classes ? classes.split(' ') : []
        if (!existingClasses.includes('relative')) {
            classes = classes ? `${classes} relative` : 'relative'
        }
    }

    const childIndent = indent + 1
    const children = node.children.map(child => nodeToHtml(child, childIndent)).join('\n')

    return classes
        ? `${pad}<${tag} class="${classes}">\n${children}\n${pad}</${tag}>`
        : `${pad}<${tag}>\n${children}\n${pad}</${tag}>`
}

function textToHtml(node: TextNode, indent: number): string {
    const pad = '  '.repeat(indent)
    const tag = node.htmlTag || inferTextTag(node)
    const classes = buildTextClasses(node)
    const text = escapeHtml(node.characters)

    return classes
        ? `${pad}<${tag} class="${classes}">${text}</${tag}>`
        : `${pad}<${tag}>${text}</${tag}>`
}

function imageToHtml(node: ImageNode, indent: number): string {
    const pad = '  '.repeat(indent)
    const classes = buildImageClasses(node)
    const src = node.isPlaceholder
        ? `https://placehold.co/${node.width}x${node.height}`
        : node.src
    const alt = escapeHtml(node.alt || 'Image')

    return classes
        ? `${pad}<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="${classes}" />`
        : `${pad}<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />`
}

function vectorToHtml(node: VectorNode, indent: number): string {
    const pad = '  '.repeat(indent)
    const d = networkToSVGPath(node.vectorNetwork)
    if (!d) return ''
    const stroke = resolveVectorStroke(node)

    // Build fill <path> elements
    const fillPaths = node.fills
        .filter((f) => f.visible !== false)
        .map((f) => `${pad}  <path d="${d}" fill="${fillToSVGAttr(f)}"${f.opacity != null && f.opacity < 1 ? ` fill-opacity="${f.opacity}"` : ''} />`)

    // Build stroke <path> element
    const strokePath = stroke.visible
        ? `${pad}  <path d="${d}" fill="none" stroke="${escapeAttr(stroke.color)}" stroke-width="${stroke.width}"${stroke.opacity < 1 ? ` stroke-opacity="${stroke.opacity}"` : ''} stroke-linecap="${strokeCapToSVG(stroke.cap)}" stroke-linejoin="${strokeJoinToSVG(stroke.join)}" />`
        : ''

    const style = `position:absolute;left:${node.x}px;top:${node.y}px;${node.opacity < 1 ? `opacity:${node.opacity};` : ''}overflow:visible;`

    const inner = [...fillPaths, strokePath].filter(Boolean).join('\n')

    return `${pad}<svg width="${node.width}" height="${node.height}" viewBox="0 0 ${node.width} ${node.height}" style="${style}">\n${inner}\n${pad}</svg>`
}

function fillToSVGAttr(fill: Fill): string {
    if (fill.type === 'solid') return fill.color
    if (fill.type === 'gradient' && fill.gradient) return fill.gradient
    return 'none'
}

function strokeCapToSVG(cap: string): string {
    switch (cap) {
        case 'ROUND': return 'round'
        case 'SQUARE': return 'square'
        default: return 'butt'
    }
}

function strokeJoinToSVG(join: string): string {
    switch (join) {
        case 'ROUND': return 'round'
        case 'BEVEL': return 'bevel'
        default: return 'miter'
    }
}

// ---- Semantic Tag Inference ----

function inferSemanticTag(node: FrameNode): string {
    const name = node.name.toLowerCase()
    if (name.includes('nav')) return 'nav'
    if (name.includes('header')) return 'header'
    if (name.includes('footer')) return 'footer'
    if (name.includes('section')) return 'section'
    if (name.includes('main')) return 'main'
    if (name.includes('aside') || name.includes('sidebar')) return 'aside'
    if (name.includes('article')) return 'article'
    if (name.includes('list')) return 'ul'
    if (name.includes('form')) return 'form'
    if (name.includes('figure')) return 'figure'
    if (name.includes('caption')) return 'figcaption'
    return 'div'
}

function inferTextTag(node: TextNode): string {
    // Infer from font size
    if (node.fontSize >= 48) return 'h1'
    if (node.fontSize >= 36) return 'h2'
    if (node.fontSize >= 24) return 'h3'
    if (node.fontSize >= 20) return 'h4'
    if (node.fontSize >= 18) return 'h5'
    return 'p'
}

function isButtonLikeFrame(node: FrameNode): boolean {
    if (node.children.length !== 1) return false
    if (node.children[0].type !== 'text') return false
    // Has background fill and padding
    const hasBg = node.fills.length > 0
    const hasStroke = node.border !== undefined || (node.strokes?.some((stroke) => stroke.visible !== false && stroke.width > 0) ?? false)
    const hasPadding = node.padding.left >= 8 || node.padding.right >= 8
    const isSmall = node.children[0].type === 'text' && (node.children[0] as TextNode).characters.length < 50
    return (hasBg || hasStroke) && hasPadding && isSmall
}

// ---- Utilities ----

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}
