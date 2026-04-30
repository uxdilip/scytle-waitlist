'use client'

/**
 * Chat Panel — Uses assistant-ui Thread + custom tool side-effects
 *
 * Architecture:
 *   useChatRuntime wraps useChat internally
 *   → AssistantRuntimeProvider provides runtime to Thread
 *   → Thread handles all UI (messages, composer, reasoning, tools)
 *   → makeAssistantToolUI registers tool side-effects + visual cards
 *
 * Generation lifecycle:
 *   Tool results → enqueueToolResult (serialized)
 *   → applyToolResult adds nodes to tree (hidden via gen-node-hidden class)
 *   → generation-store reveal queue drains nodes one-by-one with fade-in animation
 *   → Canvas interactions are locked until all reveals complete
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
    AssistantRuntimeProvider,
    makeAssistantToolUI,
    useRemoteThreadListRuntime,
} from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk'
import { useChat } from '@ai-sdk/react'
import { useAuiState } from '@assistant-ui/store'
import { Thread, type ThreadSelectedScope } from '@/components/assistant-ui/thread'
import { ThreadList } from '@/components/assistant-ui/thread-list'
import { Code2, Pencil, Check, Loader2, Search, Copy, ChevronDown } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useEditorStore } from '@/store/editor-store'
import { useStyleGuideStore } from '@/store'
import { useCreditStore } from '@/store/credits-store'
import { useGenerationStore, collectRevealOrder } from '@/store/generation-store'
import { createJWT } from '@/lib/appwrite'

import { findNodeById } from '@/types/canvas'
import { nodeToHtml } from '@/lib/export'
import { parseHtml } from '@/lib/parser'
import { createProjectThreadAdapter } from '@/lib/chat-persistence'
import { ChatSyncBridge } from '@/components/chat/chat-sync-bridge'
import { UpgradeModal } from '@/components/billing/upgrade-modal'
import type { ScytleNode, FrameNode } from '@/types/canvas'
import type { SystemPromptContext } from '@/lib/ai/prompts/system'

// ══════════════════════════════════════════════════════════
// Active page frame tracking
// ══════════════════════════════════════════════════════════

/** ID of the page frame that sections are appended into during generation */
let _activePageFrameId: string | null = null

/** Promise queue to serialize applyToolResult calls — prevents race conditions
 *  when multiple generateSection calls fire within milliseconds of each other. */
let _applyQueue: Promise<void> = Promise.resolve()

/** Enqueue a tool result to be applied in order. */
function enqueueToolResult(toolName: string, result: any): void {
    _applyQueue = _applyQueue.then(() => applyToolResult(toolName, result)).catch(console.error)
}

/** Reset when starting a new conversation / thread */
export function resetActivePageFrame() {
    _activePageFrameId = null
    // Also reset generation lifecycle for new conversations
    useGenerationStore.getState().reset()
}

function createPageFrame(
    existingNodes: readonly ScytleNode[],
    width: number = 1440,
    name: string = 'Page',
): FrameNode {
    const id = crypto.randomUUID()
    let x = 0
    let y = 0

    // Auto-position: place to the RIGHT of all existing frames, top-aligned.
    // Mirrors Paper.design's create_artboard behavior (horizontal flow, 100px gap).
    if (existingNodes.length > 0) {
        // Find the rightmost edge of all top-level frames
        let maxRight = 0
        let minTop = 0
        for (const node of existingNodes) {
            const right = node.x + node.width
            if (right > maxRight) maxRight = right
            if (node.y < minTop) minTop = node.y
        }
        x = maxRight + 100 // 100px gap (Paper uses 80px)
        y = minTop          // Top-align with existing frames
    }

    return {
        id,
        type: 'frame',
        name,
        visible: true,
        locked: false,
        x,
        y,
        width,
        height: 800,
        sizing: { horizontal: 'fixed', vertical: 'hug' },
        positioning: 'auto',
        opacity: 1,
        rotation: 0,
        overflow: 'hidden',
        borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        fills: [{ type: 'solid', color: '#FFFFFF', opacity: 1, visible: true }],
        shadows: [],
        children: [],
        layout: { mode: 'flex', direction: 'column', gap: 0 },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
    }
}

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function buildContext(
    nodes: readonly ScytleNode[],
    selectedIds: string[]
): SystemPromptContext {
    // Get full HTML for the selected node (untruncated) so AI can rewrite it
    const selectedId = selectedIds.length > 0 ? selectedIds[0] : null
    let selectedNodeHtml: string | null = null
    if (selectedId) {
        const selectedNode = findNodeById(nodes as ScytleNode[], selectedId)
        if (selectedNode) {
            selectedNodeHtml = nodeToHtml(selectedNode)
        }
    }

    return {
        canvasNodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            name: n.name,
            parentId: null,
            htmlSnippet: nodeToHtml(n).substring(0, 500),
        })),
        selectedNodeId: selectedId,
        selectedNodeHtml,
    }
}

function extractChatFonts(
    html: string,
    sgState: { data: { concepts: Array<{ id: string; fonts?: { heading?: string; body?: string } }>; activeConceptId?: string } },
): string[] {
    const families = new Set<string>()
    const fontClasses = html.match(/font-\[([^\]]+)\]/g)
    if (fontClasses) {
        for (const fc of fontClasses) {
            const family = fc.slice(6, -1).replace(/_/g, ' ').replace(/['"]/g, '')
            if (family) families.add(family)
        }
    }
    const inlineStyles = html.match(/font-family:\s*['"]([^'"]+)['"]/g)
    if (inlineStyles) {
        for (const style of inlineStyles) {
            const match = style.match(/font-family:\s*['"]([^'"]+)['"]/)
            if (match) families.add(match[1])
        }
    }
    // Get fonts from the active concept
    const concept = sgState.data.concepts?.find(c => c.id === sgState.data.activeConceptId)
    if (concept?.fonts?.heading) families.add(concept.fonts.heading)
    if (concept?.fonts?.body) families.add(concept.fonts.body)
    const systemFonts = new Set(['Inter', 'sans-serif', 'serif', 'monospace', 'mono', 'system-ui', 'Arial', 'Helvetica'])
    return Array.from(families).filter(f => !systemFonts.has(f))
}

// ══════════════════════════════════════════════════════════
// Tool side-effect handler
// ══════════════════════════════════════════════════════════

/**
 * Track which tool invocations have already been applied to the canvas/store.
 * Keyed by toolCallId (unique per invocation, provided by assistant-ui).
 * Persisted to localStorage so dedup survives page reloads — prevents
 * historical tool results from re-applying when switching threads.
 */
const APPLIED_KEY = 'scytle:applied-tool-calls'

function loadAppliedSet(): Set<string> {
    try {
        const raw = localStorage.getItem(APPLIED_KEY)
        return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
        return new Set()
    }
}

function persistAppliedSet(set: Set<string>): void {
    try {
        // Keep last 500 entries to prevent unbounded growth
        const arr = Array.from(set)
        const trimmed = arr.length > 500 ? arr.slice(-500) : arr
        localStorage.setItem(APPLIED_KEY, JSON.stringify(trimmed))
    } catch { /* quota exceeded — silently ignore */ }
}

/** Check + mark a tool call as applied. Returns true if already applied. */
function markToolApplied(toolCallId: string): boolean {
    const set = loadAppliedSet()
    if (set.has(toolCallId)) return true
    set.add(toolCallId)
    persistAppliedSet(set)
    return false
}

async function applyToolResult(toolName: string, result: any): Promise<void> {
    if (!result) return

    // Track apply count for generation lock
    const genStore = useGenerationStore.getState()
    genStore.incrementPendingApply()

    try {
        switch (toolName) {
            // updateTheme removed — AI generates HTML with inline colors/fonts directly

            case 'generateSection': {
                const { html, sectionType, newPage, pageName, width, parentNodeId } = result
                if (!html) return
                const frameWidth = typeof width === 'number' && width > 0 ? width : 1440
                try {
                    const sgState = useStyleGuideStore.getState()
                    const fonts = extractChatFonts(html, sgState)
                    const parsed = await parseHtml(html, sectionType || 'Section', {
                        rootWidth: frameWidth,
                        fonts,
                    })
                    const newNode: ScytleNode = parsed.children.length === 1 ? parsed.children[0] : parsed
                    const editorStore = useEditorStore.getState()

                    // Enforce width and sizing so sections fill the parent frame
                    newNode.width = frameWidth
                    newNode.sizing = { horizontal: 'fill', vertical: 'hug' }

                    // If AI explicitly requests a new page, or no page frame exists yet,
                    // create a new page frame. This enables multi-page designs
                    // (e.g., Home page + Pricing page as separate frames on canvas).
                    const needsNewPage = newPage === true ||
                        !_activePageFrameId ||
                        !findNodeById(editorStore.nodes as ScytleNode[], _activePageFrameId)

                    if (needsNewPage) {
                        const pageFrame = createPageFrame(
                            editorStore.nodes as ScytleNode[],
                            frameWidth,
                            pageName || sectionType || 'Page',
                        )
                        editorStore.addNode(pageFrame)
                        _activePageFrameId = pageFrame.id

                        // Set the page frame as active for glow effect
                        useGenerationStore.getState().setActiveGeneratingFrameId(pageFrame.id)

                        // Enqueue the page frame for reveal (structural — instant)
                        useGenerationStore.getState().enqueueRevealBatch([{
                            id: `reveal-${pageFrame.id}`,
                            nodeId: pageFrame.id,
                            isStructural: true,
                        }])
                    } else if (_activePageFrameId) {
                        // Existing page frame — set glow
                        useGenerationStore.getState().setActiveGeneratingFrameId(_activePageFrameId)
                    }

                    // If parentNodeId is a valid existing node (not "root"), use it directly
                    let targetParent = _activePageFrameId
                    if (parentNodeId && parentNodeId !== 'root') {
                        const parentExists = findNodeById(editorStore.nodes as ScytleNode[], parentNodeId)
                        if (parentExists) {
                            targetParent = parentNodeId
                        }
                    }

                    editorStore.addNode(newNode, targetParent ?? undefined)

                    // Collect ALL descendant nodes for per-child progressive reveal
                    const revealItems = collectRevealOrder(newNode)
                    useGenerationStore.getState().enqueueRevealBatch(revealItems)
                } catch (e) {
                    console.error('Failed to parse section HTML:', e)
                }
                break
            }

            case 'editNode': {
                const { nodeId, html } = result
                if (!html || !nodeId) return
                try {
                    const sgState = useStyleGuideStore.getState()
                    const editorStore = useEditorStore.getState()
                    const existingNode = findNodeById(editorStore.nodes as ScytleNode[], nodeId)
                    if (!existingNode) return
                    const fonts = extractChatFonts(html, sgState)
                    const parsed = await parseHtml(html, existingNode.name, {
                        rootWidth: existingNode.width,
                        fonts,
                    })
                    const newNode: ScytleNode = parsed.children.length === 1 ? parsed.children[0] : parsed
                    newNode.x = existingNode.x
                    newNode.y = existingNode.y
                    newNode.width = existingNode.width
                    newNode.height = existingNode.height
                    newNode.id = existingNode.id
                    editorStore.replaceNode(nodeId, newNode)

                    // Collect ALL descendant nodes for per-child progressive reveal
                    const revealItems = collectRevealOrder(newNode)
                    useGenerationStore.getState().enqueueRevealBatch(revealItems)
                } catch (e) {
                    console.error('Failed to edit node:', e)
                }
                break
            }
        }
    } finally {
        // Always decrement — prevents stuck lock on errors
        useGenerationStore.getState().decrementPendingApply()
    }
}

// ══════════════════════════════════════════════════════════
// Rich Tool UI Cards
// ══════════════════════════════════════════════════════════

function StatusIcon({ status }: { status: { type: string } }) {
    if (status.type === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
    if (status.type === 'complete') return <Check className="w-3.5 h-3.5 text-emerald-500" />
    return null
}

// UpdateThemeToolUI removed — AI no longer calls updateTheme

const GenerateSectionToolUI = makeAssistantToolUI({
    toolName: 'generateSection',
    render: ({ args, result, status, toolCallId }) => {
        const [expanded, setExpanded] = useState(false)
        const [copied, setCopied] = useState(false)
        const html = (result as any)?.html || ''

        useEffect(() => {
            if (status.type === 'complete' && result && !markToolApplied(toolCallId)) {
                enqueueToolResult('generateSection', result)
            }
            // Track thread running state — when tool transitions to running, thread is active
            if (status.type === 'running') {
                useGenerationStore.getState().setThreadRunning(true)
            }
        }, [status.type, result, toolCallId])

        const handleCopy = useCallback((e: React.MouseEvent) => {
            e.stopPropagation()
            if (!html) return
            navigator.clipboard.writeText(html).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            })
        }, [html])

        return (
            <div className="rounded-lg border border-border/50 bg-muted/30 text-sm">
                <div
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => html && setExpanded(!expanded)}
                >
                    <Code2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground/80">
                            {status.type === 'running' ? 'Generating' : 'Generated'}
                        </span>
                        <span className="text-muted-foreground"> {String(args?.sectionType || 'section')}</span>
                        {html && (
                            <span className="text-muted-foreground/50 text-xs ml-1">({(html.length / 1024).toFixed(1)}kb)</span>
                        )}
                    </div>
                    {html && (
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    )}
                    <StatusIcon status={status} />
                </div>
                {expanded && html && (
                    <div className="border-t border-border/50 relative">
                        <button
                            onClick={handleCopy}
                            className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors z-10"
                            title="Copy HTML"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <pre className="p-3 overflow-x-auto text-xs text-foreground/70 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
                            <code>{html}</code>
                        </pre>
                    </div>
                )}
            </div>
        )
    },
})

const EditNodeToolUI = makeAssistantToolUI({
    toolName: 'editNode',
    render: ({ args, result, status, toolCallId }) => {
        const [expanded, setExpanded] = useState(false)
        const [copied, setCopied] = useState(false)
        const html = (result as any)?.html || ''

        useEffect(() => {
            if (status.type === 'complete' && result && !markToolApplied(toolCallId)) {
                enqueueToolResult('editNode', result)
            }
            // Track thread running state
            if (status.type === 'running') {
                useGenerationStore.getState().setThreadRunning(true)
            }
        }, [status.type, result, toolCallId])

        const handleCopy = useCallback((e: React.MouseEvent) => {
            e.stopPropagation()
            if (!html) return
            navigator.clipboard.writeText(html).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            })
        }, [html])

        return (
            <div className="rounded-lg border border-border/50 bg-muted/30 text-sm">
                <div
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => html && setExpanded(!expanded)}
                >
                    <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground/80">
                            {status.type === 'running' ? 'Editing node' : 'Node edited'}
                        </span>
                        {args?.reason && (
                            <span className="text-muted-foreground"> — {String(args.reason)}</span>
                        )}
                        {html && (
                            <span className="text-muted-foreground/50 text-xs ml-1">({(html.length / 1024).toFixed(1)}kb)</span>
                        )}
                    </div>
                    {html && (
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    )}
                    <StatusIcon status={status} />
                </div>
                {expanded && html && (
                    <div className="border-t border-border/50 relative">
                        <button
                            onClick={handleCopy}
                            className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors z-10"
                            title="Copy HTML"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <pre className="p-3 overflow-x-auto text-xs text-foreground/70 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
                            <code>{html}</code>
                        </pre>
                    </div>
                )}
            </div>
        )
    },
})

const SearchImagesToolUI = makeAssistantToolUI({
    toolName: 'searchImages',
    render: ({ args, result, status }) => {
        return (
            <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground/80">
                        {status.type === 'running' ? 'Searching' : 'Found images'}
                    </span>
                    <span className="text-muted-foreground"> &quot;{String(args?.query)}&quot;</span>
                </div>
                {(result as any)?.images?.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {(result as any).images.slice(0, 3).map((img: any, i: number) => (
                            <img key={i} src={img.url} alt="" className="w-6 h-6 rounded object-cover border border-border/30" />
                        ))}
                    </div>
                )}
                <StatusIcon status={status} />
            </div>
        )
    },
})

// ══════════════════════════════════════════════════════════
// Per-thread chat runtime hook (called inside RemoteThreadList)
// ══════════════════════════════════════════════════════════

function useChatThreadRuntime(transport: AssistantChatTransport<any>) {
    // assistant-ui provides thread ID via store — useChat keyed by it
    const threadId = useAuiState((s) => s.threadListItem.id)
    const chat = useChat({ id: threadId, transport })
    const runtime = useAISDKRuntime(chat)
    // Wire runtime back to transport so modelContext flows into requests
    transport.setRuntime(runtime)

    // ── Track thread running state for generation lock ──────────
    // useChat's `status` transitions: 'submitted' → 'streaming' → 'ready'
    // We mark the generation thread as running when streaming starts,
    // and stopped when it reaches 'ready' or 'error'.
    useEffect(() => {
        const chatStatus = chat.status
        if (chatStatus === 'streaming' || chatStatus === 'submitted') {
            useGenerationStore.getState().setThreadRunning(true)
        } else if (chatStatus === 'ready' || chatStatus === 'error') {
            useGenerationStore.getState().setThreadRunning(false)
        }
    }, [chat.status])

    return runtime
}

// ══════════════════════════════════════════════════════════
// Main ChatPanel
// ══════════════════════════════════════════════════════════

export function ChatPanel() {
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const projectId = useEditorStore((s) => s._projectId) ?? 'default'

    const selectedNodeSummary = useMemo<ThreadSelectedScope | null>(() => {
        if (selectedIds.length === 0) return null

        if (selectedIds.length > 1) {
            return {
                id: selectedIds.join(','),
                name: `${selectedIds.length} sections selected`,
                type: 'multi',
            }
        }

        const selectedId = selectedIds[0]
        if (!selectedId) return null

        const state = useEditorStore.getState()
        const selectedNode = findNodeById(state.nodes as ScytleNode[], selectedId)

        if (!selectedNode) {
            return {
                id: selectedId,
                name: 'Selected section',
                type: 'section',
            }
        }

        return {
            id: selectedNode.id,
            name: selectedNode.name || selectedNode.type,
            type: selectedNode.type,
        }
    }, [selectedIds])

    // Read canvas context lazily via getState() — NOT by subscribing to `nodes`.
    // Subscribing caused re-renders on every canvas change (tool results adding nodes),
    // which recreated the transport, potentially aborting the active AI stream.
    // Context only needs to be current at API-call time, not on every render.
    const getContext = useCallback(() => {
        const s = useEditorStore.getState()
        return buildContext(s.nodes, s.selectedIds)
    }, [])

    // JWT ref for auth headers — refreshed lazily
    const jwtRef = useMemo(() => ({ current: '' as string, expiresAt: 0 }), [])

    const getJWT = useCallback(async () => {
        if (jwtRef.current && jwtRef.expiresAt > Date.now()) {
            return jwtRef.current
        }
        try {
            const jwt = await createJWT()
            if (jwt) {
                jwtRef.current = jwt.jwt
                jwtRef.expiresAt = Date.now() + 14 * 60 * 1000 // 14 min
            }
            return jwtRef.current
        } catch {
            return ''
        }
    }, [jwtRef])

    // Transport created ONCE — stable reference across renders.
    const transport = useMemo(
        () => new AssistantChatTransport({
            api: '/api/chat',
            body: () => ({ context: getContext() }),
            headers: async (): Promise<Record<string, string>> => {
                const jwt = await getJWT()
                // Optimistic credit deduction — runs once per message sent
                useCreditStore.getState().incrementUsed()
                return jwt ? { 'x-auth-jwt': jwt } : {}
            },
        }),
        [getContext, getJWT]
    )

    const handleClearSelection = useCallback(() => {
        useEditorStore.getState().deselectAll()
    }, [])

    // Persistence adapter — localStorage scoped per project
    const adapter = useMemo(
        () => createProjectThreadAdapter(projectId),
        [projectId],
    )

    // Stable runtimeHook — only changes if transport changes (which is now stable)
    const runtimeHook = useCallback(
        function ChatRuntimeHook() {
            return useChatThreadRuntime(transport)
        },
        [transport]
    )

    const runtime = useRemoteThreadListRuntime({ runtimeHook, adapter })

    // Fetch credits on mount + periodic refresh to stay in sync
    const { fetchCredits, creditsUsed, creditsLimit, plan, remaining, dailyUsed, dailyCap, openUpgradeModal } = useCreditStore()
    useEffect(() => {
        fetchCredits()
        // Refresh credits every 10 seconds for real-time accuracy
        const interval = setInterval(() => {
            useCreditStore.getState().fetchCredits()
        }, 10_000)
        return () => clearInterval(interval)
    }, [fetchCredits])

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            {/* Cross-browser thread list sync via WebSocket */}
            <ChatSyncBridge />

            {/* Tool side-effects + rich visual cards */}
            {/* UpdateThemeToolUI removed — AI generates inline colors */}
            <GenerateSectionToolUI />
            <EditNodeToolUI />
            <SearchImagesToolUI />

            {/* Full chat UI — ModelSelector is inside Thread's Composer */}
            <div className="flex flex-col h-full">
                {/* Thread fills the space */}
                <div className="flex-1 min-h-0">
                    <Thread
                        selectedScope={selectedNodeSummary}
                        onClearSelectedScope={handleClearSelection}
                    />
                </div>

                {/* Thread pills and Credit indicator — bottom row */}
                <div className="shrink-0 border-t border-border/30 px-2 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <ThreadList />
                    </div>
                    
                    {/* Credit indicator — compact trigger with popover */}
                    <div className="shrink-0">
                        <Popover>
                            <PopoverTrigger asChild>
                                <button className="flex items-center justify-center size-7 rounded-full border border-border/60 hover:bg-muted transition-colors relative group" aria-label="View credits">
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-3.5">
                                        <path d="M12 2.5L14.1 9.9L21.5 12L14.1 14.1L12 21.5L9.9 14.1L2.5 12L9.9 9.9L12 2.5Z" 
                                              stroke="currentColor" 
                                              strokeWidth="2" 
                                              strokeLinecap="round" 
                                              strokeLinejoin="round"
                                              className={remaining <= 10 ? 'text-red-500' : remaining <= 30 ? 'text-amber-500' : 'text-foreground/70 group-hover:text-foreground transition-colors'} />
                                        <path d="M12 7L13.5 10.5L17 12L13.5 13.5L12 17L10.5 13.5L7 12L10.5 10.5L12 7Z" 
                                              fill="currentColor" 
                                              className={remaining <= 10 ? 'text-red-500/50' : remaining <= 30 ? 'text-amber-500/50' : 'text-foreground/20 group-hover:text-foreground/40 transition-colors'} />
                                    </svg>
                                    
                                    {/* Low credits alert dot */}
                                    {remaining <= 30 && (
                                        <span className={`absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-background ${remaining <= 10 ? 'bg-red-500' : 'bg-amber-500'}`} />
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="end" className="w-64 p-0">
                                {/* Header */}
                                <div className="px-4 pt-4 pb-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium">Scytle {plan === 'pro' ? 'Pro' : 'Free'}</span>
                                        {plan === 'free' && (
                                            <button
                                                onClick={openUpgradeModal}
                                                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            >
                                                Upgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Usage section */}
                                    <div className="space-y-2">
                                        <p className="text-xs text-muted-foreground">Credits usage</p>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-2xl font-semibold tabular-nums">
                                                {creditsLimit > 0 ? Math.round((creditsUsed / creditsLimit) * 100) : 0}%
                                            </span>
                                            <span className="text-xs text-muted-foreground">used</span>
                                            <span className="text-xs text-muted-foreground ml-auto">Resets monthly</span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    remaining <= 10
                                                        ? 'bg-red-500'
                                                        : remaining <= 30
                                                            ? 'bg-amber-500'
                                                            : 'bg-foreground/70'
                                                }`}
                                                style={{ width: `${Math.min(100, Math.max(1, (creditsUsed / creditsLimit) * 100))}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {creditsUsed} / {creditsLimit} credits used
                                        </p>
                                    </div>
                                </div>

                                {/* Daily stats — free plan only */}
                                {plan === 'free' && dailyCap !== null && (
                                    <div className="border-t px-4 py-3">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Today</span>
                                            <span className="tabular-nums">{dailyUsed} / {dailyCap} daily</span>
                                        </div>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>
            {/* Upgrade Modal — rendered here because project editor doesn't use AppShell */}
            <UpgradeModal />
        </AssistantRuntimeProvider>
    )
}
