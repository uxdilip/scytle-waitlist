'use client'

import { memo } from 'react'
import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react'

/**
 * Custom edge for sitemap connections - Relume style
 * Uses smooth step path with proper offset for clean orthogonal routing
 */
export const SitemapEdge = memo(function SitemapEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
}: EdgeProps) {
    // Calculate offset based on vertical distance for proper stepping
    // This ensures edges have a consistent midpoint for horizontal segments
    const verticalDistance = Math.abs(targetY - sourceY)
    const offset = Math.max(20, verticalDistance * 0.25) // At least 20px, or 25% of vertical distance

    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 0, // Sharp corners like Relume
        offset, // Dynamic offset for the step
    })

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            style={{
                stroke: '#94a3b8', // Slightly darker for visibility
                strokeWidth: 1,
                ...style,
            }}
            markerEnd={markerEnd}
        />
    )
})
