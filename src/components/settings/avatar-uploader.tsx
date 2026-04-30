'use client'

import React, { useState, useRef } from 'react'
import { Camera, Trash2, Loader2, Upload } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { storage, BUCKETS, account } from '@/lib/appwrite'
import { useAuthStore } from '@/store'

export function AvatarUploader() {
    const { user, setUser } = useAuthStore()
    const [isUploading, setIsUploading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Get avatar preview URL from Appwrite
    const getAvatarUrl = (fileId: string) => {
        try {
            return storage.getFilePreview(BUCKETS.AVATARS, fileId).toString()
        } catch (error) {
            console.error('Failed to get avatar preview:', error)
            return undefined
        }
    }

    const avatarId = (user?.prefs as any)?.avatarId as string | undefined
    const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            // 1. Delete old avatar if it exists
            if (avatarId) {
                try {
                    await storage.deleteFile(BUCKETS.AVATARS, avatarId)
                } catch (error) {
                    console.error('Failed to delete old avatar:', error)
                }
            }

            // 2. Upload new file
            const uploadedFile = await storage.createFile(
                BUCKETS.AVATARS,
                'unique()',
                file
            )

            // 3. Update user preferences
            // Fetch live prefs first to avoid overwriting bio/role updates
            const currentPrefs = await account.getPrefs()
            const newPrefs = { ...currentPrefs, avatarId: uploadedFile.$id }
            await account.updatePrefs(newPrefs)

            // 4. Update local state
            const updatedUser = { ...user!, prefs: newPrefs }
            setUser(updatedUser)
        } catch (error) {
            console.error('Avatar upload failed:', error)
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleDeleteAvatar = async () => {
        if (!avatarId) return

        setIsDeleting(true)
        try {
            await storage.deleteFile(BUCKETS.AVATARS, avatarId)
            
            // Fetch live prefs first to avoid overwriting bio/role updates
            const currentPrefs = await account.getPrefs()
            const newPrefs = { ...currentPrefs }
            delete newPrefs.avatarId
            await account.updatePrefs(newPrefs)

            const updatedUser = { ...user!, prefs: newPrefs }
            setUser(updatedUser)
        } catch (error) {
            console.error('Failed to delete avatar:', error)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <section className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                <div>
                    <h3 className="text-[14px] font-semibold text-foreground">Avatar</h3>
                    <p className="text-[13px] text-muted-foreground mt-0.5 max-w-sm">
                        Click on the avatar to upload a custom one from your files.
                    </p>
                </div>
                <div className="relative group shrink-0 rounded-full cursor-pointer lg:hover:opacity-90 transition-opacity" onClick={() => fileInputRef.current?.click()}>
                    <Avatar className="h-20 w-20 border border-border shadow-sm">
                        {avatarId ? <AvatarImage src={getAvatarUrl(avatarId)} className="object-cover" /> : null}
                        <AvatarFallback className="text-xl font-medium bg-muted text-foreground">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full focus:outline-none"
                        title="Upload new avatar"
                    >
                        <Camera className="h-6 w-6" />
                    </div>
                    {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>
            </div>
            <div className="px-5 py-3.5 bg-muted/30 border-t border-border/40 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">An avatar is optional but strongly recommended.</p>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isDeleting}>
                        Upload new
                    </Button>
                    {avatarId && (
                        <Button variant="outline" size="sm" onClick={handleDeleteAvatar} disabled={isDeleting || isUploading}>
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Remove
                        </Button>
                    )}
                </div>
            </div>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
            />
        </section>
    )
}
