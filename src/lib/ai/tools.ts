/**
 * AI Tool Definitions — Scytle
 *
 * These are the "hands" the AI uses to interact with the canvas.
 *
 * ARCHITECTURE:
 *   - Tools execute on the SERVER (in streamText within route.ts)
 *   - Canvas tools return structured data as results
 *   - The CLIENT (chat-panel.tsx) intercepts tool results via onToolCall
 *     and applies them to Zustand stores (editor-store)
 *   - Server-side tools (searchImages) execute fully on the server
 *
 * IMPORTANT: AI SDK v6 uses `inputSchema` not `parameters` in tool().
 */

import { tool } from 'ai'
import { z } from 'zod'
import { searchImages as unsplashSearch } from '@/lib/ai/unsplash'

// ═══════════════════════════════════════════════════════════
// Tool: GENERATE SECTION — Write HTML to canvas
// ═══════════════════════════════════════════════════════════
export const generateSection = tool({
  description: `Generate HTML+Tailwind for ONE visual section and add it to the canvas.
Use this tool ONLY when creating NEW content (new section/page), not when editing an existing selected section.
Call once per section: nav, hero, features, stats, testimonials, pricing, cta, footer.
Use bg-[#hex] and text-[#hex] format for all colors. Include inline font-family styles for custom fonts.
Keep colors consistent across sections — use the same palette throughout the design.

MULTI-PAGE: Set newPage=true when starting a new page (e.g., user asks for "pricing page"
after you already built a "home page"). This creates a separate page frame on the canvas.
The FIRST section of any conversation automatically creates a new page — no need to set newPage for it.

WIDTH: Default is 1440 (desktop). Use 390 for mobile app designs, 768 for tablet.
When the user says "mobile app", "iPhone", "phone design" → use width=390.
When the user says "tablet" → use width=768.`,
  inputSchema: z.object({
    sectionType: z.string().describe('Section type: "nav", "hero", "features", "stats", "cta", "footer", etc.'),
    html: z.string().describe('Complete HTML+Tailwind with inline hex colors and font-family styles.'),
    newPage: z.boolean().default(false).describe('Set true to create a NEW page frame (e.g., starting a separate Pricing page). First section auto-creates a page.'),
    pageName: z.string().optional().describe('Name for the new page frame when newPage=true. E.g., "Pricing", "About", "Mobile - Home"'),
    width: z.number().default(1440).describe('Page frame width in px. Desktop=1440, Tablet=768, Mobile=390.'),
    parentNodeId: z.string().default('root').describe('Canvas node ID to append to. Use "root" for the current page frame.'),
  }),
  execute: async ({ sectionType, html, newPage, pageName, width, parentNodeId }) => {
    return {
      action: 'generateSection' as const,
      sectionType,
      html,
      newPage,
      pageName,
      width,
      parentNodeId,
    }
  },
})

// ═══════════════════════════════════════════════════════════
// Tool: EDIT NODE — Replace existing node HTML
// ═══════════════════════════════════════════════════════════
export const editNode = tool({
  description: `Replace the HTML of an existing canvas node. Use this tool when:
- The user has a node SELECTED and asks to modify, change, update, redesign, or fix it
- The user references a specific existing section by name ("change the navbar", "update the hero")
- You need to fix or improve a previously generated section

IMPORTANT: If a node is selected in CURRENT CANVAS, default to editNode over generateSection.
Keep the same theme colors. Preserve the node's role (don't turn a hero into a footer).
Use the selected node's HTML (shown in context) as your starting point.`,
  inputSchema: z.object({
    nodeId: z.string().describe('ID of the node to replace'),
    html: z.string().describe('New HTML+Tailwind for this node'),
    reason: z.string().describe('Brief explanation: "Increased heading size", "Fixed spacing"'),
  }),
  execute: async ({ nodeId, html, reason }) => {
    // Returns HTML + nodeId — client parses and replaces
    return {
      action: 'editNode' as const,
      nodeId,
      html,
      reason,
    }
  },
})

// ═══════════════════════════════════════════════════════════
// Tool: SEARCH IMAGES — Unsplash (fully server-side)
// ═══════════════════════════════════════════════════════════
export const searchImages = tool({
  description: 'Search Unsplash for a relevant photo. Returns a URL for img tags.',
  inputSchema: z.object({
    query: z.string().describe('Search: "aerial office", "woman laptop", "sushi platter"'),
    count: z.number().default(1).describe('Number of images to return'),
  }),
  execute: async ({ query, count }) => {
    // This executes fully server-side — Unsplash API
    const images = await unsplashSearch(query, { count: count || 1 })
    if (images.length === 0) {
      return {
        action: 'searchImages' as const,
        query,
        images: [],
        message: 'No images found. Use a placeholder or SVG icon instead.',
      }
    }
    return {
      action: 'searchImages' as const,
      query,
      images: images.map(img => ({
        url: img.url,
        alt: img.alt,
        credit: img.credit,
      })),
    }
  },
})

// ─── Export all tools ────────────────────────────────────────────
export const ALL_TOOLS = {
  generateSection,
  editNode,
  searchImages,
} as const
