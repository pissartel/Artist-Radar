import { describe, expect, it } from "vitest";
import {
  buildCliArtistInput,
  buildWebBookingArtistInput,
} from "../src/artistInputBuilders.js";

describe("CLI/web booking ArtistInput parity", () => {
  it("builds identical booking input for Tuesday Fall / Paris / France", () => {
    const cliInput = buildCliArtistInput("booking", {
      artist: "Tuesday Fall",
      city: "Paris",
      genre: "pop punk",
      target: "France",
      limit: 20,
    });
    const webInput = buildWebBookingArtistInput({
      artistName: "Tuesday Fall",
      location: "Paris",
      genre: "pop punk",
      referenceCountry: "France",
    });

    expect(webInput).toEqual(cliInput);
    expect(webInput).toMatchObject({
      mode: "booking",
      artist: "Tuesday Fall",
      city: "Paris",
      genre: "pop punk",
      target: "France",
      limit: 20,
    });
  });
});
