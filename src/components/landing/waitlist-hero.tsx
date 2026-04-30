'use client'

import { useState } from 'react'
import { ArrowRight, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Mockup } from '@/components/ui/mockup'
import { Glow } from '@/components/ui/glow'
import { HeroVideo } from '@/components/landing/hero-video'
import { joinWaitlist } from '@/app/actions/waitlist'

export function WaitlistHero() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(formData: FormData) {
    setStatus('loading')
    setErrorMsg('')
    
    const res = await joinWaitlist(formData)
    
    if (res?.error) {
      setErrorMsg(res.error)
      setStatus('error')
    } else {
      setStatus('success')
    }
  }

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
            real images on an infinite canvas. Request early access below.
          </p>

          {/* Waitlist Form */}
          <div className="relative z-10 w-full max-w-md animate-appear opacity-0 [animation-delay:300ms]">
            {status === 'success' ? (
              <div className="flex items-center justify-center w-full h-14 px-6 rounded-full border border-border bg-background/50 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
                <Check className="w-5 h-5 text-foreground mr-3" />
                <span className="text-foreground font-medium text-base">You're on the list. We'll be in touch!</span>
              </div>
            ) : (
              <form action={handleSubmit} className="flex flex-col gap-3">
                <div className="relative flex items-center">
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="Enter your email address..."
                    className="w-full h-14 pl-6 pr-36 rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all text-base shadow-sm"
                    disabled={status === 'loading'}
                  />
                  <Button
                    type="submit"
                    disabled={status === 'loading'}
                    className="absolute right-1.5 h-11 rounded-full px-6 bg-foreground text-background font-semibold hover:bg-foreground/90 transition-all"
                  >
                    {status === 'loading' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Join Beta
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
                {status === 'error' && (
                  <p className="text-sm text-red-500 font-medium px-4 text-left">{errorMsg}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  We care about your data in our <a href="/privacy" className="underline hover:text-foreground">privacy policy</a>.
                </p>
              </form>
            )}
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

      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Glow
          variant="center"
          className="animate-appear-zoom opacity-0 [animation-delay:1000ms]"
        />
      </div>
    </section>
  )
}
