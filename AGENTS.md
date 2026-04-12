# Datalox Agent Instructions

This repo is a portable Datalox pack.

The working loop is:

`detect -> use -> patch -> lint`

Use it on every agent loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. detect the best matching skill in `skills/`
4. read the linked pattern docs in `agent-wiki/patterns/`
5. use their signal, interpretation, and recommended action in the current loop

Preserve your native or platform-provided skills. Datalox is additive.

Keep these host-repo artifacts current so humans can inspect the pack:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`

## Rules

- if this repo is being used as an external pack, treat its skills and pattern docs as seed knowledge
- generated skills belong in the host repo `skills/`
- reusable pattern docs belong in the host repo `agent-wiki/patterns/`
- keep skills lightweight and let them point to pattern docs
- lint the skill-pattern graph after changing local knowledge
- do not require a local server
- if this repo is being adopted into another repo, `bash bin/adopt-host-repo.sh /path/to/host-repo` is the primary bootstrap path
