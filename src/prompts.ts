import type { ArtistInput, ArtistProfile } from "./schemas.js";
import type { BookingSearchInput } from "./booking/types.js";

export function buildOpportunityPrompt(input: ArtistInput, profile: ArtistProfile): string {
  const focus =
    input.mode === "booking"
      ? "venues, associations, festivals, local artists, first-part opportunities, promoters and bookers"
      : "playlists, blogs, media, curators, influencers and relevant music communities";

  return [
    "You are Artist Radar, a research assistant for independent music artists.",
    `Find up to ${input.limit} actionable ${input.mode} opportunities focused on ${focus}.`,
    "",
    "Artist profile:",
    `- Artist: ${input.artist}`,
    `- City: ${input.city}`,
    `- Genre: ${input.genre}`,
    `- Target: ${input.target ?? "not specified"}`,
    `- Links: ${input.links.length > 0 ? input.links.join(", ") : "none provided"}`,
    "",
    "Normalized artist profile:",
    JSON.stringify(profile, null, 2),
    "",
    "Data quality rules:",
    "- Do not invent emails, phone numbers, social handles or contact names.",
    "- If a contact is uncertain, set contact to null.",
    "- If a source URL is uncertain, set source_url to null.",
    "- Prefer fewer strong opportunities over weak filler.",
    "- Make uncertainty clear in reason when relevant.",
    "- Scores must be integers from 0 to 100 and reflect realistic relevance.",
    "",
    "Return only JSON with this shape:",
    '{ "opportunities": [{ "name": string, "type": string, "city": string|null, "country": string|null, "source_url": string|null, "contact": string|null, "reason": string, "score": number, "suggested_message": string }] }'
  ].join("\n");
}

export interface BookingSearchExtractionPromptInput {
  input: BookingSearchInput;
  sourceUrl: string | null;
  sourceText: string;
  sourceTitle?: string | null;
  outputLanguage?: "fr" | "en";
}

export function buildBookingSearchExtractionPrompt(details: BookingSearchExtractionPromptInput): string {
  const outputLanguage = details.outputLanguage ?? inferBookingOutputLanguage(details.input);

  return [
    "You are Artist Radar Booking Search, a strict source-grounded extractor for live booking opportunities.",
    "Extract only booking targets that are supported by the provided source text.",
    "",
    "Artist context:",
    `- Artist: ${details.input.artist}`,
    `- City: ${details.input.city}`,
    `- Genre: ${details.input.genre}`,
    `- Target: ${details.input.target ?? "not specified"}`,
    `- Artist links: ${details.input.links.length > 0 ? details.input.links.join(", ") : "none provided"}`,
    "",
    "Source:",
    `- URL: ${details.sourceUrl ?? "unknown"}`,
    `- Title: ${details.sourceTitle ?? "unknown"}`,
    "",
    "Quality rules:",
    "- Do not invent contacts, source URLs, event slots, deadlines, capacities or organizer names.",
    "- If a contact, URL, date, capacity or slot availability is uncertain, return null and add a warning.",
    "- Never mark a support slot as confirmed unless the source explicitly states it.",
    "- Add warning language when relevant: support slot is inferred, not confirmed; contact is generic, not programming-specific; genre match is weak; venue capacity may be too large for headline; source does not expose public contact.",
    "- Prefer fewer strong, actionable targets over generic filler.",
    "- Every result must include explicit evidence from the source text.",
    "- Every result must include a realistic confidence score from 0 to 100.",
    "- Reasons must explain genre fit, size/capacity fit when available, contact confidence and support-slot uncertainty.",
    "- Recommended next action must be one of: booking_contact, support_slot, application, research.",
    `- User-facing reason, warnings and recommendedNextAction must be written in ${outputLanguage === "fr" ? "French" : "English"}.`,
    "",
    "Return only JSON with this shape:",
    JSON.stringify({
      opportunities: [{
        name: "string",
        category: "venue | bar | association | collective | festival | springboard | open_call | promoter | booking_agency | live_producer | event",
        city: "string|null",
        country: "string|null",
        sourceUrl: "string|null",
        contact: "string|null",
        contactType: "email | contact_form | social | phone | unknown",
        score: "number 0-100",
        confidence: "number 0-100",
        reason: "string",
        warnings: ["string"],
        recommendedNextAction: "string",
        evidence: ["short sourced evidence strings"]
      }]
    }, null, 2),
    "",
    "Source text:",
    details.sourceText
  ].join("\n");
}

function inferBookingOutputLanguage(input: BookingSearchInput): "fr" | "en" {
  const context = [input.city, input.target ?? "", input.artistProfile?.country ?? ""].join(" ").toLowerCase();
  return /\b(france|paris|lyon|marseille|bordeaux|nantes|lille|rennes|toulouse|strasbourg)\b/.test(context)
    ? "fr"
    : "en";
}
