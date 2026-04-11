# Agent Configuration

This repo defines the portable `.datalox/` contract.

Use it as the deterministic setup layer for any agent that can read repo files.
The default mode is `repo_only`, so the pack works without a Datalox server.

## Files

```text
.datalox/
  manifest.json
  config.json
  config.local.example.json
  config.schema.json
  skills/
  docs/
  views/
  captures/
  working/
  proposals/
```

## Read Order

1. `DATALOX.md`
2. `.datalox/manifest.json`
3. `.datalox/config.local.json` if present
4. `.datalox/config.json`
5. `AGENTS.md`
6. `CLAUDE.md` when applicable

## Immediate Flow

1. Load `.datalox/config.json`
2. Auto-select a matching local skill from task text and repo context
3. Resolve approved skills from `.datalox/skills/`
4. Apply working skill overlays from `.datalox/working/skills/`
5. Load linked working patterns from `.datalox/working/patterns/`
6. Read `viewPath` before raw markdown
7. Capture repeated interactions into `.datalox/captures/`
8. Materialize reusable patterns into `.datalox/working/`
9. Use `.datalox/proposals/` only for review-oriented candidates

## MinerU Lesson

The useful MinerU pattern is layered artifacts:

1. raw source
2. structured intermediate artifact
3. easier consumption artifact
4. trace back to source

For this pack:

1. raw docs live in `.datalox/docs/`
2. materialized views live in `.datalox/views/`
3. raw interaction traces live in `.datalox/captures/`
4. immediate-use learned overlays live in `.datalox/working/`
5. source anchors stay attached to the materialized view

## Optional Helpers

```bash
node scripts/agent-bootstrap.mjs
node scripts/agent-resolve.mjs
node scripts/agent-capture-interaction.mjs --task "review ambiguous live dead gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder"
node scripts/agent-materialize-capture.mjs --capture .datalox/captures/<capture-file>.json
node scripts/agent-learn-from-interaction.mjs --task "review ambiguous live dead gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception doc before widening gate"
```

## Design Rule

- `DATALOX.md` is the portable human entrypoint
- `.datalox/manifest.json` is the portable machine entrypoint
- `.datalox/config.json` is the deterministic config
- `.datalox/views/*.json` are materialized agent-facing views
- `.datalox/captures/*.json` are raw interaction traces
- `.datalox/working/*.json` are immediate-use learned overlays
