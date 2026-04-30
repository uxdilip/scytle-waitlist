'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ===========================================
   Shifting Footer
   Sits behind the main content. As you scroll
   past the bottom, it reveals with a slide-up
   + opacity transition — inspired by
   tutorial-01-footer-shifting.html
   =========================================== */

const footerLinks = {
  product: [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
  ],

  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Cookies', href: '/cookies' },
  ],
  socials: [
    { label: 'Twitter / X', href: 'https://x.com' },
    { label: 'YouTube', href: 'https://youtube.com' },
  ],
}

export function LandingFooter() {
  const footerRef = useRef<HTMLElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top bottom',
            end: 'top 20%',
            scrub: true,
          },
        })

        // Fade out the dark overlay
        tl.fromTo(
          overlayRef.current,
          { opacity: 1 },
          { opacity: 0, ease: 'none' },
          0,
        )

        // Slide inner content up
        tl.fromTo(
          innerRef.current,
          { yPercent: -30 },
          { yPercent: 0, ease: 'none' },
          0,
        )
      }, footerRef)

      return () => ctx.revert()
    })

    return () => mm.revert()
  }, [])

  return (
    <footer
      ref={footerRef}
      className="relative bg-foreground text-background"
      data-footer-dark
    >
      {/* Dark overlay — fades out on scroll to reveal footer */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 bg-foreground"
      />

      <div ref={innerRef} className="relative z-0">
        <div className="mx-auto max-w-6xl px-8 pb-12 pt-24 md:px-12 lg:pt-32">
          {/* Top: Logo + Nav grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 lg:grid-cols-4">
            {/* Logo — spans first column on lg */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <Link href="/" className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden brightness-0 invert">
                  <Image
                    src="/Icon.svg"
                    alt="Scytle"
                    width={32}
                    height={32}
                  />
                </div>
                <span className="font-display text-lg font-bold">Scytle</span>
              </Link>
              <p className="max-w-[200px] text-sm text-background/50">
                Design from a prompt. Ship in minutes.
              </p>
            </div>

            {/* Product */}
            <nav>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background/40">
                Product
              </h4>
              <ul className="space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-background/60 transition-colors hover:text-background"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>



            {/* Legal */}
            <nav>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background/40">
                Legal
              </h4>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-background/60 transition-colors hover:text-background"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Socials */}
            <nav>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background/40">
                Connect
              </h4>
              <ul className="space-y-3">
                {footerLinks.socials.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-background/60 transition-colors hover:text-background"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 flex items-center justify-between border-t border-background/10 pt-8">
            <p className="text-base text-background/60">
              © {new Date().getFullYear()}
            </p>
            <a href="mailto:support@scytle.com" className="text-base text-background/60 transition-colors hover:text-background">
              support@scytle.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
