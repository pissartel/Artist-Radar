// Issue #142: development-only validation report for the Chartmetric
// artist-audience enrichment integration. Run with:
//   npm run validate:chartmetric
//
// Requires CHARTMETRIC_REFRESH_TOKEN to be set (real credits are spent);
// otherwise prints a clear "not configured" message and exits.
//
// This script measures coverage and cost against a representative dataset —
// it never hardcodes expected artist metrics, only the artist names
// themselves, and reports whatever Chartmetric actually returns.
import "dotenv/config";
import { ChartmetricArtistEnrichmentProvider } from "../src/features/artist-enrichment/chartmetric/chartmetric.service.js";
import { ChartmetricAnalysisCallBudget, ChartmetricCreditBudget } from "../src/features/artist-enrichment/chartmetric/chartmetric.usage-guard.js";
import type { ArtistEnrichmentInput } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

interface ValidationArtist {
  label: string;
  input: ArtistEnrichmentInput;
}

// Representative dataset per the issue: Tuesday Fall plus a spread of
// small/medium/large artists, two ambiguous names, and one expected miss.
// Real-world Spotify/genre/location details are used as matching evidence
// exactly like the production pipeline would supply them; no metric values
// are hardcoded anywhere in this file.
const VALIDATION_DATASET: ValidationArtist[] = [
  { label: "Tuesday Fall (required)", input: { artistName: "Tuesday Fall", genres: ["indie rock"] } },

  { label: "small #1", input: { artistName: "Broad Peak", genres: ["pop punk"], city: "Lyon", country: "France" } },
  { label: "small #2", input: { artistName: "Fawn Season", genres: ["dream pop"], city: "Bristol", country: "UK" } },
  { label: "small #3", input: { artistName: "Salt Cabin", genres: ["folk"], city: "Portland", country: "USA" } },
  { label: "small #4", input: { artistName: "Night Errands", genres: ["indie rock"], city: "Berlin", country: "Germany" } },
  { label: "small #5", input: { artistName: "Paper Weather", genres: ["shoegaze"], city: "Glasgow", country: "UK" } },

  { label: "medium #1", input: { artistName: "Wet Leg", genres: ["indie rock"], city: "Isle of Wight", country: "UK" } },
  { label: "medium #2", input: { artistName: "Beabadoobee", genres: ["indie pop"], city: "London", country: "UK" } },
  { label: "medium #3", input: { artistName: "Soccer Mommy", genres: ["indie rock"], city: "Nashville", country: "USA" } },
  { label: "medium #4", input: { artistName: "Gustaf", genres: ["post-punk"], city: "Brooklyn", country: "USA" } },
  { label: "medium #5", input: { artistName: "Been Stellar", genres: ["indie rock"], city: "New York", country: "USA" } },

  { label: "large #1", input: { artistName: "Phoebe Bridgers", genres: ["indie folk"], city: "Los Angeles", country: "USA" } },
  { label: "large #2", input: { artistName: "Tame Impala", genres: ["psychedelic rock"], city: "Perth", country: "Australia" } },
  { label: "large #3", input: { artistName: "The 1975", genres: ["pop rock"], city: "Manchester", country: "UK" } },

  // Ambiguous: common/shared band names with no disambiguating spotify id.
  { label: "ambiguous #1 (name only)", input: { artistName: "Sunset" } },
  { label: "ambiguous #2 (name only)", input: { artistName: "The Verve" } },

  // Expected not to exist in Chartmetric at all.
  { label: "expected miss", input: { artistName: "Zzyzx Quartz Nonexistent Band 9182" } }
];

interface ArtistReport {
  label: string;
  artistName: string;
  status: string;
  reason?: string;
  matchMethod?: string;
  matchConfidence?: string;
  hasMonthlyListeners: boolean;
  hasFollowers: boolean;
  firstCallDurationMs: number;
  firstCallCreditsConsumed?: number;
  secondCallDurationMs: number;
  secondCallCreditsConsumed?: number;
  cacheBehaviorNote: string;
}

async function runOne(creditBudget: ChartmetricCreditBudget, artist: ValidationArtist): Promise<ArtistReport> {
  // A fresh provider (and call budget allowing 2 calls) per artist mirrors
  // "one analysis per artist" — CHARTMETRIC_MAX_CALLS_PER_ANALYSIS defaults
  // to 1 in production (one enrichArtist() call per real pipeline run); we
  // allow a second call here purely to demonstrate cache-hit behavior
  // within this report, not because production ever calls it twice.
  const provider = new ChartmetricArtistEnrichmentProvider({
    env: { ...process.env, CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED: "true" },
    requestToggleEnabled: true,
    creditBudget,
    callBudget: new ChartmetricAnalysisCallBudget(2)
  });

  const firstStart = Date.now();
  const first = await provider.enrichArtist(artist.input);
  const firstCallDurationMs = Date.now() - firstStart;

  const secondStart = Date.now();
  const second = await provider.enrichArtist(artist.input);
  const secondCallDurationMs = Date.now() - secondStart;

  return {
    label: artist.label,
    artistName: artist.input.artistName,
    status: first.status,
    reason: first.reason,
    matchMethod: first.matchMethod,
    matchConfidence: first.matchConfidence,
    hasMonthlyListeners: first.metrics?.spotifyMonthlyListeners !== undefined,
    hasFollowers: first.metrics?.spotifyFollowers !== undefined,
    firstCallDurationMs,
    firstCallCreditsConsumed: first.creditsConsumed,
    secondCallDurationMs,
    secondCallCreditsConsumed: second.creditsConsumed,
    cacheBehaviorNote:
      second.creditsConsumed === undefined || second.creditsConsumed === 0
        ? "second call served from cache (0 additional credits)"
        : "second call re-spent credits (cache miss or TTL expired)"
  };
}

async function main(): Promise<void> {
  const tokenPresent = Boolean(process.env.CHARTMETRIC_REFRESH_TOKEN?.trim());
  console.log(`Chartmetric refresh token present: ${tokenPresent}`);
  if (!tokenPresent) {
    console.log("Validation skipped: set CHARTMETRIC_REFRESH_TOKEN to run this report against the real API.");
    return;
  }

  const creditBudget = new ChartmetricCreditBudget(null, null);

  const reports: ArtistReport[] = [];
  for (const artist of VALIDATION_DATASET) {
    // Sequential on purpose: this is a manual, low-frequency validation
    // run, not a production path, and keeping it serial makes the printed
    // per-artist cost/duration numbers easy to read.
    // eslint-disable-next-line no-await-in-loop
    reports.push(await runOne(creditBudget, artist));
  }

  console.log("\nPer-artist results:");
  for (const report of reports) {
    console.log(
      `- ${report.label} ("${report.artistName}"): status=${report.status}` +
        `${report.reason ? ` reason=${report.reason}` : ""}` +
        `${report.matchMethod ? ` matchMethod=${report.matchMethod}` : ""}` +
        `${report.matchConfidence ? ` matchConfidence=${report.matchConfidence}` : ""}` +
        ` monthlyListeners=${report.hasMonthlyListeners ? "present" : "unavailable"}` +
        ` followers=${report.hasFollowers ? "present" : "unavailable"}` +
        ` firstCallMs=${report.firstCallDurationMs} secondCallMs=${report.secondCallDurationMs}` +
        ` creditsFirst=${report.firstCallCreditsConsumed ?? "n/a"} creditsSecond=${report.secondCallCreditsConsumed ?? "n/a"}` +
        ` (${report.cacheBehaviorNote})`
    );
  }

  const smallArtists = reports.slice(1, 6);
  const smallCoverage = smallArtists.filter((r) => r.status === "success" || r.status === "partial").length;
  const successCount = reports.filter((r) => r.status === "success").length;
  const totalCreditsConsumed = reports.reduce((sum, r) => sum + (r.firstCallCreditsConsumed ?? 0), 0);

  console.log("\nSummary:");
  console.log(`  artists tested: ${reports.length}`);
  console.log(`  successful matches: ${successCount}/${reports.length}`);
  console.log(`  small-artist coverage: ${smallCoverage}/${smallArtists.length}`);
  console.log(`  total credits consumed (first calls): ${totalCreditsConsumed}`);
  console.log(`  estimated avg cost per enriched artist: ${(totalCreditsConsumed / reports.length).toFixed(2)} credits`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Chartmetric validation report failed: ${message}`);
  process.exitCode = 1;
});
