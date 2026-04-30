'use client'

import { useState, useMemo } from 'react'
import { X, Search, Plus, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSitemapStore } from '@/store/sitemap-store'

// Section categories and their sections (Relume-style)
const SECTION_CATEGORIES = {
    global: {
        label: 'Global sections',
        sections: [
            { id: 'navbar', name: 'Navbar', description: 'Navigation bar with logo and menu links' },
            { id: 'footer', name: 'Footer', description: 'Page footer with links and contact info' },
        ]
    },
    saved: {
        label: 'Saved',
        sections: [
            { id: 'page-templates', name: 'Page Templates', description: 'Your saved page templates', isFolder: true },
        ]
    },
    categories: {
        label: 'Categories',
        sections: [
            { id: 'blank-section', name: 'Blank Section', description: 'Empty section to customize' },
            { id: 'about', name: 'About', description: 'About us / company information section' },
            { id: 'announcement-banner', name: 'Announcement Banner', description: 'Top banner for announcements' },
            { id: 'benefits', name: 'Benefits', description: 'Benefits and advantages listing' },
            { id: 'blog-list-header', name: 'Blog List Header', description: 'Header for blog listing page' },
            { id: 'blog-list', name: 'Blog List', description: 'List of blog posts' },
            { id: 'blog-post-body', name: 'Blog Post Body', description: 'Blog post content area' },
            { id: 'blog-post-header', name: 'Blog Post Header', description: 'Blog post title and meta' },
            { id: 'contact', name: 'Contact', description: 'Contact form and information' },
            { id: 'cta', name: 'CTA', description: 'Call to action section' },
            { id: 'event-item-header', name: 'Event Item Header', description: 'Event details header' },
            { id: 'events-list', name: 'Events List', description: 'List of upcoming events' },
            { id: 'faq', name: 'FAQ', description: 'Frequently asked questions' },
            { id: 'feature', name: 'Feature', description: 'Single feature highlight' },
            { id: 'features-list', name: 'Features List', description: 'Multiple features grid' },
            { id: 'gallery', name: 'Gallery', description: 'Image or media gallery' },
            { id: 'header', name: 'Header', description: 'Page header section' },
            { id: 'hero', name: 'Hero', description: 'Main hero section with headline' },
            { id: 'hero-header', name: 'Hero Header', description: 'Hero section with header style' },
            { id: 'how-it-works', name: 'How It Works', description: 'Step-by-step process section' },
            { id: 'job-listings', name: 'Job Listings', description: 'Career opportunities listing' },
            { id: 'logo-list', name: 'Logo List', description: 'Partner or client logos' },
            { id: 'portfolio-item-body', name: 'Portfolio Item Body', description: 'Portfolio project content' },
            { id: 'portfolio-item-header', name: 'Portfolio Item Header', description: 'Portfolio project header' },
            { id: 'portfolio-list', name: 'Portfolio List', description: 'Portfolio projects grid' },
            { id: 'pricing', name: 'Pricing', description: 'Pricing plans and options' },
            { id: 'services', name: 'Services', description: 'Services overview section' },
            { id: 'stats', name: 'Stats', description: 'Statistics and numbers' },
            { id: 'team', name: 'Team', description: 'Team members showcase' },
            { id: 'testimonials', name: 'Testimonials', description: 'Customer testimonials and reviews' },
            { id: 'timeline', name: 'Timeline', description: 'Timeline or history section' },
            { id: 'video', name: 'Video', description: 'Video embed section' },
        ]
    }
}

interface SectionPickerPanelProps {
    isOpen: boolean
    onClose: () => void
    onSelectSection: (section: { id: string; name: string; description: string }) => void
    targetPageId: string | null
    insertAtIndex: number | null
}

export function SectionPickerPanel({
    isOpen,
    onClose,
    onSelectSection,
    targetPageId,
    insertAtIndex,
}: SectionPickerPanelProps) {
    const [search, setSearch] = useState('')
    const { nodes } = useSitemapStore()

    // Calculate how many times each global section appears across all pages
    const globalSectionCounts = useMemo(() => {
        const counts: Record<string, number> = { navbar: 0, footer: 0 }
        
        nodes.forEach(node => {
            if (node.type === 'page' && node.data) {
                const sections = (node.data as { sections?: Array<string | { name: string }> }).sections || []
                sections.forEach(section => {
                    const name = typeof section === 'string' ? section : section.name
                    const lowerName = name.toLowerCase()
                    if (lowerName === 'navbar' || lowerName === 'navigation' || lowerName === 'header') {
                        counts.navbar++
                    } else if (lowerName === 'footer') {
                        counts.footer++
                    }
                })
            }
        })
        
        return counts
    }, [nodes])

    // Filter sections based on search
    const filteredCategories = useMemo(() => {
        if (!search.trim()) return SECTION_CATEGORIES

        const searchLower = search.toLowerCase()
        const filtered: typeof SECTION_CATEGORIES = {
            global: {
                label: 'Global sections',
                sections: SECTION_CATEGORIES.global.sections.filter(s =>
                    s.name.toLowerCase().includes(searchLower) ||
                    s.description.toLowerCase().includes(searchLower)
                )
            },
            saved: {
                label: 'Saved',
                sections: SECTION_CATEGORIES.saved.sections.filter(s =>
                    s.name.toLowerCase().includes(searchLower)
                )
            },
            categories: {
                label: 'Categories',
                sections: SECTION_CATEGORIES.categories.sections.filter(s =>
                    s.name.toLowerCase().includes(searchLower) ||
                    s.description.toLowerCase().includes(searchLower)
                )
            }
        }
        return filtered
    }, [search])

    const handleSelectSection = (section: { id: string; name: string; description: string }) => {
        onSelectSection(section)
        setSearch('')
    }

    // Get section icon placeholder
    const getSectionIcon = (sectionId: string) => {
        // Return a simple placeholder icon based on section type
        if (sectionId === 'navbar' || sectionId === 'footer') {
            return (
                <div className="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
            )
        }
        return (
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                <div className="w-5 h-4 border border-muted-foreground/30 rounded-sm bg-background">
                    <div className="w-full h-1 bg-muted-foreground/20 mt-0.5 mx-auto" style={{ width: '80%' }} />
                    <div className="w-full h-0.5 bg-muted-foreground/10 mt-0.5 mx-auto" style={{ width: '60%' }} />
                </div>
            </div>
        )
    }

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
                <h2 className="font-semibold text-sm">Add</h2>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onClose}
                    className="h-6 w-6"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
            </div>

            {/* Sections List */}
            <ScrollArea className="h-[calc(100%-120px)]">
                <div className="p-2">
                    {/* Global Sections */}
                    {filteredCategories.global.sections.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs text-muted-foreground font-medium px-2 mb-2">
                                {filteredCategories.global.label}
                            </p>
                            {filteredCategories.global.sections.map((section) => (
                                <button
                                    key={section.id}
                                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
                                    onClick={() => handleSelectSection(section)}
                                >
                                    {getSectionIcon(section.id)}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-medium truncate">{section.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {globalSectionCounts[section.id] || 0} instance{globalSectionCounts[section.id] !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Saved */}
                    {filteredCategories.saved.sections.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs text-muted-foreground font-medium px-2 mb-2">
                                {filteredCategories.saved.label}
                            </p>
                            {filteredCategories.saved.sections.map((section) => (
                                <button
                                    key={section.id}
                                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded bg-foreground flex items-center justify-center">
                                        <div className="w-4 h-4 border-2 border-background rounded" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-medium truncate">{section.name}</p>
                                        <p className="text-xs text-muted-foreground">0 saved</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Categories */}
                    {filteredCategories.categories.sections.length > 0 && (
                        <div>
                            <p className="text-xs text-muted-foreground font-medium px-2 mb-2">
                                {filteredCategories.categories.label}
                            </p>
                            {filteredCategories.categories.sections.map((section) => (
                                <button
                                    key={section.id}
                                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
                                    onClick={() => handleSelectSection(section)}
                                >
                                    {getSectionIcon(section.id)}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-medium truncate">{section.name}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* No results */}
                    {filteredCategories.global.sections.length === 0 &&
                        filteredCategories.saved.sections.length === 0 &&
                        filteredCategories.categories.sections.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No sections found for "{search}"
                            </p>
                        )}
                </div>
            </ScrollArea>
        </div>
    )
}
