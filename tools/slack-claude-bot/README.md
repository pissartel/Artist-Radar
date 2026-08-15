# Slack development bot

The bot can run feature work and PR feedback with Claude Code, Codex, or Kimi Code.

## Agent selection

Claude remains the default. Set `DEFAULT_AGENT` to `claude`, `codex`, or `kimi` to change it globally.

Slack command:

```text
/dev issue #42
/dev issue #42 claude
/dev issue #42 codex
/dev issue #42 kimi
```

HTTP endpoints accept either an `agent` or `provider` field:

```json
{
  "issueNumber": 42,
  "agent": "codex"
}
```

```json
{
  "prNumber": 123,
  "branchName": "feature/booking-42_example",
  "feedbacks": [],
  "agent": "kimi"
}
```

## Environment

- `CLAUDE_BIN`: Claude Code executable.
- `CODEX_BIN`: Codex executable.
- `KIMI_BIN`: optional Kimi Code executable; defaults to `kimi` from `PATH`.
- `DEFAULT_AGENT`: optional default agent; defaults to `claude`.

The selected CLI must already be authenticated on the machine running the bot.
