# datalox-pack

`datalox-pack` is a repo-local knowledge and skill layer for agents.

The main model is:

- `skill` = reusable workflow entrypoint
- `note` = grounded supporting knowledge a skill can point to

It keeps the model small:

- source kinds: `trace`, `web`, `pdf`
- durable outputs: `note`, `skill`

The loop is:

`detect -> use -> record -> promote -> lint`

## What It Writes

In an adopted repo, the main surfaces are:

```text
skills/
agent-wiki/
  notes/
  events/
  index.md
  log.md
  lint.md
  hot.md
```

Use:

- `skills/` for reusable workflows
- `agent-wiki/notes/` for reusable local knowledge that already includes rule, evidence, and examples

## Install

From the repo you want Datalox to manage, paste this into the agent chatbox and send it:

```bash
TARGET_REPO="$(pwd)"
git clone https://github.com/Complexity-LLC/datalox-pack.git
cd datalox-pack
bash bin/setup-multi-agent.sh claude
bash bin/adopt-host-repo.sh "$TARGET_REPO"
node bin/datalox.js status --repo "$TARGET_REPO" --json
```

This does two separate things:

- `datalox-pack` is the source clone. It owns source-only scripts such as `bin/adopt-host-repo.sh`.
- `$TARGET_REPO` is the user's current project. Adoption writes the Datalox instruction surfaces, core skills, notes, and `.datalox/install.json` there.

For Codex instead of Claude, use:

```bash
bash bin/setup-multi-agent.sh codex
```

If the host repo already has `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md`, adoption preserves that file and injects a small Datalox adapter instead of skipping the Datalox entrypoint entirely.

Fresh adopted repos now receive only the core bootstrap bundle by default:

- core runtime/instruction surfaces
- the `maintain-datalox-pack` skill and its linked notes
- the `use-datalox-through-host-cli` skill and its linked note

They do not receive unrelated example or domain seed knowledge such as:

- `github`
- `ordercli`
- flow-cytometry review skills
- `agent-wiki/notes/pdf/*`
- `agent-wiki/notes/web/*`

Or from GitHub:

```bash
bash bin/adopt-from-github.sh /path/to/your-project
```

Supported default host paths include the Codex shim, the Claude shim when a real `claude` CLI exists, the Claude hook, and the generic CLI wrapper.

Automatic enforcement only applies on supported host adapter paths. MCP and repo instruction files are still available outside those paths, but they are guidance surfaces, not enforcement.

Inspect the current enforcement state with:

```bash
node dist/src/cli/main.js status --repo . --json
```

## CLI

Resolve the current loop:

```bash
node dist/src/cli/main.js resolve --repo . --task "review ambiguous viability gate" --json
```

Record and promote:

```bash
node dist/src/cli/main.js record --repo . --task "review ambiguous viability gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception note before widening gate" --json
node dist/src/cli/main.js promote --repo . --event-path agent-wiki/events/<event>.json --task "review ambiguous viability gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception note before widening gate" --json
node dist/src/cli/main.js lint --repo . --json
```

Durable writes now require provenance. `patch` and `promote` need one of:

- `--event-path <recorded-event>`
- both `--session-id` and `--host-kind`
- `--admin-override` for an explicit maintainer bypass

Wrapper entrypoints:

```bash
node bin/datalox-claude.js -- --print "Update the docs."
node bin/datalox-codex.js -- exec "Update the docs."
node bin/datalox-wrap.js command --repo /path/to/repo --task "update docs" --prompt "Update the docs." -- <host-command> __DATALOX_PROMPT__
```

After `node bin/datalox.js setup codex`, `bash bin/setup-multi-agent.sh codex`, or `bash bin/setup-multi-agent.sh claude`, the user should not need Datalox flags at all:

```bash
codex exec "Update the docs."
claude --print "Update the docs."
```

The installed shims infer the repo from the current working directory and default autonomous second-pass review to `review` mode with `gpt-5.4-mini`.

To stop Datalox-managed host interception later:

```bash
bash bin/disable-default-host-integrations.sh
```

To keep the wrapper but stop autonomous review only:

```bash
export DATALOX_DEFAULT_POST_RUN_MODE=off
```

## MCP

Primary MCP tools:

- `resolve_loop`
- `record_turn_result`
  Records a grounded `trace` by default.
- `promote_gap`
  Records a promotable `candidate` and runs the note/skill promotion ladder.
- `lint_pack`
- `capture_web_artifact`
- `capture_pdf_artifact`
- `publish_web_capture`
- `adopt_pack`

Start the server with:

```bash
node dist/src/mcp/server.js
```

## Promotion Rules

Default behavior:

- first grounded occurrence: keep it as an event
- repeated gap with an existing matching skill: patch that skill and its linked note set
- repeated gap with no matching skill: create a reusable note
- repeated no-match after the skill threshold: create a live skill

Generated notes go to `agent-wiki/notes/`.
Generated skills go to `skills/`.

## Web Capture

Capture a live site into repo-local design knowledge:

```bash
node dist/src/cli/main.js capture-web --repo . --url https://example.com --artifact design-doc --json
node dist/src/cli/main.js capture-web --repo . --url https://example.com --artifact design-tokens --json
node dist/src/cli/main.js capture-web --repo . --url https://example.com --artifact css-variables --json
node dist/src/cli/main.js capture-web --repo . --url https://example.com --artifact tailwind-theme --json
node dist/src/cli/main.js capture-web --repo . --url https://example.com --artifact note --json
```

Outputs:

- note: `agent-wiki/notes/web/<slug>.md`
- screenshots: `agent-wiki/assets/web/<slug>/desktop.png`, `mobile.png`
- design doc: `designs/web/<slug>.md`
- design tokens: `designs/web/<slug>.tokens.json`
- tailwind theme: `designs/web/<slug>.tailwind.ts`

Design tokens are the reusable artifact.
Tailwind output is derived from the tokens.

## PDF Capture

Capture a PDF into a repo-local note:

```bash
node dist/src/cli/main.js capture-pdf --repo . --path ./paper.pdf --json
```

Outputs:

- note: `agent-wiki/notes/pdf/<slug>.md`
- metadata: `agent-wiki/notes/pdf/<slug>.capture.json`

PDF capture writes notes first. Promotion into a skill should still come from later trace evidence.

## Publish Curated Web Captures

After capturing locally:

```bash
node dist/src/cli/main.js publish-web-capture --repo /path/to/corpus --capture <slug> --bucket "$DATALOX_R2_BUCKET" --json
```

This uploads:

- the note
- the derived artifact
- the screenshots
- `instances/<slug>/manifest.json`
- `indexes/latest.json`

## Current Best Practice

Keep the pack minimal:

- `trace`, `web`, and `pdf` are the only concrete source kinds
- `note` and `skill` are the only durable generated outputs
- fresh adopted repos should start from the core bootstrap bundle, not the full seed corpus
- read legacy supporting folders when they already exist, but do not generate new knowledge into them

## Docs

- [DATALOX.md](DATALOX.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)
- [docs/automatic-enforcement-plan.md](docs/automatic-enforcement-plan.md)
- [docs/project-overview.md](docs/project-overview.md)
- [docs/implementation-checklist.md](docs/implementation-checklist.md)
