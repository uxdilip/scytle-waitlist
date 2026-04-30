/**
 * SVG Path to VectorNetwork Parser
 *
 * Converts SVG <path d="..."> commands into Figma-style VectorNetwork format
 * for integration with the pen tool and vector editing system.
 *
 * Supported SVG commands:
 *   M/m - moveTo (starts new subpath)
 *   L/l - lineTo (straight line)
 *   H/h - horizontal lineTo
 *   V/v - vertical lineTo
 *   C/c - cubic bezier
 *   S/s - smooth cubic bezier (reflects previous tangent)
 *   Q/q - quadratic bezier (converted to cubic)
 *   T/t - smooth quadratic bezier
 *   A/a - elliptical arc (approximated with cubic beziers)
 *   Z/z - closePath
 */

import type { VectorNetwork, VectorVertex, VectorSegment, VectorRegion } from '@/types/canvas'

// ============================================================
// Types
// ============================================================

interface Point { x: number; y: number }

interface ParsedPath {
    vertices: VectorVertex[]
    segments: VectorSegment[]
    /** Indices of segment loops that form closed regions */
    closedLoops: number[][]
}

// ============================================================
// Main Parser
// ============================================================

/**
 * Parse an SVG path `d` attribute into VectorNetwork format.
 * Returns vertices, segments, and regions for use in a VectorNode.
 */
export function parseSvgPathToNetwork(d: string): VectorNetwork {
    const { vertices, segments, closedLoops } = parsePathData(d)

    // Build regions from closed loops
    const regions: VectorRegion[] = closedLoops.map(loop => ({
        windingRule: 'NONZERO' as const,
        loops: [loop],
    }))

    return { vertices, segments, regions }
}

/**
 * Convert SVG shape elements (<circle>, <rect>, <ellipse>, <line>, <polygon>,
 * <polyline>) into <path> elements so they can be processed by the path parser.
 * Mutates the SVG element in place.
 */
function convertShapesToPaths(svg: Element): void {
    const doc = svg.ownerDocument
    if (!doc) return

    const shapes = svg.querySelectorAll('circle, rect, ellipse, line, polygon, polyline')
    for (const shape of Array.from(shapes)) {
        const d = shapeToPathData(shape)
        if (!d) continue

        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', d)

        // Copy common attributes
        for (const attr of ['fill', 'stroke', 'stroke-width', 'opacity', 'transform', 'fill-rule', 'clip-rule']) {
            const val = shape.getAttribute(attr)
            if (val) path.setAttribute(attr, val)
        }

        shape.parentNode?.replaceChild(path, shape)
    }
}

function num(el: Element, attr: string, fallback = 0): number {
    return parseFloat(el.getAttribute(attr) || '') || fallback
}

function shapeToPathData(el: Element): string | null {
    const tag = el.tagName.toLowerCase()

    if (tag === 'circle') {
        const cx = num(el, 'cx'), cy = num(el, 'cy'), r = num(el, 'r')
        if (r <= 0) return null
        // Two arcs to form a full circle
        return `M${cx - r},${cy}A${r},${r},0,1,0,${cx + r},${cy}A${r},${r},0,1,0,${cx - r},${cy}Z`
    }

    if (tag === 'ellipse') {
        const cx = num(el, 'cx'), cy = num(el, 'cy')
        const rx = num(el, 'rx'), ry = num(el, 'ry')
        if (rx <= 0 || ry <= 0) return null
        return `M${cx - rx},${cy}A${rx},${ry},0,1,0,${cx + rx},${cy}A${rx},${ry},0,1,0,${cx - rx},${cy}Z`
    }

    if (tag === 'rect') {
        const x = num(el, 'x'), y = num(el, 'y')
        const w = num(el, 'width'), h = num(el, 'height')
        if (w <= 0 || h <= 0) return null
        const rx = Math.min(num(el, 'rx'), w / 2)
        const ry = Math.min(num(el, 'ry') || rx, h / 2)
        if (rx > 0 || ry > 0) {
            // Rounded rect
            return `M${x + rx},${y}`
                + `L${x + w - rx},${y}A${rx},${ry},0,0,1,${x + w},${y + ry}`
                + `L${x + w},${y + h - ry}A${rx},${ry},0,0,1,${x + w - rx},${y + h}`
                + `L${x + rx},${y + h}A${rx},${ry},0,0,1,${x},${y + h - ry}`
                + `L${x},${y + ry}A${rx},${ry},0,0,1,${x + rx},${y}Z`
        }
        return `M${x},${y}L${x + w},${y}L${x + w},${y + h}L${x},${y + h}Z`
    }

    if (tag === 'line') {
        const x1 = num(el, 'x1'), y1 = num(el, 'y1')
        const x2 = num(el, 'x2'), y2 = num(el, 'y2')
        return `M${x1},${y1}L${x2},${y2}`
    }

    if (tag === 'polygon' || tag === 'polyline') {
        const points = (el.getAttribute('points') || '').trim()
        if (!points) return null
        const coords = points.split(/[\s,]+/).map(Number)
        if (coords.length < 4) return null
        let d = `M${coords[0]},${coords[1]}`
        for (let i = 2; i < coords.length; i += 2) {
            d += `L${coords[i]},${coords[i + 1]}`
        }
        if (tag === 'polygon') d += 'Z'
        return d
    }

    return null
}

/**
 * Parse multiple SVG path elements from an SVG string.
 * Combines all paths into a single VectorNetwork.
 */
export function parseSvgToNetwork(svgElement: Element): VectorNetwork {
    const allVertices: VectorVertex[] = []
    const allSegments: VectorSegment[] = []
    const allRegions: VectorRegion[] = []

    // Convert shape elements to paths first
    convertShapesToPaths(svgElement)

    // Find all <path> elements
    const paths = svgElement.querySelectorAll('path')

    for (const pathEl of Array.from(paths)) {
        const d = pathEl.getAttribute('d')
        if (!d) continue

        const { vertices, segments, closedLoops } = parsePathData(d)

        // Offset segment indices by current vertex count
        const vertexOffset = allVertices.length
        const segmentOffset = allSegments.length

        // Add vertices
        allVertices.push(...vertices)

        // Add segments with adjusted indices
        for (const seg of segments) {
            allSegments.push({
                ...seg,
                start: seg.start + vertexOffset,
                end: seg.end + vertexOffset,
            })
        }

        // Add regions with adjusted segment indices
        for (const loop of closedLoops) {
            allRegions.push({
                windingRule: 'NONZERO',
                loops: [loop.map(i => i + segmentOffset)],
            })
        }
    }

    return { vertices: allVertices, segments: allSegments, regions: allRegions }
}

/**
 * Compute bounding box of vertices in a VectorNetwork.
 * Returns { minX, minY, width, height }.
 */
export function computeBoundingBox(network: VectorNetwork): { minX: number; minY: number; width: number; height: number } {
    if (network.vertices.length === 0) {
        return { minX: 0, minY: 0, width: 0, height: 0 }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const v of network.vertices) {
        minX = Math.min(minX, v.x)
        minY = Math.min(minY, v.y)
        maxX = Math.max(maxX, v.x)
        maxY = Math.max(maxY, v.y)
    }

    // Also consider bezier control points for accurate bounds
    for (const seg of network.segments) {
        const startV = network.vertices[seg.start]
        const endV = network.vertices[seg.end]

        if (seg.tangentStart) {
            const cp1x = startV.x + seg.tangentStart.x
            const cp1y = startV.y + seg.tangentStart.y
            minX = Math.min(minX, cp1x)
            minY = Math.min(minY, cp1y)
            maxX = Math.max(maxX, cp1x)
            maxY = Math.max(maxY, cp1y)
        }
        if (seg.tangentEnd) {
            const cp2x = endV.x + seg.tangentEnd.x
            const cp2y = endV.y + seg.tangentEnd.y
            minX = Math.min(minX, cp2x)
            minY = Math.min(minY, cp2y)
            maxX = Math.max(maxX, cp2x)
            maxY = Math.max(maxY, cp2y)
        }
    }

    return {
        minX,
        minY,
        width: maxX - minX,
        height: maxY - minY,
    }
}

/**
 * Normalize vertices so the bounding box starts at (0, 0).
 * Returns the offset applied and modifies vertices in place.
 */
export function normalizeNetwork(network: VectorNetwork): { offsetX: number; offsetY: number } {
    const { minX, minY } = computeBoundingBox(network)

    for (const v of network.vertices) {
        v.x -= minX
        v.y -= minY
    }

    return { offsetX: minX, offsetY: minY }
}

// ============================================================
// Path Data Parser
// ============================================================

function parsePathData(d: string): ParsedPath {
    const vertices: VectorVertex[] = []
    const segments: VectorSegment[] = []
    const closedLoops: number[][] = []

    // Current position
    let cx = 0, cy = 0
    // Start of current subpath (for Z command)
    let subpathStart = 0
    let subpathStartX = 0, subpathStartY = 0
    // Segment indices for current subpath (for building closed loops)
    let currentLoopSegments: number[] = []
    // Previous control point for smooth curves
    let prevCtrlX = 0, prevCtrlY = 0
    let prevCmd = ''

    // Tokenize: split into commands and numbers
    const tokens = tokenizePath(d)
    let i = 0

    function getNumber(): number {
        return parseFloat(tokens[i++]) || 0
    }

    function addVertex(x: number, y: number): number {
        const idx = vertices.length
        vertices.push({ x, y })
        return idx
    }

    function addSegment(start: number, end: number, ts?: Point, te?: Point): void {
        const seg: VectorSegment = { start, end }
        if (ts && (ts.x !== 0 || ts.y !== 0)) {
            seg.tangentStart = ts
        }
        if (te && (te.x !== 0 || te.y !== 0)) {
            seg.tangentEnd = te
        }
        currentLoopSegments.push(segments.length)
        segments.push(seg)
    }

    while (i < tokens.length) {
        const cmd = tokens[i++]

        switch (cmd) {
            case 'M': {
                // Absolute moveTo
                const x = getNumber()
                const y = getNumber()
                subpathStart = addVertex(x, y)
                subpathStartX = x
                subpathStartY = y
                cx = x
                cy = y
                currentLoopSegments = []
                // Subsequent coordinates are implicit L commands
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const lx = getNumber()
                    const ly = getNumber()
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(lx, ly)
                    addSegment(prevIdx, nextIdx)
                    cx = lx
                    cy = ly
                }
                break
            }
            case 'm': {
                // Relative moveTo
                const dx = getNumber()
                const dy = getNumber()
                const x = cx + dx
                const y = cy + dy
                subpathStart = addVertex(x, y)
                subpathStartX = x
                subpathStartY = y
                cx = x
                cy = y
                currentLoopSegments = []
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const ldx = getNumber()
                    const ldy = getNumber()
                    const lx = cx + ldx
                    const ly = cy + ldy
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(lx, ly)
                    addSegment(prevIdx, nextIdx)
                    cx = lx
                    cy = ly
                }
                break
            }
            case 'L': {
                // Absolute lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const x = getNumber()
                    const y = getNumber()
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)
                    addSegment(prevIdx, nextIdx)
                    cx = x
                    cy = y
                }
                break
            }
            case 'l': {
                // Relative lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dx = getNumber()
                    const dy = getNumber()
                    const x = cx + dx
                    const y = cy + dy
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)
                    addSegment(prevIdx, nextIdx)
                    cx = x
                    cy = y
                }
                break
            }
            case 'H': {
                // Absolute horizontal lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const x = getNumber()
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, cy)
                    addSegment(prevIdx, nextIdx)
                    cx = x
                }
                break
            }
            case 'h': {
                // Relative horizontal lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dx = getNumber()
                    const x = cx + dx
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, cy)
                    addSegment(prevIdx, nextIdx)
                    cx = x
                }
                break
            }
            case 'V': {
                // Absolute vertical lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const y = getNumber()
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(cx, y)
                    addSegment(prevIdx, nextIdx)
                    cy = y
                }
                break
            }
            case 'v': {
                // Relative vertical lineTo
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dy = getNumber()
                    const y = cy + dy
                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(cx, y)
                    addSegment(prevIdx, nextIdx)
                    cy = y
                }
                break
            }
            case 'C': {
                // Absolute cubic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const x1 = getNumber()
                    const y1 = getNumber()
                    const x2 = getNumber()
                    const y2 = getNumber()
                    const x = getNumber()
                    const y = getNumber()

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    // Tangents are offsets from vertices
                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = x2
                    prevCtrlY = y2
                    cx = x
                    cy = y
                }
                break
            }
            case 'c': {
                // Relative cubic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dx1 = getNumber()
                    const dy1 = getNumber()
                    const dx2 = getNumber()
                    const dy2 = getNumber()
                    const dx = getNumber()
                    const dy = getNumber()

                    const x1 = cx + dx1
                    const y1 = cy + dy1
                    const x2 = cx + dx2
                    const y2 = cy + dy2
                    const x = cx + dx
                    const y = cy + dy

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = x2
                    prevCtrlY = y2
                    cx = x
                    cy = y
                }
                break
            }
            case 'S': {
                // Smooth cubic bezier (reflects previous control point)
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const x2 = getNumber()
                    const y2 = getNumber()
                    const x = getNumber()
                    const y = getNumber()

                    // Reflect previous control point
                    let x1 = cx, y1 = cy
                    if (prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's') {
                        x1 = 2 * cx - prevCtrlX
                        y1 = 2 * cy - prevCtrlY
                    }

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = x2
                    prevCtrlY = y2
                    cx = x
                    cy = y
                }
                break
            }
            case 's': {
                // Relative smooth cubic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dx2 = getNumber()
                    const dy2 = getNumber()
                    const dx = getNumber()
                    const dy = getNumber()

                    const x2 = cx + dx2
                    const y2 = cy + dy2
                    const x = cx + dx
                    const y = cy + dy

                    let x1 = cx, y1 = cy
                    if (prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's') {
                        x1 = 2 * cx - prevCtrlX
                        y1 = 2 * cy - prevCtrlY
                    }

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = x2
                    prevCtrlY = y2
                    cx = x
                    cy = y
                }
                break
            }
            case 'Q': {
                // Quadratic bezier (convert to cubic)
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const qx = getNumber()
                    const qy = getNumber()
                    const x = getNumber()
                    const y = getNumber()

                    // Convert quadratic to cubic: cp1 = p0 + 2/3 * (q - p0), cp2 = p1 + 2/3 * (q - p1)
                    const x1 = cx + (2 / 3) * (qx - cx)
                    const y1 = cy + (2 / 3) * (qy - cy)
                    const x2 = x + (2 / 3) * (qx - x)
                    const y2 = y + (2 / 3) * (qy - y)

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = qx
                    prevCtrlY = qy
                    cx = x
                    cy = y
                }
                break
            }
            case 'q': {
                // Relative quadratic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dqx = getNumber()
                    const dqy = getNumber()
                    const dx = getNumber()
                    const dy = getNumber()

                    const qx = cx + dqx
                    const qy = cy + dqy
                    const x = cx + dx
                    const y = cy + dy

                    const x1 = cx + (2 / 3) * (qx - cx)
                    const y1 = cy + (2 / 3) * (qy - cy)
                    const x2 = x + (2 / 3) * (qx - x)
                    const y2 = y + (2 / 3) * (qy - y)

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = qx
                    prevCtrlY = qy
                    cx = x
                    cy = y
                }
                break
            }
            case 'T': {
                // Smooth quadratic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const x = getNumber()
                    const y = getNumber()

                    let qx = cx, qy = cy
                    if (prevCmd === 'Q' || prevCmd === 'q' || prevCmd === 'T' || prevCmd === 't') {
                        qx = 2 * cx - prevCtrlX
                        qy = 2 * cy - prevCtrlY
                    }

                    const x1 = cx + (2 / 3) * (qx - cx)
                    const y1 = cy + (2 / 3) * (qy - cy)
                    const x2 = x + (2 / 3) * (qx - x)
                    const y2 = y + (2 / 3) * (qy - y)

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = qx
                    prevCtrlY = qy
                    cx = x
                    cy = y
                }
                break
            }
            case 't': {
                // Relative smooth quadratic bezier
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const dx = getNumber()
                    const dy = getNumber()
                    const x = cx + dx
                    const y = cy + dy

                    let qx = cx, qy = cy
                    if (prevCmd === 'Q' || prevCmd === 'q' || prevCmd === 'T' || prevCmd === 't') {
                        qx = 2 * cx - prevCtrlX
                        qy = 2 * cy - prevCtrlY
                    }

                    const x1 = cx + (2 / 3) * (qx - cx)
                    const y1 = cy + (2 / 3) * (qy - cy)
                    const x2 = x + (2 / 3) * (qx - x)
                    const y2 = y + (2 / 3) * (qy - y)

                    const prevIdx = vertices.length - 1
                    const nextIdx = addVertex(x, y)

                    const tangentStart = { x: x1 - cx, y: y1 - cy }
                    const tangentEnd = { x: x2 - x, y: y2 - y }

                    addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                    prevCtrlX = qx
                    prevCtrlY = qy
                    cx = x
                    cy = y
                }
                break
            }
            case 'A':
            case 'a': {
                // Elliptical arc - approximate with cubic beziers
                const isRelative = cmd === 'a'
                while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
                    const rx = Math.abs(getNumber())
                    const ry = Math.abs(getNumber())
                    const xAxisRotation = getNumber() * (Math.PI / 180) // Convert to radians
                    const largeArcFlag = getNumber() !== 0
                    const sweepFlag = getNumber() !== 0
                    let x = getNumber()
                    let y = getNumber()

                    if (isRelative) {
                        x += cx
                        y += cy
                    }

                    // Skip if degenerate
                    if (rx === 0 || ry === 0 || (cx === x && cy === y)) {
                        // Treat as line
                        const prevIdx = vertices.length - 1
                        const nextIdx = addVertex(x, y)
                        addSegment(prevIdx, nextIdx)
                        cx = x
                        cy = y
                        continue
                    }

                    // Convert arc to cubic bezier approximation
                    const curves = arcToCubic(cx, cy, x, y, rx, ry, xAxisRotation, largeArcFlag, sweepFlag)

                    for (const curve of curves) {
                        const prevIdx = vertices.length - 1
                        const nextIdx = addVertex(curve.x, curve.y)

                        const tangentStart = { x: curve.x1 - cx, y: curve.y1 - cy }
                        const tangentEnd = { x: curve.x2 - curve.x, y: curve.y2 - curve.y }

                        addSegment(prevIdx, nextIdx, tangentStart, tangentEnd)

                        cx = curve.x
                        cy = curve.y
                    }
                }
                break
            }
            case 'Z':
            case 'z': {
                // Close path
                if (currentLoopSegments.length > 0) {
                    const prevIdx = vertices.length - 1
                    // Connect back to subpath start
                    if (prevIdx !== subpathStart && (cx !== subpathStartX || cy !== subpathStartY)) {
                        addSegment(prevIdx, subpathStart)
                    }
                    // Record this as a closed loop
                    closedLoops.push([...currentLoopSegments])
                    currentLoopSegments = []
                }
                cx = subpathStartX
                cy = subpathStartY
                break
            }
        }

        prevCmd = cmd
    }

    return { vertices, segments, closedLoops }
}

/**
 * Tokenize SVG path data into commands and numbers.
 * Context-aware to correctly handle elliptical arc flags (0 or 1 without spaces).
 */
function tokenizePath(d: string): string[] {
    const tokens: string[] = []
    let i = 0
    let currentCommand = ''
    let argsParsed = 0

    function skipSpace() {
        while (i < d.length) {
            const c = d[i]
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',') i++
            else break
        }
    }

    while (i < d.length) {
        skipSpace()
        if (i >= d.length) break

        const c = d[i]

        // Command
        if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
            tokens.push(c)
            currentCommand = c.toUpperCase()
            argsParsed = 0
            i++
            continue
        }

        // If currently parsing an Arc command, arguments 3 and 4 (0-indexed) are flags
        if (currentCommand === 'A') {
            const argIndex = argsParsed % 7
            if (argIndex === 3 || argIndex === 4) {
                if (c === '0' || c === '1') {
                    tokens.push(c)
                    argsParsed++
                    i++
                    continue
                }
            }
        }

        // Number
        const start = i
        if (d[i] === '+' || d[i] === '-') i++
        
        let hasDot = false
        let hasE = false
        
        while (i < d.length) {
            const char = d[i]
            if (char >= '0' && char <= '9') {
                i++
            } else if (char === '.' && !hasDot && !hasE) {
                hasDot = true
                i++
            } else if ((char === 'e' || char === 'E') && !hasE) {
                hasE = true
                i++
                if (i < d.length && (d[i] === '+' || d[i] === '-')) {
                    i++
                }
            } else {
                break
            }
        }
        
        if (i === start || (i === start + 1 && (d[start] === '+' || d[start] === '-'))) {
            // Invalid character
            i++
            continue
        }

        tokens.push(d.slice(start, i))
        argsParsed++
    }

    return tokens
}

// ============================================================
// Arc to Cubic Bezier Conversion
// ============================================================

interface CubicCurve {
    x1: number; y1: number  // First control point
    x2: number; y2: number  // Second control point
    x: number; y: number    // End point
}

/**
 * Convert an SVG elliptical arc to a series of cubic bezier curves.
 * Algorithm from: https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
 */
function arcToCubic(
    x1: number, y1: number,  // Start point
    x2: number, y2: number,  // End point
    rx: number, ry: number,  // Radii
    phi: number,             // X-axis rotation in radians
    largeArc: boolean,
    sweep: boolean
): CubicCurve[] {
    const cos_phi = Math.cos(phi)
    const sin_phi = Math.sin(phi)

    // Step 1: Compute (x1', y1')
    const dx = (x1 - x2) / 2
    const dy = (y1 - y2) / 2
    const x1p = cos_phi * dx + sin_phi * dy
    const y1p = -sin_phi * dx + cos_phi * dy

    // Step 2: Compute (cx', cy')
    let rxSq = rx * rx
    let rySq = ry * ry
    const x1pSq = x1p * x1p
    const y1pSq = y1p * y1p

    // Ensure radii are large enough
    const lambda = x1pSq / rxSq + y1pSq / rySq
    if (lambda > 1) {
        const sqrtLambda = Math.sqrt(lambda)
        rx *= sqrtLambda
        ry *= sqrtLambda
        rxSq = rx * rx
        rySq = ry * ry
    }

    const sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq))
    const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(sq)

    const cxp = coef * rx * y1p / ry
    const cyp = -coef * ry * x1p / rx

    // Step 3: Compute (cx, cy) from (cx', cy')
    const cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2
    const cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2

    // Step 4: Compute theta1 and dtheta
    const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    let dtheta = vectorAngle(
        (x1p - cxp) / rx, (y1p - cyp) / ry,
        (-x1p - cxp) / rx, (-y1p - cyp) / ry
    )

    if (!sweep && dtheta > 0) {
        dtheta -= 2 * Math.PI
    } else if (sweep && dtheta < 0) {
        dtheta += 2 * Math.PI
    }

    // Step 5: Create bezier curves
    const segments = Math.ceil(Math.abs(dtheta) / (Math.PI / 2))
    const delta = dtheta / segments
    const t = (8 / 3) * Math.sin(delta / 4) * Math.sin(delta / 4) / Math.sin(delta / 2)

    const curves: CubicCurve[] = []
    let currentX = x1
    let currentY = y1
    let currentTheta = theta1

    for (let i = 0; i < segments; i++) {
        const cosTheta1 = Math.cos(currentTheta)
        const sinTheta1 = Math.sin(currentTheta)
        const theta2 = currentTheta + delta
        const cosTheta2 = Math.cos(theta2)
        const sinTheta2 = Math.sin(theta2)

        // Calculate end point
        const ex = cos_phi * rx * cosTheta2 - sin_phi * ry * sinTheta2 + cx
        const ey = sin_phi * rx * cosTheta2 + cos_phi * ry * sinTheta2 + cy

        // Calculate control points
        const dx1 = -t * (cos_phi * rx * sinTheta1 + sin_phi * ry * cosTheta1)
        const dy1 = -t * (sin_phi * rx * sinTheta1 - cos_phi * ry * cosTheta1)
        const dx2 = t * (cos_phi * rx * sinTheta2 + sin_phi * ry * cosTheta2)
        const dy2 = t * (sin_phi * rx * sinTheta2 - cos_phi * ry * cosTheta2)

        curves.push({
            x1: currentX + dx1,
            y1: currentY + dy1,
            x2: ex + dx2,
            y2: ey + dy2,
            x: ex,
            y: ey,
        })

        currentX = ex
        currentY = ey
        currentTheta = theta2
    }

    return curves
}

/**
 * Calculate angle between two vectors.
 */
function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const sign = (ux * vy - uy * vx < 0) ? -1 : 1
    const dot = ux * vx + uy * vy
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy)
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)))
    return sign * angle
}
