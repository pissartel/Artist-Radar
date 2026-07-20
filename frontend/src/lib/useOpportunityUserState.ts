"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildOpportunityStateKey,
  DEFAULT_OPPORTUNITY_USER_STATE,
  getOpportunityUserState,
  setOpportunityUserState,
  subscribeToOpportunityUserState,
} from "./opportunityUserState";

interface UseOpportunityUserStateOpportunity {
  id?: string | null;
  sourceUrls?: string[] | null;
}

export function useOpportunityUserState(opportunity: UseOpportunityUserStateOpportunity) {
  const key = buildOpportunityStateKey(opportunity);
  // Starts from the SSR-safe default on every render until the effect below
  // syncs from localStorage post-mount, so server and first client render match.
  const [state, setState] = useState(DEFAULT_OPPORTUNITY_USER_STATE);

  useEffect(() => {
    setState(getOpportunityUserState(key));
    return subscribeToOpportunityUserState(() => setState(getOpportunityUserState(key)));
  }, [key]);

  const setInterested = useCallback(
    (interested: boolean) => setState(setOpportunityUserState(key, { interested })),
    [key]
  );
  const setContacted = useCallback(
    (contacted: boolean) => setState(setOpportunityUserState(key, { contacted })),
    [key]
  );
  const toggleInterested = useCallback(
    () => setState(setOpportunityUserState(key, { interested: !getOpportunityUserState(key).interested })),
    [key]
  );
  const toggleContacted = useCallback(
    () => setState(setOpportunityUserState(key, { contacted: !getOpportunityUserState(key).contacted })),
    [key]
  );

  return { ...state, setInterested, setContacted, toggleInterested, toggleContacted };
}
