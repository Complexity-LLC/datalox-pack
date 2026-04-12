---
type: pattern
title: Multi-agent bootstrap surfaces
workflow: repo_engineering
skill: repo-engineering.evolve-portable-pack
tags:
  - repo_engineering
  - onboarding
  - multi_agent
confidence: high
status: active
related:
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
author: yifanjin
updated: 2026-04-12T10:31:16.852Z
review_after: 2026-07-12
---

# Multi-agent bootstrap surfaces

## When to Use

Use this pattern when changing how the pack is discovered or adopted by different agent hosts.

## Signal

Agents do not share a universal instruction discovery standard.

## Interpretation

The pack should expose multiple committed instruction entry files and a one-command adoption path instead of relying on a single protocol file.

## Recommended Action

Add WIKI, GEMINI, Copilot, Cursor, Windsurf, and GitHub bootstrap surfaces and keep them aligned with DATALOX.md.

## Do Not

Do not assume a single file like `AGENTS.md` or `DATALOX.md` will be discovered by every host.

## Exceptions

If a host has a stronger native setup mechanism, use it, but keep the repo-level instruction files aligned as the shared fallback.

## Examples

- Codex uses repo instructions and MCP setup, while Gemini and Claude may rely on different discovery files.

## Evidence

- This pattern was learned while making Datalox adoptable across Codex, Claude, Cursor, Windsurf, Copilot, and Gemini surfaces.
- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/meta/evolve-portable-pack.md
- agent-wiki/concepts/loop-bridge.md
- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
