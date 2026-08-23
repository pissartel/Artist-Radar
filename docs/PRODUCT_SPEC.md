# Artist Radar — Product Spec

## One-line pitch

Artist Radar helps music artists find the right people and places to contact for booking, promotion and growth.

## Problem

Independent and semi-professional artists spend too much time searching manually for:
- venues that fit their genre
- local artists to share bills with
- festivals and first-part opportunities
- playlists and curators
- blogs, media and music professionals

The hardest part is not sending messages. The hardest part is finding relevant contacts and knowing why they are relevant.

## MVP goal

Build a CLI that takes an artist profile and generates a structured list of opportunities.

The result should be useful enough to export, review and contact manually.

## Initial modes

### Booking mode

Find:
- venues
- associations
- festivals
- local artists
- first-part opportunities
- promoters/bookers

### Promo mode

Find:
- playlists
- blogs
- media
- curators
- influencers
- relevant music communities

## User input

Required:
- artist name
- city
- genre

Optional:
- target region/country
- links
- result limit

## Output

Each opportunity should include:
- name
- type
- city
- country
- source_url
- contact
- reason
- score
- suggested_message

## Success criteria for V0

The CLI can run:

npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --target "Auvergne-Rhône-Alpes" --limit 10

And it creates:
- a JSON file
- a CSV file

## Non-goals for V0

- No SaaS UI
- No authentication
- No billing
- No database
- No autonomous browser agent
- No email sending
- No CRM

## Product onboarding beyond V0

The product UI follows a value-first onboarding model: a new user can run one limited artist
analysis and view a limited overview before registration is requested. Account creation is
required only when the user asks to persist, extend, or act on those results.

See [Anonymous-to-account onboarding](./anonymous-to-account-onboarding.md) for the flow,
capability boundaries, prompt triggers, and acceptance criteria.
