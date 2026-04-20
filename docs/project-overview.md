# Project Overview

The canonical product definition lives in [product-definition.md](./product-definition.md).

Short version:

- `datalox-pack` is a knowledge system for agents centered on reusable skills backed by grounded notes
- the repo stays the source of truth for portable knowledge
- the loop is `detect -> use -> record -> promote -> lint`

The repo is centered on:

- `skills/`
- `agent-wiki/notes/`
- `agent-wiki/events/`

Normal read path:

1. detect the relevant skill
2. read `skills/<name>/SKILL.md`
3. follow the linked supporting notes

Current source kinds:

- `trace`
- `web`
- `pdf`

Current durable outputs:

- `skill`
- `note`

Avoid expanding taxonomy unless real usage proves another generated page type is necessary.
