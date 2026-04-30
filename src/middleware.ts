import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for route protection
 * 
 * NOTE: Appwrite uses localStorage for session management (client-side),
 * not cookies. So we can't check authentication status in middleware.
 * Authentication is handled client-side in each protected page.
 * 
 * This middleware is kept minimal - just passes through all requests.
 * Protected routes check auth status using Appwrite SDK on the client.
 */

export function middleware(request: NextRequest) {
    // Just pass through - auth is handled client-side with Appwrite SDK
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
    ],
}
