'use client'

/**
 * Upgrade Modal — Shows when credits are exhausted or user clicks upgrade
 *
 * Opens Razorpay Standard Checkout in a modal popup.
 * Flow: Click → create order → open Razorpay → verify → activate Pro
 */

import { useState, useEffect } from 'react'
import { Zap, Check, X, Loader2 } from 'lucide-react'
import { useCreditStore } from '@/store/credits-store'
import { createJWT } from '@/lib/appwrite'
import { PLAN_LIMITS } from '@/lib/plans'

declare global {
  interface Window {
    Razorpay: any
  }
}

// Load Razorpay checkout script
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function UpgradeModal() {
  const { showUpgradeModal, closeUpgradeModal, fetchCredits, plan } = useCreditStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (showUpgradeModal) {
      setError(null)
      setSuccess(false)
    }
  }, [showUpgradeModal])

  if (!showUpgradeModal) return null

  // Don't show upgrade if already Pro
  if (plan === 'pro' && !success) {
    closeUpgradeModal()
    return null
  }

  async function handleUpgrade() {
    setIsProcessing(true)
    setError(null)

    try {
      // 1. Load Razorpay script
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setError('Failed to load payment gateway. Please try again.')
        setIsProcessing(false)
        return
      }

      // 2. Create order on backend
      const jwt = await createJWT()
      if (!jwt) {
        setError('Session expired. Please login again.')
        setIsProcessing(false)
        return
      }

      const res = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt.jwt}`,
        },
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create order')
        setIsProcessing(false)
        return
      }

      const order = await res.json()

      // 3. Open Razorpay checkout
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: {
          color: '#6366f1',
        },
        handler: async function (response: any) {
          // 4. Verify payment on backend
          try {
            const verifyJwt = await createJWT()
            const verifyRes = await fetch('/api/billing/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${verifyJwt!.jwt}`,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })

            if (verifyRes.ok) {
              setSuccess(true)
              // Refresh credit state
              await fetchCredits()
            } else {
              const data = await verifyRes.json()
              setError(data.error || 'Payment verification failed')
            }
          } catch {
            setError('Payment verification failed. Please contact support.')
          }
          setIsProcessing(false)
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false)
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (response: any) {
        setError(response.error?.description || 'Payment failed')
        setIsProcessing(false)
      })
      rzp.open()
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !isProcessing && closeUpgradeModal()}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-3xl border border-border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        {!isProcessing && (
          <button
            onClick={closeUpgradeModal}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted transition-colors z-10"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {success ? (
          /* Success State */
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">Welcome to Pro! 🎉</h3>
            <p className="text-muted-foreground text-sm mb-6">
              You now have {PLAN_LIMITS.pro.monthlyCredits} credits/month and unlimited projects.
            </p>
            <button
              onClick={closeUpgradeModal}
              className="w-full py-3 px-6 rounded-xl bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Start building
            </button>
          </div>
        ) : (
          <>
            <div className="p-8 sm:p-10">
              <div className="mb-8">
                <h3 className="text-xl font-semibold">Pro</h3>
                <p className="mt-2 text-sm text-muted-foreground">For professionals building production applications.</p>
                
                {/* Price */}
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">$16</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
              </div>

              {/* Features */}
              <ul className="mb-10 space-y-4">
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

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleUpgrade}
                disabled={isProcessing}
                className="w-full h-12 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Upgrade Now
                  </>
                )}
              </button>

              <p className="text-xs text-muted-foreground text-center mt-4">
                Secure payment via Razorpay • Cancel anytime
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
