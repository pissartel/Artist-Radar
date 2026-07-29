// Issue #142 section 8: usage-based cost protection.
//
// Two independent budgets:
//  - a per-analysis call cap (CHARTMETRIC_MAX_CALLS_PER_ANALYSIS), a fresh
//    instance per pipeline run so one runaway analysis can't hammer the API;
//  - daily/monthly credit caps (CHARTMETRIC_DAILY_CREDIT_LIMIT /
//    CHARTMETRIC_MONTHLY_CREDIT_LIMIT), a process-lifetime singleton so
//    limits hold across analyses.
//
// Per AGENTS.md ("do not add a database until explicitly requested"), the
// credit budget is in-memory only and resets on process restart — an
// acceptable phase-1 limitation called out in the PR description; a
// follow-up ticket can persist it if real usage warrants it.
import type { ChartmetricSkipReason } from "./chartmetric.types.js";

export interface ChartmetricUsageGuardEnv {
  CHARTMETRIC_MAX_CALLS_PER_ANALYSIS?: string;
  CHARTMETRIC_DAILY_CREDIT_LIMIT?: string;
  CHARTMETRIC_MONTHLY_CREDIT_LIMIT?: string;
}

const DEFAULT_MAX_CALLS_PER_ANALYSIS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: ChartmetricSkipReason;
}

// Bounds how many Chartmetric calls a single enrichArtist()/pipeline run may
// make. Construct one instance per analysis and pass it through.
export class ChartmetricAnalysisCallBudget {
  private callsMade = 0;

  constructor(private readonly maxCalls: number = DEFAULT_MAX_CALLS_PER_ANALYSIS) {}

  static fromEnv(env: ChartmetricUsageGuardEnv = process.env): ChartmetricAnalysisCallBudget {
    const parsed = Number.parseInt(env.CHARTMETRIC_MAX_CALLS_PER_ANALYSIS ?? "", 10);
    return new ChartmetricAnalysisCallBudget(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CALLS_PER_ANALYSIS);
  }

  tryConsume(): BudgetCheckResult {
    if (this.callsMade >= this.maxCalls) {
      return { allowed: false, reason: "max_calls_per_analysis_reached" };
    }
    this.callsMade += 1;
    return { allowed: true };
  }
}

interface CreditWindow {
  used: number;
  resetAt: number;
}

// Tracks reported-or-estimated credits consumed within rolling daily/monthly
// windows and refuses new calls once a configured limit is reached. A
// reached limit skips Chartmetric and preserves the existing pipeline
// result (issue #142 section 8).
export class ChartmetricCreditBudget {
  private daily: CreditWindow;
  private monthly: CreditWindow;

  constructor(
    private readonly dailyLimit: number | null,
    private readonly monthlyLimit: number | null,
    now: number = Date.now()
  ) {
    this.daily = { used: 0, resetAt: now + DAY_MS };
    this.monthly = { used: 0, resetAt: now + MONTH_MS };
  }

  static fromEnv(env: ChartmetricUsageGuardEnv = process.env): ChartmetricCreditBudget {
    return new ChartmetricCreditBudget(parseLimit(env.CHARTMETRIC_DAILY_CREDIT_LIMIT), parseLimit(env.CHARTMETRIC_MONTHLY_CREDIT_LIMIT));
  }

  canSpend(now: number = Date.now()): BudgetCheckResult {
    this.rollWindows(now);
    if (this.dailyLimit !== null && this.daily.used >= this.dailyLimit) {
      return { allowed: false, reason: "daily_credit_limit_reached" };
    }
    if (this.monthlyLimit !== null && this.monthly.used >= this.monthlyLimit) {
      return { allowed: false, reason: "monthly_credit_limit_reached" };
    }
    return { allowed: true };
  }

  record(credits: number, now: number = Date.now()): void {
    this.rollWindows(now);
    this.daily.used += credits;
    this.monthly.used += credits;
  }

  private rollWindows(now: number): void {
    if (now >= this.daily.resetAt) {
      this.daily = { used: 0, resetAt: now + DAY_MS };
    }
    if (now >= this.monthly.resetAt) {
      this.monthly = { used: 0, resetAt: now + MONTH_MS };
    }
  }
}

function parseLimit(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

// Process-lifetime singleton so credit limits are enforced across separate
// analysis requests, not just within one pipeline run.
export const defaultChartmetricCreditBudget: ChartmetricCreditBudget = ChartmetricCreditBudget.fromEnv();
