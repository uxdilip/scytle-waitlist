'use client'

/**
 * Properties Panel — Right sidebar inspector.
 * Figma-style: shows page settings when deselected,
 * node properties when selected.
 */

import { useCallback, useMemo } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { findNodeById, findParentOfNode } from '@/types/canvas'
import type { ScytleNode, FrameNode, TextNode, VectorNode } from '@/types/canvas'
import { PositionSection, MarginSection } from './position-section'
import { MultiSelectAlignSection } from './multi-select-align'
import { SizeSection } from './size-section'
import { LayoutSection } from './layout-section'
import { isInAutoLayoutFlow } from './layout-capabilities'
import { FillSection } from './fill-section'
import { AppearanceSection, StrokeSection } from './border-section'
import { TypographySection } from './typography-section'
import { EffectsSection } from './effects-section'
import { ExportSection } from './export-section'
import { VectorSection } from './vector-section'
import { ImageSection } from './image-section'
import { getMultiSelectInspectorVisibility, getSingleInspectorVisibility } from './inspector-visibility'
import { withVectorStrokeCompatibility } from '@/lib/vector-stroke'
import { ColorInput, SectionHeader } from './inputs'
import { Frame, Type, ImageIcon, FileText, Pen } from 'lucide-react'
import { cn } from '@/lib/utils'

// Type icons for the header
const TYPE_ICONS: Record<ScytleNode['type'], React.ReactNode> = {
    frame: <Frame size={14} />,
    text: <Type size={14} />,
    image: <ImageIcon size={14} />,
    vector: <Pen size={14} />,
}

const TYPE_LABELS: Record<ScytleNode['type'], string> = {
    frame: 'Frame',
    text: 'Text',
    image: 'Image',
    vector: 'Vector',
}

/* ── Page Settings (deselected state) ──────────────────────── */

function PageSettings() {
    const canvasColor = useEditorStore((s) => s.canvasColor)
    const setCanvasColor = useEditorStore((s) => s.setCanvasColor)

    return (
        <div
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
        >
            <SectionHeader title="Design" />
            <div className="border-b border-border/40">
                <div className="flex items-center gap-2 px-3 h-9">
                    <FileText size={12} className="text-muted-foreground/60 shrink-0" />
                    <span className="text-[11px] font-medium text-foreground">Page</span>
                </div>
                <div className="px-3 pb-3">
                    <ColorInput
                        value={canvasColor}
                        onChange={setCanvasColor}
                        opacity={100}
                    />
                </div>
            </div>
        </div>
    )
}

interface MultiSelectSettingsProps {
    allNodes: ScytleNode[]
    selectedIds: string[]
}

function MultiSelectSettings({ allNodes, selectedIds }: MultiSelectSettingsProps) {
    const updateNode = useEditorStore((s) => s.updateNode)
    const beginBatch = useEditorStore((s) => s.beginBatch)
    const endBatch = useEditorStore((s) => s.endBatch)

    const selectedNodes = useMemo(() => {
        const resolved: ScytleNode[] = []
        for (const id of selectedIds) {
            const node = findNodeById(allNodes, id)
            if (node) resolved.push(node)
        }
        return resolved
    }, [allNodes, selectedIds])

    const primaryNode = selectedNodes[0] ?? null
    const parentNode = useMemo<FrameNode | null>(() => {
        if (!primaryNode) return null
        const result = findParentOfNode(allNodes, primaryNode.id)
        if (!result?.parent) return null
        return result.parent
    }, [allNodes, primaryNode])

    const isPrimaryFrame = primaryNode?.type === 'frame'
    const isAutoLayout = useMemo(() => {
        if (!primaryNode) return false
        return isInAutoLayoutFlow(primaryNode, parentNode)
    }, [primaryNode, parentNode])

    const isInAutoLayoutParent = useMemo(() => {
        return !!parentNode && parentNode.layout.mode !== 'none'
    }, [parentNode])

    const allText = selectedNodes.length > 0 && selectedNodes.every((n) => n.type === 'text')
    const allVectors = selectedNodes.length > 0 && selectedNodes.every((n) => n.type === 'vector')
    const visibility = useMemo(
        () => getMultiSelectInspectorVisibility(selectedNodes),
        [selectedNodes]
    )

    const applyBatch = useCallback((updater: (node: ScytleNode) => Record<string, unknown> | null) => {
        if (selectedNodes.length === 0) return

        beginBatch()
        try {
            for (const node of selectedNodes) {
                const updates = updater(node)
                if (!updates) continue
                updateNode(node.id, withVectorStrokeCompatibility(node, updates))
            }
        } finally {
            endBatch()
        }
    }, [beginBatch, endBatch, selectedNodes, updateNode])

    const applySharedUpdate = useCallback((
        updates: Record<string, unknown>,
        predicate?: (node: ScytleNode) => boolean,
    ) => {
        applyBatch((node) => {
            if (predicate && !predicate(node)) return null
            // Clone once per node so array/object fields are not shared references.
            return JSON.parse(JSON.stringify(updates)) as Record<string, unknown>
        })
    }, [applyBatch])

    if (!primaryNode) {
        return (
            <div className="h-full">
                <SectionHeader title="Design" />
                <div className="flex items-center justify-center pt-12">
                    <p className="text-[11px] text-muted-foreground/50 select-none">
                        Selection unavailable
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div
            data-properties-panel
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
        >
            <SectionHeader title="Design" />

            <MultiSelectAlignSection />

            <PositionSection
                node={primaryNode}
                parentNode={parentNode}
                onUpdate={(updates) => applySharedUpdate(updates)}
                isAutoLayout={isAutoLayout}
                isInAutoLayoutParent={isInAutoLayoutParent}
                hideAlignment
            />

            <MarginSection node={primaryNode} onUpdate={(updates) => applySharedUpdate(updates)} isInAutoLayoutParent={isInAutoLayoutParent} />

            {visibility.showLayout && isPrimaryFrame && (
                <LayoutSection
                    node={primaryNode as FrameNode}
                    onUpdate={(updates) => applySharedUpdate(updates, (node) => node.type === 'frame')}
                />
            )}

            <SizeSection
                key={primaryNode.id}
                node={primaryNode}
                parentNode={parentNode}
                onUpdate={(updates) => applySharedUpdate(updates)}
            />

            {visibility.showAppearance && (
                <AppearanceSection
                    node={primaryNode}
                    onUpdate={(updates) => applySharedUpdate(updates)}
                    showCornerRadius={visibility.showAppearanceCornerRadius}
                />
            )}

            {visibility.showVector && allVectors && (
                <VectorSection
                    node={primaryNode as VectorNode}
                    onUpdate={(updates) => applySharedUpdate(updates, (node) => node.type === 'vector')}
                />
            )}

            {visibility.showFill && (
                <FillSection node={primaryNode} onUpdate={(updates) => applySharedUpdate(updates)} />
            )}
            {visibility.showStroke && (
                <StrokeSection node={primaryNode} onUpdate={(updates) => applySharedUpdate(updates)} />
            )}

            {visibility.showTypography && allText && (
                <TypographySection
                    node={primaryNode as TextNode}
                    onUpdate={(updates) => applySharedUpdate(updates, (node) => node.type === 'text')}
                />
            )}

            {visibility.showEffects && (
                <EffectsSection node={primaryNode} onUpdate={(updates) => applySharedUpdate(updates)} />
            )}

            {visibility.showExport && <ExportSection node={primaryNode} />}

            <div className="flex items-center justify-center py-4 border-b border-border/40">
                <p className="text-[11px] text-muted-foreground/50 select-none">
                    {selectedNodes.length} elements selected
                </p>
            </div>

            <div className="h-8 shrink-0" />
        </div>
    )
}

/* ── Main Panel ───────────────────────────────────────────── */

export function PropertiesPanel() {
    const nodes = useEditorStore((s) => s.nodes)
    const selectedIds = useEditorStore((s) => s.selectedIds)
    const updateNode = useEditorStore((s) => s.updateNode)
    // Must call ALL hooks before any early returns (React rules of hooks)
    const vectorEditNodeId = useEditorStore((s) => s.vectorEditNodeId)

    // Get selected node
    const node: ScytleNode | null = useMemo(() => {
        if (selectedIds.length !== 1) return null
        return findNodeById(nodes, selectedIds[0])
    }, [nodes, selectedIds])

    // Direct parent frame (if any)
    const parentNode = useMemo<FrameNode | null>(() => {
        if (!node) return null
        const result = findParentOfNode(nodes, node.id)
        if (!result || !result.parent) return null
        return result.parent
    }, [nodes, node])

    // Detect if node is in an auto-layout flow (not ignoring auto layout)
    const isAutoLayout = useMemo(() => {
        if (!node) return false
        return isInAutoLayoutFlow(node, parentNode)
    }, [node, parentNode])

    // Whether node is inside an auto-layout parent (regardless of its own positioning)
    const isInAutoLayoutParent = useMemo(() => {
        return !!parentNode && parentNode.layout.mode !== 'none'
    }, [parentNode])

    // Stable update callback
    const onUpdate = useCallback(
        (updates: Record<string, unknown>) => {
            if (!node) return
            updateNode(node.id, withVectorStrokeCompatibility(node, updates))
        },
        [node, updateNode]
    )

    // ── Empty state → Page settings ──────────────────────────

    if (selectedIds.length === 0) {
        return <PageSettings />
    }

    if (selectedIds.length > 1) {
        return <MultiSelectSettings allNodes={nodes} selectedIds={selectedIds} />
    }

    if (!node) {
        return (
            <div className="h-full">
                <SectionHeader title="Design" />
                <div className="flex items-center justify-center pt-12">
                    <p className="text-[11px] text-muted-foreground/50 select-none">
                        Node not found
                    </p>
                </div>
            </div>
        )
    }

    // ── Panel content ────────────────────────────────────────

    const isFrame = node.type === 'frame'
    const isText = node.type === 'text'
    const isVector = node.type === 'vector'
    const isImage = node.type === 'image'
    const visibility = getSingleInspectorVisibility(node)

    // Figma: vector nodes show "Vector" in edit mode, "Vector path" in select mode
    const vectorLabel = isVector
        ? (vectorEditNodeId === node.id ? 'Vector' : 'Vector path')
        : TYPE_LABELS[node.type]

    return (
        <div
            data-properties-panel
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Design tab header */}
            <SectionHeader title="Design" />

            {/* Node type + name */}
            <div className="border-b border-border/40">
                <div className="flex items-center gap-2 px-3 h-9">
                    <span className="text-muted-foreground/60 shrink-0">{TYPE_ICONS[node.type]}</span>
                    <input
                        type="text"
                        value={node.name}
                        className={cn(
                            'flex-1 text-[11px] font-medium bg-transparent border-none outline-none',
                            'hover:bg-muted/40 focus:bg-muted/50 px-1.5 -mx-1.5 rounded-sm transition-colors'
                        )}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                    />
                    <span className="text-[10px] text-muted-foreground/40">
                        {vectorLabel}
                    </span>
                </div>
            </div>

            {/* Property sections — Figma order */}

            <PositionSection
                node={node}
                parentNode={parentNode}
                onUpdate={onUpdate}
                isAutoLayout={isAutoLayout}
                isInAutoLayoutParent={isInAutoLayoutParent}
            />
            <MarginSection node={node} onUpdate={onUpdate} isInAutoLayoutParent={isInAutoLayoutParent} />

            {visibility.showLayout && isFrame && <LayoutSection node={node as FrameNode} onUpdate={onUpdate} />}

            <SizeSection key={node.id} node={node} parentNode={parentNode} onUpdate={onUpdate} />

            {visibility.showTypography && isText && <TypographySection node={node as TextNode} onUpdate={onUpdate} />}
            {visibility.showImage && isImage && <ImageSection node={node} onUpdate={onUpdate} />}
            {visibility.showVector && isVector && <VectorSection node={node as VectorNode} onUpdate={onUpdate} />}

            {/* Appearance → Fill → Stroke → Effects (Figma order) */}
            {/* VectorSection handles fill + stroke for vectors — skip generic sections */}
            {visibility.showAppearance && (
                <AppearanceSection
                    node={node}
                    onUpdate={onUpdate}
                    showCornerRadius={visibility.showAppearanceCornerRadius}
                />
            )}
            {visibility.showFill && <FillSection node={node} onUpdate={onUpdate} />}
            {visibility.showStroke && <StrokeSection node={node} onUpdate={onUpdate} />}
            {visibility.showEffects && <EffectsSection node={node} onUpdate={onUpdate} />}

            {/* Export section — Figma: always at the very bottom */}
            {visibility.showExport && <ExportSection node={node} />}

            {/* Bottom spacer to prevent scroll cutoff */}
            <div className="h-8 shrink-0" />
        </div>
    )
}
