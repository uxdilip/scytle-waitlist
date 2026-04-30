'use client'

import { useCallback } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById, getNodeCanvasPosition } from '@/types/canvas'
import { Section, IconButton } from './inputs'
import {
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
} from 'lucide-react'

/**
 * Alignment section shown when multiple objects are selected.
 * Aligns selected objects relative to their collective bounding box.
 */
export function MultiSelectAlignSection() {
    const selectedIds = useEditorStore((s) => s.selectedIds)

    /** Get bounding box of all selected nodes in canvas-space */
    const getSelectionBounds = useCallback(() => {
        const state = useEditorStore.getState()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        const nodesData: { id: string; x: number; y: number; width: number; height: number }[] = []

        for (const id of state.selectedIds) {
            const node = findNodeById(state.nodes, id)
            if (!node) continue
            // Use the node's own x/y (which is relative to its parent or top-level)
            nodesData.push({ id, x: node.x, y: node.y, width: node.width, height: node.height })
            minX = Math.min(minX, node.x)
            minY = Math.min(minY, node.y)
            maxX = Math.max(maxX, node.x + node.width)
            maxY = Math.max(maxY, node.y + node.height)
        }

        return { minX, minY, maxX, maxY, nodesData }
    }, [])

    const handleAlignLeft = useCallback(() => {
        const { minX, nodesData } = getSelectionBounds()
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            if (n.x !== minX) store.updateNode(n.id, { x: minX })
        }
    }, [getSelectionBounds])

    const handleAlignCenterH = useCallback(() => {
        const { minX, maxX, nodesData } = getSelectionBounds()
        const centerX = (minX + maxX) / 2
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            store.updateNode(n.id, { x: centerX - n.width / 2 })
        }
    }, [getSelectionBounds])

    const handleAlignRight = useCallback(() => {
        const { maxX, nodesData } = getSelectionBounds()
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            store.updateNode(n.id, { x: maxX - n.width })
        }
    }, [getSelectionBounds])

    const handleAlignTop = useCallback(() => {
        const { minY, nodesData } = getSelectionBounds()
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            if (n.y !== minY) store.updateNode(n.id, { y: minY })
        }
    }, [getSelectionBounds])

    const handleAlignCenterV = useCallback(() => {
        const { minY, maxY, nodesData } = getSelectionBounds()
        const centerY = (minY + maxY) / 2
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            store.updateNode(n.id, { y: centerY - n.height / 2 })
        }
    }, [getSelectionBounds])

    const handleAlignBottom = useCallback(() => {
        const { maxY, nodesData } = getSelectionBounds()
        const store = useEditorStore.getState()
        for (const n of nodesData) {
            store.updateNode(n.id, { y: maxY - n.height })
        }
    }, [getSelectionBounds])

    if (selectedIds.length < 2) return null

    return (
        <Section title="Alignment">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-px">
                    <IconButton
                        icon={<AlignHorizontalJustifyStart size={14} />}
                        onClick={handleAlignLeft}
                        title="Align left"
                    />
                    <IconButton
                        icon={<AlignHorizontalJustifyCenter size={14} />}
                        onClick={handleAlignCenterH}
                        title="Align center"
                    />
                    <IconButton
                        icon={<AlignHorizontalJustifyEnd size={14} />}
                        onClick={handleAlignRight}
                        title="Align right"
                    />
                </div>
                <div className="flex items-center gap-px">
                    <IconButton
                        icon={<AlignVerticalJustifyStart size={14} />}
                        onClick={handleAlignTop}
                        title="Align top"
                    />
                    <IconButton
                        icon={<AlignVerticalJustifyCenter size={14} />}
                        onClick={handleAlignCenterV}
                        title="Align middle"
                    />
                    <IconButton
                        icon={<AlignVerticalJustifyEnd size={14} />}
                        onClick={handleAlignBottom}
                        title="Align bottom"
                    />
                </div>
            </div>
        </Section>
    )
}
