---
type: comparison
title: Repo protocol vs loop bridge
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

# Repo protocol vs loop bridge

## Overview

This comparison separates what the repo files can guarantee from what a host integration can guarantee.

## Comparison

| Dimension | Repo Protocol | Loop Bridge |
|-----------|---------------|-------------|
| Portability | High | Medium |
| Automatic per-turn behavior | Low | High |
| Setup friction | Low | Medium |
| Host control | Low | High |

## Verdict

Use the repo protocol as the durable source of truth, but rely on the loop bridge for real automatic adoption.

## Related

- agent-wiki/questions/when-should-a-new-skill-be-created.md
