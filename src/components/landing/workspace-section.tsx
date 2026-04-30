'use client'

import { MessageSquare, Layers, SlidersHorizontal, Maximize } from 'lucide-react'
import { FeatureCard } from '@/components/ui/grid-feature-cards'
import { ScrollReveal } from '@/components/ui/scroll-reveal'

const workspaceFeatures = [
  {
    title: 'Chat + AI Canvas',
    icon: MessageSquare,
    description:
      'Describe what you want in natural language. AI builds it directly on the canvas — no templates, no drag-and-drop.',
  },
  {
    title: 'Files & Layers',
    icon: Layers,
    description:
      'Navigate pages, expand layers, rename elements — a familiar panel that works just like Figma.',
  },
  {
    title: 'Properties Panel',
    icon: SlidersHorizontal,
    description:
      'Change colors, fonts, spacing, borders — direct visual manipulation of every element on the canvas.',
  },
  {
    title: 'Infinite Canvas',
    icon: Maximize,
    description:
      'Multiple pages side by side. Zoom, pan, and organize your designs freely on an infinite workspace.',
  },
]

export function WorkspaceSection() {
  return (
    <section className="py-16 md:py-32">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-6">
        <ScrollReveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-wide text-balance md:text-4xl lg:text-5xl xl:font-extrabold font-display">
            Your workspace. Your way.
          </h2>
          <p className="text-muted-foreground mt-4 text-sm tracking-wide text-balance md:text-base">
            A complete design studio — AI chat, layers, properties, infinite
            canvas — all in one place.
          </p>
        </ScrollReveal>

        <ScrollReveal
          delay={0.2}
          className="grid grid-cols-1 divide-x divide-y divide-dashed border border-dashed sm:grid-cols-2"
        >
          {workspaceFeatures.map((feature, i) => (
            <FeatureCard key={i} feature={feature} />
          ))}
        </ScrollReveal>
      </div>
    </section>
  )
}
