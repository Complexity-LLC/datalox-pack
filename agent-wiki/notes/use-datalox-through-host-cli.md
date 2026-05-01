---
type: note
title: Use Datalox Through Host CLI
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/maintain-datalox-pack.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
usage:
  read_count: 13
  last_read_at: 2026-05-01T10:58:28.224Z
  apply_count: 0
  last_applied_at: 
  evidence_count: 0
updated: 2026-04-13T09:00:00.000Z
review_after: 2026-07-13
---
# Use Datalox Through Host CLI

## When to Use

Use this page when an agent host cannot call Datalox automatically through MCP, wrapper, or hook enforcement.

## Signal

The host can run a CLI command or expose MCP tools, but the active session cannot prove it will call `resolve_loop` and `record_turn_result` on every loop.

## Interpretation

MCP availability is not enforcement. The right fallback for enforceable Codex runs is a thin wrapper that injects resolved loop guidance into the host command instead of relying on passive repo discovery.

## Recommended Action

If MCP is available in the active session, call `resolve_loop` before acting and `record_turn_result` after meaningful grounded outcomes. Prefer `datalox codex` for enforceable Codex `exec` flows. Otherwise use `datalox wrap command` with `__DATALOX_PROMPT__` or the `DATALOX_PROMPT` environment variable.

## Examples

- A Codex thread that has the MCP server installed but is not automatically calling it
- A native Codex chat with MCP tools but no `DATALOX_ACTIVE_WRAPPER=codex` sentinel
- A generic CLI agent that accepts a prompt argument but exposes no hook surface

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/notes/maintain-datalox-pack.md
