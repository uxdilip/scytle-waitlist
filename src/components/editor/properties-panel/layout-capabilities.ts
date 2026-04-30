'use client'

import type { FrameNode, ScytleNode, Sizing } from '@/types/canvas'

type SizingMode = Sizing['horizontal']

const DEFAULT_CONSTRAINTS = {
    horizontal: 'left' as const,
    vertical: 'top' as const,
}

export function getAllowedSizingModes(
    node: ScytleNode,
    parentNode: FrameNode | null
): { horizontal: SizingMode[]; vertical: SizingMode[] } {
    const horizontal: SizingMode[] = ['fixed']
    const vertical: SizingMode[] = ['fixed']

    const isAutoLayoutFrame =
        node.type === 'frame' && node.layout.mode !== 'none'

    const isAutoLayoutFlowChild =
        !!parentNode &&
        parentNode.layout.mode !== 'none' &&
        node.positioning !== 'absolute'

    if (isAutoLayoutFrame) {
        horizontal.push('hug')
        vertical.push('hug')
    }

    if (isAutoLayoutFlowChild) {
        horizontal.push('fill')
        vertical.push('fill')
    }

    return { horizontal, vertical }
}

export function normalizeSizingMode(
    mode: SizingMode,
    allowedModes: SizingMode[]
): SizingMode {
    return allowedModes.includes(mode) ? mode : 'fixed'
}

export function isInAutoLayoutFlow(
    node: ScytleNode,
    parentNode: FrameNode | null
): boolean {
    return !!parentNode && parentNode.layout.mode !== 'none' && node.positioning !== 'absolute'
}

export function shouldShowConstraints(
    node: ScytleNode,
    parentNode: FrameNode | null
): boolean {
    if (!parentNode) return false
    if (parentNode.layout.mode === 'none') return true
    return node.positioning === 'absolute'
}

export function getDefaultConstraints() {
    return DEFAULT_CONSTRAINTS
}
