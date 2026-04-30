'use client'

import {
    useState,
    useCallback,
    useRef,
    useEffect,
    type KeyboardEvent as ReactKeyboardEvent,
    type DragEvent,
} from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { ScytleNode, FrameNode } from '@/types/canvas'
import { findParentOfNode, getNodeCanvasPosition } from '@/types/canvas'
import {
    ChevronRight,
    Frame,
    Type,
    Image,
    Eye,
    EyeOff,
    Columns3,
    Rows3,
    LayoutGrid,
    Lock,
    Pen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Constants
// ============================================================

/** Pixels per nesting level */
const INDENT_PX = 16

/** How many px from L/R edge of a row triggers "above/below" vs "inside" */
const EDGE_ZONE = 6

// ============================================================
// Type icon for each node type
// ============================================================

function NodeTypeIcon({ node }: { node: ScytleNode }) {
    const size = 14
    let icon = <Frame className="shrink-0 text-muted-foreground/70" size={size} />

    if (node.type === 'text') {
        icon = <Type className="shrink-0 text-muted-foreground/70" size={size} />
    } else if (node.type === 'image') {
        icon = <Image className="shrink-0 text-muted-foreground/70" size={size} />
    } else if (node.type === 'vector') {
        icon = <Pen className="shrink-0 text-muted-foreground/70" size={size} />
    } else if (node.type === 'frame') {
        const layout = (node as FrameNode).layout
        if (layout.mode === 'flex' && layout.direction === 'row') {
            icon = <Columns3 className="shrink-0 text-muted-foreground/70" size={size} />
        } else if (layout.mode === 'flex' && layout.direction === 'column') {
            icon = <Rows3 className="shrink-0 text-muted-foreground/70" size={size} />
        } else if (layout.mode === 'grid') {
            icon = <LayoutGrid className="shrink-0 text-muted-foreground/70" size={size} />
        }
    }

    return (
        <span data-layer-icon className="flex items-center justify-center shrink-0">
            {icon}
        </span>
    )
}

// ============================================================
// Single layer row
// ============================================================

interface LayerRowProps {
    node: ScytleNode
    depth: number
    isExpanded: boolean
    isSelected: boolean
    isHovered: boolean
    isDragOver: 'above' | 'below' | 'inside' | null
    renamingId: string | null
    onToggleExpand: (id: string) => void
    onSelect: (
        id: string,
        modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
    ) => void
    onToggleVisibility: (id: string) => void
    onStartRename: (id: string) => void
    onCommitRename: (id: string, name: string) => void
    onCancelRename: () => void
    onDragStart: (e: DragEvent, id: string) => void
    onDragOver: (e: DragEvent, id: string) => void
    onDragLeave: (e: DragEvent, id: string) => void
    onDrop: (e: DragEvent, id: string) => void
}

function LayerRow({
    node,
    depth,
    isExpanded,
    isSelected,
    isHovered,
    isDragOver,
    renamingId,
    onToggleExpand,
    onSelect,
    onToggleVisibility,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
}: LayerRowProps) {
    const hasChildren = node.type === 'frame' && (node as FrameNode).children.length > 0
    const isRenaming = renamingId === node.id
    const renameRef = useRef<HTMLSpanElement>(null)
    const rowRef = useRef<HTMLDivElement>(null)
    const [rowHovered, setRowHovered] = useState(false)
    // Manual double-click tracking — native onDoubleClick is unreliable
    // because the first click triggers a store update + re-render, which
    // can break the browser's double-click sequence detection.
    const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 })

    // Auto-focus rename span
    useEffect(() => {
        if (isRenaming && renameRef.current) {
            renameRef.current.focus()
            // Select all text
            const range = document.createRange()
            range.selectNodeContents(renameRef.current)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
        }
    }, [isRenaming])

    // Auto-scroll to selected row if it's not visible
    useEffect(() => {
        if (isSelected && rowRef.current) {
            const el = rowRef.current
            const container = el.closest('.overflow-y-auto')
            if (!container) return

            const elRect = el.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()

            const isVisible =
                elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom

            if (!isVisible) {
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                })
            }
        }
    }, [isSelected])

    const handleRenameKeyDown = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const text = renameRef.current?.textContent?.trim() || node.name
            onCommitRename(node.id, text)
        } else if (e.key === 'Escape') {
            onCancelRename()
        }
    }

    const handleRenameBlur = () => {
        if (isRenaming) {
            const text = renameRef.current?.textContent?.trim() || node.name
            onCommitRename(node.id, text)
        }
    }

    return (
        <div
            ref={rowRef}
            className={cn(
                'group relative flex items-center h-7 pr-2 cursor-default select-none text-xs',
                isSelected
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50',
                !node.visible && 'opacity-40',
                isDragOver === 'inside' && 'ring-1 ring-inset ring-primary/50 bg-primary/5'
            )}
            style={{ paddingLeft: depth * INDENT_PX + 4 }}
            draggable={!isRenaming}
            onDragStart={(e) => onDragStart(e, node.id)}
            onDragOver={(e) => onDragOver(e, node.id)}
            onDragLeave={(e) => onDragLeave(e, node.id)}
            onDrop={(e) => onDrop(e, node.id)}
            onMouseEnter={() => {
                setRowHovered(true)
                useEditorStore.getState().setHoveredId(node.id)
            }}
            onMouseLeave={() => {
                setRowHovered(false)
                useEditorStore.getState().setHoveredId(null)
            }}
            onClick={(e) => {
                e.stopPropagation()
                if (isRenaming) return

                const now = Date.now()
                const last = lastClickRef.current
                const isDoubleClick = last.id === node.id && now - last.time < 400

                if (isDoubleClick) {
                    // Double-click → start rename OR zoom to node if icon clicked
                    lastClickRef.current = { id: '', time: 0 }

                    const target = e.target as HTMLElement
                    if (target.closest('[data-layer-icon]')) {
                        useEditorStore.getState().zoomToNode(node.id)
                    } else {
                        onStartRename(node.id)
                    }
                } else {
                    // Single click → select
                    lastClickRef.current = { id: node.id, time: now }
                    onSelect(node.id, {
                        shiftKey: e.shiftKey,
                        metaKey: e.metaKey,
                        ctrlKey: e.ctrlKey,
                    })
                }
            }}
        >
            {/* Drop indicator lines */}
            {isDragOver === 'above' && (
                <div
                    className="absolute left-0 right-0 top-0 h-0.5 bg-primary z-10 pointer-events-none"
                    style={{ marginLeft: depth * INDENT_PX }}
                />
            )}
            {isDragOver === 'below' && (
                <div
                    className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary z-10 pointer-events-none"
                    style={{ marginLeft: depth * INDENT_PX }}
                />
            )}

            {/* Expand/collapse arrow (only for frames with children) */}
            <button
                className={cn(
                    'flex items-center justify-center w-4 h-4 shrink-0 mr-0.5',
                    hasChildren ? 'hover:text-foreground' : 'invisible'
                )}
                onClick={(e) => {
                    e.stopPropagation()
                    if (hasChildren) onToggleExpand(node.id)
                }}
                tabIndex={-1}
            >
                <ChevronRight
                    size={12}
                    className={cn(
                        'transition-transform duration-150',
                        isExpanded && 'rotate-90'
                    )}
                />
            </button>

            {/* Type icon */}
            <NodeTypeIcon node={node} />

            {/* Node name */}
            {isRenaming ? (
                <span
                    ref={renameRef}
                    className="ml-1.5 flex-1 min-w-0 outline-none px-1 py-0.5 -my-0.5 rounded bg-background border border-primary/40 text-foreground text-xs"
                    contentEditable
                    suppressContentEditableWarning
                    onKeyDown={handleRenameKeyDown}
                    onBlur={handleRenameBlur}
                >
                    {node.name}
                </span>
            ) : (
                <span className="ml-1.5 flex-1 min-w-0 truncate">
                    {node.name}
                </span>
            )}

            {/* Locked indicator */}
            {node.locked && (
                <Lock size={11} className="shrink-0 text-muted-foreground/50 ml-1" />
            )}

            {/* Visibility toggle — appears on hover */}
            <button
                className={cn(
                    'shrink-0 ml-1 p-0.5 rounded hover:bg-muted transition-opacity',
                    rowHovered || !node.visible ? 'opacity-100' : 'opacity-0'
                )}
                onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(node.id)
                }}
                tabIndex={-1}
                title={node.visible ? 'Hide layer' : 'Show layer'}
            >
                {node.visible ? (
                    <Eye size={12} className="text-muted-foreground" />
                ) : (
                    <EyeOff size={12} className="text-muted-foreground" />
                )}
            </button>
        </div>
    )
}

// ============================================================
// Recursive tree
// ============================================================

interface LayerTreeProps {
    nodes: ScytleNode[]
    depth: number
    expandedIds: Set<string>
    selectedIds: string[]
    hoveredId: string | null
    dragOverState: { id: string; position: 'above' | 'below' | 'inside' } | null
    renamingId: string | null
    onToggleExpand: (id: string) => void
    onSelect: (
        id: string,
        modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
    ) => void
    onToggleVisibility: (id: string) => void
    onStartRename: (id: string) => void
    onCommitRename: (id: string, name: string) => void
    onCancelRename: () => void
    onDragStart: (e: DragEvent, id: string) => void
    onDragOver: (e: DragEvent, id: string) => void
    onDragLeave: (e: DragEvent, id: string) => void
    onDrop: (e: DragEvent, id: string) => void
}

function LayerTree({
    nodes,
    depth,
    expandedIds,
    selectedIds,
    hoveredId,
    dragOverState,
    renamingId,
    onToggleExpand,
    onSelect,
    onToggleVisibility,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
}: LayerTreeProps) {
    return (
        <>
            {nodes.map((node) => {
                const isFrame = node.type === 'frame'
                const isExpanded = expandedIds.has(node.id)

                return (
                    <div key={node.id}>
                        <LayerRow
                            node={node}
                            depth={depth}
                            isExpanded={isExpanded}
                            isSelected={selectedIds.includes(node.id)}
                            isHovered={hoveredId === node.id}
                            isDragOver={
                                dragOverState?.id === node.id
                                    ? dragOverState.position
                                    : null
                            }
                            renamingId={renamingId}
                            onToggleExpand={onToggleExpand}
                            onSelect={onSelect}
                            onToggleVisibility={onToggleVisibility}
                            onStartRename={onStartRename}
                            onCommitRename={onCommitRename}
                            onCancelRename={onCancelRename}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        />
                        {isFrame && isExpanded && (
                            <LayerTree
                                nodes={(node as FrameNode).children}
                                depth={depth + 1}
                                expandedIds={expandedIds}
                                selectedIds={selectedIds}
                                hoveredId={hoveredId}
                                dragOverState={dragOverState}
                                renamingId={renamingId}
                                onToggleExpand={onToggleExpand}
                                onSelect={onSelect}
                                onToggleVisibility={onToggleVisibility}
                                onStartRename={onStartRename}
                                onCommitRename={onCommitRename}
                                onCancelRename={onCancelRename}
                                onDragStart={onDragStart}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                            />
                        )}
                    </div>
                )
            })}
        </>
    )
}

// ============================================================
// Layers Panel (exported)
// ============================================================

export function LayersPanel() {
    const nodes = useEditorStore((s) => s.nodes)
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const hoveredId = useEditorStore((s) => s.hoveredId)

    // Local state
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [dragOverState, setDragOverState] = useState<{
        id: string
        position: 'above' | 'below' | 'inside'
    } | null>(null)
    const dragSourceId = useRef<string | null>(null)
    const lastSelectedLayerIdRef = useRef<string | null>(null)

    // Auto-expand top-level frames when nodes load/change
    const prevNodeLenRef = useRef(0)
    useEffect(() => {
        if (nodes.length > 0 && prevNodeLenRef.current === 0) {
            // First load — expand all top-level frames
            setExpandedIds((prev) => {
                const next = new Set(prev)
                for (const node of nodes) {
                    if (node.type === 'frame') next.add(node.id)
                }
                return next
            })
        }
        prevNodeLenRef.current = nodes.length
    }, [nodes])

    // ----------------------------------------------------------
    // Auto-expand to reveal selected nodes
    // ----------------------------------------------------------
    useEffect(() => {
        if (selectedIds.length === 0) return

        setExpandedIds((prev) => {
            const next = new Set(prev)
            let changed = false

            for (const selId of selectedIds) {
                // Walk up parents, expand each frame
                let current = selId
                const storeNodes = useEditorStore.getState().nodes
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const result = findParentOfNode(storeNodes, current)
                    if (!result || !result.parent) break
                    if (!next.has(result.parent.id)) {
                        next.add(result.parent.id)
                        changed = true
                    }
                    current = result.parent.id
                }
            }

            return changed ? next : prev
        })
    }, [selectedIds])

    // ----------------------------------------------------------
    // Handlers
    // ----------------------------------------------------------

    const handleToggleExpand = useCallback((id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const handleSelect = useCallback((
        id: string,
        modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
    ) => {
        const { shiftKey, metaKey, ctrlKey } = modifiers
        const isToggle = metaKey || ctrlKey
        const state = useEditorStore.getState()

        if (shiftKey) {
            const orderedIds = getVisibleNodeIdsInOrder(nodes, expandedIds)
            const anchorId =
                lastSelectedLayerIdRef.current ??
                state.selectedIds[state.selectedIds.length - 1] ??
                id

            const anchorIndex = orderedIds.indexOf(anchorId)
            const targetIndex = orderedIds.indexOf(id)

            if (anchorIndex !== -1 && targetIndex !== -1) {
                const from = Math.min(anchorIndex, targetIndex)
                const to = Math.max(anchorIndex, targetIndex)
                const rangeIds = orderedIds.slice(from, to + 1)

                const nextIds = isToggle
                    ? Array.from(new Set([...state.selectedIds, ...rangeIds]))
                    : rangeIds

                state.setSelectedIds(nextIds)
                lastSelectedLayerIdRef.current = id
                return
            }
        }

        state.selectNode(id, isToggle || shiftKey)
        lastSelectedLayerIdRef.current = id
    }, [nodes, expandedIds])

    const handleToggleVisibility = useCallback((id: string) => {
        const storeNodes = useEditorStore.getState().nodes
        const node = findNodeFromTree(storeNodes, id)
        if (node) {
            useEditorStore.getState().updateNode(id, { visible: !node.visible })
        }
    }, [])

    const handleStartRename = useCallback((id: string) => {
        setRenamingId(id)
    }, [])

    const handleCommitRename = useCallback((id: string, name: string) => {
        if (name && name.length > 0) {
            useEditorStore.getState().updateNode(id, { name })
        }
        setRenamingId(null)
    }, [])

    const handleCancelRename = useCallback(() => {
        setRenamingId(null)
    }, [])

    // ----------------------------------------------------------
    // Drag & Drop reorder
    // ----------------------------------------------------------

    const handleDragStart = useCallback((e: DragEvent, id: string) => {
        dragSourceId.current = id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        // Make ghost semi-transparent
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.4'
        }
    }, [])

    const handleDragOver = useCallback((e: DragEvent, targetId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'

        if (!dragSourceId.current || dragSourceId.current === targetId) {
            setDragOverState(null)
            return
        }

        // Determine position based on mouse Y relative to row
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const y = e.clientY - rect.top
        const h = rect.height

        // Check if target is a frame (can receive "inside" drops)
        const targetNode = findNodeFromTree(useEditorStore.getState().nodes, targetId)
        const isFrame = targetNode?.type === 'frame'

        let position: 'above' | 'below' | 'inside'
        if (y < EDGE_ZONE) {
            position = 'above'
        } else if (y > h - EDGE_ZONE) {
            position = 'below'
        } else if (isFrame) {
            position = 'inside'
        } else if (y < h / 2) {
            position = 'above'
        } else {
            position = 'below'
        }

        setDragOverState({ id: targetId, position })
    }, [])

    const handleDragLeave = useCallback((e: DragEvent, id: string) => {
        // Only clear if leaving this specific row
        const related = e.relatedTarget as HTMLElement | null
        if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
            setDragOverState((prev) => (prev?.id === id ? null : prev))
        }
    }, [])

    const cleanupDrag = useCallback((e: DragEvent) => {
        setDragOverState(null)
        dragSourceId.current = null
        // Reset ghost opacity
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = ''
        }
    }, [])

    const handleDrop = useCallback((e: DragEvent, targetId: string) => {
        e.preventDefault()

        const sourceId = dragSourceId.current
        if (!sourceId || sourceId === targetId || !dragOverState) {
            cleanupDrag(e)
            return
        }

        const state = useEditorStore.getState()
        const storeNodes = state.nodes

        // Prevent dropping a parent into its own descendant
        const sourceNode = findNodeFromTree(storeNodes, sourceId)
        if (sourceNode && isDescendant(sourceNode, targetId)) {
            cleanupDrag(e)
            return
        }

        const { position } = dragOverState

        if (position === 'inside') {
            // Move into target frame as last child
            moveNodeIntoFrame(sourceId, targetId, storeNodes)
        } else {
            // Move above/below target in its parent
            moveNodeAdjacentTo(sourceId, targetId, position, storeNodes)
        }

        cleanupDrag(e)
    }, [dragOverState, cleanupDrag])

    // Handle dragend to restore opacity if drop doesn't fire
    useEffect(() => {
        const handleDragEnd = () => {
            setDragOverState(null)
            dragSourceId.current = null
        }
        window.addEventListener('dragend', handleDragEnd)
        return () => window.removeEventListener('dragend', handleDragEnd)
    }, [])

    return (
        <div className="flex flex-col h-full bg-background border-r border-border">
            {/* Header */}
            <div className="h-9 flex items-center px-3 border-b border-border shrink-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Layers
                </span>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
                {nodes.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                        <p className="text-xs text-muted-foreground/60">No layers</p>
                    </div>
                ) : (
                    <LayerTree
                        nodes={nodes}
                        depth={0}
                        expandedIds={expandedIds}
                        selectedIds={selectedIds}
                        hoveredId={hoveredId}
                        dragOverState={dragOverState}
                        renamingId={renamingId}
                        onToggleExpand={handleToggleExpand}
                        onSelect={handleSelect}
                        onToggleVisibility={handleToggleVisibility}
                        onStartRename={handleStartRename}
                        onCommitRename={handleCommitRename}
                        onCancelRename={handleCancelRename}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    />
                )}
            </div>
        </div>
    )
}

// ============================================================
// Helpers
// ============================================================

function getVisibleNodeIdsInOrder(nodes: ScytleNode[], expandedIds: Set<string>): string[] {
    const ids: string[] = []

    const visit = (items: ScytleNode[]) => {
        for (const node of items) {
            ids.push(node.id)
            if (node.type === 'frame' && expandedIds.has(node.id)) {
                visit((node as FrameNode).children)
            }
        }
    }

    visit(nodes)
    return ids
}

/** Find a node by ID from a tree (non-immer, read-only) */
function findNodeFromTree(nodes: ScytleNode[], id: string): ScytleNode | null {
    for (const node of nodes) {
        if (node.id === id) return node
        if (node.type === 'frame') {
            const found = findNodeFromTree(node.children, id)
            if (found) return found
        }
    }
    return null
}

/** Check if targetId is a descendant of sourceNode */
function isDescendant(sourceNode: ScytleNode, targetId: string): boolean {
    if (sourceNode.type !== 'frame') return false
    for (const child of (sourceNode as FrameNode).children) {
        if (child.id === targetId) return true
        if (isDescendant(child, targetId)) return true
    }
    return false
}

/** Move a node into a target frame as the last child */
function moveNodeIntoFrame(
    sourceId: string,
    targetFrameId: string,
    nodes: ScytleNode[]
) {
    const store = useEditorStore.getState()

    // Grab snapshot of source before deletion
    const sourceNode = findNodeFromTree(nodes, sourceId)
    if (!sourceNode) return

    const clone = JSON.parse(JSON.stringify(sourceNode)) as ScytleNode

    // Convert position: source is in its current parent's coordinate space,
    // we need to convert to the target frame's coordinate space.
    const sourceAbsPos = getNodeCanvasPosition(nodes, sourceId)
    const targetAbsPos = getNodeCanvasPosition(nodes, targetFrameId)

    if (sourceAbsPos && targetAbsPos) {
        clone.x = sourceAbsPos.x - targetAbsPos.x
        clone.y = sourceAbsPos.y - targetAbsPos.y
    } else {
        // Fallback: center in target frame
        const targetNode = findNodeFromTree(nodes, targetFrameId)
        if (targetNode && targetNode.type === 'frame') {
            clone.x = (targetNode.width - clone.width) / 2
            clone.y = (targetNode.height - clone.height) / 2
        }
    }

    store.beginBatch()
    store.deleteNode(sourceId)
    store.addNode(clone, targetFrameId)
    store.endBatch()
}

/** Move a node above or below a target node in its parent */
function moveNodeAdjacentTo(
    sourceId: string,
    targetId: string,
    position: 'above' | 'below',
    nodes: ScytleNode[]
) {
    const store = useEditorStore.getState()

    const sourceNode = findNodeFromTree(nodes, sourceId)
    if (!sourceNode) return

    const clone = JSON.parse(JSON.stringify(sourceNode)) as ScytleNode

    // Find target's parent and index
    const targetResult = findParentOfNode(nodes, targetId)
    if (!targetResult) return

    // Check if moving between different parents — need coordinate conversion
    const sourceResult = findParentOfNode(nodes, sourceId)
    const sourceParentId = sourceResult?.parent?.id ?? null
    const targetParentId = targetResult.parent?.id ?? null

    if (sourceParentId !== targetParentId) {
        // Convert coordinates from source's coordinate space to target's
        const sourceAbsPos = getNodeCanvasPosition(nodes, sourceId)
        if (sourceAbsPos) {
            if (targetParentId) {
                const targetParentAbsPos = getNodeCanvasPosition(nodes, targetParentId)
                if (targetParentAbsPos) {
                    clone.x = sourceAbsPos.x - targetParentAbsPos.x
                    clone.y = sourceAbsPos.y - targetParentAbsPos.y
                }
            } else {
                // Moving to top level — use canvas-absolute position
                clone.x = sourceAbsPos.x
                clone.y = sourceAbsPos.y
            }
        }
    }

    const parentId = targetResult.parent?.id

    store.beginBatch()
    store.deleteNode(sourceId)

    // After deletion, indices may shift — re-find target position
    const updatedNodes = useEditorStore.getState().nodes
    const updatedTarget = findParentOfNode(updatedNodes, targetId)
    if (updatedTarget) {
        const newIdx = position === 'above'
            ? updatedTarget.index
            : updatedTarget.index + 1
        store.addNode(clone, parentId ?? undefined, newIdx)
    } else {
        const insertIndex = position === 'above'
            ? targetResult.index
            : targetResult.index + 1
        store.addNode(clone, parentId ?? undefined, insertIndex)
    }
    store.endBatch()
}
