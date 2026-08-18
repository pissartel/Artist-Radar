import OpenAI from "openai";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import { TtlCache } from "../utils/ttlCache.js";

const searchCache = new TtlCache<string, WebSearchResult[]>(6 * 60 * 60 * 1_000);

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "entityType", "description", "country", "websiteUrl", "contactUrl", "publicEmail", "roster", "genres", "evidenceUrl"],
        properties: {
          name: { type: "string" },
          entityType: { type: "string", enum: ["booker", "booking_agency", "promoter"] },
          description: { type: "string" },
          country: { type: ["string", "null"] },
          websiteUrl: { type: "string" },
          contactUrl: { type: ["string", "null"] },
          publicEmail: { type: ["string", "null"] },
          roster: { type: "array", items: { type: "string" } },
          genres: { type: "array", items: { type: "string" } },
          evidenceUrl: { type: "string" }
        }
      }
    }
  }
} as const;

interface OpenAIBookerCandidate {
  name: string;
  entityType: "booker" | "booking_agency" | "promoter";
  description: string;
  country: string | null;
  websiteUrl: string;
  contactUrl: string | null;
  publicEmail: string | null;
  roster: string[];
  genres: string[];
  evidenceUrl: string;
}

export class OpenAIBookerSearchProvider implements WebSearchProvider {
  readonly providerName = "openai_booker_web_search";
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model = process.env.OPENAI_BOOKER_MODEL ?? "gpt-5.4-mini") {
    this.client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
    const cacheKey = `${this.model}:${limit}:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;
    const response = await this.client.responses.create({
      model: this.model,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      input: [
        "Find real, currently active bookers, booking agencies, tour promoters or live producers matching the artist brief below.",
        "Prioritize the requested country, explicit genre/roster evidence, comparable artists, emerging-artist accessibility, and official contact details.",
        "Research beyond the first generic search results: inspect comparable artists' live representation, relevant tour rosters, and adjacent punk/hardcore/easycore scenes until additional searches are unlikely to improve the shortlist.",
        "A candidate with no exact genre or genuinely adjacent roster evidence must be omitted, even if it is a real generalist agency.",
        "Reject editorial articles, directories, venues, labels without booking activity, foreign agencies without explicit international access, and major agencies whose roster scale is unrealistic for an emerging artist.",
        "Use official organization/roster/contact pages wherever possible. Never invent a person, email, roster member, country or URL.",
        `Return at most ${limit} candidates.`,
        query
      ].join("\n"),
      text: { format: { type: "json_schema", name: "booker_candidates", schema: RESPONSE_SCHEMA, strict: true } }
    });
    if (!response.output_text) return [];
    let parsed: { candidates?: OpenAIBookerCandidate[] };
    try { parsed = JSON.parse(response.output_text) as { candidates?: OpenAIBookerCandidate[] }; } catch { return []; }
    const results = (parsed.candidates ?? []).flatMap((candidate) => {
      if (!isHttpUrl(candidate.websiteUrl) || !isHttpUrl(candidate.evidenceUrl)) return [];
      const rosterText = candidate.roster.length > 0 ? `Roster: ${candidate.roster.join(", ")}.` : "";
      const genreText = candidate.genres.length > 0 ? `Genres: ${candidate.genres.join(", ")}.` : "";
      const professionalEvidence = candidate.entityType === "promoter"
        ? "Concert promoter that organizes concerts."
        : candidate.entityType === "booker"
          ? "Independent booker for touring artists."
          : "Booking agency representing a roster of artists.";
      const contactText = candidate.publicEmail ? `Booking contact: ${candidate.publicEmail}.` : "";
      return [{
        title: candidate.name,
        url: candidate.websiteUrl,
        snippet: `${professionalEvidence} Based in ${candidate.country ?? "an unverified country"}. ${candidate.description} ${rosterText} ${genreText} ${contactText}`,
        markdown: null,
        links: [candidate.contactUrl, candidate.evidenceUrl].filter((url): url is string => Boolean(url && isHttpUrl(url))),
        confidence: 0.9,
        sourceProvider: this.providerName
      }];
    });
    searchCache.set(cacheKey, results);
    return results;
  }
}

function isHttpUrl(value: string): boolean {
  try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
}
