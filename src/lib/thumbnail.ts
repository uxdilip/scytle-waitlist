/**
 * Thumbnail Capture Utility
 * 
 * Captures a screenshot of the canvas viewport element and uploads it
 * to Appwrite storage. Used to generate file thumbnails for the dashboard.
 * 
 * Like Figma, the thumbnail is captured when the user leaves the editor
 * and displayed as a preview in the file listing.
 */

import { toJpeg } from 'html-to-image'
import { storage, BUCKETS } from '@/lib/appwrite'

const THUMB_WIDTH = 800
const THUMB_QUALITY = 0.7

/**
 * Capture a JPEG screenshot of the canvas viewport DOM element,
 * upload it to Appwrite storage, and return the file ID.
 * 
 * Uses a predictable file ID (thumb_{projectId}) so subsequent
 * captures overwrite the previous thumbnail — no cleanup needed.
 */
export async function captureThumbnail(projectId: string): Promise<string | null> {
    try {
        const viewport = document.querySelector('[data-canvas-viewport]') as HTMLElement
        if (!viewport) {
            console.warn('⚠️ Thumbnail: canvas viewport element not found')
            return null
        }

        // Capture the viewport as a JPEG data URL
        const dataUrl = await toJpeg(viewport, {
            quality: THUMB_QUALITY,
            width: viewport.offsetWidth,
            height: viewport.offsetHeight,
            pixelRatio: THUMB_WIDTH / viewport.offsetWidth, // Scale down
            backgroundColor: '#F5F5F5',
            skipFonts: true, // Prevents cssRules SecurityError from cross-origin stylesheets
            // Skip non-visible overlays that shouldn't be in thumbnails
            filter: (node) => {
                if (!(node instanceof HTMLElement)) return true
                // Skip selection overlays, toolbars, and context menus
                const skip = [
                    'data-editor-context-menu',
                    'data-selection-overlay',
                ]
                return !skip.some(attr => node.hasAttribute(attr))
            },
        })

        // Convert data URL to Blob
        const response = await fetch(dataUrl)
        const blob = await response.blob()

        // Create a File object with predictable ID
        const file = new File([blob], `thumb_${projectId}.jpg`, { type: 'image/jpeg' })
        const fileId = `thumb_${projectId.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        // Delete existing thumbnail if it exists (overwrite pattern)
        try {
            await storage.deleteFile(BUCKETS.THUMBNAILS, fileId)
        } catch {
            // File doesn't exist yet — that's fine
        }

        // Upload new thumbnail
        const uploaded = await storage.createFile(BUCKETS.THUMBNAILS, fileId, file)
        
        return uploaded.$id

    } catch (error) {
        console.error('⚠️ Thumbnail capture failed:', error)
        return null
    }
}

/**
 * Get the public preview URL for a project thumbnail.
 * Returns undefined if no thumbnail exists.
 */
export function getThumbnailUrl(projectId: string): string | undefined {
    const fileId = `thumb_${projectId.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    try {
        return storage.getFilePreview(BUCKETS.THUMBNAILS, fileId).toString()
    } catch {
        return undefined
    }
}
