import Link from "next/link";
import { LANDING_ROUTE } from "@/lib/navigation";
import Sidebar from "./Sidebar";
import AuthLinks from "@/components/auth/AuthLinks";
import BottomTabBar from "./BottomTabBar";
import Logo from "@/components/brand/Logo";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 min-[1081px]:hidden">
          <Link href={LANDING_ROUTE} className="flex items-center gap-2">
            <Logo size={24} />
          </Link>
          <AuthLinks mobile />
        </header>
        <main className="app-content min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <BottomTabBar />
      </div>
    </div>
  );
}
