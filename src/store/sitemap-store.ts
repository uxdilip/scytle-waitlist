import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from '@xyflow/react'

export type CanvasTool = 'select' | 'hand' | 'add'

// Track if a save is already in progress to prevent concurrent saves
let isSaveInProgress = false
let pendingSave = false

// Immediate save function - saves right away, queues if another save is in progress
async function triggerSave() {
    if (isSaveInProgress) {
        pendingSave = true
        return
    }

    isSaveInProgress = true
    try {
        await useSitemapStore.getState().saveSitemap()
    } finally {
        isSaveInProgress = false
        // If another save was requested while we were saving, do it now
        if (pendingSave) {
            pendingSave = false
            triggerSave()
        }
    }
}

// Force immediate save (used before page unload)
export function flushPendingSave() {
    if (pendingSave || isSaveInProgress) {
        // Synchronous save attempt for beforeunload
        useSitemapStore.getState().saveSitemap()
    }
}

// Export edge type for components
export interface SitemapEdge {
    id: string
    source: string
    target: string
    sourceHandle: string | null
    targetHandle: string | null
    type: string
}

// Constants for layout spacing - Relume-style spacing
// Heights are measured from actual Tailwind rendering in page-node.tsx / draggable-section.tsx
const LAYOUT = {
    NODE_WIDTH: 280,
    NODE_HEADER_HEIGHT: 42,          // Header: py-2.5 (20px padding) + ~20px content + 1px border-b + 1px rounding
    SECTIONS_PADDING: 16,            // Sections container: p-2 = 8px top + 8px bottom
    SECTION_BASE_HEIGHT: 40,         // Section without description: 2px border + 20px padding + 18px name
    SECTION_DESC_LINE_HEIGHT: 16,    // Each line of description text (~12px font + 4px leading)
    SECTION_DESC_MT: 4,              // mt-1 = 4px margin-top for description
    SECTION_DESC_CHARS_PER_LINE: 34, // ~34 chars per line (280px - node padding - section padding at text-xs)
    SECTION_DESC_MAX_LINES: 3,       // line-clamp-3 limits to 3 lines max
    SECTION_GAP: 8,                  // space-y-2 = 0.5rem = 8px
    EMPTY_STATE_HEIGHT: 44,          // "Add Section" dashed button in empty state
    HORIZONTAL_GAP: 80,              // Gap between sibling nodes
    VERTICAL_GAP: 100,               // Gap between levels (generous, like Relume)
    PROJECT_HEIGHT: 50,
}

// Calculate estimated node height based on sections
const estimateNodeHeight = (node: Node): number => {
    if (node.type === 'project') return LAYOUT.PROJECT_HEIGHT
    const sections = (node.data as { sections?: (string | SectionData)[] })?.sections || []
    const sectionCount = sections.length

    if (sectionCount === 0) {
        // Header + padding + empty state add button
        return LAYOUT.NODE_HEADER_HEIGHT + LAYOUT.SECTIONS_PADDING + LAYOUT.EMPTY_STATE_HEIGHT
    }

    // Calculate per-section height based on description length
    let totalSectionHeight = 0
    sections.forEach(section => {
        let h = LAYOUT.SECTION_BASE_HEIGHT
        const isGlobal = typeof section === 'object'
            ? /^(navbar|footer|header|navigation)$/i.test(section.name)
            : /^(navbar|footer|header|navigation)$/i.test(section)
        const desc = !isGlobal && typeof section === 'object' ? section.description : undefined
        if (desc) {
            const lineCount = Math.min(
                LAYOUT.SECTION_DESC_MAX_LINES,
                Math.max(1, Math.ceil(desc.length / LAYOUT.SECTION_DESC_CHARS_PER_LINE))
            )
            h += LAYOUT.SECTION_DESC_MT + lineCount * LAYOUT.SECTION_DESC_LINE_HEIGHT
        }
        totalSectionHeight += h
    })
    const gapsHeight = (sectionCount - 1) * LAYOUT.SECTION_GAP

    return LAYOUT.NODE_HEADER_HEIGHT + LAYOUT.SECTIONS_PADDING + totalSectionHeight + gapsHeight
}

// Tree layout helper - calculates proper positions for sitemap hierarchy
// Uses parent-relative Y positioning (like Relume): each child is placed
// directly below its own parent (parentY + parentHeight + gap), so edges
// are compact and don't stretch unnecessarily.
const calculateTreeLayout = (
    nodes: Node[],
    edges: Edge[]
): Node[] => {
    if (nodes.length === 0) return nodes

    // Build adjacency map (parent -> children)
    const children: Record<string, string[]> = {}
    const nodeMap: Record<string, Node> = {}

    nodes.forEach(node => {
        nodeMap[node.id] = node
        children[node.id] = []
    })

    edges.forEach(edge => {
        if (children[edge.source]) {
            children[edge.source].push(edge.target)
        }
    })

    // Find root (node with no incoming edges)
    const targets = new Set(edges.map(e => e.target))
    const root = nodes.find(n => !targets.has(n.id)) || nodes[0]
    if (!root) return nodes

    // Step 1: Calculate subtree widths (bottom-up)
    const subtreeWidth: Record<string, number> = {}

    const calculateWidth = (nodeId: string): number => {
        const nodeChildren = children[nodeId] || []
        if (nodeChildren.length === 0) {
            subtreeWidth[nodeId] = LAYOUT.NODE_WIDTH
            return LAYOUT.NODE_WIDTH
        }

        const childWidths = nodeChildren.map(id => calculateWidth(id))
        const totalWidth = childWidths.reduce((sum, w) => sum + w, 0) +
            (nodeChildren.length - 1) * LAYOUT.HORIZONTAL_GAP
        subtreeWidth[nodeId] = Math.max(LAYOUT.NODE_WIDTH, totalWidth)
        return subtreeWidth[nodeId]
    }

    calculateWidth(root.id)

    // Step 2: Position nodes (top-down) using parent-relative Y
    // Each child's Y = its parent's Y + parent's actual height + VERTICAL_GAP
    const positions: Record<string, { x: number; y: number }> = {}

    const positionNode = (nodeId: string, centerX: number, y: number) => {
        const node = nodeMap[nodeId]
        if (!node) return

        // Position node so its center is at centerX
        positions[nodeId] = {
            x: centerX - LAYOUT.NODE_WIDTH / 2,
            y,
        }

        const nodeChildren = children[nodeId] || []
        if (nodeChildren.length === 0) return

        // Child Y = this node's Y + this node's height + gap
        const nodeHeight = estimateNodeHeight(node)
        const childY = y + nodeHeight + LAYOUT.VERTICAL_GAP

        // Calculate total width needed for all children
        const totalChildWidth = nodeChildren.reduce(
            (sum, id) => sum + subtreeWidth[id], 0
        ) + (nodeChildren.length - 1) * LAYOUT.HORIZONTAL_GAP

        // Start positioning from left, centered under parent
        let childCenterX = centerX - totalChildWidth / 2

        nodeChildren.forEach(childId => {
            const childSubtreeWidth = subtreeWidth[childId]
            // Position child at center of its subtree allocation
            positionNode(childId, childCenterX + childSubtreeWidth / 2, childY)
            childCenterX += childSubtreeWidth + LAYOUT.HORIZONTAL_GAP
        })
    }

    // Start layout from center of canvas
    positionNode(root.id, 600, 50)

    // Apply calculated positions to nodes
    return nodes.map(node => ({
        ...node,
        position: positions[node.id] || node.position,
    }))
}

interface SitemapState {
    // Nodes and edges
    nodes: Node[]
    edges: Edge[]

    // Canvas state
    activeTool: CanvasTool
    zoomLevel: number
    isPanning: boolean
    selectedNodeId: string | null

    // Section picker state
    sectionPickerOpen: boolean
    sectionPickerTargetPageId: string | null
    sectionPickerInsertIndex: number | null

    // Drag state for live shuffle preview (Relume-style)
    dragState: {
        isDragging: boolean
        dragNodeId: string | null
        parentId: string | null
        originalOrder: string[]
        previewOrder: string[]
    }

    // ReactFlow instance reference for zoom control
    reactFlowZoom: ((zoom: number) => void) | null
    reactFlowFitView: (() => void) | null

    // History for undo/redo
    history: { nodes: Node[]; edges: Edge[] }[]
    historyIndex: number

    // Actions
    setNodes: (nodes: Node[]) => void
    setEdges: (edges: Edge[]) => void
    onNodesChange: (changes: NodeChange[]) => void
    onEdgesChange: (changes: EdgeChange[]) => void

    setActiveTool: (tool: CanvasTool) => void
    setZoomLevel: (zoom: number) => void
    setIsPanning: (isPanning: boolean) => void
    setSelectedNodeId: (id: string | null) => void
    setReactFlowFunctions: (zoomFn: (zoom: number) => void, fitViewFn: () => void) => void

    addNode: (node: Node) => void
    updateNode: (id: string, data: Partial<Node['data']>) => void
    deleteNode: (id: string) => void

    addEdge: (edge: Edge) => void
    deleteEdge: (id: string) => void

    // Page-level actions (Relume-style + buttons)
    addSiblingPage: (nodeId: string, position: 'left' | 'right') => void
    addChildPage: (parentId: string) => void

    // Section actions
    openSectionPicker: (pageId: string, insertIndex: number) => void
    closeSectionPicker: () => void
    addSectionToPage: (pageId: string, section: SectionData, atIndex: number) => void
    removeSectionFromPage: (pageId: string, sectionIndex: number) => void
    moveSectionInPage: (pageId: string, fromIndex: number, toIndex: number) => void
    updateSectionInPage: (pageId: string, sectionIndex: number, updates: { name?: string; description?: string }) => void

    // Node drag constraint actions (Relume-style)
    handleNodeDragStart: (nodeId: string) => void
    handleNodeDrag: (nodeId: string) => void
    handleNodeDragStop: (nodeId: string) => void
    recalculateLayout: () => void

    undo: () => void
    redo: () => void
    saveToHistory: () => void

    fitView: () => void
    zoomIn: () => void
    zoomOut: () => void
    resetZoom: () => void

    // Load sitemap from AI
    loadSitemap: (pages: AIGeneratedPage[], projectName?: string) => void
    loadRawSitemap: (nodes: Node[], edges: SitemapEdge[]) => void
    clearSitemap: () => void

    // Backend sync
    currentProjectId: string | null
    setProjectId: (projectId: string | null) => void
    saveSitemap: () => Promise<void>
    isSaving: boolean
    lastSavedAt: Date | null
}

// AI-generated page structure - supports both legacy string[] and new object format
interface SectionData {
    id?: string
    name: string
    description?: string
}

interface AIGeneratedPage {
    id: string
    label: string
    slug: string
    sections?: (string | SectionData)[]
    children?: AIGeneratedPage[]
}

// Default demo sitemap - positions will be recalculated by layout
const defaultNodes: Node[] = [
    {
        id: 'project',
        type: 'project',
        position: { x: 500, y: 50 },
        data: { label: 'My Project' },
        draggable: false,
    },
    {
        id: 'home',
        type: 'page',
        position: { x: 500, y: 170 },
        data: {
            label: 'Home',
            slug: '/',
            sections: ['Hero', 'Features', 'Testimonials', 'CTA']
        },
    },
    {
        id: 'about',
        type: 'page',
        position: { x: 110, y: 420 },
        data: {
            label: 'About',
            slug: '/about',
            sections: ['Our Story', 'Team', 'Values']
        },
    },
    {
        id: 'services',
        type: 'page',
        position: { x: 370, y: 420 },
        data: {
            label: 'Services',
            slug: '/services',
            sections: ['Service List', 'Pricing', 'FAQ']
        },
    },
    {
        id: 'contact',
        type: 'page',
        position: { x: 630, y: 420 },
        data: {
            label: 'Contact',
            slug: '/contact',
            sections: ['Header', 'Contact Form', 'Map', 'Footer']
        },
    },
]

const defaultEdges: Edge[] = [
    { id: 'e-project-home', source: 'project', target: 'home', type: 'sitemap' },
    { id: 'e-home-about', source: 'home', target: 'about', type: 'sitemap' },
    { id: 'e-home-services', source: 'home', target: 'services', type: 'sitemap' },
    { id: 'e-home-contact', source: 'home', target: 'contact', type: 'sitemap' },
]

export const useSitemapStore = create<SitemapState>()(
    immer((set, get) => ({
        nodes: [],
        edges: [],
        activeTool: 'select',
        zoomLevel: 100,
        isPanning: false,
        selectedNodeId: null,
        sectionPickerOpen: false,
        sectionPickerTargetPageId: null,
        sectionPickerInsertIndex: null,
        dragState: {
            isDragging: false,
            dragNodeId: null,
            parentId: null,
            originalOrder: [],
            previewOrder: [],
        },
        reactFlowZoom: null,
        reactFlowFitView: null,
        history: [],
        historyIndex: -1,

        // Backend sync state
        currentProjectId: null,
        isSaving: false,
        lastSavedAt: null,

        setProjectId: (projectId) => set({ currentProjectId: projectId }),

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),

        onNodesChange: (changes) => {
            const hasRemovals = changes.some(c => c.type === 'remove')
            set((state) => {
                state.nodes = applyNodeChanges(changes, state.nodes) as Node[]
                if (hasRemovals) {
                    // Clean up edges for removed nodes
                    const nodeIds = new Set(state.nodes.map(n => n.id))
                    state.edges = state.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
                    // Recalculate layout so remaining nodes reflow
                    state.nodes = calculateTreeLayout(state.nodes, state.edges)
                }
            })
            if (hasRemovals) {
                get().saveToHistory()
            }
        },

        onEdgesChange: (changes) => {
            set((state) => {
                state.edges = applyEdgeChanges(changes, state.edges) as Edge[]
            })
        },

        setActiveTool: (tool) => set({ activeTool: tool }),
        setZoomLevel: (zoom) => set({ zoomLevel: Math.round(zoom) }),
        setIsPanning: (isPanning) => set({ isPanning }),
        setSelectedNodeId: (id) => set({ selectedNodeId: id }),
        setReactFlowFunctions: (zoomFn, fitViewFn) => set({ reactFlowZoom: zoomFn, reactFlowFitView: fitViewFn }),

        addNode: (node) => {
            set((state) => {
                state.nodes.push(node)
            })
            get().saveToHistory()
        },

        updateNode: (id, data) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === id)
                if (node) {
                    node.data = { ...node.data, ...data }
                }
            })
            // Recalculate layout after update (sections may have changed node height)
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
        },

        deleteNode: (id) => {
            set((state) => {
                state.nodes = state.nodes.filter(n => n.id !== id)
                state.edges = state.edges.filter(e => e.source !== id && e.target !== id)
            })
            // Recalculate layout after deletion
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
        },

        addEdge: (edge) => {
            set((state) => {
                state.edges.push(edge)
            })
            get().saveToHistory()
        },

        deleteEdge: (id) => {
            set((state) => {
                state.edges = state.edges.filter(e => e.id !== id)
            })
            get().saveToHistory()
        },

        // Page-level actions (Relume-style + buttons around nodes)
        addSiblingPage: (nodeId, position) => {
            const { edges } = get()
            // Find parent of this node
            const parentEdge = edges.find(e => e.target === nodeId)
            if (!parentEdge) return // Can't add sibling to root

            const parentId = parentEdge.source
            const newId = `page-${Date.now()}`

            set((state) => {
                // Create new page node
                state.nodes.push({
                    id: newId,
                    type: 'page',
                    position: { x: 0, y: 0 },
                    data: {
                        label: 'New Page',
                        slug: '/new-page',
                        sections: [],
                    },
                })

                // Insert edge at correct position relative to the sibling
                const siblingEdges = state.edges.filter(e => e.source === parentId)
                const siblingIndex = siblingEdges.findIndex(e => e.target === nodeId)
                const insertIdx = position === 'left' ? siblingIndex : siblingIndex + 1

                // Find the actual index in the full edges array for the insertion point
                const newEdge: Edge = {
                    id: `e-${parentId}-${newId}`,
                    source: parentId,
                    target: newId,
                    type: 'sitemap',
                }

                if (insertIdx >= siblingEdges.length) {
                    // Insert after the last sibling edge
                    const lastSiblingEdge = siblingEdges[siblingEdges.length - 1]
                    const lastIdx = state.edges.findIndex(e => e.id === lastSiblingEdge.id)
                    state.edges.splice(lastIdx + 1, 0, newEdge)
                } else {
                    // Insert before the sibling edge at insertIdx
                    const targetEdge = siblingEdges[insertIdx]
                    const targetIdx = state.edges.findIndex(e => e.id === targetEdge.id)
                    state.edges.splice(targetIdx, 0, newEdge)
                }

                // Recalculate layout
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
            get().setSelectedNodeId(newId)
        },

        addChildPage: (parentId) => {
            const newId = `page-${Date.now()}`

            set((state) => {
                // Create new page node
                state.nodes.push({
                    id: newId,
                    type: 'page',
                    position: { x: 0, y: 0 },
                    data: {
                        label: 'New Page',
                        slug: '/new-page',
                        sections: [],
                    },
                })

                // Add edge from parent to new child
                state.edges.push({
                    id: `e-${parentId}-${newId}`,
                    source: parentId,
                    target: newId,
                    type: 'sitemap',
                })

                // Recalculate layout
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
            get().setSelectedNodeId(newId)
        },

        saveToHistory: () => {
            set((state) => {
                const newHistory = state.history.slice(0, state.historyIndex + 1)
                newHistory.push({
                    nodes: JSON.parse(JSON.stringify(state.nodes)),
                    edges: JSON.parse(JSON.stringify(state.edges))
                })
                // Keep only last 50 states
                if (newHistory.length > 50) newHistory.shift()
                state.history = newHistory
                state.historyIndex = newHistory.length - 1
            })
        },

        undo: () => {
            const { historyIndex, history } = get()
            if (historyIndex > 0) {
                set((state) => {
                    state.historyIndex = historyIndex - 1
                    state.nodes = JSON.parse(JSON.stringify(history[historyIndex - 1].nodes))
                    state.edges = JSON.parse(JSON.stringify(history[historyIndex - 1].edges))
                })
            }
        },

        redo: () => {
            const { historyIndex, history } = get()
            if (historyIndex < history.length - 1) {
                set((state) => {
                    state.historyIndex = historyIndex + 1
                    state.nodes = JSON.parse(JSON.stringify(history[historyIndex + 1].nodes))
                    state.edges = JSON.parse(JSON.stringify(history[historyIndex + 1].edges))
                })
            }
        },

        fitView: () => {
            const { reactFlowFitView } = get()
            if (reactFlowFitView) {
                reactFlowFitView()
            }
        },

        zoomIn: () => {
            const { zoomLevel, reactFlowZoom } = get()
            const newZoom = Math.min(300, zoomLevel + 25)
            set({ zoomLevel: newZoom })
            if (reactFlowZoom) {
                reactFlowZoom(newZoom / 100)
            }
        },

        zoomOut: () => {
            const { zoomLevel, reactFlowZoom } = get()
            const newZoom = Math.max(5, zoomLevel - 25)
            set({ zoomLevel: newZoom })
            if (reactFlowZoom) {
                reactFlowZoom(newZoom / 100)
            }
        },

        resetZoom: () => {
            const { reactFlowZoom } = get()
            set({ zoomLevel: 100 })
            if (reactFlowZoom) {
                reactFlowZoom(1)
            }
        },

        // Node drag constraint actions (Relume-style)
        // Live shuffle preview: siblings animate to make room during drag

        handleNodeDragStart: (nodeId: string) => {
            const { edges } = get()

            // Don't track project node drags
            const parentEdge = edges.find(e => e.target === nodeId)
            if (!parentEdge) {
                set((state) => {
                    state.dragState = { isDragging: false, dragNodeId: null, parentId: null, originalOrder: [], previewOrder: [] }
                })
                return
            }

            const parentId = parentEdge.source
            const siblingEdges = edges.filter(e => e.source === parentId)
            const siblingOrder = siblingEdges.map(e => e.target)

            set((state) => {
                state.dragState = {
                    isDragging: true,
                    dragNodeId: nodeId,
                    parentId,
                    originalOrder: [...siblingOrder],
                    previewOrder: [...siblingOrder],
                }
            })
        },

        handleNodeDrag: (nodeId: string) => {
            const { nodes, dragState } = get()
            if (!dragState.isDragging || dragState.dragNodeId !== nodeId) return

            const { originalOrder, previewOrder, parentId } = dragState
            if (!parentId || originalOrder.length <= 1) return

            // Get current x positions (dragged node has live position from onNodesChange)
            const siblingPositions = originalOrder.map(id => ({
                id,
                x: nodes.find(n => n.id === id)?.position.x ?? 0,
            }))

            // Sort by x position to determine visual order
            siblingPositions.sort((a, b) => a.x - b.x)
            const newPreviewOrder = siblingPositions.map(s => s.id)

            // Only update if order changed from current preview
            const changed = newPreviewOrder.some((id, i) => id !== previewOrder[i])
            if (!changed) return

            // Update preview order and reposition non-dragged siblings
            set((state) => {
                state.dragState.previewOrder = newPreviewOrder

                // Recalculate layout with preview edge order to get target positions
                // Temporarily reorder edges for layout calculation
                const siblingEdges = state.edges.filter(e => e.source === parentId)
                const siblingEdgeSet = new Set(siblingEdges.map(e => e.id))
                const otherEdges = state.edges.filter(e => !siblingEdgeSet.has(e.id))
                const reorderedSiblingEdges = newPreviewOrder
                    .map(childId => siblingEdges.find(e => e.target === childId)!)
                    .filter(Boolean)

                const firstSiblingIndex = state.edges.findIndex(e => siblingEdgeSet.has(e.id))
                const previewEdges = [
                    ...otherEdges.slice(0, firstSiblingIndex >= 0 ? firstSiblingIndex : otherEdges.length),
                    ...reorderedSiblingEdges,
                    ...otherEdges.slice(firstSiblingIndex >= 0 ? firstSiblingIndex : otherEdges.length),
                ]

                // Calculate layout with preview order
                const layoutedNodes = calculateTreeLayout(state.nodes, previewEdges)

                // Apply positions to all nodes EXCEPT the dragged one (let it follow the cursor)
                state.nodes = state.nodes.map(n => {
                    if (n.id === nodeId) return n // Keep dragged node at cursor position
                    const layouted = layoutedNodes.find(ln => ln.id === n.id)
                    return layouted ? { ...n, position: layouted.position } : n
                })
            })
        },

        handleNodeDragStop: (nodeId: string) => {
            const { dragState, edges } = get()

            // If no drag state, just snap back
            if (!dragState.isDragging || dragState.dragNodeId !== nodeId) {
                set((state) => {
                    state.nodes = calculateTreeLayout(state.nodes, state.edges)
                    state.dragState = { isDragging: false, dragNodeId: null, parentId: null, originalOrder: [], previewOrder: [] }
                })
                return
            }

            const { originalOrder, previewOrder, parentId } = dragState
            const orderChanged = previewOrder.some((id, i) => id !== originalOrder[i])

            if (orderChanged && parentId) {
                // Commit the reorder: update edges to match preview order
                const siblingEdges = edges.filter(e => e.source === parentId)

                set((state) => {
                    const siblingEdgeSet = new Set(siblingEdges.map(e => e.id))
                    const otherEdges = state.edges.filter(e => !siblingEdgeSet.has(e.id))
                    const reorderedSiblingEdges = previewOrder
                        .map(childId => siblingEdges.find(e => e.target === childId)!)
                        .filter(Boolean)

                    const firstSiblingIndex = state.edges.findIndex(e => siblingEdgeSet.has(e.id))
                    state.edges = [
                        ...otherEdges.slice(0, firstSiblingIndex >= 0 ? firstSiblingIndex : otherEdges.length),
                        ...reorderedSiblingEdges,
                        ...otherEdges.slice(firstSiblingIndex >= 0 ? firstSiblingIndex : otherEdges.length),
                    ]

                    // Final layout with committed order
                    state.nodes = calculateTreeLayout(state.nodes, state.edges)
                    state.dragState = { isDragging: false, dragNodeId: null, parentId: null, originalOrder: [], previewOrder: [] }
                })
                get().saveToHistory()
            } else {
                // No reorder - snap back to layout positions
                set((state) => {
                    state.nodes = calculateTreeLayout(state.nodes, state.edges)
                    state.dragState = { isDragging: false, dragNodeId: null, parentId: null, originalOrder: [], previewOrder: [] }
                })
            }
        },

        recalculateLayout: () => {
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
        },

        // Section picker actions
        openSectionPicker: (pageId, insertIndex) => {
            set({
                sectionPickerOpen: true,
                sectionPickerTargetPageId: pageId,
                sectionPickerInsertIndex: insertIndex,
            })
        },

        closeSectionPicker: () => {
            set({
                sectionPickerOpen: false,
                sectionPickerTargetPageId: null,
                sectionPickerInsertIndex: null,
            })
        },

        addSectionToPage: (pageId, section, atIndex) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === pageId)
                if (node && node.data) {
                    const sections = [...((node.data as { sections?: SectionData[] }).sections || [])]
                    // Insert section at the specified index
                    sections.splice(atIndex, 0, {
                        id: `${pageId}-${section.id}-${Date.now()}`,
                        name: section.name,
                        description: section.description,
                    })
                    node.data = { ...node.data, sections }
                }
            })
            // Recalculate layout after adding section (node height changed)
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
            get().closeSectionPicker()
        },

        removeSectionFromPage: (pageId, sectionIndex) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === pageId)
                if (node && node.data) {
                    const sections = [...((node.data as { sections?: SectionData[] }).sections || [])]
                    sections.splice(sectionIndex, 1)
                    node.data = { ...node.data, sections }
                }
            })
            // Recalculate layout after removing section (node height changed)
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
        },

        moveSectionInPage: (pageId, fromIndex, toIndex) => {
            if (fromIndex === toIndex) return
            set((state) => {
                const node = state.nodes.find(n => n.id === pageId)
                if (node && node.data) {
                    const sections = [...((node.data as { sections?: SectionData[] }).sections || [])]
                    const [movedSection] = sections.splice(fromIndex, 1)
                    sections.splice(toIndex, 0, movedSection)
                    node.data = { ...node.data, sections }
                }
            })
            get().saveToHistory()
        },

        updateSectionInPage: (pageId, sectionIndex, updates) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === pageId)
                if (node && node.data) {
                    const sections = [...((node.data as { sections?: SectionData[] }).sections || [])]
                    if (sections[sectionIndex]) {
                        const existingSection = sections[sectionIndex]
                        // Handle both string and object formats
                        if (typeof existingSection === 'string') {
                            sections[sectionIndex] = {
                                id: `${pageId}-section-${sectionIndex}`,
                                name: updates.name || existingSection,
                                description: updates.description,
                            }
                        } else {
                            sections[sectionIndex] = {
                                ...existingSection,
                                ...updates,
                            }
                        }
                        node.data = { ...node.data, sections }
                    }
                }
            })
            // Recalculate layout after updating section (description length may have changed node height)
            set((state) => {
                state.nodes = calculateTreeLayout(state.nodes, state.edges)
            })
            get().saveToHistory()
        },

        loadSitemap: (pages, projectName = 'My Project') => {
            // Convert AI-generated pages to ReactFlow nodes and edges.

            const rawNodes: Node[] = []
            const rawEdges: Edge[] = []

            // Add project node at the top
            rawNodes.push({
                id: 'project',
                type: 'project',
                position: { x: 0, y: 0 }, // Will be laid out by dagre
                data: { label: projectName },
                draggable: false,
            })

            // Find home page (first page or page with slug '/')
            const homePage = pages.find(p => p.slug === '/' || p.id === 'home') || pages[0]
            const otherPages = pages.filter(p => p !== homePage)

            // Helper: resolve sections for a page
            const getSections = (_pageId: string, rawSections?: unknown[]) => {
                return rawSections || []
            }

            // Add home page
            if (homePage) {
                rawNodes.push({
                    id: homePage.id,
                    type: 'page',
                    position: { x: 0, y: 0 },
                    data: {
                        label: homePage.label,
                        slug: homePage.slug,
                        sections: getSections(homePage.id, homePage.sections),
                        isHome: true,
                    },
                })

                // Connect project to home
                rawEdges.push({
                    id: `e-project-${homePage.id}`,
                    source: 'project',
                    target: homePage.id,
                    type: 'sitemap',
                })

                // Add other pages
                otherPages.forEach((page) => {
                    rawNodes.push({
                        id: page.id,
                        type: 'page',
                        position: { x: 0, y: 0 },
                        data: {
                            label: page.label,
                            slug: page.slug,
                            sections: getSections(page.id, page.sections),
                        },
                    })

                    // Connect home to each child page
                    rawEdges.push({
                        id: `e-${homePage.id}-${page.id}`,
                        source: homePage.id,
                        target: page.id,
                        type: 'sitemap',
                    })

                    // Handle nested children
                    if (page.children?.length) {
                        page.children.forEach((child) => {
                            rawNodes.push({
                                id: child.id,
                                type: 'page',
                                position: { x: 0, y: 0 },
                                data: {
                                    label: child.label,
                                    slug: child.slug,
                                    sections: getSections(child.id, child.sections),
                                },
                            })

                            rawEdges.push({
                                id: `e-${page.id}-${child.id}`,
                                source: page.id,
                                target: child.id,
                                type: 'sitemap',
                            })
                        })
                    }
                })
            }

            // Apply tree layout for proper spacing
            const layoutedNodes = calculateTreeLayout(rawNodes, rawEdges)

            set((state) => {
                state.nodes = layoutedNodes
                state.edges = rawEdges
                state.selectedNodeId = null
            })
            get().saveToHistory()

            // Fit is handled by SitemapCanvas component via hasInitialFit
        },

        loadRawSitemap: (nodes, edges) => {
            const layoutedNodes = calculateTreeLayout(nodes, edges as Edge[])
            set((state) => {
                state.nodes = layoutedNodes
                state.edges = edges as Edge[]
                state.selectedNodeId = null
            })
            get().saveToHistory()

            // Fit is handled by SitemapCanvas component via hasInitialFit
        },

        clearSitemap: () => {
            set((state) => {
                state.nodes = []
                state.edges = []
                state.selectedNodeId = null
                state.history = []
                state.historyIndex = -1
                state.currentProjectId = null
            })
        },

        // Save sitemap to backend
        saveSitemap: async () => {
            // TODO: implement direct sitemap persistence (unified store was removed)
        },
    }))
)
