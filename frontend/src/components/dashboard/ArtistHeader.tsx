import type { Artist } from "@/types";

interface ArtistHeaderProps {
  artist: Artist;
}

export default function ArtistHeader({ artist }: ArtistHeaderProps) {
  return (
    <div className="flex items-center gap-5 mb-8">
      <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
        <span className="text-accent-light text-2xl font-bold">
          {artist.name.charAt(0)}
        </span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">{artist.name}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm text-accent-light font-medium">
            {artist.genre}
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-400">{artist.city}</span>
        </div>
      </div>
    </div>
  );
}
