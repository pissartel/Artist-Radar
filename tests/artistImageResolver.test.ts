import { describe, expect, it } from "vitest";
import { resolveArtistImage } from "../src/services/artistImageResolver.js";

describe("resolveArtistImage", () => {
  it("selects the Spotify image when available", () => {
    const result = resolveArtistImage({
      spotify: { imageUrl: "https://image.example/artist.jpg" }
    });

    expect(result).toEqual({
      imageUrl: "https://image.example/artist.jpg",
      imageSource: "spotify",
      imageConfidence: 0.9
    });
  });

  it("keeps imageUrl null when no trusted image source exists", () => {
    expect(resolveArtistImage({})).toEqual({
      imageUrl: null,
      imageSource: null,
      imageConfidence: null
    });

    expect(resolveArtistImage({ spotify: null })).toEqual({
      imageUrl: null,
      imageSource: null,
      imageConfidence: null
    });

    expect(resolveArtistImage({ spotify: { imageUrl: null } })).toEqual({
      imageUrl: null,
      imageSource: null,
      imageConfidence: null
    });
  });
});
