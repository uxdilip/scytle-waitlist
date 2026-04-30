'use client'

import { useEditorStore } from '@/store/editor-store'
import type { DragInfo } from './hooks/use-node-drag'

interface SnapGuideOverlayProps {
    dragInfo: DragInfo
}

/**
 * Renders thin pink snap guide lines (Figma-style) while a node is being dragged.
 * Lines are drawn in screen space over the canvas viewport.
 * Vertical guides = snapped X axis positions; horizontal guides = snapped Y axis.
 */
export function SnapGuideOverlay({ dragInfo }: SnapGuideOverlayProps) {
    const zoom = useEditorStore((s) => s.zoom)
    const panX = useEditorStore((s) => s.panX)
    const panY = useEditorStore((s) => s.panY)
    const viewportRect = useEditorStore((s) => s.viewportRect)

    if (!dragInfo.isDragging || dragInfo.snapLines.length === 0) return null

    const vW = viewportRect?.width ?? window.innerWidth
    const vH = viewportRect?.height ?? window.innerHeight

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: vW, height: vH, overflow: 'visible', zIndex: 60 }}
        >
            {dragInfo.snapLines.map((line, i) => {
                if (line.axis === 'x') {
                    // Vertical line at canvas X position
                    const sx = line.canvasPos * zoom + panX
                    return (
                        <line
                            key={i}
                            x1={sx} y1={0}
                            x2={sx} y2={vH}
                            stroke="#e855e8"
                            strokeWidth={1}
                            opacity={0.85}
                        />
                    )
                } else {
                    // Horizontal line at canvas Y position
                    const sy = line.canvasPos * zoom + panY
                    return (
                        <line
                            key={i}
                            x1={0} y1={sy}
                            x2={vW} y2={sy}
                            stroke="#e855e8"
                            strokeWidth={1}
                            opacity={0.85}
                        />
                    )
                }
            })}
        </svg>
    )
}
