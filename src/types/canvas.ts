import { z } from 'zod'
import { generateId } from '@/lib/utils'

// ============================================================
// Canvas Constants
// ============================================================

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 256
export const DEFAULT_ZOOM = 1
export const ZOOM_STEP = 1.2

export type CanvasTool = 'select' | 'hand' | 'frame' | 'text' | 'pen'

// ============================================================
// Zod Sub-Schemas (non-recursive leaf types)
// ============================================================

export const BlendModeSchema = z.enum([
    'NORMAL', 'DARKEN', 'MULTIPLY', 'PLUS_DARKER', 'COLOR_BURN',
    'LIGHTEN', 'SCREEN', 'PLUS_LIGHTER', 'COLOR_DODGE',
    'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT',
    'DIFFERENCE', 'EXCLUSION',
    'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY',
])

export const SolidFillSchema = z.object({
    type: z.literal('solid'),
    id: z.string().optional(),
    color: z.string(),       // '#rrggbb' hex (with or without '#')
    opacity: z.number().min(0).max(1).optional(),    // defaults to 1
    visible: z.boolean().optional(),                  // defaults to true
    blendMode: BlendModeSchema.optional(),            // defaults to 'NORMAL'
})

export const GradientStopSchema = z.object({
    id: z.string().optional(),
    position: z.number().min(0).max(1),   // 0–1
    color: z.string(),                     // '#rrggbb'
    opacity: z.number().min(0).max(1).optional(),
})

export const GradientFillSchema = z.object({
    type: z.literal('gradient'),
    id: z.string().optional(),
    gradientType: z.enum(['linear', 'radial', 'angular', 'diamond']).optional(),
    stops: z.array(GradientStopSchema).optional(),
    angle: z.number().optional(),           // degrees, default 90
    // Gradient control handles — normalized (0-1) in node bounding box
    // [start, end] for linear; derived from angle if absent
    handles: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    // Legacy: raw CSS gradient string (backward compat)
    gradient: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    visible: z.boolean().optional(),
    blendMode: BlendModeSchema.optional(),
})

export const ImageFillSchema = z.object({
    type: z.literal('image'),
    id: z.string().optional(),
    src: z.string(),
    fit: z.enum(['cover', 'contain', 'fill', 'tile', 'crop']),
    cropX: z.number().min(0).max(100).optional(),
    cropY: z.number().min(0).max(100).optional(),
    cropZoom: z.number().min(1).max(10).optional(),
    opacity: z.number().min(0).max(1).optional(),
    visible: z.boolean().optional(),
    blendMode: BlendModeSchema.optional(),
    rotation: z.number().optional(),
    // Image adjustments (-100 to +100, 0 = no adjustment)
    exposure: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
    temperature: z.number().optional(),
    tint: z.number().optional(),
    highlights: z.number().optional(),
    shadows: z.number().optional(),
})

export const FillSchema = z.discriminatedUnion('type', [
    SolidFillSchema,
    GradientFillSchema,
    ImageFillSchema,
])

export const ShadowSchema = z.object({
    type: z.enum(['drop', 'inner']),
    color: z.string(),
    x: z.number(),
    y: z.number(),
    blur: z.number(),
    spread: z.number(),
    visible: z.boolean().optional(),
    blendMode: BlendModeSchema.optional(),
})

export const NodeEffectSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.enum(['drop-shadow', 'inner-shadow']),
        color: z.string(),
        x: z.number(),
        y: z.number(),
        blur: z.number(),
        spread: z.number(),
        visible: z.boolean().optional(),
        blendMode: BlendModeSchema.optional(),
    }),
    z.object({
        type: z.enum(['layer-blur', 'background-blur']),
        radius: z.number(),
        visible: z.boolean().optional(),
    })
])

export const BorderSchema = z.object({
    color: z.string(),
    width: z.number(),
    style: z.enum(['solid', 'dashed', 'dotted']),
    /** Stroke position relative to the path edge. Defaults to 'inside'. */
    position: z.enum(['inside', 'center', 'outside']).optional(),
    /** Stroke opacity (0–1). Defaults to 1. */
    opacity: z.number().min(0).max(1).optional(),
    /** Stroke visibility toggle. Defaults to true. */
    visible: z.boolean().optional(),
    /** Which sides to render. Defaults to all sides if omitted. */
    sides: z.object({
        top: z.boolean(),
        right: z.boolean(),
        bottom: z.boolean(),
        left: z.boolean(),
    }).optional(),
})

export const SizingSchema = z.object({
    horizontal: z.enum(['fixed', 'hug', 'fill']),
    vertical: z.enum(['fixed', 'hug', 'fill']),
})

export const LayoutConstraintsSchema = z.object({
    horizontal: z.enum(['left', 'right', 'center', 'leftRight', 'scale']),
    vertical: z.enum(['top', 'bottom', 'center', 'topBottom', 'scale']),
})

export type LayoutConstraints = z.infer<typeof LayoutConstraintsSchema>

export const PaddingSchema = z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
})

// ── Grid Track (Figma-quality per-track sizing) ─────────────

export const GridTrackSchema = z.object({
    value: z.number(),                     // e.g. 1, 200, 0 (ignored for auto)
    unit: z.enum(['fr', 'px', 'auto']),    // fractional, fixed, or auto
})

export type GridTrack = z.infer<typeof GridTrackSchema>

export const LayoutSchema = z.object({
    mode: z.enum(['flex', 'grid', 'none']),
    direction: z.enum(['row', 'column']).optional(),
    justify: z.enum(['start', 'end', 'center', 'between', 'around', 'evenly']).optional(),
    align: z.enum(['start', 'end', 'center', 'stretch', 'baseline']).optional(),
    wrap: z.boolean().optional(),
    gap: z.number().optional(),
    columns: z.union([z.number(), z.string()]).optional(),
    rows: z.union([z.number(), z.string()]).optional(),
    /** Per-track column definitions (overrides `columns` when present) */
    columnTracks: z.array(GridTrackSchema).optional(),
    /** Per-track row definitions (overrides `rows` when present) */
    rowTracks: z.array(GridTrackSchema).optional(),
    columnGap: z.number().optional(),
    rowGap: z.number().optional(),
    /** Wrap content alignment (Figma: counterAxisAlignContent). Only relevant when wrap is true. */
    wrapAlign: z.enum(['start', 'end', 'center', 'between', 'stretch']).optional(),
    /** Reverse canvas stacking order (Figma: itemReverseZIndex). First child on top when true. */
    reverseZIndex: z.boolean().optional(),
})

export const BorderRadiusSchema = z.union([
    z.number(),
    z.object({
        topLeft: z.number(),
        topRight: z.number(),
        bottomRight: z.number(),
        bottomLeft: z.number(),
    }),
])

export const TextSegmentSchema = z.object({
    start: z.number(),
    end: z.number(),
    fills: z.array(FillSchema).optional(),
    fontFamily: z.string().optional(),
    fontWeight: z.number().optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    fontSize: z.number().optional(),
    textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.union([z.number(), z.literal('auto')]).optional(),
})

// ============================================================
// TypeScript Types from Zod Schemas
// ============================================================

export type BlendMode = z.infer<typeof BlendModeSchema>
export type Fill = z.infer<typeof FillSchema>
export type SolidFill = z.infer<typeof SolidFillSchema>
export type GradientFill = z.infer<typeof GradientFillSchema>
export type GradientStop = z.infer<typeof GradientStopSchema>
export type ImageFill = z.infer<typeof ImageFillSchema>
export type Shadow = z.infer<typeof ShadowSchema>
export type NodeEffect = z.infer<typeof NodeEffectSchema>
export type Border = z.infer<typeof BorderSchema>
export type Sizing = z.infer<typeof SizingSchema>
export type Padding = z.infer<typeof PaddingSchema>
export type Layout = z.infer<typeof LayoutSchema>
export type BorderRadius = z.infer<typeof BorderRadiusSchema>
export type TextSegment = z.infer<typeof TextSegmentSchema>

// ============================================================
// Vector / Pen Tool Primitives
// Mirrors Figma Plugin API:
//   VectorNetwork  → https://developers.figma.com/docs/plugins/api/VectorNetwork/
//   VectorPath     → https://developers.figma.com/docs/plugins/api/VectorPath/
//   HandleMirroring→ https://developers.figma.com/docs/plugins/api/HandleMirroring/
// ============================================================

/**
 * Controls how the two bezier handles at a vertex relate to each other.
 * Figma API: HandleMirroring — "NONE" | "ANGLE" | "ANGLE_AND_LENGTH"
 *
 *   NONE             → each handle is fully independent (corner/sharp point)
 *   ANGLE            → handles stay collinear but lengths are independent (smooth tangent)
 *   ANGLE_AND_LENGTH → handles are perfectly symmetric (classic smooth point)
 */
export type HandleMirroring = 'NONE' | 'ANGLE' | 'ANGLE_AND_LENGTH'

/**
 * Decoration at the open end of a stroke segment.
 * Figma API: StrokeCap
 */
export type StrokeCap =
    | 'NONE'
    | 'ROUND'
    | 'SQUARE'
    | 'LINE_ARROW'
    | 'TRIANGLE_ARROW'
    | 'REVERSED_TRIANGLE'
    | 'CIRCLE_ARROW'
    | 'DIAMOND_ARROW'

/**
 * How two segments join at a shared vertex.
 * Figma API: StrokeJoin
 */
export type StrokeJoin = 'MITER' | 'BEVEL' | 'ROUND'

/**
 * A single point in a vector network graph.
 * Coordinates are RELATIVE to the VectorNode's own x/y origin.
 * Figma API: VectorVertex
 */
export interface VectorVertex {
    /** X position relative to the node's bounding-box origin */
    x: number
    /** Y position relative to the node's bounding-box origin */
    y: number
    /** Per-vertex stroke cap override. Falls back to VectorNode.strokeCap if omitted. */
    strokeCap?: StrokeCap
    /** Per-vertex stroke join override. Falls back to VectorNode.strokeJoin if omitted. */
    strokeJoin?: StrokeJoin
    /** Per-vertex corner radius (rounds this specific corner). Falls back to 0. */
    cornerRadius?: number
    /**
     * How this vertex's bezier handles mirror each other.
     * Default: 'NONE' (independent handles = sharp/corner point).
     * Set to 'ANGLE_AND_LENGTH' for a smooth round point.
     */
    handleMirroring?: HandleMirroring
}

/**
 * An edge connecting two vertices by index, optionally curved via cubic bezier.
 * Segments are NON-DIRECTIONAL — start/end are just indices, not an order.
 * Figma API: VectorSegment
 *
 * Straight line  → both tangents omitted or {x:0, y:0}
 * Cubic bezier   → set tangentStart and/or tangentEnd
 *
 * Bezier control point math (ABSOLUTE coords):
 *   cp1 = { x: vertices[start].x + tangentStart.x,
 *            y: vertices[start].y + tangentStart.y }
 *   cp2 = { x: vertices[end].x   + tangentEnd.x,
 *            y: vertices[end].y   + tangentEnd.y }
 */
export interface VectorSegment {
    /** Index into VectorNetwork.vertices[] for the start vertex */
    start: number
    /** Index into VectorNetwork.vertices[] for the end vertex */
    end: number
    /** Bezier control offset from the start vertex. Default {x:0, y:0} = straight. */
    tangentStart?: { x: number; y: number }
    /** Bezier control offset from the end vertex. Default {x:0, y:0} = straight. */
    tangentEnd?: { x: number; y: number }
}

/**
 * A closed fillable area defined by one or more loops of segments.
 * Each loop is an array of segment indices forming a continuous closed chain.
 * Figma API: VectorRegion
 *
 * A single VectorNode can have multiple regions, each with its own fills.
 * Example — letter "o": outer boundary loop + inner hole loop.
 */
export interface VectorRegion {
    /** Fill rule for determining inside vs outside */
    windingRule: 'NONZERO' | 'EVENODD'
    /**
     * Array of loops; each loop is an ordered array of segment indices.
     * Segments in a loop must form a connected continuous chain (no forks/gaps).
     */
    loops: number[][]
    /** Per-region fill overrides. If omitted, the node-level fills[] apply. */
    fills?: Fill[]
}

/**
 * The complete graph representation of a vector shape.
 * This is the canonical (source-of-truth) format — never derive from vectorPaths.
 * Figma API: VectorNetwork
 *
 * Key rules:
 *   - If regions[] is empty, Figma auto-fills all enclosed space (NONZERO rule).
 *   - Vertex coords are relative to the VectorNode's own origin (x/y).
 *   - After any vertex move, recompute the node's bounding box and re-offset vertices.
 */
export interface VectorNetwork {
    vertices: VectorVertex[]
    segments: VectorSegment[]
    /** Fillable closed regions. Empty = auto-fill all enclosed space. */
    regions: VectorRegion[]
}

/**
 * A single SVG-path representation of a vector shape.
 * This is a DERIVED/CACHED value — always recompute from vectorNetwork.
 * Figma API: VectorPath
 *
 * data uses standard SVG path commands: M, L, C, Z
 * Example triangle: "M 150 0 L 300 200 L 0 200 Z"
 */
export interface VectorPath {
    /** SVG winding rule — 'NONE' means no fill for this path */
    windingRule: 'NONZERO' | 'EVENODD' | 'NONE'
    /** SVG path data string (M/L/C/Q/Z commands) */
    data: string
}

/** Ordered array of VectorPath objects — one entry per region + open paths */
export type VectorPaths = VectorPath[]

/**
 * A width control point along a variable-width stroke.
 * Used by the Variable Width tool (⇧W) in vector edit mode.
 */
export interface VariableWidthPoint {
    /** Normalized position along the segment (0 = start vertex, 1 = end vertex) */
    t: number
    /** Stroke width in pixels at this point */
    width: number
}

// ============================================================
// Node Type Interfaces (manual — recursive tree can't infer)
// ============================================================

/** Properties shared by all node types */
export interface BaseNodeProperties {
    id: string
    name: string
    visible: boolean
    locked: boolean
    x: number
    y: number
    width: number
    height: number
    sizing: Sizing
    positioning: 'auto' | 'absolute'
    /** CSS z-index for stacking order. Stored on positioned elements (relative/absolute)
     *  and rendered as a CSS property so the browser handles paint-order natively
     *  without reordering children (which would break flex/grid layout). */
    zIndex?: number
    opacity: number
    rotation: number
    /** Mirror horizontally (applied as scaleX(-1) in the CSS transform) */
    flipX?: boolean
    /** Mirror vertically (applied as scaleY(-1) in the CSS transform) */
    flipY?: boolean
    overflow: 'visible' | 'hidden'
    borderRadius: BorderRadius
    fills: Fill[]
    border?: Border
    strokes?: Border[]
    shadows: Shadow[]
    effects?: NodeEffect[]
    /** Layer blur in px (CSS filter: blur). 0 = no blur. */
    layerBlur?: number
    /** Background blur in px (CSS backdrop-filter: blur). 0 = no blur. */
    backgroundBlur?: number

    // === SPACING (for HTML/CSS compatibility) ===
    /** Margin (CSS spacing outside element borders) - preserved from HTML parsing */
    margin?: { top: number; right: number; bottom: number; left: number }
    /** Auto margin flags - when true, that margin edge uses 'auto' for centering */
    autoMargin?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }

    // === GRID CHILD PROPERTIES ===
    /** Grid column span (col-span-2 = 2, col-span-full = -1) */
    gridColumnSpan?: number
    /** Grid row span (row-span-2 = 2, row-span-full = -1) */
    gridRowSpan?: number
    /** Explicit grid column start position (1-based) */
    gridColumnStart?: number
    /** Explicit grid row start position (1-based) */
    gridRowStart?: number

    // === CONSTRAINTS (Phase 4) ===
    // Min/max dimensions (Figma: minWidth, maxWidth, minHeight, maxHeight)
    // https://www.figma.com/plugin-docs/api/properties/nodes-minwidth/
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    /** Layout constraints (Figma-style pinning to parent edges) */
    constraints?: LayoutConstraints

    /** Raw CSS width/height for percentage-based sizing (e.g. "75%").
     *  When set, the renderer uses this CSS value instead of the pixel width/height. */
    cssWidth?: string
    cssHeight?: string

    /** Raw CSS position values for absolute elements (Paper-style deferred resolution).
     *  The canvas renderer resolves these against actual parent dimensions at render time,
     *  instead of the parser guessing parent dimensions during conversion. */
    cssPosition?: {
        top?: string     // e.g. "50%", "16px", "calc(1/2 * 100%)"
        right?: string
        bottom?: string
        left?: string
        translate?: string  // e.g. "-50% -50%"
        transform?: string  // legacy: "translate(-50%, -50%)"
    }
}

/** Container node — div with optional auto-layout (flexbox/grid) */
export interface FrameNode extends BaseNodeProperties {
    type: 'frame'
    children: ScytleNode[]
    layout: Layout
    padding: Padding

    // === FLEX CHILD PROPERTIES (Phase 4) ===
    // Set on children when parent has layoutMode: 'flex'
    // https://www.figma.com/plugin-docs/api/properties/nodes-layoutgrow/
    /** Flex grow factor (0 = don't grow, 1+ = grow proportionally) */
    layoutGrow?: number
    /** Flex shrink factor (0 = don't shrink, 1 = shrink if needed) */
    flexShrink?: number
    /** Flex basis in pixels (initial size before grow/shrink) */
    flexBasis?: number
    /** Order for flex item reordering (-9999 = first, 9999 = last) */
    order?: number
    /** Self alignment (overrides parent's alignItems) */
    alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch' | 'baseline'

}

/** Text leaf node — renders as heading/paragraph/span */
export interface TextNode extends BaseNodeProperties {
    type: 'text'
    characters: string
    segments?: TextSegment[]
    fontFamily: string
    fontWeight: number
    fontStyle?: 'normal' | 'italic'
    /** Unified style name as shown in Figma: "Regular", "Bold Italic", etc. Derives fontWeight + fontStyle. */
    fontStyleName?: string
    fontSize: number
    lineHeight: number | 'auto'
    /** Unit for lineHeight: 'auto' = normal/inherit; 'px' = absolute pixels (scaled); '%' = % of font-size. */
    lineHeightUnit?: 'auto' | 'px' | '%'
    letterSpacing: number
    /** Unit for letterSpacing: 'px' = absolute pixels (scaled); '%' = em-relative (value/100 em). */
    letterSpacingUnit?: 'px' | '%'
    textAlign: 'left' | 'center' | 'right' | 'justify'
    /** Vertical alignment of text within a fixed-height text box. Default: 'top'. */
    textAlignVertical?: 'top' | 'center' | 'bottom'
    /** Includes CSS text-transform values plus 'small-caps' (mapped to font-variant-caps). */
    textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps'
    textDecoration: 'none' | 'underline' | 'line-through'
    autoResize: 'none' | 'width-and-height' | 'height' | 'truncate'
    maxLines?: number
    /** Text truncation mode. 'ending' clips with ellipsis (use maxLines for line count). */
    textTruncation?: 'disabled' | 'ending'
    color: string
    htmlTag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'a' | 'li'
    /** Vertical trim mode (Figma "leading trim"). 'cap-height' trims line-box to cap-height + baseline. */
    leadingTrim?: 'none' | 'cap-height'
    /** Extra space after each paragraph break (px). */
    paragraphSpacing?: number
    /** First-line indent per paragraph (px). */
    paragraphIndent?: number
    /** List marker style — renders as list-item with bullet or number. */
    listStyle?: 'none' | 'ordered' | 'unordered'
    /** Allow punctuation chars to optically hang outside the text box edge. */
    hangingPunctuation?: boolean
    /** Allow list markers to hang outside the text box edge (outdented markers). */
    hangingList?: boolean
    /** OpenType feature flag overrides. Key = 4-char OT tag (e.g. 'liga'); value = 0 (off) or 1 (on). */
    opentypeFlags?: Record<string, 0 | 1>
}

/** Image node — renders as img tag or placeholder */
export interface ImageNode extends BaseNodeProperties {
    type: 'image'
    src: string
    alt: string
    fit: 'cover' | 'contain' | 'fill'
    isPlaceholder: boolean
    placeholderLabel?: string
}

/**
 * Vector path node — renders as an inline SVG.
 * Created by the Pen tool (P). Edited in Vector Edit Mode (Enter / double-click).
 * Mirrors Figma Plugin API: VectorNode (type: 'VECTOR')
 * https://developers.figma.com/docs/plugins/api/VectorNode/
 *
 * DATA INVARIANTS:
 *   1. vectorNetwork is the canonical source of truth — vectorPaths is a derived cache.
 *   2. All vertex coords are RELATIVE to this node's x/y origin.
 *   3. node.x/y/width/height = bounding box of all vertices (recompute after any vertex move).
 *   4. Tangents are offsets from their vertex, not absolute canvas positions.
 *   5. strokeCap/strokeJoin on the node are defaults; per-vertex overrides take precedence.
 */
export interface VectorNode extends BaseNodeProperties {
    type: 'vector'

    // ── Core geometry ──────────────────────────────────────────
    /**
     * The full graph representation of the shape.
     * Always update this; never write vectorPaths directly.
     */
    vectorNetwork: VectorNetwork
    /**
     * Cached SVG path strings derived from vectorNetwork.
     * Recompute via networkToSVGPaths() whenever vectorNetwork changes.
     * Optional — can be null and recomputed on demand.
     */
    vectorPaths?: VectorPaths

    // ── Stroke ────────────────────────────────────────────────
    /** Node-level handle mirroring default. Per-vertex handleMirroring overrides this. */
    handleMirroring: HandleMirroring
    /** Decoration at open path endpoints. Default: 'ROUND'. */
    strokeCap: StrokeCap
    /** Style of segment joins at non-smooth vertices. Default: 'MITER'. */
    strokeJoin: StrokeJoin
    /** Stroke thickness in pixels. Default: 1. */
    strokeWeight: number
    /** Stroke position relative to path edge. Default: 'CENTER'. */
    strokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE'
    /** Stroke hex color (e.g. '#000000'). Default: '#000000'. */
    strokeColor: string
    /** Stroke opacity 0–1. Default: 1. */
    strokeOpacity: number
    /** Stroke visibility toggle. Default: true. */
    strokeVisible: boolean

    // ── Variable width stroke (Phase D3-7) ────────────────────
    /**
     * Width control points placed by the Variable Width tool (⇧W).
     * When present, the stroke tapers between these points.
     * Not supported on: dashed strokes, branching vector networks.
     */
    variableWidthStroke?: VariableWidthPoint[]
}

/** Discriminated union of all node types */
export type ScytleNode = FrameNode | TextNode | ImageNode | VectorNode

/** Just the type discriminator values */
export type NodeType = ScytleNode['type']

// ============================================================
// Default Values
// ============================================================

const DEFAULT_BASE: Omit<BaseNodeProperties, 'id' | 'name'> = {
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    sizing: { horizontal: 'fixed', vertical: 'fixed' },
    positioning: 'auto',
    opacity: 1,
    rotation: 0,
    overflow: 'visible',
    borderRadius: 0,
    fills: [],
    shadows: [],
}

const DEFAULT_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 }

const DEFAULT_LAYOUT: Layout = {
    mode: 'none',
}

function buildTextFillFromLegacyColor(color: string): SolidFill {
    const raw = color.trim().toLowerCase()
    if (raw === 'transparent') {
        return {
            type: 'solid',
            color: '#000000',
            opacity: 0,
            visible: true,
            blendMode: 'NORMAL',
        }
    }

    const stripped = raw.replace(/^#/, '')
    if (/^[0-9a-f]{8}$/.test(stripped)) {
        return {
            type: 'solid',
            color: `#${stripped.slice(0, 6)}`,
            opacity: parseInt(stripped.slice(6, 8), 16) / 255,
            visible: true,
            blendMode: 'NORMAL',
        }
    }
    if (/^[0-9a-f]{4}$/.test(stripped)) {
        const r = stripped[0] + stripped[0]
        const g = stripped[1] + stripped[1]
        const b = stripped[2] + stripped[2]
        const a = stripped[3] + stripped[3]
        return {
            type: 'solid',
            color: `#${r}${g}${b}`,
            opacity: parseInt(a, 16) / 255,
            visible: true,
            blendMode: 'NORMAL',
        }
    }
    if (/^[0-9a-f]{6}$/.test(stripped)) {
        return {
            type: 'solid',
            color: `#${stripped}`,
            opacity: 1,
            visible: true,
            blendMode: 'NORMAL',
        }
    }
    if (/^[0-9a-f]{3}$/.test(stripped)) {
        const expanded = stripped
            .split('')
            .map((ch) => ch + ch)
            .join('')
        return {
            type: 'solid',
            color: `#${expanded}`,
            opacity: 1,
            visible: true,
            blendMode: 'NORMAL',
        }
    }

    return {
        type: 'solid',
        color: '#000000',
        opacity: 1,
        visible: true,
        blendMode: 'NORMAL',
    }
}

// ============================================================
// Factory Functions
// ============================================================

/** Create a new FrameNode with sensible defaults */
export function createFrame(
    overrides?: Partial<Omit<FrameNode, 'type'>>
): FrameNode {
    return {
        ...DEFAULT_BASE,
        id: generateId(),
        name: 'Frame',
        type: 'frame',
        children: [],
        layout: DEFAULT_LAYOUT,
        padding: DEFAULT_PADDING,
        ...overrides,
    }
}

/** Create a new TextNode with sensible defaults */
export function createText(
    overrides?: Partial<Omit<TextNode, 'type'>>
): TextNode {
    const node: TextNode = {
        ...DEFAULT_BASE,
        id: generateId(),
        name: 'Text',
        type: 'text',
        width: 100,
        height: 24,
        sizing: { horizontal: 'hug', vertical: 'hug' },
        characters: 'Text',
        fontFamily: 'Inter',
        fontWeight: 400,
        fontStyleName: 'Regular',
        fontSize: 16,
        lineHeight: 'auto',
        letterSpacing: 0,
        textAlign: 'left',
        textTransform: 'none',
        textDecoration: 'none',
        autoResize: 'width-and-height',
        color: '#000000',
        fills: [buildTextFillFromLegacyColor('#000000')],
        ...overrides,
    }

    if (overrides?.fills === undefined) {
        node.fills = [buildTextFillFromLegacyColor(node.color)]
    }

    return node
}

/** Create a new ImageNode with sensible defaults */
export function createImage(
    overrides?: Partial<Omit<ImageNode, 'type'>>
): ImageNode {
    return {
        ...DEFAULT_BASE,
        id: generateId(),
        name: 'Image',
        type: 'image',
        width: 300,
        height: 200,
        src: '',
        alt: '',
        fit: 'cover',
        isPlaceholder: true,
        placeholderLabel: 'Image',
        ...overrides,
    }
}

/**
 * Create a new VectorNode with sensible defaults.
 *
 * Width/height start at 0 — they are computed from the bounding box
 * of vertices once the path is committed via commitPenPath().
 *
 * The vectorNetwork starts empty — it is populated by the Pen tool
 * as the user places anchor points on the canvas.
 */
export function createVector(
    overrides?: Partial<Omit<VectorNode, 'type'>>
): VectorNode {
    return {
        ...DEFAULT_BASE,
        id: generateId(),
        name: 'Vector',
        type: 'vector',
        // Bounding box is 0 until vertices are committed
        width: 0,
        height: 0,
        // VectorNodes are always fixed-size (bounding box driven by geometry)
        sizing: { horizontal: 'fixed', vertical: 'fixed' },
        // Vectors sit at absolute canvas position
        positioning: 'absolute',
        // Empty network — populated by the Pen tool
        vectorNetwork: { vertices: [], segments: [], regions: [] },
        vectorPaths: undefined,
        // Stroke defaults (match Figma's defaults for new pen paths)
        handleMirroring: 'NONE',
        strokeCap: 'ROUND',
        strokeJoin: 'MITER',
        strokeWeight: 2,
        strokeAlign: 'CENTER',
        strokeColor: '#000000',
        strokeOpacity: 1,
        strokeVisible: true,
        // No fill by default (outline only — same as Figma pen default)
        fills: [],
        shadows: [],
        ...overrides,
    }
}

// ============================================================
// Tree Utility Functions
// ============================================================

/**
 * Recursively find a node by ID in the tree.
 * Works with both real state and immer draft state.
 */
export function findNodeById(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes: readonly any[],
    id: string
): ScytleNode | null {
    for (const node of nodes) {
        if (node.id === id) return node as ScytleNode
        if (node.type === 'frame' && node.children) {
            const found = findNodeById(node.children, id)
            if (found) return found
        }
    }
    return null
}

/**
 * Find the parent frame containing a node with the given ID,
 * plus the index of that node within the parent's children.
 * Returns null if the node is at the top level or not found.
 *
 * For top-level nodes, returns { parent: null, index }.
 */
export function findParentOfNode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes: readonly any[],
    id: string
): { parent: FrameNode | null; index: number } | null {
    // Check top level
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
            return { parent: null, index: i }
        }
    }

    // Recurse into frame children
    for (const node of nodes) {
        if (node.type === 'frame' && node.children) {
            for (let i = 0; i < node.children.length; i++) {
                if (node.children[i].id === id) {
                    return { parent: node as FrameNode, index: i }
                }
            }
            const found = findParentOfNode(node.children, id)
            if (found) return found
        }
    }

    return null
}

/**
 * Collect all node IDs in a subtree (for multi-delete, etc.)
 */
export function collectNodeIds(node: ScytleNode): string[] {
    const ids = [node.id]
    if (node.type === 'frame') {
        for (const child of node.children) {
            ids.push(...collectNodeIds(child))
        }
    }
    return ids
}

/**
 * Deep clone a node tree, generating fresh IDs for all nodes.
 * Used for copy/paste and duplicate operations.
 */
export function deepCloneWithNewIds(node: ScytleNode): ScytleNode {
    const clone = JSON.parse(JSON.stringify(node)) as ScytleNode
    clone.id = generateId()
    if (clone.type === 'frame') {
        clone.children = clone.children.map((child) => deepCloneWithNewIds(child))
    }
    return clone
}

const AUTO_LAYOUT_INFLATION_THRESHOLD = 2
const AUTO_LAYOUT_INFLATION_MIN_DELTA = 300

function getFlexEstimatedContentSize(
    frame: FrameNode,
    children: readonly ScytleNode[]
): { width: number; height: number } | null {
    if (frame.layout.mode !== 'flex' || frame.layout.wrap || children.length === 0) {
        return null
    }

    const direction = frame.layout.direction ?? 'column'
    const gap = frame.layout.gap ?? 0

    if (direction === 'row') {
        const contentWidth = children.reduce((sum, child) => sum + Math.max(child.width, 0), 0)
            + Math.max(children.length - 1, 0) * gap
        const contentHeight = children.reduce((max, child) => Math.max(max, child.height), 0)

        return {
            width: Math.max(contentWidth, 0),
            height: Math.max(contentHeight, 0),
        }
    }

    const contentWidth = children.reduce((max, child) => Math.max(max, child.width), 0)
    const contentHeight = children.reduce((sum, child) => sum + Math.max(child.height, 0), 0)
        + Math.max(children.length - 1, 0) * gap

    return {
        width: Math.max(contentWidth, 0),
        height: Math.max(contentHeight, 0),
    }
}

/**
 * Return a practical frame size for placement/hit-testing.
 *
 * Auto-layout frames can occasionally carry inflated dimensions relative to
 * their visible content. When that inflation is extreme, clamp to content+
 * padding so interactions stay close to what users see on canvas.
 */
export function getEffectiveFrameSize(frame: FrameNode): { width: number; height: number } {
    const baseWidth = Math.max(frame.width, 1)
    const baseHeight = Math.max(frame.height, 1)

    if (frame.layout.mode === 'none' || frame.children.length === 0) {
        return { width: baseWidth, height: baseHeight }
    }

    const sizingChildren = frame.children.filter((child) => child.positioning !== 'absolute')
    if (sizingChildren.length === 0) {
        return { width: baseWidth, height: baseHeight }
    }

    let minX = Infinity
    let minY = Infinity
    let maxRight = -Infinity
    let maxBottom = -Infinity

    for (const child of sizingChildren) {
        minX = Math.min(minX, child.x)
        minY = Math.min(minY, child.y)
        maxRight = Math.max(maxRight, child.x + child.width)
        maxBottom = Math.max(maxBottom, child.y + child.height)
    }

    if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxRight) ||
        !Number.isFinite(maxBottom)
    ) {
        return { width: baseWidth, height: baseHeight }
    }

    const coordinateContentWidth = Math.max(maxRight - minX, 0)
    const coordinateContentHeight = Math.max(maxBottom - minY, 0)
    const flexEstimate = getFlexEstimatedContentSize(frame, sizingChildren)

    const contentWidth = flexEstimate
        ? Math.max(coordinateContentWidth, flexEstimate.width)
        : coordinateContentWidth
    const contentHeight = flexEstimate
        ? Math.max(coordinateContentHeight, flexEstimate.height)
        : coordinateContentHeight

    const paddedWidth = contentWidth + (frame.padding?.left ?? 0) + (frame.padding?.right ?? 0)
    const paddedHeight = contentHeight + (frame.padding?.top ?? 0) + (frame.padding?.bottom ?? 0)
    const canShrinkToContentWidth = frame.layout.mode === 'flex' && frame.sizing.horizontal !== 'fixed'
    const canShrinkToContentHeight = frame.layout.mode === 'flex' && frame.sizing.vertical !== 'fixed'

    let width = baseWidth
    let height = baseHeight

    if (canShrinkToContentWidth && paddedWidth > 0) {
        width = Math.min(width, paddedWidth)
    }

    if (canShrinkToContentHeight && paddedHeight > 0) {
        height = Math.min(height, paddedHeight)
    }

    if (
        paddedWidth > 0 &&
        width > paddedWidth * AUTO_LAYOUT_INFLATION_THRESHOLD &&
        width - paddedWidth > AUTO_LAYOUT_INFLATION_MIN_DELTA
    ) {
        width = paddedWidth
    }

    if (
        paddedHeight > 0 &&
        height > paddedHeight * AUTO_LAYOUT_INFLATION_THRESHOLD &&
        height - paddedHeight > AUTO_LAYOUT_INFLATION_MIN_DELTA
    ) {
        height = paddedHeight
    }

    return {
        width: Math.max(width, 1),
        height: Math.max(height, 1),
    }
}

/** Return effective width/height for any node. */
export function getEffectiveNodeSize(node: ScytleNode): { width: number; height: number } {
    if (node.type === 'frame') {
        return getEffectiveFrameSize(node)
    }

    return {
        width: Math.max(node.width, 1),
        height: Math.max(node.height, 1),
    }
}

/**
 * Find the deepest frame that contains the given canvas-space point.
 * Returns the frame ID, the point relative to the frame, and the frame's
 * canvas-absolute position.
 *
 * Uses an inset margin so clicks near the edge of a frame don't auto-nest.
 * Used for auto-nesting when drawing frames/creating text inside existing frames.
 */
export function findContainingFrame(
    nodes: readonly ScytleNode[],
    canvasX: number,
    canvasY: number,
    offsetX: number = 0,
    offsetY: number = 0,
    excludeIds?: ReadonlySet<string>,
    inset: number = 10,
    useEffectiveBounds: boolean = false,
): { frameId: string; relX: number; relY: number; frameAbsX: number; frameAbsY: number } | null {
    // Reverse iterate — topmost visual layer (last in array) checked first
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        // Skip excluded nodes (and their entire subtree)
        if (excludeIds && excludeIds.has(node.id)) continue

        if (node.type === 'frame') {
            const nodeAbsX = offsetX + node.x
            const nodeAbsY = offsetY + node.y
            const frameSize = useEffectiveBounds
                ? getEffectiveFrameSize(node)
                : { width: node.width, height: node.height }

            // Point must be inside the frame (inset from all edges)
            if (
                canvasX >= nodeAbsX + inset &&
                canvasX <= nodeAbsX + frameSize.width - inset &&
                canvasY >= nodeAbsY + inset &&
                canvasY <= nodeAbsY + frameSize.height - inset
            ) {
                // Check children first (deeper nesting wins)
                const childResult = findContainingFrame(
                    node.children,
                    canvasX,
                    canvasY,
                    nodeAbsX,
                    nodeAbsY,
                    excludeIds,
                    inset,
                    useEffectiveBounds,
                )
                if (childResult) return childResult

                return {
                    frameId: node.id,
                    relX: canvasX - nodeAbsX,
                    relY: canvasY - nodeAbsY,
                    frameAbsX: nodeAbsX,
                    frameAbsY: nodeAbsY,
                }
            }
        }
    }
    return null
}

/**
 * Get the canvas-absolute position of a node by walking up the parent chain.
 * For top-level nodes, returns their x,y directly.
 * For nested nodes, accumulates parent positions.
 */
export function getNodeCanvasPosition(
    nodes: readonly ScytleNode[],
    nodeId: string,
): { x: number; y: number } | null {
    const node = findNodeById(nodes as ScytleNode[], nodeId)
    if (!node) return null

    let x = node.x
    let y = node.y
    let curId = nodeId

    // Walk up parents accumulating offsets
    while (true) {
        const result = findParentOfNode(nodes as ScytleNode[], curId)
        if (!result || !result.parent) break
        x += result.parent.x
        y += result.parent.y
        curId = result.parent.id
    }

    return { x, y }
}
