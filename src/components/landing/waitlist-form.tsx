'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { joinWaitlist } from '@/app/actions/waitlist'

export function WaitlistForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    try {
      const res = await joinWaitlist(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-4 bg-background/50 backdrop-blur-sm border border-green-500/30 rounded-2xl shadow-sm animate-appear">
        <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
        <h3 className="font-semibold text-foreground">You're on the list!</h3>
        <p className="text-sm text-muted-foreground text-center">We'll email you when your beta access is ready.</p>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        name="email"
        placeholder="you@company.com"
        required
        disabled={loading}
        className={cn(
          "h-12 w-full rounded-full px-5 text-base",
          "bg-background/80 backdrop-blur-sm border border-border/50",
          "focus:outline-none focus:ring-2 focus:ring-foreground/20",
          "placeholder:text-muted-foreground",
          "shadow-sm disabled:opacity-50"
        )}
      />
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <Button
        type="submit"
        size="lg"
        disabled={loading}
        className={cn(
          'h-12 rounded-full w-full text-base font-semibold',
          'bg-foreground text-background',
          'hover:bg-foreground/90',
          'shadow-lg shadow-foreground/10',
          'transition-all duration-300',
          'group',
        )}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            Get Early Access
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </Button>
    </form>
  )
}
