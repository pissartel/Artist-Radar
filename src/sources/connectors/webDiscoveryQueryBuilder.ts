import type { OrganizationEntityType } from "../organization.schema.js";

// The organization types this connector is meant to surface: smaller
// bookers, managers and associations poorly represented in open databases
// (issue #126). LABEL/PROMOTER are included since the issue's example query
// families cover them too.
const DEFAULT_ORGANIZATION_TYPES: OrganizationEntityType[] = [
  "BOOKER",
  "PROMOTER",
  "MANAGER",
  "LABEL",
  "ASSOCIATION"
];

export interface OrganizationDiscoveryContext {
  genres: string[];
  artistCity?: string | null;
  artistCountry?: string | null;
  targetCities?: string[];
  organizationTypes?: OrganizationEntityType[];
  similarArtistNames?: string[];
  // Venue/festival names already discovered by other connectors, used to
  // find their organizer/booking contact.
  knownOrganizationNames?: string[];
}

export interface DiscoveryQuery {
  query: string;
  organizationTypeHint: OrganizationEntityType | null;
  genre: string | null;
  city: string | null;
}

interface QueryTemplateInput {
  genre: string | null;
  city: string | null;
  country: string | null;
}

const QUERY_TEMPLATES: Partial<Record<OrganizationEntityType, (input: QueryTemplateInput) => string | null>> = {
  BOOKER: ({ genre, city, country }) => {
    const location = city ?? country;
    if (!genre && !location) return null;
    return [genre, "booking agency", location].filter(Boolean).join(" ");
  },
  PROMOTER: ({ genre, city, country }) => {
    const location = city ?? country;
    if (!genre && !location) return null;
    return ["promoter", genre, location].filter(Boolean).join(" ");
  },
  ASSOCIATION: ({ genre, city, country }) => {
    const location = city ?? country;
    if (!genre && !location) return null;
    return ["association concerts", genre, location].filter(Boolean).join(" ");
  },
  MANAGER: ({ genre, country }) => {
    if (!genre && !country) return null;
    return ["management artistes", genre, country].filter(Boolean).join(" ");
  },
  LABEL: ({ genre, country }) => {
    if (!genre && !country) return null;
    return ["label", genre, country, "demo submission"].filter(Boolean).join(" ");
  }
};

export function buildOrganizationDiscoveryQueries(context: OrganizationDiscoveryContext): DiscoveryQuery[] {
  const genres = uniqueStrings(context.genres);
  const cities = uniqueStrings([context.artistCity ?? "", ...(context.targetCities ?? [])]);
  const country = context.artistCountry?.trim() || null;
  const organizationTypes = context.organizationTypes?.length ? context.organizationTypes : DEFAULT_ORGANIZATION_TYPES;

  const queries: DiscoveryQuery[] = [];

  for (const type of organizationTypes) {
    const template = QUERY_TEMPLATES[type];
    if (!template) continue;

    for (const genre of genres.length > 0 ? genres : [null]) {
      for (const city of cities.length > 0 ? cities : [null]) {
        const query = template({ genre, city, country });
        if (query) {
          queries.push({ query, organizationTypeHint: type, genre, city });
        }
      }
    }
  }

  for (const similarArtist of uniqueStrings(context.similarArtistNames ?? [])) {
    queries.push({ query: `${similarArtist} booking`, organizationTypeHint: "BOOKER", genre: null, city: null });
  }

  for (const knownName of uniqueStrings(context.knownOrganizationNames ?? [])) {
    queries.push({ query: `${knownName} organizer contact`, organizationTypeHint: null, genre: null, city: null });
  }

  return dedupeQueries(queries);
}

function dedupeQueries(queries: DiscoveryQuery[]): DiscoveryQuery[] {
  const seen = new Set<string>();
  return queries.filter((entry) => {
    const key = entry.query.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
