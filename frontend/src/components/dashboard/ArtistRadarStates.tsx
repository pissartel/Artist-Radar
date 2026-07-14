import Link from "next/link";

export function ArtistRadarLoadingState() {
  return (
    <div
      className="bg-surface rounded-xl border border-border shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 rounded-full border-2 border-loader-track border-t-primary animate-spin mb-4" />
      <p className="text-sm text-foreground-secondary">Loading your Artist Radar data...</p>
    </div>
  );
}

export function ArtistRadarEmptyOnboardingState() {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-card-glow p-10 flex flex-col items-center justify-center text-center">
      <p className="text-sm text-foreground font-medium">No artist search yet.</p>
      <p className="text-xs text-foreground-muted mt-1.5 max-w-sm">
        Tell us about your artist project to get similar artists and opportunities.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Start a search
      </Link>
    </div>
  );
}

export function ArtistRadarErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="bg-surface rounded-xl border border-danger-tint shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="alert"
    >
      <p className="text-sm text-danger-text font-medium">Something went wrong.</p>
      <p className="text-xs text-foreground-muted mt-1.5 max-w-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Try again
      </button>
    </div>
  );
}
