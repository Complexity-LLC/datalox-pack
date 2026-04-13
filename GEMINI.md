# Datalox Pack Gemini Instructions

This repo is a portable Datalox pack for agents.

Use it on every loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. read `agent-wiki/hot.md` if it exists
4. detect a skill from `skills/<name>/SKILL.md`
5. read the linked pattern docs in `agent-wiki/patterns/`
6. if needed, follow `related` and `sources` into the wider `agent-wiki/`
7. use the pattern docs' signal, interpretation, and recommended action

When you learn something reusable:

1. record the turn result in `agent-wiki/events/`
2. promote repeated gaps into the host repo `agent-wiki/patterns/` or `skills/`
3. lint the pack
4. refresh:
   - `agent-wiki/index.md`
   - `agent-wiki/log.md`
   - `agent-wiki/lint.md`
   - `agent-wiki/hot.md`

Concrete design-capture workflow:

- if the task is to learn a live website from observable evidence, use `skills/capture-web-knowledge/SKILL.md`
- run `datalox capture-web --repo . --url <url> --artifact design-doc`
- use `designs/web/<slug>.md` as the direct brief only when needed; keep the source page and screenshots as evidence

Preserve native Gemini or platform skills. Datalox is additive.
