---
type: source
title: Portable pack design notes
workflow: repo_engineering
source_kind: note
status: active
related:
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
sources: []
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Portable pack design notes

## Overview

This source page captures the design constraints behind the Datalox pack: host repo owns writes, skills stay native, and visible wiki artifacts matter for trust.

## Key Claims

- The visible knowledge layer should be inspectable by humans.
- Loop control should come from MCP or CLI bridges rather than hidden pack magic.
- The pack should stay additive to native agent skills.

## Limitations

- These are current design notes, not immutable product rules.
- Revisit them when real user behavior contradicts the assumptions.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
- agent-wiki/questions/when-should-a-new-skill-be-created.md
