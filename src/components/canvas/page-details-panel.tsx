'use client'

import { useEffect, useState } from 'react'
import { useSitemapStore } from '@/store/sitemap-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    X,
    Plus,
    Trash2,
    GripVertical,
    FileText,
    Link2,
    Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageDetailsPanelProps {
    isOpen: boolean
    onClose: () => void
}

export function PageDetailsPanel({ isOpen, onClose }: PageDetailsPanelProps) {
    const { nodes, selectedNodeId, updateNode, deleteNode, saveToHistory } = useSitemapStore()

    const selectedNode = nodes.find(n => n.id === selectedNodeId)

    const [pageName, setPageName] = useState('')
    const [pageSlug, setPageSlug] = useState('')
    const [pageDescription, setPageDescription] = useState('')
    const [sections, setSections] = useState<string[]>([])

    // Sync form with selected node
    useEffect(() => {
        if (selectedNode) {
            setPageName(selectedNode.data?.label as string || '')
            setPageSlug(selectedNode.data?.slug as string || '')
            setPageDescription(selectedNode.data?.description as string || '')
            setSections((selectedNode.data?.sections as string[]) || [])
        }
    }, [selectedNode])

    // Save changes when form values change
    const handleSave = () => {
        if (!selectedNodeId) return

        saveToHistory()
        updateNode(selectedNodeId, {
            label: pageName,
            slug: pageSlug.toLowerCase().replace(/\s+/g, '-'),
            description: pageDescription,
            sections,
        })
    }

    const handleAddSection = () => {
        setSections([...sections, 'New Section'])
    }

    const handleUpdateSection = (index: number, value: string) => {
        const newSections = [...sections]
        newSections[index] = value
        setSections(newSections)
    }

    const handleRemoveSection = (index: number) => {
        setSections(sections.filter((_, i) => i !== index))
    }

    const handleDeletePage = () => {
        if (!selectedNodeId) return

        // Don't allow deleting the project root node
        if (selectedNode?.type === 'project') {
            return
        }

        saveToHistory()
        deleteNode(selectedNodeId)
        onClose()
    }

    if (!isOpen || !selectedNode) {
        return null
    }

    const isProjectNode = selectedNode.type === 'project'

    return (
        <div className="w-80 border-l bg-background h-full flex flex-col animate-in slide-in-from-right-5 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">
                        {isProjectNode ? 'Project Details' : 'Page Details'}
                    </h3>
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onClose}
                    className="rounded-md"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {/* Page Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Type className="w-3 h-3" />
                            {isProjectNode ? 'Project Name' : 'Page Name'}
                        </label>
                        <Input
                            value={pageName}
                            onChange={(e) => setPageName(e.target.value)}
                            onBlur={handleSave}
                            placeholder={isProjectNode ? "My Project" : "Page name"}
                            className="h-9"
                        />
                    </div>

                    {/* Slug (not for project node) */}
                    {!isProjectNode && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Link2 className="w-3 h-3" />
                                URL Slug
                            </label>
                            <Input
                                value={pageSlug}
                                onChange={(e) => setPageSlug(e.target.value)}
                                onBlur={handleSave}
                                placeholder="/about"
                                className="h-9 font-mono text-sm"
                            />
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Description
                        </label>
                        <Textarea
                            value={pageDescription}
                            onChange={(e) => setPageDescription(e.target.value)}
                            onBlur={handleSave}
                            placeholder="Brief description of this page..."
                            className="min-h-[80px] resize-none"
                        />
                    </div>

                    {/* Sections (not for project node) */}
                    {!isProjectNode && (
                        <>
                            <Separator />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Page Sections
                                    </label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleAddSection}
                                        className="h-7 text-xs"
                                    >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add
                                    </Button>
                                </div>

                                {sections.length === 0 ? (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <p className="text-xs">No sections yet</p>
                                        <p className="text-xs mt-1">Add sections to organize your page content</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {sections.map((section, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-2 group"
                                            >
                                                <GripVertical className="w-3 h-3 text-muted-foreground/50 cursor-grab" />
                                                <Input
                                                    value={section}
                                                    onChange={(e) => handleUpdateSection(index, e.target.value)}
                                                    onBlur={handleSave}
                                                    className="h-8 text-sm flex-1"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => {
                                                        handleRemoveSection(index)
                                                        handleSave()
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </ScrollArea>

            {/* Footer Actions */}
            {!isProjectNode && (
                <div className="p-4 border-t">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeletePage}
                        className="w-full"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Page
                    </Button>
                </div>
            )}
        </div>
    )
}
