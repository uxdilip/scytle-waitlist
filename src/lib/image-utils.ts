import type { ImageAttachment } from '@/types'

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_PRE_COMPRESSION_BYTES = 20 * 1024 * 1024 // 20MB raw input limit
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024            // 4MB after compression
const MAX_DIMENSION = 2048                           // resize if any side exceeds this

export function validateImageFile(file: File): string | null {
    if (!SUPPORTED_TYPES.includes(file.type)) {
        return `Unsupported format: ${file.type || 'unknown'}. Use PNG, JPG, WEBP, or GIF.`
    }
    if (file.size > MAX_PRE_COMPRESSION_BYTES) {
        return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 20MB.`
    }
    return null
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

function resizeImage(dataUrl: string, mimeType: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            let { width, height } = img

            // Check if resizing is needed
            const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION
            const dataSize = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
            const needsCompression = dataSize > MAX_OUTPUT_BYTES

            if (!needsResize && !needsCompression) {
                resolve(dataUrl)
                return
            }

            // Calculate new dimensions preserving aspect ratio
            if (needsResize) {
                const scale = MAX_DIMENSION / Math.max(width, height)
                width = Math.round(width * scale)
                height = Math.round(height * scale)
            }

            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) { resolve(dataUrl); return }

            ctx.drawImage(img, 0, 0, width, height)

            // Use JPEG for compression efficiency, keep PNG if transparency is needed
            const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
            const quality = outputType === 'image/jpeg' ? 0.85 : undefined
            resolve(canvas.toDataURL(outputType, quality))
        }
        img.onerror = () => reject(new Error('Failed to load image for resizing'))
        img.src = dataUrl
    })
}

export async function processImageFile(file: File): Promise<ImageAttachment> {
    const error = validateImageFile(file)
    if (error) throw new Error(error)

    const rawDataUrl = await readFileAsDataUrl(file)
    const dataUrl = await resizeImage(rawDataUrl, file.type)

    return {
        id: crypto.randomUUID(),
        file,
        dataUrl,
        mimeType: file.type,
    }
}

export function extractBase64Data(dataUrl: string): { mimeType: string; data: string } {
    // dataUrl format: "data:image/png;base64,iVBORw0KGgo..."
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('Invalid data URL format')
    return { mimeType: match[1], data: match[2] }
}
