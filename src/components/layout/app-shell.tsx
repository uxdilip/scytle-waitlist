'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
    Zap,
    FileText,
    Settings,
    LogOut,
    Plus,
    Loader2,
    Menu,
    X,
    ChevronDown,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SupportWidget } from '@/components/layout/support-widget'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore, useProjectStore } from '@/store'
import { storage, BUCKETS } from '@/lib/appwrite'
import { UpgradeModal } from '@/components/billing/upgrade-modal'

interface AppShellProps {
    children: React.ReactNode
    hideNav?: boolean
}

export function AppShell({ children, hideNav = false }: AppShellProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { user, logout, checkSession, isLoading: isAuthLoading } = useAuthStore()
    const { projects, createProject } = useProjectStore()
    const [isCreating, setIsCreating] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const sidebarRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!user) {
            checkSession()
        }
    }, [user, checkSession])

    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                setSidebarOpen(false)
            }
        }
        if (sidebarOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [sidebarOpen])

    const handleNewProject = useCallback(async () => {
        if (isCreating) return
        setIsCreating(true)
        try {
            const prefix = 'Untitled Project'
            const nums = projects
                .map(p => p.name.match(/^Untitled Project\s*(\d*)$/)?.[1])
                .filter(Boolean)
                .map(n => parseInt(n || '1', 10))
            const next = nums.length ? Math.max(...nums) + 1 : 1
            const project = await createProject({ name: `${prefix} ${next}` })
            if (project) {
                router.push(`/project/${project.projectId}`)
            }
        } finally {
            setIsCreating(false)
        }
    }, [createProject, projects, router, isCreating])

    const initials = user?.name
        ?.split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase() || 'U'

    const avatarId = (user?.prefs as any)?.avatarId as string | undefined
    let avatarUrl: string | undefined = undefined

    if (avatarId) {
        try {
            avatarUrl = storage.getFilePreview(BUCKETS.AVATARS, avatarId).toString()
        } catch (error) {
            console.error('Failed to get header avatar preview:', error)
        }
    }

    const isActive = (href: string) => {
        if (href === '/dashboard') {
            return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
        }
        return pathname.startsWith(href)
    }

    // Fix #5: prevent hard refresh when clicking already-active nav link
    const handleNavClick = (e: React.MouseEvent, href: string) => {
        if (pathname === href || (href === '/dashboard' && pathname.startsWith('/dashboard'))) {
            e.preventDefault()
        }
    }

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* User Profile — top, minimal like Paper */}
            <div className="px-3 pt-4 pb-3">
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left focus:outline-none">
                                <Avatar className="w-6 h-6 shrink-0">
                                    <AvatarImage src={avatarUrl} className="object-cover" />
                                    <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-[13px] font-medium text-foreground truncate flex-1">
                                    {user?.name || 'User'}
                                </span>
                                <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                            </button>
                        </DropdownMenuTrigger>
                        {/* Fix #4: avatar dropdown — just log out, no accent colors */}
                        <DropdownMenuContent align="start" side="bottom" className="w-48" sideOffset={4}>
                            <DropdownMenuItem
                                onClick={() => logout()}
                                className="cursor-pointer text-[13px]"
                            >
                                <LogOut className="w-3.5 h-3.5 mr-2" />
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center overflow-hidden">
                            <Image src="/Icon.svg" alt="Scytle" width={24} height={24} />
                        </div>
                        <span className="font-display font-bold text-[15px] tracking-tight text-foreground">
                            Scytle
                        </span>
                    </Link>
                )}
            </div>

            {/* Navigation — 2 items only */}
            {!hideNav && (
                <nav className="px-3 space-y-0.5">
                    <Link
                        href="/dashboard"
                        onClick={(e) => handleNavClick(e, '/dashboard')}
                        className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-75',
                            isActive('/dashboard')
                                ? 'bg-foreground/[0.06] text-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                    >
                        <FileText className={cn('w-4 h-4', isActive('/dashboard') ? 'text-foreground' : 'text-muted-foreground/60')} />
                        Files
                    </Link>
                    <Link
                        href="/settings/profile"
                        onClick={(e) => handleNavClick(e, '/settings/profile')}
                        className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-75',
                            isActive('/settings')
                                ? 'bg-foreground/[0.06] text-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                    >
                        <Settings className={cn('w-4 h-4', isActive('/settings') ? 'text-foreground' : 'text-muted-foreground/60')} />
                        Settings
                    </Link>
                </nav>
            )}

            <div className="flex-1" />

            {!user && !isAuthLoading && (
                <div className="px-3 pb-4 space-y-2">
                    <Link
                        href="/login"
                        className="w-full inline-flex items-center justify-center h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
                    >
                        Log In
                    </Link>
                    <Link
                        href="/signup"
                        className="w-full inline-flex items-center justify-center h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Start for free
                    </Link>
                </div>
            )}
        </div>
    )

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile Header */}
            <header className="lg:hidden sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur-xl">
                <div className="flex h-14 items-center px-4">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted/60 transition-colors mr-3"
                    >
                        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden">
                            <Image src="/Icon.svg" alt="Scytle" width={28} height={28} />
                        </div>
                        <span className="font-display font-bold text-[17px] tracking-tight">
                            Scytle
                        </span>
                    </Link>
                    <div className="flex-1" />
                    {user && (
                        <button
                            onClick={handleNewProject}
                            disabled={isCreating}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                        >
                            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>New</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <div
                        ref={sidebarRef}
                        className="absolute left-0 top-0 bottom-0 w-[200px] bg-sidebar border-r border-sidebar-border shadow-xl animate-in slide-in-from-left duration-200"
                    >
                        <SidebarContent />
                    </div>
                </div>
            )}

            <div className="flex">
                <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[200px] lg:border-r lg:border-sidebar-border lg:bg-sidebar">
                    <SidebarContent />
                </aside>

                <main className="flex-1 lg:pl-[200px] min-h-screen">
                    {children}
                </main>
            </div>

            {!pathname.startsWith('/project') && <SupportWidget />}
            <UpgradeModal />
        </div>
    )
}
