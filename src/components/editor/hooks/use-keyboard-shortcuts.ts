'use client'

import { useEffect } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { useGenerationStore } from '@/store/generation-store'
import type { CanvasTool } from '@/types/canvas'
import { findNodeById, findParentOfNode } from '@/types/canvas'
import type { FrameNode } from '@/types/canvas'
import { isDragActive } from './use-node-drag'
import { isResizeActive } from './use-node-resize'
import { quickExport } from '@/lib/export/export-node'

// ============================================================
// Centralized keyboard shortcut hub
// ============================================================
//
// Shortcut table:
// ┌───────────────────────┬────────────────────────────────┐
// │ Key                   │ Action                         │
// ├───────────────────────┼────────────────────────────────┤
// │ V                     │ Select tool                    │
// │ F                     │ Frame tool                     │
// │ T                     │ Text tool                      │
// │ H                     │ Hand tool                      │
// │ Shift+H               │ Flip horizontal                │
// │ Shift+V               │ Flip vertical                  │
// │ Delete / Backspace    │ Delete selected                │
// │ Escape                │ Select parent / deselect       │
// │ Enter                 │ Drill into selected frame      │
// │ Shift+Enter           │ Select parent layer            │
// │ Tab                   │ Select next sibling            │
// │ Shift+Tab             │ Select previous sibling        │
// │ Arrow keys            │ Nudge selected (1px)           │
// │ Shift+Arrow keys      │ Nudge selected (10px)          │
// │ \                     │ Select parent layer            │
// │ ]                     │ Bring forward                  │
// │ [                     │ Send backward                  │
// │ ⌘Z                    │ Undo                           │
// │ ⇧⌘Z                   │ Redo                           │
// │ ⌘C                    │ Copy                           │
// │ ⌘V                    │ Paste                          │
// │ ⇧⌘V                   │ Paste Over Selection           │
// │ ⌘D                    │ Duplicate                      │
// │ ⌘G                    │ Group                          │
// │ ⇧⌘G                   │ Ungroup                        │
// │ ⌘]                    │ Bring to front                 │
// │ ⌘[                    │ Send to back                   │
// │ ⌘= / ⌘+              │ Zoom in                        │
// │ ⌘-                    │ Zoom out                       │
// │ ⌘0                    │ Reset zoom                     │
// │ ⇧⌘E                   │ Quick export (PNG 1x)          │
// └───────────────────────┴────────────────────────────────┘
// ============================================================

/** Select the parent of the currently selected node (Figma Shift+Enter / \ behaviour) */
function _selectParent(store: ReturnType<typeof useEditorStore.getState>) {
    if (store.selectedIds.length !== 1) return
    const selectedId = store.selectedIds[0]
    const parentResult = findParentOfNode(store.nodes, selectedId)

    if (parentResult?.parent) {
        store.selectNode(parentResult.parent.id)
        // If we were inside an entered frame and the parent IS
        // the entered frame, exit the entered state
        if (store.enteredFrameId === parentResult.parent.id) {
            store.exitFrame()
        }
    } else if (store.enteredFrameId) {
        // Top-level child inside entered frame — exit frame
        store.exitFrame()
    }
}

export function useKeyboardShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement

            // Skip when typing in inputs, textareas, or contenteditable
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) return

            const meta = e.metaKey || e.ctrlKey
            const ctrl = e.ctrlKey
            const shift = e.shiftKey
            const key = e.key.toLowerCase()
            const store = useEditorStore.getState()

            // ── Generation lock gate ─────────────────────────────────────
            // When AI generation is in progress, block ALL mutating actions.
            // Allow: zoom (⌘+/−/0), pan (space), view tool switch (V/H), Escape.
            const isGenLocked = useGenerationStore.getState().isLocked
            if (isGenLocked) {
                // Whitelist non-mutating shortcuts
                const isZoom = meta && (key === '=' || key === '+' || key === '-' || key === '0')
                const isEscape = key === 'escape'
                const isZoomToFit = shift && (key === '1' || key === '2')
                if (!isZoom && !isEscape && !isZoomToFit) {
                    return
                }
            }

            // ⌘/Ctrl hold → bend tool in vector edit mode
            if ((key === 'meta' || key === 'control') && store.vectorEditNodeId && store.vectorEditTool !== 'bend') {
                _prevToolBeforeBend = store.vectorEditTool
                store.setVectorEditTool('bend')
                return
            }

            // ── Modifier commands (Cmd/Ctrl + key) ───────────────

            if (meta) {
                switch (key) {
                    // Quick Export (⇧⌘E) — export selected as PNG 1x
                    case 'e':
                        if (shift && store.selectedIds.length === 1) {
                            e.preventDefault()
                            const exportNode = findNodeById(store.nodes, store.selectedIds[0])
                            if (exportNode) {
                                quickExport(exportNode, {
                                    id: 'quick',
                                    format: 'PNG',
                                    scale: 1,
                                    suffix: '',
                                }).catch(err => console.error('Export failed:', err))
                            }
                        }
                        return

                    // Undo / Redo
                    case 'z':
                        e.preventDefault()
                        if (shift) {
                            store.redo()
                        } else {
                            store.undo()
                        }
                        return

                    // Copy
                    case 'c':
                        if (store.selectedIds.length > 0) {
                            e.preventDefault()
                            store.copyNodes(store.selectedIds)
                        }
                        return

                    // Cut
                    case 'x':
                        if (store.selectedIds.length > 0) {
                            e.preventDefault()
                            store.cutNodes(store.selectedIds)
                        }
                        return

                    // Paste
                    case 'v':
                        if (store._clipboard.length > 0) {
                            e.preventDefault()
                            if (shift) {
                                store.pasteOverSelection()
                            } else {
                                store.pasteNodes()
                            }
                        }
                        return

                    // Duplicate
                    case 'd':
                        if (store.selectedIds.length > 0) {
                            e.preventDefault()
                            store.duplicateNodes(store.selectedIds)
                        }
                        return

                    // Group / Ungroup
                    case 'g':
                        e.preventDefault()
                        if (shift) {
                            if (store.selectedIds.length === 1) {
                                store.ungroupNodes(store.selectedIds[0])
                            }
                        } else {
                            if (store.selectedIds.length >= 2) {
                                store.groupNodes(store.selectedIds)
                            }
                        }
                        return

                    // Z-order (Cmd+bracket → to front/back)
                    case ']':
                        e.preventDefault()
                        if (store.selectedIds.length === 1) {
                            store.bringToFront(store.selectedIds[0])
                        }
                        return
                    case '[':
                        e.preventDefault()
                        if (store.selectedIds.length === 1) {
                            store.sendToBack(store.selectedIds[0])
                        }
                        return

                    // Zoom
                    case '=':
                    case '+':
                        e.preventDefault()
                        store.zoomIn()
                        return
                    case '-':
                        e.preventDefault()
                        store.zoomOut()
                        return
                    case '0':
                        e.preventDefault()
                        store.resetZoom()
                        return
                }

                // Don't fall through to bare-key handlers when meta is held
                return
            }

            // ── Bare key / Shift + key commands (no ⌘/Ctrl) ─────

            // Zoom to Fit (⇧1) and Zoom to Selection (⇧2)
            if (shift) {
                if (key === '1') {
                    e.preventDefault()
                    store.zoomToFit()
                    return
                }
                if (key === '2') {
                    e.preventDefault()
                    store.zoomToSelection()
                    return
                }
            }

            // Delete
            if (key === 'delete' || key === 'backspace') {
                // In vector edit mode: delete selected vertices
                if (store.vectorEditNodeId && store.selectedVertexIndices.length > 0) {
                    e.preventDefault()
                    store.deleteSelectedVertices(store.vectorEditNodeId)
                    return
                }
                if (store.selectedIds.length > 0) {
                    e.preventDefault()
                    store.deleteSelectedNodes()
                }
                return
            }

            // Escape — Figma behaviour: select parent or deselect
            if (key === 'escape') {
                // Don't interfere with drag/resize cancel
                if (isDragActive() || isResizeActive()) return

                e.preventDefault()

                // Vector edit mode: exit back to selection
                if (store.vectorEditNodeId) {
                    store.exitVectorEditMode()
                    return
                }

                // Pen tool: commit current path (if drawing) and switch to select
                if (store.activeTool === 'pen') {
                    if (store.penDrawingState) {
                        store.commitPenPath()
                        store.setActiveTool('select')
                    }
                    // If penDrawingState is null (closed-path click), handlePenKeyDown
                    // in use-pen-tool.ts handles Escape (it knows the committed nodeId)
                    return
                }

                // Inline text editing: exit editing
                if (store.editingNodeId) {
                    store.setEditingNodeId(null)
                    return
                }

                // Figma behaviour: if a child node is selected, Escape
                // selects its parent (go up one level in the hierarchy).
                // Only fully deselect when at top-level with no entered frame.
                if (store.selectedIds.length > 0) {
                    const selectedId = store.selectedIds[0]
                    const parentResult = findParentOfNode(store.nodes, selectedId)

                    if (parentResult?.parent) {
                        // We're inside a nested structure — select the parent
                        store.selectNode(parentResult.parent.id)
                        // If we were inside an entered frame and the parent IS
                        // the entered frame, exit the entered state
                        if (store.enteredFrameId === parentResult.parent.id) {
                            store.exitFrame()
                        }
                        return
                    }
                    // At top level — just deselect
                    if (store.enteredFrameId) {
                        store.exitFrame()
                    } else {
                        store.deselectAll()
                    }
                    return
                }

                // Nothing selected but inside entered frame — exit frame
                if (store.enteredFrameId) {
                    store.exitFrame()
                    return
                }
                return
            }

            // ── Enter / Shift+Enter — layer navigation ───────────────
            if (key === 'enter' && !store.editingNodeId) {
                // If pen tool is active (drawing or just committed a closed path),
                // let handlePenKeyDown handle Enter
                if (store.activeTool === 'pen' || store.penDrawingState) return
                // Shift+Enter → select parent (go up one level)
                if (shift) {
                    e.preventDefault()
                    if (store.selectedIds.length === 1) {
                        _selectParent(store)
                    }
                    return
                }

                // Enter → drill into selected frame, or enter vector edit
                if (!store.vectorEditNodeId && store.selectedIds.length === 1) {
                    const node = findNodeById(store.nodes, store.selectedIds[0])
                    if (node) {
                        if (node.type === 'vector') {
                            e.preventDefault()
                            store.enterVectorEditMode(node.id)
                            return
                        }
                        if (node.type === 'frame' && node.children.length > 0) {
                            e.preventDefault()
                            // Enter the frame and select first child
                            store.enterFrame(node.id)
                            store.selectNode(node.children[0].id)
                            return
                        }
                        if (node.type === 'text') {
                            e.preventDefault()
                            store.setEditingNodeId(node.id)
                            return
                        }
                    }
                }
                return
            }

            // ── Backslash (\) — select parent (Figma shortcut) ─────────
            if (key === '\\' && !meta && !ctrl && store.selectedIds.length === 1) {
                e.preventDefault()
                _selectParent(store)
                return
            }

            // ── Tab / Shift+Tab — cycle through siblings ──────────────
            if (key === 'tab' && !meta && !ctrl && !e.altKey) {
                e.preventDefault()

                if (store.selectedIds.length !== 1) {
                    // No single selection — select first top-level node
                    const nodes = store.enteredFrameId
                        ? (findNodeById(store.nodes, store.enteredFrameId) as FrameNode | undefined)?.children ?? []
                        : store.nodes
                    if (nodes.length > 0) {
                        store.selectNode(nodes[0].id)
                    }
                    return
                }

                const selectedId = store.selectedIds[0]
                const parentResult = findParentOfNode(store.nodes, selectedId)
                const siblings = parentResult?.parent
                    ? parentResult.parent.children
                    : store.nodes // top-level nodes

                const currentIndex = siblings.findIndex(n => n.id === selectedId)
                if (currentIndex === -1) return

                let nextIndex: number
                if (shift) {
                    // Shift+Tab → previous sibling (wrap around)
                    nextIndex = currentIndex <= 0 ? siblings.length - 1 : currentIndex - 1
                } else {
                    // Tab → next sibling (wrap around)
                    nextIndex = currentIndex >= siblings.length - 1 ? 0 : currentIndex + 1
                }

                store.selectNode(siblings[nextIndex].id)
                return
            }

            // ── Arrow keys — grid navigation + general nudging ───────
            // Grid children preserve existing arrow behavior.
            // All other movable selections fall back to Figma-like nudging:
            //   Arrow = 1px, Shift+Arrow = 10px.
            if (
                (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') &&
                !meta && !ctrl && !e.altKey &&
                store.selectedIds.length > 0 &&
                !store.vectorEditNodeId &&
                !store.editingNodeId
            ) {
                // Preserve existing single-selection grid arrow behavior.
                if (store.selectedIds.length === 1) {
                    const selectedId = store.selectedIds[0]
                    const parentResult = findParentOfNode(store.nodes, selectedId)
                    const parent = parentResult?.parent

                    if (parent && parent.layout?.mode === 'grid') {
                        const node = findNodeById(store.nodes, selectedId)
                        if (!node) return

                        e.preventDefault()

                        const colCount = parent.layout.columnTracks?.length
                            ?? (typeof parent.layout.columns === 'number' ? parent.layout.columns : 2)

                        const isExplicit = node.gridColumnStart != null && node.gridRowStart != null

                        if (!isExplicit) {
                            // ── Auto-placed: swap in children array ──────────
                            const idx = parent.children.findIndex(c => c.id === selectedId)
                            if (idx === -1) return

                            let targetIdx = idx
                            switch (key) {
                                case 'arrowright': targetIdx = idx + 1; break
                                case 'arrowleft': targetIdx = idx - 1; break
                                case 'arrowdown': targetIdx = idx + colCount; break
                                case 'arrowup': targetIdx = idx - colCount; break
                            }

                            // Bounds check
                            if (targetIdx < 0 || targetIdx >= parent.children.length) return
                            if (targetIdx === idx) return

                            // Use reorderNode — gapIndex is "insert before" position
                            // Moving forward: gapIndex = targetIdx + 1 (insert after target)
                            // Moving backward: gapIndex = targetIdx (insert before target)
                            const gapIndex = targetIdx > idx ? targetIdx + 1 : targetIdx
                            store.reorderNode(selectedId, gapIndex)
                        } else {
                            // ── Explicitly placed: swap gridColumnStart/gridRowStart ──
                            const rowCount = parent.layout.rowTracks?.length
                                ?? (typeof parent.layout.rows === 'number' ? parent.layout.rows : undefined)

                            const currentCol = node.gridColumnStart!
                            const currentRow = node.gridRowStart!
                            const span = node.gridColumnSpan ?? 1
                            const rowSpan = node.gridRowSpan ?? 1

                            let newCol = currentCol
                            let newRow = currentRow

                            switch (key) {
                                case 'arrowleft':
                                    newCol = Math.max(1, currentCol - 1)
                                    break
                                case 'arrowright':
                                    newCol = span === -1
                                        ? currentCol
                                        : Math.min(colCount - span + 1, currentCol + 1)
                                    break
                                case 'arrowup':
                                    newRow = Math.max(1, currentRow - 1)
                                    break
                                case 'arrowdown':
                                    if (rowCount) {
                                        newRow = rowSpan === -1
                                            ? currentRow
                                            : Math.min(rowCount - rowSpan + 1, currentRow + 1)
                                    } else {
                                        newRow = currentRow + 1
                                    }
                                    break
                            }

                            if (newCol !== currentCol || newRow !== currentRow) {
                                store.beginBatch()
                                // Find occupant at target cell and swap
                                const occupant = parent.children.find(
                                    c => c.id !== selectedId &&
                                        c.gridColumnStart === newCol &&
                                        c.gridRowStart === newRow
                                )
                                if (occupant) {
                                    store.updateNode(occupant.id, {
                                        gridColumnStart: currentCol,
                                        gridRowStart: currentRow,
                                    })
                                }
                                store.updateNode(selectedId, {
                                    gridColumnStart: newCol,
                                    gridRowStart: newRow,
                                })
                                store.endBatch()
                            }
                        }
                        return
                    }
                }

                const step = shift ? 10 : 1
                const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
                const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0

                if (store.nudgeSelectedNodes(dx, dy)) {
                    e.preventDefault()
                }
                return
            }

            // ── Vector edit mode sub-tool shortcuts ───────────────────
            if (store.vectorEditNodeId) {
                // Bare key shortcuts (no modifiers)
                if (!meta && !ctrl && !e.altKey) {
                    const vectorToolMap: Record<string, import('@/store/editor-store').VectorEditTool> = {
                        v: 'move',
                        q: 'lasso',
                        x: 'cut',
                    }
                    const vtool = vectorToolMap[key]
                    if (vtool) {
                        e.preventDefault()
                        store.setVectorEditTool(vtool)
                        return
                    }
                    // P → activate pen tool (exit vector edit mode so pen gets full control)
                    if (key === 'p') {
                        e.preventDefault()
                        store.exitVectorEditMode()
                        store.setActiveTool('pen')
                        return
                    }
                    // Shift+B → paint
                    if (shift) {
                        if (key === 'b') { e.preventDefault(); store.setVectorEditTool('paint'); return }
                    }
                }
                // Don't fall through to main tool switch while in vector edit
                if (!meta && !ctrl) return
            }

            // Tool shortcuts (bare keys, no modifiers)
            // Shift+H / Shift+V → flip selected node (Figma shortcut)
            if (shift && store.selectedIds.length === 1) {
                const nodeId = store.selectedIds[0]
                if (key === 'h') {
                    e.preventDefault()
                    const node = findNodeById(store.nodes, nodeId)
                    if (node) store.updateNode(nodeId, { flipX: !node.flipX })
                    return
                }
                if (key === 'v') {
                    e.preventDefault()
                    const node = findNodeById(store.nodes, nodeId)
                    if (node) store.updateNode(nodeId, { flipY: !node.flipY })
                    return
                }
            }

            if (shift || e.altKey) return // Don't fire tool switch on Shift+V etc.

            const toolMap: Record<string, CanvasTool> = {
                v: 'select',
                f: 'frame',
                t: 'text',
                h: 'hand',
                p: 'pen',
            }
            const tool = toolMap[key]
            if (tool) {
                e.preventDefault()
                store.setActiveTool(tool)
                return
            }
        }

        // ── ⌘/Ctrl hold → temporarily switch to bend tool in vector edit ──
        let _prevToolBeforeBend: import('@/store/editor-store').VectorEditTool | null = null

        const handleKeyUp = (e: KeyboardEvent) => {
            // Restore previous tool when ⌘/Ctrl released
            if ((e.key === 'Meta' || e.key === 'Control') && _prevToolBeforeBend) {
                const store = useEditorStore.getState()
                if (store.vectorEditNodeId && store.vectorEditTool === 'bend') {
                    store.setVectorEditTool(_prevToolBeforeBend)
                }
                _prevToolBeforeBend = null
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])
}
