"use client";

import type { ReactNode } from "react";
import { getContactAction } from "@/lib/opportunity";
import { useOpportunityUserState } from "@/lib/useOpportunityUserState";
import type { Opportunity } from "@/types";

interface OpportunityActionsProps {
  opportunity: Opportunity;
  variant?: "compact" | "full";
  className?: string;
}

// User-oriented actions (issue #130 review feedback): Contact only appears
// when a usable public contact/submission signal exists; Interested and
// Contacted are deliberate, persisted user actions — never triggered
// automatically just because a link was opened.
export default function OpportunityActions({ opportunity, variant = "full", className = "" }: OpportunityActionsProps) {
  const { interested, contacted, toggleInterested, toggleContacted } = useOpportunityUserState(opportunity);
  const contactAction = getContactAction(opportunity);

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <IconToggleButton
          active={interested}
          activeLabel="Remove from interested"
          inactiveLabel="Mark as interested"
          activeClassName="text-accent-text"
          icon={<BookmarkIcon filled={interested} />}
          onClick={toggleInterested}
        />
        <IconToggleButton
          active={contacted}
          activeLabel="Contacted"
          inactiveLabel="Mark as contacted"
          activeClassName="text-success-text"
          icon={<CheckIcon filled={contacted} />}
          onClick={toggleContacted}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {contactAction && (
        <a
          href={contactAction.href}
          target={contactAction.href.startsWith("http") ? "_blank" : undefined}
          rel={contactAction.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
        >
          {contactAction.label}
        </a>
      )}
      <TextToggleButton
        active={interested}
        activeLabel="Interested"
        inactiveLabel="Mark as interested"
        activeClassName="text-accent-text bg-accent-tint border-accent-tint"
        onClick={toggleInterested}
      />
      <TextToggleButton
        active={contacted}
        activeLabel="Contacted"
        inactiveLabel="Mark as contacted"
        activeClassName="text-success-text bg-success-tint border-success-tint"
        onClick={toggleContacted}
      />
    </div>
  );
}

function TextToggleButton({
  active,
  activeLabel,
  inactiveLabel,
  activeClassName,
  onClick,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus ${
        active
          ? activeClassName
          : "text-foreground-secondary border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function IconToggleButton({
  active,
  activeLabel,
  inactiveLabel,
  activeClassName,
  icon,
  onClick,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClassName: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? activeLabel : inactiveLabel}
      title={active ? activeLabel : inactiveLabel}
      className={`p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:shadow-focus ${
        active ? activeClassName : "text-foreground-disabled hover:text-accent-text"
      }`}
    >
      {icon}
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {filled && <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity="0.15" />}
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
