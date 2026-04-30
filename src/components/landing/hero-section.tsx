import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Mockup } from '@/components/ui/mockup'
import { Glow } from '@/components/ui/glow'
import { HeroVideo } from '@/components/landing/hero-video'
import { WaitlistForm } from '@/components/landing/waitlist-form'

export function HeroSection() {
  return (
    <section
      className={cn(
        'relative bg-background text-foreground',
        'pt-4 pb-12 px-4 md:pt-8 md:pb-24 lg:pt-12 lg:pb-32',
        'overflow-hidden',
      )}
    >
      <div className="relative mx-auto max-w-[1280px] flex flex-col gap-8 lg:gap-16">
        <div className="relative z-10 flex flex-col items-center gap-5 text-center lg:gap-8">
          {/* Heading */}
          <h1
            className={cn(
              'inline-block animate-appear',
              'text-foreground',
              'text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl',
              'leading-[1.1] sm:leading-[1.1]',
              'font-display',
            )}
          >
            Design from a prompt.
            <br />
            Ship in minutes.
          </h1>

          {/* Description */}
          <p
            className={cn(
              'max-w-[550px] animate-appear opacity-0 [animation-delay:150ms]',
              'text-base sm:text-lg md:text-xl',
              'text-muted-foreground',
              'font-medium',
            )}
          >
            Describe what you want — Scytle generates full page designs with
            real images on an infinite canvas. Edit with AI, share a link,
            export as PNG, SVG, or HTML.
          </p>

          {/* Waitlist Form */}
          <div className="relative z-10 w-full max-w-sm mx-auto mt-4 animate-appear opacity-0 [animation-delay:300ms]">
            <WaitlistForm />
          </div>

          {/* Mockup */}
          <div className="relative w-full pt-8 px-4 sm:px-6 lg:px-8">
            <Mockup
              className={cn(
                'animate-appear opacity-0 [animation-delay:700ms]',
                'shadow-[0_0_50px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_0_50px_-12px_rgba(255,255,255,0.1)]',
                'border-border/30 dark:border-border/10',
              )}
            >
              <HeroVideo videoId="hDBuOErbM0U" />
            </Mockup>
          </div>
        </div>
      </div>

      {/* Background Glow — pushed down to center of hero, clipped by overflow-hidden */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Glow
          variant="center"
          className="animate-appear-zoom opacity-0 [animation-delay:1000ms]"
        />
      </div>
    </section>
  )
}
