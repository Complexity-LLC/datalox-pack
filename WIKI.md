# Datalox Pack Wiki Instructions

Treat this repository as a Datalox pack.

Read these files in order:

1. `.datalox/manifest.json`
2. `.datalox/config.json`
3. `DATALOX.md`
4. `agent-wiki/hot.md` if it exists
5. `AGENTS.md`

Then operate with this loop:

1. detect the best matching skill in `skills/`
2. use the linked pattern docs in `agent-wiki/patterns/`
3. if needed, follow `related` and `sources` into the wider `agent-wiki/`
4. record reusable gaps in `agent-wiki/events/`
5. promote repeated gaps into the host repo knowledge layer
6. lint the pack

Concrete design-capture workflow:

- if the task is to learn a live website from observable evidence, use `skills/capture-web-knowledge/SKILL.md`
- run `datalox capture-web --repo . --url <url> --artifact design-doc`
- use `designs/web/<slug>.md` as the direct brief only when needed; keep the source page and screenshots as evidence

Keep these visible artifacts current:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`
- `agent-wiki/events/`

Do not replace native agent skills. Datalox is additive.
