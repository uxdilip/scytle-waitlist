// ============================================================
// Unsplash API Client
// Batch image search with dedup and caching.
// Used by the pipeline to provide real, relevant images
// instead of hardcoded photo IDs.
// ============================================================

export interface UnsplashImage {
    url: string
    alt: string
    credit: string
    blurHash?: string
}

export interface ImageQuery {
    key: string
    query: string
    count?: number
    orientation?: 'landscape' | 'portrait' | 'squarish'
}

export type ImageMap = Record<string, UnsplashImage[]>

const UNSPLASH_API = 'https://api.unsplash.com'

// Simple in-memory cache (1 hour TTL)
const cache = new Map<string, { images: UnsplashImage[]; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Search Unsplash for images matching a query.
 * Returns empty array if no API key or on error (graceful fallback).
 */
export async function searchImages(
    query: string,
    opts: { count?: number; orientation?: string; color?: string } = {}
): Promise<UnsplashImage[]> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY
    if (!apiKey) {
        console.warn('⚠️ UNSPLASH_ACCESS_KEY not set — skipping image search')
        return []
    }

    // Check cache
    const cacheKey = `${query}:${opts.count || 3}:${opts.orientation || 'landscape'}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.images
    }

    try {
        const params = new URLSearchParams({
            query,
            per_page: String(opts.count || 3),
            orientation: opts.orientation || 'landscape',
            ...(opts.color ? { color: opts.color } : {}),
        })

        const res = await fetch(`${UNSPLASH_API}/search/photos?${params}`, {
            headers: { Authorization: `Client-ID ${apiKey}` },
        })

        if (!res.ok) {
            console.warn(`⚠️ Unsplash search failed (${res.status}): ${query}`)
            return []
        }

        const data = await res.json()
        const images: UnsplashImage[] = (data.results || []).map((photo: any) => ({
            url: `${photo.urls.regular}&w=1200&q=80`,
            alt: photo.alt_description || photo.description || query,
            credit: `Photo by ${photo.user.name} on Unsplash`,
            blurHash: photo.blur_hash,
        }))

        // Cache result
        cache.set(cacheKey, { images, ts: Date.now() })

        return images
    } catch (error) {
        console.warn(`⚠️ Unsplash search error for "${query}":`, error)
        return []
    }
}

/**
 * Batch search multiple image queries in parallel.
 * Deduplicates queries with the same search string.
 * Returns a map of query key → images.
 */
export async function batchSearchImages(queries: ImageQuery[]): Promise<ImageMap> {
    if (queries.length === 0) return {}

    // Deduplicate by query string
    const uniqueMap = new Map<string, ImageQuery>()
    for (const q of queries) {
        if (!uniqueMap.has(q.query)) {
            uniqueMap.set(q.query, q)
        }
    }

    const uniqueQueries = Array.from(uniqueMap.values())

    // Fire all searches in parallel
    const results = await Promise.all(
        uniqueQueries.map(async (q) => {
            const images = await searchImages(q.query, {
                count: q.count || 2,
                orientation: q.orientation || 'landscape',
            })
            return { key: q.query, images }
        })
    )

    // Build result map — map original keys to results
    const resultMap: ImageMap = {}
    for (const r of results) {
        resultMap[r.key] = r.images
    }

    // Also map original query keys that had duplicate queries
    for (const q of queries) {
        if (!resultMap[q.key] && resultMap[q.query]) {
            resultMap[q.key] = resultMap[q.query]
        }
    }

    return resultMap
}
