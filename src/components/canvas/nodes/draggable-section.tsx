'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSitemapStore } from '@/store/sitemap-store'

// Note: Parent must have 'nodrag' class to prevent ReactFlow from capturing drag events

interface SectionData {
    id: string
    name: string
    description?: string
}

interface DraggableSectionProps {
    section: SectionData
    index: number
    isGlobal: boolean
    onUpdate: (name: string, description?: string) => void
    onAddSection: () => void
}

export function DraggableSection({
    section,
    index,
    isGlobal,
    onUpdate,
    onAddSection,
}: DraggableSectionProps) {
    const [isEditingName, setIsEditingName] = useState(false)
    const [isEditingDesc, setIsEditingDesc] = useState(false)
    const [editName, setEditName] = useState(section.name)
    const [editDesc, setEditDesc] = useState(section.description || '')
    const nameInputRef = useRef<HTMLInputElement>(null)
    const descInputRef = useRef<HTMLTextAreaElement>(null)
    const zoomLevel = useSitemapStore(state => state.zoomLevel)

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    // Use Translate for smoother dragging (better performance than Transform)
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
    }

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingName && nameInputRef.current) {
            nameInputRef.current.focus()
            nameInputRef.current.select()
        }
    }, [isEditingName])

    useEffect(() => {
        if (isEditingDesc && descInputRef.current) {
            descInputRef.current.focus()
            descInputRef.current.select()
        }
    }, [isEditingDesc])

    const handleNameBlur = () => {
        setIsEditingName(false)
        if (editName.trim() && editName !== section.name) {
            onUpdate(editName.trim(), section.description)
        }
    }

    const handleDescBlur = () => {
        setIsEditingDesc(false)
        if (editDesc !== section.description) {
            onUpdate(section.name, editDesc.trim() || undefined)
        }
    }

    const handleNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleNameBlur()
        } else if (e.key === 'Escape') {
            setIsEditingName(false)
            setEditName(section.name)
        }
    }

    const handleDescKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleDescBlur()
        } else if (e.key === 'Escape') {
            setIsEditingDesc(false)
            setEditDesc(section.description || '')
        }
    }

    // Prevent section click from bubbling to node (which opens sidebar)
    const handleSectionClick = (e: React.MouseEvent) => {
        e.stopPropagation()
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={handleSectionClick}
            className={cn(
                'relative rounded-md border transition-all duration-150',
                'hover:border-primary group/section',
                isDragging && 'opacity-70 shadow-lg',
                isGlobal
                    ? 'bg-emerald-50/50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40'
                    : 'bg-background border-border'
            )}
        >
            <div className="flex items-start">
                {/* Drag handle - always on left outside */}
                <div
                    {...attributes}
                    {...listeners}
                    className={cn(
                        'absolute -left-6 top-1/2 -translate-y-1/2',
                        'flex items-center justify-center p-1',
                        'cursor-grab active:cursor-grabbing',
                        'opacity-0 group-hover/section:opacity-100 transition-opacity duration-150',
                        'touch-none'
                    )}
                >
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* Section content */}
                <div className="flex-1 px-3 py-2.5 min-w-0 cursor-default select-none">
                    {/* Section name - click to edit */}
                    <div className="flex items-center">
                        {isEditingName ? (
                            <input
                                ref={nameInputRef}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={handleNameBlur}
                                onKeyDown={handleNameKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 text-sm font-medium bg-transparent border-none outline-none ring-1 ring-primary rounded px-1 -mx-1 cursor-text select-text"
                            />
                        ) : (
                            <span
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setEditName(section.name)
                                    setIsEditingName(true)
                                }}
                                className="text-sm font-medium text-foreground cursor-default"
                            >
                                {section.name}
                            </span>
                        )}
                    </div>

                    {/* Section description - click to edit (hidden for global sections like Navbar/Footer) */}
                    {!isGlobal && isEditingDesc ? (
                        <textarea
                            ref={descInputRef}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            onBlur={handleDescBlur}
                            onKeyDown={handleDescKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs text-muted-foreground mt-1 bg-transparent border-none outline-none ring-1 ring-primary rounded px-1 resize-none cursor-text select-text"
                            rows={3}
                            placeholder="Add a description..."
                        />
                    ) : !isGlobal && section.description ? (
                        <p
                            onClick={(e) => {
                                e.stopPropagation()
                                setEditDesc(section.description || '')
                                setIsEditingDesc(true)
                            }}
                            className="text-xs text-muted-foreground mt-1 line-clamp-3 cursor-default"
                        >
                            {section.description}
                        </p>
                    ) : null}
                </div>

                {/* Add section button - appears on hover, scales inversely with zoom */}
                <button
                    className={cn(
                        'absolute -bottom-3 left-1/2 -translate-x-1/2 z-10',
                        'rounded-full',
                        'bg-primary text-primary-foreground',
                        'flex items-center justify-center',
                        'shadow-md hover:scale-110 transition-all duration-150',
                        'opacity-0 group-hover/section:opacity-100'
                    )}
                    style={{
                        // Inverse zoom: button gets bigger when zoomed out to stay usable
                        width: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                        height: `${Math.max(20, Math.min(32, 2000 / zoomLevel))}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        onAddSection()
                    }}
                >
                    <Plus style={{ width: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px`, height: `${Math.max(12, Math.min(18, 1200 / zoomLevel))}px` }} />
                </button>
            </div>
        </div>
    )
}
