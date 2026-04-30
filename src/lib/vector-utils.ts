import type { VectorNetwork } from '@/types/canvas'

// ============================================================
// networkToSVGPaths
// ============================================================

/**
 * Convert a VectorNetwork into an array of SVG path `d` strings.
 *
 * Each connected chain of segments becomes one path command string.
 * Callers typically join all paths into a single <path d={...} /> element.
 *
 * ── Algorithm ─────────────────────────────────────────────────
 *  1. Build an adjacency list: vertexIndex → [{segmentIndex, otherEnd}]
 *  2. Walk all chains starting from degree-1 vertices first (open paths),
 *     then any vertex with unvisited segments (closed loops).
 *  3. Emit SVG M / L / C commands; close the chain with Z when it loops
 *     back to the start vertex.
 *
 * ── Bezier math (mirrors Figma Plugin API) ────────────────────
 *  Forward traversal (start → end):
 *    cp1 = { vertex[start].x + tangentStart.x, vertex[start].y + tangentStart.y }
 *    cp2 = { vertex[end].x   + tangentEnd.x,   vertex[end].y   + tangentEnd.y   }
 *
 *  Reversed traversal (end → start):
 *    cp1 swaps to use tangentEnd  (from the departure vertex, which is 'end')
 *    cp2 swaps to use tangentStart (from the arrival vertex, which is 'start')
 */
export function networkToSVGPaths(network: VectorNetwork): string[] {
    const { vertices, segments } = network
    if (vertices.length === 0 || segments.length === 0) return []

    // ── 1. Build adjacency list ────────────────────────────────
    type Edge = { segIdx: number; other: number }
    const adj = new Map<number, Edge[]>()

    for (let i = 0; i < segments.length; i++) {
        const { start, end } = segments[i]
        if (!adj.has(start)) adj.set(start, [])
        if (!adj.has(end)) adj.set(end, [])
        adj.get(start)!.push({ segIdx: i, other: end })
        adj.get(end)!.push({ segIdx: i, other: start })
    }

    const visited = new Set<number>() // visited segment indices
    const paths: string[] = []

    const unvisitedEdges = (v: number): Edge[] =>
        (adj.get(v) ?? []).filter((e) => !visited.has(e.segIdx))

    // ── 2. Walk chains ─────────────────────────────────────────
    while (visited.size < segments.length) {
        // Prefer degree-1 vertices (open path endpoints) to get the most
        // natural start point; fall back to any vertex with unvisited edges.
        let startVert = -1
        for (const [v] of adj) {
            if (unvisitedEdges(v).length === 1) {
                startVert = v
                break
            }
        }
        if (startVert === -1) {
            for (const [v] of adj) {
                if (unvisitedEdges(v).length > 0) {
                    startVert = v
                    break
                }
            }
        }
        if (startVert === -1) break // all segments visited

        // ── 3. Emit path commands ──────────────────────────────
        const v0 = vertices[startVert]
        let d = `M ${fmt(v0.x)} ${fmt(v0.y)}`
        let cur = startVert

        for (; ;) {
            const edges = unvisitedEdges(cur)
            if (edges.length === 0) break

            const { segIdx, other: next } = edges[0]
            visited.add(segIdx)

            const seg = segments[segIdx]
            const vCur = vertices[cur]
            const vNext = vertices[next]

            const ts = seg.tangentStart ?? { x: 0, y: 0 }
            const te = seg.tangentEnd ?? { x: 0, y: 0 }
            const isCurve = ts.x !== 0 || ts.y !== 0 || te.x !== 0 || te.y !== 0

            if (!isCurve) {
                d += ` L ${fmt(vNext.x)} ${fmt(vNext.y)}`
            } else {
                // Determine traversal direction relative to segment definition
                const forward = seg.start === cur
                // cp1: control point near departure vertex
                // cp2: control point near arrival vertex
                const cp1 = forward
                    ? { x: vCur.x + ts.x, y: vCur.y + ts.y }
                    : { x: vCur.x + te.x, y: vCur.y + te.y }
                const cp2 = forward
                    ? { x: vNext.x + te.x, y: vNext.y + te.y }
                    : { x: vNext.x + ts.x, y: vNext.y + ts.y }

                d += ` C ${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(vNext.x)} ${fmt(vNext.y)}`
            }

            // Looped back to start → close the path
            if (next === startVert) {
                d += ' Z'
                break
            }

            cur = next
        }

        paths.push(d)
    }

    return paths
}

/**
 * Single-string convenience wrapper over `networkToSVGPaths`.
 * Joins all chains into one `d` attribute value (chains separated by space).
 * Suitable for `<path d={networkToSVGPath(network)} />`.
 */
export function networkToSVGPath(network: VectorNetwork): string {
    return networkToSVGPaths(network).join(' ')
}

// ============================================================
// Helpers
// ============================================================

/** Format a number to at most 2 decimal places, strip trailing zeros */
function fmt(n: number): string {
    return parseFloat(n.toFixed(2)).toString()
}
