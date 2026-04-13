# Agent Configuration

This pack is meant to be detected on every agent loop.

The current configuration is intentionally small.

The product loop is:

`detect -> use -> record -> promote -> lint`

The visible control artifacts are:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`
- `agent-wiki/events/`

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
skills/
agent-wiki/
  patterns/
  sources/
  concepts/
  comparisons/
  questions/
```

## Runtime Behavior

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. read `agent-wiki/hot.md` when it exists
4. detect a matching skill from `skills/<name>/SKILL.md`
5. read the skill's `metadata.datalox.pattern_paths`
6. if needed, follow `related` and `sources` into the wider `agent-wiki/`
7. use those pages during the current loop

If the pack is external, the host repo still owns all generated writes.

## Generation Behavior

When the agent learns something reusable:

1. record the turn result into `agent-wiki/events/`
2. promote repeated gaps into `agent-wiki/patterns/`
3. update or create a skill in `skills/` only when the gap becomes a recurring workflow boundary
4. add richer supporting pages under the other `agent-wiki/` folders when a pattern alone is not enough

Generated skills stay in `skills/` on purpose so agent-native skill logic can still see them.
Generated pattern docs stay in the host repo `agent-wiki/patterns/`.
Patch operations should also refresh `agent-wiki/index.md`, append `agent-wiki/log.md`, and refresh `agent-wiki/hot.md`.

## Lint Rules

The minimal linter checks:

- skills missing pattern paths
- skills missing core playbook sections
- missing pattern files
- pattern docs missing required sections
- orphan pattern docs and orphan supporting wiki pages
- pages with overdue `review_after`
- contradiction pages without supporting evidence
- duplicate or overlapping skills in the same workflow

Run lint after patching local knowledge.
Lint should refresh `agent-wiki/lint.md`, append `agent-wiki/log.md`, and refresh `agent-wiki/hot.md`.

## Optional Helpers

The scripts under `scripts/` are reference implementation only. They are not required for normal pack use.

The shell scripts under `bin/` are the practical bootstrap path:

- `bin/adopt-host-repo.sh`
- `bin/adopt-from-github.sh`
- `bin/setup-multi-agent.sh`
- `bin/datalox-auto-promote.js`

Hosts with post-turn hook support should point their hook command at:

- `node bin/datalox-auto-promote.js`
