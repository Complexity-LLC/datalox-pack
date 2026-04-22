---
type: note
title: Host CLI wrapper fallback
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
usage:
  read_count: 2
  last_read_at: 2026-04-21T12:49:22.420Z
  apply_count: 0
  last_applied_at: 
  evidence_count: 0
updated: 2026-04-13T09:00:00.000Z
review_after: 2026-07-13
---
# Host CLI wrapper fallback

## When to Use

Use this page when an agent host cannot call Datalox through MCP and does not expose a post-turn hook API.

## Signal

The host can run a CLI command, but cannot reliably auto-call `resolve_loop` or `promote_gap` on every turn.

## Interpretation

The right fallback is a thin wrapper that injects resolved loop guidance into the host command instead of relying on passive repo discovery.

## Recommended Action

Prefer `datalox codex` for Codex `exec` flows. Otherwise use `datalox wrap command` with `__DATALOX_PROMPT__` or the `DATALOX_PROMPT` environment variable.

## Examples

- A Codex thread that has the MCP server installed but is not automatically calling it
- A generic CLI agent that accepts a prompt argument but exposes no hook surface

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/notes/evolve-datalox-pack.md
