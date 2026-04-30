/**
 * Credit System — Scytle (SERVER-ONLY)
 *
 * Production-grade credit engine with:
 *   - Model multipliers (Gemini=1×, Sonnet=2×, Opus=3×)
 *   - Action weights (chat=0, edit=1, generate=3)
 *   - Lazy resets (no cron needed)
 *   - Deferred deduction (charge after stream completes)
 *
 * Formula: credits_consumed = model_multiplier × Σ(action_weights)
 *
 * Plan limits:
 *   Free: 50 credits/month, 10/day cap
 *   Pro:  500 credits/month, no daily cap
 */

import { createAdminClient, DATABASE_ID, Query, ID } from './appwrite-server'

import { PLAN_LIMITS, type Plan } from './plans'

export { PLAN_LIMITS, type Plan }

// ── Action Weights ──────────────────────────────────────────
// Each tool call has a weight reflecting its compute intensity

export const ACTION_WEIGHTS: Record<string, number> = {
  generateSection: 3,  // Full HTML section generation — heavy
  editNode: 1,          // Targeted element edit — light
  searchImages: 0,      // Just an API search, no AI generation
}

/**
 * Calculate total credit cost for a request
 * @param modelMultiplier - from ModelDef.creditMultiplier (1, 2, or 3)
 * @param toolCalls - array of tool names called during the request
 * @returns credit cost (0 = free chat, 1+ = billable action)
 */
export function calculateCreditCost(
  modelMultiplier: number,
  toolCalls: string[],
): number {
  // No tool calls = pure chat = free
  if (toolCalls.length === 0) return 0

  // Sum up action weights for all tool calls
  const actionWeight = toolCalls.reduce(
    (sum, tool) => sum + (ACTION_WEIGHTS[tool] ?? 1),
    0,
  )

  // If all tools are zero-weight (e.g. only searchImages), still free
  if (actionWeight === 0) return 0

  // Final cost = model multiplier × total action weight
  return Math.max(1, modelMultiplier * actionWeight)
}

// ── Collection ID ───────────────────────────────────────────

const CREDITS_COLLECTION = 'user_credits'

// ── Types ───────────────────────────────────────────────────

export interface CreditDoc {
  $id: string
  userId: string
  plan: Plan
  creditsUsedMonth: number
  creditsUsedToday: number
  monthKey: string   // "2026-04"
  dayKey: string     // "2026-04-23"
  razorpayCustomerId?: string
  razorpayOrderId?: string
  planExpiresAt?: string
}

export interface CreditCheckResult {
  allowed: boolean
  reason?: string
  plan: Plan
  creditsUsedMonth: number
  creditsLimit: number
  dailyUsed: number
  dailyCap: number | null
  remaining: number
}

// ── Helpers ─────────────────────────────────────────────────

function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentDayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ── Get or Create Credit Doc ────────────────────────────────

export async function getUserCredits(userId: string): Promise<CreditDoc> {
  const { databases } = createAdminClient()

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      CREDITS_COLLECTION,
      [Query.equal('userId', userId), Query.limit(1)]
    )

    if (result.documents.length > 0) {
      return result.documents[0] as unknown as CreditDoc
    }
  } catch {
    // Collection might not exist yet — will create doc below
  }

  // Create new credit doc for first-time user
  const doc = await databases.createDocument(
    DATABASE_ID,
    CREDITS_COLLECTION,
    ID.unique(),
    {
      userId,
      plan: 'free',
      creditsUsedMonth: 0,
      creditsUsedToday: 0,
      monthKey: getCurrentMonthKey(),
      dayKey: getCurrentDayKey(),
    }
  )

  return doc as unknown as CreditDoc
}

// ── Lazy Reset (month/day rollover) ─────────────────────────

async function lazyReset(doc: CreditDoc): Promise<CreditDoc> {
  const currentMonth = getCurrentMonthKey()
  const currentDay = getCurrentDayKey()
  const updates: Record<string, unknown> = {}

  if (doc.monthKey !== currentMonth) {
    updates.creditsUsedMonth = 0
    updates.monthKey = currentMonth
    updates.creditsUsedToday = 0
    updates.dayKey = currentDay
  } else if (doc.dayKey !== currentDay) {
    updates.creditsUsedToday = 0
    updates.dayKey = currentDay
  }

  // Check if pro plan has expired
  if (doc.plan === 'pro' && doc.planExpiresAt) {
    const expiresAt = new Date(doc.planExpiresAt)
    if (expiresAt < new Date()) {
      updates.plan = 'free'
      // Reset monthly usage since they're switching to free
      updates.creditsUsedMonth = 0
    }
  }

  if (Object.keys(updates).length === 0) return doc

  const { databases } = createAdminClient()
  const updated = await databases.updateDocument(
    DATABASE_ID,
    CREDITS_COLLECTION,
    doc.$id,
    updates
  )

  return updated as unknown as CreditDoc
}

// ── Check Credits ───────────────────────────────────────────

export async function checkCredits(userId: string): Promise<CreditCheckResult> {
  const raw = await getUserCredits(userId)
  const doc = await lazyReset(raw)
  const limits = PLAN_LIMITS[doc.plan]

  const remaining = limits.monthlyCredits - doc.creditsUsedMonth

  // Monthly limit check
  if (doc.creditsUsedMonth >= limits.monthlyCredits) {
    return {
      allowed: false,
      reason: doc.plan === 'free'
        ? 'You\'ve used all 50 free credits this month. Upgrade to Pro for 500 credits/month.'
        : 'You\'ve used all 500 Pro credits this month. Credits reset on the 1st.',
      plan: doc.plan,
      creditsUsedMonth: doc.creditsUsedMonth,
      creditsLimit: limits.monthlyCredits,
      dailyUsed: doc.creditsUsedToday,
      dailyCap: limits.dailyCap,
      remaining: 0,
    }
  }

  // Daily cap check (free plan only)
  if (limits.dailyCap !== null && doc.creditsUsedToday >= limits.dailyCap) {
    return {
      allowed: false,
      reason: 'You\'ve hit the daily limit of 10 credits. Come back tomorrow, or upgrade to Pro for unlimited daily usage.',
      plan: doc.plan,
      creditsUsedMonth: doc.creditsUsedMonth,
      creditsLimit: limits.monthlyCredits,
      dailyUsed: doc.creditsUsedToday,
      dailyCap: limits.dailyCap,
      remaining,
    }
  }

  return {
    allowed: true,
    plan: doc.plan,
    creditsUsedMonth: doc.creditsUsedMonth,
    creditsLimit: limits.monthlyCredits,
    dailyUsed: doc.creditsUsedToday,
    dailyCap: limits.dailyCap,
    remaining,
  }
}

// ── Deduct Credits (variable amount) ────────────────────────

/**
 * Deduct a variable number of credits from a user's account.
 * Called after stream completes so we know the actual cost.
 * @param userId - Appwrite user ID
 * @param amount - number of credits to deduct (from calculateCreditCost)
 */
export async function deductCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return

  const doc = await getUserCredits(userId)
  const { databases } = createAdminClient()

  await databases.updateDocument(
    DATABASE_ID,
    CREDITS_COLLECTION,
    doc.$id,
    {
      creditsUsedMonth: doc.creditsUsedMonth + amount,
      creditsUsedToday: doc.creditsUsedToday + amount,
    }
  )
}

// ── Legacy alias (for backwards compat) ─────────────────────

export async function deductCredit(userId: string): Promise<void> {
  return deductCredits(userId, 1)
}

// ── Upgrade to Pro ──────────────────────────────────────────

export async function upgradeToPro(
  userId: string,
  razorpayOrderId: string,
  durationDays: number = 30,
): Promise<void> {
  const doc = await getUserCredits(userId)
  const { databases } = createAdminClient()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + durationDays)

  await databases.updateDocument(
    DATABASE_ID,
    CREDITS_COLLECTION,
    doc.$id,
    {
      plan: 'pro',
      creditsUsedMonth: 0, // Reset usage on upgrade
      razorpayOrderId,
      planExpiresAt: expiresAt.toISOString(),
    }
  )
}
