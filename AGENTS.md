# Datalox Agent Instructions

This repo is a portable Datalox pack.

The working loop is:

`detect -> use -> patch -> lint`

Use it on every agent loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. detect the best matching skill in `skills/`
4. read the linked pattern docs in `.datalox/patterns/`
5. use their signal, interpretation, and recommended action in the current loop

Preserve your native or platform-provided skills. Datalox is additive.

## Rules

- generated skills belong in `skills/`
- reusable pattern docs belong in `.datalox/patterns/`
- keep skills lightweight and let them point to pattern docs
- lint the skill-pattern graph after changing local knowledge
- do not require a local server
