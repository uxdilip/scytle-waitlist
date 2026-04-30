import type { Layout } from '@/types/canvas'

/** Figma-style Auto gap mode is represented by justify='between' on flex layouts. */
export function isAutoGapLayout(
    layout: Pick<Layout, 'mode' | 'justify'> | null | undefined
): boolean {
    return layout?.mode === 'flex' && layout.justify === 'between'
}

/** Convert measured on-canvas pixel spacing to model-space gap value. */
export function gapFromMeasuredPx(actualGapPx: number, zoom: number): number {
    const safeZoom = zoom > 0 ? zoom : 1
    return Math.max(0, Math.round(actualGapPx / safeZoom))
}

/** Force Auto gap mode back to fixed numeric gap editing mode. */
export function toFixedGapLayout(layout: Layout, gap: number): Layout {
    return {
        ...layout,
        justify: layout.justify === 'between' ? 'start' : layout.justify,
        gap,
    }
}
