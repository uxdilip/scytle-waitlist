import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'
import { current } from 'immer'
import type { ScytleNode, FrameNode, CanvasTool, VectorNetwork, VectorVertex, VectorSegment, VectorNode } from '@/types/canvas'
import { findNodeById, findParentOfNode, createFrame, deepCloneWithNewIds, getNodeCanvasPosition, findContainingFrame, getEffectiveNodeSize, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '@/types/canvas'
import { canvasSync } from '@/lib/sync'
import { resolveVectorStroke } from '@/lib/vector-stroke'

// ============================================================
// History constants
// ============================================================

const MAX_HISTORY = 50

/**
 * Save a snapshot of current nodes to past[], clear future[].
 * Called BEFORE mutations. Skipped during batch operations (drag/resize).
 * Works with immer drafts — call at TOP of set() before modifications.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _snap = (state: any) => {
    if (state._batchDepth > 0) return
    state._past.push(current(state.nodes))
    state._future = []
    if (state._past.length > MAX_HISTORY) {
        state._past.splice(0, state._past.length - MAX_HISTORY)
    }
}

/**
 * Recompute a VectorNode's bounding box (x/y/width/height) from its
 * current vertices + bezier control points, then re-origin the vertices
 * so they are relative to the new top-left.
 *
 * Must be called on an immer draft node.
 */
function _recomputeVectorBBox(node: VectorNode) {
    const vn = node.vectorNetwork
    if (!vn.vertices.length) return

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    for (const v of vn.vertices) {
        if (v.x < minX) minX = v.x
        if (v.y < minY) minY = v.y
        if (v.x > maxX) maxX = v.x
        if (v.y > maxY) maxY = v.y
    }

    // Include bezier control points
    for (const seg of vn.segments) {
        const startV = vn.vertices[seg.start]
        const endV = vn.vertices[seg.end]
        if (!startV || !endV) continue

        if (seg.tangentStart) {
            const cpX = startV.x + seg.tangentStart.x
            const cpY = startV.y + seg.tangentStart.y
            if (cpX < minX) minX = cpX
            if (cpY < minY) minY = cpY
            if (cpX > maxX) maxX = cpX
            if (cpY > maxY) maxY = cpY
        }
        if (seg.tangentEnd) {
            const cpX = endV.x + seg.tangentEnd.x
            const cpY = endV.y + seg.tangentEnd.y
            if (cpX < minX) minX = cpX
            if (cpY < minY) minY = cpY
            if (cpX > maxX) maxX = cpX
            if (cpY > maxY) maxY = cpY
        }
    }

    const strokePad = resolveVectorStroke(node).width / 2
    minX -= strokePad
    minY -= strokePad
    maxX += strokePad
    maxY += strokePad

    // Re-origin vertices relative to new top-left
    for (const v of vn.vertices) {
        v.x -= minX
        v.y -= minY
    }

    node.x += minX
    node.y += minY
    node.width = Math.max(maxX - minX, 1)
    node.height = Math.max(maxY - minY, 1)
}

// ============================================================
// Page type (one canvas per page)
// ============================================================

export interface EditorPage {
    id: string
    name: string
    nodes: ScytleNode[]
    canvasColor: string
    zoom: number
    panX: number
    panY: number
}

function createEditorPage(name: string): EditorPage {
    return {
        id: crypto.randomUUID(),
        name,
        nodes: [],
        canvasColor: '#F5F5F5',
        zoom: 1,
        panX: 0,
        panY: 0,
    }
}

// ============================================================
// Vector / Pen editing types
// ============================================================

/** Sub-tools available within vector edit mode (overlay toolbar) */
export type VectorEditTool = 'move' | 'lasso' | 'paint' | 'bend' | 'cut'

/** Live state while the pen tool is actively placing vertices */
export interface PenDrawingState {
    /** ID of the VectorNode being drawn into */
    nodeId: string
    /** Vertices placed so far (canvas-relative to node origin) */
    vertices: VectorVertex[]
    /** Segments connecting the vertices */
    segments: VectorSegment[]
    /** Whether the user is actively placing points */
    isDrawing: boolean
    /** Current cursor position in canvas space */
    cursorX: number
    cursorY: number
    /** Whether the cursor is near the start vertex (for closing the path) */
    nearStartPoint: boolean
    /** Outgoing tangent from the last-placed vertex (set by click+drag).
     *  Used as tangentStart on the next segment created. */
    _outgoingTangent?: { x: number; y: number }
    /** Incoming tangent for the first vertex (mirrored handle from first drag).
     *  Used as tangentEnd on the closing segment when the path is closed. */
    _firstVertexIncomingTangent?: { x: number; y: number }
    /** Active alignment snap guides — orange lines shown when cursor aligns with an existing vertex.
     *  vertexX/vertexY is the canvas position of the anchor that triggered the snap. */
    _alignGuides?: Array<{ axis: 'x' | 'y'; value: number; vertexX: number; vertexY: number }>
    /** When extending from an existing vertex, the index in the EXISTING vector network.
     *  Vertices[0] in penDrawingState is a copy of this vertex. On commit, new
     *  vertices/segments merge into the existing network instead of replacing it. */
    _extendFromVertexIndex?: number
    /** When connecting to an existing vertex (extend → existing vertex), the
     *  LAST vertex in penDrawingState maps to this existing vertex index.
     *  On commit, the segment end is remapped instead of adding a new vertex. */
    _extendToVertexIndex?: number
}

interface ClipboardEntryMeta {
    sourceId: string
    sourceParentId: string | null
    sourceIndex: number
    sourceCanvasX: number
    sourceCanvasY: number
}

interface ClipboardMeta {
    sourcePageId: string
    entries: ClipboardEntryMeta[]
}

interface SourcePositionMeta {
    sourceCanvasX: number
    sourceCanvasY: number
}

function snapshotNode(node: ScytleNode): ScytleNode {
    return JSON.parse(JSON.stringify(node)) as ScytleNode
}

function buildClipboardState(
    nodes: ScytleNode[],
    ids: string[],
    sourcePageId: string
): { clipboard: ScytleNode[]; meta: ClipboardMeta } {
    const clipboard: ScytleNode[] = []
    const entries: ClipboardEntryMeta[] = []

    for (const id of ids) {
        const node = findNodeById(nodes, id)
        if (!node) continue

        const parentInfo = findParentOfNode(nodes, id)
        const absPos = getNodeCanvasPosition(nodes, id) ?? { x: node.x, y: node.y }

        clipboard.push(snapshotNode(node as ScytleNode))
        entries.push({
            sourceId: id,
            sourceParentId: parentInfo?.parent?.id ?? null,
            sourceIndex: parentInfo?.index ?? -1,
            sourceCanvasX: absPos.x,
            sourceCanvasY: absPos.y,
        })
    }

    return {
        clipboard,
        meta: {
            sourcePageId,
            entries,
        },
    }
}

function getRightmostTopLevelFrameEdge(nodes: readonly ScytleNode[]): number | null {
    let maxRight = -Infinity

    for (const node of nodes) {
        if (node.type !== 'frame') continue
        const size = getEffectiveNodeSize(node)
        maxRight = Math.max(maxRight, node.x + size.width)
    }

    return Number.isFinite(maxRight) ? maxRight : null
}

function getRightmostTopLevelFrameX(nodes: readonly ScytleNode[]): number | null {
    let maxX = -Infinity

    for (const node of nodes) {
        if (node.type !== 'frame') continue
        maxX = Math.max(maxX, node.x)
    }

    return Number.isFinite(maxX) ? maxX : null
}

function getObservedTopLevelFrameStep(nodes: readonly ScytleNode[]): number | null {
    const xs = nodes
        .filter((node): node is FrameNode => node.type === 'frame')
        .map((node) => node.x)
        .sort((a, b) => a - b)

    if (xs.length < 2) return null

    const deltas: number[] = []
    for (let i = 1; i < xs.length; i++) {
        const delta = xs[i] - xs[i - 1]
        if (delta > 0) deltas.push(delta)
    }

    if (deltas.length === 0) return null
    deltas.sort((a, b) => a - b)

    const mid = Math.floor(deltas.length / 2)
    if (deltas.length % 2 === 1) return deltas[mid]

    return (deltas[mid - 1] + deltas[mid]) / 2
}

function getTopLevelSourceFrameBounds(
    nodes: readonly ScytleNode[],
    sourceEntries: readonly SourcePositionMeta[]
): { minX: number; maxRight: number } | null {
    if (nodes.length === 0 || nodes.length !== sourceEntries.length) return null

    let minX = Infinity
    let maxRight = -Infinity

    for (let i = 0; i < nodes.length; i++) {
        const source = sourceEntries[i]
        const node = nodes[i]
        const size = getEffectiveNodeSize(node)
        minX = Math.min(minX, source.sourceCanvasX)
        maxRight = Math.max(maxRight, source.sourceCanvasX + size.width)
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxRight)) {
        return null
    }

    return { minX, maxRight }
}

function getTopLevelFrameShiftX(
    existingNodes: readonly ScytleNode[],
    sourceNodes: readonly ScytleNode[],
    sourceEntries: readonly SourcePositionMeta[],
    gap: number,
): number | null {
    const sourceBounds = getTopLevelSourceFrameBounds(sourceNodes, sourceEntries)
    if (!sourceBounds) return null

    const rightmostExisting = getRightmostTopLevelFrameEdge(existingNodes)
    if (rightmostExisting !== null) {
        let targetLeft = rightmostExisting + gap

        // If frame effective width is inflated, edge-based chaining can jump too far.
        // Prefer observed X-step from existing top-level frames when the edge step is
        // significantly larger than the established chain cadence.
        const observedStep = getObservedTopLevelFrameStep(existingNodes)
        const rightmostX = getRightmostTopLevelFrameX(existingNodes)
        if (observedStep !== null && rightmostX !== null) {
            const edgeStep = targetLeft - rightmostX
            const shouldUseObservedStep = edgeStep > observedStep * 2.5 && (edgeStep - observedStep) > 120

            if (shouldUseObservedStep) {
                targetLeft = rightmostX + observedStep
            }
        }

        return targetLeft - sourceBounds.minX
    }

    return sourceBounds.maxRight - sourceBounds.minX + gap
}

// ============================================================
// State Interface
// ============================================================

interface EditorState {
    // Pages --------------------------------------------------
    pages: EditorPage[]
    activePageId: string

    // Document (active page) ---------------------------------
    nodes: ScytleNode[]
    /** Canvas/page background color */
    canvasColor: string

    // Viewport -----------------------------------------------
    zoom: number
    panX: number
    panY: number
    /** Whether the viewport is currently undergoing an automated transition (zoom to node) */
    isViewportAnimating: boolean
    /** Cached viewport size for zoomIn/zoomOut centering */
    viewportRect: { width: number; height: number } | null

    // Selection ----------------------------------------------
    selectedIds: string[]
    hoveredId: string | null
    /** ID of the frame we've drilled into (double-click) */
    enteredFrameId: string | null

    // Tool ---------------------------------------------------
    activeTool: CanvasTool

    // Inline editing ------------------------------------------
    /** ID of the text node currently being edited inline */
    editingNodeId: string | null
    /** True while a node resize drag interaction is active */
    isNodeResizeActive: boolean

    // Padding overlay -----------------------------------------
    /** ID of the frame node whose padding is being visualized */
    paddingOverlayNodeId: string | null
    /** Which padding sides to visualize */
    paddingOverlayDirection: 'all' | 'horizontal' | 'vertical' | 'left' | 'right' | 'top' | 'bottom' | null

    // Margin drag active flag ----------------------------------
    /** True while a margin handle is being dragged */
    marginDragActive: boolean

    // Gap overlay ----------------------------------------------
    /** ID of the frame node whose gap is being visualized */
    gapOverlayNodeId: string | null
    /** Index of the gap being hovered (between child i and i+1) */
    gapOverlayIndex: number | null

    // Grid cell highlight (during drag into grid) ----------------
    /** ID of the grid container being targeted */
    gridHighlightNodeId: string | null
    /** 1-based column of the highlighted cell */
    gridHighlightCol: number | null
    /** 1-based row of the highlighted cell */
    gridHighlightRow: number | null

    // Grid track selection (click dot on canvas → selects track in panel)
    /** 'col' or 'row' axis of the selected track */
    gridSelectedTrackAxis: 'col' | 'row' | null
    /** 0-based index of the selected track */
    gridSelectedTrackIndex: number | null

    // Gradient editing ------------------------------------------
    /** Index of the fill being gradient-edited (within the selected node) */
    gradientEditingFillIdx: number | null

    // Image crop editing -----------------------------------------
    /** Index of the fill being crop-edited (within the selected node) */
    imageCropEditingFillIdx: number | null

    // Font picker ------------------------------------------------
    /** Whether the font family picker dialog is open */
    fontPickerOpen: boolean
    /** ID of the node the font picker is editing */
    fontPickerNodeId: string | null

    // Type Settings overlay ----------------------------------------
    /** Whether the Type Settings floating overlay is open */
    typeSettingsOpen: boolean

    // Vector / Pen editing ----------------------------------------
    /** ID of the VectorNode currently in edit mode (null when not in vector edit) */
    vectorEditNodeId: string | null
    /** Active sub-tool within vector edit mode overlay */
    vectorEditTool: VectorEditTool
    /** Indices of currently selected vertices in the active VectorNode */
    selectedVertexIndices: number[]
    /** Live in-progress pen drawing state (null when not actively drawing) */
    penDrawingState: PenDrawingState | null
    /** NodeId of the last path committed via pen tool click-to-close (cleared when tool changes) */
    lastPenCommittedNodeId: string | null

    // Viewport actions ----------------------------------------
    setZoom: (zoom: number) => void
    setPan: (x: number, y: number) => void
    /** Zoom to a specific level while keeping a focal screen point fixed */
    zoomTo: (zoom: number, focalScreenX: number, focalScreenY: number) => void
    zoomIn: () => void
    zoomOut: () => void
    resetZoom: () => void
    setViewportRect: (rect: { width: number; height: number }) => void

    // Tool actions --------------------------------------------
    setActiveTool: (tool: CanvasTool) => void

    // Inline editing actions -----------------------------------
    setEditingNodeId: (id: string | null) => void
    setNodeResizeActive: (active: boolean) => void

    // Padding overlay actions ----------------------------------
    setMarginDragActive: (active: boolean) => void
    setPaddingOverlay: (id: string | null, direction?: 'all' | 'horizontal' | 'vertical' | 'left' | 'right' | 'top' | 'bottom') => void

    // Gap overlay actions --------------------------------------
    setGapOverlay: (id: string | null, index?: number | null) => void

    // Grid cell highlight actions --------------------------------
    setGridHighlight: (nodeId: string | null, col?: number | null, row?: number | null) => void

    // Grid track selection actions --------------------------------
    setGridSelectedTrack: (axis: 'col' | 'row' | null, index?: number | null) => void

    // Gradient editing actions ----------------------------------
    setGradientEditingFillIdx: (idx: number | null) => void

    // Image crop editing actions --------------------------------
    setImageCropEditingFillIdx: (idx: number | null) => void

    // Font picker actions ----------------------------------------
    openFontPicker: (nodeId: string) => void
    closeFontPicker: () => void

    // Type Settings overlay actions --------------------------------
    openTypeSettings: () => void
    closeTypeSettings: () => void

    // Selection actions ---------------------------------------
    selectNode: (id: string, addToSelection?: boolean) => void
    deselectAll: () => void
    setHoveredId: (id: string | null) => void
    setPasteAnchor: (x: number, y: number) => void
    /** Zoom and pan to center the given node in the viewport */
    zoomToNode: (id: string) => void
    /** Zoom and pan to fit all top-level nodes in the viewport */
    zoomToFit: () => void
    /** Zoom and pan to fit the currently selected nodes in the viewport */
    zoomToSelection: () => void
    enterFrame: (id: string) => void
    exitFrame: () => void

    // Canvas settings ----------------------------------------
    setCanvasColor: (color: string) => void

    // Document mutations (expanded in later phases) -----------
    setNodes: (nodes: ScytleNode[]) => void
    addNode: (node: ScytleNode, parentId?: string, index?: number) => void
    updateNode: (id: string, updates: Record<string, unknown>) => void
    updateNodes: (entries: Array<{ id: string; updates: Record<string, unknown> }>) => void
    /** Replace a top-level node entirely (used for skeleton → real frame swap) */
    replaceNode: (oldId: string, newNode: ScytleNode) => void
    deleteNode: (id: string) => void
    /** Remove a node without writing history (for cancelled transient creations) */
    discardNode: (id: string) => void
    deleteSelectedNodes: () => void
    /** Reorder a node within its parent's children array.
     *  gapIndex is 0..N where N = number of siblings. */
    reorderNode: (nodeId: string, gapIndex: number) => void
    /** Move selected movable nodes by a delta. Returns true if at least one node moved. */
    nudgeSelectedNodes: (dx: number, dy: number) => boolean

    // History (internal) --------------------------------------
    _past: ScytleNode[][]
    _future: ScytleNode[][]
    _batchDepth: number
    _clipboard: ScytleNode[]
    _clipboardMeta: ClipboardMeta | null
    _pasteAnchor: { x: number; y: number } | null

    // History actions -----------------------------------------
    undo: () => void
    redo: () => void
    beginBatch: () => void
    endBatch: () => void

    // Z-order actions -----------------------------------------
    bringForward: (id: string) => void
    sendBackward: (id: string) => void
    bringToFront: (id: string) => void
    sendToBack: (id: string) => void

    // Clipboard actions ---------------------------------------
    copyNodes: (ids: string[]) => void
    cutNodes: (ids: string[]) => void
    pasteNodes: () => void
    pasteOverSelection: () => void
    pasteHere: () => void
    duplicateNodes: (ids: string[]) => void

    // Reparent actions -----------------------------------------
    moveNodeToFrame: (nodeId: string, newParentId: string) => void
    moveNodeToTopLevel: (nodeId: string) => void

    // Grouping actions ----------------------------------------
    groupNodes: (ids: string[]) => void
    ungroupNodes: (id: string) => void

    // Project persistence -------------------------------------
    /** Currently loaded project ID (for per-project storage) */
    _projectId: string | null
    /** Whether nodes have EVER been added for this project (prevents re-generation after delete-all) */
    hasEverHadNodes: boolean
    /** Initialize editor for a specific project */
    initForProject: (projectId: string) => void
    /** Set multiple selected IDs at once (for marquee selection) */
    setSelectedIds: (ids: string[]) => void

    // Vector / Pen editing actions --------------------------------
    /** Enter vector edit mode for a specific VectorNode */
    enterVectorEditMode: (nodeId: string) => void
    /** Exit vector edit mode, returning to select tool */
    exitVectorEditMode: () => void
    /** Set the active sub-tool within vector edit overlay */
    setVectorEditTool: (tool: VectorEditTool) => void
    /** Select vertex indices (additive = add to current selection) */
    selectVertices: (indices: number[], additive?: boolean) => void
    /** Clear vertex selection */
    deselectVertices: () => void
    /** Patch a single vertex in a VectorNode */
    updateVertex: (nodeId: string, index: number, patch: Partial<VectorVertex>) => void
    /** Add a new vertex to a VectorNode (optionally splitting a segment) */
    addVertex: (nodeId: string, vertex: VectorVertex, afterSegmentIndex?: number) => void
    /** Delete selected vertices and their connected segments */
    deleteSelectedVertices: (nodeId: string) => void
    /** Replace the entire VectorNetwork on a node */
    updateVectorNetwork: (nodeId: string, network: VectorNetwork) => void
    /** Insert a new anchor point on a segment (keeps path connected, no break) */
    insertPointOnSegment: (nodeId: string, segIdx: number, t: number) => void
    /** Update or clear the live pen drawing state */
    setPenDrawingState: (state: PenDrawingState | null) => void
    /** Commit the pen drawing state into the VectorNode and finalize bounding box */
    commitPenPath: () => void
    /**
     * Commit pen path (if still drawing) or use lastPenCommittedNodeId (if closed),
     * then enter vector edit mode on that node and activate the given tool.
     * Used by the vector edit toolbar when pen tool is active.
     */
    commitPenAndEnterVectorEdit: (tool: VectorEditTool) => void

    // Page management -----------------------------------------
    addPage: (name?: string) => string
    deletePage: (pageId: string) => void
    duplicatePage: (pageId: string) => string
    renamePage: (pageId: string, name: string) => void
    switchPage: (pageId: string) => void
}

// ============================================================
// Store
// ============================================================

export const useEditorStore = create<EditorState>()(
    devtools(
        immer((set, get) => ({
            // Initial state ----------------------------------------
            nodes: [],
            canvasColor: '#F5F5F5',
            zoom: 1,
            panX: 0,
            panY: 0,
            isViewportAnimating: false,
            viewportRect: null,
            selectedIds: [],
            hoveredId: null,
            enteredFrameId: null,
            activeTool: 'select' as CanvasTool,
            editingNodeId: null,
            isNodeResizeActive: false,
            paddingOverlayNodeId: null,
            paddingOverlayDirection: null,
            marginDragActive: false,
            gapOverlayNodeId: null,
            gapOverlayIndex: null,
            gridHighlightNodeId: null,
            gridHighlightCol: null,
            gridHighlightRow: null,
            gridSelectedTrackAxis: null,
            gridSelectedTrackIndex: null,
            gradientEditingFillIdx: null,
            imageCropEditingFillIdx: null,
            fontPickerOpen: false,
            fontPickerNodeId: null,
            typeSettingsOpen: false,
            vectorEditNodeId: null,
            vectorEditTool: 'move' as VectorEditTool,
            selectedVertexIndices: [] as number[],
            penDrawingState: null as PenDrawingState | null,
            lastPenCommittedNodeId: null as string | null,
            _past: [],
            _future: [],
            _batchDepth: 0,
            _clipboard: [],
            _clipboardMeta: null,
            _pasteAnchor: null,
            _projectId: null,
            hasEverHadNodes: false,
            pages: [],
            activePageId: '',

            // Viewport ---------------------------------------------

            setZoom: (zoom) =>
                set(
                    (state) => {
                        const { zoom: oldZoom, panX, panY, viewportRect } = state
                        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
                        if (viewportRect) {
                            const cx = viewportRect.width / 2
                            const cy = viewportRect.height / 2
                            const canvasX = (cx - panX) / oldZoom
                            const canvasY = (cy - panY) / oldZoom
                            state.panX = cx - canvasX * newZoom
                            state.panY = cy - canvasY * newZoom
                        }
                        state.zoom = newZoom
                    },
                    false,
                    'setZoom'
                ),

            setPan: (x, y) =>
                set(
                    (state) => {
                        state.panX = x
                        state.panY = y
                    },
                    false,
                    'setPan'
                ),

            zoomTo: (zoom, focalScreenX, focalScreenY) =>
                set(
                    (state) => {
                        const oldZoom = state.zoom
                        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

                        // Canvas-space point under the focal screen point
                        const canvasX = (focalScreenX - state.panX) / oldZoom
                        const canvasY = (focalScreenY - state.panY) / oldZoom

                        // Adjust pan so the same canvas point stays under the focal point
                        state.panX = focalScreenX - canvasX * newZoom
                        state.panY = focalScreenY - canvasY * newZoom
                        state.zoom = newZoom
                    },
                    false,
                    'zoomTo'
                ),

            zoomIn: () =>
                set(
                    (state) => {
                        const { zoom, panX, panY, viewportRect } = state
                        const newZoom = Math.min(MAX_ZOOM, zoom * ZOOM_STEP)

                        if (viewportRect) {
                            // Zoom toward viewport center
                            const cx = viewportRect.width / 2
                            const cy = viewportRect.height / 2
                            const canvasX = (cx - panX) / zoom
                            const canvasY = (cy - panY) / zoom
                            state.panX = cx - canvasX * newZoom
                            state.panY = cy - canvasY * newZoom
                        }

                        state.zoom = newZoom
                    },
                    false,
                    'zoomIn'
                ),

            zoomOut: () =>
                set(
                    (state) => {
                        const { zoom, panX, panY, viewportRect } = state
                        const newZoom = Math.max(MIN_ZOOM, zoom / ZOOM_STEP)

                        if (viewportRect) {
                            const cx = viewportRect.width / 2
                            const cy = viewportRect.height / 2
                            const canvasX = (cx - panX) / zoom
                            const canvasY = (cy - panY) / zoom
                            state.panX = cx - canvasX * newZoom
                            state.panY = cy - canvasY * newZoom
                        }

                        state.zoom = newZoom
                    },
                    false,
                    'zoomOut'
                ),

            resetZoom: () =>
                set(
                    (state) => {
                        state.zoom = 1
                        state.panX = 0
                        state.panY = 0
                    },
                    false,
                    'resetZoom'
                ),

            setViewportRect: (rect) =>
                set(
                    (state) => {
                        state.viewportRect = rect
                    },
                    false,
                    'setViewportRect'
                ),

            // Tool -------------------------------------------------

            setActiveTool: (tool) =>
                set(
                    (state) => {
                        // Commit in-progress pen path before switching away
                        if (tool !== 'pen' && state.penDrawingState) {
                            const ps = state.penDrawingState
                            if (ps.vertices.length >= 2) {
                                // Commit the open path
                                const node = findNodeById(state.nodes, ps.nodeId)
                                if (node && node.type === 'vector') {
                                    _snap(state)
                                    const vn = (node as VectorNode).vectorNetwork
                                    vn.vertices = ps.vertices
                                    vn.segments = ps.segments
                                    let minX = Infinity, minY = Infinity
                                    let maxX = -Infinity, maxY = -Infinity
                                    for (const v of ps.vertices) {
                                        if (v.x < minX) minX = v.x
                                        if (v.y < minY) minY = v.y
                                        if (v.x > maxX) maxX = v.x
                                        if (v.y > maxY) maxY = v.y
                                    }
                                    for (const v of vn.vertices) {
                                        v.x -= minX
                                        v.y -= minY
                                    }
                                    node.x += minX
                                    node.y += minY
                                    node.width = Math.max(maxX - minX, 1)
                                    node.height = Math.max(maxY - minY, 1)
                                }
                            } else {
                                // Only 0-1 vertices — delete the empty vector node
                                const idx = state.nodes.findIndex((n) => n.id === ps.nodeId)
                                if (idx !== -1) state.nodes.splice(idx, 1)
                                state.selectedIds = state.selectedIds.filter((id) => id !== ps.nodeId)
                            }
                            state.penDrawingState = null
                        }

                        state.activeTool = tool
                        // Exit inline editing when switching tools
                        if (state.editingNodeId) state.editingNodeId = null
                        // Exit vector edit mode when switching away from pen
                        if (tool !== 'pen' && state.vectorEditNodeId) {
                            state.vectorEditNodeId = null
                            state.vectorEditTool = 'move'
                            state.selectedVertexIndices = []
                        }
                        // Clear last committed pen node when switching away from pen
                        if (tool !== 'pen') {
                            state.lastPenCommittedNodeId = null
                        }
                    },
                    false,
                    'setActiveTool'
                ),

            setEditingNodeId: (id) =>
                set(
                    (state) => {
                        state.editingNodeId = id
                    },
                    false,
                    'setEditingNodeId'
                ),

            setNodeResizeActive: (active) =>
                set(
                    (state) => {
                        state.isNodeResizeActive = active
                    },
                    false,
                    'setNodeResizeActive'
                ),

            setMarginDragActive: (active) =>
                set(
                    (state) => { state.marginDragActive = active },
                    false,
                    'setMarginDragActive'
                ),

            setPaddingOverlay: (id, direction) =>
                set(
                    (state) => {
                        state.paddingOverlayNodeId = id
                        state.paddingOverlayDirection = id ? (direction ?? 'all') : null
                    },
                    false,
                    'setPaddingOverlay'
                ),

            setGapOverlay: (id, index) =>
                set(
                    (state) => {
                        state.gapOverlayNodeId = id
                        state.gapOverlayIndex = id ? (index ?? null) : null
                    },
                    false,
                    'setGapOverlay'
                ),

            setGridHighlight: (nodeId, col, row) =>
                set(
                    (state) => {
                        state.gridHighlightNodeId = nodeId
                        state.gridHighlightCol = nodeId ? (col ?? null) : null
                        state.gridHighlightRow = nodeId ? (row ?? null) : null
                    },
                    false,
                    'setGridHighlight'
                ),

            setGridSelectedTrack: (axis, index) =>
                set(
                    (state) => {
                        state.gridSelectedTrackAxis = axis
                        state.gridSelectedTrackIndex = axis ? (index ?? null) : null
                    },
                    false,
                    'setGridSelectedTrack'
                ),

            setGradientEditingFillIdx: (idx) =>
                set(
                    (state) => {
                        state.gradientEditingFillIdx = idx
                    },
                    false,
                    'setGradientEditingFillIdx'
                ),

            setImageCropEditingFillIdx: (idx) =>
                set(
                    (state) => {
                        state.imageCropEditingFillIdx = idx
                    },
                    false,
                    'setImageCropEditingFillIdx'
                ),

            // Font picker ──────────────────────────────────────────────

            openFontPicker: (nodeId) =>
                set(
                    (state) => {
                        state.fontPickerOpen = true
                        state.fontPickerNodeId = nodeId
                    },
                    false,
                    'openFontPicker'
                ),

            closeFontPicker: () =>
                set(
                    (state) => {
                        state.fontPickerOpen = false
                        state.fontPickerNodeId = null
                    },
                    false,
                    'closeFontPicker'
                ),

            // Type Settings overlay ─────────────────────────────────────

            openTypeSettings: () =>
                set(
                    (state) => {
                        state.typeSettingsOpen = true
                    },
                    false,
                    'openTypeSettings'
                ),

            closeTypeSettings: () =>
                set(
                    (state) => {
                        state.typeSettingsOpen = false
                    },
                    false,
                    'closeTypeSettings'
                ),

            // Canvas settings --------------------------------------

            setCanvasColor: (color) => {
                set(
                    (state) => {
                        state.canvasColor = color
                    },
                    false,
                    'setCanvasColor'
                )
                if (!canvasSync._applyingRemote) {
                    const { activePageId } = get()
                    canvasSync.sendPageUpdate(activePageId, { canvasColor: color })
                }
            },

            // Selection --------------------------------------------

            selectNode: (id, addToSelection = false) =>
                set(
                    (state) => {
                        if (addToSelection) {
                            // Shift-click: toggle in selection
                            const idx = state.selectedIds.indexOf(id)
                            if (idx !== -1) {
                                state.selectedIds.splice(idx, 1)
                            } else {
                                state.selectedIds.push(id)
                            }
                        } else {
                            state.selectedIds = [id]
                        }
                    },
                    false,
                    'selectNode'
                ),

            deselectAll: () =>
                set(
                    (state) => {
                        state.selectedIds = []
                        state._pasteAnchor = null
                    },
                    false,
                    'deselectAll'
                ),

            setHoveredId: (id) =>
                set(
                    (state) => {
                        state.hoveredId = id
                    },
                    false,
                    'setHoveredId'
                ),

            setPasteAnchor: (x, y) =>
                set(
                    (state) => {
                        state._pasteAnchor = { x, y }
                    },
                    false,
                    'setPasteAnchor'
                ),

            zoomToNode: (id) => {
                const state = get()
                const node = findNodeById(state.nodes, id)
                if (!node || !state.viewportRect) return

                const absPos = getNodeCanvasPosition(state.nodes, id)
                if (!absPos) return

                const { width: vw, height: vh } = state.viewportRect
                const nodeW = node.width
                const nodeH = node.height

                // Calculate zoom to fit with padding
                const padding = 64
                const zoomX = (vw - padding) / nodeW
                const zoomY = (vh - padding) / nodeH
                let newZoom = Math.min(zoomX, zoomY, 2) // Cap at 200% zoom
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

                // Center the node
                const newPanX = vw / 2 - (absPos.x + nodeW / 2) * newZoom
                const newPanY = vh / 2 - (absPos.y + nodeH / 2) * newZoom

                set(
                    (s) => {
                        s.isViewportAnimating = true
                        s.zoom = newZoom
                        s.panX = newPanX
                        s.panY = newPanY
                    },
                    false,
                    'zoomToNode'
                )

                // Turn off animation after transition finishes
                setTimeout(() => {
                    set((s) => { s.isViewportAnimating = false }, false, 'stopViewportAnimation')
                }, 500)
            },

            zoomToFit: () => {
                const state = get()
                const nodes = state.nodes
                if (nodes.length === 0 || !state.viewportRect) {
                    set((s) => {
                        s.zoom = 1
                        s.panX = 0
                        s.panY = 0
                    }, false, 'zoomToFit:empty')
                    return
                }

                // Calculate bounding box of all top-level nodes
                let minX = Infinity, minY = Infinity
                let maxX = -Infinity, maxY = -Infinity
                let hasVisibleNodes = false

                for (const node of nodes) {
                    if (node.visible === false) continue
                    hasVisibleNodes = true
                    minX = Math.min(minX, node.x)
                    minY = Math.min(minY, node.y)
                    maxX = Math.max(maxX, node.x + node.width)
                    maxY = Math.max(maxY, node.y + node.height)
                }

                if (!hasVisibleNodes) {
                    set((s) => {
                        s.zoom = 1
                        s.panX = 0
                        s.panY = 0
                    }, false, 'zoomToFit:invisible')
                    return
                }

                const contentW = maxX - minX
                const contentH = maxY - minY
                const { width: vw, height: vh } = state.viewportRect

                // Padding (approx 10% of viewport)
                const padding = Math.min(vw, vh) * 0.1
                const zoomX = (vw - padding * 2) / contentW
                const zoomY = (vh - padding * 2) / contentH
                // Figma zooms as much as needed, up to a reasonable limit (e.g. MAX_ZOOM)
                let newZoom = Math.min(zoomX, zoomY)
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

                const newPanX = vw / 2 - (minX + contentW / 2) * newZoom
                const newPanY = vh / 2 - (minY + contentH / 2) * newZoom

                set((s) => {
                    s.isViewportAnimating = true
                    s.zoom = newZoom
                    s.panX = newPanX
                    s.panY = newPanY
                }, false, 'zoomToFit')

                setTimeout(() => {
                    set((s) => { s.isViewportAnimating = false }, false, 'stopViewportAnimation')
                }, 500)
            },

            zoomToSelection: () => {
                const state = get()
                const { selectedIds, nodes, viewportRect } = state
                if (selectedIds.length === 0 || !viewportRect) return

                // Calculate bounding box of selection
                let minX = Infinity, minY = Infinity
                let maxX = -Infinity, maxY = -Infinity
                let foundAny = false

                for (const id of selectedIds) {
                    const node = findNodeById(nodes, id)
                    const absPos = getNodeCanvasPosition(nodes, id)
                    if (node && absPos) {
                        minX = Math.min(minX, absPos.x)
                        minY = Math.min(minY, absPos.y)
                        maxX = Math.max(maxX, absPos.x + node.width)
                        maxY = Math.max(maxY, absPos.y + node.height)
                        foundAny = true
                    }
                }

                if (!foundAny) return

                const contentW = maxX - minX
                const contentH = maxY - minY
                const { width: vw, height: vh } = viewportRect

                const padding = Math.min(vw, vh) * 0.1
                const zoomX = (vw - padding * 2) / contentW
                const zoomY = (vh - padding * 2) / contentH
                let newZoom = Math.min(zoomX, zoomY, 2.0) // Cap at 200% for selection
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

                const newPanX = vw / 2 - (minX + contentW / 2) * newZoom
                const newPanY = vh / 2 - (minY + contentH / 2) * newZoom

                set((s) => {
                    s.isViewportAnimating = true
                    s.zoom = newZoom
                    s.panX = newPanX
                    s.panY = newPanY
                }, false, 'zoomToSelection')

                setTimeout(() => {
                    set((s) => { s.isViewportAnimating = false }, false, 'stopViewportAnimation')
                }, 500)
            },

            enterFrame: (id) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, id)
                        if (node && node.type === 'frame') {
                            state.enteredFrameId = id
                            state.selectedIds = []
                        }
                    },
                    false,
                    'enterFrame'
                ),

            exitFrame: () =>
                set(
                    (state) => {
                        if (state.enteredFrameId) {
                            // Select the frame we're exiting from
                            state.selectedIds = [state.enteredFrameId]
                            state.enteredFrameId = null
                        }
                    },
                    false,
                    'exitFrame'
                ),

            // Document mutations -----------------------------------

            setNodes: (nodes) => {
                set(
                    (state) => {
                        state.nodes = nodes
                        if (nodes.length > 0) state.hasEverHadNodes = true
                    },
                    false,
                    'setNodes'
                )
                // Sync handled by auto-sync subscriber
            },

            addNode: (node, parentId, index) => {
                set(
                    (state) => {
                        _snap(state)
                        // Mark that this project has had nodes (prevents re-generation on delete-all)
                        state.hasEverHadNodes = true
                        if (!parentId) {
                            if (index !== undefined) {
                                state.nodes.splice(index, 0, node)
                            } else {
                                state.nodes.push(node)
                            }
                        } else {
                            const parent = findNodeById(state.nodes, parentId) as FrameNode | null
                            if (parent && parent.type === 'frame') {
                                if (index !== undefined) {
                                    parent.children.splice(index, 0, node)
                                } else {
                                    parent.children.push(node)
                                }
                            }
                        }
                    },
                    false,
                    'addNode'
                )
                // Sync handled by auto-sync subscriber
            },

            updateNode: (id, updates) => {
                set(
                    (state) => {
                        _snap(state)
                        const node = findNodeById(state.nodes, id)
                        if (node) {
                            Object.assign(node, updates)
                        }
                    },
                    false,
                    'updateNode'
                )
                // Sync handled by auto-sync subscriber
            },

            updateNodes: (entries) => {
                if (entries.length === 0) return

                set(
                    (state) => {
                        _snap(state)
                        for (const entry of entries) {
                            const node = findNodeById(state.nodes, entry.id)
                            if (node) {
                                Object.assign(node, entry.updates)
                            }
                        }
                    },
                    false,
                    'updateNodes'
                )
                // Sync handled by auto-sync subscriber
            },

            nudgeSelectedNodes: (dx, dy) => {
                if (dx === 0 && dy === 0) return false

                let moved = false

                set(
                    (state) => {
                        if (state.selectedIds.length === 0) return

                        let hasSnapshot = false

                        for (const id of state.selectedIds) {
                            const node = findNodeById(state.nodes, id)
                            if (!node || node.locked) continue

                            const parent = findParentOfNode(state.nodes, id)?.parent
                            const canMove =
                                !parent ||
                                parent.layout.mode === 'none' ||
                                node.positioning === 'absolute'

                            if (!canMove) continue

                            if (!hasSnapshot) {
                                _snap(state)
                                hasSnapshot = true
                            }

                            node.x += dx
                            node.y += dy
                            moved = true
                        }
                    },
                    false,
                    'nudgeSelectedNodes'
                )

                return moved
            },

            replaceNode: (oldId, newNode) => {
                set(
                    (state) => {
                        // Check top level first
                        const idx = state.nodes.findIndex((n) => n.id === oldId)
                        if (idx !== -1) {
                            _snap(state)
                            state.nodes[idx] = newNode
                            return
                        }
                        // Deep search: find parent frame containing the node
                        const result = findParentOfNode(state.nodes, oldId)
                        if (result?.parent && result.parent.type === 'frame') {
                            _snap(state)
                            result.parent.children[result.index] = newNode
                        }
                    },
                    false,
                    'replaceNode'
                )
                // Sync handled by auto-sync subscriber
            },

            deleteNode: (id) => {
                set(
                    (state) => {
                        _snap(state)
                        // Check top level
                        const topIdx = state.nodes.findIndex((n) => n.id === id)
                        if (topIdx !== -1) {
                            state.nodes.splice(topIdx, 1)
                            state.selectedIds = state.selectedIds.filter((sid) => sid !== id)
                            return
                        }

                        // Search recursively
                        const result = findParentOfNode(state.nodes, id)
                        if (result?.parent) {
                            result.parent.children.splice(result.index, 1)
                            state.selectedIds = state.selectedIds.filter((sid) => sid !== id)
                        }
                    },
                    false,
                    'deleteNode'
                )
                // Sync handled by auto-sync subscriber
            },

            discardNode: (id) => {
                set(
                    (state) => {
                        // Top-level
                        const topIdx = state.nodes.findIndex((n) => n.id === id)
                        if (topIdx !== -1) {
                            state.nodes.splice(topIdx, 1)
                        } else {
                            // Nested
                            const result = findParentOfNode(state.nodes, id)
                            if (result?.parent) {
                                result.parent.children.splice(result.index, 1)
                            }
                        }

                        state.selectedIds = state.selectedIds.filter((sid) => sid !== id)
                        if (state.editingNodeId === id) {
                            state.editingNodeId = null
                        }
                    },
                    false,
                    'discardNode'
                )
                // Sync handled by auto-sync subscriber
            },

            reorderNode: (nodeId, gapIndex) =>
                set(
                    (state) => {
                        _snap(state)
                        const result = findParentOfNode(state.nodes, nodeId)
                        if (!result) return

                        const { parent, index: oldIndex } = result
                        const list = parent ? parent.children : state.nodes

                        // Convert gap index to final index after removal
                        const finalIndex =
                            gapIndex > oldIndex ? gapIndex - 1 : gapIndex

                        // No-op if same position
                        if (finalIndex === oldIndex) return

                        // Splice: remove from old position, insert at new
                        const [node] = list.splice(oldIndex, 1)
                        list.splice(finalIndex, 0, node)
                    },
                    false,
                    'reorderNode'
                ),

            // ── Bulk delete ──────────────────────────────────────

            deleteSelectedNodes: () => {
                set(
                    (state) => {
                        if (state.selectedIds.length === 0) return
                        _snap(state)

                        for (const id of [...state.selectedIds]) {
                            const topIdx = state.nodes.findIndex((n) => n.id === id)
                            if (topIdx !== -1) {
                                state.nodes.splice(topIdx, 1)
                                continue
                            }
                            const result = findParentOfNode(state.nodes, id)
                            if (result?.parent) {
                                result.parent.children.splice(result.index, 1)
                            }
                        }

                        state.selectedIds = []
                        if (
                            state.editingNodeId &&
                            !findNodeById(state.nodes, state.editingNodeId)
                        ) {
                            state.editingNodeId = null
                        }
                    },
                    false,
                    'deleteSelectedNodes'
                )
                // Sync handled by auto-sync subscriber
            },

            // ── History actions ───────────────────────────────────

            undo: () =>
                set(
                    (state) => {
                        if (state._past.length === 0) return
                        state._future.push(current(state.nodes) as ScytleNode[])
                        state.nodes = state._past.pop()!
                        state.selectedIds = state.selectedIds.filter(
                            (id) => findNodeById(state.nodes, id) !== null
                        )
                        if (
                            state.editingNodeId &&
                            !findNodeById(state.nodes, state.editingNodeId)
                        ) {
                            state.editingNodeId = null
                        }
                    },
                    false,
                    'undo'
                ),

            redo: () =>
                set(
                    (state) => {
                        if (state._future.length === 0) return
                        state._past.push(current(state.nodes) as ScytleNode[])
                        state.nodes = state._future.pop()!
                        state.selectedIds = state.selectedIds.filter(
                            (id) => findNodeById(state.nodes, id) !== null
                        )
                        if (
                            state.editingNodeId &&
                            !findNodeById(state.nodes, state.editingNodeId)
                        ) {
                            state.editingNodeId = null
                        }
                    },
                    false,
                    'redo'
                ),

            beginBatch: () =>
                set(
                    (state) => {
                        if (state._batchDepth === 0) {
                            state._past.push(current(state.nodes) as ScytleNode[])
                            state._future = []
                            if (state._past.length > MAX_HISTORY) {
                                state._past.splice(
                                    0,
                                    state._past.length - MAX_HISTORY
                                )
                            }
                        }
                        state._batchDepth++
                    },
                    false,
                    'beginBatch'
                ),

            endBatch: () =>
                set(
                    (state) => {
                        state._batchDepth = Math.max(0, state._batchDepth - 1)
                    },
                    false,
                    'endBatch'
                ),

            // ── Z-order actions ───────────────────────────────────

            bringForward: (id) => {
                set(
                    (state) => {
                        _snap(state)
                        const result = findParentOfNode(state.nodes, id)
                        if (!result) return
                        const list = result.parent
                            ? result.parent.children
                            : state.nodes
                        const idx = result.index
                        if (idx >= list.length - 1) return
                        const [node] = list.splice(idx, 1)
                        list.splice(idx + 1, 0, node)
                    },
                    false,
                    'bringForward'
                )
                // Sync handled by auto-sync subscriber
            },

            sendBackward: (id) => {
                set(
                    (state) => {
                        _snap(state)
                        const result = findParentOfNode(state.nodes, id)
                        if (!result) return
                        const list = result.parent
                            ? result.parent.children
                            : state.nodes
                        const idx = result.index
                        if (idx <= 0) return
                        const [node] = list.splice(idx, 1)
                        list.splice(idx - 1, 0, node)
                    },
                    false,
                    'sendBackward'
                )
                // Sync handled by auto-sync subscriber
            },

            bringToFront: (id) => {
                set(
                    (state) => {
                        _snap(state)
                        const result = findParentOfNode(state.nodes, id)
                        if (!result) return
                        const list = result.parent
                            ? result.parent.children
                            : state.nodes
                        const idx = result.index
                        if (idx >= list.length - 1) return
                        const [node] = list.splice(idx, 1)
                        list.push(node)
                    },
                    false,
                    'bringToFront'
                )
                // Sync handled by auto-sync subscriber
            },

            sendToBack: (id) => {
                set(
                    (state) => {
                        _snap(state)
                        const result = findParentOfNode(state.nodes, id)
                        if (!result) return
                        const list = result.parent
                            ? result.parent.children
                            : state.nodes
                        const idx = result.index
                        if (idx <= 0) return
                        const [node] = list.splice(idx, 1)
                        list.unshift(node)
                    },
                    false,
                    'sendToBack'
                )
                // Sync handled by auto-sync subscriber
            },

            // ── Clipboard actions ─────────────────────────────────

            copyNodes: (ids) =>
                set(
                    (state) => {
                        const clipboardState = buildClipboardState(
                            state.nodes,
                            ids,
                            state.activePageId
                        )
                        state._clipboard = clipboardState.clipboard
                        state._clipboardMeta = clipboardState.meta
                    },
                    false,
                    'copyNodes'
                ),

            cutNodes: (ids) =>
                set(
                    (state) => {
                        // Save to clipboard first
                        const clipboardState = buildClipboardState(
                            state.nodes,
                            ids,
                            state.activePageId
                        )
                        state._clipboard = clipboardState.clipboard
                        state._clipboardMeta = clipboardState.meta

                        // Snap before deletion (the actual mutation)
                        _snap(state)

                        for (const id of [...ids]) {
                            const topIdx = state.nodes.findIndex((n) => n.id === id)
                            if (topIdx !== -1) {
                                state.nodes.splice(topIdx, 1)
                                continue
                            }
                            const result = findParentOfNode(state.nodes, id)
                            if (result?.parent) {
                                result.parent.children.splice(result.index, 1)
                            }
                        }

                        state.selectedIds = []
                        if (
                            state.editingNodeId &&
                            !findNodeById(state.nodes, state.editingNodeId)
                        ) {
                            state.editingNodeId = null
                        }
                    },
                    false,
                    'cutNodes'
                ),

            pasteNodes: () =>
                set(
                    (state) => {
                        const clipboard = current(
                            state._clipboard
                        ) as ScytleNode[]
                        if (clipboard.length === 0) return
                        _snap(state)

                        const PASTE_OFFSET = 20
                        const TOP_LEVEL_FRAME_GAP = 40
                        const newIds: string[] = []
                        const clipboardMeta = state._clipboardMeta
                        const sourceEntries = clipboardMeta?.entries ?? []
                        const copiedSourceIds = new Set(sourceEntries.map((e) => e.sourceId))
                        const hasActiveSourceSelection = state.selectedIds.some((id) => copiedSourceIds.has(id))

                        const selectedFrames = state.selectedIds
                            .map((id) => findNodeById(state.nodes, id))
                            .filter((n): n is FrameNode => !!n && n.type === 'frame')

                        const canPasteToEachSelectedFrame =
                            !state.enteredFrameId &&
                            selectedFrames.length > 1 &&
                            selectedFrames.length === state.selectedIds.length &&
                            selectedFrames.every((frame) => !copiedSourceIds.has(frame.id))

                        if (canPasteToEachSelectedFrame) {
                            for (let i = 0; i < selectedFrames.length; i++) {
                                const targetFrame = selectedFrames[i]
                                const original = clipboard[i % clipboard.length]
                                const clone = deepCloneWithNewIds(original)
                                const sourceMeta = sourceEntries[i % sourceEntries.length]

                                let x = clone.x
                                let y = clone.y
                                const xFits = x >= -clone.width && x <= targetFrame.width
                                const yFits = y >= -clone.height && y <= targetFrame.height

                                if (!xFits) x = (targetFrame.width - clone.width) / 2
                                if (!yFits) y = (targetFrame.height - clone.height) / 2

                                if (sourceMeta?.sourceParentId === targetFrame.id) {
                                    x += PASTE_OFFSET
                                    y += PASTE_OFFSET
                                }

                                clone.x = x
                                clone.y = y
                                targetFrame.children.push(clone)
                                newIds.push(clone.id)
                            }

                            state.selectedIds = newIds
                            const nextClipboard = buildClipboardState(
                                state.nodes,
                                newIds,
                                state.activePageId
                            )
                            state._clipboard = nextClipboard.clipboard
                            state._clipboardMeta = nextClipboard.meta
                            state._pasteAnchor = null
                            return
                        }

                        // Determine paste target:
                        // 1. If drilled into a frame (enteredFrameId), paste inside it.
                        // 2. With a single selection, use explicit frame selection OR
                        //    the selected node's parent frame as destination context.
                        //    This matches Figma-style paste intent where child selection
                        //    still pastes into its containing frame.
                        // 3. Otherwise regular paste targets top-level unless same-source
                        //    context preservation applies below.
                        let targetFrame: FrameNode | null = null
                        if (state.enteredFrameId) {
                            const f = findNodeById(
                                state.nodes,
                                state.enteredFrameId
                            ) as FrameNode | null
                            if (f && f.type === 'frame') targetFrame = f
                        } else if (state.selectedIds.length === 1) {
                            const selectedId = state.selectedIds[0]
                            const selectedNode = findNodeById(state.nodes, selectedId)

                            if (selectedNode?.type === 'frame') {
                                if (!copiedSourceIds.has(selectedNode.id)) {
                                    targetFrame = selectedNode
                                }
                            } else {
                                const parentInfo = findParentOfNode(state.nodes, selectedId)
                                const parentFrame = parentInfo?.parent
                                if (
                                    parentFrame &&
                                    parentFrame.type === 'frame' &&
                                    !copiedSourceIds.has(parentFrame.id)
                                ) {
                                    targetFrame = parentFrame
                                }
                            }
                        }

                        // Preserve source parent context for same-page copy/paste
                        if (!targetFrame && clipboardMeta?.sourcePageId === state.activePageId) {
                            const parentKeys = new Set(
                                sourceEntries.map((entry) => entry.sourceParentId ?? '__TOP__')
                            )
                            if (parentKeys.size === 1) {
                                const sourceParentId = sourceEntries[0]?.sourceParentId ?? null
                                if (sourceParentId) {
                                    if (hasActiveSourceSelection) {
                                        const parent = findNodeById(state.nodes, sourceParentId)
                                        if (parent && parent.type === 'frame') {
                                            targetFrame = parent as FrameNode
                                        }
                                    }
                                }
                            }
                        }

                        const isTopLevelFramePaste =
                            !targetFrame &&
                            clipboardMeta?.sourcePageId === state.activePageId &&
                            clipboard.length > 0 &&
                            clipboard.length === sourceEntries.length &&
                            clipboard.every((node) => node.type === 'frame') &&
                            sourceEntries.every((entry) => entry.sourceParentId === null)

                        let topLevelPasteShiftX: number | null = null
                        if (isTopLevelFramePaste) {
                            topLevelPasteShiftX = getTopLevelFrameShiftX(
                                state.nodes,
                                clipboard,
                                sourceEntries,
                                TOP_LEVEL_FRAME_GAP,
                            )
                        }

                        for (let i = 0; i < clipboard.length; i++) {
                            const original = clipboard[i]
                            const clone = deepCloneWithNewIds(original)
                            const sourceMeta = sourceEntries[i]

                            if (targetFrame) {
                                let nextX = clone.x
                                let nextY = clone.y

                                const inFrameBounds =
                                    nextX >= -clone.width && nextX <= targetFrame.width &&
                                    nextY >= -clone.height && nextY <= targetFrame.height

                                if (sourceMeta?.sourceParentId === targetFrame.id) {
                                    nextX += PASTE_OFFSET
                                    nextY += PASTE_OFFSET
                                } else if (!inFrameBounds) {
                                    // Cross-context paste — center constrained axes
                                    if (nextX < -clone.width || nextX > targetFrame.width) {
                                        nextX = (targetFrame.width - clone.width) / 2
                                    }
                                    if (nextY < -clone.height || nextY > targetFrame.height) {
                                        nextY = (targetFrame.height - clone.height) / 2
                                    }
                                } else {
                                    nextX += PASTE_OFFSET
                                    nextY += PASTE_OFFSET
                                }

                                clone.x = nextX
                                clone.y = nextY
                                targetFrame.children.push(clone)
                            } else {
                                if (topLevelPasteShiftX !== null && sourceMeta) {
                                    clone.x = sourceMeta.sourceCanvasX + topLevelPasteShiftX
                                    clone.y = sourceMeta.sourceCanvasY
                                } else {
                                    clone.x += PASTE_OFFSET
                                    clone.y += PASTE_OFFSET
                                }
                                state.nodes.push(clone)
                            }
                            newIds.push(clone.id)
                        }

                        state.selectedIds = newIds
                        const nextClipboard = buildClipboardState(
                            state.nodes,
                            newIds,
                            state.activePageId
                        )
                        state._clipboard = nextClipboard.clipboard
                        state._clipboardMeta = nextClipboard.meta
                        state._pasteAnchor = null
                    },
                    false,
                    'pasteNodes'
                ),

            pasteOverSelection: () =>
                set(
                    (state) => {
                        const clipboard = current(state._clipboard) as ScytleNode[]
                        if (clipboard.length === 0 || state.selectedIds.length === 0) return
                        _snap(state)

                        const sourceEntries = state._clipboardMeta?.entries ?? []
                        const newIds: string[] = []

                        const selectedTargets = state.selectedIds
                            .map((id) => findNodeById(state.nodes, id))
                            .filter((n): n is ScytleNode => !!n)

                        if (selectedTargets.length === 1 && clipboard.length > 1) {
                            const target = selectedTargets[0]
                            const targetCanvas = getNodeCanvasPosition(state.nodes, target.id)
                            if (!targetCanvas) return

                            const targetParentInfo = findParentOfNode(state.nodes, target.id)
                            const targetParent = targetParentInfo?.parent ?? null
                            const targetParentCanvas = targetParent
                                ? getNodeCanvasPosition(state.nodes, targetParent.id)
                                : null

                            const baseSource = sourceEntries[0] ?? {
                                sourceCanvasX: clipboard[0].x,
                                sourceCanvasY: clipboard[0].y,
                            }

                            for (let i = 0; i < clipboard.length; i++) {
                                const original = clipboard[i]
                                const clone = deepCloneWithNewIds(original)
                                const sourceMeta = sourceEntries[i]

                                const deltaX = sourceMeta
                                    ? sourceMeta.sourceCanvasX - baseSource.sourceCanvasX
                                    : original.x - clipboard[0].x
                                const deltaY = sourceMeta
                                    ? sourceMeta.sourceCanvasY - baseSource.sourceCanvasY
                                    : original.y - clipboard[0].y

                                const canvasX = targetCanvas.x + deltaX
                                const canvasY = targetCanvas.y + deltaY

                                if (targetParent) {
                                    clone.x = canvasX - (targetParentCanvas?.x ?? 0)
                                    clone.y = canvasY - (targetParentCanvas?.y ?? 0)
                                    targetParent.children.push(clone)
                                } else {
                                    clone.x = canvasX
                                    clone.y = canvasY
                                    state.nodes.push(clone)
                                }

                                newIds.push(clone.id)
                            }
                        } else {
                            for (let i = 0; i < selectedTargets.length; i++) {
                                const target = selectedTargets[i]
                                const original = clipboard[i % clipboard.length]
                                const clone = deepCloneWithNewIds(original)
                                const targetCanvas = getNodeCanvasPosition(state.nodes, target.id)
                                if (!targetCanvas) continue

                                const targetParentInfo = findParentOfNode(state.nodes, target.id)
                                const targetParent = targetParentInfo?.parent ?? null
                                const targetParentCanvas = targetParent
                                    ? getNodeCanvasPosition(state.nodes, targetParent.id)
                                    : null

                                if (targetParent) {
                                    clone.x = targetCanvas.x - (targetParentCanvas?.x ?? 0)
                                    clone.y = targetCanvas.y - (targetParentCanvas?.y ?? 0)
                                    targetParent.children.push(clone)
                                } else {
                                    clone.x = targetCanvas.x
                                    clone.y = targetCanvas.y
                                    state.nodes.push(clone)
                                }

                                newIds.push(clone.id)
                            }
                        }

                        if (newIds.length === 0) return

                        state.selectedIds = newIds
                        const nextClipboard = buildClipboardState(
                            state.nodes,
                            newIds,
                            state.activePageId
                        )
                        state._clipboard = nextClipboard.clipboard
                        state._clipboardMeta = nextClipboard.meta
                        state._pasteAnchor = null
                    },
                    false,
                    'pasteOverSelection'
                ),

            pasteHere: () =>
                set(
                    (state) => {
                        const clipboard = current(state._clipboard) as ScytleNode[]
                        if (clipboard.length === 0) return
                        _snap(state)

                        const fallbackAnchor = state.viewportRect
                            ? {
                                x: (state.viewportRect.width / 2 - state.panX) / state.zoom,
                                y: (state.viewportRect.height / 2 - state.panY) / state.zoom,
                            }
                            : { x: 0, y: 0 }

                        const anchor = state._pasteAnchor ?? fallbackAnchor
                        const sourceEntries = state._clipboardMeta?.entries ?? []
                        const newIds: string[] = []

                        // Paste here follows cursor placement. For auto-layout parents,
                        // paste on top of the frame (not inside), matching Figma intent.
                        let targetFrame: FrameNode | null = null
                        const containing = findContainingFrame(state.nodes, anchor.x, anchor.y)
                        if (containing) {
                            const candidate = findNodeById(state.nodes, containing.frameId)
                            if (candidate && candidate.type === 'frame' && candidate.layout.mode === 'none') {
                                targetFrame = candidate as FrameNode
                            }
                        }
                        if (!targetFrame && state.enteredFrameId) {
                            const entered = findNodeById(state.nodes, state.enteredFrameId)
                            if (entered && entered.type === 'frame' && entered.layout.mode === 'none') {
                                targetFrame = entered as FrameNode
                            }
                        }

                        const targetFrameCanvas = targetFrame
                            ? getNodeCanvasPosition(state.nodes, targetFrame.id)
                            : null

                        const baseSource = sourceEntries[0] ?? {
                            sourceCanvasX: clipboard[0].x,
                            sourceCanvasY: clipboard[0].y,
                        }

                        for (let i = 0; i < clipboard.length; i++) {
                            const original = clipboard[i]
                            const clone = deepCloneWithNewIds(original)
                            const sourceMeta = sourceEntries[i]

                            const deltaX = sourceMeta
                                ? sourceMeta.sourceCanvasX - baseSource.sourceCanvasX
                                : original.x - clipboard[0].x
                            const deltaY = sourceMeta
                                ? sourceMeta.sourceCanvasY - baseSource.sourceCanvasY
                                : original.y - clipboard[0].y

                            const canvasX = anchor.x + deltaX
                            const canvasY = anchor.y + deltaY

                            if (targetFrame) {
                                clone.x = canvasX - (targetFrameCanvas?.x ?? 0)
                                clone.y = canvasY - (targetFrameCanvas?.y ?? 0)
                                targetFrame.children.push(clone)
                            } else {
                                clone.x = canvasX
                                clone.y = canvasY
                                state.nodes.push(clone)
                            }

                            newIds.push(clone.id)
                        }

                        state.selectedIds = newIds
                        const nextClipboard = buildClipboardState(
                            state.nodes,
                            newIds,
                            state.activePageId
                        )
                        state._clipboard = nextClipboard.clipboard
                        state._clipboardMeta = nextClipboard.meta
                        state._pasteAnchor = null
                    },
                    false,
                    'pasteHere'
                ),

            duplicateNodes: (ids) =>
                set(
                    (state) => {
                        if (ids.length === 0) return
                        _snap(state)

                        const OFFSET = 20
                        const TOP_LEVEL_FRAME_GAP = 40
                        const newIds: string[] = []

                        const originals = ids
                            .map((id) => findNodeById(state.nodes, id))
                            .filter((node): node is ScytleNode => !!node)

                        const isTopLevelFrameDuplicate =
                            originals.length === ids.length &&
                            originals.every((node) => node.type === 'frame') &&
                            ids.every((id) => !findParentOfNode(state.nodes, id)?.parent)

                        if (isTopLevelFrameDuplicate) {
                            const sourceEntries: SourcePositionMeta[] = originals.map((node) => ({
                                sourceCanvasX: node.x,
                                sourceCanvasY: node.y,
                            }))

                            const shiftX = getTopLevelFrameShiftX(
                                state.nodes,
                                originals,
                                sourceEntries,
                                TOP_LEVEL_FRAME_GAP,
                            )

                            for (let i = 0; i < originals.length; i++) {
                                const original = originals[i]
                                const sourceMeta = sourceEntries[i]
                                const clone = deepCloneWithNewIds(
                                    current(original) as ScytleNode
                                )

                                if (shiftX !== null) {
                                    clone.x = sourceMeta.sourceCanvasX + shiftX
                                    clone.y = sourceMeta.sourceCanvasY
                                } else {
                                    clone.x += OFFSET
                                    clone.y += OFFSET
                                }

                                state.nodes.push(clone)
                                newIds.push(clone.id)
                            }

                            state.selectedIds = newIds
                            return
                        }

                        for (const id of ids) {
                            const original = findNodeById(state.nodes, id)
                            if (!original) continue
                            const clone = deepCloneWithNewIds(
                                current(original) as ScytleNode
                            )
                            clone.x += OFFSET
                            clone.y += OFFSET

                            // Insert clone right after original
                            const result = findParentOfNode(state.nodes, id)
                            if (result) {
                                const list = result.parent
                                    ? result.parent.children
                                    : state.nodes
                                list.splice(result.index + 1, 0, clone)
                            } else {
                                state.nodes.push(clone)
                            }
                            newIds.push(clone.id)
                        }

                        state.selectedIds = newIds
                    },
                    false,
                    'duplicateNodes'
                ),

            // ── Grouping actions ──────────────────────────────────

            groupNodes: (ids) =>
                set(
                    (state) => {
                        if (ids.length < 2) return
                        _snap(state)

                        // All nodes must share the same parent
                        const firstResult = findParentOfNode(
                            state.nodes,
                            ids[0]
                        )
                        if (!firstResult) return

                        const parentList = firstResult.parent
                            ? firstResult.parent.children
                            : state.nodes

                        // Collect matching nodes in order
                        const nodesToGroup: ScytleNode[] = []
                        const indices: number[] = []
                        for (let i = 0; i < parentList.length; i++) {
                            if (ids.includes(parentList[i].id)) {
                                nodesToGroup.push(
                                    current(parentList[i]) as ScytleNode
                                )
                                indices.push(i)
                            }
                        }

                        if (nodesToGroup.length < 2) return

                        // Calculate bounding box
                        let minX = Infinity,
                            minY = Infinity,
                            maxX = -Infinity,
                            maxY = -Infinity
                        for (const n of nodesToGroup) {
                            minX = Math.min(minX, n.x)
                            minY = Math.min(minY, n.y)
                            maxX = Math.max(maxX, n.x + n.width)
                            maxY = Math.max(maxY, n.y + n.height)
                        }

                        // Create group frame with repositioned children
                        const group = createFrame({
                            x: minX,
                            y: minY,
                            width: maxX - minX,
                            height: maxY - minY,
                            name: 'Group',
                            layout: { mode: 'none' },
                            children: nodesToGroup.map((n) => ({
                                ...n,
                                x: n.x - minX,
                                y: n.y - minY,
                            })) as FrameNode['children'],
                        })

                        // Remove old nodes (reverse order)
                        for (let i = indices.length - 1; i >= 0; i--) {
                            parentList.splice(indices[i], 1)
                        }

                        // Insert group at first original position
                        parentList.splice(indices[0], 0, group)
                        state.selectedIds = [group.id]
                    },
                    false,
                    'groupNodes'
                ),

            ungroupNodes: (id) =>
                set(
                    (state) => {
                        const result = findParentOfNode(state.nodes, id)
                        if (!result) return
                        const node = findNodeById(state.nodes, id)
                        if (!node || node.type !== 'frame') return

                        _snap(state)

                        const parentList = result.parent
                            ? result.parent.children
                            : state.nodes

                        // Restore children with adjusted positions
                        const children = (node as FrameNode).children.map(
                            (child) => {
                                const c = current(child) as ScytleNode
                                return {
                                    ...c,
                                    x: c.x + node.x,
                                    y: c.y + node.y,
                                }
                            }
                        )

                        // Replace group with its children
                        parentList.splice(
                            result.index,
                            1,
                            ...(children as ScytleNode[])
                        )

                        state.selectedIds = children.map((c) => c.id)
                    },
                    false,
                    'ungroupNodes'
                ),

            // ── Reparent action ────────────────────────────────────

            moveNodeToFrame: (nodeId, newParentId) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node) return
                        const targetFrame = findNodeById(
                            state.nodes,
                            newParentId
                        ) as FrameNode | null
                        if (!targetFrame || targetFrame.type !== 'frame') return

                        const currentParent = findParentOfNode(state.nodes, nodeId)
                        // Already in this frame
                        if (currentParent?.parent?.id === newParentId) return

                        // Get canvas-absolute positions before mutation
                        const nodeCanvasPos = getNodeCanvasPosition(state.nodes, nodeId)
                        const targetCanvasPos = getNodeCanvasPosition(state.nodes, newParentId)
                        if (!nodeCanvasPos || !targetCanvasPos) return

                        _snap(state)

                        // Deep-serialize before removal (safe with immer)
                        const nodeData = JSON.parse(JSON.stringify(node)) as ScytleNode

                        // Remove from current parent
                        if (currentParent) {
                            const list = currentParent.parent
                                ? currentParent.parent.children
                                : state.nodes
                            const idx = list.findIndex(
                                (n: ScytleNode) => n.id === nodeId
                            )
                            if (idx !== -1) list.splice(idx, 1)
                        }

                        // Set new relative position
                        nodeData.x = nodeCanvasPos.x - targetCanvasPos.x
                        nodeData.y = nodeCanvasPos.y - targetCanvasPos.y

                        targetFrame.children.push(nodeData)
                    },
                    false,
                    'moveNodeToFrame'
                ),

            moveNodeToTopLevel: (nodeId) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node) return

                        const currentParent = findParentOfNode(state.nodes, nodeId)
                        if (!currentParent?.parent) return // Already top-level

                        // Get canvas-absolute position before mutation
                        const canvasPos = getNodeCanvasPosition(state.nodes, nodeId)
                        if (!canvasPos) return

                        _snap(state)

                        // Deep-serialize before removal (safe with immer)
                        const nodeData = JSON.parse(JSON.stringify(node)) as ScytleNode

                        // Remove from current parent
                        const list = currentParent.parent.children
                        const idx = list.findIndex(
                            (n: ScytleNode) => n.id === nodeId
                        )
                        if (idx !== -1) list.splice(idx, 1)

                        // Set absolute position
                        nodeData.x = canvasPos.x
                        nodeData.y = canvasPos.y

                        state.nodes.push(nodeData)
                    },
                    false,
                    'moveNodeToTopLevel'
                ),

            // Project persistence ----------------------------------

            initForProject: (projectId) => {
                const state = get()

                // Already loaded for this project — no-op
                if (state._projectId === projectId) return

                // Set project ID and FULLY reset state.
                // Pages and activePageId are set by the sync server's init message.
                // Do NOT create pages here — sync.ts createDefaultPage() handles it.
                set(
                    (draft) => {
                        draft._projectId = projectId
                        // Clear canvas data from previous project
                        draft.pages = []
                        draft.activePageId = ''
                        draft.nodes = []
                        draft.canvasColor = '#F5F5F5'
                        draft.zoom = 1
                        draft.panX = 0
                        draft.panY = 0
                        draft.hasEverHadNodes = false
                        // Reset interaction state
                        draft.selectedIds = []
                        draft.hoveredId = null
                        draft.enteredFrameId = null
                        draft.editingNodeId = null
                        draft.isNodeResizeActive = false
                        draft.vectorEditNodeId = null
                        draft.vectorEditTool = 'move'
                        draft.selectedVertexIndices = []
                        draft.penDrawingState = null
                        draft._past = []
                        draft._future = []
                        draft._batchDepth = 0
                        draft._clipboard = []
                        draft._clipboardMeta = null
                        draft._pasteAnchor = null
                    },
                    false,
                    'initForProject'
                )
            },

            setSelectedIds: (ids) =>
                set(
                    (state) => {
                        state.selectedIds = ids
                        if (ids.length === 0) {
                            state._pasteAnchor = null
                        }
                    },
                    false,
                    'setSelectedIds'
                ),

            // Page management ──────────────────────────────────

            addPage: (name) => {
                const page = createEditorPage(name ?? `Page ${get().pages.length + 1}`)
                // Save current page state before switching
                set(
                    (draft) => {
                        // Sync active page with current canvas
                        const idx = draft.pages.findIndex((p: EditorPage) => p.id === draft.activePageId)
                        if (idx !== -1) {
                            draft.pages[idx].nodes = draft.nodes
                            draft.pages[idx].canvasColor = draft.canvasColor
                            draft.pages[idx].zoom = draft.zoom
                            draft.pages[idx].panX = draft.panX
                            draft.pages[idx].panY = draft.panY
                        }
                        // Add new page and switch to it
                        draft.pages.push(page)
                        draft.activePageId = page.id
                        draft.nodes = []
                        draft.canvasColor = '#F5F5F5'
                        draft.zoom = 1
                        draft.panX = 0
                        draft.panY = 0
                        // Reset interaction state
                        draft.selectedIds = []
                        draft.hoveredId = null
                        draft.enteredFrameId = null
                        draft.editingNodeId = null
                        draft.vectorEditNodeId = null
                        draft.vectorEditTool = 'move'
                        draft.selectedVertexIndices = []
                        draft.penDrawingState = null
                        draft._past = []
                        draft._future = []
                    },
                    false,
                    'addPage'
                )
                if (!canvasSync._applyingRemote) {
                    canvasSync.sendPageAdd({
                        id: page.id,
                        name: page.name,
                        canvasColor: page.canvasColor,
                        zoom: page.zoom,
                        panX: page.panX,
                        panY: page.panY,
                    })
                    canvasSync.sendPageSwitch(page.id)
                }
                return page.id
            },

            deletePage: (pageId) => {
                const state = get()
                if (state.pages.length <= 1) return // can't delete last page
                const idx = state.pages.findIndex((p) => p.id === pageId)
                if (idx === -1) return

                const wasActive = pageId === state.activePageId
                // Pick replacement page if deleting active
                const nextPage = wasActive
                    ? state.pages[idx === 0 ? 1 : idx - 1]
                    : null

                set(
                    (draft) => {
                        draft.pages.splice(idx, 1)
                        if (wasActive && nextPage) {
                            draft.activePageId = nextPage.id
                            draft.nodes = [...nextPage.nodes]
                            draft.canvasColor = nextPage.canvasColor
                            draft.zoom = nextPage.zoom
                            draft.panX = nextPage.panX
                            draft.panY = nextPage.panY
                            draft.selectedIds = []
                            draft.hoveredId = null
                            draft.enteredFrameId = null
                            draft.editingNodeId = null
                            draft.vectorEditNodeId = null
                            draft.vectorEditTool = 'move'
                            draft.selectedVertexIndices = []
                            draft.penDrawingState = null
                            draft._past = []
                            draft._future = []
                        }
                    },
                    false,
                    'deletePage'
                )
                if (!canvasSync._applyingRemote) {
                    canvasSync.sendPageDelete(pageId)
                }
            },

            duplicatePage: (pageId) => {
                const state = get()
                const source = state.pages.find((p) => p.id === pageId)
                if (!source) return ''

                const newPage: EditorPage = {
                    id: crypto.randomUUID(),
                    name: `${source.name} (copy)`,
                    // Use current canvas state if duplicating the active page
                    nodes: pageId === state.activePageId ? structuredClone(state.nodes) : structuredClone(source.nodes),
                    canvasColor: pageId === state.activePageId ? state.canvasColor : source.canvasColor,
                    zoom: pageId === state.activePageId ? state.zoom : source.zoom,
                    panX: pageId === state.activePageId ? state.panX : source.panX,
                    panY: pageId === state.activePageId ? state.panY : source.panY,
                }

                set(
                    (draft) => {
                        // Sync active page first
                        const idx = draft.pages.findIndex((p: EditorPage) => p.id === draft.activePageId)
                        if (idx !== -1) {
                            draft.pages[idx].nodes = draft.nodes
                            draft.pages[idx].canvasColor = draft.canvasColor
                            draft.pages[idx].zoom = draft.zoom
                            draft.pages[idx].panX = draft.panX
                            draft.pages[idx].panY = draft.panY
                        }
                        // Insert copy after source
                        const sourceIdx = draft.pages.findIndex((p: EditorPage) => p.id === pageId)
                        draft.pages.splice(sourceIdx + 1, 0, newPage)
                        // Switch to the new page
                        draft.activePageId = newPage.id
                        draft.nodes = [...newPage.nodes]
                        draft.canvasColor = newPage.canvasColor
                        draft.zoom = newPage.zoom
                        draft.panX = newPage.panX
                        draft.panY = newPage.panY
                        draft.selectedIds = []
                        draft.hoveredId = null
                        draft.enteredFrameId = null
                        draft.editingNodeId = null
                        draft.vectorEditNodeId = null
                        draft.vectorEditTool = 'move'
                        draft.selectedVertexIndices = []
                        draft.penDrawingState = null
                        draft._past = []
                        draft._future = []
                    },
                    false,
                    'duplicatePage'
                )
                if (!canvasSync._applyingRemote) {
                    canvasSync.sendPageAdd({
                        id: newPage.id,
                        name: newPage.name,
                        canvasColor: newPage.canvasColor,
                        zoom: newPage.zoom,
                        panX: newPage.panX,
                        panY: newPage.panY,
                    })
                    // Send all nodes for the duplicated page (subscriber skips on page switch)
                    for (const node of newPage.nodes) {
                        canvasSync.sendAdd(node, newPage.id)
                    }
                    canvasSync.sendPageSwitch(newPage.id)
                }
                return newPage.id
            },

            renamePage: (pageId, name) => {
                set(
                    (draft) => {
                        const page = draft.pages.find((p: EditorPage) => p.id === pageId)
                        if (page) page.name = name
                    },
                    false,
                    'renamePage'
                )
                if (!canvasSync._applyingRemote) {
                    canvasSync.sendPageRename(pageId, name)
                }
            },

            switchPage: (pageId) => {
                const state = get()
                if (pageId === state.activePageId) return
                const target = state.pages.find((p) => p.id === pageId)
                if (!target) return

                set(
                    (draft) => {
                        // Save current page state
                        const idx = draft.pages.findIndex((p: EditorPage) => p.id === draft.activePageId)
                        if (idx !== -1) {
                            draft.pages[idx].nodes = draft.nodes
                            draft.pages[idx].canvasColor = draft.canvasColor
                            draft.pages[idx].zoom = draft.zoom
                            draft.pages[idx].panX = draft.panX
                            draft.pages[idx].panY = draft.panY
                        }
                        // Load target page
                        draft.activePageId = target.id
                        draft.nodes = [...target.nodes]
                        draft.canvasColor = target.canvasColor
                        draft.zoom = target.zoom
                        draft.panX = target.panX
                        draft.panY = target.panY
                        // Reset interaction state
                        draft.selectedIds = []
                        draft.hoveredId = null
                        draft.enteredFrameId = null
                        draft.editingNodeId = null
                        draft.vectorEditNodeId = null
                        draft.vectorEditTool = 'move'
                        draft.selectedVertexIndices = []
                        draft.penDrawingState = null
                        draft._past = []
                        draft._future = []
                    },
                    false,
                    'switchPage'
                )
                if (!canvasSync._applyingRemote) {
                    canvasSync.sendPageSwitch(pageId)
                }
            },

            enterVectorEditMode: (nodeId) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        state.vectorEditNodeId = nodeId
                        state.vectorEditTool = 'move'
                        state.selectedVertexIndices = []
                        state.penDrawingState = null
                        state.selectedIds = [nodeId]
                    },
                    false,
                    'enterVectorEditMode'
                ),

            exitVectorEditMode: () =>
                set(
                    (state) => {
                        // Figma: exiting vector edit keeps the node selected
                        const nodeId = state.vectorEditNodeId

                        // Recompute bounding box from current vertex positions
                        if (nodeId) {
                            const node = findNodeById(state.nodes, nodeId)
                            if (node && node.type === 'vector') {
                                _snap(state)
                                _recomputeVectorBBox(node as VectorNode)
                            }
                        }

                        state.vectorEditNodeId = null
                        state.vectorEditTool = 'move'
                        state.selectedVertexIndices = []
                        state.penDrawingState = null
                        state.activeTool = 'select'
                        // Ensure the node remains in selectedIds
                        if (nodeId && !state.selectedIds.includes(nodeId)) {
                            state.selectedIds = [nodeId]
                        }
                    },
                    false,
                    'exitVectorEditMode'
                ),

            setVectorEditTool: (tool) =>
                set(
                    (state) => {
                        // Clear vertex selection when leaving lasso, but not when auto-switching to move
                        if (state.vectorEditTool === 'lasso' && tool !== 'lasso' && tool !== 'move') {
                            state.selectedVertexIndices = []
                        }
                        state.vectorEditTool = tool
                    },
                    false,
                    'setVectorEditTool'
                ),

            selectVertices: (indices, additive = false) =>
                set(
                    (state) => {
                        if (additive) {
                            const merged = new Set([...state.selectedVertexIndices, ...indices])
                            state.selectedVertexIndices = [...merged]
                        } else {
                            state.selectedVertexIndices = indices
                        }
                    },
                    false,
                    'selectVertices'
                ),

            deselectVertices: () =>
                set(
                    (state) => {
                        state.selectedVertexIndices = []
                    },
                    false,
                    'deselectVertices'
                ),

            updateVertex: (nodeId, index, patch) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        const vn = (node as VectorNode).vectorNetwork
                        const v = vn.vertices[index]
                        if (!v) return
                        _snap(state)
                        Object.assign(v, patch)
                    },
                    false,
                    'updateVertex'
                ),

            addVertex: (nodeId, vertex, afterSegmentIndex) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        _snap(state)
                        const vn = (node as VectorNode).vectorNetwork
                        const newIdx = vn.vertices.length
                        vn.vertices.push(vertex)

                        if (afterSegmentIndex !== undefined) {
                            // Split the segment: remove old segment, insert two new
                            const seg = vn.segments[afterSegmentIndex]
                            if (seg) {
                                vn.segments.splice(afterSegmentIndex, 1,
                                    { start: seg.start, end: newIdx },
                                    { start: newIdx, end: seg.end }
                                )
                            }
                        }
                    },
                    false,
                    'addVertex'
                ),

            deleteSelectedVertices: (nodeId) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        if (state.selectedVertexIndices.length === 0) return
                        _snap(state)

                        const vn = (node as VectorNode).vectorNetwork
                        const toDelete = new Set(state.selectedVertexIndices)

                        // Build index remapping (old index -> new index)
                        const remap: Record<number, number> = {}
                        let nextIdx = 0
                        for (let i = 0; i < vn.vertices.length; i++) {
                            if (!toDelete.has(i)) {
                                remap[i] = nextIdx++
                            }
                        }

                        // Filter vertices
                        vn.vertices = vn.vertices.filter((_, i) => !toDelete.has(i))

                        // Filter & remap segments (drop any touching deleted vertices)
                        vn.segments = vn.segments
                            .filter((s) => !toDelete.has(s.start) && !toDelete.has(s.end))
                            .map((s) => ({
                                ...s,
                                start: remap[s.start],
                                end: remap[s.end],
                            }))

                        // Clear regions (would need full recomputation)
                        vn.regions = []

                        state.selectedVertexIndices = []
                    },
                    false,
                    'deleteSelectedVertices'
                ),

            updateVectorNetwork: (nodeId, network) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        _snap(state);
                        (node as VectorNode).vectorNetwork = network
                    },
                    false,
                    'updateVectorNetwork'
                ),

            insertPointOnSegment: (nodeId, segIdx, t) =>
                set(
                    (state) => {
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return
                        _snap(state)
                        const net = (node as VectorNode).vectorNetwork
                        const seg = net.segments[segIdx]
                        if (!seg) return

                        const startV = net.vertices[seg.start]
                        const endV = net.vertices[seg.end]
                        if (!startV || !endV) return

                        const ts = seg.tangentStart ?? { x: 0, y: 0 }
                        const te = seg.tangentEnd ?? { x: 0, y: 0 }

                        // Evaluate position on bezier at t
                        const mt = 1 - t
                        const newX = mt * mt * mt * startV.x + 3 * mt * mt * t * (startV.x + ts.x) +
                            3 * mt * t * t * (endV.x + te.x) + t * t * t * endV.x
                        const newY = mt * mt * mt * startV.y + 3 * mt * mt * t * (startV.y + ts.y) +
                            3 * mt * t * t * (endV.y + te.y) + t * t * t * endV.y

                        // Single new vertex (connected — no break)
                        const newVertIdx = net.vertices.length
                        const newVertex: VectorVertex = { x: newX, y: newY, handleMirroring: 'NONE' }

                        // de Casteljau subdivision at t
                        const p0 = { x: startV.x, y: startV.y }
                        const p1 = { x: startV.x + ts.x, y: startV.y + ts.y }
                        const p2 = { x: endV.x + te.x, y: endV.y + te.y }
                        const p3 = { x: endV.x, y: endV.y }

                        const q1 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) }
                        const r2 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }
                        const r3_pre = { x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) }
                        const q2 = { x: q1.x + t * (r2.x - q1.x), y: q1.y + t * (r2.y - q1.y) }
                        const r2b = { x: r2.x + t * (r3_pre.x - r2.x), y: r2.y + t * (r3_pre.y - r2.y) }

                        // First half: seg.start → newVertex (connected)
                        const firstHalf: VectorSegment = {
                            start: seg.start,
                            end: newVertIdx,
                            tangentStart: { x: q1.x - p0.x, y: q1.y - p0.y },
                            tangentEnd: { x: q2.x - newX, y: q2.y - newY },
                        }
                        // Second half: newVertex → seg.end (connected)
                        const secondHalf: VectorSegment = {
                            start: newVertIdx,
                            end: seg.end,
                            tangentStart: { x: r2b.x - newX, y: r2b.y - newY },
                            tangentEnd: { x: r3_pre.x - p3.x, y: r3_pre.y - p3.y },
                        }

                        // Replace original segment with two halves
                        net.vertices.push(newVertex)
                        net.segments.splice(segIdx, 1, firstHalf, secondHalf)

                        // If pen tool is active, start drawing from the new vertex
                        // so user can continue placing points with dashed preview line
                        if (state.activeTool === 'pen') {
                            // Pen tool uses canvas-absolute coords, so convert node-relative to absolute
                            const absX = node.x + newX
                            const absY = node.y + newY
                            state.penDrawingState = {
                                nodeId,
                                vertices: [{ x: absX, y: absY }],
                                segments: [],
                                isDrawing: true,
                                cursorX: absX,
                                cursorY: absY,
                                nearStartPoint: false,
                                _extendFromVertexIndex: newVertIdx,
                            }
                            state.vectorEditNodeId = null
                            state.vectorEditTool = 'move'
                            state.selectedVertexIndices = []
                            state.selectedIds = [nodeId]
                        } else {
                            // Enter vector edit mode on this node and select the new vertex
                            state.vectorEditNodeId = nodeId
                            state.vectorEditTool = 'move'
                            state.selectedVertexIndices = [newVertIdx]
                            state.selectedIds = [nodeId]
                        }
                    },
                    false,
                    'insertPointOnSegment'
                ),

            setPenDrawingState: (penState) =>
                set(
                    (state) => {
                        state.penDrawingState = penState
                    },
                    false,
                    'setPenDrawingState'
                ),

            commitPenPath: () =>
                set(
                    (state) => {
                        const ps = state.penDrawingState
                        if (!ps) return

                        // Need at least 2 vertices for a valid path
                        if (ps.vertices.length < 2) {
                            // Delete the empty vector node (only if we created it, not extending)
                            if (ps._extendFromVertexIndex == null) {
                                const idx = state.nodes.findIndex((n) => n.id === ps.nodeId)
                                if (idx !== -1) state.nodes.splice(idx, 1)
                                state.selectedIds = state.selectedIds.filter((id) => id !== ps.nodeId)
                            }
                            state.penDrawingState = null
                            return
                        }

                        const node = findNodeById(state.nodes, ps.nodeId)
                        if (!node || node.type !== 'vector') return

                        _snap(state)

                        const vn = (node as VectorNode).vectorNetwork

                        // ── Extend mode: merge new vertices/segments into existing network ──
                        if (ps._extendFromVertexIndex != null) {
                            const existingVertexCount = vn.vertices.length
                            // Skip ps.vertices[0] — it's a copy of the extend-from vertex
                            // Also skip the last vertex if _extendToVertexIndex is set (it maps to existing)
                            const hasExtendTo = ps._extendToVertexIndex != null
                            const newVertices = hasExtendTo
                                ? ps.vertices.slice(1, -1)  // skip first AND last
                                : ps.vertices.slice(1)       // skip first only
                            const baseIdx = existingVertexCount

                            // Convert new vertices from canvas-absolute to node-relative coords
                            for (const nv of newVertices) {
                                nv.x -= node.x
                                nv.y -= node.y
                                vn.vertices.push(nv)
                            }

                            // Remap and append segments
                            const lastPsIdx = ps.vertices.length - 1
                            for (const seg of ps.segments) {
                                const remapIdx = (i: number) => {
                                    if (i === 0) return ps._extendFromVertexIndex!
                                    if (hasExtendTo && i === lastPsIdx) return ps._extendToVertexIndex!
                                    return baseIdx + (i - 1)
                                }
                                vn.segments.push({
                                    start: remapIdx(seg.start),
                                    end: remapIdx(seg.end),
                                    ...(seg.tangentStart ? { tangentStart: seg.tangentStart } : {}),
                                    ...(seg.tangentEnd ? { tangentEnd: seg.tangentEnd } : {}),
                                })
                            }

                            // Recompute bounding box for the whole node
                            _recomputeVectorBBox(node as VectorNode)
                        } else {
                            // ── Normal mode: replace entire network ──
                            vn.vertices = ps.vertices
                            vn.segments = ps.segments

                            // Recalculate bounding box from ALL vertices AND bezier control points
                            if (vn.vertices.length > 0) {
                                let minX = Infinity, minY = Infinity
                                let maxX = -Infinity, maxY = -Infinity

                                // Include vertex positions
                                for (const v of vn.vertices) {
                                    if (v.x < minX) minX = v.x
                                    if (v.y < minY) minY = v.y
                                    if (v.x > maxX) maxX = v.x
                                    if (v.y > maxY) maxY = v.y
                                }

                                // Include bezier control points (tangent extents)
                                for (const seg of vn.segments) {
                                    const startV = vn.vertices[seg.start]
                                    const endV = vn.vertices[seg.end]
                                    if (!startV || !endV) continue

                                    if (seg.tangentStart) {
                                        const cpX = startV.x + seg.tangentStart.x
                                        const cpY = startV.y + seg.tangentStart.y
                                        if (cpX < minX) minX = cpX
                                        if (cpY < minY) minY = cpY
                                        if (cpX > maxX) maxX = cpX
                                        if (cpY > maxY) maxY = cpY
                                    }
                                    if (seg.tangentEnd) {
                                        const cpX = endV.x + seg.tangentEnd.x
                                        const cpY = endV.y + seg.tangentEnd.y
                                        if (cpX < minX) minX = cpX
                                        if (cpY < minY) minY = cpY
                                        if (cpX > maxX) maxX = cpX
                                        if (cpY > maxY) maxY = cpY
                                    }
                                }

                                // Add padding for stroke width (half on each side for center-aligned stroke)
                                const strokePad = resolveVectorStroke(node as VectorNode).width / 2
                                minX -= strokePad
                                minY -= strokePad
                                maxX += strokePad
                                maxY += strokePad

                                // Offset all vertices so origin is top-left of bounding box
                                for (const v of vn.vertices) {
                                    v.x -= minX
                                    v.y -= minY
                                }

                                // Tangents are relative to their vertex, so no adjustment needed

                                // Update node position and dimensions
                                node.x += minX
                                node.y += minY
                                node.width = Math.max(maxX - minX, 1)
                                node.height = Math.max(maxY - minY, 1)
                            }
                        } // end normal mode else

                        // Clear drawing state
                        state.penDrawingState = null
                        // Remember committed node so toolbar can enter vector edit mode
                        state.lastPenCommittedNodeId = ps.nodeId

                        // Figma behavior: stay in pen tool after closing/committing a path
                        // so the user can immediately draw another shape.
                        // Deselect the committed node — don't switch to select tool.
                        state.selectedIds = []
                        // activeTool stays as 'pen'
                        state.vectorEditNodeId = null
                        state.vectorEditTool = 'move'
                        state.selectedVertexIndices = []
                    },
                    false,
                    'commitPenPath'
                ),

            commitPenAndEnterVectorEdit: (tool) =>
                set(
                    (state) => {
                        let nodeId: string | null = null

                        // Case 1: still drawing (open path)
                        const ps = state.penDrawingState
                        if (ps && ps.vertices.length >= 2) {
                            nodeId = ps.nodeId
                            // Inline commitPenPath logic
                            const node = findNodeById(state.nodes, ps.nodeId)
                            if (node && node.type === 'vector') {
                                _snap(state)
                                const vn = (node as VectorNode).vectorNetwork
                                vn.vertices = ps.vertices
                                vn.segments = ps.segments
                                if (ps.vertices.length > 0) {
                                    let minX = Infinity, minY = Infinity
                                    let maxX = -Infinity, maxY = -Infinity
                                    for (const v of ps.vertices) {
                                        if (v.x < minX) minX = v.x
                                        if (v.y < minY) minY = v.y
                                        if (v.x > maxX) maxX = v.x
                                        if (v.y > maxY) maxY = v.y
                                    }
                                    for (const seg of ps.segments) {
                                        const sv = ps.vertices[seg.start]
                                        const ev = ps.vertices[seg.end]
                                        if (!sv || !ev) continue
                                        if (seg.tangentStart) {
                                            const cpX = sv.x + seg.tangentStart.x
                                            const cpY = sv.y + seg.tangentStart.y
                                            if (cpX < minX) minX = cpX
                                            if (cpY < minY) minY = cpY
                                            if (cpX > maxX) maxX = cpX
                                            if (cpY > maxY) maxY = cpY
                                        }
                                        if (seg.tangentEnd) {
                                            const cpX = ev.x + seg.tangentEnd.x
                                            const cpY = ev.y + seg.tangentEnd.y
                                            if (cpX < minX) minX = cpX
                                            if (cpY < minY) minY = cpY
                                            if (cpX > maxX) maxX = cpX
                                            if (cpY > maxY) maxY = cpY
                                        }
                                    }
                                    for (const v of vn.vertices) {
                                        v.x -= minX
                                        v.y -= minY
                                    }
                                    node.x += minX
                                    node.y += minY
                                    node.width = Math.max(maxX - minX, 1)
                                    node.height = Math.max(maxY - minY, 1)
                                }
                            }
                            state.penDrawingState = null
                        } else if (!ps && state.lastPenCommittedNodeId) {
                            // Case 2: path already closed (click-to-close)
                            nodeId = state.lastPenCommittedNodeId
                        }

                        if (!nodeId) return

                        // Enter vector edit mode on the node
                        const node = findNodeById(state.nodes, nodeId)
                        if (!node || node.type !== 'vector') return

                        state.vectorEditNodeId = nodeId
                        state.vectorEditTool = tool
                        state.selectedVertexIndices = []
                        state.activeTool = 'select'
                        state.selectedIds = [nodeId]
                        state.lastPenCommittedNodeId = null
                    },
                    false,
                    'commitPenAndEnterVectorEdit'
                ),
        })),
        { name: 'editor-store' }
    )
)

// ── Bind sync client to store ─────────────────────────────────
canvasSync.bindStore(
    () => useEditorStore.getState(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useEditorStore.setState as any
)

// ============================================================
// Auto-Sync Subscriber: diff-based sync for ALL node mutations
// ============================================================
//
// Instead of manually calling canvasSync.send*() from each action,
// this subscriber watches every state change and auto-diffs the
// nodes tree. This catches ALL mutations: undo, redo, paste,
// group, ungroup, reparent, vector edits, etc.
//
// Inspired by tldraw's store listener approach.
// ============================================================

if (typeof window !== 'undefined') {
    /** Flatten a node tree into a Map<id, serialized JSON string (without children for frames)> */
    function flattenNodes(nodes: ScytleNode[]): Map<string, string> {
        const map = new Map<string, string>()
        function walk(nodeList: ScytleNode[]) {
            for (const node of nodeList) {
                if (node.type === 'frame' && 'children' in node) {
                    const { children, ...rest } = node as FrameNode
                    map.set(node.id, JSON.stringify(rest))
                    walk(children)
                } else {
                    map.set(node.id, JSON.stringify(node))
                }
            }
        }
        walk(nodes)
        return map
    }

    /** Get child ID lists for each top-level frame (for structural diff) */
    function getFrameChildIds(nodes: ScytleNode[]): Map<string, string[]> {
        const map = new Map<string, string[]>()
        function collectIds(children: ScytleNode[]): string[] {
            const ids: string[] = []
            for (const c of children) {
                ids.push(c.id)
                if (c.type === 'frame' && 'children' in c) {
                    ids.push(...collectIds((c as FrameNode).children))
                }
            }
            return ids
        }
        for (const node of nodes) {
            if (node.type === 'frame' && 'children' in node) {
                map.set(node.id, collectIds((node as FrameNode).children))
            }
        }
        return map
    }

    // Track previous state for diffing
    let prevFlat: Map<string, string> = new Map()
    let prevTopIds: string[] = []
    let prevActivePageId: string = ''
    let prevNodesRef: ScytleNode[] = []
    let prevChildIds: Map<string, string[]> = new Map()

    useEditorStore.subscribe((state) => {
        // Skip if this change was caused by a remote sync
        if (canvasSync._applyingRemote) return
        // Skip if not connected
        if (canvasSync.status !== 'connected') return
        // Defer expensive sync diffing while interaction batches are active.
        // We'll diff once after batch ends using the latest node tree.
        if (state._batchDepth > 0 || state.isNodeResizeActive) return

        const { nodes, activePageId } = state

        // Quick check: if nodes reference didn't change, no mutation happened
        if (nodes === prevNodesRef && activePageId === prevActivePageId) return
        prevNodesRef = nodes

        // If page switched, just reset the snapshot — don't diff
        if (activePageId !== prevActivePageId) {
            prevActivePageId = activePageId
            prevFlat = flattenNodes(nodes)
            prevTopIds = nodes.map(n => n.id)
            prevChildIds = getFrameChildIds(nodes)
            return
        }

        // Flatten current nodes (each node individually, without children)
        const curFlat = flattenNodes(nodes)
        const curTopIds = nodes.map(n => n.id)
        const curChildIds = getFrameChildIds(nodes)

        // ── 1. Top-level adds/deletes ─────────────────────────────
        const prevTopSet = new Set(prevTopIds)
        const curTopSet = new Set(curTopIds)

        for (const id of curTopIds) {
            if (!prevTopSet.has(id)) {
                const node = nodes.find(n => n.id === id)
                if (node) canvasSync.sendAdd(node, activePageId)
            }
        }
        for (const id of prevTopIds) {
            if (!curTopSet.has(id)) {
                canvasSync.sendDelete(id, activePageId)
            }
        }

        // ── 2. Top-level reorder ──────────────────────────────────
        if (curTopIds.length === prevTopIds.length &&
            curTopIds.length > 0 &&
            curTopIds.every(id => prevTopSet.has(id)) &&
            curTopIds.some((id, i) => id !== prevTopIds[i])) {
            canvasSync.sendReorder(activePageId, curTopIds)
        }

        // ── 3. Property changes (on all nodes, including nested) ──
        for (const [id, json] of curFlat) {
            const prevJson = prevFlat.get(id)
            if (prevJson !== undefined && prevJson !== json) {
                const prevNode = JSON.parse(prevJson)
                const curNode = JSON.parse(json)
                const changes: Record<string, unknown> = {}
                for (const key of Object.keys(curNode)) {
                    if (JSON.stringify(prevNode[key]) !== JSON.stringify(curNode[key])) {
                        changes[key] = curNode[key]
                    }
                }
                for (const key of Object.keys(prevNode)) {
                    if (!(key in curNode)) changes[key] = undefined
                }
                if (Object.keys(changes).length > 0) {
                    canvasSync.sendUpdate(id, changes)
                }
            }
        }

        // ── 4. Structural changes (children added/removed/reordered in frames) ──
        // Compare child ID lists for each frame. If changed, send full children update.
        for (const [frameId, curIds] of curChildIds) {
            const prevIds = prevChildIds.get(frameId)
            if (!prevIds || JSON.stringify(prevIds) !== JSON.stringify(curIds)) {
                const frame = nodes.find(n => n.id === frameId)
                if (frame && frame.type === 'frame') {
                    canvasSync.sendUpdate(frameId, { children: (frame as FrameNode).children })
                }
            }
        }
        // Also check for frames that lost all children or were removed
        for (const [frameId] of prevChildIds) {
            if (!curChildIds.has(frameId) && curTopSet.has(frameId)) {
                // Frame still exists but has no children now
                const frame = nodes.find(n => n.id === frameId)
                if (frame && frame.type === 'frame') {
                    canvasSync.sendUpdate(frameId, { children: (frame as FrameNode).children })
                }
            }
        }

        // Update prev snapshot for next diff
        prevFlat = curFlat
        prevTopIds = curTopIds
        prevChildIds = curChildIds
    })

}

