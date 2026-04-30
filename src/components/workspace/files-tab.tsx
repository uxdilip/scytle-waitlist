'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, FileText, Plus, Copy, Pencil, Trash2, Link } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { LayersPanel } from '@/components/editor'

// ────────────────────────────────────────────────────────────
// Collapsible Section Header
// ────────────────────────────────────────────────────────────

function SectionHeader({
    title,
    open,
    onToggle,
    action,
}: {
    title: string
    open: boolean
    onToggle: () => void
    action?: React.ReactNode
}) {
    return (
        <div className="flex items-center h-8 px-3 shrink-0">
            <button
                onClick={onToggle}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <ChevronDown
                    className={cn(
                        'w-3 h-3 transition-transform duration-150',
                        !open && '-rotate-90'
                    )}
                />
                {title}
            </button>
            {action && <div className="ml-auto">{action}</div>}
        </div>
    )
}

// ────────────────────────────────────────────────────────────
// Inline page name editor
// ────────────────────────────────────────────────────────────

function PageNameInput({
    initialName,
    onCommit,
}: {
    initialName: string
    onCommit: (name: string) => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [value, setValue] = useState(initialName)

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    const commit = useCallback(() => {
        const trimmed = value.trim()
        onCommit(trimmed || initialName)
    }, [value, initialName, onCommit])

    return (
        <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') onCommit(initialName)
            }}
            className="flex-1 bg-transparent text-xs font-medium outline-none border border-accent/60 rounded px-1 -mx-1"
        />
    )
}

// ────────────────────────────────────────────────────────────
// Right-click context menu for pages (Figma-style)
// ────────────────────────────────────────────────────────────

interface ContextMenuState {
    pageId: string
    x: number
    y: number
}

function PageContextMenu({
    state,
    onClose,
    onRename,
    canDelete,
}: {
    state: ContextMenuState
    onClose: () => void
    onRename: (pageId: string) => void
    canDelete: boolean
}) {
    const menuRef = useRef<HTMLDivElement>(null)
    const duplicatePage = useEditorStore((s) => s.duplicatePage)
    const deletePage = useEditorStore((s) => s.deletePage)

    // Close on outside click or Escape
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', handleClick)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('keydown', handleKey)
        }
    }, [onClose])

    const items = [
        {
            label: 'Copy link to page',
            icon: Link,
            action: () => {
                navigator.clipboard.writeText(window.location.href)
                onClose()
            },
        },
        {
            label: 'Rename page',
            icon: Pencil,
            action: () => {
                onRename(state.pageId)
                onClose()
            },
        },
        {
            label: 'Duplicate page',
            icon: Copy,
            action: () => {
                duplicatePage(state.pageId)
                onClose()
            },
        },
        {
            label: 'Delete page',
            icon: Trash2,
            action: () => {
                deletePage(state.pageId)
                onClose()
            },
            disabled: !canDelete,
            destructive: true,
        },
    ]

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[180px] rounded-lg bg-popover border border-border shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
            style={{ left: state.x, top: state.y }}
        >
            {items.map((item, i) => (
                <button
                    key={item.label}
                    onClick={item.action}
                    disabled={item.disabled}
                    className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-1.5 text-xs transition-colors',
                        item.destructive && !item.disabled
                            ? 'text-destructive hover:bg-destructive/10'
                            : 'text-popover-foreground hover:bg-muted/80',
                        item.disabled && 'opacity-40 cursor-not-allowed',
                        i === 0 && 'mt-0.5',
                    )}
                >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                </button>
            ))}
        </div>
    )
}

// ────────────────────────────────────────────────────────────
// Files Tab  (mirrors Figma's "File" tab: Pages + Layers)
// ────────────────────────────────────────────────────────────

export function FilesTab() {
    const [pagesOpen, setPagesOpen] = useState(true)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

    const pages = useEditorStore((s) => s.pages)
    const activePageId = useEditorStore((s) => s.activePageId)
    const addPage = useEditorStore((s) => s.addPage)
    const switchPage = useEditorStore((s) => s.switchPage)
    const renamePage = useEditorStore((s) => s.renamePage)

    const handleAddPage = () => {
        const newId = addPage()
        setRenamingId(newId)
    }

    const handleContextMenu = (e: React.MouseEvent, pageId: string) => {
        e.preventDefault()
        setContextMenu({ pageId, x: e.clientX, y: e.clientY })
    }

    return (
        <div className="flex flex-col h-full">
            {/* ── Pages section ── */}
            <SectionHeader
                title="Pages"
                open={pagesOpen}
                onToggle={() => setPagesOpen((v) => !v)}
                action={
                    <button
                        title="Add page"
                        onClick={handleAddPage}
                        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                }
            />
            {pagesOpen && (
                <div className="px-2 pb-2 space-y-0.5">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            onClick={() => switchPage(page.id)}
                            onDoubleClick={() => setRenamingId(page.id)}
                            onContextMenu={(e) => handleContextMenu(e, page.id)}
                            className={cn(
                                'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors',
                                page.id === activePageId
                                    ? 'bg-muted/80 text-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            )}
                        >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {renamingId === page.id ? (
                                <PageNameInput
                                    initialName={page.name}
                                    onCommit={(name) => {
                                        renamePage(page.id, name)
                                        setRenamingId(null)
                                    }}
                                />
                            ) : (
                                <span className="truncate">{page.name}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Context menu portal ── */}
            {contextMenu && (
                <PageContextMenu
                    state={contextMenu}
                    onClose={() => setContextMenu(null)}
                    onRename={(pageId) => setRenamingId(pageId)}
                    canDelete={pages.length > 1}
                />
            )}

            {/* ── Layers section (LayersPanel provides its own header) ── */}
            <div className="flex-1 min-h-0 [&>div]:border-r-0">
                <LayersPanel />
            </div>
        </div>
    )
}
