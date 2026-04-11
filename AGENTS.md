# Datalox Agent Instructions

Read agent config in this order:

1. `DATALOX_CONFIG_JSON` if set
2. `.datalox/config.local.json` if present
3. `.datalox/config.json`
4. this file

Use Datalox to resolve the right skill and supporting docs quickly and consistently.

This repo should work in `repo_only` mode without a running Datalox service.
No setup command is required. The repo itself is the portable knowledge pack.
If your platform does not automatically read this file, read `DATALOX.md` and `.datalox/manifest.json`.
Do not assume Node or the `scripts/` helpers are available.

Preserve your native or platform-provided skills and tools.
Datalox is an additive repo-local knowledge layer. It must not replace an agent's own built-in skill system.

## Retrieval Order

1. Prefer a matching local skill in `.datalox/skills/` first.
   If no explicit task or skill is given, infer the match from repo context:
   changed git paths when available, repo root files, and package metadata.
2. Apply any overlay skill in `.datalox/working/skills/` if it matches the same workflow or skill id.
3. Load linked working patterns from `.datalox/working/patterns/`.
4. For each doc ref, read its materialized view first when `viewPath` exists.
5. Read the raw doc only when the materialized view is insufficient.
6. Capture repeated interaction traces in `.datalox/captures/`.
7. Materialize reusable patterns from captures into `.datalox/working/patterns/`.
8. Refresh `.datalox/working/skills/` when a new pattern should attach to a skill immediately.
9. Write review-oriented candidate knowledge into `.datalox/proposals/` when human review is needed.
10. Call `/v1/runtime/compile` only if `runtime.enabled` is `true`.
11. Use `/v1/retrieval/search` directly only when you need lower-level retrieval control.
12. Inspect file metadata with `/v1/files/:id`.
13. Fetch file content only for the small set of top matches.

## Retrieval Rules

- Filter by `workflow` whenever possible.
- Prefer skill-grounded docs over ad hoc document search when a skill exists.
- Prefer materialized doc views over parsing raw markdown from scratch.
- Prefer the compiled runtime response over stitching search results together manually.
- Use tags to narrow retrieval before downloading content.
- Do not pull every file body into context when metadata and previews are enough.
- Preserve source anchors from a materialized view when citing or escalating.

## Output Rules

- Cite runtime file IDs when using the service, or local doc paths and source anchors when working from the portable pack.
- Prefer approved or policy-tagged files when there is ambiguity.
- Escalate if no strong match exists for the current workflow.

## Reference Implementation

The `scripts/` directory is optional. It demonstrates the same file-based
protocol for testing and CI. Agents do not need to run those scripts in order
to use the pack.
