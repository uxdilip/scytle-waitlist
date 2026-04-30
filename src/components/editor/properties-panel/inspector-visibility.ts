import type { ScytleNode } from '@/types/canvas'

export interface InspectorSectionVisibility {
    showLayout: boolean
    showImage: boolean
    showTypography: boolean
    showVector: boolean
    showAppearance: boolean
    showAppearanceCornerRadius: boolean
    showFill: boolean
    showStroke: boolean
    showEffects: boolean
    showExport: boolean
}

const FRAME_VISIBILITY: InspectorSectionVisibility = {
    showLayout: true,
    showImage: false,
    showTypography: false,
    showVector: false,
    showAppearance: true,
    showAppearanceCornerRadius: true,
    showFill: true,
    showStroke: true,
    showEffects: true,
    showExport: true,
}

const TEXT_VISIBILITY: InspectorSectionVisibility = {
    showLayout: false,
    showImage: false,
    showTypography: true,
    showVector: false,
    showAppearance: true,
    showAppearanceCornerRadius: false,
    showFill: true,
    showStroke: true,
    showEffects: true,
    showExport: true,
}

const IMAGE_VISIBILITY: InspectorSectionVisibility = {
    showLayout: false,
    showImage: true,
    showTypography: false,
    showVector: false,
    showAppearance: true,
    showAppearanceCornerRadius: true,
    showFill: false,
    showStroke: true,
    showEffects: true,
    showExport: true,
}

const VECTOR_VISIBILITY: InspectorSectionVisibility = {
    showLayout: false,
    showImage: false,
    showTypography: false,
    showVector: true,
    showAppearance: true,
    showAppearanceCornerRadius: false,
    showFill: true,
    showStroke: true,
    showEffects: true,
    showExport: true,
}

export function getSingleInspectorVisibility(node: ScytleNode): InspectorSectionVisibility {
    switch (node.type) {
        case 'frame':
            return FRAME_VISIBILITY
        case 'text':
            return TEXT_VISIBILITY
        case 'image':
            return IMAGE_VISIBILITY
        case 'vector':
            return VECTOR_VISIBILITY
        default:
            return FRAME_VISIBILITY
    }
}

export function getMultiSelectInspectorVisibility(selectedNodes: ScytleNode[]): InspectorSectionVisibility {
    if (selectedNodes.length === 0) {
        return {
            showLayout: false,
            showImage: false,
            showTypography: false,
            showVector: false,
            showAppearance: false,
            showAppearanceCornerRadius: false,
            showFill: false,
            showStroke: false,
            showEffects: false,
            showExport: false,
        }
    }

    const allFrames = selectedNodes.every((node) => node.type === 'frame')
    const allText = selectedNodes.every((node) => node.type === 'text')
    const allVectors = selectedNodes.every((node) => node.type === 'vector')
    const allImages = selectedNodes.every((node) => node.type === 'image')

    return {
        showLayout: allFrames,
        showImage: false,
        showTypography: allText,
        showVector: allVectors,
        showAppearance: true,
        showAppearanceCornerRadius: allFrames || allImages,
        showFill: !allImages,
        showStroke: true,
        showEffects: true,
        showExport: false,
    }
}
