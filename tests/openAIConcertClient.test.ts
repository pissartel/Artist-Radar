import { describe, expect, it, vi } from "vitest";
import { OpenAIConcertClient, type OpenAIResponsesClient } from "../src/providers/openaiConcerts/OpenAIConcertClient.js";

function validResultJson() {
  return JSON.stringify({
    artist: { requestedName: "The Slugz", resolvedName: "The Slugz", identityConfidence: 0.9, identityNotes: null },
    pastConcerts: [
      {
        eventName: "The Slugz live",
        date: "2026-03-01",
        venue: { name: "Le Klub", city: "Paris", region: null, country: "France", website: null },
        lineup: ["The Slugz"],
        eventType: "concert",
        status: "past",
        sources: [{ url: "https://venue.example/event", title: "Le Klub programme", sourceType: "venue_official" }],
        evidenceSummary: "Listed on the venue's own programming page.",
        modelConfidence: 0.9
      }
    ],
    upcomingConcerts: [],
    searchSummary: { pastConcertsFound: 1, upcomingConcertsFound: 0, noUpcomingConcertsFoundInCheckedSources: true, notes: null }
  });
}

function fakeResponse(outputText: string, citedUrls: string[] = []): { output_text: string; output: unknown[] } {
  return {
    output_text: outputText,
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: outputText,
            annotations: citedUrls.map((url) => ({ type: "url_citation", url, title: "Some title" }))
          }
        ]
      }
    ]
  };
}

function fakeClient(create: OpenAIResponsesClient["responses"]["create"]): OpenAIResponsesClient {
  return { responses: { create } };
}

/** Structured-output responses never populate message annotations — real citations only show up on the web_search_call item's action.sources (requires the `include` param). */
function fakeStructuredOutputResponse(outputText: string, searchedUrls: string[]): { output_text: string; output: unknown[] } {
  return {
    output_text: outputText,
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", sources: searchedUrls.map((url) => ({ type: "url", url })) } },
      { type: "message", content: [{ type: "output_text", text: outputText, annotations: [] }] }
    ]
  };
}

describe("OpenAIConcertClient", () => {
  it("accepts a valid structured response and extracts real cited URLs", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse(validResultJson(), ["https://venue.example/event"]));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-1", "prompt");

    expect(outcome).not.toBeNull();
    expect(outcome!.result.pastConcerts).toHaveLength(1);
    expect(outcome!.citedUrls.has("https://venue.example/event")).toBe(true);
    expect(client.diagnostics.apiCalls).toBe(1);
    expect(client.diagnostics.cacheMisses).toBe(1);
  });

  it("reuses a cached result for the same key without calling the API again", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse(validResultJson(), ["https://venue.example/event"]));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    await client.search("key-1", "prompt");
    await client.search("key-1", "prompt");

    expect(create).toHaveBeenCalledTimes(1);
    expect(client.diagnostics.cacheHits).toBe(1);
  });

  it("rejects malformed JSON output", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse("not json"));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-2", "prompt");

    expect(outcome).toBeNull();
    expect(client.diagnostics.malformedResponses).toBe(1);
  });

  it("rejects a response that fails Zod validation", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse(JSON.stringify({ artist: { requestedName: "X" } })));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-3", "prompt");

    expect(outcome).toBeNull();
    expect(client.diagnostics.malformedResponses).toBe(1);
  });

  it("rejects an empty output_text response", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "", output: [] });
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-4", "prompt");

    expect(outcome).toBeNull();
    expect(client.diagnostics.malformedResponses).toBe(1);
  });

  it("returns null and records an API error when the call throws", async () => {
    const create = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-5", "prompt");

    expect(outcome).toBeNull();
    expect(client.diagnostics.apiErrors).toBe(1);
  });

  it("does not treat a source URL missing from real citations as cited", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse(validResultJson(), ["https://different-domain.example/other"]));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-6", "prompt");

    expect(outcome!.citedUrls.has("https://venue.example/event")).toBe(false);
  });

  it("reads real citations from web_search_call.action.sources when message annotations are empty (Structured Outputs mode)", async () => {
    const create = vi.fn().mockResolvedValue(fakeStructuredOutputResponse(validResultJson(), ["https://venue.example/event?utm_source=openai"]));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    const outcome = await client.search("key-7", "prompt");

    // The model's claimed URL (https://venue.example/event, no query string)
    // must still match the tool's actual cited URL despite the tracking
    // suffix difference — this is the exact real-world mismatch found via
    // live testing that made every event get rejected before normalization.
    expect(outcome!.citedUrls.has("https://venue.example/event")).toBe(true);
  });

  it("passes include=web_search_call.action.sources on every request", async () => {
    const create = vi.fn().mockResolvedValue(fakeStructuredOutputResponse(validResultJson(), []));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeClient(create) });

    await client.search("key-8", "prompt");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ include: ["web_search_call.action.sources"] }));
  });
});
