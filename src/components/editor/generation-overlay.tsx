'use client'

import { useGenerationStore } from '@/store/generation-store'
import { Loader2 } from 'lucide-react'

// ============================================================
// GenerationOverlay — floating "AI generating" status pill
// ============================================================
//
// v2: Simplified to ONLY the status pill. No full-canvas pointer
// blocker — interaction blocking is done at the handler level
// (canvas handlePointerDown, keyboard shortcuts). The visual
// signal for "what's generating" is the glow on the active frame
// (handled by FrameRenderer).
//
// Status pill shows: "AI generating" with spinner. Simple.
// ============================================================

export function GenerationOverlay() {
    const isLocked = useGenerationStore((s) => s.isLocked)

    if (!isLocked) return null

    return (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full
                           bg-foreground/90 text-background backdrop-blur-md
                           shadow-lg border border-white/10
                           animate-[scale-in_0.2s_ease-out]"
            >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">
                    AI generating
                </span>
            </div>
        </div>
    )
}
