import { nanoid } from 'nanoid'

/**
 * Generate a short, URL-safe share ID.
 * 12 chars ≈ ~2 billion possibilities, plenty for our scale.
 */
export function generateShareId(): string {
    return nanoid(12)
}

/**
 * Build the full share URL for a given shareId.
 */
export function getShareUrl(shareId: string): string {
    const base = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${base}/share/${shareId}`
}
