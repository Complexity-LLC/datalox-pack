---
type: note
title: Evolve portable pack
workflow: repo_engineering
skill: repo-engineering.evolve-portable-pack
tags:
  - repo_engineering
  - portable_pack
  - control
confidence: high
status: active
related:
  - agent-wiki/notes/repo-engineering-multi-agent-bootstrap-surfaces.md
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/questions/when-should-a-new-skill-be-created.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
author: yifanjin
updated: 2026-04-12T15:10:00.000Z
review_after: 2026-07-12
---

# Evolve portable pack

## When to Use

Use this pattern when the pack design starts adding layers faster than it adds visible user benefit.

## Signal

The pack is growing more complicated than the actual agent loop requires.

## Interpretation

The right fix is usually to simplify the protocol, not add another layer.

## Recommended Action

Keep the loop as: detect skill each turn, read linked pattern docs, and write generated skills back into `skills/`.

## Do Not

Do not add hidden internal layers when a visible repo artifact can serve the same purpose.

## Exceptions

If a new layer is required to keep host integration reliable, add it only when it clearly improves loop control or setup reliability.

## Examples

- Replacing hidden pack-only indirection with visible `agent-wiki/` artifacts that both humans and agents can inspect.

## Evidence

- This meta pattern is the control rule for pack simplification work in this repo.
- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/notes/repo-engineering-multi-agent-bootstrap-surfaces.md
- agent-wiki/concepts/loop-bridge.md
- agent-wiki/questions/when-should-a-new-skill-be-created.md
