'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { WaitlistForm } from '@/components/landing/waitlist-form'

export function CTASection() {
  const { isAuthenticated } = useAuthStore()

  return (
    <section className="px-4 py-8 md:py-12">
      <div className="mx-auto max-w-5xl p-6 sm:p-8">
        <ScrollReveal>
          <div className="flex flex-col items-center gap-6 rounded-xl border bg-secondary/50 p-8 text-center md:rounded-2xl md:p-16">
            <h2 className="text-3xl font-bold tracking-tight font-display sm:text-4xl lg:text-5xl text-balance">
              Start designing from a prompt
            </h2>
            <p className="max-w-xl text-base text-muted-foreground text-balance md:text-lg">
              It takes less than 5 minutes. Free to start, no credit card
              required.
            </p>
            <div className="w-full max-w-sm mt-4">
              <WaitlistForm />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
