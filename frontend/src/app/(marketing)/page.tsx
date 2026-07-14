import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { buttonClassName } from "@/components/ui/Button";
import { MVP_ENTRY_ROUTE } from "@/lib/navigation";

const FEATURES = [
  {
    title: "Discover opportunities",
    description:
      "Compatible venues, festivals and opening slots ranked to your genre and reach.",
    accent: "accent" as const,
  },
  {
    title: "AI similarity matching",
    description: "See the artists closest to your sound and where their momentum is heading.",
    accent: "info" as const,
  },
  {
    title: "Booking scores",
    description: "Every lead scored so you spend outreach time where it converts.",
    accent: "success" as const,
  },
];

const ICON_TILE_CLASSES: Record<(typeof FEATURES)[number]["accent"], string> = {
  accent: "bg-accent-tint text-accent-text",
  info: "bg-info-tint text-info-text",
  success: "bg-success-tint text-success-text",
};

export default function LandingPage() {
  return (
    <>
      <section className="flex flex-col items-center text-center gap-6 px-6 py-20 sm:py-28">
        <Badge variant="accent" className="px-4 py-1.5 text-[13px]">
          AI-powered booking intelligence
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-extrabold text-foreground tracking-tight leading-[1.05] max-w-3xl">
          Find your next stage, before anyone else does.
        </h1>
        <p className="text-base sm:text-lg font-medium text-foreground-secondary max-w-xl leading-relaxed">
          NextStage scans venues, festivals and similar artists to surface the booking
          opportunities that actually fit your sound.
        </p>
        <div className="flex flex-col sm:flex-row gap-3.5 mt-2 w-full sm:w-auto">
          <Link
            href={MVP_ENTRY_ROUTE}
            className={buttonClassName("gradient", "px-7 py-4 text-base")}
          >
            Analyze my artist profile
          </Link>
          <a href="#how-it-works" className={buttonClassName("ghost", "px-7 py-4 text-base")}>
            See how it works
          </a>
        </div>
      </section>

      <section id="features" className="grid grid-cols-1 md:grid-cols-3 gap-5 px-6 sm:px-14 pb-24">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="bg-surface border border-border rounded-2xl p-7 flex flex-col gap-4"
          >
            <div
              className={`w-11 h-11 rounded-[10px] flex items-center justify-center ${ICON_TILE_CLASSES[feature.accent]}`}
              aria-hidden="true"
            >
              <span className="w-4 h-4 rounded-[5px] border-2 border-current" />
            </div>
            <h3 className="text-[17px] font-bold text-foreground">{feature.title}</h3>
            <p className="text-sm text-foreground-muted leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </section>

      <section
        id="how-it-works"
        className="flex flex-col items-center text-center gap-4 px-6 pb-24"
      >
        <h2 className="text-2xl sm:text-[30px] font-extrabold text-foreground tracking-tight">
          Tell us about your artist, get a ranked plan in minutes
        </h2>
        <p className="text-sm sm:text-base text-foreground-secondary max-w-lg">
          Share your artist profile, streaming links and target market. NextStage runs the
          analysis and hands you a dashboard of similar artists and scored booking opportunities.
        </p>
        <Link
          href={MVP_ENTRY_ROUTE}
          className={buttonClassName("gradient", "px-7 py-4 text-base mt-2")}
        >
          Try the MVP
        </Link>
      </section>
    </>
  );
}
