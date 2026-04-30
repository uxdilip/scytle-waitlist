import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ScytleNode } from '@/types/canvas'

// ============================================================
// AI Generation Lifecycle Store (v3)
// ============================================================
//
// v3 changes:
//   - Overlapping animations: next item starts after stagger,
//     not after previous animation completes (much faster cascade)
//   - Removed wrapper div approach — reveal state is applied as
//     data-gen-state attribute directly on node root elements
//   - Structural frames: 0ms, Leaf nodes: 50ms stagger, 280ms animation
// ============================================================

/** Stale-lock safety timeout (ms) — auto-unlock if stuck */
const STALE_LOCK_TIMEOUT_MS = 60_000

/** Stagger delay between leaf node reveals (ms) — overlapping, not sequential */
export const REVEAL_STAGGER_MS = 50

/** Duration of the reveal animation for leaf nodes (ms) — matches CSS */
export const REVEAL_ANIMATION_MS = 280

/** Reveal state for each node */
export type RevealState = 'hidden' | 'revealing' | 'revealed'

/** A queued node waiting to be revealed on canvas */
export interface RevealQueueItem {
    id: string
    nodeId: string
    /** Whether this is a structural frame (instant reveal) vs leaf (animated) */
    isStructural: boolean
    queuedAt: number
}

interface GenerationState {
    // ── Core lock signals ─────────────────────────────────────
    isThreadRunning: boolean
    pendingApplyCount: number
    pendingRevealCount: number

    // ── Derived lock ──────────────────────────────────────────
    isLocked: boolean

    // ── Active generating frame ────────────────────────────────
    activeGeneratingFrameId: string | null

    // ── Reveal queue ──────────────────────────────────────────
    revealQueue: RevealQueueItem[]
    /** Map of nodeId → reveal state */
    nodeRevealStates: Map<string, RevealState>

    // ── Stale lock timer ──────────────────────────────────────
    _staleLockTimer: ReturnType<typeof setTimeout> | null

    // ── Actions ───────────────────────────────────────────────
    setThreadRunning: (running: boolean) => void
    incrementPendingApply: () => void
    decrementPendingApply: () => void
    enqueueRevealBatch: (items: Array<Omit<RevealQueueItem, 'queuedAt'>>) => void
    markRevealing: (nodeId: string) => void
    markRevealed: (nodeId: string) => void
    reset: () => void
    setActiveGeneratingFrameId: (id: string | null) => void
    /** Get reveal state for a node — returns undefined if not tracked */
    getNodeRevealState: (nodeId: string) => RevealState | undefined
}

function computeIsLocked(
    isThreadRunning: boolean,
    pendingApplyCount: number,
    pendingRevealCount: number,
): boolean {
    return isThreadRunning || pendingApplyCount > 0 || pendingRevealCount > 0
}

// ============================================================
// Tree walking — collect nodes in reveal order (depth-first)
// ============================================================

function isStructuralFrame(node: ScytleNode): boolean {
    if (node.type !== 'frame') return false
    if (!('children' in node) || node.children.length === 0) return false
    return true
}

/**
 * Walk a node tree depth-first and collect all node IDs in reveal order.
 * Parent frames before their children so layout is established first.
 */
export function collectRevealOrder(node: ScytleNode): Array<Omit<RevealQueueItem, 'queuedAt'>> {
    const items: Array<Omit<RevealQueueItem, 'queuedAt'>> = []
    const structural = isStructuralFrame(node)

    items.push({
        id: `reveal-${node.id}-${Date.now()}`,
        nodeId: node.id,
        isStructural: structural,
    })

    if (node.type === 'frame' && 'children' in node) {
        for (const child of node.children) {
            items.push(...collectRevealOrder(child))
        }
    }

    return items
}

// ============================================================
// Store
// ============================================================

export const useGenerationStore = create<GenerationState>()(
    devtools(
        (set, get) => ({
            isThreadRunning: false,
            pendingApplyCount: 0,
            pendingRevealCount: 0,
            isLocked: false,
            activeGeneratingFrameId: null,
            revealQueue: [],
            nodeRevealStates: new Map<string, RevealState>(),
            _staleLockTimer: null,

            setThreadRunning: (running) => {
                set((state) => {
                    const newLocked = computeIsLocked(running, state.pendingApplyCount, state.pendingRevealCount)
                    return {
                        isThreadRunning: running,
                        isLocked: newLocked,
                        activeGeneratingFrameId: !running && state.pendingApplyCount === 0 && state.pendingRevealCount === 0
                            ? null
                            : state.activeGeneratingFrameId,
                    }
                }, false, 'setThreadRunning')
                _resetStaleLockTimer()
            },

            incrementPendingApply: () => {
                set((state) => ({
                    pendingApplyCount: state.pendingApplyCount + 1,
                    isLocked: computeIsLocked(state.isThreadRunning, state.pendingApplyCount + 1, state.pendingRevealCount),
                }), false, 'incrementPendingApply')
                _resetStaleLockTimer()
            },

            decrementPendingApply: () => {
                set((state) => {
                    const newCount = Math.max(0, state.pendingApplyCount - 1)
                    return {
                        pendingApplyCount: newCount,
                        isLocked: computeIsLocked(state.isThreadRunning, newCount, state.pendingRevealCount),
                    }
                }, false, 'decrementPendingApply')
                _resetStaleLockTimer()
            },

            enqueueRevealBatch: (items) => {
                if (items.length === 0) return
                set((state) => {
                    const now = Date.now()
                    const newItems = items.map(item => ({ ...item, queuedAt: now }))
                    const newQueue = [...state.revealQueue, ...newItems]
                    const newPendingReveal = state.pendingRevealCount + items.length
                    // Set initial state for all nodes as 'hidden'
                    const newStates = new Map(state.nodeRevealStates)
                    for (const item of items) {
                        newStates.set(item.nodeId, 'hidden')
                    }
                    return {
                        revealQueue: newQueue,
                        pendingRevealCount: newPendingReveal,
                        nodeRevealStates: newStates,
                        isLocked: computeIsLocked(state.isThreadRunning, state.pendingApplyCount, newPendingReveal),
                    }
                }, false, 'enqueueRevealBatch')
                _resetStaleLockTimer()
                _drainRevealQueue()
            },

            markRevealing: (nodeId) => {
                set((state) => {
                    const newStates = new Map(state.nodeRevealStates)
                    newStates.set(nodeId, 'revealing')
                    return { nodeRevealStates: newStates }
                }, false, 'markRevealing')
            },

            markRevealed: (nodeId) => {
                set((state) => {
                    const newStates = new Map(state.nodeRevealStates)
                    newStates.set(nodeId, 'revealed')
                    const newQueue = state.revealQueue.filter(item => item.nodeId !== nodeId)
                    const newPendingReveal = Math.max(0, state.pendingRevealCount - 1)
                    const newLocked = computeIsLocked(state.isThreadRunning, state.pendingApplyCount, newPendingReveal)
                    return {
                        nodeRevealStates: newStates,
                        revealQueue: newQueue,
                        pendingRevealCount: newPendingReveal,
                        isLocked: newLocked,
                        activeGeneratingFrameId: !newLocked ? null : state.activeGeneratingFrameId,
                    }
                }, false, 'markRevealed')
            },

            reset: () => {
                const { _staleLockTimer } = get()
                if (_staleLockTimer) clearTimeout(_staleLockTimer)
                set({
                    isThreadRunning: false,
                    pendingApplyCount: 0,
                    pendingRevealCount: 0,
                    isLocked: false,
                    activeGeneratingFrameId: null,
                    revealQueue: [],
                    nodeRevealStates: new Map<string, RevealState>(),
                    _staleLockTimer: null,
                }, false, 'reset')
            },

            setActiveGeneratingFrameId: (id) => {
                set({ activeGeneratingFrameId: id }, false, 'setActiveGeneratingFrameId')
            },

            getNodeRevealState: (nodeId) => {
                return get().nodeRevealStates.get(nodeId)
            },
        }),
        { name: 'GenerationStore' }
    )
)

// ============================================================
// Reveal queue drainer — overlapping animations (fast cascade)
// ============================================================
//
// Key difference from v2: We DON'T wait for animation to finish
// before starting the next. Items overlap:
//   t=0ms:   item1 starts animating (280ms duration)
//   t=50ms:  item2 starts animating
//   t=100ms: item3 starts animating
//   t=280ms: item1 finishes → mark revealed
//   ...
// This creates a fast, fluid cascade instead of slow sequential reveals.

let _drainScheduled = false

function _drainRevealQueue() {
    if (_drainScheduled) return
    _drainScheduled = true

    const processNext = () => {
        const state = useGenerationStore.getState()
        // Find the first queued item that hasn't started revealing yet
        const nextItem = state.revealQueue.find(
            item => state.nodeRevealStates.get(item.nodeId) === 'hidden'
        )

        if (!nextItem) {
            _drainScheduled = false
            return
        }

        // Start revealing this node
        useGenerationStore.getState().markRevealing(nextItem.nodeId)

        if (nextItem.isStructural) {
            // Structural frames: instant reveal, then immediately process next
            requestAnimationFrame(() => {
                useGenerationStore.getState().markRevealed(nextItem.nodeId)
                processNext()
            })
        } else {
            // Schedule this node's "revealed" callback after animation duration
            setTimeout(() => {
                useGenerationStore.getState().markRevealed(nextItem.nodeId)
            }, REVEAL_ANIMATION_MS)

            // Start next item after stagger delay (OVERLAPPING with current animation)
            setTimeout(processNext, REVEAL_STAGGER_MS)
        }
    }

    requestAnimationFrame(processNext)
}

// ============================================================
// Stale lock safety net
// ============================================================

function _resetStaleLockTimer() {
    const state = useGenerationStore.getState()
    if (state._staleLockTimer) {
        clearTimeout(state._staleLockTimer)
    }

    if (!state.isLocked) return

    const timer = setTimeout(() => {
        const current = useGenerationStore.getState()
        if (current.isLocked) {
            console.warn('[GenerationStore] Stale lock detected — auto-resetting after', STALE_LOCK_TIMEOUT_MS, 'ms')
            current.reset()
        }
    }, STALE_LOCK_TIMEOUT_MS)

    useGenerationStore.setState({ _staleLockTimer: timer }, false)
}
