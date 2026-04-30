/**
 * AI Model Definitions — Client-safe
 *
 * This file contains ONLY the model registry data (no provider instances).
 * Safe to import from client components (model-selector, chat-panel, etc.)
 *
 * Provider instances (createOpenAI, createVertex) are in providers.ts (server-only).
 */

export interface ModelDef {
  key: string
  displayName: string
  provider: 'proxy' | 'vertex' | 'vertex-global'
  proxyModelId: string
  tier: 'pro' | 'standard' | 'lite'
  capabilities: string[]
  badge?: string
  /** Credit multiplier — reflects relative API cost. Gemini=1×, Sonnet=2×, Opus=3× */
  creditMultiplier: number
}

export const MODELS: ModelDef[] = [
  // Gemini via Vertex — full multimodal (vision + thinking + tools)
  {
    key: 'gemini-pro',
    displayName: 'Gemini 3.1 Pro',
    provider: 'vertex-global',
    proxyModelId: 'gemini-3.1-pro-preview-customtools',
    tier: 'pro',
    capabilities: ['thinking', 'vision', 'coding', 'long-context'],
    creditMultiplier: 1,
  },
  {
    key: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'vertex',
    proxyModelId: 'gemini-2.5-pro',
    tier: 'pro',
    capabilities: ['thinking', 'vision', 'coding', 'long-context'],
    creditMultiplier: 1,
  },
  // Claude via proxy
  {
    key: 'claude-sonnet',
    displayName: 'Claude Sonnet 4.6',
    provider: 'proxy',
    proxyModelId: 'claude-sonnet-4.6',
    tier: 'standard',
    capabilities: ['thinking', 'vision', 'coding', 'fast'],
    creditMultiplier: 2,
  },
  {
    key: 'claude-opus',
    displayName: 'Claude Opus 4.6',
    provider: 'proxy',
    proxyModelId: 'claude-opus-4.6',
    tier: 'pro',
    capabilities: ['thinking', 'vision', 'coding'],
    creditMultiplier: 3,
  },
]

export const DEFAULT_MODEL = 'gemini-pro'
