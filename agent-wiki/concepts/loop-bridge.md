---
type: concept
title: Loop bridge
workflow: repo_engineering
status: active
related:
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Loop bridge

## Definition

A loop bridge is the host-side integration that resolves the right skill before a turn and can patch knowledge after the turn.

## Why It Matters

Without a loop bridge, a pack remains discoverable but not automatically active during agent work.

## Examples

- MCP calling `resolve_loop` before each turn.
- CLI fallback calling `resolve` and `patch` when MCP is unavailable.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
- agent-wiki/questions/when-should-a-new-skill-be-created.md
