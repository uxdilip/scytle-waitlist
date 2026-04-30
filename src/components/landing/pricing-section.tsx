'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { useAuthStore } from '@/store'
import { PLAN_LIMITS } from '@/lib/plans'

export function PricingSection() {
  const { isAuthenticated } = useAuthStore()

  return (
    <section id="pricing" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <ScrollReveal>
          <div className="mb-16 text-center md:mb-24">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground md:text-lg">
              Start building for free. Upgrade when you need more power.
            </p>
          </div>
        </ScrollReveal>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
        {/* Free Tier */}
        <ScrollReveal delay={0.1}>
          <div className="card-hover flex h-full flex-col rounded-3xl border border-border bg-background p-8 sm:p-10">
            <div className="mb-8">
              <h3 className="text-xl font-semibold">Free</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Everything you need to kickstart your next project.
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">$0</span>
                  <span className="text-sm text-muted-foreground">/ forever</span>
                </div>
              </div>

            <ul className="mb-10 flex-1 space-y-4">
              {[
                '3 projects max',
                'Daily credits cap',
                'All AI models',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-foreground/80">
                  <Check className="size-4 text-emerald-600" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button variant="outline" className="w-full rounded-full" size="lg" asChild>
              <Link href={isAuthenticated ? '/dashboard' : '/signup'}>
                Get Started
              </Link>
            </Button>
          </div>
        </ScrollReveal>

        {/* Pro Tier */}
        <ScrollReveal delay={0.2}>
          <div className="card-hover relative flex h-full flex-col rounded-3xl border border-border bg-background p-8 sm:p-10">
            <div className="mb-8">
              <h3 className="text-xl font-semibold">Pro</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                For professionals building production applications.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">$16</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
            </div>

            <ul className="mb-10 flex-1 space-y-4">
              {[
                `${PLAN_LIMITS.pro.monthlyCredits} AI credits per month`,
                'No daily usage limit',
                'Unlimited projects',
                'All AI models',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-foreground/80">
                  <Check className="size-4 text-emerald-600" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90" size="lg" asChild>
              <Link href={isAuthenticated ? '/settings/billing' : '/signup'}>
                Upgrade to Pro
              </Link>
            </Button>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
