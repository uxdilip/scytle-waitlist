'use client'

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
    MoreHorizontal,
    Plus,
    Trash2,
    Sparkles,
    Copy,
    Scissors,
    ClipboardPaste,
    Home,
    FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useSitemapStore } from '@/store/sitemap-store'
import { DraggableSection } from './draggable-section'

// Section can be either a string (legacy) or an object with name/description
interface SectionData {
    id?: string
    name: string
    description?: string
}

interface PageNodeData {
    label: string
    slug?: string
    sections?: (string | SectionData)[]
    description?: string
}

// Helper to normalize section data
function normalizeSection(section: string | SectionData, index: number, pageId: string): SectionData & { id: string } {
    if (typeof section === 'string') {
        return { id: `${pageId}-section-${index}`, name: section, description: '' }
    }
    return { ...section, id: section.id || `${pageId}-section-${index}` }
}

export const PageNode = memo(function PageNode({
    data,
    selected,
    id,
}: NodeProps & { data: PageNodeData }) {
    const rawSections = data.sections || []
    const sections = rawSections.map((s, i) => normalizeSection(s, i, id))
    const isHomePage = id === 'home' || data.slug === '/'
    const [menuSearch, setMenuSearch] = useState('')
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editTitle, setEditTitle] = useState(data.label)
    const titleInputRef = useRef<HTMLInputElement>(null)

    // Store actions & state
    const {
        openSectionPicker, removeSectionFromPage, moveSectionInPage,
        updateSectionInPage, updateNode, deleteNode, addSiblingPage, addChildPage,
        edges, zoomLevel,
    } = useSitemapStore()

    const PageIcon = isHomePage ? Home : FileText

    // Check if this node has children (outgoing edges)
    const hasChildren = edges.some(e => e.source === id)
    // Check if this node has a parent (not root-level / project)
    const hasParent = edges.some(e => e.target === id && e.source !== 'project')

    // Check if section is a global section (Navbar/Footer)
    const isGlobalSection = (name: string) => {
        const lower = name.toLowerCase()
        return lower === 'navbar' || lower === 'footer' || lower === 'header' || lower === 'navigation'
    }

    const handleAddSection = (atIndex: number) => {
        openSectionPicker(id, atIndex)
    }

    const handleDeleteSection = (index: number) => {
        removeSectionFromPage(id, index)
    }

    const handleUpdateSection = (index: number, name: string, description?: string) => {
        updateSectionInPage(id, index, { name, description })
    }

    // Title editing handlers
    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus()
            titleInputRef.current.select()
        }
    }, [isEditingTitle])

    const handleTitleBlur = () => {
        setIsEditingTitle(false)
        if (editTitle.trim() && editTitle !== data.label) {
            updateNode(id, { label: editTitle.trim() })
        }
    }

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleTitleBlur()
        } else if (e.key === 'Escape') {
            setIsEditingTitle(false)
            setEditTitle(data.label)
        }
    }

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // 5px movement required before drag starts
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // Handle drag end
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = sections.findIndex(s => s.id === active.id)
            const newIndex = sections.findIndex(s => s.id === over.id)

            if (oldIndex !== -1 && newIndex !== -1) {
                moveSectionInPage(id, oldIndex, newIndex)
            }
        }
    }, [sections, id, moveSectionInPage])

    return (
        <div
            className={cn(
                'group relative bg-background rounded-lg shadow-md transition-all duration-150',
                'border-2 min-w-[260px] max-w-[300px]',
                selected
                    ? 'border-primary shadow-lg shadow-primary/10'
                    : 'border-border hover:border-primary/40 hover:shadow-lg'
            )}
        >
            {/* Top handle - invisible, only for edge connections */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-0 !h-0 !bg-transparent !border-0 !min-w-0 !min-h-0 !top-0"
            />

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-muted/30">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <PageIcon className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                    <div className="min-w-0">
                        {isEditingTitle ? (
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                size={Math.max(1, editTitle.length)}
                                className="font-semibold text-sm bg-transparent border-none outline-none ring-1 ring-primary rounded px-1 -mx-1"
                                style={{ width: `${Math.max(20, editTitle.length * 8 + 12)}px` }}
                            />
                        ) : (
                            <h3
                                onDoubleClick={(e) => {
                                    e.stopPropagation()
                                    setEditTitle(data.label)
                                    setIsEditingTitle(true)
                                }}
                                className="font-semibold text-sm truncate cursor-default select-none"
                            >
                                {data.label}
                            </h3>
                        )}
                    </div>
                </div>

                {/* Actions dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                'p-1 rounded hover:bg-muted transition-colors',
                                'opacity-0 group-hover:opacity-100 focus:opacity-100',
                                selected && 'opacity-100'
                            )}
                        >
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <div className="px-2 pb-2">
                            <Input
                                placeholder="Search actions..."
                                value={menuSearch}
                                onChange={(e) => setMenuSearch(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <DropdownMenuSeparator />

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                                Ask AI
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-48">
                                <DropdownMenuItem>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Generate page
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Edit sitemap prompt
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteNode(id)}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Scissors className="w-4 h-4 mr-2" />
                            Cut
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <ClipboardPaste className="w-4 h-4 mr-2" />
                            Paste
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem>
                            <Plus className="w-4 h-4 mr-2" />
                            Add child page
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Sections list with drag and drop */}
            <div className="p-2 pl-6 nodrag">
                {sections.length > 0 ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sections.map(s => s.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {sections.map((section, index) => (
                                    <DraggableSection
                                        key={section.id}
                                        section={section}
                                        index={index}
                                        isGlobal={isGlobalSection(section.name)}
                                        onUpdate={(name, description) => handleUpdateSection(index, name, description)}
                                        onAddSection={() => handleAddSection(index + 1)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                ) : (
                    /* Add section button when empty */
                    <button
                        className={cn(
                            'w-full flex items-center justify-center gap-1.5 py-2',
                            'rounded-md border-2 border-dashed',
                            'text-xs transition-all duration-150',
                            'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10'
                        )}
                        onClick={() => handleAddSection(0)}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Section
                    </button>
                )}
            </div>

            {/* Bottom handle - invisible, only for edge connections */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-0 !h-0 !bg-transparent !border-0 !min-w-0 !min-h-0 !bottom-0"
            />

            {/* Relume-style + buttons around the node */}
            {/* Left + button (add sibling to the left) - near the title */}
            {hasParent && (
                <button
                    className={cn(
                        'nodrag absolute z-20',
                        'rounded-full bg-white text-black border border-border/60',
                        'flex items-center justify-center',
                        'shadow-sm hover:shadow-md hover:scale-110 transition-all duration-150',
                        'opacity-0 group-hover:opacity-100'
                    )}
                    style={{
                        top: '14px',
                        left: `${-Math.max(24, Math.min(36, 2400 / zoomLevel))}px`,
                        width: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                        height: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        addSiblingPage(id, 'left')
                    }}
                >
                    <Plus style={{ width: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px`, height: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px` }} />
                </button>
            )}

            {/* Right + button (add sibling to the right) - near the title */}
            {hasParent && (
                <button
                    className={cn(
                        'nodrag absolute z-20',
                        'rounded-full bg-white text-black border border-border/60',
                        'flex items-center justify-center',
                        'shadow-sm hover:shadow-md hover:scale-110 transition-all duration-150',
                        'opacity-0 group-hover:opacity-100'
                    )}
                    style={{
                        top: '14px',
                        right: `${-Math.max(24, Math.min(36, 2400 / zoomLevel))}px`,
                        width: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                        height: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        addSiblingPage(id, 'right')
                    }}
                >
                    <Plus style={{ width: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px`, height: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px` }} />
                </button>
            )}

            {/* Bottom + button (add child page) - shown only if node has NO children */}
            {!hasChildren && (
                <button
                    className={cn(
                        'nodrag absolute left-1/2 -translate-x-1/2 z-20',
                        'rounded-full bg-white text-black border border-border/60',
                        'flex items-center justify-center',
                        'shadow-sm hover:shadow-md hover:scale-110 transition-all duration-150',
                        'opacity-0 group-hover:opacity-100'
                    )}
                    style={{
                        bottom: `${-Math.max(24, Math.min(36, 2400 / zoomLevel))}px`,
                        width: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                        height: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        addChildPage(id)
                    }}
                >
                    <Plus style={{ width: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px`, height: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px` }} />
                </button>
            )}
        </div>
    )
})
