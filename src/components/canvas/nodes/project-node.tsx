'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Users, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSitemapStore } from '@/store/sitemap-store'

interface ProjectNodeData {
    label: string
    icon?: string
}

export const ProjectNode = memo(function ProjectNode({
    data,
    selected,
    id,
}: NodeProps & { data: ProjectNodeData }) {
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editTitle, setEditTitle] = useState(data.label)
    const titleInputRef = useRef<HTMLInputElement>(null)
    const { updateNode } = useSitemapStore()

    // Focus input when editing starts
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

    return (
        <div
            className={cn(
                'group bg-primary/10 border-2 rounded-lg shadow-md cursor-pointer',
                'min-w-[200px] transition-all duration-200',
                selected
                    ? 'border-primary bg-primary/20 shadow-lg'
                    : 'border-primary/30 hover:border-primary/50 hover:bg-primary/15'
            )}
        >
            {/* Content - Relume style */}
            <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            className="flex-1 font-medium text-sm bg-transparent border-none outline-none ring-1 ring-primary rounded px-1 -mx-1"
                        />
                    ) : (
                        <span
                            onClick={(e) => {
                                e.stopPropagation()
                                setEditTitle(data.label)
                                setIsEditingTitle(true)
                            }}
                            className="font-medium text-sm cursor-default select-none truncate"
                        >
                            {data.label}
                        </span>
                    )}
                </div>
                <button
                    className={cn(
                        'p-1 rounded hover:bg-primary/20 transition-colors shrink-0',
                        'opacity-0 group-hover:opacity-100',
                        selected && 'opacity-100'
                    )}
                >
                    <MoreHorizontal className="w-4 h-4 text-primary" />
                </button>
            </div>

            {/* Bottom handle - invisible, only for edge connections */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-0 !h-0 !bg-transparent !border-0 !min-w-0 !min-h-0 !bottom-0"
            />
        </div>
    )
})
