/**
 * AI Provider Registry — Scytle (SERVER-ONLY)
 *
 * Contains provider instances (createOpenAI, createVertex) that have
 * Node.js dependencies. Do NOT import this from client components.
 *
 * Client components should import from './model-defs' instead for
 * model metadata (MODELS, DEFAULT_MODEL, ModelDef).
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { MODELS, DEFAULT_MODEL } from './model-defs'
import type { ModelDef } from './model-defs'

// Re-export model defs for server-side usage
export { MODELS, DEFAULT_MODEL }
export type { ModelDef }

// ─── Provider Instances ──────────────────────────────────────────

// Proxy (OpenAI-compatible) — PRIMARY
const proxy = createOpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: 'https://api.gameron.me/v1',
  name: 'gameron-proxy',
})

// Google Gemini — using API key (works on Vercel without ADC)
const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
})

// ─── Model Resolution ────────────────────────────────────────────

export function resolveModel(key: string) {
  const model = MODELS.find(m => m.key === key)
  if (!model) throw new Error(`Unknown model: ${key}`)

  switch (model.provider) {
    case 'proxy':
      return proxy.chat(model.proxyModelId)
    case 'vertex':
    case 'vertex-global':
      return gemini(model.proxyModelId)
    default:
      throw new Error(`Unknown provider: ${model.provider}`)
  }
}

export function getEnabledModels(): ModelDef[] {
  return MODELS.filter(m => {
    if (m.provider === 'proxy') return !!process.env.ANTHROPIC_API_KEY
    if (m.provider === 'vertex' || m.provider === 'vertex-global') return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    return false
  })
}

// ─── Proxy Response Fixer ────────────────────────────────────────

let proxyFixerInstalled = false

export function installProxyFixer() {
  if (proxyFixerInstalled) return
  proxyFixerInstalled = true

  const origFetch = globalThis.fetch
  globalThis.fetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
    const response = await origFetch(url, opts)
    const urlStr = typeof url === 'string' ? url : url.toString()

    if (!urlStr.includes('api.gameron.me') || !urlStr.includes('chat/completions')) {
      return response
    }

    // Only fix non-streaming responses
    const body = opts?.body ? JSON.parse(opts.body as string) : {}
    if (body.stream) return response

    const json = await response.json()
    if (json.choices?.length > 1) {
      const allToolCalls: any[] = []
      let textContent: string | null = null
      for (const choice of json.choices) {
        if (choice.message?.tool_calls) allToolCalls.push(...choice.message.tool_calls)
        if (choice.message?.content && !textContent) textContent = choice.message.content
      }
      json.choices = [{
        index: 0,
        finish_reason: allToolCalls.length > 0 ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: textContent,
          tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
        },
      }]
    }

    return new Response(JSON.stringify(json), {
      status: response.status,
      headers: response.headers,
    })
  }
}
