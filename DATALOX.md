# Datalox Portable Pack

This repo is a portable Datalox knowledge pack.

It should work today without a Datalox server and without any setup command.

## Read First

1. Read `.datalox/manifest.json`.
2. Read `.datalox/config.local.json` if it exists.
3. Read `.datalox/config.json`.
4. Preserve your native or platform-provided skills and tools.
5. Treat Datalox as an additive repo-local knowledge layer.

## How To Use The Pack

1. Auto-select a local skill from repo context and task context.
2. Prefer a skill in `.datalox/skills/`.
3. Apply any overlay skill in `.datalox/working/skills/`.
4. Load linked working patterns in `.datalox/working/patterns/`.
5. Read `viewPath` first from `.datalox/views/`.
6. Read raw docs in `.datalox/docs/` only when the materialized view is insufficient.
7. Store raw interaction traces in `.datalox/captures/`.
8. Materialize reusable patterns from captures into `.datalox/working/patterns/`.
9. Refresh `.datalox/working/skills/` when a captured pattern should attach to a skill immediately.

## Auto-Selection Signals

When no explicit skill is given, use:

- current task text
- current workflow if known
- changed git paths when available
- repo root files
- package metadata

## Writeback Rules

- Put raw interaction traces in `.datalox/captures/`.
- Put immediately usable self-updates in `.datalox/working/`.
- Put review-oriented candidates in `.datalox/proposals/`.
- Do not mutate approved shared knowledge unless the task explicitly requires it.

## Current Default

- mode: `repo_only`
- runtime required: `false`
- native skill policy: `preserve`
