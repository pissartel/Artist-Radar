"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { authHref } from "@/lib/auth/redirect";
import { buttonClassName } from "@/components/ui/Button";

export default function AuthLinks({ mobile = false }: { mobile?: boolean }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const next = pathname === "/" ? "/overview" : pathname;

  if (loading) {
    return <span className="h-10 w-28 animate-pulse rounded-lg bg-surface-elevated" aria-label="Loading account" />;
  }

  if (user) {
    return (
      <div className={mobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
        <span className="max-w-40 truncate text-xs text-foreground-muted">{user.email}</span>
        <form action="/auth/logout" method="post">
          <button className={buttonClassName("ghost", "px-4 py-2 text-sm")} type="submit">Log out</button>
        </form>
      </div>
    );
  }

  return (
    <div className={mobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
      <Link href={authHref("/login", next)} className={buttonClassName("ghost", "px-4 py-2 text-sm")}>Log in</Link>
      <Link href={authHref("/register", next)} className={buttonClassName("gradient", "px-4 py-2 text-sm")}>
        {mobile ? "Create account" : "Get started"}
      </Link>
    </div>
  );
}
