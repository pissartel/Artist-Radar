import { z } from "zod";
import { AiEvidenceSchema } from "./evidence.schema.js";

export const AiArtistSizeTierSchema = z.enum(["small", "medium", "large", "unknown"]);

export type AiArtistSizeTier = z.infer<typeof AiArtistSizeTierSchema>;

/** How closely a candidate's genre matches the searching artist's genre, per issue #46. */
export const AiGenreCompatibilitySchema = z.enum(["strong", "medium", "weak", "reject"]);

export type AiGenreCompatibility = z.infer<typeof AiGenreCompatibilitySchema>;

/** How close a candidate's scene/market is to the searching artist's city/target. */
export const AiGeographicRelevanceSchema = z.enum(["local", "regional", "national", "international", "unknown"]);

export type AiGeographicRelevance = z.infer<typeof AiGeographicRelevanceSchema>;

/** Booking/promo usefulness bucket a candidate falls into, per issue #46's prompt design. */
export const AiSimilarArtistCategorySchema = z.enum([
  "musically_similar",
  "scene_adjacent",
  "commercially_useful",
  "large_reference",
  "rejected"
]);

export type AiSimilarArtistCategory = z.infer<typeof AiSimilarArtistCategorySchema>;

/**
 * Raw AI output schema for a single similar artist suggestion, before it is
 * mapped into the app's internal SimilarArtist model.
 *
 * An artist can be accepted (similarityScore, sizeTier, and evidence are
 * required) or rejected by the model (rejectionReason is required instead).
 * Either way, an accepted suggestion with no cited evidence is not usable
 * and must fail validation.
 */
export const AiSimilarArtistSchema = z
  .object({
    name: z.string().trim().min(1),
    genres: z.array(z.string().trim().min(1)).default([]),
    city: z.string().trim().min(1).nullable().optional(),
    country: z.string().trim().min(1).nullable().optional(),
    similarityScore: z.number().min(0).max(100).nullable(),
    sizeTier: AiArtistSizeTierSchema.nullable(),
    genreCompatibility: AiGenreCompatibilitySchema,
    geographicRelevance: AiGeographicRelevanceSchema.nullable(),
    category: AiSimilarArtistCategorySchema,
    reason: z.string().trim().min(1),
    evidence: z.array(AiEvidenceSchema).default([]),
    rejectionReason: z.string().trim().min(1).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.genreCompatibility === "reject" || value.category === "rejected") {
      if (!value.rejectionReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejectionReason"],
          message: "rejectionReason is required when genreCompatibility is \"reject\" or category is \"rejected\""
        });
      }
      return;
    }

    if (value.rejectionReason) {
      return;
    }

    if (value.similarityScore === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["similarityScore"],
        message: "similarityScore is required unless the artist is rejected"
      });
    }

    if (value.sizeTier === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeTier"],
        message: "sizeTier is required unless the artist is rejected"
      });
    }

    if (value.evidence.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: "at least one evidence entry is required unless the artist is rejected"
      });
    }
  });

export type AiSimilarArtist = z.infer<typeof AiSimilarArtistSchema>;

export const AiSimilarArtistListSchema = z.object({
  similarArtists: z.array(AiSimilarArtistSchema)
});

export type AiSimilarArtistList = z.infer<typeof AiSimilarArtistListSchema>;
