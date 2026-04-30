'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'

import {
    Navbar,
    NavBody,
    NavItems,
    MobileNav,
    MobileNavHeader,
    MobileNavToggle,
    MobileNavMenu,
    NavbarButton,
} from '@/components/ui/resizable-navbar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store'

const navItems = [
    { name: 'How it works', link: '#how-it-works' },
    { name: 'Features', link: '#features' },
    { name: 'Pricing', link: '#pricing' },
]

export function LandingHeader() {
    const [mobileOpen, setMobileOpen] = useState(false)
    const { user, isAuthenticated, isLoading, checkSession, logout } = useAuthStore()

    useEffect(() => {
        checkSession()
    }, [checkSession])

    const handleLogout = async () => {
        setMobileOpen(false)
        await logout()
    }

    const getInitials = (name: string | undefined) => {
        if (!name) return 'U'
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    return (
        <>
        <div className="relative w-full">
            <Navbar>
                {/* ── Desktop ──────────────────────────────────────────── */}
                <NavBody>
                    {/* Logo */}
                    <Link
                        href="/"
                        className="relative z-20 mr-4 flex items-center gap-2 px-2 py-1"
                    >
                        <div className="flex h-8 w-8 items-center justify-center">
                            <Image src="/Icon.svg" alt="Scytle Icon" width={32} height={32} />
                        </div>
                        <span className="font-display text-lg font-bold tracking-tight text-foreground">
                            Scytle
                        </span>
                    </Link>

                    {/* Centre nav links */}
                    <NavItems items={navItems} />

                    {/* Right actions */}
                    <div className="relative z-20 flex items-center gap-3">
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : isAuthenticated && user ? (
                            <>
                                <NavbarButton
                                    href="/dashboard"
                                    as={Link}
                                    variant="secondary"
                                    className="text-sm font-medium text-foreground"
                                >
                                    Dashboard
                                </NavbarButton>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="relative h-8 w-8 rounded-full ring-2 ring-transparent transition-all hover:ring-accent/25">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
                                                    {getInitials(user.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <div className="flex items-center gap-2 p-2">
                                            <div className="flex flex-col space-y-1 leading-none">
                                                <p className="font-medium">{user.name}</p>
                                                <p className="w-[200px] truncate text-sm text-muted-foreground">
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild>
                                            <Link href="/dashboard">Dashboard</Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                            <Link href="/settings">Settings</Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={handleLogout}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            Log out
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : (
                            <>
                                <NavbarButton
                                    href="/login"
                                    as={Link}
                                    variant="secondary"
                                    className="text-sm font-medium text-foreground"
                                >
                                    Log in
                                </NavbarButton>
                                <NavbarButton
                                    href="/signup"
                                    as={Link}
                                    variant="primary"
                                    className="rounded-full bg-foreground text-background shadow-md hover:bg-foreground/90"
                                >
                                    Get Started
                                </NavbarButton>
                            </>
                        )}
                    </div>
                </NavBody>

                {/* ── Mobile ───────────────────────────────────────────── */}
                <MobileNav>
                    <MobileNavHeader>
                        <Link
                            href="/"
                            className="relative z-20 flex items-center gap-2 px-2 py-1"
                        >
                            <div className="flex h-8 w-8 items-center justify-center">
                                <Image src="/Icon.svg" alt="Scytle Icon" width={32} height={32} />
                            </div>
                            <span className="font-display text-lg font-bold tracking-tight text-foreground">
                                Scytle
                            </span>
                        </Link>
                        <MobileNavToggle
                            isOpen={mobileOpen}
                            onClick={() => setMobileOpen(!mobileOpen)}
                        />
                    </MobileNavHeader>

                    <MobileNavMenu
                        isOpen={mobileOpen}
                        onClose={() => setMobileOpen(false)}
                    >
                        {navItems.map((item, idx) => (
                            <a
                                key={`mobile-link-${idx}`}
                                href={item.link}
                                onClick={() => setMobileOpen(false)}
                                className="text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                {item.name}
                            </a>
                        ))}
                        <div className="flex w-full flex-col gap-3 pt-2">
                            {isAuthenticated && user ? (
                                <>
                                    <NavbarButton
                                        href="/dashboard"
                                        as={Link}
                                        variant="primary"
                                        className="w-full"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Dashboard
                                    </NavbarButton>
                                    <NavbarButton
                                        as="button"
                                        variant="secondary"
                                        className="w-full text-destructive"
                                        onClick={handleLogout}
                                    >
                                        Log out
                                    </NavbarButton>
                                </>
                            ) : (
                                <>
                                    <NavbarButton
                                        href="/login"
                                        as={Link}
                                        variant="secondary"
                                        className="w-full text-foreground"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Log in
                                    </NavbarButton>
                                    <NavbarButton
                                        href="/signup"
                                        as={Link}
                                        variant="primary"
                                        className="w-full rounded-full bg-foreground text-background shadow-md"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Get Started
                                    </NavbarButton>
                                </>
                            )}
                        </div>
                    </MobileNavMenu>
                </MobileNav>
            </Navbar>
        </div>
        {/* Spacer for fixed navbar */}
        <div className="h-16" />
        </>
    )
}
