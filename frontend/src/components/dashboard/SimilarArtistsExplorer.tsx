"use client";

import { useMemo, useState } from "react";
import type { SimilarArtist } from "@/types";
import SimilarArtistCard from "./SimilarArtistCard";

interface SimilarArtistsExplorerProps {
  artists: SimilarArtist[];
}

const MATCH_SCORE_OPTIONS = [
  { label: "Any match score", value: 0 },
  { label: "90%+", value: 90 },
  { label: "80%+", value: 80 },
  { label: "70%+", value: 70 },
  { label: "60%+", value: 60 },
];

const selectClassName =
  "text-xs text-gray-300 bg-card border border-slate-400/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent/50 hover:border-accent/35 transition-colors";

export default function SimilarArtistsExplorer({
  artists,
}: SimilarArtistsExplorerProps) {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("all");
  const [location, setLocation] = useState("all");
  const [minScore, setMinScore] = useState(0);

  const genres = useMemo(
    () => Array.from(new Set(artists.flatMap((artist) => artist.genres))).sort(),
    [artists],
  );

  const locations = useMemo(
    () => Array.from(new Set(artists.map((artist) => artist.location))).sort(),
    [artists],
  );

  const filteredArtists = useMemo(() => {
    const query = search.trim().toLowerCase();

    return artists.filter((artist) => {
      const matchesSearch = query === "" || artist.name.toLowerCase().includes(query);
      const matchesGenre = genre === "all" || artist.genres.includes(genre);
      const matchesLocation = location === "all" || artist.location === location;
      const matchesScore = artist.matchScore >= minScore;

      return matchesSearch && matchesGenre && matchesLocation && matchesScore;
    });
  }, [artists, search, genre, location, minScore]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by artist name"
          className="flex-1 min-w-[180px] text-xs text-gray-300 placeholder:text-gray-600 bg-card border border-slate-400/15 rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent/50 hover:border-accent/35 transition-colors"
        />
        <select
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          className={selectClassName}
        >
          <option value="all">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className={selectClassName}
        >
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          className={selectClassName}
        >
          {MATCH_SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-600 mb-3">
        {filteredArtists.length} of {artists.length} similar artists
      </p>

      {filteredArtists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredArtists.map((artist) => (
            <SimilarArtistCard key={artist.id} artist={artist} variant="full" />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-6 text-sm text-gray-500">
          No similar artists match your filters.
        </div>
      )}
    </div>
  );
}
