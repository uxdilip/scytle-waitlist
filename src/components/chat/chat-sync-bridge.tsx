'use client'

import { useAssistantRuntime } from '@assistant-ui/react'
import { useEffect } from 'react'

/**
 * Bridge component: listens for 'chat:threads-changed' custom events
 * (dispatched when the WebSocket receives thread changes from other browsers)
 * and forces the assistant-ui thread list runtime to re-fetch.
 *
 * Must be rendered inside the AssistantRuntimeProvider tree.
 */
export function ChatSyncBridge() {
    const runtime = useAssistantRuntime()

    useEffect(() => {
        const handler = () => {
            // assistant-ui caches the list() promise in _loadThreadsPromise.
            // Clear it so the runtime re-calls our adapter's list() with fresh data.
            const core = (runtime as any).threads ?? (runtime as any)._core?.threads
            if (core?._loadThreadsPromise !== undefined) {
                core._loadThreadsPromise = undefined
                core.getLoadThreadsPromise?.()
            }
        }
        window.addEventListener('chat:threads-changed', handler)
        return () => window.removeEventListener('chat:threads-changed', handler)
    }, [runtime])

    return null
}
