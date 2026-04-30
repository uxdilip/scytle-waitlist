/**
 * Setup script: Create AI_THREADS and AI_MESSAGES collections in Appwrite
 *
 * Run with: npx tsx scripts/setup-chat-collections.ts
 *
 * Requires .env to have:
 *   NEXT_PUBLIC_APPWRITE_ENDPOINT
 *   NEXT_PUBLIC_APPWRITE_PROJECT_ID
 *   NEXT_PUBLIC_APPWRITE_DATABASE_ID
 *   APPWRITE_API_KEY
 */

import { Client, Databases, IndexType } from 'node-appwrite'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })
dotenv.config({ path: resolve(__dirname, '../.env') })

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || ''
const apiKey = process.env.APPWRITE_API_KEY || ''
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'scytle_db'

if (!projectId || !apiKey) {
    console.error('Missing NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_API_KEY in .env')
    process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const databases = new Databases(client)

async function createCollections() {
    console.log('Setting up chat collections...\n')

    // ── AI_THREADS ───────────────────────────────────────────
    try {
        await databases.createCollection(databaseId, 'ai_threads', 'AI Threads')
        console.log('Created collection: ai_threads')
    } catch (e: any) {
        if (e.code === 409) {
            console.log('Collection ai_threads already exists, skipping creation')
        } else {
            throw e
        }
    }

    // Attributes for ai_threads
    const threadAttrs = [
        () => databases.createStringAttribute(databaseId, 'ai_threads', 'projectId', 128, true),
        () => databases.createStringAttribute(databaseId, 'ai_threads', 'status', 16, true, 'regular'),
        () => databases.createStringAttribute(databaseId, 'ai_threads', 'title', 256, false),
        () => databases.createStringAttribute(databaseId, 'ai_threads', 'createdAt', 64, true),
        () => databases.createStringAttribute(databaseId, 'ai_threads', 'updatedAt', 64, true),
    ]

    for (const create of threadAttrs) {
        try {
            await create()
        } catch (e: any) {
            if (e.code === 409) continue // attribute already exists
            console.warn('  Warning:', e.message)
        }
    }
    console.log('  Attributes created for ai_threads')

    // Wait for attributes to be ready
    await sleep(2000)

    // Indexes for ai_threads
    try {
        await databases.createIndex(databaseId, 'ai_threads', 'idx_projectId', IndexType.Key, ['projectId'])
    } catch (e: any) {
        if (e.code !== 409) console.warn('  Index warning:', e.message)
    }
    try {
        await databases.createIndex(databaseId, 'ai_threads', 'idx_project_created', IndexType.Key, ['projectId', 'createdAt'], ['ASC', 'DESC'])
    } catch (e: any) {
        if (e.code !== 409) console.warn('  Index warning:', e.message)
    }
    console.log('  Indexes created for ai_threads')

    // ── AI_MESSAGES ──────────────────────────────────────────
    try {
        await databases.createCollection(databaseId, 'ai_messages', 'AI Messages')
        console.log('\nCreated collection: ai_messages')
    } catch (e: any) {
        if (e.code === 409) {
            console.log('\nCollection ai_messages already exists, skipping creation')
        } else {
            throw e
        }
    }

    // Attributes for ai_messages
    const msgAttrs = [
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'threadId', 128, true),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'projectId', 128, true),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'parentId', 128, false),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'format', 32, true),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'content', 1000000, true),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'isHead', 16, false),
        () => databases.createStringAttribute(databaseId, 'ai_messages', 'createdAt', 64, true),
    ]

    for (const create of msgAttrs) {
        try {
            await create()
        } catch (e: any) {
            if (e.code === 409) continue
            console.warn('  Warning:', e.message)
        }
    }
    console.log('  Attributes created for ai_messages')

    // Wait for attributes to be ready
    await sleep(2000)

    // Indexes for ai_messages
    try {
        await databases.createIndex(databaseId, 'ai_messages', 'idx_threadId', IndexType.Key, ['threadId'])
    } catch (e: any) {
        if (e.code !== 409) console.warn('  Index warning:', e.message)
    }
    try {
        await databases.createIndex(databaseId, 'ai_messages', 'idx_projectId', IndexType.Key, ['projectId'])
    } catch (e: any) {
        if (e.code !== 409) console.warn('  Index warning:', e.message)
    }
    try {
        await databases.createIndex(databaseId, 'ai_messages', 'idx_thread_created', IndexType.Key, ['threadId', 'createdAt'], ['ASC', 'ASC'])
    } catch (e: any) {
        if (e.code !== 409) console.warn('  Index warning:', e.message)
    }
    console.log('  Indexes created for ai_messages')

    console.log('\nDone! Collections are ready.')
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

createCollections().catch((e) => {
    console.error('Failed to create collections:', e)
    process.exit(1)
})
