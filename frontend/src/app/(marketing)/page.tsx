import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { buttonClassName } from "@/components/ui/Button";
import GuestLandingSearch from "@/components/onboarding/GuestLandingSearch";

const FEATURES = [
  { title: "Discover opportunities", description: "Compatible venues, festivals and opening slots ranked to your genre and reach.", accent: "accent" as const },
  { title: "AI similarity matching", description: "See the artists closest to your sound and where their momentum is heading.", accent: "info" as const },
  { title: "Opportunity scores", description: "Every opportunity scored so you spend outreach time where it converts.", accent: "success" as const },
];

const ICON_TILE_CLASSES: Record<(typeof FEATURES)[number]["accent"], string> = {
  accent: "bg-accent-tint text-accent-text",
  info: "bg-info-tint text-info-text",
  success: "bg-success-tint text-success-text",
};

const UPCOMING_CATEGORIES = [
  "Playlists and media",
  "Labels and publishers",
  "Managers, agents and bookers",
  "Producers and sound engineers",
  "Collaborations",
  "Local scenes",
  "Professional contacts",
];

// Keep false until the product video is published. The video implementation
// remains below so it can be re-enabled without rebuilding the landing page.
const SHOW_PRODUCT_VIDEO = false;

const CHAPTERS = [
  ["0:00", "An artist types their name"],
  ["0:24", "The analysis running live"],
  ["0:51", "Venues, festivals and the people who book them"],
  ["1:12", "On stage in the rooms it found"],
] as const;

export default function LandingPage() {
  return (
    <>
      <section className="flex flex-col items-center gap-6 px-5 py-16 text-center sm:px-6 sm:py-24">
        <Badge variant="accent" className="px-4 py-1.5 text-[13px]">No account needed to run your first analysis</Badge>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-6xl">Find your next stage.</h1>
        <p className="max-w-xl text-base font-medium leading-relaxed text-foreground-secondary sm:text-lg">Type your artist name. NextStage identifies you across music platforms, then finds the venues, festivals and opening slots that actually fit.</p>
        <GuestLandingSearch />

        {SHOW_PRODUCT_VIDEO && (
          <div className="mt-8 flex w-full flex-col items-center gap-4">
            <button type="button" aria-label="Play the NextStage product video" className="ns-card group relative aspect-video w-full max-w-[960px] overflow-hidden rounded-[20px] border border-white/[.08] bg-surface text-left shadow-frame">
              <span className="absolute right-[18px] top-[18px] rounded-full border border-white/10 bg-background/70 px-3 py-1.5 font-mono text-[11px] tracking-[.06em] text-foreground-secondary">1:30</span>
              <span className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-background/80" />
              <span className="absolute bottom-0 left-0 flex items-center gap-3.5 p-5 sm:p-7"><span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-gradient-brand" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5.5 19 12 8 18.5Z" /></svg></span><span><strong className="block text-[17px] font-extrabold">See NextStage on a real artist</strong><span className="block text-[13px] font-semibold text-foreground-secondary">90 seconds · one search, one analysis, 47 rooms worth playing</span></span></span>
            </button>
            <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1" aria-label="Video chapters">{CHAPTERS.map(([time, label]) => <span key={time} className="snap-start whitespace-nowrap rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-foreground-secondary"><span className="mr-2 font-mono text-[11px] text-muted">{time}</span>{label}</span>)}</div>
          </div>
        )}
      </section>

      <section id="features" className="grid grid-cols-1 gap-5 px-6 pb-24 sm:px-14 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-7">
            <div className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${ICON_TILE_CLASSES[feature.accent]}`} aria-hidden="true"><span className="h-4 w-4 rounded-[5px] border-2 border-current" /></div>
            <h2 className="text-[17px] font-bold text-foreground">{feature.title}</h2>
            <p className="text-sm leading-relaxed text-foreground-muted">{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-center gap-6 px-6 pb-24 text-center">
        <div className="flex max-w-2xl flex-col items-center gap-3">
          <Badge variant="success">Currently available in the MVP</Badge>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[30px]">Starting with live and booking opportunities</h2>
          <p className="text-sm text-foreground-secondary sm:text-base">NextStage is built as an artist growth platform, not just a booking tool. Live venues, festivals and opening slots are the first opportunity category — more opportunity categories are coming.</p>
        </div>
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">{UPCOMING_CATEGORIES.map((category) => <Badge key={category} variant="neutral">{category}</Badge>)}</div>
      </section>

      <section id="how-it-works" className="flex flex-col items-center gap-4 px-6 pb-24 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[30px]">Tell us your artist name, get a ranked plan in minutes</h2>
        <p className="max-w-lg text-sm text-foreground-secondary sm:text-base">We identify your profile, let you confirm the important details, then build a dashboard of similar artists and scored opportunities.</p>
        <Link href="/start" className={buttonClassName("gradient", "mt-2 px-7 py-4 text-base")}>Try NextStage</Link>
      </section>
    </>
  );
}
