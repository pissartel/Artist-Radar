"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REDIRECT_DELAY_MS = 1800;

export default function AnalyzingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/dashboard");
    }, REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div
          className="w-12 h-12 mx-auto rounded-full border-2 border-accent/20 border-t-accent-light animate-spin"
          role="status"
          aria-label="Analyzing artist"
        />
        <h1 className="text-lg font-semibold text-white mt-5">
          Analyzing your artist profile...
        </h1>
        <p className="text-sm text-gray-400 mt-1.5">
          Looking for similar artists and booking opportunities.
        </p>
      </div>
    </div>
  );
}
