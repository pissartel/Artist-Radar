import { describe, expect, it } from "vitest";
import {
  GENRE_FAMILIES,
  KNOWN_MUSIC_GENRES,
  cleanArtistGenres,
  evaluateGenreCompatibility
} from "../src/modules/genreCleaner.js";

describe("cleanArtistGenres", () => {
  it("removes non-genre and location/language tags", () => {
    const result = cleanArtistGenres(
      ["singer", "songwriter", "ukulele", "hungarian", "magyar", "pop punk", "punk rock"],
      ["pop punk"]
    );

    expect(result.genres).toEqual(["pop punk", "punk rock"]);
    expect(result.discardedTags).toEqual(expect.arrayContaining(["singer", "songwriter", "ukulele", "hungarian", "magyar"]));
  });

  it("keeps pop punk family genres", () => {
    const result = cleanArtistGenres(["pop punk", "punk", "punk rock", "emo", "easycore"], ["pop punk"]);

    expect(result.genres).toEqual(["pop punk", "easycore", "emo", "punk rock"]);
  });

  it("does not keep alternative alone for pop punk", () => {
    const result = cleanArtistGenres(["alternative"], ["pop punk"]);

    expect(result.genres).toEqual([]);
    expect(result.discardedTags).toEqual(["alternative"]);
  });

  it("keeps alternative when combined with emo evidence", () => {
    const result = cleanArtistGenres(["alternative", "emo"], ["pop punk"]);

    expect(result.genres).toEqual(["emo", "alternative"]);
  });

  it("accepts punk rock, emo and easycore for pop punk", () => {
    const result = evaluateGenreCompatibility(["pop punk"], ["punk rock", "emo", "easycore"]);

    expect(result.compatible).toBe(true);
    expect(result.level).toBe("close");
    expect(result.matchedGenres).toEqual(["punk rock", "emo", "easycore"]);
  });

  it("rejects pop, rock and europop alone for pop punk", () => {
    expect(evaluateGenreCompatibility(["pop punk"], ["pop"]).compatible).toBe(false);
    expect(evaluateGenreCompatibility(["pop punk"], ["rock"]).compatible).toBe(false);
    expect(evaluateGenreCompatibility(["pop punk"], ["europop"]).compatible).toBe(false);
  });

  it("accepts alternative rock only with emo or punk evidence for pop punk", () => {
    expect(evaluateGenreCompatibility(["pop punk"], ["alternative rock"]).compatible).toBe(false);

    const result = evaluateGenreCompatibility(["pop punk"], ["alternative rock", "emo"]);
    expect(result.compatible).toBe(true);
    expect(result.level).toBe("close");
  });

  it("accepts metal family genres for metalcore", () => {
    expect(evaluateGenreCompatibility(["metalcore"], ["deathcore"]).compatible).toBe(true);
    expect(evaluateGenreCompatibility(["metalcore"], ["hardcore"]).compatible).toBe(true);
    expect(evaluateGenreCompatibility(["metalcore"], ["metal"]).compatible).toBe(true);
  });

  it("accepts electronic family genres for techno but not hip hop", () => {
    expect(evaluateGenreCompatibility(["techno"], ["house"]).compatible).toBe(true);
    expect(evaluateGenreCompatibility(["techno"], ["electronic"]).compatible).toBe(true);
    expect(evaluateGenreCompatibility(["techno"], ["hip hop"]).compatible).toBe(false);
  });

  it("accepts rap, trap and drill for hip hop", () => {
    const result = evaluateGenreCompatibility(["hip hop"], ["rap", "trap", "drill"]);

    expect(result.compatible).toBe(true);
    expect(result.matchedGenres).toEqual(["rap", "trap", "drill"]);
  });

  it("removes French city and language tags when target country is France", () => {
    const result = cleanArtistGenres(["Paris", "Lyon", "French", "pop punk"], ["pop punk"], {
      targetCountry: "France"
    });

    expect(result.genres).toEqual(["pop punk"]);
    expect(result.locationTags).toEqual(["paris", "lyon", "french"]);
  });

  it("removes German city and language tags through context", () => {
    const result = cleanArtistGenres(["Berlin", "German", "techno"], ["techno"], {
      targetCountry: "Germany"
    });

    expect(result.genres).toEqual(["techno"]);
    expect(result.locationTags).toEqual(["berlin", "german"]);
  });

  it("removes Hungarian language and country tags as location or language evidence", () => {
    const result = cleanArtistGenres(["hungarian", "magyar", "hungary", "pop"], ["pop"], {});

    expect(result.genres).toEqual(["pop"]);
    expect(result.locationTags).toEqual(["hungarian", "magyar", "hungary"]);
  });

  it("derives known music genres from the genre family map", () => {
    const familyGenres = Object.values(GENRE_FAMILIES).flat();

    expect([...KNOWN_MUSIC_GENRES].sort()).toEqual([...new Set(familyGenres)].sort());
  });
});
