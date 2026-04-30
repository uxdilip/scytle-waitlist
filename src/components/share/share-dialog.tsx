'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Globe, Lock, Link2, Check, Loader2 } from 'lucide-react'
import { getShareUrl } from '@/lib/share-utils'
import { createJWT } from '@/lib/appwrite'

interface ShareDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
}

interface ShareData {
    shareId: string
    projectId: string
    isPublic: boolean
    createdAt: string
}

export function ShareDialog({ open, onOpenChange, projectId }: ShareDialogProps) {
    const [share, setShare] = useState<ShareData | null>(null)
    const [loading, setLoading] = useState(false)
    const [toggling, setToggling] = useState(false)
    const [copied, setCopied] = useState(false)

    // Cache JWT so toggle doesn't re-fetch it every time
    const jwtRef = useRef<{ jwt: string; expiry: number } | null>(null)

    const getAuthHeaders = useCallback(async () => {
        // Reuse cached JWT if still valid (within 10 min)
        const now = Date.now()
        if (jwtRef.current && now < jwtRef.current.expiry) {
            return {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwtRef.current.jwt}`,
            }
        }

        const jwt = await createJWT()
        if (jwt?.jwt) {
            jwtRef.current = { jwt: jwt.jwt, expiry: now + 10 * 60 * 1000 }
        }
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt?.jwt || ''}`,
        }
    }, [])

    // Fetch or create share when dialog opens
    useEffect(() => {
        if (!open || !projectId) return

        let cancelled = false

        const fetchShare = async () => {
            setLoading(true)
            try {
                const headers = await getAuthHeaders()

                // First check if share exists
                const res = await fetch(`/api/shares/project/${projectId}`, { headers })
                const data = await res.json()

                if (cancelled) return

                if (data.share) {
                    setShare(data.share)
                } else {
                    // Create one
                    const createRes = await fetch('/api/shares', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ projectId }),
                    })
                    const createData = await createRes.json()
                    if (!cancelled && createData.share) {
                        setShare(createData.share)
                    }
                }
            } catch (error) {
                console.error('Failed to load share:', error)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchShare()
        return () => { cancelled = true }
    }, [open, projectId, getAuthHeaders])

    const handleTogglePublic = async (isPublic: boolean) => {
        if (!share || toggling) return

        // Optimistic update
        setShare(prev => prev ? { ...prev, isPublic } : prev)
        setToggling(true)

        try {
            const headers = await getAuthHeaders()
            const res = await fetch(`/api/shares/${share.shareId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ isPublic }),
            })
            const data = await res.json()
            if (data.share) {
                setShare(data.share)
            }
        } catch (error) {
            // Revert on failure
            setShare(prev => prev ? { ...prev, isPublic: !isPublic } : prev)
            console.error('Failed to toggle share:', error)
        } finally {
            setToggling(false)
        }
    }

    const handleCopyLink = async () => {
        if (!share) return
        const url = getShareUrl(share.shareId)
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const shareUrl = share ? getShareUrl(share.shareId) : ''

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Share project</DialogTitle>
                    <DialogDescription>
                        Create a public link for anyone to view your design.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : share ? (
                    <div className="space-y-4">
                        {/* Public toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                            <div className="flex items-center gap-3 min-w-0">
                                {share.isPublic ? (
                                    <Globe className="w-4 h-4 text-primary shrink-0" />
                                ) : (
                                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                        {share.isPublic ? 'Public link' : 'Private'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {share.isPublic
                                            ? 'Anyone with the link can view'
                                            : 'Only you can access this project'}
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={share.isPublic}
                                onCheckedChange={handleTogglePublic}
                                disabled={toggling}
                                className="shrink-0 ml-3"
                            />
                        </div>

                        {/* Share link */}
                        {share.isPublic && (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-muted-foreground overflow-hidden min-w-0">
                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{shareUrl}</span>
                                </div>
                                <button
                                    onClick={handleCopyLink}
                                    className="inline-flex items-center justify-center w-[88px] gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-3.5 h-3.5" />
                                            Copied
                                        </>
                                    ) : (
                                        'Copy link'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground py-4">
                        Failed to load sharing settings.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    )
}
