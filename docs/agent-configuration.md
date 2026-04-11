# Agent Configuration

This pack is meant to be detected on every agent loop.

The current configuration is intentionally small.

The product loop is:

`detect -> use -> patch -> lint`

## Required Files

```text
.datalox/
  manifest.json
  config.json
  patterns/
skills/
```

## Runtime Behavior

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. detect a matching skill from `skills/`
4. read the skill's `patternPaths`
5. use those pattern docs during the current loop

If the pack is external, the host repo still owns all generated writes.

## Generation Behavior

When the agent learns something reusable:

1. write a new pattern doc into `.datalox/patterns/`
2. update or create a skill in `skills/`
3. keep the new pattern doc path in that skill's `patternPaths`

Generated skills stay in `skills/` on purpose so agent-native skill logic can still see them.
Generated pattern docs stay in the host repo `.datalox/patterns/`.

## Lint Rules

The minimal linter checks:

- skills missing pattern paths
- missing pattern files
- pattern docs missing required sections
- orphan pattern docs
- duplicate or overlapping skills in the same workflow

Run lint after patching local knowledge.

## Optional Helpers

The scripts under `scripts/` are reference implementation only. They are not required for normal pack use.
