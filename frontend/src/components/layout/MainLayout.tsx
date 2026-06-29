import Sidebar from "./Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center px-4 py-3 bg-sidebar border-b border-white/5 sticky top-0 z-10 flex-shrink-0">
          <span className="text-accent-light font-bold text-base tracking-tight">
            Artist Radar
          </span>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
