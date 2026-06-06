# Artist Radar — Global Agent Rules

## Product

Artist Radar helps music artists find actionable booking and promotion opportunities.

The product should help artists discover:
- venues
- festivals
- first-part opportunities
- local artists
- playlists
- music blogs
- media
- curators
- labels
- managers
- bookers
- producers and engineers

The first MVP is not a full SaaS. It is a CLI that generates structured opportunity lists.

## MVP

The first MVP is a Node.js TypeScript CLI.

Commands:
- booking
- promo

Each command accepts:
- --artist
- --city
- --genre
- --target
- --links
- --limit

The CLI should export:
- JSON
- CSV

## Architecture rules

- Keep business logic in src/pipeline.ts and src/services/.
- CLI must stay thin.
- CLI should only parse arguments, call runOpportunitySearch(), and print output paths.
- The core function must be runOpportunitySearch().
- Code must be reusable later in a SaaS API.
- Prefer a predictable pipeline over autonomous runtime agents for the MVP.
- Do not overengineer.
- Do not add a database until explicitly requested.
- Do not add authentication until explicitly requested.
- Do not add a frontend until explicitly requested.

## Data quality rules

- Never invent fake emails.
- If a contact is uncertain, return null.
- If a source URL is uncertain, return null.
- Each opportunity must include a reason.
- Each opportunity must include a score from 0 to 100.
- Scores should reflect real relevance, not optimism.
- Prefer fewer good opportunities over many weak ones.
- Make uncertainty explicit.

## Development rules

- Use TypeScript.
- Use zod for validation.
- Use commander for CLI.
- Use dotenv for environment variables.
- Use OpenAI SDK for AI calls.
- Use json2csv for CSV export.
- Use vitest for tests.
- Use npm scripts for build, dev, test.
- Run npm test and npm run build before finishing a task.
- Keep changes small.
- Explain what changed at the end of every task.

## Git rules

- Work in small steps.
- Do not rewrite git history unless explicitly asked.
- Do not commit automatically unless explicitly asked.
- Before finishing, summarize:
  - files changed
  - commands run
  - tests/build status
  - next recommended step
