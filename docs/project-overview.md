# Project Overview

The canonical product definition lives in [product-definition.md](./product-definition.md).

Short version:

- `datalox-pack` is a knowledge base for agents plus the tooling that captures, curates, retrieves, and applies that knowledge
- the repo stays the source of truth for portable knowledge
- the loop is `detect -> use -> record -> promote -> lint`

The repo is centered on:

- `skills/`
- `agent-wiki/notes/`
- `agent-wiki/events/`

Current source kinds:

- `trace`
- `web`
- `pdf`

Current durable outputs:

- `note`
- `skill`

Avoid expanding taxonomy unless real usage proves another generated page type is necessary.
