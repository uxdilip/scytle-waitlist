import type { FrameNode } from '@/types/canvas'
import { createFrame, createText, createImage } from '@/types/canvas'

/**
 * Create a sample Hero Section node tree for development.
 * Demonstrates nested frames, auto-layout, text styling, and image placeholders.
 *
 * Structure:
 *   Hero Section (row, 1200px wide, hug height)
 *   ├── Content (fill × hug, column)
 *   │   ├── Heading (h1, 52px, bold)
 *   │   ├── Description (p, 18px, gray)
 *   │   └── CTA Group (hug, row)
 *   │       ├── Primary Button (blue bg)
 *   │       │   └── "Get Started"
 *   │       └── Secondary Button (border)
 *   │           └── "Learn More"
 *   └── Hero Image (500×400, placeholder)
 */
export function createSeedHeroSection(): FrameNode {
    return createFrame({
        name: 'Hero Section',
        x: 120,
        y: 120,
        width: 1200,
        height: 600,
        sizing: { horizontal: 'fixed', vertical: 'hug' },
        layout: {
            mode: 'flex',
            direction: 'row',
            align: 'center',
            gap: 64,
        },
        padding: { top: 80, right: 80, bottom: 80, left: 80 },
        fills: [{ type: 'solid', color: '#ffffff' }],
        borderRadius: 16,
        shadows: [
            {
                type: 'drop',
                color: 'rgba(0, 0, 0, 0.06)',
                x: 0,
                y: 4,
                blur: 24,
                spread: -4,
            },
            {
                type: 'drop',
                color: 'rgba(0, 0, 0, 0.04)',
                x: 0,
                y: 1,
                blur: 4,
                spread: 0,
            },
        ],
        children: [
            // ── Left: Content column ──────────────────────────
            createFrame({
                name: 'Content',
                sizing: { horizontal: 'fill', vertical: 'hug' },
                layout: {
                    mode: 'flex',
                    direction: 'column',
                    align: 'start',
                    gap: 28,
                },
                children: [
                    // Badge
                    createFrame({
                        name: 'Badge',
                        sizing: { horizontal: 'hug', vertical: 'hug' },
                        layout: {
                            mode: 'flex',
                            direction: 'row',
                            align: 'center',
                            gap: 6,
                        },
                        padding: { top: 6, right: 14, bottom: 6, left: 14 },
                        fills: [{ type: 'solid', color: '#eff6ff' }],
                        borderRadius: 100,
                        children: [
                            createText({
                                name: 'Badge Text',
                                characters: '✨ AI-Powered Design',
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#2563eb',
                                sizing: { horizontal: 'hug', vertical: 'hug' },
                                htmlTag: 'span',
                            }),
                        ],
                    }),

                    // Heading
                    createText({
                        name: 'Heading',
                        characters: 'Build beautiful\nwebsites with AI',
                        fontSize: 52,
                        fontWeight: 800,
                        lineHeight: 60,
                        letterSpacing: -1,
                        color: '#0f172a',
                        sizing: { horizontal: 'fill', vertical: 'hug' },
                        htmlTag: 'h1',
                    }),

                    // Description
                    createText({
                        name: 'Description',
                        characters:
                            'Go from idea to a fully designed website in minutes. Our AI understands your vision and creates stunning layouts, copy, and visuals.',
                        fontSize: 18,
                        fontWeight: 400,
                        lineHeight: 28,
                        color: '#64748b',
                        sizing: { horizontal: 'fill', vertical: 'hug' },
                        htmlTag: 'p',
                    }),

                    // CTA button group
                    createFrame({
                        name: 'CTA Group',
                        sizing: { horizontal: 'hug', vertical: 'hug' },
                        layout: {
                            mode: 'flex',
                            direction: 'row',
                            align: 'center',
                            gap: 12,
                        },
                        children: [
                            // Primary button
                            createFrame({
                                name: 'Primary Button',
                                sizing: { horizontal: 'hug', vertical: 'hug' },
                                layout: {
                                    mode: 'flex',
                                    direction: 'row',
                                    align: 'center',
                                    justify: 'center',
                                },
                                padding: { top: 14, right: 32, bottom: 14, left: 32 },
                                fills: [{ type: 'solid', color: '#2563eb' }],
                                borderRadius: 10,
                                shadows: [
                                    {
                                        type: 'drop',
                                        color: 'rgba(37, 99, 235, 0.25)',
                                        x: 0,
                                        y: 2,
                                        blur: 8,
                                        spread: 0,
                                    },
                                ],
                                children: [
                                    createText({
                                        name: 'Button Text',
                                        characters: 'Get Started',
                                        fontSize: 16,
                                        fontWeight: 600,
                                        color: '#ffffff',
                                        sizing: { horizontal: 'hug', vertical: 'hug' },
                                        htmlTag: 'span',
                                    }),
                                ],
                            }),

                            // Secondary button
                            createFrame({
                                name: 'Secondary Button',
                                sizing: { horizontal: 'hug', vertical: 'hug' },
                                layout: {
                                    mode: 'flex',
                                    direction: 'row',
                                    align: 'center',
                                    justify: 'center',
                                },
                                padding: { top: 14, right: 32, bottom: 14, left: 32 },
                                fills: [{ type: 'solid', color: '#f8fafc' }],
                                border: { color: '#e2e8f0', width: 1, style: 'solid' },
                                borderRadius: 10,
                                children: [
                                    createText({
                                        name: 'Button Text',
                                        characters: 'Learn More',
                                        fontSize: 16,
                                        fontWeight: 500,
                                        color: '#1e293b',
                                        sizing: { horizontal: 'hug', vertical: 'hug' },
                                        htmlTag: 'span',
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),

            // ── Right: Hero image placeholder ─────────────────
            createImage({
                name: 'Hero Image',
                width: 500,
                height: 400,
                sizing: { horizontal: 'fixed', vertical: 'fixed' },
                borderRadius: 16,
                fit: 'cover',
                isPlaceholder: true,
                placeholderLabel: 'Hero Illustration',
            }),
        ],
    })
}
