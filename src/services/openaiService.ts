import OpenAI from "openai";
import { OpportunitySearchResultSchema, type OpportunitySearchResult } from "../schemas.js";
import { normalizeOpportunityUrls } from "./urlNormalization.js";

export interface OpportunityGenerator {
  generate(prompt: string): Promise<OpportunitySearchResult>;
}

export class OpenAIOpportunityGenerator implements OpportunityGenerator {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini") {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required. Add it to .env or export it in your shell.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(prompt: string): Promise<OpportunitySearchResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON only. Never invent contact information. Use null for uncertain contact and source URL values."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }

    return OpportunitySearchResultSchema.parse(normalizeOpportunityUrls(JSON.parse(content)));
  }
}
