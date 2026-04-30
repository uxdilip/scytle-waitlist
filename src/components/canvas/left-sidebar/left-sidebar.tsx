'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSitemapStore } from '@/store/sitemap-store'
import { ProjectPanel } from './project-panel'
import { PagePanel } from './page-panel'

interface LeftSidebarProps {
    isOpen: boolean
    onCloseAction: () => void
}

export function LeftSidebar({ isOpen, onCloseAction }: LeftSidebarProps) {
    const { selectedNodeId, nodes } = useSitemapStore()

    // Find the selected node
    const selectedNode = nodes.find(n => n.id === selectedNodeId)
    const isProjectNode = selectedNodeId === 'project'

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onCloseAction()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onCloseAction])

    return (
        <div
            className={cn(
                "absolute left-0 top-0 h-full w-[320px] bg-background border-r shadow-lg z-50",
                "transform transition-transform duration-200 ease-out",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <h2 className="font-semibold text-sm">
                    {isProjectNode ? 'Project' : 'Page'}
                </h2>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onCloseAction}
                    className="h-6 w-6"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto h-[calc(100%-52px)]">
                {isProjectNode ? (
                    <ProjectPanel />
                ) : selectedNode ? (
                    <PagePanel nodeId={selectedNodeId!} />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Select a node to edit
                    </p>
                )}
            </div>
        </div>
    )
}
