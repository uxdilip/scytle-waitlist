/**
 * Razorpay Server Client — Scytle (SERVER-ONLY)
 *
 * Handles order creation and payment signature verification.
 * Uses Razorpay Standard Checkout flow:
 *   1. Server creates an order → returns order_id
 *   2. Frontend opens Razorpay modal with order_id
 *   3. User pays → frontend gets payment_id + signature
 *   4. Server verifies signature → activates Pro plan
 */

import Razorpay from 'razorpay'
import crypto from 'crypto'

// ── Razorpay Instance ───────────────────────────────────────

const KEY_ID = process.env.RAZORPAY_KEY_ID!
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!

if (!KEY_ID || !KEY_SECRET) {
  console.warn('⚠️ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set')
}

const razorpay = new Razorpay({
  key_id: KEY_ID || 'dummy_key_for_build',
  key_secret: KEY_SECRET || 'dummy_secret_for_build',
})

export { razorpay }

// ── Pro Plan Pricing ────────────────────────────────────────

// $16 USD
// Razorpay uses cents/paise (1 USD = 100 cents)
export const PRO_PLAN = {
  name: 'Scytle Pro',
  amount: 1600, // $16 in cents
  currency: 'USD',
  description: 'Scytle Pro — 300 AI credits/month, unlimited projects',
} as const

// ── Create Order ────────────────────────────────────────────

export async function createOrder(userId: string) {
  // Receipt must be ≤ 40 chars — use short userId suffix + compact timestamp
  const shortId = userId.slice(-8)
  const ts = Date.now().toString(36) // base36 is shorter than decimal
  const receipt = `sp_${shortId}_${ts}` // e.g. "sp_e48b3b12_lxyz123" (~25 chars)

  const order = await razorpay.orders.create({
    amount: PRO_PLAN.amount,
    currency: PRO_PLAN.currency,
    receipt,
    notes: {
      userId,
      plan: 'pro',
      product: 'scytle_pro_monthly',
    },
  })

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  }
}

// ── Verify Payment Signature ────────────────────────────────

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const body = orderId + '|' + paymentId
  const expectedSignature = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex')

  return expectedSignature === signature
}
