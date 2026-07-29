import { describe, expect, it } from "vitest";
import {
  ChartmetricAnalysisCallBudget,
  ChartmetricCreditBudget
} from "../src/features/artist-enrichment/chartmetric/chartmetric.usage-guard.js";

describe("ChartmetricAnalysisCallBudget", () => {
  it("allows up to maxCalls and then reports max_calls_per_analysis_reached", () => {
    const budget = new ChartmetricAnalysisCallBudget(1);
    expect(budget.tryConsume()).toEqual({ allowed: true });
    expect(budget.tryConsume()).toEqual({ allowed: false, reason: "max_calls_per_analysis_reached" });
  });

  it("defaults to 1 call per analysis when unset or invalid", () => {
    expect(ChartmetricAnalysisCallBudget.fromEnv({}).tryConsume()).toEqual({ allowed: true });
    const budget = ChartmetricAnalysisCallBudget.fromEnv({ CHARTMETRIC_MAX_CALLS_PER_ANALYSIS: "not-a-number" });
    budget.tryConsume();
    expect(budget.tryConsume()).toEqual({ allowed: false, reason: "max_calls_per_analysis_reached" });
  });
});

describe("ChartmetricCreditBudget", () => {
  it("blocks new spending once the daily limit is reached", () => {
    const budget = new ChartmetricCreditBudget(2, null);
    expect(budget.canSpend()).toEqual({ allowed: true });
    budget.record(2);
    expect(budget.canSpend()).toEqual({ allowed: false, reason: "daily_credit_limit_reached" });
  });

  it("blocks new spending once the monthly limit is reached even under the daily limit", () => {
    const budget = new ChartmetricCreditBudget(100, 2);
    budget.record(2);
    expect(budget.canSpend()).toEqual({ allowed: false, reason: "monthly_credit_limit_reached" });
  });

  it("resets the daily window after it elapses", () => {
    const start = 1_000_000;
    const budget = new ChartmetricCreditBudget(1, null, start);
    budget.record(1, start);
    expect(budget.canSpend(start)).toEqual({ allowed: false, reason: "daily_credit_limit_reached" });

    const nextDay = start + 25 * 60 * 60 * 1000;
    expect(budget.canSpend(nextDay)).toEqual({ allowed: true });
  });

  it("allows unlimited spending when no limit is configured", () => {
    const budget = new ChartmetricCreditBudget(null, null);
    budget.record(1_000_000);
    expect(budget.canSpend()).toEqual({ allowed: true });
  });
});
