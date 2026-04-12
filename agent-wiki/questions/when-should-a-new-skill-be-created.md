---
type: question
title: When should a new skill be created?
workflow: repo_engineering
status: active
related:
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# When should a new skill be created?

## Question

When should the pack create a new skill instead of just adding another pattern to an existing one?

## Answer

Create a new skill only when the work represents a distinct recurring task boundary with its own stable trigger and workflow.

## Escalate When

- The candidate still looks like a single exception inside an existing task.
- The workflow boundary is unclear.
- There is not yet enough repeated evidence to justify a new skill.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
