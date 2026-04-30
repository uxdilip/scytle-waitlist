'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useSitemapStore } from '@/store/sitemap-store'
import { useProjectStore } from '@/store'
import { createJWT } from '@/lib/appwrite'
import { toast } from 'sonner'

const PAGE_COUNT_OPTIONS = [
    { value: '2-5', label: '2-5 pages' },
    { value: '6-10', label: '6-10 pages' },
    { value: '11-15', label: '11-15 pages' },
    { value: '16-20', label: '16-20 pages' },
    { value: '20+', label: '20+ pages' },
]

const LANGUAGE_OPTIONS = [
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'it', label: 'Italian' },
    { value: 'ja', label: 'Japanese' },
    { value: 'zh', label: 'Chinese' },
]

export function ProjectPanel() {
    const { currentProject } = useProjectStore()
    const { loadSitemap } = useSitemapStore()

    const [description, setDescription] = useState(currentProject?.description || '')
    const [pageCount, setPageCount] = useState('2-5')
    const [language, setLanguage] = useState('en-US')
    const [isGenerating, setIsGenerating] = useState(false)

    const handleTryExample = () => {
        setDescription(
            "Gretta is a boutique Architectural firm based in Los Angeles that focuses on homes as well as smaller commercial and community projects."
        )
    }

    const handleGenerateSitemap = async () => {
        if (!description.trim()) {
            toast.error('Please enter a project description')
            return
        }

        setIsGenerating(true)
        try {
            const jwt = await createJWT()
            if (!jwt) {
                toast.error('Not authenticated. Please log in again.')
                return
            }

            const response = await fetch('/api/ai/generate-sitemap', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwt.jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    description,
                    pageCount,
                    language,
                    projectId: currentProject?.projectId,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to generate sitemap')
            }

            const data = await response.json()

            // Load the generated sitemap into both stores
            if (data.sitemap?.pages) {
                const projectName = currentProject?.name || 'Untitled'
                loadSitemap(data.sitemap.pages, projectName)
                toast.success(`Generated ${data.sitemap.pages.length} pages`)
            }

        } catch (error) {
            console.error('❌ Generation error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to generate sitemap')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-sm">
                        Description <span className="text-destructive">*</span>
                    </Label>
                    <button
                        onClick={handleTryExample}
                        className="text-xs text-primary hover:underline"
                    >
                        Try example
                    </button>
                </div>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your project, business, or website..."
                    className="min-h-[120px] resize-none"
                />
                <div className="flex justify-end">
                    <button className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Prompt +
                    </button>
                </div>
            </div>

            {/* Number of Pages */}
            <div className="space-y-2">
                <Label htmlFor="pageCount" className="text-sm">
                    Number of pages
                </Label>
                <Select value={pageCount} onValueChange={setPageCount}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PAGE_COUNT_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
                <Label htmlFor="language" className="text-sm">
                    Language
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LANGUAGE_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerateSitemap}
                disabled={!description.trim() || isGenerating}
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
                        Generate sitemap
                    </>
                )}
            </Button>

            {/* Warning */}
            <p className="text-xs text-muted-foreground text-center">
                This will override all page sections and copy
            </p>
        </div>
    )
}
