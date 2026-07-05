import Link from "next/link";
import type { Opportunity, SimilarArtist } from "@/types";
import { PLATFORM_LABELS, TIER_LABELS } from "./SimilarArtistCard";
import MatchReasonsList from "./MatchReasonsList";
import { formatOpportunityDate, getUrlHostname } from "@/lib/opportunity";
import { formatMonthlyListeners, getSharedGenres } from "@/lib/similarArtist";

interface SimilarArtistDetailProps {
  artist: SimilarArtist;
  referenceArtistGenres: string[];
  relatedOpportunities: Opportunity[];
}

const cardClassName = "bg-card rounded-xl p-4 border border-slate-400/10 shadow-card";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

export default function SimilarArtistDetail({
  artist,
  referenceArtistGenres,
  relatedOpportunities,
}: SimilarArtistDetailProps) {
  const reasons = artist.matchReasons ?? (artist.reason ? [artist.reason] : []);
  const sharedGenres = getSharedGenres(artist, referenceArtistGenres);
  const listeners = formatMonthlyListeners(artist.monthlyListeners);
  const platforms = artist.platforms ?? [];

  return (
    <div className="max-w-3xl">
      <Link
        href="/similar-artists"
        className="text-xs text-accent-light hover:text-white transition-colors"
      >
        ← Back to Similar Artists
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {artist.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.imageUrl}
                alt={artist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-accent-light text-lg font-semibold">
                {artist.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{artist.name}</h1>
              {artist.artistTier && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-accent-light bg-accent/10 border-accent/20 whitespace-nowrap">
                  {TIER_LABELS[artist.artistTier] ?? artist.artistTier}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {artist.location}
              {listeners && <span> · {listeners} monthly listeners</span>}
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 px-3 py-1 rounded-full tabular-nums flex-shrink-0">
          {artist.matchScore}% match
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {artist.genres.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Genres</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="text-[10px] text-gray-400 bg-white/5 border border-slate-400/10 px-1.5 py-0.5 rounded-md"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={cardClassName}>
          <SectionTitle>Why this artist is similar</SectionTitle>
          {reasons.length > 0 ? (
            <MatchReasonsList reasons={reasons} />
          ) : (
            <p className="text-xs text-gray-600">No match reasons available yet.</p>
          )}

          {sharedGenres.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-4 mb-2">
                Shared genres
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sharedGenres.map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] text-accent-light bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={cardClassName}>
          <SectionTitle>Platforms</SectionTitle>
          {platforms.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((platform) =>
                platform.url ? (
                  <a
                    key={platform.type}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light hover:bg-accent/10 px-2 py-1 rounded-lg transition-all duration-150"
                  >
                    {PLATFORM_LABELS[platform.type] ?? platform.type}
                  </a>
                ) : (
                  <span
                    key={platform.type}
                    className="text-[10px] text-gray-500 bg-white/5 border border-slate-400/10 px-1.5 py-0.5 rounded-md"
                  >
                    {PLATFORM_LABELS[platform.type] ?? platform.type}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No platform links yet.</p>
          )}
        </div>

        {artist.sourceUrls && artist.sourceUrls.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Sources</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {artist.sourceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-light hover:text-white transition-colors break-all"
                  >
                    {getUrlHostname(url) ?? url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {relatedOpportunities.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Related booking opportunities</SectionTitle>
            <div className="flex flex-col gap-2">
              {relatedOpportunities.map((opportunity) => {
                const formattedDate = formatOpportunityDate(opportunity.date);
                return (
                  <Link
                    key={opportunity.id}
                    href={`/opportunities/${opportunity.id}`}
                    className="block bg-card-alt rounded-lg p-3 border border-slate-400/10 hover:border-accent/35 hover:bg-card-hover transition-all duration-200"
                  >
                    <p className="text-sm font-semibold text-white">{opportunity.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {opportunity.location}
                      {formattedDate && <span> · {formattedDate}</span>}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className={cardClassName}>
          <SectionTitle>Actions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-white bg-accent hover:bg-accent-light px-3 py-1.5 rounded-lg transition-colors duration-150"
            >
              Use as reference
            </button>
            <button
              type="button"
              className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-all duration-150"
            >
              Find booking opportunities from this artist
            </button>
            <button
              type="button"
              className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-all duration-150"
            >
              Save artist
            </button>
          </div>
        </div>

        <details className={cardClassName}>
          <summary className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest cursor-pointer">
            Raw data (debug)
          </summary>
          <pre className="text-[11px] text-gray-500 bg-black/20 rounded-lg p-3 mt-3 overflow-x-auto">
            {JSON.stringify(artist, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
