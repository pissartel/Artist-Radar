import { z } from "zod";
import { AiEvidenceSchema } from "./evidence.schema.js";

/**
 * Raw AI output schema for a single booking opportunity, before it is mapped
 * into the app's internal BookingOpportunity model. Requires at least one
 * evidence entry: an AI-suggested opportunity with no cited source is not
 * usable and must fail validation rather than reach the final output.
 */
export const AiBookingOpportunitySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable(),
  relevanceScore: z.number().min(0).max(100),
  genreCompatibility: z.number().min(0).max(100),
  reason: z.string().trim().min(1),
  evidence: z.array(AiEvidenceSchema).min(1, "at least one evidence entry is required"),
  contact: z.string().trim().min(1).nullable(),
  risks: z.array(z.string().trim().min(1)).default([])
});

export type AiBookingOpportunity = z.infer<typeof AiBookingOpportunitySchema>;

export const AiBookingOpportunityListSchema = z.object({
  opportunities: z.array(AiBookingOpportunitySchema)
});

export type AiBookingOpportunityList = z.infer<typeof AiBookingOpportunityListSchema>;
