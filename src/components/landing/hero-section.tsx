import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Mockup } from '@/components/ui/mockup'
import { Glow } from '@/components/ui/glow'
import { HeroVideo } from '@/components/landing/hero-video'

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

          {/* CTAs — Claude-style: black primary + outlined secondary */}
          <div
            className="relative z-10 flex flex-wrap justify-center gap-4
            animate-appear opacity-0 [animation-delay:300ms]"
          >
            {/* Primary CTA — solid black */}
            <Button
              asChild
              size="lg"
              className={cn(
                'h-12 rounded-full px-8 text-base font-semibold',
                'bg-foreground text-background',
                'hover:bg-foreground/90',
                'shadow-lg shadow-foreground/10',
                'transition-all duration-300',
                'group',
              )}
            >
              <Link href="/signup">
                Start building for free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>

            {/* Secondary CTA — outlined, like Claude's "Contact sales" */}
            <Button
              asChild
              size="lg"
              variant="outline"
              className={cn(
                'h-12 rounded-full px-8 text-base font-medium',
                'border-border text-foreground/70',
                'hover:bg-secondary hover:text-foreground',
                'transition-all duration-300',
              )}
            >
              <a href="https://www.youtube.com/watch?v=hDBuOErbM0U" target="_blank" rel="noopener noreferrer">
                <Play className="mr-2 h-4 w-4" />
                Watch demo
              </a>
            </Button>
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
