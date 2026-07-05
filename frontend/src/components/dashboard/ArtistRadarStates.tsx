import Link from "next/link";

export function ArtistRadarLoadingState() {
  return (
    <div
      className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent-light animate-spin mb-4" />
      <p className="text-sm text-gray-400">Loading your Artist Radar data...</p>
    </div>
  );
}

export function ArtistRadarEmptyOnboardingState() {
  return (
    <div className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-10 flex flex-col items-center justify-center text-center">
      <p className="text-sm text-white font-medium">No artist search yet.</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-sm">
        Tell us about your artist project to get similar artists and booking opportunities.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Start a search
      </Link>
    </div>
  );
}

export function ArtistRadarErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="bg-card rounded-xl border border-red-400/30 shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="alert"
    >
      <p className="text-sm text-red-300 font-medium">Something went wrong.</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Try again
      </button>
    </div>
  );
}
