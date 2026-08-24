import Image from "next/image";
import Link from "next/link";
import { LANDING_ROUTE } from "@/lib/navigation";
import Sidebar from "./Sidebar";
import AuthLinks from "@/components/auth/AuthLinks";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between gap-2 px-4 py-3 bg-surface border-b border-border sticky top-0 z-10 flex-shrink-0">
          <Link href={LANDING_ROUTE} className="flex items-center gap-2">
            <Image
              src="/brand/logo-next-stage-mark.png"
              alt="NextStage"
              width={24}
              height={24}
              priority
              className="h-6 w-6"
            />
            <span className="text-foreground font-bold text-base tracking-tight">
              NextStage
            </span>
          </Link>
          <AuthLinks mobile />
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
