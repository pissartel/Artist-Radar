# CLAUDE.md

## Project

Artist Radar is an AI-powered platform that helps independent artists discover:

* Concert opportunities
* Similar artists
* Local scenes
* Curators
* Promotion opportunities

Current focus:

BOOKING intelligence MVP.

Always prioritize booking-related features over future promotion features unless explicitly requested.

---

## Source of Truth

Read and follow:

1. `AGENTS.md`
2. `agents/team`
3. Relevant specialist files:
   - `agents/product-architect.md`
   - `agents/backend-agent.md`
   - `agents/data-search-agent.md`
   - `agents/cli-agent.md`
   - `agents/qa-agent.md`
   - `agents/refactor-agent.md`

GitHub Issues are the source of truth.

Before implementing anything:

1. Read the GitHub issue.
2. Read acceptance criteria.
3. Read technical notes.
4. Follow the issue requirements.

Do not invent requirements not present in the issue.

---

## Development Workflow

Issue title format:

[AREA] Short title

Examples:

[BOOKING] Add similar artists carousel

[PROMO] Add curator scoring

[INFRA] Improve GitHub workflow

---

## Branch Naming

Use the Work Type field from the issue.

Examples:

feature/booking-42_similar_artists_carousel

tech/infra-43_structured_templates

fix/data-44_genre_filter_false_positives

refactor/back-45_booking_pipeline

docs/infra-46_codex_workflow

---

## Pull Request Naming

Format:

[AREA][#ISSUE_NUMBER] Short title

Example:

[BOOKING][#42] Add similar artists carousel

---

## Commit Naming

Format:

[AREA][#ISSUE_NUMBER] Short description

Example:

[BOOKING][#42] Add similar artists carousel

---

## Pull Request Requirements

PR body must contain:

Closes #ISSUE_NUMBER

Always include:

* Summary
* Changes
* Tests
* Risks / limitations

---

## Quality Standards

Before opening a PR:

* Run lint if available
* Run tests if available
* Run build if available

Report failures honestly.

Do not claim tests passed if they were not executed.

---

## Coding Principles

Prefer:

* Small focused changes
* Reuse existing code
* TypeScript strict mode
* Clear naming
* Simple solutions

Avoid:

* Unnecessary dependencies
* Large refactors unless requested
* Unrelated file changes

---

## UI Principles

Prefer:

* Fast iteration
* Functional UI first
* Mobile responsive
* Clear loading states
* Clear error states

Avoid premature design complexity.

---

## Booking Domain Rules

Booking recommendations must prioritize:

1. Genre compatibility
2. Artist similarity
3. Venue relevance
4. Local scene relevance

Do not recommend opportunities solely based on popularity.

Genre compatibility is more important than audience size.

---

## Safety Rules

Never:

* Merge automatically
* Delete large parts of the codebase without explicit instruction
* Modify secrets or environment variables unless required by the issue

Always create a PR for review.

