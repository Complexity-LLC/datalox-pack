# Agent Configuration

The agent-facing contract is intentionally small.

## Main Surfaces

```text
.datalox/
  manifest.json
  config.json
skills/
agent-wiki/
  notes/
  events/
  index.md
  log.md
  lint.md
  hot.md
```

## Read Order

1. `.datalox/manifest.json`
2. `.datalox/config.json`
3. `agent-wiki/hot.md`
4. selected `skills/<name>/SKILL.md`
5. linked `metadata.datalox.note_paths`

## Write Rule

New automatic writes should go to:

- `skills/`
- `agent-wiki/notes/`
- `agent-wiki/events/`

Legacy supporting folders may still be readable during migration, but they are no longer the primary surface.

## Source Kinds

Concrete source kinds only:

- `trace`
- `web`
- `pdf`

## Durable Outputs

- `note`
- `skill`

## Capture

- `capture-web` writes repo-local notes plus optional design artifacts
- `capture-pdf` writes repo-local notes from PDFs

## Lint

Lint checks:

- missing linked notes
- malformed notes
- missing skill playbook sections
- orphan notes
- overlapping skills

## Machine Setup

The user's agent may perform one-time machine setup.

Preferred commands:

- `bash bin/setup-multi-agent.sh`
- `node bin/datalox.js install all --json`

After setup, the user should keep using `codex` or `claude` normally from the target repo.

## Stop

To stop Datalox-managed host interception:

- `bash bin/disable-default-host-integrations.sh`
- `node bin/datalox.js disable all --json`

To keep the wrapper but stop autonomous post-run review:

- set `DATALOX_DEFAULT_POST_RUN_MODE=off`
- or pass `--post-run-mode off`
