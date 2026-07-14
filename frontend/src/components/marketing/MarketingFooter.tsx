import Image from "next/image";

export default function MarketingFooter() {
  return (
    <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-14 py-10 border-t border-border">
      <div className="flex items-center gap-3">
        <Image
          src="/brand/logo-next-stage-mark.png"
          alt="NextStage"
          width={22}
          height={22}
          className="h-5 w-5"
        />
        <span className="text-sm font-semibold text-foreground-muted">
          © {new Date().getFullYear()} NextStage
        </span>
      </div>
      <p className="text-xs text-foreground-muted">Opportunity intelligence for independent artists.</p>
    </footer>
  );
}
