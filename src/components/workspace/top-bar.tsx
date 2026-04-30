'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useEditorStore } from '@/store/editor-store'
import { useProjectStore } from '@/store/project-store'
import Image from 'next/image'
import type { CanvasTool } from '@/types/canvas'
import {
    ArrowLeft,
    MousePointer2,
    Hand,
    Square,
    Type,
    PenTool,
    Undo2,
    Redo2,
    Share2,
    Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShareDialog } from '@/components/share/share-dialog'
import { ZoomControls } from './zoom-controls'

// ────────────────────────────────────────────────────────────
// Tool definitions (same order as Figma: Move, Hand, Frame, Text)
// ────────────────────────────────────────────────────────────

const TOOLS: {
    tool: CanvasTool
    icon: React.ComponentType<{ className?: string }>
    label: string
    shortcut: string
}[] = [
        { tool: 'select', icon: MousePointer2, label: 'Move', shortcut: 'V' },
        { tool: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
        { tool: 'frame', icon: Square, label: 'Frame', shortcut: 'F' },
        { tool: 'pen', icon: PenTool, label: 'Pen', shortcut: 'P' },
        { tool: 'text', icon: Type, label: 'Text', shortcut: 'T' },
    ]

// ────────────────────────────────────────────────────────────
// Top Bar
// ────────────────────────────────────────────────────────────

interface TopBarProps {
    projectName: string
    projectId: string
}

export function TopBar({ projectName, projectId }: TopBarProps) {
    const activeTool = useEditorStore((s) => s.activeTool)
    const setActiveTool = useEditorStore((s) => s.setActiveTool)
    const canUndo = useEditorStore((s) => s._past.length > 0)
    const canRedo = useEditorStore((s) => s._future.length > 0)

    const updateProject = useProjectStore((s) => s.updateProject)

    const [shareOpen, setShareOpen] = useState(false)
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [titleValue, setTitleValue] = useState(projectName)
    const inputRef = useRef<HTMLInputElement>(null)

    // Sync local title with prop when it changes from elsewhere
    useEffect(() => {
        setTitleValue(projectName)
    }, [projectName])

    // Focus treatment when entering edit mode
    useEffect(() => {
        if (isEditingTitle && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditingTitle])

    const handleTitleSubmit = async () => {
        const trimmed = titleValue.trim()
        setIsEditingTitle(false)
        if (trimmed && trimmed !== projectName) {
            await updateProject(projectId, { name: trimmed })
        } else {
            setTitleValue(projectName) // Reset to original if empty or unchanged
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleTitleSubmit()
        } else if (e.key === 'Escape') {
            setTitleValue(projectName)
            setIsEditingTitle(false)
        }
    }

    return (
        <header className="flex items-center h-12 px-3 bg-card border-b border-border/60 shrink-0 select-none">
            {/* ── Left: Back + Project identity ── */}
            <Link
                href="/dashboard"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors mr-2"
                title="Back to Dashboard"
            >
                <ArrowLeft className="w-4 h-4" />
            </Link>

            <div
                className={cn(
                    "flex items-center gap-2 px-2 py-1 -ml-1 rounded-md transition-colors cursor-pointer group",
                    !isEditingTitle && "hover:bg-muted/60"
                )}
                onDoubleClick={() => !isEditingTitle && setIsEditingTitle(true)}
            >
                {/* Project Icon */}
                <div className="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden">
                    <Image src="/Icon.svg" alt="Scytle" width={20} height={20} />
                </div>

                {isEditingTitle ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={titleValue}
                        onChange={(e) => setTitleValue(e.target.value)}
                        onBlur={handleTitleSubmit}
                        onKeyDown={handleKeyDown}
                        className="font-display font-semibold text-sm bg-transparent border-none p-0 focus:outline-none focus:ring-0 min-w-[120px] max-w-[300px]"
                        style={{ width: `${Math.max(120, titleValue.length * 8)}px` }}
                    />
                ) : (
                    <span className="font-display font-semibold text-sm truncate max-w-[240px] text-foreground/90 group-hover:text-foreground">
                        {projectName}
                    </span>
                )}
            </div>

            {/* ── Center: Tool buttons + Undo/Redo ── */}
            <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-0.5">
                    {TOOLS.map(({ tool, icon: Icon, label, shortcut }) => (
                        <button
                            key={tool}
                            title={`${label} (${shortcut})`}
                            onClick={() => setActiveTool(tool)}
                            className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 outline-none',
                                activeTool === tool
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                            )}
                        >
                            <Icon className="w-4 h-4" />
                        </button>
                    ))}

                    <div className="w-px h-5 bg-border/60 mx-2" />

                    <button
                        title="Undo (⌘Z)"
                        onClick={() => useEditorStore.getState().undo()}
                        disabled={!canUndo}
                        className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                            canUndo
                                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                : 'text-muted-foreground/30 cursor-default'
                        )}
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        title="Redo (⇧⌘Z)"
                        onClick={() => useEditorStore.getState().redo()}
                        disabled={!canRedo}
                        className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                            canRedo
                                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                : 'text-muted-foreground/30 cursor-default'
                        )}
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Right: Share and Zoom ── */}
            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                </button>
                <ZoomControls />
            </div>

            {/* Share Dialog */}
            <ShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                projectId={projectId}
            />
        </header>
    )
}
