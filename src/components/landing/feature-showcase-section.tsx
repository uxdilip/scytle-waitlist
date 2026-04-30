'use client'

import { useRef, useEffect } from 'react'
import {
  ImageIcon,
  LayoutTemplate,
  Paintbrush,
  RefreshCw,
  Link2,
  Download,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollReveal } from '@/components/ui/scroll-reveal'

gsap.registerPlugin(ScrollTrigger)

/* ===========================================
   Relume-style feature showcase
   - "Build faster" parallax heading
   - Three stacked white cards (2-col grid)
   =========================================== */

interface FeatureBullet {
  icon: React.ElementType
  title: string
  desc: string
}

interface FeatureCardData {
  tagline: string
  heading: string
  body: string
  bullets: [FeatureBullet, FeatureBullet]
  visual: React.ReactNode
  flipped?: boolean
  fullBleed?: boolean
}

const features: FeatureCardData[] = [
  {
    tagline: 'Prompt to',
    heading: 'Full page',
    body: 'Just describe what you need. Scytle generates complete page designs — not templates, not snippets — full pages with real content and images. Effortlessly create a complete design in seconds, not hours.',
    bullets: [
      {
        icon: ImageIcon,
        title: 'Real images from Unsplash',
        desc: 'Automatically pulled based on your content. No placeholder stock photos.',
      },
      {
        icon: LayoutTemplate,
        title: 'Full pages, not snippets',
        desc: 'Hero, features, testimonials, footer — every section generated at once.',
      },
    ],
    visual: <GenerateVisual />,
    fullBleed: true,
  },
  {
    tagline: 'Page to',
    heading: 'Refinement',
    body: 'Click any section and tell AI what to change. It edits in-place — your layout, your content, refined exactly how you want it. No regeneration needed.',
    bullets: [
      {
        icon: Paintbrush,
        title: 'In-place AI edits',
        desc: 'Changes happen exactly where you click. No full-page regeneration.',
      },
      {
        icon: RefreshCw,
        title: 'Iterate endlessly',
        desc: 'Refine as many times as you want. Every iteration makes it better.',
      },
    ],
    visual: <EditVisual />,
    flipped: true,
    fullBleed: true,
  },
  {
    tagline: 'Design to',
    heading: 'Production',
    body: 'Toggle a link public and share with anyone. Or export your designs as PNG, SVG, or HTML — ready for handoff or production use.',
    bullets: [
      {
        icon: Link2,
        title: 'One-click sharing',
        desc: 'Toggle public, copy link, anyone can view your design instantly.',
      },
      {
        icon: Download,
        title: 'Multi-format export',
        desc: 'PNG for presentations, SVG for developers, HTML for production.',
      },
    ],
    visual: <ShipVisual />,
  },
]

/* -------------------------------------------
   "Build faster" parallax heading
   Words start overlapping, separate on scroll
   ------------------------------------------- */
function ShipFasterHeading() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const buildRef = useRef<HTMLSpanElement>(null)
  const fasterRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        // "faster" — large upward parallax
        gsap.fromTo(
          fasterRef.current,
          { y: 120 },
          {
            y: -60,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        )

        // "Build" — subtle downward drift
        gsap.fromTo(
          buildRef.current,
          { y: -30 },
          {
            y: 30,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        )
      }, sectionRef)

      return () => ctx.revert()
    })

    return () => mm.revert()
  }, [])

  return (
    <div
      ref={sectionRef}
      className="flex items-baseline justify-center overflow-hidden py-16 md:py-24"
    >
      {/* "Build" — ghost text */}
      <span
        ref={buildRef}
        className="font-display select-none will-change-transform"
        style={{
          fontSize: 'clamp(72px, 14vw, 224px)',
          fontWeight: 500,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'rgba(22, 22, 22, 0.15)',
        }}
      >
        Build
      </span>

      {/* "faster" — animated gradient text */}
      <span className="relative">
        <span
          ref={fasterRef}
          className="font-display select-none will-change-transform"
          style={{
            fontSize: 'clamp(72px, 14vw, 224px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            backgroundImage:
              'linear-gradient(100deg, #ff7448, #ff4848 42%, #6248ff 85%)',
            backgroundSize: '200% 200%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'gradientShift 10s ease-in-out infinite',
          }}
        >
          faster
        </span>

        {/* Blur glow */}
        <span
          aria-hidden
          className="absolute inset-0 font-display select-none pointer-events-none"
          style={{
            fontSize: 'clamp(72px, 14vw, 224px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            backgroundImage:
              'linear-gradient(100deg, #ff7448, #ff4848 42%, #6248ff 85%)',
            backgroundSize: '200% 200%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'gradientShift 10s ease-in-out infinite',
            filter: 'blur(20px)',
            opacity: 0.04,
          }}
        >
          faster
        </span>
      </span>
    </div>
  )
}

/* -------------------------------------------
   Relume-style feature card
   Exact match: generous padding, large visual
   ------------------------------------------- */
function FeatureCard({ feature }: { feature: FeatureCardData }) {
  const textSide = (
    <div className="flex flex-col justify-between p-10 md:p-14 lg:py-20 lg:px-20">
      {/* Top: tagline + heading + body */}
      <div>
        <span className="block text-base text-muted-foreground md:text-lg">
          {feature.tagline}
        </span>

        <h2 className="mt-1 font-display text-[2.5rem] font-medium tracking-tight sm:text-5xl lg:text-[3.5rem] leading-[1.05]">
          {feature.heading}
        </h2>

        <p className="mt-6 max-w-[400px] text-[15px] leading-[1.65] text-muted-foreground md:text-base">
          {feature.body}
        </p>
      </div>

      {/* Bottom: two bullet columns with vertical divider */}
      <div className="mt-12 flex items-start">
        {feature.bullets.map((bullet, i) => (
          <div key={bullet.title} className="flex items-start">
            {i === 1 && (
              <div
                className="mx-6 w-px shrink-0 bg-border/60"
                style={{ height: 200 }}
              />
            )}
            <div className="max-w-[180px]">
              <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl border border-border/50 bg-card shadow-sm">
                <bullet.icon className="h-5 w-5 text-foreground/60" />
              </div>
              <h4 className="text-[15px] font-semibold leading-snug">
                {bullet.title}
              </h4>
              <p className="mt-1.5 text-sm leading-[1.55] text-muted-foreground">
                {bullet.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const visualSide = (
    <div
      className={cn(
        'relative flex flex-1 items-center justify-center overflow-hidden bg-[#f0efed]',
        'min-h-[400px] sm:min-h-[500px] lg:min-h-0',
        // Flush to outer edge, margin only on inner side + top/bottom
        feature.flipped
          ? 'mt-4 mb-4 mr-4 rounded-r-2xl md:mt-6 md:mb-6 md:mr-6 lg:mt-8 lg:mb-8 lg:mr-8'
          : 'mt-4 mb-4 ml-4 rounded-l-2xl md:mt-6 md:mb-6 md:ml-6 lg:mt-8 lg:mb-8 lg:ml-8',
      )}
    >
      {/* Illustration placeholder — replace with your own content */}
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          !feature.fullBleed && 'p-8 md:p-12 lg:p-16',
        )}
      >
        {feature.visual}
      </div>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:h-[720px]">
        {feature.flipped ? (
          <>
            <div className="order-2 lg:order-1 flex flex-col">{visualSide}</div>
            <div className="order-1 lg:order-2">{textSide}</div>
          </>
        ) : (
          <>
            {textSide}
            <div className="flex flex-col">{visualSide}</div>
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------
   Exported section
   ------------------------------------------- */
export function FeatureShowcaseSection() {
  return (
    <section id="features" className="relative py-4 md:py-8">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <ShipFasterHeading />

        <div className="space-y-6">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.tagline} delay={0.1}>
              <FeatureCard feature={feature} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ===========================================
   ILLUSTRATIONS
   Full-size product UI mockups that fill the
   card visual area — matching Relume's style
   =========================================== */

function GenerateVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <video
        src="/videos/video%203.2%20(mobile%20clip).mp4#t=5"
        autoPlay
        muted
        playsInline
        onEnded={(e) => {
          e.currentTarget.currentTime = 5
          e.currentTarget.play()
        }}
        className="absolute max-w-none"
        style={{
          // 👇 CROP THE VIDEO HERE 👇
          width: '226%',
          left: '-90%',
          top: '0%',
        }}
      />
    </div>
  )
}

function EditVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <video
        src="/videos/video%202%20(redesign%20section%20clip).mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute max-w-none"
        style={{
          // 👇 CROP THE VIDEO HERE 👇
          // 1. Width: Make it larger than the container to crop out edges (e.g. 150%)
          width: '227%',
          // 2. Position: Shift it Left/Up to frame the exact part you want to see
          left: '-23%',
          top: '0%',
        }}
      />
    </div>
  )
}

function ShipVisual() {
  return (
    <div className="w-full rounded-2xl border border-border/30 bg-background p-6 shadow-md lg:p-8">
      {/* Share dialog */}
      <div className="mb-6 rounded-xl border border-border/40 bg-background p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">Share project</span>
          <div className="h-5 w-10 rounded-full bg-green-500" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
          <span className="flex-1 truncate text-xs text-muted-foreground">
            scytle.com/share/abc123
          </span>
          <span className="rounded-md bg-foreground/5 px-2.5 py-1 text-xs font-medium">
            Copy
          </span>
        </div>
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-3 gap-3">
        {['PNG', 'SVG', 'HTML'].map((fmt) => (
          <div
            key={fmt}
            className="flex flex-col items-center gap-2 rounded-xl border border-border/20 bg-muted/20 p-4"
          >
            <Download className="h-5 w-5 text-foreground/40" />
            <span className="text-xs font-medium">{fmt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
