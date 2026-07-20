"use client";

import { useEffect, useRef, useState } from "react";
import {
  LAST_PIPELINE_STAGE_INDEX,
  PIPELINE_STAGES,
  fallbackStageIndexForElapsed,
  pipelineStageIndex,
} from "@/lib/pipelineStages";
import type { BackendPipelineExecutionState } from "@/lib/server/backendTypes";

const POLL_INTERVAL_MS = 1500;
const FALLBACK_TICK_MS = 250;

interface UsePipelineProgressOptions {
  // Id sent alongside the analysis request; polled against
  // GET /api/artist-radar/status/[executionId] for real pipeline progress.
  executionId: string | null;
  // A request is in flight (loading).
  active: boolean;
  // The overview payload has actually arrived — only then is it safe to
  // show full completion, per issue #135.
  ready: boolean;
}

export interface PipelineProgress {
  completedCount: number;
  activeIndex: number | null;
}

/**
 * Drives the analyzing page's stage checklist. Prefers real pipeline
 * progress polled from the backend (issue #134); falls back to a weighted,
 * simulated progression whenever no real status has been observed yet.
 * Neither path reports full completion until `ready`, so the checklist
 * never claims the analysis is done before the overview data actually is.
 */
export function usePipelineProgress({ executionId, active, ready }: UsePipelineProgressOptions): PipelineProgress {
  const [realStatus, setRealStatus] = useState<BackendPipelineExecutionState | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !executionId) {
      setRealStatus(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/artist-radar/status/${encodeURIComponent(executionId)}`);
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as BackendPipelineExecutionState;
        if (!cancelled) {
          setRealStatus(payload);
        }
      } catch {
        // Best-effort polling: a network hiccup just leaves the last known
        // status (or none) in place, and the fallback simulation below
        // covers the gap instead of the checklist freezing.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [executionId, active]);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setFallbackIndex(0);
      return;
    }
    startedAtRef.current = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
      setFallbackIndex(fallbackStageIndexForElapsed(elapsed));
    }, FALLBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  if (ready) {
    return { completedCount: PIPELINE_STAGES.length, activeIndex: null };
  }

  if (realStatus) {
    // Clamp so a backend COMPLETED observed via polling can't flip the
    // checklist to "done" before `ready` — the last stage stays visibly
    // active instead, per issue #135 ("keep the last active stage visible
    // until navigation is ready").
    const activeIndex = Math.min(pipelineStageIndex(realStatus.stage), LAST_PIPELINE_STAGE_INDEX);
    return { completedCount: activeIndex, activeIndex };
  }

  return { completedCount: fallbackIndex, activeIndex: fallbackIndex };
}
