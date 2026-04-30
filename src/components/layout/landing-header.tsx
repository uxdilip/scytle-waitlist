'use client'

import { useState } from 'react'
import Link from 'next/link'
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

const navItems = [
    { name: 'How it works', link: '#how-it-works' },
    { name: 'Features', link: '#features' },
    { name: 'Pricing', link: '#pricing' },
]

export function LandingHeader() {
    const [mobileOpen, setMobileOpen] = useState(false)

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
                        <NavbarButton
                            href="https://beta.scytle.com/login"
                            as={Link}
                            variant="secondary"
                            className="text-sm font-medium text-foreground"
                        >
                            Log in
                        </NavbarButton>
                        <NavbarButton
                            href="https://beta.scytle.com/signup"
                            as={Link}
                            variant="primary"
                            className="rounded-full bg-foreground text-background shadow-md hover:bg-foreground/90"
                        >
                            Get Started
                        </NavbarButton>
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
                            <NavbarButton
                                href="https://beta.scytle.com/login"
                                as={Link}
                                variant="secondary"
                                className="w-full text-foreground"
                                onClick={() => setMobileOpen(false)}
                            >
                                Log in
                            </NavbarButton>
                            <NavbarButton
                                href="https://beta.scytle.com/signup"
                                as={Link}
                                variant="primary"
                                className="w-full rounded-full bg-foreground text-background shadow-md"
                                onClick={() => setMobileOpen(false)}
                            >
                                Get Started
                            </NavbarButton>
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
