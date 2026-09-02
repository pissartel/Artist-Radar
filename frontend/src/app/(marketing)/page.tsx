import GuestLandingSearch from "@/components/onboarding/GuestLandingSearch";

const CHAPTERS = [
  ["0:00", "An artist types their name"],
  ["0:24", "The analysis running live"],
  ["0:51", "Venues, festivals and the people who book them"],
  ["1:12", "On stage in the rooms it found"],
] as const;

export default function LandingPage() {
  return (
    <section className="animate-ns-in flex flex-col items-center gap-[22px] px-5 pb-20 pt-16 text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-accent-tint px-4 py-1.5 text-[13px] font-bold text-accent-text">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
        No account needed to run your first analysis
      </div>
      <h1 className="max-w-[760px] text-[38px] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl">Find your next stage.</h1>
      <p className="max-w-[560px] text-[15px] font-medium leading-7 text-foreground-secondary sm:text-lg">Type your artist name. NextStage identifies you across Spotify, Deezer and MusicBrainz, then finds the venues, festivals and opening slots that actually fit.</p>
      <GuestLandingSearch />
      <button type="button" aria-label="Play the NextStage product video" className="ns-card group relative mt-[34px] aspect-video w-full max-w-[960px] overflow-hidden rounded-[20px] border border-white/[.08] bg-surface text-left shadow-frame">
        <span className="absolute right-[18px] top-[18px] rounded-full border border-white/10 bg-background/70 px-3 py-1.5 font-mono text-[11px] tracking-[.06em] text-foreground-secondary">1:30</span>
        <span className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-background/80" />
        <span className="absolute bottom-0 left-0 flex items-center gap-3.5 p-5 sm:p-7">
          <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-gradient-brand" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5.5 19 12 8 18.5Z" /></svg>
          </span>
          <span>
            <strong className="block text-[17px] font-extrabold">See NextStage on a real artist</strong>
            <span className="block text-[13px] font-semibold text-foreground-secondary">90 seconds · one search, one analysis, 47 rooms worth playing</span>
          </span>
        </span>
      </button>
      <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1" aria-label="Video chapters">
        {CHAPTERS.map(([time, label]) => (
          <span key={time} className="snap-start whitespace-nowrap rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-foreground-secondary">
            <span className="mr-2 font-mono text-[11px] text-muted">{time}</span>{label}
          </span>
        ))}
      </div>
    </section>
  );
}
