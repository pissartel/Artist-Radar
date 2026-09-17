"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ANALYSIS_CACHE_CLEARED_EVENT } from "@/lib/artistRadarResponseCache";

interface QueryProviderProps {
  children: React.ReactNode;
}

export default function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
          },
        },
      })
  );

  useEffect(() => {
    function clearArtistRadarQueries() {
      queryClient.removeQueries({ queryKey: ["artistRadar"] });
    }

    window.addEventListener(ANALYSIS_CACHE_CLEARED_EVENT, clearArtistRadarQueries);
    return () =>
      window.removeEventListener(ANALYSIS_CACHE_CLEARED_EVENT, clearArtistRadarQueries);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
