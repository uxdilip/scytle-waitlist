/**
 * Tailwind-to-Inline Style Converter
 *
 * Converts HTML with Tailwind classes to HTML with inline styles.
 * Uses tailwindcss v4's __unstable__loadDesignSystem API (server-only).
 *
 * Why: DOMParser reads element.style (inline styles only), not computed styles.
 * Tailwind classes must be resolved to inline styles before parsing.
 */

import { __unstable__loadDesignSystem } from 'tailwindcss'

// Hide ALL Node.js APIs from Turbopack's bundler via eval('require').
// Turbopack intercepts bare require/require.resolve/fs/path and rewrites paths.
// This file only runs server-side (runtime = 'nodejs' in the API route).
// eslint-disable-next-line no-eval
const _require: NodeRequire = eval('require')
const _fs: typeof import('fs') = _require('fs')
const _path: typeof import('path') = _require('path')

// ─── Types ───────────────────────────────────────

interface ConversionResult {
  html: string
  /** Classes that couldn't be resolved (for debugging) */
  unresolvedClasses: string[]
}

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>

// ─── Design System Singleton ─────────────────────

let _ds: DesignSystem | null = null
let _dsPromise: Promise<DesignSystem> | null = null

async function getDesignSystem(): Promise<DesignSystem> {
  if (_ds) return _ds
  if (_dsPromise) return _dsPromise

  _dsPromise = __unstable__loadDesignSystem('@import "tailwindcss";', {
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tailwindcss') {
        const cssPath = _require.resolve('tailwindcss/index.css')
        return {
          path: cssPath,
          base: _path.dirname(cssPath),
          content: _fs.readFileSync(cssPath, 'utf-8'),
        }
      }
      const resolved = _require.resolve(id, { paths: [base] })
      return {
        path: resolved,
        base: _path.dirname(resolved),
        content: _fs.readFileSync(resolved, 'utf-8'),
      }
    },
  })

  _ds = await _dsPromise
  _dsPromise = null
  return _ds
}

// ─── CSS Variable Resolution Cache ──────────────

const _varCache = new Map<string, string>()

async function resolveVar(ds: DesignSystem, varRef: string): Promise<string> {
  const cached = _varCache.get(varRef)
  if (cached !== undefined) return cached

  // Extract variable name from var(...) — handle nested var() with fallback
  const match = varRef.match(/^var\(([^,)]+?)(?:,\s*(.+))?\)$/)
  if (!match) return varRef

  const varName = match[1].trim()
  const fallback = match[2]?.trim()

  const resolved = ds.resolveThemeValue(varName)
  if (resolved) {
    // Resolve might itself contain var() references
    const final = resolved.includes('var(')
      ? await resolveAllVars(ds, resolved)
      : resolved
    _varCache.set(varRef, final)
    return final
  }

  // Try fallback
  if (fallback) {
    const resolvedFallback = fallback.includes('var(')
      ? await resolveAllVars(ds, fallback)
      : fallback
    _varCache.set(varRef, resolvedFallback)
    return resolvedFallback
  }

  _varCache.set(varRef, varRef)
  return varRef
}

async function resolveAllVars(ds: DesignSystem, value: string): Promise<string> {
  // Iteratively resolve var() references (may be nested)
  let result = value
  let maxIterations = 10

  while (result.includes('var(') && maxIterations-- > 0) {
    // Find innermost var() first (no nested var() inside)
    const varPattern = /var\([^()]*\)/g
    let changed = false
    const promises: Array<{ match: string; resolved: Promise<string> }> = []

    let m: RegExpExecArray | null
    while ((m = varPattern.exec(result)) !== null) {
      promises.push({ match: m[0], resolved: resolveVar(ds, m[0]) })
    }

    const resolved = await Promise.all(promises.map((p) => p.resolved))
    for (let i = 0; i < promises.length; i++) {
      if (promises[i].match !== resolved[i]) {
        result = result.replace(promises[i].match, resolved[i])
        changed = true
      }
    }

    if (!changed) break
  }

  return result
}

// ─── Color Conversion ───────────────────────────

/**
 * Convert oklch() color values to hex in a CSS value string.
 * DOMParser's element.style doesn't reliably expose oklch values.
 */
function resolveOklchToHex(value: string): string {
  // Match oklch(L C H) or oklch(L C H / alpha)
  return value.replace(
    /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g,
    (_, lStr, pct, cStr, hStr, alphaStr) => {
      let L = parseFloat(lStr)
      if (pct === '%') L = L / 100
      const C = parseFloat(cStr)
      const H = parseFloat(hStr)

      // oklch → oklab
      const hRad = (H * Math.PI) / 180
      const a = C * Math.cos(hRad)
      const b = C * Math.sin(hRad)

      // oklab → linear sRGB (via LMS)
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b
      const s_ = L - 0.0894841775 * a - 1.2914855480 * b

      const l = l_ * l_ * l_
      const m = m_ * m_ * m_
      const s = s_ * s_ * s_

      const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
      const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
      const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

      const toSrgb = (x: number) => {
        if (x <= 0) return 0
        if (x >= 1) return 255
        return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255)
      }

      const r = Math.min(255, Math.max(0, toSrgb(rLin)))
      const g = Math.min(255, Math.max(0, toSrgb(gLin)))
      const bVal = Math.min(255, Math.max(0, toSrgb(bLin)))

      const hex = '#' + [r, g, bVal].map(c => c.toString(16).padStart(2, '0')).join('')

      // Preserve alpha if present
      const alpha = alphaStr !== undefined ? parseFloat(alphaStr) : 1
      if (alpha < 1) {
        return `rgba(${r}, ${g}, ${bVal}, ${alpha})`
      }
      return hex
    }
  )
}

// ─── Unit Conversion ─────────────────────────────

/**
 * Convert CSS logical properties to physical properties.
 * Tailwind v4 outputs logical properties (padding-inline, margin-block, etc.)
 * but DOMParser's element.style doesn't reliably expand them to physical properties.
 */
const LOGICAL_TO_PHYSICAL: Record<string, string[]> = {
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'padding-inline-start': ['padding-left'],
  'padding-inline-end': ['padding-right'],
  'padding-block-start': ['padding-top'],
  'padding-block-end': ['padding-bottom'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'margin-inline-start': ['margin-left'],
  'margin-inline-end': ['margin-right'],
  'margin-block-start': ['margin-top'],
  'margin-block-end': ['margin-bottom'],
  'border-inline-width': ['border-left-width', 'border-right-width'],
  'border-block-width': ['border-top-width', 'border-bottom-width'],
  'border-inline-style': ['border-left-style', 'border-right-style'],
  'border-block-style': ['border-top-style', 'border-bottom-style'],
  'border-inline-color': ['border-left-color', 'border-right-color'],
  'border-block-color': ['border-top-color', 'border-bottom-color'],
  'inset': ['top', 'right', 'bottom', 'left'],
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  'inset-inline-start': ['left'],
  'inset-inline-end': ['right'],
  'inset-block-start': ['top'],
  'inset-block-end': ['bottom'],
}

function logicalToPhysical(props: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [prop, value] of Object.entries(props)) {
    const physical = LOGICAL_TO_PHYSICAL[prop]
    if (physical) {
      for (const p of physical) {
        if (!(p in result) && !(p in props)) {
          result[p] = value
        }
      }
    } else {
      result[prop] = value
    }
  }
  return result
}

function remToPx(value: string): string {
  return value.replace(/([\d.]+)rem\b/g, (_, n) => `${parseFloat(n) * 16}px`)
}

function resolveCalc(value: string): string {
  // Resolve calc() expressions that contain only simple arithmetic
  return value.replace(/calc\(([^)]+)\)/g, (_, expr: string) => {
    const trimmed = expr.trim()

    // Try simple binary operation: A op B  (with optional units)
    const binMatch = trimmed.match(/^([\d.]+)(px|rem)?\s*([*/+-])\s*([\d.-]+)(px|rem)?$/)
    if (binMatch) {
      const a = parseFloat(binMatch[1])
      const unitA = binMatch[2] || ''
      const op = binMatch[3]
      const b = parseFloat(binMatch[4])
      const unitB = binMatch[5] || ''
      const unit = unitA || unitB || ''

      let result: number
      switch (op) {
        case '*': result = a * b; break
        case '/': result = b !== 0 ? a / b : 0; break
        case '+': result = a + b; break
        case '-': result = a - b; break
        default: return `calc(${expr})`
      }

      // For division, result is unitless if both sides have same unit
      if (op === '/' && unitA === unitB) return `${Math.round(result * 1000) / 1000}`
      return `${Math.round(result * 1000) / 1000}${unit}`
    }

    // Reverse order for multiplication: N * Apx
    const revMatch = trimmed.match(/^([\d.-]+)\s*\*\s*([\d.]+)(px|rem)?$/)
    if (revMatch) {
      const a = parseFloat(revMatch[1])
      const b = parseFloat(revMatch[2])
      const unit = revMatch[3] || ''
      return `${Math.round(a * b * 1000) / 1000}${unit}`
    }

    // Tailwind v4 fraction-percentage: N/M * 100% (e.g., 3/4 * 100% → 75%)
    const fracPctMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)\s*\*\s*100%$/)
    if (fracPctMatch) {
      const result = (parseInt(fracPctMatch[1]) / parseInt(fracPctMatch[2])) * 100
      return `${Math.round(result * 1000) / 1000}%`
    }

    return `calc(${expr})`
  })
}

// ─── CSS Rule Parsing ─────────────────────────────

interface ParsedRule {
  /** Standard CSS properties (e.g., display, background-color) */
  props: Record<string, string>
  /** Internal --tw-* custom properties set by this class */
  twVars: Map<string, string>
  /** @property initial-values from this class's CSS */
  initials: Map<string, string>
}

function parseRuleRaw(cssRule: string): ParsedRule {
  const props: Record<string, string> = {}
  const twVars = new Map<string, string>()
  const initials = new Map<string, string>()

  // Skip rules with nested selectors (@media, &:hover, etc.) — these can't be inlined
  // Rules with @property blocks are fine (they declare initial values)
  // Look for actual selector nesting: &:hover, @media inside the main block
  const hasNestedSelectors = /\{\s*(?:&[:\s]|@media)/.test(cssRule)
  if (hasNestedSelectors) return { props, twVars, initials }

  // Extract @property initial-values
  const propertyPattern = /@property\s+(--[\w-]+)\s*\{[^}]*initial-value:\s*([^;}]+)/g
  let propMatch: RegExpExecArray | null
  while ((propMatch = propertyPattern.exec(cssRule)) !== null) {
    initials.set(propMatch[1].trim(), propMatch[2].trim())
  }

  // Extract the main rule block (first { ... })
  const blockMatch = cssRule.match(/\{([^}]+)\}/)
  if (!blockMatch) return { props, twVars, initials }

  const declarations = blockMatch[1].split(';').filter(Boolean)
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) continue
    const prop = decl.substring(0, colonIdx).trim()
    const value = decl.substring(colonIdx + 1).trim()
    if (!prop || !value) continue

    if (prop.startsWith('--tw-')) {
      twVars.set(prop, value)
    } else {
      props[prop] = value
    }
  }

  return { props, twVars, initials }
}

/**
 * Merge all CSS rules for an element's classes, then resolve internal --tw-* vars.
 * Handles deeply nested var() references (e.g., gradient stops chain).
 */
function mergeAndResolve(parsedRules: ParsedRule[]): Record<string, string> {
  const allTwVars = new Map<string, string>()
  const allInitials = new Map<string, string>()
  const allProps: Record<string, string> = {}

  for (const rule of parsedRules) {
    for (const [k, v] of rule.initials) allInitials.set(k, v)
    for (const [k, v] of rule.twVars) allTwVars.set(k, v)
    Object.assign(allProps, rule.props)
  }

  /**
   * Resolve a string containing var() references.
   * Handles nested var() with proper paren balancing.
   * Only resolves --tw-* vars; leaves theme vars (--spacing, --color-*) for later.
   */
  function resolveStr(str: string, depth = 0): string {
    if (depth > 10 || !str.includes('var(--tw-')) return str

    let result = ''
    let i = 0
    while (i < str.length) {
      const varStart = str.indexOf('var(--tw-', i)
      if (varStart === -1) {
        result += str.substring(i)
        break
      }

      // Copy everything before var(
      result += str.substring(i, varStart)

      // Parse var(--tw-name) or var(--tw-name, fallback)
      let j = varStart + 4 // skip "var("
      // Extract variable name
      let nameEnd = j
      while (nameEnd < str.length && /[\w-]/.test(str[nameEnd])) nameEnd++
      const varName = str.substring(j, nameEnd)

      // Skip whitespace
      while (nameEnd < str.length && str[nameEnd] === ' ') nameEnd++

      let fallback: string | undefined
      if (str[nameEnd] === ',') {
        // Has fallback — collect with balanced parens
        nameEnd++ // skip comma
        while (nameEnd < str.length && str[nameEnd] === ' ') nameEnd++
        let parenDepth = 1
        const fallbackStart = nameEnd
        while (nameEnd < str.length && parenDepth > 0) {
          if (str[nameEnd] === '(') parenDepth++
          else if (str[nameEnd] === ')') parenDepth--
          if (parenDepth > 0) nameEnd++
        }
        fallback = str.substring(fallbackStart, nameEnd).trim()
        nameEnd++ // skip closing paren
      } else if (str[nameEnd] === ')') {
        nameEnd++ // skip closing paren
      } else {
        // Malformed — just skip
        result += str.substring(varStart, nameEnd)
        i = nameEnd
        continue
      }

      // Resolve: twVars > initials > fallback
      const resolved = allTwVars.get(varName) ?? allInitials.get(varName)
      if (resolved !== undefined) {
        result += resolveStr(resolved, depth + 1)
      } else if (fallback !== undefined) {
        result += resolveStr(fallback, depth + 1)
      } else {
        result += '' // unresolvable
      }
      i = nameEnd
    }

    return result
  }

  // First resolve all --tw-* vars themselves (they may reference each other)
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (const [name, value] of allTwVars) {
      if (value.includes('var(--tw-')) {
        const resolved = resolveStr(value)
        if (resolved !== value) {
          allTwVars.set(name, resolved)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  // Now resolve standard properties
  for (const [prop, value] of Object.entries(allProps)) {
    if (!value.includes('var(--tw-')) continue

    let resolved = resolveStr(value)

    // Clean up transparent shadows/rings (0 0 #0000)
    if (resolved.includes('0 0 #0000')) {
      resolved = resolved
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== '0 0 #0000')
        .join(', ')
    }

    if (resolved && resolved !== 'initial') {
      allProps[prop] = resolved
    } else {
      delete allProps[prop]
    }
  }

  return allProps
}

// ─── Main Conversion Logic ───────────────────────

export async function convertTailwindToInline(html: string): Promise<ConversionResult> {
  const ds = await getDesignSystem()
  const unresolvedClasses: string[] = []

  // Collect all unique classes across the entire HTML
  const uniqueClasses = new Set<string>()
  const classAttrPattern = /class="([^"]*)"/g

  let match: RegExpExecArray | null
  while ((match = classAttrPattern.exec(html)) !== null) {
    const classes = match[1].split(/\s+/).filter(Boolean)
    for (const c of classes) uniqueClasses.add(c)
  }

  if (uniqueClasses.size === 0) return { html, unresolvedClasses: [] }

  // Filter out variant/responsive classes — they produce CSS with @media / &:hover
  // selectors that cannot be represented as inline styles.
  // HOWEVER: responsive classes (sm:, md:, lg:, xl:, 2xl:) should NOT be discarded.
  // Since we design for a fixed desktop width (1440px), responsive variants should
  // be promoted to their base utility (e.g., lg:grid-cols-3 → grid-cols-3) and
  // override the base class. This is critical — without it, everything renders at
  // the mobile 1-column breakpoint.
  const RESPONSIVE_PREFIXES = new Set(['sm', 'md', 'lg', 'xl', '2xl'])
  // Priority order: higher breakpoints override lower ones (mobile-first cascade)
  const BREAKPOINT_PRIORITY: Record<string, number> = { sm: 1, md: 2, lg: 3, xl: 4, '2xl': 5 }

  // Map: original responsive class → { base utility name, breakpoint priority }
  const responsiveToBase = new Map<string, { base: string; priority: number }>()

  const filteredClasses = new Set<string>()
  for (const cls of uniqueClasses) {
    const variantMatch = cls.match(/^([a-z][\w-]*):(.+)$/)
    if (variantMatch) {
      const prefix = variantMatch[1]
      const baseUtility = variantMatch[2]
      if (RESPONSIVE_PREFIXES.has(prefix)) {
        // Responsive variant → strip prefix, track mapping, ensure base is resolved
        responsiveToBase.set(cls, { base: baseUtility, priority: BREAKPOINT_PRIORITY[prefix] })
        filteredClasses.add(baseUtility) // ensure the stripped utility is batch-converted
      }
      // else: interactive variant (hover:, focus:, group-hover:) → skip entirely
    } else {
      filteredClasses.add(cls)
    }
  }

  // Batch convert all unique classes at once
  const classArray = Array.from(filteredClasses)
  const cssResults = ds.candidatesToCss(classArray)

  // Build class → raw parsed rule map
  const classRuleMap = new Map<string, ParsedRule>()
  for (let i = 0; i < classArray.length; i++) {
    const cssRule = cssResults[i]
    if (cssRule) {
      const parsed = parseRuleRaw(cssRule)
      if (Object.keys(parsed.props).length > 0 || parsed.twVars.size > 0) {
        classRuleMap.set(classArray[i], parsed)
      } else {
        unresolvedClasses.push(classArray[i])
      }
    } else {
      unresolvedClasses.push(classArray[i])
    }
  }

  // Process the HTML: for each class attribute, merge all class rules then resolve
  const replacements: Array<{ start: number; end: number; replacement: string }> = []

  const classPattern2 = /class="([^"]*)"/g
  while ((match = classPattern2.exec(html)) !== null) {
    const classStr = match[1]
    const classes = classStr.split(/\s+/).filter(Boolean)
    const start = match.index
    const end = start + match[0].length

    // Collect parsed rules for all classes on this element.
    // Responsive classes are resolved to their base utility and applied AFTER
    // base classes so they override (mobile-first cascade at desktop width).
    const baseRules: ParsedRule[] = []
    const responsiveRules: Array<{ rule: ParsedRule; priority: number }> = []

    for (const cls of classes) {
      const responsive = responsiveToBase.get(cls)
      if (responsive) {
        // Responsive class → look up the stripped base utility's rule
        const rule = classRuleMap.get(responsive.base)
        if (rule) responsiveRules.push({ rule, priority: responsive.priority })
      } else {
        const rule = classRuleMap.get(cls)
        if (rule) baseRules.push(rule)
      }
    }

    // Sort responsive rules by breakpoint priority (ascending: sm < md < lg < xl)
    // so higher breakpoints override lower ones in the merge
    responsiveRules.sort((a, b) => a.priority - b.priority)

    // Merge: base first, then responsive overrides in breakpoint order
    const rules = [...baseRules, ...responsiveRules.map(r => r.rule)]

    if (rules.length === 0) continue

    // Merge all rules and resolve cross-class --tw-* vars
    let mergedProps = mergeAndResolve(rules)

    // Convert logical CSS properties to physical (padding-inline → padding-left/right, etc.)
    mergedProps = logicalToPhysical(mergedProps)

    // Expand flex shorthand to longhands — DOMParser may not reliably expand
    // inline shorthand properties. This ensures flexGrow/flexShrink/flexBasis are readable.
    if (mergedProps['flex'] && !mergedProps['flex-grow']) {
      const flexVal = mergedProps['flex'].trim()
      if (flexVal === 'none') {
        mergedProps['flex-grow'] = '0'
        mergedProps['flex-shrink'] = '0'
        mergedProps['flex-basis'] = 'auto'
      } else if (flexVal === 'auto') {
        mergedProps['flex-grow'] = '1'
        mergedProps['flex-shrink'] = '1'
        mergedProps['flex-basis'] = 'auto'
      } else {
        const parts = flexVal.split(/\s+/)
        if (parts.length >= 1 && !isNaN(Number(parts[0]))) {
          mergedProps['flex-grow'] = parts[0]
          if (parts.length >= 2) mergedProps['flex-shrink'] = parts[1]
          if (parts.length >= 3) mergedProps['flex-basis'] = parts[2]
        }
      }
    }

    // Resolve remaining theme vars and convert units
    for (const [prop, value] of Object.entries(mergedProps)) {
      let resolved = value
      if (resolved.includes('var(')) {
        resolved = await resolveAllVars(ds, resolved)
      }
      if (resolved.includes('calc(')) {
        resolved = resolveCalc(resolved)
      }
      if (resolved.includes('rem')) {
        resolved = remToPx(resolved)
      }
      // Resolve oklch() to hex — DOMParser can't reliably parse oklch in element.style
      if (resolved.includes('oklch(')) {
        resolved = resolveOklchToHex(resolved)
      }
      // Handle infinity values (e.g., calc(infinity * 1px) → 9999px)
      if (resolved.includes('infinity')) {
        resolved = resolved.replace(/calc\([^)]*infinity[^)]*\)/g, '9999px')
      }
      mergedProps[prop] = resolved
    }

    if (Object.keys(mergedProps).length === 0) continue

    // Check if there's already a style attribute after this class
    const afterClass = html.substring(end, end + 500)
    const existingStyleMatch = afterClass.match(/^\s+style="([^"]*)"/)

    // Build style string
    const newStyleParts: string[] = []
    for (const [prop, value] of Object.entries(mergedProps)) {
      newStyleParts.push(`${prop}: ${value}`)
    }

    if (existingStyleMatch) {
      // Merge: existing inline styles take priority over Tailwind
      const existingDecls = existingStyleMatch[1]
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)

      const existingProps = new Set<string>()
      for (const decl of existingDecls) {
        const colonIdx = decl.indexOf(':')
        if (colonIdx !== -1) existingProps.add(decl.substring(0, colonIdx).trim())
      }

      const finalParts = [...existingDecls]
      for (const part of newStyleParts) {
        const prop = part.substring(0, part.indexOf(':')).trim()
        if (!existingProps.has(prop)) {
          finalParts.push(part)
        }
      }

      const styleStr = finalParts.join('; ')
      const totalEnd = end + existingStyleMatch[0].length
      replacements.push({
        start,
        end: totalEnd,
        replacement: `class="${classStr}" style="${styleStr}"`,
      })
    } else {
      const styleStr = newStyleParts.join('; ')
      replacements.push({
        start,
        end,
        replacement: `class="${classStr}" style="${styleStr}"`,
      })
    }
  }

  // Apply replacements in reverse order
  let result = html
  replacements.sort((a, b) => b.start - a.start)
  for (const rep of replacements) {
    result = result.substring(0, rep.start) + rep.replacement + result.substring(rep.end)
  }

  // Post-process: handle space-y-* / space-x-* classes
  // These use `> * + *` selectors which can't be inlined per-class.
  // Instead, detect them on parent elements and add margin to direct children.
  result = distributeSpaceClasses(result, ds)

  return { html: result, unresolvedClasses }
}

/**
 * Distribute space-y-* / space-x-* to child elements as gap.
 * Tailwind's space-y-N uses `> * + *` selector which can't be inlined.
 * We convert it to gap on the parent element (works for flex/grid layouts).
 * Also removes the bogus margin-top/bottom the converter adds to the parent.
 */
function distributeSpaceClasses(html: string, _ds: DesignSystem): string {
  if (!html.includes('space-y-') && !html.includes('space-x-')) return html

  // Tailwind v4 spacing scale: space-N = N * 4px (same as gap-N, p-N, m-N)
  const resolveSpacing = (n: string): string | null => {
    // Handle fractional values like space-y-0.5
    const num = parseFloat(n)
    if (!isNaN(num)) return `${num * 4}px`
    // Named sizes: px = 1px
    if (n === 'px') return '1px'
    return null
  }

  return html.replace(
    /(<\w+\s[^>]*?)class="([^"]*(?:space-[xy]-)[^"]*)"([^>]*?)style="([^"]*)"([^>]*?>)/g,
    (fullMatch, before, classStr, mid, styleStr, after) => {
      const classes = classStr.split(/\s+/)
      let gapValue = ''

      for (const cls of classes) {
        const spaceMatch = cls.match(/^space-(y|x)-(.+)$/)
        if (!spaceMatch) continue
        const val = resolveSpacing(spaceMatch[2])
        if (val) gapValue = val
      }

      if (!gapValue) return fullMatch

      // Remove the space-y/x margin-top/margin-bottom wrongly added to this element
      let cleanedStyle = styleStr
        .split(';')
        .map((d: string) => d.trim())
        .filter((d: string) => {
          if (!d) return false
          const prop = d.substring(0, d.indexOf(':')).trim()
          if (prop === 'margin-top' || prop === 'margin-bottom' ||
              prop === 'margin-left' || prop === 'margin-right') {
            const val = d.substring(d.indexOf(':') + 1).trim()
            if (val.includes('calc(') && (val.includes('* 0') || val.includes('* 1'))) return false
          }
          return true
        })
        .join('; ')

      if (cleanedStyle && !cleanedStyle.endsWith(';')) cleanedStyle += '; '
      else if (!cleanedStyle) cleanedStyle = ''

      // If no display is already set, add flex layout so gap works
      // (space-y → flex column, space-x → flex row)
      if (!cleanedStyle.includes('display:')) {
        const cls = classes.find((c: string) => c.match(/^space-(y|x)-/))
        const axis = cls?.match(/^space-(y|x)-/)?.[1]
        if (axis === 'y') {
          cleanedStyle += `display: flex; flex-direction: column; `
        } else {
          cleanedStyle += `display: flex; flex-direction: row; `
        }
      }
      cleanedStyle += `gap: ${gapValue}`

      return `${before}class="${classStr}"${mid}style="${cleanedStyle}"${after}`
    }
  )
}
