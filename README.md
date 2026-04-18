# datalox-pack

`datalox-pack` is a repo-local memory and skill layer for code agents.

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

Machine-level install:

```bash
git clone https://github.com/Complexity-LLC/datalox-pack.git
cd datalox-pack
bash bin/setup-multi-agent.sh
```

This one-time machine setup can be done by the user's agent.

Repo-level adoption:

```bash
bash bin/adopt-host-repo.sh /path/to/your-project
```

Or from GitHub:

```bash
bash bin/adopt-from-github.sh /path/to/your-project
```

Supported default host paths include the Codex shim, the Claude shim when a real `claude` CLI exists, the Claude hook, and the generic CLI wrapper.

## CLI

Resolve the current loop:

```bash
node dist/src/cli/main.js resolve --repo . --task "review ambiguous viability gate" --json
```

Record and promote:

```bash
node dist/src/cli/main.js record --repo . --task "review ambiguous viability gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception note before widening gate" --json
node dist/src/cli/main.js promote --repo . --task "review ambiguous viability gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception note before widening gate" --json
node dist/src/cli/main.js lint --repo . --json
```

Wrapper entrypoints:

```bash
node bin/datalox-claude.js -- --print "Update the docs."
node bin/datalox-codex.js -- exec "Update the docs."
node bin/datalox-wrap.js command --repo /path/to/repo --task "update docs" --prompt "Update the docs." -- <host-command> __DATALOX_PROMPT__
```

After `node bin/datalox.js setup codex` or `bash bin/setup-multi-agent.sh`, the user should not need Datalox flags at all:

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
- `promote_gap`
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
- read legacy supporting folders when they already exist, but do not generate new knowledge into them

## Docs

- [DATALOX.md](DATALOX.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)
- [docs/project-overview.md](docs/project-overview.md)
- [docs/implementation-checklist.md](docs/implementation-checklist.md)
