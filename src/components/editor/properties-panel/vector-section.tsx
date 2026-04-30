'use client'

import { useCallback } from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { VectorNode, HandleMirroring, StrokeCap, StrokeJoin } from '@/types/canvas'
import { NumberInput, SelectInput, Section } from './inputs'
import { cn } from '@/lib/utils'
import { resolveVectorStroke } from '@/lib/vector-stroke'

interface VectorSectionProps {
    node: VectorNode
    onUpdate: (updates: Record<string, unknown>) => void
}

/* ── Mirroring icons (Figma-style) ─────────────────────────── */

function MirrorNoneIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
            <path d="M3 11 L7 3 L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function MirrorAngleIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
            <path d="M2 10 Q7 2 12 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            <line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" />
        </svg>
    )
}

function MirrorSymmetricIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
            <path d="M2 10 Q7 2 12 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            <circle cx="7" cy="4" r="1.5" fill="currentColor" />
        </svg>
    )
}

const MIRRORING_OPTIONS: { value: HandleMirroring; label: string; icon: React.ReactNode }[] = [
    { value: 'NONE', label: 'No mirroring', icon: <MirrorNoneIcon /> },
    { value: 'ANGLE', label: 'Angle mirroring', icon: <MirrorAngleIcon /> },
    { value: 'ANGLE_AND_LENGTH', label: 'Symmetric', icon: <MirrorSymmetricIcon /> },
]

const CAP_OPTIONS: { value: StrokeCap; label: string }[] = [
    { value: 'NONE', label: 'None' },
    { value: 'ROUND', label: 'Round' },
    { value: 'SQUARE', label: 'Square' },
]

const JOIN_OPTIONS: { value: StrokeJoin; label: string }[] = [
    { value: 'MITER', label: 'Miter' },
    { value: 'BEVEL', label: 'Bevel' },
    { value: 'ROUND', label: 'Round' },
]

/**
 * VectorSection — vector-specific controls only.
 * Position, size, appearance, fill, and stroke are handled by shared inspector sections.
 * This section keeps only controls unique to vectors.
 */
export function VectorSection({ node, onUpdate }: VectorSectionProps) {
    const vectorEditNodeId = useEditorStore((s) => s.vectorEditNodeId)
    const selectedVertexIndices = useEditorStore((s) => s.selectedVertexIndices)
    const updateVertex = useEditorStore((s) => s.updateVertex)

    const inEditMode = vectorEditNodeId === node.id
    const singleVertex = inEditMode && selectedVertexIndices.length === 1
        ? node.vectorNetwork.vertices[selectedVertexIndices[0]]
        : null
    const singleVertexIdx = singleVertex ? selectedVertexIndices[0] : -1

    // Mirroring: per-vertex override when selected, otherwise node-level
    const activeMirroring = singleVertex?.handleMirroring ?? node.handleMirroring
    const setMirroring = useCallback(
        (m: HandleMirroring) => {
            if (singleVertex && vectorEditNodeId) {
                updateVertex(vectorEditNodeId, singleVertexIdx, { handleMirroring: m })
            } else {
                onUpdate({ handleMirroring: m })
            }
        },
        [onUpdate, singleVertex, singleVertexIdx, vectorEditNodeId, updateVertex],
    )

    // Corner radius (per-vertex)
    const activeCornerRadius = singleVertex?.cornerRadius ?? 0
    const handleCornerRadius = useCallback(
        (v: number) => {
            if (vectorEditNodeId && singleVertexIdx >= 0) {
                updateVertex(vectorEditNodeId, singleVertexIdx, { cornerRadius: v })
            }
        },
        [vectorEditNodeId, singleVertexIdx, updateVertex],
    )

    const resolvedStroke = resolveVectorStroke(node)

    return (
        <>
            <Section title="Vector">
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-muted-foreground/70">Mirroring</span>
                    </div>
                    <div className="flex items-center gap-0.5 bg-muted/30 rounded-md p-0.5">
                        {MIRRORING_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                title={opt.label}
                                className={cn(
                                    'flex-1 flex items-center justify-center h-7 rounded-[5px] transition-colors',
                                    activeMirroring === opt.value
                                        ? 'bg-background shadow-sm text-foreground'
                                        : 'text-muted-foreground/60 hover:text-muted-foreground',
                                )}
                                onClick={() => setMirroring(opt.value)}
                            >
                                {opt.icon}
                            </button>
                        ))}
                    </div>
                </div>

                {inEditMode && singleVertex && (
                    <NumberInput
                        label="Corner radius"
                        value={activeCornerRadius}
                        min={0}
                        max={1000}
                        step={1}
                        onChange={handleCornerRadius}
                    />
                )}
            </Section>

            {resolvedStroke.visible && (
                <Section title="Stroke endpoints">
                    <div className="grid grid-cols-2 gap-2">
                        <SelectInput
                            label="Cap"
                            value={node.strokeCap}
                            options={CAP_OPTIONS}
                            onChange={(v) => onUpdate({ strokeCap: v })}
                        />
                        <SelectInput
                            label="Join"
                            value={node.strokeJoin}
                            options={JOIN_OPTIONS}
                            onChange={(v) => onUpdate({ strokeJoin: v })}
                        />
                    </div>
                </Section>
            )}
        </>
    )
}
