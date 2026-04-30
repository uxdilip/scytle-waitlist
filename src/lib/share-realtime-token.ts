import 'server-only'

const TOKEN_VERSION = 1
const TOKEN_TYPE = 'SCYTLE_SHARE'
const TOKEN_ALG = 'HS256'

type ShareTokenScope = 'share:read'

interface ShareTokenPayload {
    v: number
    pid: string
    sid: string
    scope: ShareTokenScope
    iat: number
    exp: number
}

function toBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
}

function encodeJsonBase64Url(value: unknown): string {
    const json = JSON.stringify(value)
    return toBase64Url(new TextEncoder().encode(json))
}

function getSigningSecret(): string | null {
    const secret = process.env.SHARE_SYNC_TOKEN_SECRET || process.env.SYNC_INTERNAL_SECRET || ''
    return secret.trim().length > 0 ? secret : null
}

interface CreateShareRealtimeTokenInput {
    projectId: string
    shareId: string
    scope?: ShareTokenScope
    ttlSeconds?: number
}

export async function createShareRealtimeToken({
    projectId,
    shareId,
    scope = 'share:read',
    ttlSeconds = 60 * 60,
}: CreateShareRealtimeTokenInput): Promise<string | null> {
    const secret = getSigningSecret()
    if (!secret) return null

    const now = Math.floor(Date.now() / 1000)
    const payload: ShareTokenPayload = {
        v: TOKEN_VERSION,
        pid: projectId,
        sid: shareId,
        scope,
        iat: now,
        exp: now + Math.max(60, ttlSeconds),
    }

    const header = {
        alg: TOKEN_ALG,
        typ: TOKEN_TYPE,
    }

    const headerB64 = encodeJsonBase64Url(header)
    const payloadB64 = encodeJsonBase64Url(payload)
    const body = `${headerB64}.${payloadB64}`

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )

    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const signatureB64 = toBase64Url(new Uint8Array(signature))

    return `${body}.${signatureB64}`
}
