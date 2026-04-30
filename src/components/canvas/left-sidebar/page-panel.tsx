'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSitemapStore } from '@/store/sitemap-store'
import { useProjectStore } from '@/store'
import { createJWT } from '@/lib/appwrite'
import { toast } from 'sonner'

// Section can be either a string (legacy) or an object with name/description
interface SectionData {
    id?: string
    name: string
    description?: string
}

interface PageNodeData {
    label?: string
    slug?: string
    description?: string
    sections?: (string | SectionData)[]
}

// Helper to get section display name
function getSectionName(section: string | SectionData): string {
    return typeof section === 'string' ? section : section.name
}

interface PagePanelProps {
    nodeId: string
}

export function PagePanel({ nodeId }: PagePanelProps) {
    const { nodes, updateNode } = useSitemapStore()
    const { currentProject } = useProjectStore()

    const node = nodes.find(n => n.id === nodeId)
    const nodeData = node?.data as PageNodeData | undefined

    const [name, setName] = useState(nodeData?.label || '')
    const [description, setDescription] = useState(nodeData?.description || '')
    const [isGenerating, setIsGenerating] = useState(false)

    // Sync when node changes
    useEffect(() => {
        if (nodeData) {
            setName(nodeData.label || '')
            setDescription(nodeData.description || '')
        }
    }, [nodeId, nodeData])

    // Auto-save name changes
    useEffect(() => {
        if (nodeData && name !== nodeData.label) {
            const timeout = setTimeout(() => {
                updateNode(nodeId, { label: name })
            }, 300)
            return () => clearTimeout(timeout)
        }
    }, [name, nodeId, nodeData, updateNode])

    // Auto-save description changes
    useEffect(() => {
        if (nodeData && description !== nodeData.description) {
            const timeout = setTimeout(() => {
                updateNode(nodeId, { description })
            }, 300)
            return () => clearTimeout(timeout)
        }
    }, [description, nodeId, nodeData, updateNode])

    const handleGeneratePage = async () => {
        if (!name.trim()) {
            toast.error('Please enter a page name')
            return
        }

        setIsGenerating(true)
        try {
            const jwt = await createJWT()
            if (!jwt) {
                toast.error('Not authenticated. Please log in again.')
                return
            }

            const response = await fetch('/api/ai/generate-page', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwt.jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pageName: name,
                    pageDescription: description,
                    projectDescription: currentProject?.description,
                    existingSections: nodeData?.sections,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to generate page')
            }

            const data = await response.json()

            // Update node with generated sections
            if (data.page?.sections) {
                const sectionNames = data.page.sections.map((s: { name: string }) => s.name)
                updateNode(nodeId, { sections: sectionNames })
                toast.success(`Generated ${sectionNames.length} sections`)
            }

        } catch (error) {
            console.error('❌ Generation error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to generate page')
        } finally {
            setIsGenerating(false)
        }
    }

    if (!node) {
        return (
            <p className="text-sm text-muted-foreground">
                Node not found
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
                <Label htmlFor="name" className="text-sm">
                    Name <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Page name"
                />
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description" className="text-sm">
                    Description
                </Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a unique description to regenerate the page with a new layout and copy..."
                    className="min-h-[100px] resize-none"
                />
                <div className="flex justify-end">
                    <button className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Prompt +
                    </button>
                </div>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGeneratePage}
                disabled={!name.trim() || isGenerating}
                className="w-full gap-2"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Sparkles className="h-4 w-4" />
                        Generate page
                    </>
                )}
            </Button>
        </div>
    )
}
