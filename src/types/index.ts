import { z } from 'zod'

// ============================================
// ZOD SCHEMAS
// ============================================

// User
export const UserSchema = z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string().min(1),
    plan: z.enum(['free', 'pro']).default('free'),
    createdAt: z.string().datetime(),
})

// Project Status
export const ProjectStatusSchema = z.enum(['draft', 'in-progress', 'completed'])

// Sitemap Section Schema
export const SitemapSectionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
})

// Sitemap Page Schema (for stored data)
export const SitemapPageSchema = z.object({
    id: z.string(),
    label: z.string(),
    slug: z.string(),
    sections: z.array(SitemapSectionSchema),
    children: z.array(z.lazy((): z.ZodTypeAny => SitemapPageSchema)).optional(),
})

// Product & AI Model
export const ProductTypeSchema = z.enum(['web', 'app'])
export const AiModelSchema = z.enum(['gemini-pro', 'gemini-flash'])

// Project
export const ProjectSchema = z.object({
    projectId: z.string(),
    userId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    status: ProjectStatusSchema.default('draft'),
    productType: ProductTypeSchema.optional().default('web'),
    aiModel: AiModelSchema.optional().default('gemini-flash'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    sitemapData: z.array(SitemapPageSchema).nullable().optional(),
    wireframeData: z.string().nullable().optional(), // JSON stringified wireframe pages
})

export const CreateProjectSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    productType: ProductTypeSchema.optional(),
    aiModel: AiModelSchema.optional(),
})

export const UpdateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    status: ProjectStatusSchema.optional(),
    productType: ProductTypeSchema.optional(),
    aiModel: AiModelSchema.optional(),
    sitemapData: z.string().optional(), // JSON stringified sitemap pages
    wireframeData: z.string().optional(), // JSON stringified wireframe pages
    canvasData: z.string().optional(), // JSON stringified canvas editor state (pages + nodes)
})

// Page
export const PageSchema = z.object({
    pageId: z.string(),
    projectId: z.string(),
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(100),
    parentId: z.string().nullable().optional(),
    order: z.number().int().min(0).default(0),
    sections: z.array(z.string()).default([]),
})

export const CreatePageSchema = z.object({
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(100).optional(),
    parentId: z.string().nullable().optional(),
    order: z.number().int().min(0).optional(),
})

// Page Context & Layout (SaaS expansion)
export const PageContextSchema = z.enum(['marketing', 'application', 'auth'])
export const PageLayoutSchema = z.enum(['stacked', 'app-shell', 'centered'])

// Section Types
export const SectionTypeSchema = z.enum([
    // Marketing section types
    'hero',
    'features',
    'feature-grid',
    'testimonials',
    'testimonial-single',
    'pricing',
    'pricing-table',
    'faq',
    'cta',
    'cta-banner',
    'contact',
    'contact-form',
    'team',
    'about',
    'stats',
    'logos',
    'gallery',
    'blog-list',
    'blog-post',
    'footer',
    'header',
    'navigation',
    'custom',
    // Application section types (SaaS)
    'dashboard',
    'data-table',
    'app-list',
    'chart',
    'app-form',
    'empty-state',
    // Auth section types
    'auth',
])

// Section
export const SectionSchema = z.object({
    sectionId: z.string(),
    pageId: z.string(),
    type: SectionTypeSchema,
    content: z.record(z.string(), z.unknown()).default({}),
    order: z.number().int().min(0).default(0),
    config: z.record(z.string(), z.unknown()).default({}),
})

export const CreateSectionSchema = z.object({
    type: SectionTypeSchema,
    content: z.record(z.string(), z.unknown()).optional(),
    order: z.number().int().min(0).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
})

// Style Guide
export const StyleGuideSchema = z.object({
    styleGuideId: z.string(),
    projectId: z.string(),
    colors: z.object({
        primary: z.string(),
        secondary: z.string(),
        accent: z.string(),
        neutral: z.array(z.string()),
    }),
    fonts: z.object({
        heading: z.string(),
        body: z.string(),
    }),
    spacing: z.array(z.number()),
    components: z.record(z.string(), z.unknown()).default({}),
})

// Research Data
export const CompetitorSchema = z.object({
    name: z.string(),
    url: z.string().url(),
    features: z.array(z.string()),
    pricing: z.string().optional(),
})

export const ResearchDataSchema = z.object({
    researchId: z.string(),
    projectId: z.string(),
    competitors: z.array(CompetitorSchema),
    insights: z.array(z.string()),
    opportunities: z.array(z.string()),
})

// AI Conversations
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system'])

export const MessageSchema = z.object({
    role: MessageRoleSchema,
    content: z.string(),
    timestamp: z.string().datetime(),
})

export const AIConversationSchema = z.object({
    conversationId: z.string(),
    projectId: z.string(),
    messages: z.array(MessageSchema),
    context: z.record(z.string(), z.unknown()).default({}),
})

// Chat Message (for API)
export const ChatMessageSchema = z.object({
    message: z.string().min(1).max(4000),
    projectId: z.string(),
    selectedNodeId: z.string().nullable().optional(),
    canvasNodes: z.array(z.any()).optional(), // Will contain subset of ScytleNode fields
    model: z.string().optional(), // AI model key (e.g., 'gemini-pro', 'gemini-flash')
    images: z.array(z.object({
        mimeType: z.string(),
        data: z.string(),
    })).max(5).optional(),
})

// Image attachment (client-side only, not persisted to DB)
export interface ImageAttachment {
    id: string
    file: File
    dataUrl: string
    mimeType: string
}

// ============================================
// TypeScript Types (derived from Zod schemas)
// ============================================

export type User = z.infer<typeof UserSchema>
export type Project = z.infer<typeof ProjectSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>
export type ProductType = z.infer<typeof ProductTypeSchema>
export type AiModel = z.infer<typeof AiModelSchema>

export type Page = z.infer<typeof PageSchema>
export type CreatePageInput = z.infer<typeof CreatePageSchema>

export type PageContext = z.infer<typeof PageContextSchema>
export type PageLayout = z.infer<typeof PageLayoutSchema>
export type SectionType = z.infer<typeof SectionTypeSchema>
export type Section = z.infer<typeof SectionSchema>
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>

export type StyleGuide = z.infer<typeof StyleGuideSchema>
export type Competitor = z.infer<typeof CompetitorSchema>
export type ResearchData = z.infer<typeof ResearchDataSchema>

export type MessageRole = z.infer<typeof MessageRoleSchema>
export type Message = z.infer<typeof MessageSchema>
export type AIConversation = z.infer<typeof AIConversationSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>

// ============================================
// Canvas Types (ReactFlow)
// ============================================

export interface CanvasNode {
    id: string
    type: 'page' | 'project'
    position: { x: number; y: number }
    data: {
        label: string
        slug?: string
        sections?: string[]
        isRoot?: boolean
    }
}

export interface CanvasEdge {
    id: string
    source: string
    target: string
    type?: 'smoothstep' | 'straight' | 'bezier'
}

export interface UIState {
    isSidebarOpen: boolean
    isDetailsOpen: boolean
    isLoading: boolean
    error: string | null
}

// ============================================
// Canvas Engine Types (Phase A)
// ============================================
export * from './canvas'
