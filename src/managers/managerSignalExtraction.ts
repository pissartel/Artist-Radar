import type { SimilarArtist } from "../schemas.js";
import type { ManagementRelationshipStatus, ManagerEntityType } from "./types.js";

const COMPANY_PATTERN = /\b(artist management company|music management company|management agency|management firm|artist management|management roster)\b/i;
const PERSON_PATTERN = /\b(?:artist|music|personal|career) manager\b|\bmanager (?:for|of)\b/i;
const PROFESSIONAL_EVIDENCE = /\b(manages?|managed by|management for|clients?|roster|represents?|representation|management credits?)\b/i;
const FORMER_RELATIONSHIP = /\b(former(?:ly)? managed|former manager|previously managed|managed .* (?:until|from)\b|ex-manager)\b/i;
const CURRENT_RELATIONSHIP = /\b(current(?:ly)? managed|current manager|is managed by|manages? (?:the |artist )?|management for|represents?)\b/i;
const INACTIVE_PATTERN = /\b(no longer active|ceased operations?|closed down|dissolved|inactive since|defunct)\b/i;
const RECENT_YEAR_PATTERN = /\b(20[0-9]{2})\b/g;
const OPEN_PATTERN = /\b(accept(?:s|ing)? (?:new artists?|submissions?)|submit (?:your )?(?:artist|music|epk)|open to new clients?)\b/i;
const CLOSED_PATTERN = /\b(not (?:currently )?accepting|closed (?:to|for) submissions?|roster is full|not taking new clients?)\b/i;
const EMERGING_PATTERN = /\b(emerging|developing|independent|unsigned|early[- ]career|new talent|grassroots) artists?\b/i;
const LARGE_PATTERN = /\b(major management|global roster|worldwide roster|multinational|superstar clients?)\b/i;
const SMALL_PATTERN = /\b(boutique management|small roster|independent manager|emerging artists?|developing artists?)\b/i;
const ROSTER_PATTERN = /\b(?:roster|clients?|artists?|represents?)\s*[:\-]\s*([^.;\n]{3,240})/i;

export function classifyManagerEntityType(text: string): ManagerEntityType | null {
  if (!PROFESSIONAL_EVIDENCE.test(text)) return null;
  if (COMPANY_PATTERN.test(text)) return "management_company";
  if (PERSON_PATTERN.test(text)) return "manager";
  return null;
}

export function classifyPotentialManagerEntityType(text: string): ManagerEntityType | null {
  if (COMPANY_PATTERN.test(text)) return "management_company";
  if (PERSON_PATTERN.test(text) || /\bmanager\b/i.test(text)) return "manager";
  return null;
}

export function extractManagementRelationshipStatus(text: string): ManagementRelationshipStatus {
  if (FORMER_RELATIONSHIP.test(text)) return "former";
  if (CURRENT_RELATIONSHIP.test(text)) return "current";
  return "unknown";
}

export function extractManagerActivity(text: string, now = new Date()): boolean | null {
  if (INACTIVE_PATTERN.test(text)) return false;
  const years = [...text.matchAll(RECENT_YEAR_PATTERN)].map((match) => Number(match[1]));
  return years.some((year) => year >= now.getFullYear() - 2) ? true : null;
}

export function extractManagerRoster(text: string): string[] {
  const match = text.match(ROSTER_PATTERN);
  if (!match) return [];
  return match[1]!.split(/,|;|&| and /i).map((value) => value.trim())
    .filter((value) => value.length > 1 && value.length < 70 && /^[A-ZÀ-Ý0-9]/.test(value)).slice(0, 20);
}

export function findManagedSimilarArtists(text: string, artists: SimilarArtist[]): SimilarArtist[] {
  const lower = text.toLowerCase();
  return artists.filter((artist) => artist.name.trim().length > 2 && lower.includes(artist.name.trim().toLowerCase()));
}

export function extractManagerAudienceLevel(text: string, artists: SimilarArtist[]): "small" | "medium" | "large" | "unknown" {
  if (LARGE_PATTERN.test(text)) return "large";
  if (SMALL_PATTERN.test(text)) return "small";
  return artists.find((artist) => artist.artistTier && artist.artistTier !== "unknown")?.artistTier ?? "unknown";
}

export function extractManagerServices(text: string): string[] {
  const services = ["career development", "touring", "marketing", "brand partnerships", "release strategy", "publishing"];
  return services.filter((service) => text.toLowerCase().includes(service));
}

export function extractManagerSubmissionPolicy(text: string, links: string[]): { acceptsSubmissions: boolean | null; contactUrl: string | null } {
  if (CLOSED_PATTERN.test(text)) return { acceptsSubmissions: false, contactUrl: null };
  if (!OPEN_PATTERN.test(text)) return { acceptsSubmissions: null, contactUrl: null };
  return {
    acceptsSubmissions: true,
    contactUrl: links.find((link) => /^https?:\/\//i.test(link) && /submit|apply|contact|epk/i.test(link)) ?? null
  };
}

export function worksWithEmergingArtists(text: string): boolean {
  return EMERGING_PATTERN.test(text);
}
