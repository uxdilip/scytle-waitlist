'use client'

import { Client, Account, Databases, Storage, Avatars, OAuthProvider } from 'appwrite'

/**
 * Appwrite Client SDK
 * Used in client components for authentication and data fetching
 */

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || ''

if (!projectId) {
    console.warn('⚠️ NEXT_PUBLIC_APPWRITE_PROJECT_ID is not set')
}

// Initialize client
const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)

// Export services
export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)
export const avatars = new Avatars(client)

// Export client for advanced usage
export { client }

// Database and collection IDs
export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'scytle_db'

export const COLLECTIONS = {
    USERS: 'users',
    PROJECTS: 'projects',
    PAGES: 'pages',
    SECTIONS: 'sections',
    STYLE_GUIDES: 'style_guides',
    RESEARCH_DATA: 'research_data',
    AI_CONVERSATIONS: 'ai_conversations',
    SHARES: 'shares',
    SUPPORT_TICKETS: 'support_tickets',
} as const

// Storage bucket IDs
export const BUCKETS = {
    AVATARS: 'avatars',
    PROJECT_ASSETS: 'project_assets',
    EXPORTS: 'exports',
    THUMBNAILS: 'thumbnails',
} as const

/**
 * Get current session
 */
export async function getSession() {
    try {
        return await account.getSession('current')
    } catch {
        return null
    }
}

/**
 * Get current user
 */
export async function getUser() {
    try {
        return await account.get()
    } catch {
        return null
    }
}

/**
 * Create JWT for API authentication
 */
export async function createJWT() {
    try {
        return await account.createJWT()
    } catch (error) {
        console.error('❌ Failed to create Appwrite JWT:', error)
        return null
    }
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string) {
    try {
        // Check if there's an existing session and delete it first
        try {
            const existingSession = await account.getSession('current')
            if (existingSession) {
                await account.deleteSession('current')
            }
        } catch {
            // No existing session, that's fine
        }

        const session = await account.createEmailPasswordSession(email, password)
        return { success: true, session }
    } catch (error) {
        console.error('❌ Login failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
}

/**
 * Sign up with email and password
 */
export async function signup(email: string, password: string, name: string) {
    try {
        // Check if there's an existing session and delete it first
        try {
            const existingSession = await account.getSession('current')
            if (existingSession) {
                await account.deleteSession('current')
            }
        } catch {
            // No existing session, that's fine
        }

        // Create account
        const user = await account.create('unique()', email, password, name)

        // Create session
        await account.createEmailPasswordSession(email, password)

        return { success: true, user }
    } catch (error) {
        console.error('❌ Signup failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Signup failed' }
    }
}

/**
 * Logout current session
 */
export async function logout() {
    try {
        await account.deleteSession('current')
        return { success: true }
    } catch (error) {
        console.error('❌ Logout failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Logout failed' }
    }
}

/**
 * Login with OAuth provider
 */
export function loginWithOAuth(provider: 'google' | 'github') {
    const successUrl = `${window.location.origin}/dashboard`
    const failureUrl = `${window.location.origin}/login?error=oauth_failed`

    const oauthProvider = provider === 'google' ? OAuthProvider.Google : OAuthProvider.Github
    account.createOAuth2Session(oauthProvider, successUrl, failureUrl)
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string) {
    try {
        const resetUrl = `${window.location.origin}/reset-password`
        await account.createRecovery(email, resetUrl)
        return { success: true }
    } catch (error) {
        console.error('❌ Password reset failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Reset failed' }
    }
}

/**
 * Complete password reset
 */
export async function completePasswordReset(userId: string, secret: string, password: string) {
    try {
        await account.updateRecovery(userId, secret, password)
        return { success: true }
    } catch (error) {
        console.error('❌ Password reset completion failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Reset completion failed' }
    }
}

/**
 * Send email verification
 */
export async function sendVerificationEmail() {
    try {
        const verifyUrl = `${window.location.origin}/verify-email`
        await account.createVerification(verifyUrl)
        return { success: true }
    } catch (error) {
        console.error('❌ Email verification request failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Verification request failed' }
    }
}

/**
 * Complete email verification
 */
export async function verifyEmail(userId: string, secret: string) {
    try {
        await account.updateVerification(userId, secret)
        return { success: true }
    } catch (error) {
        console.error('❌ Email verification completion failed:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Verification failed' }
    }
}
