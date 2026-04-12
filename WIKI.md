# Datalox Pack Wiki Instructions

Treat this repository as a Datalox pack.

Read these files in order:

1. `.datalox/manifest.json`
2. `.datalox/config.json`
3. `DATALOX.md`
4. `AGENTS.md`

Then operate with this loop:

1. detect the best matching skill in `skills/`
2. use the linked pattern docs in `agent-wiki/patterns/`
3. patch reusable knowledge back into the host repo
4. lint the pack

Keep these visible artifacts current:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`

Do not replace native agent skills. Datalox is additive.
