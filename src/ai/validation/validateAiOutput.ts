import type { ZodType } from "zod";

/**
 * Result of validating a single AI output against a Zod schema.
 *
 * `lowConfidence` is set whenever validation fails, so callers can decide to
 * either drop the result or surface it with a visible warning instead of
 * silently trusting malformed AI output.
 */
export interface AiValidationResult<T> {
  success: boolean;
  data: T | null;
  warnings: string[];
  lowConfidence: boolean;
}

/**
 * Result of validating a list of AI outputs (e.g. an array of opportunities
 * or similar artists). Invalid items are dropped rather than allowed to
 * silently reach the final output; each drop produces a warning explaining
 * why.
 */
export interface AiValidationListResult<T> {
  valid: T[];
  warnings: string[];
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Validates a single AI output against a schema. Use this for AI responses
 * that represent one structured object (e.g. a single domain result).
 */
export function validateAiOutput<T>(
  schema: ZodType<T>,
  rawOutput: unknown,
  options: { label?: string } = {}
): AiValidationResult<T> {
  const label = options.label ?? "AI output";
  const result = schema.safeParse(rawOutput);

  if (!result.success) {
    return {
      success: false,
      data: null,
      warnings: formatIssues(result.error.issues).map((issue) => `${label} failed validation: ${issue}`),
      lowConfidence: true
    };
  }

  return { success: true, data: result.data, warnings: [], lowConfidence: false };
}

/**
 * Validates a list of AI outputs item by item, keeping only the items that
 * pass validation. This prevents a single malformed item (e.g. one
 * opportunity missing evidence) from invalidating an otherwise-usable
 * response.
 */
export function validateAiOutputList<T>(
  schema: ZodType<T>,
  rawItems: unknown[],
  options: { label?: string } = {}
): AiValidationListResult<T> {
  const label = options.label ?? "AI output item";
  const valid: T[] = [];
  const warnings: string[] = [];

  rawItems.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
      return;
    }

    warnings.push(`${label} #${index + 1} rejected: ${formatIssues(result.error.issues).join("; ")}`);
  });

  return { valid, warnings };
}

/**
 * Parses a raw JSON string returned by an OpenAI call and validates it
 * against a schema in one step. Malformed JSON is treated as a validation
 * failure rather than being allowed to throw and crash the pipeline.
 */
export function parseAndValidateAiJson<T>(
  schema: ZodType<T>,
  rawContent: string,
  options: { label?: string } = {}
): AiValidationResult<T> {
  const label = options.label ?? "AI output";
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      data: null,
      warnings: [`${label} was not valid JSON: ${message}`],
      lowConfidence: true
    };
  }

  return validateAiOutput(schema, parsedJson, options);
}
