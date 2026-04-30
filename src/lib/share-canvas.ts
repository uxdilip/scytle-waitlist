import 'server-only'

import { Storage, type Client } from 'node-appwrite'
import type { ScytleNode } from '@/types/canvas'

const BUCKET_ID = 'exports'
const DEFAULT_CANVAS_COLOR = '#F5F5F5'
const SYNC_SECRET_HEADER = 'x-sync-internal-secret'

const canvasFileId = (projectId: string) => `canvas_${projectId.replace(/[^a-zA-Z0-9._-]/g, '_')}`

export interface SharedEditorPageData {
    id: string
    name: string
    nodes: ScytleNode[]
    canvasColor: string
    zoom: number
    panX: number
    panY: number
}

export interface SharedCanvasData {
    pages: SharedEditorPageData[]
    activePageId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSyncHttpBaseUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim()
    if (!trimmed) return ''

    if (trimmed.startsWith('wss://')) {
        return `https://${trimmed.slice('wss://'.length)}`.replace(/\/$/, '')
    }

    if (trimmed.startsWith('ws://')) {
        return `http://${trimmed.slice('ws://'.length)}`.replace(/\/$/, '')
    }

    return trimmed.replace(/\/$/, '')
}

function parseFromJsonString(value: string): unknown {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

function parseUnknown(value: unknown): unknown {
    if (typeof value === 'string') {
        return parseFromJsonString(value)
    }

    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        const text = new TextDecoder().decode(value)
        return parseFromJsonString(text)
    }

    if (isRecord(value) || Array.isArray(value)) {
        return value
    }

    return null
}

function normalizeCanvasData(value: unknown): SharedCanvasData | null {
    const parsed = parseUnknown(value)
    if (!isRecord(parsed)) return null

    const maybePages = parsed.pages
    if (Array.isArray(maybePages)) {
        const pages: SharedEditorPageData[] = maybePages.map((rawPage, index) => {
            const page = isRecord(rawPage) ? rawPage : {}
            return {
                id: typeof page.id === 'string' ? page.id : `page-${index + 1}`,
                name: typeof page.name === 'string' ? page.name : `Page ${index + 1}`,
                nodes: Array.isArray(page.nodes) ? (page.nodes as ScytleNode[]) : [],
                canvasColor: typeof page.canvasColor === 'string' ? page.canvasColor : DEFAULT_CANVAS_COLOR,
                zoom: typeof page.zoom === 'number' ? page.zoom : 1,
                panX: typeof page.panX === 'number' ? page.panX : 0,
                panY: typeof page.panY === 'number' ? page.panY : 0,
            }
        })

        const activePageId = typeof parsed.activePageId === 'string' && pages.some((p) => p.id === parsed.activePageId)
            ? parsed.activePageId
            : pages[0]?.id ?? ''

        return {
            pages,
            activePageId,
        }
    }

    // Legacy single-canvas format
    if (Array.isArray(parsed.nodes)) {
        const pageId = typeof parsed.activePageId === 'string' ? parsed.activePageId : 'page-1'
        return {
            pages: [
                {
                    id: pageId,
                    name: 'Page 1',
                    nodes: parsed.nodes as ScytleNode[],
                    canvasColor: typeof parsed.canvasColor === 'string' ? parsed.canvasColor : DEFAULT_CANVAS_COLOR,
                    zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1,
                    panX: typeof parsed.panX === 'number' ? parsed.panX : 0,
                    panY: typeof parsed.panY === 'number' ? parsed.panY : 0,
                },
            ],
            activePageId: pageId,
        }
    }

    return null
}

async function loadCanvasFromSync(projectId: string): Promise<SharedCanvasData | null> {
    const rawBaseUrl = process.env.SCYTLE_SYNC_HTTP_URL || process.env.NEXT_PUBLIC_SYNC_URL || ''
    const internalSecret = process.env.SYNC_INTERNAL_SECRET || ''

    if (!rawBaseUrl) {
        return null
    }

    const baseUrl = toSyncHttpBaseUrl(rawBaseUrl)
    if (!baseUrl) return null
    const isLocalSync =
        baseUrl.startsWith('http://localhost:') ||
        baseUrl === 'http://localhost' ||
        baseUrl.startsWith('http://127.0.0.1:') ||
        baseUrl === 'http://127.0.0.1'

    if (!internalSecret && !isLocalSync) {
        return null
    }

    const url = `${baseUrl}/snapshot/${encodeURIComponent(projectId)}`

    const headers: Record<string, string> = {}
    if (internalSecret) {
        headers[SYNC_SECRET_HEADER] = internalSecret
    }

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            console.warn(`⚠️ Share: sync snapshot request failed (${res.status})`)
            return null
        }

        const payload = (await res.json()) as unknown
        if (isRecord(payload) && 'state' in payload) {
            return normalizeCanvasData(payload.state)
        }

        return normalizeCanvasData(payload)
    } catch (error) {
        console.warn('⚠️ Share: failed to load sync snapshot', error)
        return null
    }
}

async function loadCanvasFromStorage(client: Client, projectId: string): Promise<SharedCanvasData | null> {
    try {
        const storage = new Storage(client)
        const fileData = await storage.getFileDownload(BUCKET_ID, canvasFileId(projectId))
        return normalizeCanvasData(fileData)
    } catch {
        return null
    }
}

function loadCanvasFromProjectDoc(projectDoc: Record<string, unknown>): SharedCanvasData | null {
    if (!('canvasData' in projectDoc)) return null
    return normalizeCanvasData(projectDoc.canvasData)
}

export async function resolveSharedCanvasData(
    projectId: string,
    client: Client,
    projectDoc?: Record<string, unknown>
): Promise<SharedCanvasData | null> {
    const syncData = await loadCanvasFromSync(projectId)
    if (syncData) return syncData

    const storageData = await loadCanvasFromStorage(client, projectId)
    if (storageData) return storageData

    if (projectDoc) {
        return loadCanvasFromProjectDoc(projectDoc)
    }

    return null
}
