import {
    findContainingFrame,
    findNodeById,
    findParentOfNode,
    getNodeCanvasPosition,
} from '@/types/canvas'
import type { ScytleNode } from '@/types/canvas'

export function findContainingFrameAtPoint(
    nodes: readonly ScytleNode[],
    x: number,
    y: number,
) {
    // Use zero inset so parenting follows exact pointer intent.
    return findContainingFrame(nodes, x, y, 0, 0, undefined, 0)
}

export function isPointInsideFrame(
    nodes: readonly ScytleNode[],
    frameId: string,
    x: number,
    y: number,
): boolean {
    const frame = findNodeById(nodes, frameId)
    if (!frame || frame.type !== 'frame') return false

    const framePos = getNodeCanvasPosition(nodes, frameId)
    if (!framePos) return false

    return (
        x >= framePos.x &&
        x <= framePos.x + frame.width &&
        y >= framePos.y &&
        y <= framePos.y + frame.height
    )
}

export function shouldExitEnteredFrameOnCanvasClick(
    nodes: readonly ScytleNode[],
    enteredFrameId: string | null,
    x: number,
    y: number,
): boolean {
    if (!enteredFrameId) return false
    return !isPointInsideFrame(nodes, enteredFrameId, x, y)
}

export function isNodeWithinFrameScope(
    nodes: readonly ScytleNode[],
    nodeId: string,
    frameId: string,
): boolean {
    if (nodeId === frameId) return true

    let currentId = nodeId
    while (true) {
        const parentResult = findParentOfNode(nodes, currentId)
        const parent = parentResult?.parent
        if (!parent) return false
        if (parent.id === frameId) return true
        currentId = parent.id
    }
}
