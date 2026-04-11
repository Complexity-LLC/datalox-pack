# Claude Code Instructions

This repo should work as a portable Datalox knowledge pack even when no Datalox server is running.

No setup command is required.
If another agent system does not automatically read platform-specific project instructions, use `DATALOX.md` and `.datalox/manifest.json`.
Do not assume Node or the helper scripts are available.

1. Read `.datalox/config.local.json` if it exists.
2. Read `.datalox/config.json`.
3. Read local skills in `.datalox/skills/`.
4. Apply any matching overlay skill in `.datalox/working/skills/`.
5. Read linked working patterns in `.datalox/working/patterns/`.
6. Read local views in `.datalox/views/`.
7. Read raw docs in `.datalox/docs/` only when the view is insufficient.
8. Store repeated interaction traces in `.datalox/captures/`.
9. Materialize reusable patterns into `.datalox/working/`.
10. Write review-oriented candidates into `.datalox/proposals/`.

Default behavior:

- treat this repo as `repo_only` unless config says otherwise
- preserve your native or platform-provided skills; Datalox is additive only
- auto-select a local skill from current task text, changed git paths when available, repo root files, and package metadata
- prefer local skills in `.datalox/skills/`
- allow `.datalox/working/skills/` and `.datalox/working/patterns/` to overlay approved repo knowledge
- prefer materialized views in `.datalox/views/`
- only read raw docs in `.datalox/docs/` when the view is insufficient
- do not assume `localhost` or a Datalox service is available

When you discover new knowledge:

- store captures under `.datalox/captures/`
- store them under `.datalox/working/`
- store proposals under `.datalox/proposals/`
- do not silently mix proposed knowledge into approved skills or views

The scripts are optional terminal helpers and reference implementation only.

When runtime is enabled later, it is a second access path. It is not the default requirement for using this repo.
