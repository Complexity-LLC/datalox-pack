# Claude Code Instructions

Treat this repo as a Datalox pack.

On every loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. read `agent-wiki/hot.md` if it exists
4. detect the best matching skill from `skills/`
5. read the linked pattern docs from `agent-wiki/patterns/`
6. if needed, follow `related` and `sources` into the wider `agent-wiki/`
7. use the pattern docs' signal, interpretation, and recommended action in the current loop

When you learn something reusable:

1. record the turn result in `agent-wiki/events/`
2. promote repeated gaps into `agent-wiki/patterns/` or `skills/`
3. lint the skill-to-wiki graph

Keep these files current:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`

Automatic host hook:

- if `.claude/settings.json` and `.claude/hooks/auto-promote.sh` are present, they should call `node bin/datalox-auto-promote.js` on `Stop` and `SubagentStop`
- if MCP and hooks are both unavailable, fall back to `node bin/datalox-wrap.js`

Keep Datalox additive to Claude's native skills. Do not require a running Datalox service.
