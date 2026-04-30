// ============================================================
// Scytle Sync — WebSocket Client
// ============================================================
//
// Manages the WebSocket connection to the Cloudflare Durable Object
// sync server. Handles connect, reconnect, sending deltas, and
// applying incoming changes to the Zustand store.
// ============================================================

import type { ScytleNode } from '@/types/canvas'

// ============================================================
// Types (mirrors scytle-sync/src/types.ts)
// ============================================================

interface SyncPage {
  id: string
  name: string
  canvasColor: string
  zoom: number
  panX: number
  panY: number
}

interface SyncNode {
  id: string
  [key: string]: unknown
}

type ClientMessage =
  | { type: 'join'; projectId: string; token: string }
  | { type: 'update'; nodeId: string; changes: Record<string, unknown> }
  | { type: 'add'; node: SyncNode; pageId: string }
  | { type: 'delete'; nodeId: string; pageId: string }
  | { type: 'reorder'; pageId: string; nodeIds: string[] }
  | { type: 'page:add'; page: SyncPage }
  | { type: 'page:delete'; pageId: string }
  | { type: 'page:rename'; pageId: string; name: string }
  | { type: 'page:update'; pageId: string; changes: Partial<SyncPage> }
  | { type: 'page:reorder'; pageIds: string[] }
  | { type: 'page:switch'; pageId: string }
  // Chat thread sync
  | { type: 'chat:thread:create'; thread: { remoteId: string; status: string; title?: string } }
  | { type: 'chat:thread:delete'; threadId: string }
  | { type: 'chat:thread:rename'; threadId: string; title: string }
  | { type: 'chat:thread:archive'; threadId: string; status: 'regular' | 'archived' }

interface InitState {
  pages: Array<SyncPage & { nodes: SyncNode[] }>
  activePageId: string
}

type ServerMessage =
  | { type: 'init'; state: InitState }
  | { type: 'update'; nodeId: string; changes: Record<string, unknown>; userId: string }
  | { type: 'add'; node: SyncNode; pageId: string; userId: string }
  | { type: 'delete'; nodeId: string; pageId: string; userId: string }
  | { type: 'reorder'; pageId: string; nodeIds: string[]; userId: string }
  | { type: 'page:add'; page: SyncPage; userId: string }
  | { type: 'page:delete'; pageId: string; userId: string }
  | { type: 'page:rename'; pageId: string; name: string; userId: string }
  | { type: 'page:update'; pageId: string; changes: Partial<SyncPage>; userId: string }
  | { type: 'page:reorder'; pageIds: string[]; userId: string }
  | { type: 'presence'; users: Array<{ userId: string; pageId: string }> }
  | { type: 'error'; message: string }
  // Chat thread sync
  | { type: 'chat:thread:create'; thread: { remoteId: string; status: string; title?: string }; userId: string }
  | { type: 'chat:thread:delete'; threadId: string; userId: string }
  | { type: 'chat:thread:rename'; threadId: string; title: string; userId: string }
  | { type: 'chat:thread:archive'; threadId: string; status: 'regular' | 'archived'; userId: string }

// ============================================================
// Sync URL
// ============================================================

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL || 'ws://localhost:8787'

// ============================================================
// CanvasSync — singleton WebSocket manager
// ============================================================

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'
type StatusListener = (status: ConnectionStatus) => void
type TokenProvider = () => Promise<string | null>

class CanvasSync {
  private ws: WebSocket | null = null
  private projectId: string | null = null
  private token: string | null = null
  private tokenProvider: TokenProvider | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private maxReconnectDelay = 30_000 // 30s max backoff
  private intentionalClose = false
  private _status: ConnectionStatus = 'disconnected'
  private statusListeners: Set<StatusListener> = new Set()
  private pendingMessages: ClientMessage[] = [] // Queue for messages sent before connected

  // Batch incoming updates to avoid "Maximum update depth exceeded"
  private pendingUpdates: Map<string, Record<string, unknown>> = new Map()
  private updateRafId: ReturnType<typeof requestAnimationFrame> | null = null

  // Chat sync listeners — notified when another browser sends chat events
  private chatListeners: Set<(msg: ServerMessage) => void> = new Set()

  /**
   * Flag to suppress outgoing sync messages.
   * Set to true when applying remote changes to the store so the
   * store's mutation callbacks don't echo the change back to the server.
   */
  _applyingRemote = false

  // Store reference — set after store is created
  private getStore: (() => {
    pages: Array<{ id: string; name: string; nodes: ScytleNode[]; canvasColor: string; zoom: number; panX: number; panY: number }>
    activePageId: string
    nodes: ScytleNode[]
    canvasColor: string
    zoom: number
    panX: number
    panY: number
    hasEverHadNodes: boolean
  }) | null = null

  private setState: ((fn: (draft: Record<string, unknown>) => void, replace?: boolean, action?: string) => void) | null = null

  // ── Public API ──────────────────────────────────────────────

  get status(): ConnectionStatus {
    return this._status
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  private setStatus(s: ConnectionStatus) {
    this._status = s
    for (const fn of this.statusListeners) fn(s)
  }

  /**
   * Bind the Zustand store so sync can read/write state.
   * Called once at store creation time.
   */
  bindStore(
    getState: typeof this.getStore,
    setState: typeof this.setState
  ) {
    this.getStore = getState
    this.setState = setState
  }

  /**
   * Connect to the sync server for a given project.
   */
  connect(projectId: string, token: string, tokenProvider?: TokenProvider): void {
    // Already connected to this project
    if (this.projectId === projectId && this.ws?.readyState === WebSocket.OPEN) return

    // Disconnect from previous project if any
    this.disconnect()

    this.projectId = projectId
    this.token = token
    this.tokenProvider = tokenProvider ?? null
    this.intentionalClose = false
    this.reconnectAttempt = 0

    void this.openSocket()
  }

  /**
   * Disconnect from the sync server.
   */
  disconnect(): void {
    this.intentionalClose = true
    this.projectId = null
    this.token = null
    this.tokenProvider = null
    this.pendingMessages = []
    this.pendingUpdates.clear()
    if (this.updateRafId) {
      cancelAnimationFrame(this.updateRafId)
      this.updateRafId = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.setStatus('disconnected')
  }

  // ── Send messages to server ─────────────────────────────────

  sendUpdate(nodeId: string, changes: Record<string, unknown>): void {
    this.send({ type: 'update', nodeId, changes })
  }

  sendAdd(node: ScytleNode, pageId: string): void {
    this.send({ type: 'add', node: node as unknown as SyncNode, pageId })
  }

  sendDelete(nodeId: string, pageId: string): void {
    this.send({ type: 'delete', nodeId, pageId })
  }

  sendReorder(pageId: string, nodeIds: string[]): void {
    this.send({ type: 'reorder', pageId, nodeIds })
  }

  sendPageAdd(page: SyncPage): void {
    this.send({ type: 'page:add', page })
  }

  sendPageDelete(pageId: string): void {
    this.send({ type: 'page:delete', pageId })
  }

  sendPageRename(pageId: string, name: string): void {
    this.send({ type: 'page:rename', pageId, name })
  }

  sendPageUpdate(pageId: string, changes: Partial<SyncPage>): void {
    this.send({ type: 'page:update', pageId, changes })
  }

  sendPageReorder(pageIds: string[]): void {
    this.send({ type: 'page:reorder', pageIds })
  }

  sendPageSwitch(pageId: string): void {
    this.send({ type: 'page:switch', pageId })
  }

  // ── Chat sync methods ──────────────────────────────────────

  sendChatThreadCreate(thread: { remoteId: string; status: string; title?: string }): void {
    this.send({ type: 'chat:thread:create', thread })
  }

  sendChatThreadDelete(threadId: string): void {
    this.send({ type: 'chat:thread:delete', threadId })
  }

  sendChatThreadRename(threadId: string, title: string): void {
    this.send({ type: 'chat:thread:rename', threadId, title })
  }

  sendChatThreadArchive(threadId: string, status: 'regular' | 'archived'): void {
    this.send({ type: 'chat:thread:archive', threadId, status })
  }

  /**
   * Register a listener for chat events from other browsers.
   * Returns an unsubscribe function.
   */
  onChatMessage(fn: (msg: ServerMessage) => void): () => void {
    this.chatListeners.add(fn)
    return () => this.chatListeners.delete(fn)
  }

  // ── Internal: WebSocket lifecycle ───────────────────────────

  private async openSocket(): Promise<void> {
    if (!this.projectId) return

    if (this.tokenProvider) {
      try {
        const freshToken = await this.tokenProvider()
        if (freshToken) {
          this.token = freshToken
        } else {
          console.warn('🔄 Sync: token refresh returned empty; using previous token if available')
        }
      } catch (err) {
        console.warn('🔄 Sync: token refresh failed; using previous token if available', err)
      }
    }

    if (!this.token) {
      console.warn('🔄 Sync: no auth token available; skipping connection attempt')
      this.setStatus('disconnected')
      return
    }

    this.setStatus('connecting')

    const url = `${SYNC_URL}/room/${this.projectId}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      // Don't set 'connected' yet — wait for server to confirm auth via 'init' message
      this.reconnectAttempt = 0

      // Send join message with auth
      this.send({
        type: 'join',
        projectId: this.projectId!,
        token: this.token!,
      })
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string)
        this.onMessage(msg)
      } catch (err) {
        console.error('🔄 Sync: invalid message', err)
      }
    }

    this.ws.onclose = (event) => {
      this.ws = null
      this.setStatus('disconnected')

      if (!this.intentionalClose) {
        if (event.code === 4001) {
          console.warn('🔄 Sync: authentication rejected (4001), attempting token refresh + reconnect...')
        } else {
          console.warn(`🔄 Sync: connection closed (code ${event.code}), reconnecting...`)
        }
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after this, which handles reconnect
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.projectId) return

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap)
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay
    )
    this.reconnectAttempt++

    console.log(`🔄 Sync: reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openSocket()
    }, delay)
  }

  private send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue non-join messages for when we connect
      if (msg.type !== 'join') {
        this.pendingMessages.push(msg)
      }
      return
    }
    if (msg.type !== 'join' && this._status !== 'connected') {
      // Queue messages sent between ws.open and init received
      this.pendingMessages.push(msg)
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  /** Flush any messages that were queued before connection was ready */
  private flushPendingMessages(): void {
    if (this.pendingMessages.length === 0) return
    console.log(`🔄 Sync: flushing ${this.pendingMessages.length} queued messages`)
    const msgs = [...this.pendingMessages]
    this.pendingMessages = []
    for (const msg of msgs) {
      this.send(msg)
    }
  }

  // ── Handle incoming server messages ─────────────────────────

  private async onMessage(msg: ServerMessage): Promise<void> {
    if (!this.setState) {
      console.warn('🔄 Sync: store not bound yet, ignoring message')
      return
    }

    switch (msg.type) {
      case 'init':
        // Auth confirmed. Unlock send() so migration can push data to server.
        // But don't notify listeners yet — wait for init/migration to finish.
        this._status = 'connected'
        await this.applyInit(msg.state)
        // Flush any messages that were queued before connection was ready
        this.flushPendingMessages()
        // NOW notify listeners (triggers canvasLoaded in page.tsx)
        for (const fn of this.statusListeners) fn('connected')
        break
      case 'update':
        this.applyUpdate(msg.nodeId, msg.changes)
        break
      case 'add':
        this.applyAdd(msg.node, msg.pageId)
        break
      case 'delete':
        this.applyDelete(msg.nodeId, msg.pageId)
        break
      case 'reorder':
        this.applyReorder(msg.pageId, msg.nodeIds)
        break
      case 'page:add':
        this.applyPageAdd(msg.page)
        break
      case 'page:delete':
        this.applyPageDelete(msg.pageId)
        break
      case 'page:rename':
        this.applyPageRename(msg.pageId, msg.name)
        break
      case 'page:update':
        this.applyPageUpdate(msg.pageId, msg.changes)
        break
      case 'page:reorder':
        this.applyPageReorder(msg.pageIds)
        break
      case 'presence':
        // TODO: wire up presence UI
        break
      case 'chat:thread:create':
      case 'chat:thread:delete':
      case 'chat:thread:rename':
      case 'chat:thread:archive':
        for (const fn of this.chatListeners) fn(msg)
        break
      case 'error':
        if (msg.message.toLowerCase().includes('auth')) {
          console.error('🔄 Sync: auth error from server:', msg.message)
        } else {
          console.error('🔄 Sync: server error:', msg.message)
        }
        break
    }
  }

  // ── Apply remote changes to Zustand store ───────────────────

  private async applyInit(state: InitState): Promise<void> {
    // Server has pages — apply them directly (even if nodes are empty)
    if (state.pages.length > 0) {
      this._applyingRemote = true
      try {
        const pages = state.pages.map((p) => ({
          id: p.id,
          name: p.name,
          nodes: p.nodes as unknown as ScytleNode[],
          canvasColor: p.canvasColor,
          zoom: p.zoom,
          panX: p.panX,
          panY: p.panY,
        }))

        const activePageId = state.activePageId || pages[0]?.id || ''
        const activePage = pages.find((p) => p.id === activePageId) || pages[0]

        this.setState!((draft: Record<string, unknown>) => {
          draft.pages = pages
          draft.activePageId = activePage?.id || ''
          draft.nodes = [...(activePage?.nodes || [])]
          draft.canvasColor = activePage?.canvasColor || '#F5F5F5'
          
          const initialView = this.computeInitialView(
            activePage?.nodes as ScytleNode[], 
            activePage?.zoom || 1, 
            activePage?.panX || 0, 
            activePage?.panY || 0
          )
          
          draft.zoom = initialView.zoom
          draft.panX = initialView.panX
          draft.panY = initialView.panY
          draft.hasEverHadNodes = pages.some((p) => p.nodes.length > 0)
          draft.selectedIds = []
          draft.hoveredId = null
          draft.enteredFrameId = null
          draft.editingNodeId = null
          draft._past = []
          draft._future = []
          draft._batchDepth = 0
        }, false, 'sync:init')
      } finally {
        this._applyingRemote = false
      }
      return
    }

    // Server has NO pages — try migration from old system, then create default
    if (this.projectId) {
      console.log('🔄 Sync: DO is empty, attempting migration from old system...')
      await this.migrateFromOldSystem()

      // Check if migration actually populated the store
      const store = this.getStore?.()
      if (store && store.pages.length > 0 && store.activePageId) {
        return // Migration succeeded
      }
    }

    // No migration data — create a default page
    this.createDefaultPage()
  }

  /**
   * Create a default "Page 1" locally and on the server.
   * Called when a new project has zero pages.
   */
  private createDefaultPage(): void {
    const pageId = crypto.randomUUID()
    const page = {
      id: pageId,
      name: 'Page 1',
      canvasColor: '#F5F5F5',
      zoom: 1,
      panX: 0,
      panY: 0,
    }

    // Send to server first (so server has the page before any nodes arrive)
    this.sendPageAdd(page)

    // Apply locally
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        draft.pages = [{ ...page, nodes: [] }]
        draft.activePageId = pageId
        draft.nodes = []
        draft.canvasColor = '#F5F5F5'
        draft.zoom = 1
        draft.panX = 0
        draft.panY = 0
        draft.hasEverHadNodes = false
        draft.selectedIds = []
        draft.hoveredId = null
        draft.enteredFrameId = null
        draft.editingNodeId = null
        draft._past = []
        draft._future = []
        draft._batchDepth = 0
      }, false, 'sync:defaultPage')
    } finally {
      this._applyingRemote = false
    }

    console.log(`🔄 Sync: created default page ${pageId}`)
  }

  /**
   * Migration: Load data from the old system (localStorage or Appwrite)
   * and push it to the DO so future loads come from the sync server.
   */
  private async migrateFromOldSystem(): Promise<void> {
    if (!this.projectId) return

    // Try localStorage first
    let loaded: Record<string, unknown> | null = null
    try {
      const raw = localStorage.getItem(`scytle-editor-${this.projectId}`)
      if (raw) loaded = JSON.parse(raw)
    } catch { /* ignore */ }

    // If nothing in localStorage, try fetching directly from Appwrite Storage
    if (!loaded) {
      try {
        const { storage, BUCKETS } = await import('@/lib/appwrite')
        const fileId = `canvas_${this.projectId}`
        const result = storage.getFileDownload(BUCKETS.EXPORTS, fileId)
        const res = await fetch(result.toString())
        if (res.ok) {
          const text = await res.text()
          if (text) loaded = JSON.parse(text)
        }
      } catch {
        // File may not exist — that's fine
        console.log('🔄 Sync: no Appwrite Storage data found (expected for new projects)')
      }
    }

    if (!loaded) {
      console.log('🔄 Sync: no old data to migrate')
      return
    }

    // Parse old format (pages array or single-canvas)
    interface OldPage {
      id: string
      name: string
      nodes: ScytleNode[]
      canvasColor: string
      zoom: number
      panX: number
      panY: number
    }

    let pages: OldPage[]
    if (loaded.pages && Array.isArray(loaded.pages)) {
      pages = loaded.pages as OldPage[]
    } else {
      // Old single-canvas format
      pages = [{
        id: crypto.randomUUID(),
        name: 'Page 1',
        nodes: (loaded.nodes as ScytleNode[]) || [],
        canvasColor: (loaded.canvasColor as string) || '#F5F5F5',
        zoom: (loaded.zoom as number) || 1,
        panX: (loaded.panX as number) || 0,
        panY: (loaded.panY as number) || 0,
      }]
    }

    console.log(`🔄 Sync: migrating ${pages.length} pages to DO...`)

    // Push each page + its nodes to the DO
    for (const page of pages) {
      this.sendPageAdd({
        id: page.id,
        name: page.name,
        canvasColor: page.canvasColor,
        zoom: page.zoom,
        panX: page.panX,
        panY: page.panY,
      })

      for (const node of page.nodes) {
        this.sendAdd(node, page.id)
      }
    }

    // Apply to local store too
    this._applyingRemote = true
    try {
      const activePage = pages[0]
      this.setState!((draft: Record<string, unknown>) => {
        draft.pages = pages
        draft.activePageId = activePage?.id || ''
        draft.nodes = [...(activePage?.nodes || [])]
        draft.canvasColor = activePage?.canvasColor || '#F5F5F5'
        
        const initialView = this.computeInitialView(
          activePage?.nodes, 
          activePage?.zoom || 1, 
          activePage?.panX || 0, 
          activePage?.panY || 0
        )
        
        draft.zoom = initialView.zoom
        draft.panX = initialView.panX
        draft.panY = initialView.panY
        draft.hasEverHadNodes = pages.some((p) => p.nodes.length > 0)
        draft.selectedIds = []
        draft.hoveredId = null
        draft.enteredFrameId = null
        draft.editingNodeId = null
        draft._past = []
        draft._future = []
        draft._batchDepth = 0
      }, false, 'sync:migrate')
    } finally {
      this._applyingRemote = false
    }

    console.log('🔄 Sync: migration complete!')
  }

  /**
   * Queue an update and flush all pending updates in one setState on the next frame.
   * This coalesces rapid-fire updates (e.g., drag operations) to avoid
   * "Maximum update depth exceeded" in React.
   */
  private applyUpdate(nodeId: string, changes: Record<string, unknown>): void {
    // Merge changes for the same node
    const existing = this.pendingUpdates.get(nodeId)
    if (existing) {
      Object.assign(existing, changes)
    } else {
      this.pendingUpdates.set(nodeId, { ...changes })
    }

    // Schedule a single flush
    if (!this.updateRafId) {
      this.updateRafId = requestAnimationFrame(() => {
        this.flushPendingUpdates()
      })
    }
  }

  /** Apply all batched node updates in one setState call */
  private flushPendingUpdates(): void {
    this.updateRafId = null
    if (this.pendingUpdates.size === 0) return

    const batch = new Map(this.pendingUpdates)
    this.pendingUpdates.clear()

    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const activePageId = draft.activePageId as string
        const pages = draft.pages as Array<{ id: string; nodes: ScytleNode[] }>
        const nodes = draft.nodes as ScytleNode[]

        for (const [nodeId, changes] of batch) {
          // Update in pages array (source of truth)
          let updatedActivePage = false
          for (const page of pages) {
            const pNode = this.findNodeDeep(page.nodes, nodeId)
            if (pNode) {
              Object.assign(pNode, changes)
              if (page.id === activePageId) updatedActivePage = true
              break
            }
          }

          // If the node is on the active page, also update the flat nodes array
          if (updatedActivePage) {
            const node = this.findNodeDeep(nodes, nodeId)
            if (node) {
              Object.assign(node, changes)
            }
          }
        }
      }, false, 'sync:update')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyAdd(node: SyncNode, pageId: string): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; nodes: ScytleNode[] }>
        const page = pages.find((p) => p.id === pageId)
        const nodeId = (node as unknown as ScytleNode).id
        if (page && !page.nodes.some((n) => n.id === nodeId)) {
          page.nodes.push(node as unknown as ScytleNode)
        }
        // If it's the active page, also update the flat nodes array
        if (pageId === draft.activePageId) {
          const flatNodes = draft.nodes as ScytleNode[]
          if (!flatNodes.some((n) => n.id === nodeId)) {
            flatNodes.push(node as unknown as ScytleNode)
          }
        }
        draft.hasEverHadNodes = true
      }, false, 'sync:add')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyDelete(nodeId: string, pageId: string): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; nodes: ScytleNode[] }>
        const page = pages.find((p) => p.id === pageId)
        if (page) {
          page.nodes = page.nodes.filter((n) => n.id !== nodeId)
        }
        if (pageId === draft.activePageId) {
          draft.nodes = (draft.nodes as ScytleNode[]).filter((n) => n.id !== nodeId)
          // Also remove from selection
          draft.selectedIds = (draft.selectedIds as string[]).filter((id) => id !== nodeId)
        }
      }, false, 'sync:delete')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyReorder(pageId: string, nodeIds: string[]): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; nodes: ScytleNode[] }>
        const page = pages.find((p) => p.id === pageId)
        if (page) {
          const nodeMap = new Map(page.nodes.map((n) => [n.id, n]))
          page.nodes = nodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as ScytleNode[]
        }
        if (pageId === draft.activePageId) {
          const nodeMap = new Map((draft.nodes as ScytleNode[]).map((n) => [n.id, n]))
          draft.nodes = nodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as ScytleNode[]
        }
      }, false, 'sync:reorder')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyPageAdd(page: SyncPage): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; name: string; nodes: ScytleNode[]; canvasColor: string; zoom: number; panX: number; panY: number }>
        // Deduplicate: don't add if page already exists (e.g. from createDefaultPage)
        if (pages.some((p) => p.id === page.id)) return
        pages.push({
          id: page.id,
          name: page.name,
          nodes: [],
          canvasColor: page.canvasColor,
          zoom: page.zoom,
          panX: page.panX,
          panY: page.panY,
        })
      }, false, 'sync:page:add')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyPageDelete(pageId: string): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; nodes: ScytleNode[] }>
        const idx = pages.findIndex((p) => p.id === pageId)
        if (idx === -1) return

        pages.splice(idx, 1)

        // If we deleted the active page, switch to another
        if (draft.activePageId === pageId && pages.length > 0) {
          const newActive = pages[0]
          draft.activePageId = newActive.id
          draft.nodes = [...newActive.nodes]
          draft.canvasColor = (newActive as Record<string, unknown>).canvasColor
          draft.zoom = (newActive as Record<string, unknown>).zoom
          draft.panX = (newActive as Record<string, unknown>).panX
          draft.panY = (newActive as Record<string, unknown>).panY
          draft.selectedIds = []
        }
      }, false, 'sync:page:delete')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyPageRename(pageId: string, name: string): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string; name: string }>
        const page = pages.find((p) => p.id === pageId)
        if (page) page.name = name
      }, false, 'sync:page:rename')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyPageUpdate(pageId: string, changes: Partial<SyncPage>): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<Record<string, unknown>>
        const page = pages.find((p) => p.id === pageId)
        if (page) {
          Object.assign(page, changes)
        }
        // If active page, also update top-level fields
        if (pageId === draft.activePageId) {
          if (changes.canvasColor !== undefined) draft.canvasColor = changes.canvasColor
        }
      }, false, 'sync:page:update')
    } finally {
      this._applyingRemote = false
    }
  }

  private applyPageReorder(pageIds: string[]): void {
    this._applyingRemote = true
    try {
      this.setState!((draft: Record<string, unknown>) => {
        const pages = draft.pages as Array<{ id: string }>
        const pageMap = new Map(pages.map((p) => [p.id, p]))
        draft.pages = pageIds.map((id) => pageMap.get(id)).filter(Boolean)
      }, false, 'sync:page:reorder')
    } finally {
      this._applyingRemote = false
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  /** Deep search for a node by ID (handles nested frame children) */
  private findNodeDeep(nodes: ScytleNode[], id: string): ScytleNode | null {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.type === 'frame' && 'children' in node) {
        const found = this.findNodeDeep((node as { children: ScytleNode[] }).children, id)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Helper to compute the fit-to-screen zoom and pan on initial load.
   * This ensures that when a user reloads the canvas, they see the entire design
   * without it appearing glitched or "zoomed in very much".
   */
  private computeInitialView(nodes: ScytleNode[] | undefined, defaultZoom: number, defaultPanX: number, defaultPanY: number) {
    if (!nodes || nodes.length === 0 || typeof window === 'undefined') {
      return { zoom: defaultZoom || 1, panX: defaultPanX || 0, panY: defaultPanY || 0 }
    }

    const minX = Math.min(...nodes.map(n => n.x))
    const maxX = Math.max(...nodes.map(n => n.x + n.width))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxY = Math.max(...nodes.map(n => n.y + n.height))
    const contentW = maxX - minX
    const contentH = maxY - minY

    const viewportW = window.innerWidth - 520
    const viewportH = window.innerHeight - 48
    const padding = 80
    const zoomX = (viewportW - padding * 2) / contentW
    const zoomY = (viewportH - padding * 2) / contentH
    const fitZoom = Math.min(zoomX, zoomY, 1)

    const finalZoom = Math.max(0.05, fitZoom)
    const finalPanX = (viewportW / 2) - ((minX + contentW / 2) * finalZoom)
    const finalPanY = (viewportH / 2) - ((minY + contentH / 2) * finalZoom)

    return { zoom: finalZoom, panX: finalPanX, panY: finalPanY }
  }
}

// ── Singleton export ──────────────────────────────────────────

export const canvasSync = new CanvasSync()
