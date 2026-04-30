'use client'

/**
 * Chat Persistence — Appwrite-first with localStorage cache
 *
 * Appwrite is the server of truth for threads & messages.
 * localStorage is a fast read cache for instant UI.
 *
 * Write flow:  localStorage (optimistic) → debounce → Appwrite API
 * Read flow:   localStorage cache → return immediately → background server refresh
 *
 * Per project cache keys:
 *   - Thread list:  scytle:${projectId}:threads      → StoredThread[]
 *   - Messages:     scytle:${projectId}:msg:${tid}   → StoredMessageRepo
 */

import {
    type FC,
    type PropsWithChildren,
    useMemo,
} from 'react'
import { type AssistantStream, createAssistantStream } from 'assistant-stream'
import { useAui } from '@assistant-ui/store'
import {
    RuntimeAdapterProvider,
} from '@assistant-ui/core/react'
import type { RemoteThreadListAdapter } from '@assistant-ui/react'
import type {
    ThreadHistoryAdapter,
    ExportedMessageRepository,
    ExportedMessageRepositoryItem,
    MessageFormatAdapter,
    MessageFormatItem,
    MessageFormatRepository,
    GenericThreadHistoryAdapter,
    MessageStorageEntry,
} from '@assistant-ui/core'
import { createJWT } from '@/lib/appwrite'
import { canvasSync } from '@/lib/sync'

// ── Types ───────────────────────────────────────────────────

type RemoteThreadInitializeResponse = {
    remoteId: string
    externalId: string | undefined
}

type RemoteThreadListResponse = {
    threads: RemoteThreadMetadata[]
}

type RemoteThreadMetadata = {
    readonly status: 'regular' | 'archived'
    readonly remoteId: string
    readonly externalId?: string | undefined
    readonly title?: string | undefined
}

type StoredThread = {
    remoteId: string
    status: 'regular' | 'archived'
    title?: string
}

type StoredMessageEntry = {
    id: string
    parent_id: string | null
    format: string
    content: Record<string, unknown>
}

type StoredMessageRepo = {
    headId?: string | null
    messages: StoredMessageEntry[]
}

// ── localStorage cache helpers ─────────────────────────────

function threadsKey(projectId: string) {
    return `scytle:${projectId}:threads`
}

function messagesKey(projectId: string, threadId: string) {
    return `scytle:${projectId}:msg:${threadId}`
}

function loadThreadsCache(projectId: string): StoredThread[] {
    try {
        const raw = localStorage.getItem(threadsKey(projectId))
        return raw ? (JSON.parse(raw) as StoredThread[]) : []
    } catch {
        return []
    }
}

function saveThreadsCache(projectId: string, threads: StoredThread[]) {
    try {
        localStorage.setItem(threadsKey(projectId), JSON.stringify(threads))
    } catch {
        // localStorage full — non-critical, server is the truth
    }
}

function loadMessagesCache(projectId: string, threadId: string): StoredMessageRepo {
    try {
        const raw = localStorage.getItem(messagesKey(projectId, threadId))
        return raw ? (JSON.parse(raw) as StoredMessageRepo) : { messages: [] }
    } catch {
        return { messages: [] }
    }
}

/**
 * Trim tool-invocation results to avoid blowing up localStorage.
 * Full tool results (HTML, node trees, images) are already applied to the canvas.
 */
function trimLargeContent(content: Record<string, unknown>): Record<string, unknown> {
    if (!content.parts || !Array.isArray(content.parts)) return content

    const trimmedParts = (content.parts as Array<Record<string, unknown>>).map((part) => {
        if (part.type === 'tool-invocation' && part.result != null) {
            const result = part.result as Record<string, unknown>
            const summary: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(result)) {
                if (typeof v === 'boolean' || typeof v === 'number') {
                    summary[k] = v
                } else if (typeof v === 'string' && v.length <= 200) {
                    summary[k] = v
                } else if (typeof v === 'string') {
                    summary[k] = v.slice(0, 100) + '…'
                }
            }
            return { ...part, result: summary }
        }
        return part
    })

    return { ...content, parts: trimmedParts }
}

function saveMessagesCache(projectId: string, threadId: string, repo: StoredMessageRepo) {
    try {
        localStorage.setItem(messagesKey(projectId, threadId), JSON.stringify(repo))
    } catch {
        // QuotaExceededError — trim and retry
        const trimmed: StoredMessageRepo = {
            headId: repo.headId,
            messages: repo.messages.map((m) => ({
                ...m,
                content: trimLargeContent(m.content),
            })),
        }
        try {
            localStorage.setItem(messagesKey(projectId, threadId), JSON.stringify(trimmed))
        } catch {
            console.warn('[chat-persistence] Message too large for localStorage even after trimming — relying on server sync')
        }
    }
}

// ── Server API helpers ─────────────────────────────────────

async function getAuthHeader(): Promise<string | null> {
    try {
        const jwt = await createJWT()
        return jwt ? `Bearer ${jwt.jwt}` : null
    } catch {
        return null
    }
}

// ── Thread server sync ─────────────────────────────────────

const _threadSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleThreadSync(
    projectId: string,
    threadId: string,
    action: 'create' | 'update' | 'delete',
    data?: Record<string, unknown>,
) {
    const key = `thread:${threadId}:${action}`
    const existing = _threadSyncTimers.get(key)
    if (existing) clearTimeout(existing)

    _threadSyncTimers.set(key, setTimeout(async () => {
        _threadSyncTimers.delete(key)
        const auth = await getAuthHeader()
        if (!auth) return

        try {
            if (action === 'create') {
                await fetch(`/api/projects/${projectId}/threads`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: auth },
                    body: JSON.stringify({ threadId, ...data }),
                })
            } else if (action === 'update') {
                await fetch(`/api/projects/${projectId}/threads/${threadId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: auth },
                    body: JSON.stringify(data),
                })
            } else if (action === 'delete') {
                await fetch(`/api/projects/${projectId}/threads/${threadId}`, {
                    method: 'DELETE',
                    headers: { Authorization: auth },
                })
            }
        } catch (e) {
            console.warn(`Failed to sync thread ${action}:`, e)
        }
    }, 500))
}

// ── Message server sync ────────────────────────────────────

const _msgSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleMessageSync(
    projectId: string,
    threadId: string,
    entry: StoredMessageEntry,
    isHead: boolean,
) {
    const key = `msg:${threadId}:${entry.id}`
    const existing = _msgSyncTimers.get(key)
    if (existing) clearTimeout(existing)

    _msgSyncTimers.set(key, setTimeout(async () => {
        _msgSyncTimers.delete(key)
        const auth = await getAuthHeader()
        if (!auth) return

        try {
            // Trim before sending to server
            const trimmedContent = trimLargeContent(entry.content)
            await fetch(`/api/projects/${projectId}/threads/${threadId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: auth },
                body: JSON.stringify({
                    id: entry.id,
                    parentId: entry.parent_id,
                    format: entry.format,
                    content: trimmedContent,
                    isHead,
                }),
            })
        } catch (e) {
            console.warn('Failed to sync message:', e)
        }
    }, 1000))
}

// ── Server refresh (background) ────────────────────────────

/**
 * Fetch threads from new API, update localStorage cache.
 * Also attempts migration from old AI_CONVERSATIONS if no threads found.
 */
async function refreshThreadsFromServer(projectId: string): Promise<void> {
    const auth = await getAuthHeader()
    if (!auth) return

    try {
        const res = await fetch(`/api/projects/${projectId}/threads`, {
            headers: { Authorization: auth },
        })
        if (!res.ok) return

        const data = await res.json()
        const serverThreads: StoredThread[] = (data.threads ?? []).map((t: any) => ({
            remoteId: t.remoteId,
            status: t.status,
            title: t.title,
        }))

        // Server is truth — replace cache
        saveThreadsCache(projectId, serverThreads)
    } catch (e) {
        console.warn('Failed to refresh threads from server:', e)
    }
}

/**
 * Fetch messages for a thread from server and MERGE with local cache.
 * Returns the merged data directly so callers don't depend on a successful
 * localStorage save (which can fail due to quota when AI responses are large).
 *
 * Strategy:
 *   • Server messages win for content (source of truth once synced).
 *   • Local-only messages are kept (pending sync — still valid).
 *   • headId = latest between server and cache.
 */
async function refreshMessagesFromServer(
    projectId: string,
    threadId: string,
): Promise<StoredMessageRepo | null> {
    const auth = await getAuthHeader()
    if (!auth) return null

    try {
        const res = await fetch(`/api/projects/${projectId}/threads/${threadId}/messages`, {
            headers: { Authorization: auth },
        })
        if (!res.ok) return null

        const data = await res.json()
        const serverMessages: StoredMessageEntry[] = data.messages ?? []
        if (serverMessages.length === 0) return null // nothing from server

        const local = loadMessagesCache(projectId, threadId)

        // Build a map: id → message.  Start with local, overlay with server.
        const merged = new Map<string, StoredMessageEntry>()
        for (const m of local.messages) merged.set(m.id, m)
        for (const m of serverMessages) merged.set(m.id, m) // server wins for same id

        const mergedRepo: StoredMessageRepo = {
            headId: data.headId ?? local.headId,
            messages: Array.from(merged.values()),
        }

        // Best-effort cache update (may fail for large AI responses — that's OK)
        saveMessagesCache(projectId, threadId, mergedRepo)

        return mergedRepo
    } catch (e) {
        console.warn('Failed to refresh messages from server:', e)
        return null
    }
}

// ── Topological sort for message loading ───────────────────

function topoSortMessages(messages: StoredMessageEntry[]): StoredMessageEntry[] {
    const idSet = new Set(messages.map((e) => e.id))
    const sorted: StoredMessageEntry[] = []
    const placed = new Set<string | null>([null])
    const remaining = [...messages]
    let prevLen = -1

    while (remaining.length > 0 && remaining.length !== prevLen) {
        prevLen = remaining.length
        for (let i = remaining.length - 1; i >= 0; i--) {
            const entry = remaining[i]!
            if (placed.has(entry.parent_id) || !idSet.has(entry.parent_id!)) {
                if (entry.parent_id && !idSet.has(entry.parent_id)) {
                    entry.parent_id = null
                }
                sorted.push(entry)
                placed.add(entry.id)
                remaining.splice(i, 1)
            }
        }
    }

    for (const entry of remaining) {
        entry.parent_id = null
        sorted.push(entry)
    }

    return sorted
}

// ── History adapter (per-thread message load/save) ──────────

class ChatHistoryAdapter implements ThreadHistoryAdapter {
    constructor(
        private projectId: string,
        private aui: ReturnType<typeof useAui>,
    ) {}

    private _getRemoteId(): string | undefined {
        return this.aui.threadListItem().getState().remoteId
    }

    private async _getOrInitRemoteId(): Promise<string> {
        const { remoteId } = await this.aui.threadListItem().initialize()
        return remoteId
    }

    async load(): Promise<ExportedMessageRepository & { unstable_resume?: boolean }> {
        return { messages: [] }
    }

    async append(_item: ExportedMessageRepositoryItem): Promise<void> {}

    withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
        formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
    ): GenericThreadHistoryAdapter<TMessage> {
        const self = this

        return {
            async load(): Promise<MessageFormatRepository<TMessage>> {
                const remoteId = self._getRemoteId()
                if (!remoteId) return { messages: [] }

                try {
                    // Fetch from server and merge with cache.
                    // Use the RETURNED data directly — don't rely on cache,
                    // because saveMessagesCache can fail for large AI responses.
                    const serverMerged = await refreshMessagesFromServer(self.projectId, remoteId)
                    const stored = serverMerged ?? loadMessagesCache(self.projectId, remoteId)

                    if (stored.messages.length === 0) return { messages: [] }

                    const filtered = stored.messages
                        .filter((entry) => entry.format === formatAdapter.format)

                    const sorted = topoSortMessages(filtered)

                    return {
                        headId: stored.headId,
                        messages: sorted.map((entry) =>
                            formatAdapter.decode(entry as MessageStorageEntry<TStorageFormat>),
                        ),
                    }
                } catch (e) {
                    console.error('Failed to load chat history:', e)
                    return { messages: [] }
                }
            },

            async append(item: MessageFormatItem<TMessage>): Promise<void> {
                const remoteId = await self._getOrInitRemoteId()

                const stored = loadMessagesCache(self.projectId, remoteId)
                const id = formatAdapter.getId(item.message)
                const encoded = formatAdapter.encode(item)
                const entry: StoredMessageEntry = {
                    id,
                    parent_id: item.parentId,
                    format: formatAdapter.format,
                    content: encoded as Record<string, unknown>,
                }

                const idx = stored.messages.findIndex((m) => m.id === id)
                if (idx >= 0) {
                    stored.messages[idx] = entry
                } else {
                    stored.messages.push(entry)
                }
                stored.headId = id

                // 1. Cache locally (optimistic)
                saveMessagesCache(self.projectId, remoteId, stored)
                // 2. Sync to server (debounced)
                scheduleMessageSync(self.projectId, remoteId, entry, true)
            },

            async update(item: MessageFormatItem<TMessage>, localMessageId: string): Promise<void> {
                const remoteId = self._getRemoteId()
                if (!remoteId) return

                const stored = loadMessagesCache(self.projectId, remoteId)
                const id = formatAdapter.getId(item.message)
                const encoded = formatAdapter.encode(item)
                const entry: StoredMessageEntry = {
                    id,
                    parent_id: item.parentId,
                    format: formatAdapter.format,
                    content: encoded as Record<string, unknown>,
                }

                let idx = stored.messages.findIndex((m) => m.id === id)
                if (idx < 0) {
                    idx = stored.messages.findIndex((m) => m.id === localMessageId)
                }
                if (idx >= 0) {
                    stored.messages[idx] = entry
                    saveMessagesCache(self.projectId, remoteId, stored)
                    scheduleMessageSync(self.projectId, remoteId, entry, false)
                }
            },
        }
    }
}

// ── Provider component for history adapter ──────────────────

function createHistoryProvider(projectId: string): FC<PropsWithChildren> {
    const Provider: FC<PropsWithChildren> = ({ children }) => {
        const aui = useAui()
        const history = useMemo(
            () => new ChatHistoryAdapter(projectId, aui),
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [projectId],
        )
        const adapters = useMemo(() => ({ history }), [history])

        return (
            <RuntimeAdapterProvider adapters={adapters}>
                {children}
            </RuntimeAdapterProvider>
        )
    }
    Provider.displayName = 'ChatHistoryProvider'
    return Provider
}

// ── Title generation helper ─────────────────────────────────

function extractTitleFromMessages(
    messages: readonly { content: readonly { type: string; text?: string }[] }[],
): string {
    for (const msg of messages) {
        for (const part of msg.content) {
            if (part.type === 'text' && part.text) {
                const text = part.text.trim()
                if (text.length <= 60) return text
                return text.substring(0, 57) + '...'
            }
        }
    }
    return 'New Chat'
}

// ── Main adapter factory ────────────────────────────────────

export function createProjectThreadAdapter(
    projectId: string,
): RemoteThreadListAdapter {
    // Fetch server threads on creation — list() awaits this
    let syncDone = refreshThreadsFromServer(projectId)

    // Listen for chat thread changes from other browsers via the WebSocket
    if (typeof window !== 'undefined') {
        canvasSync.onChatMessage((msg) => {
            if (msg.type === 'chat:thread:create') {
                const threads = loadThreadsCache(projectId)
                if (!threads.some((t) => t.remoteId === msg.thread.remoteId)) {
                    threads.unshift(msg.thread as StoredThread)
                    saveThreadsCache(projectId, threads)
                }
            } else if (msg.type === 'chat:thread:delete') {
                const threads = loadThreadsCache(projectId)
                saveThreadsCache(projectId, threads.filter((t) => t.remoteId !== msg.threadId))
                localStorage.removeItem(messagesKey(projectId, msg.threadId))
            } else if (msg.type === 'chat:thread:rename') {
                const threads = loadThreadsCache(projectId)
                const t = threads.find((th) => th.remoteId === msg.threadId)
                if (t) {
                    t.title = msg.title
                    saveThreadsCache(projectId, threads)
                }
            } else if (msg.type === 'chat:thread:archive') {
                const threads = loadThreadsCache(projectId)
                const t = threads.find((th) => th.remoteId === msg.threadId)
                if (t) {
                    t.status = msg.status
                    saveThreadsCache(projectId, threads)
                }
            }

            // Signal the ChatSyncBridge to force assistant-ui to re-fetch thread list
            window.dispatchEvent(new CustomEvent('chat:threads-changed'))
        })
    }

    return {
        unstable_Provider: createHistoryProvider(projectId),

        async list(): Promise<RemoteThreadListResponse> {
            // Always wait for the latest server fetch
            await syncDone
            const threads = loadThreadsCache(projectId)
            return {
                threads: threads.map((t) => ({
                    remoteId: t.remoteId,
                    status: t.status,
                    title: t.title,
                })),
            }
        },

        async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
            const threads = loadThreadsCache(projectId)
            if (!threads.some((t) => t.remoteId === threadId)) {
                threads.unshift({ remoteId: threadId, status: 'regular' })
                saveThreadsCache(projectId, threads)
                // Create on server immediately (must exist before messages arrive)
                const auth = await getAuthHeader()
                if (auth) {
                    fetch(`/api/projects/${projectId}/threads`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: auth },
                        body: JSON.stringify({ threadId, status: 'regular' }),
                    }).catch(() => {})
                }
                // Notify other browsers via WebSocket
                canvasSync.sendChatThreadCreate({ remoteId: threadId, status: 'regular' })
            }
            return { remoteId: threadId, externalId: undefined }
        },

        async rename(remoteId: string, newTitle: string): Promise<void> {
            const threads = loadThreadsCache(projectId)
            const thread = threads.find((t) => t.remoteId === remoteId)
            if (thread) {
                thread.title = newTitle
                saveThreadsCache(projectId, threads)
                scheduleThreadSync(projectId, remoteId, 'update', { title: newTitle })
                canvasSync.sendChatThreadRename(remoteId, newTitle)
            }
        },

        async archive(remoteId: string): Promise<void> {
            const threads = loadThreadsCache(projectId)
            const thread = threads.find((t) => t.remoteId === remoteId)
            if (thread) {
                thread.status = 'archived'
                saveThreadsCache(projectId, threads)
                scheduleThreadSync(projectId, remoteId, 'update', { status: 'archived' })
                canvasSync.sendChatThreadArchive(remoteId, 'archived')
            }
        },

        async unarchive(remoteId: string): Promise<void> {
            const threads = loadThreadsCache(projectId)
            const thread = threads.find((t) => t.remoteId === remoteId)
            if (thread) {
                thread.status = 'regular'
                saveThreadsCache(projectId, threads)
                scheduleThreadSync(projectId, remoteId, 'update', { status: 'regular' })
                canvasSync.sendChatThreadArchive(remoteId, 'regular')
            }
        },

        async delete(remoteId: string): Promise<void> {
            // Remove from cache
            const threads = loadThreadsCache(projectId)
            const filtered = threads.filter((t) => t.remoteId !== remoteId)
            saveThreadsCache(projectId, filtered)
            localStorage.removeItem(messagesKey(projectId, remoteId))
            // Delete from server immediately (no debounce for destructive actions)
            const auth = await getAuthHeader()
            if (auth) {
                fetch(`/api/projects/${projectId}/threads/${remoteId}`, {
                    method: 'DELETE',
                    headers: { Authorization: auth },
                }).catch(() => {})
            }
            // Notify other browsers via WebSocket
            canvasSync.sendChatThreadDelete(remoteId)
        },

        async fetch(threadId: string): Promise<RemoteThreadMetadata> {
            const threads = loadThreadsCache(projectId)
            const thread = threads.find((t) => t.remoteId === threadId)
            if (!thread) throw new Error('Thread not found')
            return {
                remoteId: thread.remoteId,
                status: thread.status,
                title: thread.title,
            }
        },

        async generateTitle(
            remoteId: string,
            messages: readonly { content: readonly { type: string; text?: string }[] }[],
        ): Promise<AssistantStream> {
            const title = extractTitleFromMessages(messages)

            const threads = loadThreadsCache(projectId)
            const thread = threads.find((t) => t.remoteId === remoteId)
            if (thread) {
                thread.title = title
                saveThreadsCache(projectId, threads)
                scheduleThreadSync(projectId, remoteId, 'update', { title })
                canvasSync.sendChatThreadRename(remoteId, title)
            }

            return createAssistantStream((controller) => {
                controller.appendText(title)
            })
        },
    }
}
