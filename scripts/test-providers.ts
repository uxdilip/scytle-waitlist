/**
 * Scytle AI Provider Integration Tests — FINAL
 *
 * Run with: npx tsx scripts/test-providers.ts
 *
 * Architecture:
 *   - PROXY (api.gameron.me) → Claude models via OpenAI-compatible API
 *     Also has: gemini-3.1-pro-preview, gpt-5.4, claude-opus-4.6
 *   - VERTEX (direct Google ADC) → Gemini 3.1 for text/streaming only
 *     Tool calling broken due to @ai-sdk + Zod v4 compatibility issue
 *
 * Key findings:
 *   1. AI SDK v6 uses `inputSchema` not `parameters` in tool()
 *   2. Proxy returns multi-choice responses (tool call in separate choice)
 *      → needs fetch middleware to merge
 *   3. Use proxy.chat() + compatibility:'compatible' for chat completions
 */

import { streamText, generateText, tool } from 'ai'
import { createVertex } from '@ai-sdk/google-vertex'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

// ─── Proxy Response Fixer ────────────────────────────────────────
// The proxy returns tool calls in a separate choice (index 1).
// Standard OpenAI API puts them in choices[0].
// This middleware merges multi-choice responses.

const origFetch = globalThis.fetch
globalThis.fetch = async (url: any, opts: any) => {
  const response = await origFetch(url, opts)
  if (typeof url !== 'string' || !url.includes('api.gameron.me') || !url.includes('chat/completions')) {
    return response
  }
  const body = opts?.body ? JSON.parse(opts.body) : {}
  if (body.stream) return response // Streaming handled differently

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

// ─── Provider Setup ──────────────────────────────────────────────

const vertex = createVertex({
  project: process.env.GOOGLE_CLOUD_PROJECT || 'composed-cogency-glb3w',
  location: 'global',
})

const proxy = createOpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: 'https://api.gameron.me/v1',
  compatibility: 'compatible',
})

// ─── Test Infrastructure ─────────────────────────────────────────

interface TestResult {
  name: string
  pass: boolean
  error?: string
  note?: string
  durationMs: number
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<string | void>) {
  const start = Date.now()
  try {
    const note = await fn()
    results.push({ name, pass: true, durationMs: Date.now() - start, note: note || undefined })
    console.log(`  ✅ ${name}`)
  } catch (err: any) {
    const msg = err.message?.slice(0, 200) || 'Unknown error'
    console.error(`  ❌ ${name}: ${msg}`)
    results.push({ name, pass: false, error: msg, durationMs: Date.now() - start })
  }
}

// ─── Tests ───────────────────────────────────────────────────────

async function testVertexBasic() {
  console.log('\n═══ Vertex: Basic Text ═══')
  const result = await generateText({
    model: vertex('gemini-3.1-pro-preview'),
    prompt: 'Respond with exactly: "Vertex works"',
  })
  console.log('  Response:', result.text.slice(0, 80))
  return result.text.slice(0, 50)
}

async function testVertexStreaming() {
  console.log('\n═══ Vertex: Streaming ═══')
  const startTime = Date.now()
  const result = streamText({
    model: vertex('gemini-3.1-pro-preview'),
    prompt: 'Count 1 to 3, one per line.',
  })
  let chunks = 0, firstChunkTime = 0
  for await (const chunk of result.textStream) {
    if (chunks === 0) firstChunkTime = Date.now() - startTime
    chunks++
  }
  console.log(`  ${chunks} chunks, first at ${firstChunkTime}ms`)
  return `${chunks} chunks, first: ${firstChunkTime}ms`
}

async function testProxyClaudeBasic() {
  console.log('\n═══ Proxy Claude: Basic Text ═══')
  const result = await generateText({
    model: proxy.chat('claude-sonnet-4.6'),
    prompt: 'Respond with exactly: "Claude works"',
    maxTokens: 50,
  })
  console.log('  Response:', result.text.slice(0, 80))
  return result.text.slice(0, 50)
}

async function testProxyClaudeStreaming() {
  console.log('\n═══ Proxy Claude: Streaming ═══')
  const startTime = Date.now()
  const result = streamText({
    model: proxy.chat('claude-sonnet-4.6'),
    prompt: 'Count 1 to 3, one per line.',
    maxTokens: 50,
  })
  let chunks = 0, firstChunkTime = 0
  for await (const chunk of result.textStream) {
    if (chunks === 0) firstChunkTime = Date.now() - startTime
    chunks++
  }
  console.log(`  ${chunks} chunks, first: ${firstChunkTime}ms`)
  return `${chunks} chunks, first: ${firstChunkTime}ms`
}

async function testProxyClaudeTools() {
  console.log('\n═══ Proxy Claude: Tool Calling (CRITICAL) ═══')
  let receivedCity = ''
  const result = await generateText({
    model: proxy.chat('claude-sonnet-4.6'),
    prompt: 'What is the weather in Tokyo? You must use the getWeather tool.',
    maxTokens: 500,
    tools: {
      getWeather: tool({
        description: 'Get current weather for a city',
        inputSchema: z.object({ city: z.string().describe('City name') }),
        execute: async ({ city }) => {
          receivedCity = city
          console.log(`  → getWeather("${city}")`)
          return { temp: '22°C', condition: 'sunny', city }
        },
      }),
    },
    maxSteps: 3,
  })
  console.log('  Final:', result.text.slice(0, 150))
  if (!receivedCity) throw new Error('Tool never called or args empty')
  return `city="${receivedCity}", ${result.steps.length} steps`
}

async function testProxyHaikuTools() {
  console.log('\n═══ Proxy Haiku: Tool Calling ═══')
  let receivedCity = ''
  const result = await generateText({
    model: proxy.chat('claude-haiku-4.5'),
    prompt: 'What is the weather in London? Use the getWeather tool.',
    maxTokens: 300,
    tools: {
      getWeather: tool({
        description: 'Get weather for a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          receivedCity = city
          console.log(`  → getWeather("${city}")`)
          return { temp: '15°C', condition: 'cloudy' }
        },
      }),
    },
    maxSteps: 3,
  })
  if (!receivedCity) throw new Error('Tool never called')
  return `city="${receivedCity}"`
}

async function testProxyAgentLoop() {
  console.log('\n═══ Proxy Claude: Agent Loop (Multi-step) ═══')
  let stepCount = 0
  const result = await generateText({
    model: proxy.chat('claude-sonnet-4.6'),
    maxTokens: 4000,
    system: `You are a design agent. You work in this strict sequence:
1. Call generateSection to create a hero section with HTML.
2. Call takeScreenshot to verify it looks correct.
3. Then respond with a summary.
You MUST call BOTH tools before responding.`,
    prompt: 'Create a simple hero section for a SaaS landing page.',
    tools: {
      generateSection: tool({
        description: 'Generate HTML for a website section. Returns a node ID.',
        inputSchema: z.object({
          sectionType: z.string().describe('Section type like "hero", "nav", "features"'),
          html: z.string().describe('Full HTML markup for the section'),
        }),
        execute: async ({ sectionType, html }) => {
          stepCount++
          console.log(`  → Step ${stepCount}: generateSection("${sectionType}") — ${html?.length || 0} chars`)
          return { success: true, nodeId: `node-${stepCount}`, sectionType }
        },
      }),
      takeScreenshot: tool({
        description: 'Take a screenshot of the canvas to verify the design.',
        inputSchema: z.object({
          reason: z.string().optional().describe('Why taking screenshot'),
        }),
        execute: async ({ reason }) => {
          stepCount++
          console.log(`  → Step ${stepCount}: takeScreenshot(${reason || 'verify'})`)
          return { screenshot: 'placeholder', verdict: 'Design looks clean, good spacing and typography' }
        },
      }),
    },
    maxSteps: 6,
  })
  console.log('  Final:', result.text.slice(0, 200))
  console.log(`  Total steps: ${stepCount}`)
  if (stepCount < 2) throw new Error(`Only ${stepCount} tool calls — expected 2+`)
  return `${stepCount} tool calls, ${result.steps.length} steps`
}

async function testProxyClaudeVision() {
  console.log('\n═══ Proxy Claude: Vision ═══')
  // Fetch image as buffer (proxy needs base64, not URL)
  const response = await fetch('https://picsum.photos/id/1/200/200')
  const buffer = Buffer.from(await response.arrayBuffer())
  const result = await generateText({
    model: proxy.chat('claude-sonnet-4.6'),
    maxTokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image in one sentence.' },
        { type: 'image', image: buffer },
      ],
    }],
  })
  console.log('  Description:', result.text.slice(0, 200))
  return `Vision OK: ${result.text.length} chars`
}

async function testProxyOpus() {
  console.log('\n═══ Proxy Opus: Basic Text ═══')
  const result = await generateText({
    model: proxy.chat('claude-opus-4.6'),
    prompt: 'Respond with: "Opus works"',
    maxTokens: 20,
  })
  console.log('  Response:', result.text.slice(0, 80))
  return result.text.slice(0, 40)
}

// ─── Runner ──────────────────────────────────────────────────────

async function runAll() {
  console.log('🧪 Scytle AI Provider Integration Tests — FINAL')
  console.log('═══════════════════════════════════════════')
  console.log(`   Vertex: project=${process.env.GOOGLE_CLOUD_PROJECT}, location=global`)
  console.log(`   Proxy:  https://api.gameron.me/v1 (key=${process.env.ANTHROPIC_API_KEY ? '✅' : '❌'})`)
  console.log(`   SDK:    ai@6.x with inputSchema (not parameters)`)
  console.log('')

  await runTest('Vertex Basic', testVertexBasic)
  await runTest('Vertex Streaming', testVertexStreaming)
  await runTest('Claude Basic', testProxyClaudeBasic)
  await runTest('Claude Streaming', testProxyClaudeStreaming)
  await runTest('Claude Tools', testProxyClaudeTools)
  await runTest('Haiku Tools', testProxyHaikuTools)
  await runTest('Agent Loop', testProxyAgentLoop)
  await runTest('Claude Vision', testProxyClaudeVision)
  await runTest('Opus Basic', testProxyOpus)

  console.log('\n═══════════════════════════════════════════')
  console.log('📊 RESULTS')
  console.log('═══════════════════════════════════════════')

  const maxLen = Math.max(...results.map(r => r.name.length))
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    const name = r.name.padEnd(maxLen)
    const time = `${r.durationMs}ms`.padStart(7)
    const detail = r.pass ? (r.note || '') : `FAIL: ${r.error?.slice(0, 80)}`
    console.log(`  ${icon} ${name}  ${time}  ${detail}`)
  }

  const passed = results.filter(r => r.pass).length
  console.log(`\n  ${passed}/${results.length} passed`)

  const criticals = ['Claude Tools', 'Agent Loop']
  const critFailed = criticals.filter(c => !results.find(r => r.name === c)?.pass)
  if (critFailed.length > 0) {
    console.log(`\n  ⚠️ CRITICAL FAILURES: ${critFailed.join(', ')}`)
  } else {
    console.log('\n  ✅ All critical features work!')
    console.log('\n  📝 Architecture for Phase 1:')
    console.log('     • Proxy (api.gameron.me) → PRIMARY for all models')
    console.log('       - Claude Sonnet/Haiku/Opus via proxy.chat()')
    console.log('       - Use @ai-sdk/openai with compatibility:"compatible"')
    console.log('       - Use inputSchema (not parameters) in tool()')
    console.log('       - Apply fetch middleware to merge multi-choice responses')
    console.log('     • Vertex → FALLBACK text-only (tool calling has SDK bug)')
  }
}

runAll().catch(console.error)
