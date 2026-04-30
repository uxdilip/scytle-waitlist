'use client'

import React, { useMemo, useState } from 'react'
import {
    Loader2,
    Save,
    Mail,
    User as UserIcon,
    Briefcase,
    Text,
    CheckCircle2,
    ShieldAlert,
    KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { account } from '@/lib/appwrite'
import { useAuthStore } from '@/store'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

const ROLES = [
    'UI/UX Designer',
    'Product Designer',
    'Frontend Developer',
    'Full-stack Developer',
    'Product Manager',
    'Founder / CEO',
    'Marketing Designer',
    'Other',
]

const MAX_BIO_LENGTH = 200

function getPreferenceString(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function normalize(value: string): string {
    return value.trim()
}

export function ProfileForm() {
    const { user, setUser, resetPassword: requestPasswordReset } = useAuthStore()
    const [isLoading, setIsLoading] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [isResetSending, setIsResetSending] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)

    const [name, setName] = useState(() => user?.name || '')
    const [email, setEmail] = useState(() => user?.email || '')
    const [pendingEmail, setPendingEmail] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState(() => getPreferenceString((user?.prefs as any)?.role).trim())
    const [bio, setBio] = useState(() => getPreferenceString((user?.prefs as any)?.bio))

    React.useEffect(() => {
        if (!user) return

        setName(user.name || '')
        setEmail(user.email || '')
        setRole(getPreferenceString((user.prefs as any)?.role).trim())
        setBio(getPreferenceString((user.prefs as any)?.bio))
    }, [user?.$id, user?.name, user?.email, (user?.prefs as any)?.role, (user?.prefs as any)?.bio])

    const normalizedName = normalize(name)
    const normalizedRole = normalize(role)
    const normalizedBio = normalize(bio)

    const hasChanges = useMemo(() => {
        const currentName = normalize(user?.name || '')
        const currentRole = normalize(getPreferenceString((user?.prefs as any)?.role))
        const currentBio = normalize(getPreferenceString((user?.prefs as any)?.bio))

        return (
            normalizedName !== currentName ||
            normalizedRole !== currentRole ||
            normalizedBio !== currentBio
        )
    }, [normalizedName, normalizedRole, normalizedBio, user?.name, (user?.prefs as any)?.role, (user?.prefs as any)?.bio])

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!user) {
            toast.error('Please sign in again to update your profile.')
            return
        }

        if (!normalizedName) {
            toast.error('Name cannot be empty.')
            return
        }

        if (normalizedBio.length > MAX_BIO_LENGTH) {
            toast.error(`Bio must be ${MAX_BIO_LENGTH} characters or less.`)
            return
        }

        if (!hasChanges) {
            toast('No changes to save.')
            return
        }

        setIsLoading(true)

        try {
            if (normalizedName !== normalize(user.name || '')) {
                await account.updateName(normalizedName)
            }

            let currentPrefs: Record<string, unknown> = {}
            try {
                currentPrefs = (await account.getPrefs()) as Record<string, unknown>
            } catch {
                currentPrefs = {}
            }

            const newPrefs = {
                ...currentPrefs,
                role: normalizedRole,
                bio: normalizedBio,
            }
            await account.updatePrefs(newPrefs)

            const { getUser } = await import('@/lib/appwrite')
            const freshUser = await getUser()
            if (freshUser) {
                setUser(freshUser)
            }

            setIsSaved(true)
            toast.success('Profile updated successfully')
            setTimeout(() => setIsSaved(false), 3000)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to update profile'
            toast.error(message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleEmailUpdate = async (e: React.FormEvent) => {
        e.preventDefault()

        const nextEmail = pendingEmail.trim().toLowerCase()
        if (!nextEmail) {
            toast.error('Please enter a valid email.')
            return
        }

        if (!password) {
            toast.error('Please enter your current password.')
            return
        }

        if (nextEmail === email.toLowerCase()) {
            toast('This is already your current email.')
            return
        }

        setIsLoading(true)

        try {
            await account.updateEmail(nextEmail, password)

            const { sendVerificationEmail } = useAuthStore.getState()
            await sendVerificationEmail()

            const updatedUser = user
                ? { ...user, email: nextEmail, emailVerification: false }
                : null

            if (updatedUser) {
                setUser(updatedUser)
            }

            setEmail(nextEmail)
            setIsEmailDialogOpen(false)
            setPassword('')
            toast.success('Email updated! Please check your new inbox for verification.')
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : 'Failed to update email. Please check your password.'
            toast.error(message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleResendVerification = async () => {
        setIsVerifying(true)
        try {
            const { sendVerificationEmail } = useAuthStore.getState()
            const success = await sendVerificationEmail()
            if (success) {
                toast.success('Verification email sent!')
            }
        } catch {
            toast.error('Failed to resend verification')
        } finally {
            setIsVerifying(false)
        }
    }

    const handleForgotPassword = async () => {
        if (!user?.email) return
        
        setIsResetSending(true)
        try {
            const success = await requestPasswordReset(user.email)
            if (success) {
                toast.success(`Password reset instructions sent to ${user.email}`)
            } else {
                toast.error('Failed to send reset email. Please try again.')
            }
        } catch {
            toast.error('Failed to send reset email. Please try again later.')
        } finally {
            setIsResetSending(false)
        }
    }

    const openEmailDialog = () => {
        setPendingEmail(email)
        setPassword('')
        setIsEmailDialogOpen(true)
    }

    return (
        <div className="space-y-6 pb-10">
            <form onSubmit={handleSaveProfile}>
                <section className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="p-5 space-y-5">
                        <div>
                            <h3 className="text-[14px] font-semibold text-foreground">Personal Information</h3>
                            <p className="text-[13px] text-muted-foreground mt-0.5">
                                Update your personal details and public profile.
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value)
                                        setIsSaved(false)
                                    }}
                                    className="h-10 bg-background"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role" className="text-sm font-medium">Role</Label>
                                <Select
                                    value={role || undefined}
                                    onValueChange={(value) => {
                                        setRole(value)
                                        setIsSaved(false)
                                    }}
                                >
                                    <SelectTrigger className="h-10 bg-background">
                                        <SelectValue placeholder="Select your role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="bio" className="text-sm font-medium">Short Bio</Label>
                            <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => {
                                    setBio(e.target.value.slice(0, MAX_BIO_LENGTH))
                                    setIsSaved(false)
                                }}
                                rows={4}
                                placeholder="Share a short intro about your expertise..."
                                className="resize-none bg-background"
                            />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Keep it concise and clear.</span>
                                <span>{bio.length}/{MAX_BIO_LENGTH}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="px-5 py-3.5 bg-muted/30 border-t border-border/40 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Please use a maximum of 200 characters.</p>
                        <Button type="submit" disabled={isLoading || !hasChanges}>
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save changes
                        </Button>
                    </div>
                </section>
            </form>

            <section className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="p-5 space-y-3">
                    <div>
                        <h3 className="text-[14px] font-semibold text-foreground">Email Address</h3>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                            The email address associated with your account.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            readOnly
                            value={email}
                            className="max-w-md h-10 bg-muted/50 text-muted-foreground font-mono text-sm"
                        />
                        <div className="flex items-center gap-2">
                            {user?.emailVerification ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Verified
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    Unverified
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="px-5 py-3.5 bg-muted/30 border-t border-border/40 flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">We will email you to verify the change.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        {!user?.emailVerification && (
                            <Button variant="outline" onClick={handleResendVerification} disabled={isVerifying}>
                                {isVerifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Resend verification
                            </Button>
                        )}
                        <Button variant="secondary" onClick={openEmailDialog}>
                            Change email
                        </Button>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="p-5 space-y-3">
                    <div>
                        <h3 className="text-[14px] font-semibold text-foreground">Password & Security</h3>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                            Secure your account by updating your password.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            readOnly
                            type="password"
                            value="password1234"
                            className="max-w-md h-10 bg-muted/50 text-muted-foreground"
                        />
                    </div>
                </div>
                <div className="px-5 py-3.5 bg-muted/30 border-t border-border/40 flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">A secure reset link will be sent to your inbox.</p>
                    <Button variant="outline" onClick={handleForgotPassword} disabled={isResetSending}>
                        {isResetSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                        Reset password
                    </Button>
                </div>
            </section>

            <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Change Email</DialogTitle>
                        <DialogDescription>
                            Enter your new email and confirm with your password.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEmailUpdate} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-email">New Email Address</Label>
                            <Input
                                id="new-email"
                                type="email"
                                value={pendingEmail}
                                onChange={(e) => setPendingEmail(e.target.value)}
                                required
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Current Password</Label>
                            <Input
                                id="current-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-10"
                            />
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Confirm Change
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
