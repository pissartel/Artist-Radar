import { describe, expect, it, vi } from "vitest";
import { extractYouTubeChannelIdentifier, getYouTubeChannelStats } from "../src/services/youtubeService.js";

describe("youtubeService", () => {
  it("parses YouTube channel URL variants", () => {
    expect(extractYouTubeChannelIdentifier("https://www.youtube.com/@TUESDAYFALL")).toEqual({
      type: "handle",
      value: "@TUESDAYFALL"
    });
    expect(extractYouTubeChannelIdentifier("https://youtube.com/@TUESDAYFALL")).toEqual({
      type: "handle",
      value: "@TUESDAYFALL"
    });
    expect(extractYouTubeChannelIdentifier("https://www.youtube.com/channel/CHANNEL_ID")).toEqual({
      type: "channel",
      value: "CHANNEL_ID"
    });
    expect(extractYouTubeChannelIdentifier("https://www.youtube.com/c/CustomName")).toEqual({
      type: "custom",
      value: "CustomName"
    });
    expect(extractYouTubeChannelIdentifier("https://www.youtube.com/user/UserName")).toEqual({
      type: "user",
      value: "UserName"
    });
  });

  it("returns null when API key is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(getYouTubeChannelStats("https://www.youtube.com/@TUESDAYFALL", {}, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns deterministic mock stats in MOCK_AI mode", async () => {
    const stats = await getYouTubeChannelStats("https://www.youtube.com/@TUESDAYFALL", { MOCK_AI: "true" });

    expect(stats).toMatchObject({
      youtubeChannelId: "mock-youtube-channel",
      youtubeTitle: "Tuesday Fall",
      youtubeHandle: "@TUESDAYFALL",
      youtubeSubscribers: 2400,
      youtubeTotalViews: 185000,
      youtubeVideoCount: 24
    });
  });

  it("maps YouTube API channel stats", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      async json() {
        return {
          items: [
            {
              id: "channel-1",
              snippet: { title: "Tuesday Fall", customUrl: "@TUESDAYFALL" },
              statistics: { subscriberCount: "1234", viewCount: "56789", videoCount: "12" }
            }
          ]
        };
      }
    } as Response);

    const stats = await getYouTubeChannelStats(
      "https://www.youtube.com/channel/channel-1",
      { YOUTUBE_API_KEY: "key" },
      fetchImpl
    );

    expect(stats).toEqual({
      youtubeChannelId: "channel-1",
      youtubeTitle: "Tuesday Fall",
      youtubeHandle: "@TUESDAYFALL",
      youtubeSubscribers: 1234,
      youtubeTotalViews: 56789,
      youtubeVideoCount: 12,
      youtubeUrl: "https://www.youtube.com/channel/channel-1"
    });
  });
});
