import { describe, expect, it } from "vitest";
import { industryEvaluationMetrics } from "../src/industry/evaluation.js";
describe("industry offline evaluation", () => {
  it("reports Recall@10 and Recall@20", () => {
    expect(industryEvaluationMetrics(["A", "B"], ["A", "C"])).toEqual({ recallAt10: .5, recallAt20: .5 });
  });
});
