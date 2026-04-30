'use client'

import { memo, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { VectorEditTool } from '@/store/editor-store'
import {
    MousePointer2,
    Lasso,
    PaintBucket,
    Spline,
    Scissors,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolDef {
    id: VectorEditTool
    label: string
    shortcut: string
    icon: React.ReactNode
}

const ICON_SIZE = 16

/** Tool groups separated by dividers — matches Figma's vector edit toolbar layout */
const TOOL_GROUPS: ToolDef[][] = [
    // Group 1: Selection tools
    [
        { id: 'move', label: 'Move', shortcut: 'V', icon: <MousePointer2 size={ICON_SIZE} /> },
        { id: 'lasso', label: 'Lasso', shortcut: 'L', icon: <Lasso size={ICON_SIZE} /> },
    ],
    // Group 2: Editing tools
    [
        { id: 'paint', label: 'Paint', shortcut: '\u21E7B', icon: <PaintBucket size={ICON_SIZE} /> },
        { id: 'bend', label: 'Bend', shortcut: '\u2318', icon: <Spline size={ICON_SIZE} /> },
        { id: 'cut', label: 'Cut', shortcut: 'C', icon: <Scissors size={ICON_SIZE} /> },
    ],
]

const ALL_TOOLS = TOOL_GROUPS.flat()

/**
 * VectorEditToolbar — floating bar shown when in vector edit mode.
 * Positioned at bottom center of canvas, above the main toolbar.
 */
export const VectorEditToolbar = memo(function VectorEditToolbar() {
    const vectorEditNodeId = useEditorStore((s) => s.vectorEditNodeId)
    const vectorEditTool = useEditorStore((s) => s.vectorEditTool)
    const setVectorEditTool = useEditorStore((s) => s.setVectorEditTool)
    const exitVectorEditMode = useEditorStore((s) => s.exitVectorEditMode)
    const enterVectorEditMode = useEditorStore((s) => s.enterVectorEditMode)
    const commitPenAndEnterVectorEdit = useEditorStore((s) => s.commitPenAndEnterVectorEdit)
    const activeTool = useEditorStore((s) => s.activeTool)
    const setActiveTool = useEditorStore((s) => s.setActiveTool)
    const commitPenPath = useEditorStore((s) => s.commitPenPath)
    const deleteNode = useEditorStore((s) => s.deleteNode)
    const setPenDrawingState = useEditorStore((s) => s.setPenDrawingState)

    const [hoveredTool, setHoveredTool] = useState<VectorEditTool | 'close' | null>(null)

    /** When clicking a tool while pen is active, commit the path and enter vector edit mode first */
    const handleToolClick = useCallback((toolId: VectorEditTool) => {
        const store = useEditorStore.getState()

        // Pen tool active (open or closed path) → commit + enter vector edit atomically
        if (store.activeTool === 'pen') {
            commitPenAndEnterVectorEdit(toolId)
            return
        }

        // Already in vector edit mode — just switch tool
        setVectorEditTool(toolId)
    }, [commitPenAndEnterVectorEdit, setVectorEditTool])

    const handleClose = useCallback(() => {
        if (vectorEditNodeId) {
            // Vector edit mode → exit it
            exitVectorEditMode()
        } else if (activeTool === 'pen') {
            // Pen tool mode → commit open path (if ≥2 vertices) or discard, switch to select
            const ps = useEditorStore.getState().penDrawingState
            if (ps) {
                if (ps.vertices.length >= 2) {
                    commitPenPath()
                } else {
                    deleteNode(ps.nodeId)
                    setPenDrawingState(null)
                }
            }
            setActiveTool('select')
        }
    }, [vectorEditNodeId, activeTool, exitVectorEditMode, commitPenPath, deleteNode, setPenDrawingState, setActiveTool])

    // Show toolbar in vector edit mode OR when pen tool is active
    if (!vectorEditNodeId && activeTool !== 'pen') return null

    return (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1">
            {/* Tooltip */}
            {hoveredTool && (
                <div className="px-2 py-1 rounded bg-neutral-800 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shadow-lg">
                    <span>
                        {hoveredTool === 'close'
                            ? 'Done'
                            : ALL_TOOLS.find((t) => t.id === hoveredTool)?.label}
                    </span>
                    <span className="text-white/50 text-[10px]">
                        {hoveredTool === 'close'
                            ? 'Esc'
                            : ALL_TOOLS.find((t) => t.id === hoveredTool)?.shortcut}
                    </span>
                </div>
            )}

            {/* Toolbar row — grouped with dividers like Figma */}
            <div
                className="flex items-center bg-neutral-800 rounded-lg shadow-xl p-1 gap-0.5"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {TOOL_GROUPS.map((group, gi) => (
                    <div key={gi} className="flex items-center gap-0.5">
                        {gi > 0 && (
                            <div className="w-px h-5 bg-neutral-600 mx-0.5" />
                        )}
                        {group.map((tool) => (
                            <button
                                key={tool.id}
                                className={cn(
                                    'relative flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                                    vectorEditTool === tool.id
                                        ? 'bg-blue-500 text-white'
                                        : 'text-neutral-300 hover:text-white hover:bg-neutral-700',
                                )}
                                onClick={() => handleToolClick(tool.id)}
                                onMouseEnter={() => setHoveredTool(tool.id)}
                                onMouseLeave={() => setHoveredTool(null)}
                            >
                                {tool.icon}
                            </button>
                        ))}
                    </div>
                ))}

                {/* Close button */}
                <button
                    className="flex items-center justify-center w-8 h-8 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                    onClick={handleClose}
                    onMouseEnter={() => setHoveredTool('close')}
                    onMouseLeave={() => setHoveredTool(null)}
                >
                    <X size={ICON_SIZE} />
                </button>
            </div>
        </div>
    )
})
