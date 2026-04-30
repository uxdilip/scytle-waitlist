'use client'

import { useEditorStore } from '@/store/editor-store'
import { useGenerationStore } from '@/store/generation-store'
import type { CanvasTool } from '@/types/canvas'
import { MousePointer2, Square, Type, Hand, PenTool } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Tool definitions
// ============================================================

const TOOLS: {
    tool: CanvasTool
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
    label: string
    shortcut: string
    /** Whether this tool is mutating (blocked during generation) */
    mutating?: boolean
}[] = [
        { tool: 'select', icon: MousePointer2, label: 'Move', shortcut: 'V' },
        { tool: 'frame', icon: Square, label: 'Frame', shortcut: 'F', mutating: true },
        { tool: 'pen', icon: PenTool, label: 'Pen', shortcut: 'P', mutating: true },
        { tool: 'text', icon: Type, label: 'Text', shortcut: 'T', mutating: true },
        { tool: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
    ]

// ============================================================
// Toolbar — floating tool switcher rendered on the canvas
// ============================================================

export function Toolbar() {
    const activeTool = useEditorStore((s) => s.activeTool)
    const setActiveTool = useEditorStore((s) => s.setActiveTool)
    const isGenLocked = useGenerationStore((s) => s.isLocked)

    // ── Render ────────────────────────────────────────────────

    return (
        <div
            className="flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border/60 rounded-lg px-1 py-0.5 shadow-sm"
            onPointerDown={(e) => e.stopPropagation()}
        >
            {TOOLS.map(({ tool, icon: Icon, label, shortcut, mutating }) => {
                const isDisabled = isGenLocked && mutating
                return (
                    <button
                        key={tool}
                        className={cn(
                            'relative p-2 rounded-md transition-all duration-150',
                            isDisabled
                                ? 'opacity-30 cursor-not-allowed'
                                : activeTool === tool
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        )}
                        onClick={() => !isDisabled && setActiveTool(tool)}
                        disabled={isDisabled}
                        title={isDisabled ? `${label} — disabled during AI generation` : `${label} (${shortcut})`}
                    >
                        <Icon size={16} strokeWidth={activeTool === tool ? 2 : 1.5} />
                    </button>
                )
            })}
        </div>
    )
}
