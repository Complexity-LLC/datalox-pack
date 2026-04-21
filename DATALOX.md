# Datalox

This repo is a portable agent pack.

The runtime model is intentionally small:

- source kinds: `trace`, `web`, `pdf`
- durable outputs: `note`, `skill`

The loop is:

`detect -> use -> record -> promote -> lint`

## Read Order

On each loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. read `agent-wiki/hot.md` if it exists
4. detect the best matching skill in `skills/`
5. read the linked notes in that skill's `metadata.datalox.note_paths`
6. follow `related` and `sources` only when the linked note says they matter
7. act from the skill body plus the linked notes

Host repo files override seed-pack files when both define the same knowledge.

## Knowledge Surfaces

The main repo-local surfaces are:

- `skills/`
- `agent-wiki/notes/`
- `agent-wiki/events/`
- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`

Use `agent-wiki/notes/` for reusable local knowledge.
Use `skills/` for reusable workflows.

Legacy folders such as `patterns/`, `sources/`, `concepts/`, `comparisons/`, and `questions/` may still exist in older repos. Read them when present, but new automatic writes should go to `agent-wiki/notes/`.

## Promotion Rule

Promotion should stay simple:

- first grounded occurrence: record an event only
- repeated gap with an existing matching skill: patch that skill and add or update a linked note
- repeated gap with no matching skill: create a reusable note first
- repeated no-match after the skill threshold: create a live skill

Notes should hold both:

- signal
- interpretation
- action
- examples
- evidence

Skills should hold the actual workflow and link to notes through `note_paths`.

## Source-To-Knowledge Rule

Keep the two acquisition paths distinct:

- `pdf`, `web`, and other `source` inputs can create evidence notes
- `trace` inputs can create operational notes
- only repeated operational evidence should create or patch a skill

When a skill links notes, use:

- operational notes for action
- source notes for grounding

## Lint Rule

Lint checks:

- skills missing `note_paths`
- skills missing core playbook sections
- missing linked notes
- notes missing `Signal`, `Interpretation`, or `Action`
- notes missing examples or evidence
- orphan notes
- overlapping skills in the same workflow

Run lint after patching local knowledge.

## Web Capture

Use web capture when a live page should become repo-local design knowledge.

Commands:

- `datalox capture-web --repo . --url <url> --artifact design-doc`
- `datalox capture-web --repo . --url <url> --artifact design-tokens`
- `datalox capture-web --repo . --url <url> --artifact css-variables`
- `datalox capture-web --repo . --url <url> --artifact tailwind-theme`
- `datalox capture-web --repo . --url <url> --artifact note`

Outputs:

- note: `agent-wiki/notes/web/<slug>.md`
- screenshots: `agent-wiki/assets/web/<slug>/`
- design doc: `designs/web/<slug>.md`
- design tokens: `designs/web/<slug>.tokens.json`
- tailwind theme: `designs/web/<slug>.tailwind.ts`

Treat screenshots and raw CSS variables as evidence.
Treat semantic design tokens as the reusable artifact.
Treat Tailwind output as derived from those tokens, not the source of truth.

## PDF Capture

Use PDF capture when a binary document should become repo-local knowledge.

When a wrapped host prompt references a concrete PDF file path, capture that PDF into `agent-wiki/notes/pdf/` before falling back to generic repo-context skill matching.

Command:

- `datalox capture-pdf --repo . --path <pdf-path>`

Outputs:

- note: `agent-wiki/notes/pdf/<slug>.md`
- metadata: `agent-wiki/notes/pdf/<slug>.capture.json`

PDF capture writes notes first. Do not promote directly from a PDF into a skill unless later trace evidence proves the knowledge changed runtime behavior.

## Publish Web Captures

For curated web examples:

1. capture locally
2. publish the selected instance
3. regenerate the public index

Command:

- `datalox publish-web-capture --repo <repo> --capture <slug> --bucket <bucket>`

This uploads:

- the note
- the derived artifact
- the screenshots
- `instances/<slug>/manifest.json`
- `indexes/latest.json`

## MCP and CLI

Preferred MCP tools:

- `resolve_loop`
- `record_turn_result`
  Writes a grounded `trace` by default. Use for receipts and audit history, not automatic knowledge promotion.
- `promote_gap`
  Records a promotable `candidate` and runs the note/skill promotion ladder.
- `lint_pack`
- `capture_web_artifact`
- `capture_pdf_artifact`
- `publish_web_capture`
- `adopt_pack`

CLI commands mirror the same operations.

Core CLI commands emit JSON for agent consumption. Wrapper commands keep passthrough behavior by default; use `--json` there when you need a structured envelope instead of prompt or child-process output.

Use `datalox status --json` to inspect whether the current repo is on an `enforced`, `conditional`, or `guidance_only` path.

`patch` and `promote` are durable-write surfaces. They now require durable provenance:

- `eventPath`
- or `sessionId + hostKind`
- or explicit `adminOverride`

## Host Integration

Supported default paths:

- Codex shim
- Claude shim when a real `claude` CLI binary exists
- Claude hook
- generic CLI wrapper

These are not all equivalent:

- supported host adapters can enforce Datalox automatically
- MCP-only hosts are guidance-only unless the host actually routes through an adapter
- repo instruction files are visible protocol, not enforcement

After machine-level install, a clean writable git repo can auto-bootstrap on first use.
If a repo is already partially adopted or conflicting, do not mutate it blindly. Repair or adopt it explicitly.

## Agent-Run Machine Setup

One-time machine setup can be delegated to the user's agent.

Preferred commands:

- install all default host integrations:
  `bash bin/setup-multi-agent.sh`
- install one host only:
  `node bin/datalox.js install codex --json`
  `node bin/datalox.js install claude --json`

After setup, the user should keep using the host normally:

- `codex exec "<prompt>"`
- `claude --print "<prompt>"`

The installed shims infer the repo from the current working directory and default post-run review to `review` with `gpt-5.4-mini`.

Only run machine-level setup when the user allows writes under `HOME` such as `~/.local/bin`, `~/.claude`, or `~/.codex`.

For the enforcement model and implementation roadmap, read [docs/automatic-enforcement-plan.md](docs/automatic-enforcement-plan.md).

## Stop Or Disable

To stop machine-level host interception, run one of:

- disable all default host integrations:
  `bash bin/disable-default-host-integrations.sh`
- disable one host only:
  `node bin/datalox.js disable codex --json`
  `node bin/datalox.js disable claude --json`

`disable` removes Datalox-managed local shims, matching stable symlinks, the Claude auto-promote hook, and matching skill links that were installed by Datalox.

If you only want to keep the wrapper but stop autonomous post-run review, set:

- `DATALOX_DEFAULT_POST_RUN_MODE=off`

or pass:

- `--post-run-mode off`
