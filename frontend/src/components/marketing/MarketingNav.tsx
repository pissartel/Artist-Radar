import Image from "next/image";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { MVP_ENTRY_ROUTE } from "@/lib/navigation";

export default function MarketingNav() {
  return (
    <header className="flex items-center justify-between px-6 sm:px-14 py-6 border-b border-border">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/brand/logo-next-stage-dark.png"
          alt="NextStage"
          width={136}
          height={32}
          priority
          className="h-7 w-auto sm:h-8"
        />
      </Link>
      <nav className="flex items-center gap-4 sm:gap-9">
        <a
          href="#features"
          className="hidden sm:inline text-sm font-semibold text-foreground-secondary hover:text-foreground transition-colors"
        >
          Features
        </a>
        <a
          href="#how-it-works"
          className="hidden sm:inline text-sm font-semibold text-foreground-secondary hover:text-foreground transition-colors"
        >
          How it works
        </a>
        <Link
          href={MVP_ENTRY_ROUTE}
          className={buttonClassName("gradient", "px-5 py-2.5 text-sm")}
        >
          Try It
        </Link>
      </nav>
    </header>
  );
}
