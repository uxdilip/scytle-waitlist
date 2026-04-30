// ============================================================
// Export Node — DOM-based raster/vector export via html-to-image
//
// How the canvas renders nodes:
// - All sizes use:   calc(Npx * var(--z, 1))
// - Top-level left:  calc(Xpx * var(--z, 1) + var(--px, 0) * 1px)
// - Top-level top:   calc(Ypx * var(--z, 1) + var(--py, 0) * 1px)
//
// html-to-image clones the subtree and reads COMPUTED styles.
// At zoom != 1, computed "width: calc(1440px * 0.25)" = "360px",
// which gets baked into the clone → tiny content in a 1440px canvas.
//
// Fix: Clone the target element into an OFF-SCREEN container that
// has --z=1, --px=0, --py=0. This makes all calc() expressions
// evaluate at true 1x dimensions. Then capture the clone.
// The live canvas is NEVER modified → no visual glitch.
// ============================================================

import { toPng, toJpeg, toSvg } from 'html-to-image'
import type { ScytleNode, FrameNode } from '@/types/canvas'
import { nodeToHtml, pageFrameToHtml } from './nodes-to-html'
import { wrapInDocument } from './html-template'

// ── Types ────────────────────────────────────────────────────

export type ExportFormat = 'PNG' | 'JPG' | 'SVG' | 'HTML'

export interface ExportConfig {
    id: string
    format: ExportFormat
    scale: number      // 0.5, 1, 1.5, 2, 3, 4
    suffix: string     // e.g. '@2x', appended before extension
}

export interface ExportResult {
    blob: Blob
    filename: string
}

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_EXPORT_CONFIG: Omit<ExportConfig, 'id'> = {
    format: 'PNG',
    scale: 1,
    suffix: '',
}

export const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
    { value: 'PNG', label: 'PNG' },
    { value: 'JPG', label: 'JPG' },
    { value: 'SVG', label: 'SVG' },
    { value: 'HTML', label: 'HTML' },
]

export const SCALE_OPTIONS = [
    { value: '0.5', label: '0.5x' },
    { value: '1', label: '1x' },
    { value: '1.5', label: '1.5x' },
    { value: '2', label: '2x' },
    { value: '3', label: '3x' },
    { value: '4', label: '4x' },
]

// ── Filename builder ─────────────────────────────────────────

function buildFilename(nodeName: string, config: ExportConfig): string {
    const safe = nodeName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'export'
    const ext = config.format.toLowerCase()
    return `${safe}${config.suffix}.${ext}`
}

// ── Find DOM element for a node ──────────────────────────────

function findNodeElement(nodeId: string): HTMLElement | null {
    return document.querySelector(`[data-node-id="${nodeId}"]`)
}

// ── Filter: skip editor chrome (selection, tooltips, etc.) ───

function exportFilter(domNode: HTMLElement): boolean {
    if (domNode.nodeType !== 1) return true
    if (domNode.dataset?.selectionOverlay) return false
    if (domNode.classList?.contains('selection-box')) return false
    return true
}

// ── Off-screen clone for 1x capture ──────────────────────────
// Instead of mutating the live viewport (which causes glitch + empty
// exports), we deep-clone the target into an invisible container
// with --z=1, --px=0, --py=0. All calc() expressions resolve at 1x.

async function createOffscreenClone(
    sourceEl: HTMLElement,
    node: ScytleNode,
): Promise<{ wrapper: HTMLElement; clone: HTMLElement; actualHeight: number }> {
    // Copy ALL stylesheets into the off-screen context so computed
    // styles (fonts, custom properties, etc.) resolve identically.
    // html-to-image walks getComputedStyle on the SOURCE element's
    // tree — but we're giving it our CLONE, so the clone must live
    // in a context that inherits the same CSS variables.

    const wrapper = document.createElement('div')
    wrapper.style.cssText = [
        'position: fixed',
        'left: -99999px',
        'top: -99999px',
        `width: ${node.width}px`,
        // Use a large height initially so the clone can render fully
        // (nodes with sizing.vertical='hug' grow beyond node.height)
        'height: auto',
        'overflow: visible',
        'pointer-events: none',
        'z-index: -1',
        // Force 1x scale, no pan — this is the key fix
        '--z: 1',
        '--px: 0',
        '--py: 0',
    ].join('; ')

    // Deep-clone the target element (with all children)
    const clone = sourceEl.cloneNode(true) as HTMLElement

    // Reset the clone's position so it renders at 0,0 inside the wrapper.
    // The original has left: calc(Xpx * var(--z) + var(--px) * 1px)
    // With --z=1 and --px=0, that becomes X px. We need 0,0.
    clone.style.position = 'relative'
    clone.style.left = '0'
    clone.style.top = '0'
    // Fix width at 1x. For height: if the node uses 'hug' sizing the stored
    // node.height may be stale — let the DOM determine the actual height.
    clone.style.width = `${node.width}px`
    // Remove any inline height so hug-sized frames expand to their content.
    clone.style.height = ''

    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)

    // Wait for two animation frames so the browser computes layout + paint
    await new Promise<void>((resolve) => requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
    }))

    // Measure the actual rendered height of the clone.
    // Use scrollHeight so we capture all content even if the original
    // had overflow:hidden that was masking content below node.height.
    const actualHeight = Math.max(
        clone.getBoundingClientRect().height,
        clone.scrollHeight,
        node.height,
    )

    // Now lock the wrapper to the actual rendered height so html-to-image
    // captures the full content (not just the stored node.height).
    wrapper.style.height = `${actualHeight}px`
    wrapper.style.overflow = 'hidden'

    return { wrapper, clone, actualHeight }
}

function removeOffscreenClone(wrapper: HTMLElement) {
    wrapper.remove()
}

// ── Shared html-to-image options builder ─────────────────────

function buildOptions(node: ScytleNode, scale: number, actualHeight?: number, fontEmbedCSS?: string, extra?: Record<string, unknown>) {
    return {
        width: node.width,
        height: actualHeight ?? node.height,
        pixelRatio: scale,
        // skipFonts avoids html-to-image reading cross-origin stylesheets (Tailwind CDN,
        // Google Fonts CDN) which throws SecurityError: Cannot access cssRules.
        // We pass fontEmbedCSS instead — pre-fetched from document fonts only, no CORS issue.
        skipFonts: true,
        ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
        filter: exportFilter,
        ...extra,
    }
}

// ── Pre-fetch font embed CSS safely (avoids CORS on cross-origin sheets) ─────
// html-to-image's built-in font embed iterates document.styleSheets and throws
// SecurityError on cross-origin sheets (Tailwind CDN, Google Fonts CDN).
// We collect @font-face rules ourselves, skipping any cross-origin sheet.
async function collectFontEmbedCSS(_el: HTMLElement): Promise<string> {
    return collectSameOriginFontFaces()
}

// ── Core export pipeline ─────────────────────────────────────

async function captureRaster(
    node: ScytleNode,
    el: HTMLElement,
    format: 'PNG' | 'JPG',
    scale: number,
    actualHeight?: number,
): Promise<Blob> {
    const fontEmbedCSS = await collectFontEmbedCSS(el)
    const options = buildOptions(node, scale, actualHeight, fontEmbedCSS, {
        backgroundColor: format === 'JPG' ? '#ffffff' : undefined,
    })

    if (format === 'PNG') {
        const dataUrl = await toPng(el, options)
        return dataUrlToBlob(dataUrl)
    } else {
        const dataUrl = await toJpeg(el, { ...options, quality: 0.95 })
        return dataUrlToBlob(dataUrl)
    }
}

async function captureSvg(node: ScytleNode, el: HTMLElement, actualHeight?: number): Promise<Blob> {
    const fontEmbedCSS = await collectFontEmbedCSS(el)
    const options = buildOptions(node, 1, actualHeight, fontEmbedCSS)
    const dataUrl = await toSvg(el, options)
    const svgXml = decodeURIComponent(dataUrl.split(',')[1] || '')
    return new Blob([svgXml], { type: 'image/svg+xml' })
}

// ── HTML capture: serialize the live DOM with inlined styles ─────────────────
// The node-tree → Tailwind-class serializer (nodes-to-html.ts) loses fidelity:
// oklch colors, icon SVGs, borders, shadows, etc. all differ subtly.
// Instead we capture the actual rendered DOM, inline all computed styles,
// collect all referenced stylesheets, and wrap in a standalone document.
// This gives a pixel-accurate HTML snapshot of what the canvas shows.

async function captureHtml(node: ScytleNode): Promise<Blob> {
    const el = findNodeElement(node.id)
    if (!el) {
        // Fallback: node not in DOM (e.g. hidden page) — use tree serializer
        const html = node.type === 'frame'
            ? wrapInDocument(pageFrameToHtml(node as FrameNode), node.name)
            : wrapInDocument(nodeToHtml(node), node.name)
        return new Blob([html], { type: 'text/html' })
    }

    // Create off-screen clone at 1x so all calc() values resolve correctly
    const { wrapper, clone, actualHeight } = await createOffscreenClone(el, node)

    let html: string
    try {
        html = buildDomHtml(clone, node, actualHeight)
    } finally {
        removeOffscreenClone(wrapper)
    }

    return new Blob([html], { type: 'text/html' })
}

/**
 * Serialize a cloned DOM subtree into a self-contained HTML document.
 * Inlines all computed styles on every element so the file renders identically
 * in any browser without external stylesheets or CSS variables.
 */
function buildDomHtml(root: HTMLElement, node: ScytleNode, actualHeight: number): string {
    // Deep-clone again so we can mutate styles without touching the capture clone
    const snapshot = root.cloneNode(true) as HTMLElement

    // Walk every element and bake computed styles into inline style attributes.
    // This ensures colors (oklch, CSS vars), sizes, fonts, etc. are preserved.
    inlineComputedStyles(root, snapshot)

    // Set explicit dimensions on the root so it renders at the correct size
    snapshot.style.width = `${node.width}px`
    snapshot.style.height = `${actualHeight}px`
    snapshot.style.position = 'relative'
    snapshot.style.overflow = 'hidden'

    const bodyHtml = snapshot.outerHTML

    // Collect all @font-face rules from same-origin stylesheets
    const fontCss = collectSameOriginFontFaces()

    const safeTitle = node.name.replace(/[<>&"]/g, (c) =>
        c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'
    )

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${node.width}, initial-scale=1.0">
    <title>${safeTitle}</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { width: ${node.width}px; }
        ${fontCss}
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

/**
 * Recursively copy getComputedStyle() from source nodes into dest nodes'
 * inline style attributes. This bakes every visual property so the HTML
 * is standalone — no external CSS, no CSS variables, no custom properties needed.
 *
 * We walk both trees in parallel (same structure since dest is a clone of source).
 */
function inlineComputedStyles(source: Element, dest: Element): void {
    if (source.nodeType !== Node.ELEMENT_NODE) return

    const src = source as HTMLElement
    const dst = dest as HTMLElement

    const computed = window.getComputedStyle(src)
    // Only inline the properties that matter for visual fidelity.
    // Inlining ALL properties causes issues (e.g. 'all: initial' conflicts).
    const VISUAL_PROPS = [
        'display', 'position', 'top', 'left', 'right', 'bottom',
        'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
        'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
        'align-items', 'align-self', 'justify-content', 'gap', 'grid-template-columns',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'background-color', 'background-image', 'background-size', 'background-position',
        'background-repeat', 'background-clip',
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration',
        'white-space', 'word-break', 'overflow', 'text-overflow',
        'border', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left',
        'box-shadow', 'opacity', 'transform', 'transform-origin',
        'cursor', 'pointer-events', 'z-index',
        'outline', 'outline-offset',
    ]
    for (const prop of VISUAL_PROPS) {
        const val = computed.getPropertyValue(prop)
        if (val && val !== 'initial' && val !== 'normal' && val !== 'none' && val !== '0px' && val !== 'auto') {
            dst.style.setProperty(prop, val)
        }
    }

    // Recurse into children
    const srcChildren = Array.from(source.children)
    const dstChildren = Array.from(dest.children)
    for (let i = 0; i < srcChildren.length; i++) {
        if (dstChildren[i]) {
            inlineComputedStyles(srcChildren[i], dstChildren[i])
        }
    }
}

/**
 * Collect @font-face rules from same-origin stylesheets only.
 * Cross-origin sheets (Tailwind CDN, Google Fonts CDN) are skipped
 * to avoid SecurityError: Cannot access cssRules.
 */
function collectSameOriginFontFaces(): string {
    const rules: string[] = []
    try {
        for (const sheet of Array.from(document.styleSheets)) {
            // Skip cross-origin sheets — accessing .cssRules throws SecurityError
            if (sheet.href && !sheet.href.startsWith(window.location.origin)) continue
            try {
                for (const rule of Array.from(sheet.cssRules)) {
                    if (rule.type === CSSRule.FONT_FACE_RULE) {
                        rules.push(rule.cssText)
                    }
                }
            } catch {
                // Cross-origin sheet slipped through — skip silently
            }
        }
    } catch {
        // styleSheets not accessible — return empty
    }
    return rules.join('\n')
}

// ── Public API ───────────────────────────────────────────────

/**
 * Export a single node with the given config.
 * Creates an off-screen clone at 1x scale for accurate capture.
 * The live canvas is never modified — no visual glitch.
 */
export async function exportNode(
    node: ScytleNode,
    config: ExportConfig,
): Promise<ExportResult> {
    const filename = buildFilename(node.name, config)

    if (config.format === 'HTML') {
        return { blob: await captureHtml(node), filename }
    }

    const el = findNodeElement(node.id)
    if (!el) {
        throw new Error(`Cannot find rendered element for node "${node.name}"`)
    }

    // Create off-screen clone with --z=1 for accurate 1x capture
    const { wrapper, clone, actualHeight } = await createOffscreenClone(el, node)

    let blob: Blob
    try {
        switch (config.format) {
            case 'PNG':
            case 'JPG':
                blob = await captureRaster(node, clone, config.format, config.scale, actualHeight)
                break
            case 'SVG':
                blob = await captureSvg(node, clone, actualHeight)
                break
            default:
                throw new Error(`Unsupported format: ${config.format}`)
        }
    } finally {
        // Always clean up the off-screen clone
        removeOffscreenClone(wrapper)
    }

    return { blob, filename }
}

/**
 * Export a node with multiple configs (like Figma's multi-export).
 */
export async function exportNodeMulti(
    node: ScytleNode,
    configs: ExportConfig[],
): Promise<ExportResult[]> {
    const results: ExportResult[] = []
    for (const config of configs) {
        results.push(await exportNode(node, config))
    }
    return results
}

/**
 * Trigger browser download for a blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Quick export: export node with given config and immediately download.
 */
export async function quickExport(
    node: ScytleNode,
    config: ExportConfig,
): Promise<void> {
    const { blob, filename } = await exportNode(node, config)
    downloadBlob(blob, filename)
}

// ── Helpers ──────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
}
