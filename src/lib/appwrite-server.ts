import { Client, Databases, Users, Account } from 'node-appwrite'
import { cookies } from 'next/headers'

/**
 * Appwrite Server SDK
 * Used in API routes and server components
 * Has admin privileges via API key
 */

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || ''
const apiKey = process.env.APPWRITE_API_KEY || ''

if (!apiKey) {
    console.warn('⚠️ APPWRITE_API_KEY is not set - server operations will fail')
}

// Admin client with API key (full access)
function createAdminClient() {
    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setKey(apiKey)

    return {
        client,
        databases: new Databases(client),
        users: new Users(client),
    }
}

// Session client (user-specific access)
async function createSessionClient() {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('appwrite-session')

    if (!sessionCookie?.value) {
        throw new Error('No session')
    }

    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId)
        .setSession(sessionCookie.value)

    return {
        client,
        account: new Account(client),
        databases: new Databases(client),
    }
}

export { createAdminClient, createSessionClient }

// Database and collection IDs (same as client)
export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'scytle_db'

export const COLLECTIONS = {
    PROJECTS: 'projects',
    AI_THREADS: 'ai_threads',
    AI_MESSAGES: 'ai_messages',
    SHARES: 'shares',
    SUPPORT_TICKETS: 'support_tickets',
    USER_CREDITS: 'user_credits',
} as const

/**
 * Validate JWT from Authorization header
 * Returns user if valid, null otherwise
 */
export async function getUserFromJWT(authHeader: string | null) {
    if (!authHeader?.startsWith('Bearer ')) {
        return null
    }

    const jwt = authHeader.replace('Bearer ', '')

    try {
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setJWT(jwt)

        const account = new Account(client)
        const user = await account.get()

        return user
    } catch (error) {
        console.error('❌ JWT validation failed:', error)
        return null
    }
}

/**
 * Get user from session cookie (for server components)
 */
export async function getServerUser() {
    try {
        const { account } = await createSessionClient()
        return await account.get()
    } catch {
        return null
    }
}

// ============================================
// CRUD Operations for Collections
// ============================================

import { ID, Query } from 'node-appwrite'

/**
 * Create a new document
 */
export async function createDocument<T extends Record<string, unknown>>(
    collectionId: string,
    data: T,
    documentId?: string
) {
    const { databases } = createAdminClient()

    return databases.createDocument(
        DATABASE_ID,
        collectionId,
        documentId || ID.unique(),
        data
    )
}

/**
 * Get a document by ID
 */
export async function getDocument(
    collectionId: string,
    documentId: string
) {
    const { databases } = createAdminClient()

    return databases.getDocument(
        DATABASE_ID,
        collectionId,
        documentId
    )
}

/**
 * List documents with optional queries
 */
export async function listDocuments(
    collectionId: string,
    queries: string[] = []
) {
    const { databases } = createAdminClient()

    return databases.listDocuments(
        DATABASE_ID,
        collectionId,
        queries
    )
}

/**
 * Update a document
 */
export async function updateDocument<T extends Record<string, unknown>>(
    collectionId: string,
    documentId: string,
    data: Partial<T>
) {
    const { databases } = createAdminClient()

    return databases.updateDocument(
        DATABASE_ID,
        collectionId,
        documentId,
        data
    )
}

/**
 * Delete a document
 */
export async function deleteDocument(
    collectionId: string,
    documentId: string
) {
    const { databases } = createAdminClient()

    return databases.deleteDocument(
        DATABASE_ID,
        collectionId,
        documentId
    )
}

// Export Query for building queries
export { Query, ID }
