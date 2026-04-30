'use client'

import type { ScytleNode, FrameNode, Padding, LayoutConstraints } from '@/types/canvas'
import { findParentOfNode } from '@/types/canvas'
import { useEditorStore } from '@/store/editor-store'
import { Section, NumberInput, IconButton, SelectInput } from './inputs'
import { getDefaultConstraints, shouldShowConstraints as shouldShowNodeConstraints } from './layout-capabilities'
import {
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    RotateCw,
    FlipHorizontal,
    FlipVertical,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

interface PositionSectionProps {
    node: ScytleNode
    parentNode: FrameNode | null
    onUpdate: (updates: Record<string, unknown>) => void
    /** Whether this node is in an auto-layout container (position is auto) */
    isAutoLayout: boolean
    /** Whether this node's parent uses auto layout (regardless of node's own positioning) */
    isInAutoLayoutParent: boolean
    /** Hide alignment controls (used by multi-select, which has its own align section). */
    hideAlignment?: boolean
}

/**
 * Returns alignment bounds: either the parent frame (with padding), or
 * the viewport rectangle for top-level nodes (align to canvas origin).
 */
function getAlignmentBounds(nodeId: string): { x: number; y: number; width: number; height: number } | null {
    const state = useEditorStore.getState()
    const result = findParentOfNode(state.nodes, nodeId)
    if (result?.parent) {
        // Alignment relative to parent (accounting for padding)
        return {
            x: result.parent.padding.left,
            y: result.parent.padding.top,
            width: result.parent.width - result.parent.padding.left - result.parent.padding.right,
            height: result.parent.height - result.parent.padding.top - result.parent.padding.bottom,
        }
    }
    // Top-level: align relative to the viewport (canvas origin 0,0 + visible area)
    const vp = state.viewportRect
    if (!vp) return null
    return {
        x: -state.panX / state.zoom,
        y: -state.panY / state.zoom,
        width: vp.width / state.zoom,
        height: vp.height / state.zoom,
    }
}

/**
 * Checks if a node is a parent frame with children.
 * In Figma, alignment buttons on a selected parent frame affect the
 * frame's children (align them within the frame), not the frame itself.
 */
function isParentFrame(node: ScytleNode): node is FrameNode {
    return node.type === 'frame' && (node as FrameNode).children.length > 0
}

/**
 * Returns the content bounds of a frame (inner area after padding).
 */
function getFrameContentBounds(frame: FrameNode) {
    return {
        x: frame.padding.left,
        y: frame.padding.top,
        width: frame.width - frame.padding.left - frame.padding.right,
        height: frame.height - frame.padding.top - frame.padding.bottom,
    }
}

/* ── Ignore Auto Layout Icon (Figma-style) ──────────────────── */

function IgnoreAutoLayoutIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Outer frame corners */}
            <path d="M2 4V2h2M12 2h2v2M14 12v2h-2M4 14H2v-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Inner absolute-positioned element */}
            <rect x="5" y="5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </svg>
    )
}

/* ── Constraints Section ────────────────────────────────────── */

const H_CONSTRAINT_OPTIONS = [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'center', label: 'Center' },
    { value: 'leftRight', label: 'Left and right' },
    { value: 'scale', label: 'Scale' },
]

const V_CONSTRAINT_OPTIONS = [
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'center', label: 'Center' },
    { value: 'topBottom', label: 'Top and bottom' },
    { value: 'scale', label: 'Scale' },
]

const DEFAULT_CONSTRAINTS: LayoutConstraints = getDefaultConstraints()

type AlignHorizontalConstraint = Extract<LayoutConstraints['horizontal'], 'left' | 'center' | 'right'>
type AlignVerticalConstraint = Extract<LayoutConstraints['vertical'], 'top' | 'center' | 'bottom'>

function mergeHorizontalConstraint(
    current: LayoutConstraints | undefined,
    horizontal: AlignHorizontalConstraint
): LayoutConstraints {
    return {
        ...(current ?? DEFAULT_CONSTRAINTS),
        horizontal,
    }
}

function mergeVerticalConstraint(
    current: LayoutConstraints | undefined,
    vertical: AlignVerticalConstraint
): LayoutConstraints {
    return {
        ...(current ?? DEFAULT_CONSTRAINTS),
        vertical,
    }
}

interface ConstraintsSectionProps {
    constraints: LayoutConstraints
    onUpdate: (updates: Record<string, unknown>) => void
}

function ConstraintsSection({ constraints, onUpdate }: ConstraintsSectionProps) {
    const updateConstraint = (partial: Partial<LayoutConstraints>) => {
        onUpdate({ constraints: { ...constraints, ...partial } })
    }

    return (
        <div className="flex items-center gap-2">
            {/* Dropdowns — stacked vertically */}
            <div className="flex-1 space-y-1">
                {/* Horizontal constraint */}
                <div className="flex items-center gap-1.5">
                    <HConstraintIcon className="text-muted-foreground/60 shrink-0" />
                    <SelectInput
                        value={constraints.horizontal}
                        options={H_CONSTRAINT_OPTIONS}
                        onChange={(v) => updateConstraint({ horizontal: v as LayoutConstraints['horizontal'] })}
                        className="flex-1"
                    />
                </div>
                {/* Vertical constraint */}
                <div className="flex items-center gap-1.5">
                    <VConstraintIcon className="text-muted-foreground/60 shrink-0" />
                    <SelectInput
                        value={constraints.vertical}
                        options={V_CONSTRAINT_OPTIONS}
                        onChange={(v) => updateConstraint({ vertical: v as LayoutConstraints['vertical'] })}
                        className="flex-1"
                    />
                </div>
            </div>

            {/* Interactive constraint visual */}
            <ConstraintVisual
                constraints={constraints}
                onToggleH={(edge) => {
                    const h = constraints.horizontal
                    if (edge === 'left') {
                        if (h === 'left') updateConstraint({ horizontal: 'right' })
                        else if (h === 'leftRight') updateConstraint({ horizontal: 'right' })
                        else if (h === 'right') updateConstraint({ horizontal: 'leftRight' })
                        else updateConstraint({ horizontal: 'left' })
                    } else {
                        if (h === 'right') updateConstraint({ horizontal: 'left' })
                        else if (h === 'leftRight') updateConstraint({ horizontal: 'left' })
                        else if (h === 'left') updateConstraint({ horizontal: 'leftRight' })
                        else updateConstraint({ horizontal: 'right' })
                    }
                }}
                onToggleV={(edge) => {
                    const v = constraints.vertical
                    if (edge === 'top') {
                        if (v === 'top') updateConstraint({ vertical: 'bottom' })
                        else if (v === 'topBottom') updateConstraint({ vertical: 'bottom' })
                        else if (v === 'bottom') updateConstraint({ vertical: 'topBottom' })
                        else updateConstraint({ vertical: 'top' })
                    } else {
                        if (v === 'bottom') updateConstraint({ vertical: 'top' })
                        else if (v === 'topBottom') updateConstraint({ vertical: 'top' })
                        else if (v === 'top') updateConstraint({ vertical: 'topBottom' })
                        else updateConstraint({ vertical: 'bottom' })
                    }
                }}
            />
        </div>
    )
}

/* ── Constraint Icons ────────────────────────────────────────── */

function HConstraintIcon({ className }: { className?: string }) {
    return (
        <svg width={11} height={11} viewBox="0 0 12 12" fill="none" className={className}>
            <path d="M1 6h10M1 6l2-2M1 6l2 2M11 6l-2-2M11 6l-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function VConstraintIcon({ className }: { className?: string }) {
    return (
        <svg width={11} height={11} viewBox="0 0 12 12" fill="none" className={className}>
            <path d="M6 1v10M6 1L4 3M6 1l2 2M6 11L4 9M6 11l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ── Constraint Visual Indicator ─────────────────────────────── */
/* Figma-style: square with inner element + clickable edge lines */

interface ConstraintVisualProps {
    constraints: LayoutConstraints
    onToggleH: (edge: 'left' | 'right') => void
    onToggleV: (edge: 'top' | 'bottom') => void
}

function ConstraintVisual({ constraints, onToggleH, onToggleV }: ConstraintVisualProps) {
    const h = constraints.horizontal
    const v = constraints.vertical

    const pinLeft = h === 'left' || h === 'leftRight'
    const pinRight = h === 'right' || h === 'leftRight'
    const pinTop = v === 'top' || v === 'topBottom'
    const pinBottom = v === 'bottom' || v === 'topBottom'

    const activeColor = '#3b82f6'
    const inactiveColor = 'currentColor'
    const inactiveOpacity = 0.2

    return (
        <div className="w-10.5 h-10.5 shrink-0 relative">
            <svg width="42" height="42" viewBox="0 0 42 42" fill="none" className="text-muted-foreground">
                {/* Outer frame */}
                <rect x="1" y="1" width="40" height="40" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.3" />

                {/* Inner element (centered) */}
                <rect x="15" y="15" width="12" height="12" rx="1" stroke={activeColor} strokeWidth="1.2" fill={activeColor} fillOpacity="0.08" />

                {/* Left line — clickable */}
                <line x1="1" y1="21" x2="15" y2="21"
                    stroke={pinLeft ? activeColor : inactiveColor}
                    strokeWidth={pinLeft ? 1.5 : 1}
                    strokeDasharray={pinLeft ? 'none' : '2 2'}
                    opacity={pinLeft ? 1 : inactiveOpacity}
                    className="cursor-pointer"
                    onClick={() => onToggleH('left')}
                />
                {/* Right line — clickable */}
                <line x1="27" y1="21" x2="41" y2="21"
                    stroke={pinRight ? activeColor : inactiveColor}
                    strokeWidth={pinRight ? 1.5 : 1}
                    strokeDasharray={pinRight ? 'none' : '2 2'}
                    opacity={pinRight ? 1 : inactiveOpacity}
                    className="cursor-pointer"
                    onClick={() => onToggleH('right')}
                />
                {/* Top line — clickable */}
                <line x1="21" y1="1" x2="21" y2="15"
                    stroke={pinTop ? activeColor : inactiveColor}
                    strokeWidth={pinTop ? 1.5 : 1}
                    strokeDasharray={pinTop ? 'none' : '2 2'}
                    opacity={pinTop ? 1 : inactiveOpacity}
                    className="cursor-pointer"
                    onClick={() => onToggleV('top')}
                />
                {/* Bottom line — clickable */}
                <line x1="21" y1="27" x2="21" y2="41"
                    stroke={pinBottom ? activeColor : inactiveColor}
                    strokeWidth={pinBottom ? 1.5 : 1}
                    strokeDasharray={pinBottom ? 'none' : '2 2'}
                    opacity={pinBottom ? 1 : inactiveOpacity}
                    className="cursor-pointer"
                    onClick={() => onToggleV('bottom')}
                />
            </svg>
        </div>
    )
}

/* ── Position Section ────────────────────────────────────────── */

export function PositionSection({
    node,
    parentNode,
    onUpdate,
    isAutoLayout,
    isInAutoLayoutParent,
    hideAlignment = false,
}: PositionSectionProps) {
    const updateNode = useEditorStore((s) => s.updateNode)

    const isIgnoringAutoLayout = isInAutoLayoutParent && node.positioning === 'absolute'
    const showConstraints = shouldShowNodeConstraints(node, parentNode)
    const isGridParent = parentNode?.layout.mode === 'grid'
    const canUseGridCellAlignment = isGridParent && !isIgnoringAutoLayout

    const colCount = isGridParent
        ? (parentNode.layout.columnTracks?.length
            ?? (typeof parentNode.layout.columns === 'number' ? parentNode.layout.columns : 2))
        : 1
    const rowCount = isGridParent
        ? (parentNode.layout.rowTracks?.length
            ?? (typeof parentNode.layout.rows === 'number' ? parentNode.layout.rows : undefined))
        : undefined
    const colStart = (node as FrameNode).gridColumnStart ?? 1
    const rowStart = (node as FrameNode).gridRowStart ?? 1
    const colSpan = (node as FrameNode).gridColumnSpan ?? 1
    const rowSpan = (node as FrameNode).gridRowSpan ?? 1

    const getHorizontalAlignUpdates = useCallback(
        (x: number, horizontal: AlignHorizontalConstraint): Record<string, unknown> => {
            if (!isIgnoringAutoLayout) {
                return { x }
            }

            return {
                x,
                constraints: mergeHorizontalConstraint(node.constraints, horizontal),
            }
        },
        [isIgnoringAutoLayout, node.constraints]
    )

    const getVerticalAlignUpdates = useCallback(
        (y: number, vertical: AlignVerticalConstraint): Record<string, unknown> => {
            if (!isIgnoringAutoLayout) {
                return { y }
            }

            return {
                y,
                constraints: mergeVerticalConstraint(node.constraints, vertical),
            }
        },
        [isIgnoringAutoLayout, node.constraints]
    )

    const shouldSyncChildConstraintsOnAlign = node.type === 'frame' && node.layout.mode !== 'none'

    // Toggle handler for "Ignore auto layout"
    const handleToggleIgnoreAutoLayout = useCallback(() => {
        if (node.positioning === 'absolute') {
            onUpdate({ positioning: 'auto' })
        } else {
            onUpdate({ positioning: 'absolute' })
        }
    }, [node.positioning, onUpdate])

    // ── Alignment handlers ───────────────────────────────────
    // When a parent frame is selected, alignment affects CHILDREN.
    // Otherwise, alignment affects the node itself (like before).

    const handleAlignLeft = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = { x: bounds.x }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeHorizontalConstraint(child.constraints, 'left')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getHorizontalAlignUpdates(bounds.x, 'left'))
        }
    }, [getHorizontalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    const handleAlignCenterH = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = {
                    x: bounds.x + (bounds.width - child.width) / 2,
                }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeHorizontalConstraint(child.constraints, 'center')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getHorizontalAlignUpdates(bounds.x + (bounds.width - node.width) / 2, 'center'))
        }
    }, [getHorizontalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    const handleAlignRight = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = { x: bounds.x + bounds.width - child.width }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeHorizontalConstraint(child.constraints, 'right')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getHorizontalAlignUpdates(bounds.x + bounds.width - node.width, 'right'))
        }
    }, [getHorizontalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    const handleAlignTop = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = { y: bounds.y }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeVerticalConstraint(child.constraints, 'top')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getVerticalAlignUpdates(bounds.y, 'top'))
        }
    }, [getVerticalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    const handleAlignCenterV = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = {
                    y: bounds.y + (bounds.height - child.height) / 2,
                }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeVerticalConstraint(child.constraints, 'center')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getVerticalAlignUpdates(bounds.y + (bounds.height - node.height) / 2, 'center'))
        }
    }, [getVerticalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    const handleAlignBottom = useCallback(() => {
        if (isParentFrame(node)) {
            const bounds = getFrameContentBounds(node)
            for (const child of node.children) {
                const updates: Record<string, unknown> = { y: bounds.y + bounds.height - child.height }
                if (shouldSyncChildConstraintsOnAlign && child.positioning === 'absolute') {
                    updates.constraints = mergeVerticalConstraint(child.constraints, 'bottom')
                }
                updateNode(child.id, updates)
            }
        } else {
            const bounds = getAlignmentBounds(node.id)
            if (!bounds) return
            onUpdate(getVerticalAlignUpdates(bounds.y + bounds.height - node.height, 'bottom'))
        }
    }, [getVerticalAlignUpdates, node, onUpdate, shouldSyncChildConstraintsOnAlign, updateNode])

    // "Ignore auto layout" toggle button — shown as action in section header
    const ignoreAction = isInAutoLayoutParent ? (
        <button
            data-section-action
            onClick={handleToggleIgnoreAutoLayout}
            title="Ignore auto layout"
            className={cn(
                'flex items-center justify-center w-7 h-7 rounded-sm border border-transparent shrink-0 transition-colors',
                isIgnoringAutoLayout
                    ? 'text-blue-600 bg-blue-500/12 border-blue-500/25 hover:bg-blue-500/20'
                    : 'text-foreground/75 bg-muted/35 border-border/40 hover:text-foreground hover:bg-muted/55'
            )}
        >
            <IgnoreAutoLayoutIcon size={15} />
        </button>
    ) : undefined

    return (
        <Section title="Position" action={ignoreAction}>
            {/* Alignment buttons — Figma: 6-button grid */}
            {!hideAlignment && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-px rounded-sm bg-muted/45 p-0.5">
                        <IconButton
                            icon={<AlignHorizontalJustifyStart size={14} />}
                            onClick={handleAlignLeft}
                            title="Align left"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                        <IconButton
                            icon={<AlignHorizontalJustifyCenter size={14} />}
                            onClick={handleAlignCenterH}
                            title="Align center"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                        <IconButton
                            icon={<AlignHorizontalJustifyEnd size={14} />}
                            onClick={handleAlignRight}
                            title="Align right"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                    </div>
                    <div className="flex items-center gap-px rounded-sm bg-muted/45 p-0.5">
                        <IconButton
                            icon={<AlignVerticalJustifyStart size={14} />}
                            onClick={handleAlignTop}
                            title="Align top"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                        <IconButton
                            icon={<AlignVerticalJustifyCenter size={14} />}
                            onClick={handleAlignCenterV}
                            title="Align middle"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                        <IconButton
                            icon={<AlignVerticalJustifyEnd size={14} />}
                            onClick={handleAlignBottom}
                            title="Align bottom"
                            disabled={isAutoLayout && !canUseGridCellAlignment}
                            disabledClassName="opacity-70 cursor-not-allowed text-muted-foreground/80 bg-muted/35"
                        />
                    </div>
                </div>
            )}
            {/* X / Y */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <NumberInput
                    label="X"
                    value={Math.round(node.x)}
                    onChange={(v) => onUpdate({ x: v })}
                    step={1}
                    disabled={isAutoLayout}
                    disabledClassName="opacity-75 cursor-not-allowed bg-muted/35 border-border/30 text-muted-foreground"
                />
                <NumberInput
                    label="Y"
                    value={Math.round(node.y)}
                    onChange={(v) => onUpdate({ y: v })}
                    step={1}
                    disabled={isAutoLayout}
                    disabledClassName="opacity-75 cursor-not-allowed bg-muted/35 border-border/30 text-muted-foreground"
                />
            </div>

            {/* Grid child placement controls */}
            {isGridParent && !isIgnoringAutoLayout && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <NumberInput
                            label="Col"
                            value={colStart}
                            onChange={(v) => onUpdate({ gridColumnStart: v })}
                            min={1}
                            max={colCount}
                            step={1}
                            className="flex-1"
                            labelWidth="w-6"
                        />
                        <NumberInput
                            label="Span"
                            value={colSpan === -1 ? colCount : colSpan}
                            onChange={(v) => onUpdate({ gridColumnSpan: v >= colCount ? -1 : Math.max(1, v) })}
                            min={1}
                            max={Math.max(1, colCount - colStart + 1)}
                            step={1}
                            className="flex-1"
                            labelWidth="w-8"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <NumberInput
                            label="Row"
                            value={rowStart}
                            onChange={(v) => onUpdate({ gridRowStart: v })}
                            min={1}
                            max={rowCount ?? 999}
                            step={1}
                            className="flex-1"
                            labelWidth="w-6"
                        />
                        <NumberInput
                            label="Span"
                            value={rowSpan === -1 ? (rowCount ?? 1) : rowSpan}
                            onChange={(v) => onUpdate({ gridRowSpan: rowCount && v >= rowCount ? -1 : Math.max(1, v) })}
                            min={1}
                            max={rowCount ? Math.max(1, rowCount - rowStart + 1) : 999}
                            step={1}
                            className="flex-1"
                            labelWidth="w-8"
                        />
                    </div>
                </div>
            )}

            {/* Constraints — regular-frame children, plus absolute children in auto layout */}
            {showConstraints && (
                <ConstraintsSection
                    constraints={node.constraints ?? DEFAULT_CONSTRAINTS}
                    onUpdate={onUpdate}
                />
            )}

            {/* Rotation + Flip */}
            <div className="flex items-center gap-1.5">
                <NumberInput
                    label="R"
                    value={node.rotation}
                    onChange={(v) => onUpdate({ rotation: v })}
                    step={1}
                    suffix="°"
                    className="flex-1"
                />
                <IconButton
                    icon={<RotateCw size={13} />}
                    onClick={() => onUpdate({ rotation: (node.rotation + 90) % 360 })}
                    title="Rotate 90°"
                />
                <IconButton
                    icon={<FlipHorizontal size={13} />}
                    onClick={() => onUpdate({ flipX: !node.flipX })}
                    title="Flip horizontal (Shift+H)"
                    active={!!node.flipX}
                />
                <IconButton
                    icon={<FlipVertical size={13} />}
                    onClick={() => onUpdate({ flipY: !node.flipY })}
                    title="Flip vertical (Shift+V)"
                    active={!!node.flipY}
                />
            </div>
        </Section>
    )
}

/* ── Margin icons (exact same as padding icons for visual consistency) ── */

function HorizontalMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="1" y1="2" x2="1" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="2" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function VerticalMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function LeftMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="1" y1="2" x2="1" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function RightMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="11" y1="2" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function TopMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function BottomMarginIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-muted-foreground shrink-0">
            <line x1="2" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function IndividualMarginIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" className="text-muted-foreground shrink-0">
            {expanded ? (
                <>
                    <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
                    <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
                    <circle cx="9.5" cy="4.5" r="1" fill="currentColor" />
                    <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
                    <circle cx="9.5" cy="9.5" r="1" fill="currentColor" />
                </>
            ) : (
                <>
                    <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
                    <line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 1" />
                    <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 1" />
                </>
            )}
        </svg>
    )
}


/* ── Margin Section ────────────────────────────────────────── */

interface MarginSectionProps {
    node: ScytleNode
    onUpdate: (updates: Record<string, unknown>) => void
    /** Whether the node lives inside an auto-layout parent */
    isInAutoLayoutParent?: boolean
}

export function MarginSection({ node, onUpdate, isInAutoLayoutParent }: MarginSectionProps) {
    const m = node.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
    const hasExistingMargin = !!node.margin

    if (!hasExistingMargin && !isInAutoLayoutParent) return null

    const hMixed = m.left !== m.right
    const vMixed = m.top !== m.bottom
    const [individualMode, setIndividualMode] = useState(false)
    const showExpanded = individualMode || hMixed || vMixed

    const updateMargin = (partial: Partial<Padding>) => {
        onUpdate({ margin: { ...m, ...partial } })
    }

    return (
        <Section title="Margin">
            <div className="flex items-start gap-1">
                <div className="flex-1 space-y-1">
                    {showExpanded ? (
                        <>
                            <div className="flex gap-1">
                                <div className="flex items-center gap-0.5 flex-1">
                                    <span className="flex items-center" title="Left margin">
                                        <LeftMarginIcon />
                                    </span>
                                    <NumberInput
                                        value={m.left}
                                        onChange={(v) => updateMargin({ left: v })}
                                        step={1} className="flex-1"
                                    />
                                </div>
                                <div className="flex items-center gap-0.5 flex-1">
                                    <span className="flex items-center" title="Top margin">
                                        <TopMarginIcon />
                                    </span>
                                    <NumberInput
                                        value={m.top}
                                        onChange={(v) => updateMargin({ top: v })}
                                        step={1} className="flex-1"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <div className="flex items-center gap-0.5 flex-1">
                                    <span className="flex items-center" title="Right margin">
                                        <RightMarginIcon />
                                    </span>
                                    <NumberInput
                                        value={m.right}
                                        onChange={(v) => updateMargin({ right: v })}
                                        step={1} className="flex-1"
                                    />
                                </div>
                                <div className="flex items-center gap-0.5 flex-1">
                                    <span className="flex items-center" title="Bottom margin">
                                        <BottomMarginIcon />
                                    </span>
                                    <NumberInput
                                        value={m.bottom}
                                        onChange={(v) => updateMargin({ bottom: v })}
                                        step={1} className="flex-1"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex gap-1">
                            <div className="flex items-center gap-0.5 flex-1">
                                <span className="flex items-center" title="Horizontal margin">
                                    <HorizontalMarginIcon />
                                </span>
                                <NumberInput
                                    value={m.left}
                                    onChange={(v) => updateMargin({ left: v, right: v })}
                                    step={1} className="flex-1"
                                />
                            </div>
                            <div className="flex items-center gap-0.5 flex-1">
                                <span className="flex items-center" title="Vertical margin">
                                    <VerticalMarginIcon />
                                </span>
                                <NumberInput
                                    value={m.top}
                                    onChange={(v) => updateMargin({ top: v, bottom: v })}
                                    step={1} className="flex-1"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Individual toggle button */}
                <button
                    className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-sm transition-colors shrink-0',
                        showExpanded
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                    )}
                    onClick={() => {
                        if (showExpanded) {
                            if (hMixed || vMixed) {
                                updateMargin({
                                    left: m.left, right: m.left,
                                    top: m.top, bottom: m.top,
                                })
                            }
                            setIndividualMode(false)
                        } else {
                            setIndividualMode(true)
                        }
                    }}
                    title={showExpanded ? 'Uniform margin' : 'Individual margin'}
                >
                    <IndividualMarginIcon expanded={showExpanded} />
                </button>
            </div>
        </Section>
    )
}

