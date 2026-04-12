# Agent Configuration

This pack is meant to be detected on every agent loop.

The current configuration is intentionally small.

The product loop is:

`detect -> use -> patch -> lint`

The visible control artifacts are:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`

The practical multi-agent entry files are:

- `AGENTS.md`
- `CLAUDE.md`
- `WIKI.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/datalox-pack.mdc`
- `.windsurf/rules/datalox-pack.md`

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
3. detect a matching skill from `skills/<name>/SKILL.md`
4. read the skill's `metadata.datalox.pattern_paths`
5. use those pattern docs during the current loop

If the pack is external, the host repo still owns all generated writes.

## Generation Behavior

When the agent learns something reusable:

1. write a new pattern doc into `agent-wiki/patterns/`
2. update or create a skill in `skills/`
3. keep the new pattern doc path in that skill's `metadata.datalox.pattern_paths`

Generated skills stay in `skills/` on purpose so agent-native skill logic can still see them.
Generated pattern docs stay in the host repo `agent-wiki/patterns/`.
Patch operations should also refresh `agent-wiki/index.md` and append `agent-wiki/log.md`.

## Lint Rules

The minimal linter checks:

- skills missing pattern paths
- skills missing core playbook sections
- missing pattern files
- pattern docs missing required sections
- orphan pattern docs
- duplicate or overlapping skills in the same workflow

Run lint after patching local knowledge.
Lint should refresh `agent-wiki/lint.md` and append `agent-wiki/log.md`.

## Optional Helpers

The scripts under `scripts/` are reference implementation only. They are not required for normal pack use.

The shell scripts under `bin/` are the practical bootstrap path:

- `bin/adopt-host-repo.sh`
- `bin/adopt-from-github.sh`
- `bin/setup-multi-agent.sh`
