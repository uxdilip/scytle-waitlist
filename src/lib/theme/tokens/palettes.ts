/**
 * V2 Design Token System — Curated Color Palettes
 *
 * ~60 curated palettes organized by mood/category.
 * "Shuffle" picks a random palette and applies it to the style guide store.
 * Each palette has a neutralBase (gray scale) + 1–3 accents.
 */

import type { AccentColor } from './index'

// ============================================
// Palette Interface
// ============================================

export interface ColorPalette {
    /** Unique palette ID */
    id: string
    /** Human-readable name */
    name: string
    /** Category for organized browsing */
    category: PaletteCategory
    /** Base neutral gray (used for text-secondary, borders) */
    neutralBase: string
    /** 1–3 accent colors */
    accents: AccentColor[]
}

export type PaletteCategory =
    | 'modern'    // Clean, minimal, tech
    | 'bold'      // Vibrant, high contrast
    | 'warm'      // Earthy, organic
    | 'cool'      // Blue, teal, calm
    | 'elegant'   // Muted, sophisticated
    | 'playful'   // Fun, colorful
    | 'corporate' // Professional, trustworthy
    | 'nature'    // Green, earthy tones

// ============================================
// Helper
// ============================================

function accent(id: string, name: string, hex: string, isMain = false): AccentColor {
    return { id, name, hex, isMain }
}

// ============================================
// Palette Library
// ============================================

export const COLOR_PALETTES: ColorPalette[] = [
    // ──────────────────── MODERN ────────────────────
    {
        id: 'modern-indigo',
        name: 'Modern Indigo',
        category: 'modern',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Indigo', '#4f46e5', true),
        ],
    },
    {
        id: 'midnight-slate',
        name: 'Midnight Slate',
        category: 'modern',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Slate Blue', '#475569', true),
            accent('accent-2', 'Sky', '#0ea5e9'),
        ],
    },
    {
        id: 'electric-violet',
        name: 'Electric Violet',
        category: 'modern',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Violet', '#7c3aed', true),
            accent('accent-2', 'Fuchsia', '#d946ef'),
        ],
    },
    {
        id: 'carbon-blue',
        name: 'Carbon Blue',
        category: 'modern',
        neutralBase: '#71717a',
        accents: [
            accent('accent-1', 'Blue', '#2563eb', true),
        ],
    },
    {
        id: 'graphite-cyan',
        name: 'Graphite Cyan',
        category: 'modern',
        neutralBase: '#71717a',
        accents: [
            accent('accent-1', 'Cyan', '#06b6d4', true),
            accent('accent-2', 'Zinc', '#3f3f46'),
        ],
    },
    {
        id: 'neon-midnight',
        name: 'Neon Midnight',
        category: 'modern',
        neutralBase: '#52525b',
        accents: [
            accent('accent-1', 'Lime', '#84cc16', true),
            accent('accent-2', 'Emerald', '#10b981'),
        ],
    },
    {
        id: 'monochrome-sharp',
        name: 'Monochrome Sharp',
        category: 'modern',
        neutralBase: '#525252',
        accents: [
            accent('accent-1', 'Black', '#171717', true),
        ],
    },

    // ──────────────────── BOLD ────────────────────
    {
        id: 'bold-red',
        name: 'Bold Red',
        category: 'bold',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Red', '#dc2626', true),
        ],
    },
    {
        id: 'sunset-flame',
        name: 'Sunset Flame',
        category: 'bold',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Orange', '#ea580c', true),
            accent('accent-2', 'Amber', '#d97706'),
        ],
    },
    {
        id: 'hot-pink',
        name: 'Hot Pink',
        category: 'bold',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Rose', '#e11d48', true),
            accent('accent-2', 'Pink', '#ec4899'),
        ],
    },
    {
        id: 'fiery-coral',
        name: 'Fiery Coral',
        category: 'bold',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Coral', '#f43f5e', true),
            accent('accent-2', 'Orange Red', '#ef4444'),
        ],
    },
    {
        id: 'crimson-gold',
        name: 'Crimson Gold',
        category: 'bold',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Crimson', '#be123c', true),
            accent('accent-2', 'Gold', '#ca8a04'),
        ],
    },
    {
        id: 'electric-blue-red',
        name: 'Electric Duo',
        category: 'bold',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Electric Blue', '#2563eb', true),
            accent('accent-2', 'Scarlet', '#dc2626'),
        ],
    },
    {
        id: 'magenta-pop',
        name: 'Magenta Pop',
        category: 'bold',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Magenta', '#c026d3', true),
        ],
    },

    // ──────────────────── WARM ────────────────────
    {
        id: 'warm-terracotta',
        name: 'Terracotta',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Terracotta', '#c2410c', true),
            accent('accent-2', 'Sand', '#a16207'),
        ],
    },
    {
        id: 'honey-amber',
        name: 'Honey Amber',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Amber', '#d97706', true),
        ],
    },
    {
        id: 'rust-clay',
        name: 'Rust & Clay',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Rust', '#b91c1c', true),
            accent('accent-2', 'Clay', '#92400e'),
        ],
    },
    {
        id: 'autumn-harvest',
        name: 'Autumn Harvest',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Pumpkin', '#ea580c', true),
            accent('accent-2', 'Forest', '#166534'),
        ],
    },
    {
        id: 'warm-copper',
        name: 'Warm Copper',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Copper', '#b45309', true),
        ],
    },
    {
        id: 'sienna-rose',
        name: 'Sienna Rose',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Sienna', '#a16207', true),
            accent('accent-2', 'Dusty Rose', '#be185d'),
        ],
    },
    {
        id: 'golden-brown',
        name: 'Golden Brown',
        category: 'warm',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Gold', '#ca8a04', true),
            accent('accent-2', 'Brown', '#92400e'),
        ],
    },

    // ──────────────────── COOL ────────────────────
    {
        id: 'ocean-blue',
        name: 'Ocean Blue',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Ocean', '#0284c7', true),
        ],
    },
    {
        id: 'arctic-teal',
        name: 'Arctic Teal',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Teal', '#0d9488', true),
            accent('accent-2', 'Ice Blue', '#0ea5e9'),
        ],
    },
    {
        id: 'deep-sea',
        name: 'Deep Sea',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Navy', '#1e3a5f', true),
            accent('accent-2', 'Aqua', '#22d3ee'),
        ],
    },
    {
        id: 'frost-blue',
        name: 'Frost Blue',
        category: 'cool',
        neutralBase: '#94a3b8',
        accents: [
            accent('accent-1', 'Frost', '#38bdf8', true),
        ],
    },
    {
        id: 'steel-cyan',
        name: 'Steel Cyan',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Steel', '#475569', true),
            accent('accent-2', 'Cyan', '#06b6d4'),
        ],
    },
    {
        id: 'pacific-dream',
        name: 'Pacific Dream',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Pacific', '#0369a1', true),
            accent('accent-2', 'Seafoam', '#2dd4bf'),
        ],
    },
    {
        id: 'sapphire',
        name: 'Sapphire',
        category: 'cool',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Sapphire', '#1d4ed8', true),
        ],
    },

    // ──────────────────── ELEGANT ────────────────────
    {
        id: 'muted-sage',
        name: 'Muted Sage',
        category: 'elegant',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Sage', '#4d7c0f', true),
            accent('accent-2', 'Stone', '#57534e'),
        ],
    },
    {
        id: 'champagne-blush',
        name: 'Champagne Blush',
        category: 'elegant',
        neutralBase: '#a8a29e',
        accents: [
            accent('accent-1', 'Blush', '#be185d', true),
            accent('accent-2', 'Champagne', '#d97706'),
        ],
    },
    {
        id: 'mauve-noir',
        name: 'Mauve Noir',
        category: 'elegant',
        neutralBase: '#71717a',
        accents: [
            accent('accent-1', 'Mauve', '#7e22ce', true),
        ],
    },
    {
        id: 'pearl-navy',
        name: 'Pearl & Navy',
        category: 'elegant',
        neutralBase: '#94a3b8',
        accents: [
            accent('accent-1', 'Navy', '#1e3a5f', true),
            accent('accent-2', 'Pearl', '#f5f5f4'),
        ],
    },
    {
        id: 'smoke-wine',
        name: 'Smoke & Wine',
        category: 'elegant',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Wine', '#881337', true),
            accent('accent-2', 'Smoke', '#57534e'),
        ],
    },
    {
        id: 'lavender-mist',
        name: 'Lavender Mist',
        category: 'elegant',
        neutralBase: '#a1a1aa',
        accents: [
            accent('accent-1', 'Lavender', '#8b5cf6', true),
        ],
    },
    {
        id: 'charcoal-gold',
        name: 'Charcoal & Gold',
        category: 'elegant',
        neutralBase: '#525252',
        accents: [
            accent('accent-1', 'Charcoal', '#262626', true),
            accent('accent-2', 'Gold', '#ca8a04'),
        ],
    },
    {
        id: 'ivory-bronze',
        name: 'Ivory & Bronze',
        category: 'elegant',
        neutralBase: '#a8a29e',
        accents: [
            accent('accent-1', 'Bronze', '#92400e', true),
        ],
    },

    // ──────────────────── PLAYFUL ────────────────────
    {
        id: 'candy-pop',
        name: 'Candy Pop',
        category: 'playful',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Pink', '#ec4899', true),
            accent('accent-2', 'Purple', '#a855f7'),
            accent('accent-3', 'Cyan', '#22d3ee'),
        ],
    },
    {
        id: 'tropical-sunset',
        name: 'Tropical Sunset',
        category: 'playful',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Coral', '#f43f5e', true),
            accent('accent-2', 'Mango', '#f59e0b'),
        ],
    },
    {
        id: 'rainbow-bright',
        name: 'Rainbow Bright',
        category: 'playful',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Blue', '#3b82f6', true),
            accent('accent-2', 'Green', '#22c55e'),
            accent('accent-3', 'Orange', '#f97316'),
        ],
    },
    {
        id: 'bubblegum',
        name: 'Bubblegum',
        category: 'playful',
        neutralBase: '#a1a1aa',
        accents: [
            accent('accent-1', 'Bubblegum', '#f472b6', true),
        ],
    },
    {
        id: 'lime-splash',
        name: 'Lime Splash',
        category: 'playful',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Lime', '#84cc16', true),
            accent('accent-2', 'Sky', '#38bdf8'),
        ],
    },
    {
        id: 'peach-mint',
        name: 'Peach & Mint',
        category: 'playful',
        neutralBase: '#a1a1aa',
        accents: [
            accent('accent-1', 'Peach', '#fb923c', true),
            accent('accent-2', 'Mint', '#34d399'),
        ],
    },
    {
        id: 'confetti',
        name: 'Confetti',
        category: 'playful',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Red', '#ef4444', true),
            accent('accent-2', 'Yellow', '#eab308'),
            accent('accent-3', 'Blue', '#3b82f6'),
        ],
    },

    // ──────────────────── CORPORATE ────────────────────
    {
        id: 'corp-blue',
        name: 'Corporate Blue',
        category: 'corporate',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Blue', '#1d4ed8', true),
        ],
    },
    {
        id: 'trust-teal',
        name: 'Trust Teal',
        category: 'corporate',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Teal', '#0d9488', true),
            accent('accent-2', 'Navy', '#1e40af'),
        ],
    },
    {
        id: 'executive-gray',
        name: 'Executive Gray',
        category: 'corporate',
        neutralBase: '#4b5563',
        accents: [
            accent('accent-1', 'Dark Blue', '#1e3a8a', true),
        ],
    },
    {
        id: 'fintech-green',
        name: 'Fintech Green',
        category: 'corporate',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Green', '#059669', true),
        ],
    },
    {
        id: 'professional-slate',
        name: 'Professional Slate',
        category: 'corporate',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Slate', '#334155', true),
            accent('accent-2', 'Blue', '#2563eb'),
        ],
    },
    {
        id: 'enterprise-purple',
        name: 'Enterprise Purple',
        category: 'corporate',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Purple', '#6d28d9', true),
        ],
    },
    {
        id: 'legal-navy',
        name: 'Legal Navy',
        category: 'corporate',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Navy', '#1e3a5f', true),
            accent('accent-2', 'Gold', '#b45309'),
        ],
    },

    // ──────────────────── NATURE ────────────────────
    {
        id: 'forest-green',
        name: 'Forest Green',
        category: 'nature',
        neutralBase: '#6b7280',
        accents: [
            accent('accent-1', 'Forest', '#166534', true),
        ],
    },
    {
        id: 'earth-moss',
        name: 'Earth & Moss',
        category: 'nature',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Moss', '#4d7c0f', true),
            accent('accent-2', 'Earth', '#92400e'),
        ],
    },
    {
        id: 'ocean-kelp',
        name: 'Ocean Kelp',
        category: 'nature',
        neutralBase: '#64748b',
        accents: [
            accent('accent-1', 'Kelp', '#15803d', true),
            accent('accent-2', 'Ocean', '#0284c7'),
        ],
    },
    {
        id: 'meadow',
        name: 'Meadow',
        category: 'nature',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Grass', '#16a34a', true),
            accent('accent-2', 'Wildflower', '#a855f7'),
        ],
    },
    {
        id: 'desert-sand',
        name: 'Desert Sand',
        category: 'nature',
        neutralBase: '#a8a29e',
        accents: [
            accent('accent-1', 'Sand', '#ca8a04', true),
            accent('accent-2', 'Cactus', '#15803d'),
        ],
    },
    {
        id: 'pine-stone',
        name: 'Pine & Stone',
        category: 'nature',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Pine', '#065f46', true),
            accent('accent-2', 'Stone', '#57534e'),
        ],
    },
    {
        id: 'sunset-ridge',
        name: 'Sunset Ridge',
        category: 'nature',
        neutralBase: '#78716c',
        accents: [
            accent('accent-1', 'Sunset', '#ea580c', true),
            accent('accent-2', 'Ridge', '#78716c'),
        ],
    },
]

// ============================================
// Palette Utilities
// ============================================

/** Get palettes by category */
export function getPalettesByCategory(category: PaletteCategory): ColorPalette[] {
    return COLOR_PALETTES.filter(p => p.category === category)
}

/** Get a random palette */
export function getRandomPalette(): ColorPalette {
    return COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)]
}

/** Get a random palette excluding the current one */
export function getRandomPaletteExcluding(currentId: string): ColorPalette {
    const filtered = COLOR_PALETTES.filter(p => p.id !== currentId)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

/** Find palette by ID */
export function getPaletteById(id: string): ColorPalette | undefined {
    return COLOR_PALETTES.find(p => p.id === id)
}

/** All palette categories with labels */
export const PALETTE_CATEGORIES: { id: PaletteCategory; label: string }[] = [
    { id: 'modern', label: 'Modern' },
    { id: 'bold', label: 'Bold' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'elegant', label: 'Elegant' },
    { id: 'playful', label: 'Playful' },
    { id: 'corporate', label: 'Corporate' },
    { id: 'nature', label: 'Nature' },
]
