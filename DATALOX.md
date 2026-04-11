# Datalox Portable Pack Protocol

This repo is a portable Datalox knowledge pack.

The pack itself is the interface. Another agent should be able to use it after
`git clone` by reading repo files directly. Do not assume Node, Python, a local
runtime, or an installation step.

## Read Order

1. Read `.datalox/manifest.json`.
2. Read `.datalox/config.local.json` if it exists.
3. Read `.datalox/config.json`.
4. Read this file.
5. Read `AGENTS.md` or tool-specific instruction files if they exist.

Preserve your native or platform-provided skills and tools.
Datalox is additive repo-local knowledge, not a replacement skill system.

## Pack Roles

- `.datalox/skills/`: approved skill entrypoints
- `.datalox/views/`: materialized agent-facing views
- `.datalox/docs/`: raw source docs
- `.datalox/working/`: immediate-use overlays learned locally
- `.datalox/captures/`: raw interaction traces
- `.datalox/proposals/`: review-oriented candidates

## Resolve Algorithm

When an explicit skill is not given:

1. Infer a candidate skill from current task text.
2. Narrow by workflow when known.
3. Use repo context to break ties:
   changed git paths when available, repo root files, and package metadata.
4. Prefer approved skills in `.datalox/skills/`.
5. Apply a matching overlay skill from `.datalox/working/skills/`.
6. Load linked working patterns from `.datalox/working/patterns/`.
7. Read `viewPath` first from `.datalox/views/`.
8. Read raw docs in `.datalox/docs/` only when the view is insufficient.

The normal output is:

- selected skill
- supporting views/docs
- source anchors to cite
- linked working patterns
- escalation decision

## Learn Algorithm

When a repeated interaction produces reusable knowledge:

1. Write the raw interaction trace to `.datalox/captures/`.
2. Materialize a reusable pattern into `.datalox/working/patterns/`.
3. If that pattern should affect future behavior immediately, refresh a matching
   overlay skill in `.datalox/working/skills/`.
4. Keep approved shared knowledge unchanged unless the task explicitly requires
   editing it.
5. Write review-oriented candidates into `.datalox/proposals/`.

The pack should improve its own future resolution without requiring a server.

## Source And Trace Rules

- Prefer materialized views over reparsing raw markdown.
- Keep source anchors attached to views and learned overlays.
- Cite local doc paths and source anchors when working from the pack.
- Escalate when there is no strong match for the current workflow.

## Conformance

Another agent conforms to this pack if it can complete the examples in
`.datalox/conformance/` by reading and writing the repo files directly.

Read:

- `docs/conformance.md`
- `.datalox/conformance/resolve-approved-skill.json`
- `.datalox/conformance/learn-working-pattern.json`
- `.datalox/conformance/refresh-working-skill.json`

## Current Default

- mode: `repo_only`
- runtime required: `false`
- native skill policy: `preserve`

## Optional Reference Implementation

The `scripts/` directory is a reference implementation of this protocol. It is
useful for testing and CI, but it is not required for normal pack use.
