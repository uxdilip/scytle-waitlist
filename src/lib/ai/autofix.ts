// ============================================================
// HTML Autofix Pass
// Fast regex/string pass that fixes common AI generation mistakes
// before the HTML is parsed into ScytleNodes.
// Runs after section assembly, before Tailwind-to-inline + DOMParser.
// ============================================================

/**
 * Strip markdown code fences that models sometimes wrap HTML in.
 */
function stripMarkdownFences(html: string): string {
    const trimmed = html.trim()
    // Match ```html ... ``` or ``` ... ```
    const fenceMatch = trimmed.match(/^```(?:html)?\s*\n([\s\S]*?)```\s*$/)
    if (fenceMatch) return fenceMatch[1].trim()
    return trimmed
}

/**
 * Void elements that are legitimately self-closing.
 */
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Fix self-closing non-void tags: <div /> → <div></div>
 * DOMParser treats self-closing non-void tags incorrectly.
 */
function fixSelfClosingTags(html: string): string {
    return html.replace(/<([\w-]+)(\s[^>]*)?\s*\/>/gi, (match, tag, attrs = '') =>
        VOID_ELEMENTS.has(tag.toLowerCase()) ? match : `<${tag}${attrs}></${tag}>`
    )
}

/**
 * Remove forbidden Tailwind classes that break the canvas parser.
 * Operates on class attribute values.
 */
function cleanClassAttribute(classStr: string): string {
    const classes = classStr.split(/\s+/).filter(Boolean)

    const forbidden = new Set([
        // Divide, ring, backdrop
        ...classes.filter(c => /^divide-/.test(c)),
        ...classes.filter(c => /^ring-/.test(c)),
        ...classes.filter(c => /^backdrop-/.test(c)),
        // Interactive states
        ...classes.filter(c => /^(hover|focus|active|group-hover|focus-within|focus-visible):/.test(c)),
        // Responsive prefixes
        ...classes.filter(c => /^(sm|md|lg|xl|2xl):/.test(c)),
        // Dark mode
        ...classes.filter(c => /^dark:/.test(c)),
        // Transitions & animations
        ...classes.filter(c => /^(transition|animate|duration|ease|delay)-/.test(c)),
        // Transforms
        ...classes.filter(c => /^(transform|rotate|translate|scale|skew)-/.test(c)),
        ...classes.filter(c => c === 'transform'),
        // Z-index, order
        ...classes.filter(c => /^(z|order)-/.test(c)),
    ])

    return classes.filter(c => !forbidden.has(c)).join(' ')
}

/**
 * Full autofix pass on generated HTML.
 */
export function autofixHtml(html: string): string {
    let fixed = html

    // 1. Strip markdown fences
    fixed = stripMarkdownFences(fixed)

    // 2. Fix self-closing non-void tags
    fixed = fixSelfClosingTags(fixed)

    // 3. Clean all class attributes
    fixed = fixed.replace(/class="([^"]*)"/g, (_match, classStr) => {
        const cleaned = cleanClassAttribute(classStr)
        return `class="${cleaned}"`
    })

    // 4. Ensure all images have alt text
    fixed = fixed.replace(/<img(?![^>]*alt=)/g, '<img alt="image"')

    // 5. Ensure all SVGs have xmlns
    fixed = fixed.replace(/<svg(?![^>]*xmlns=)/g, '<svg xmlns="http://www.w3.org/2000/svg"')

    // 6. Remove empty class attributes left by cleaning
    fixed = fixed.replace(/\s*class=""\s*/g, ' ')

    // 7. Clean up whitespace
    fixed = fixed.replace(/\n{3,}/g, '\n\n')

    return fixed.trim()
}

/**
 * Assemble multiple section HTML strings into a full page.
 */
export function assemblePage(sections: string[], pageName: string): string {
    const cleanedSections = sections
        .map(s => autofixHtml(s))
        .filter(s => s.length > 0)

    // Wrap in a root flex-col container
    const assembled = `<div class="flex flex-col w-full" data-page="${pageName}">
${cleanedSections.join('\n')}
</div>`

    return assembled
}
