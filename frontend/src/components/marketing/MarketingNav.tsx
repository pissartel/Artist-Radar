import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { buttonClassName } from "@/components/ui/Button";

export default function MarketingNav() {
  return (
    <header className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-14">
      <Link href="/" aria-label="NextStage home"><Logo size={30} /></Link>
      <nav className="flex items-center gap-3 sm:gap-[22px]" aria-label="Account">
        <Link href="/login" className="text-sm font-semibold text-foreground-secondary hover:text-foreground">Log in</Link>
        <Link href="/signup?next=%2Fstart" className={buttonClassName("secondary", "px-4 py-2.5")}>Create account</Link>
      </nav>
    </header>
  );
}
