# Datalox Agent Instructions

This repo is a portable Datalox pack.

The working loop is:

`detect -> use -> record -> promote -> lint`

Use it on every agent loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. read `agent-wiki/hot.md` if it exists
4. detect the best matching skill in `skills/`
5. read the linked pattern docs in `agent-wiki/patterns/`
6. if needed, follow `related` and `sources` into the wider `agent-wiki/`
7. use those pages in the current loop

Preserve your native or platform-provided skills. Datalox is additive.

Keep these host-repo artifacts current so humans can inspect the pack:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`
- `agent-wiki/events/`

## Rules

- if this repo is being used as an external pack, treat its skills and wiki pages as seed knowledge
- generated skills belong in the host repo `skills/`
- reusable pattern docs belong in the host repo `agent-wiki/patterns/`
- richer supporting pages can live in `agent-wiki/sources`, `agent-wiki/concepts`, `agent-wiki/comparisons`, and `agent-wiki/questions`
- keep skills lightweight and let them point to pattern docs
- if the task is to turn a website into reusable repo knowledge, use `skills/capture-web-knowledge/SKILL.md` and the `capture-web` flow instead of freehand visual summaries
- lint the skill-to-wiki graph after changing local knowledge
- do not require a local server
- if the host supports post-turn hooks, use `node bin/datalox-auto-promote.js` as the automatic promotion entrypoint
- if the host has no MCP or hook support, use `node bin/datalox-codex.js` for Codex `exec` or `node bin/datalox-wrap.js` for other CLI hosts
- if this repo is being adopted into another repo, `bash bin/adopt-host-repo.sh /path/to/host-repo` is the primary bootstrap path
