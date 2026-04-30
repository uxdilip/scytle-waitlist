export const PLAN_LIMITS = {
  free: { monthlyCredits: 50, dailyCap: 10 },
  pro: { monthlyCredits: 500, dailyCap: null as number | null },
} as const

export type Plan = keyof typeof PLAN_LIMITS
