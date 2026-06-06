import type { ArtistInput, ArtistProfile } from "./schemas.js";

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
