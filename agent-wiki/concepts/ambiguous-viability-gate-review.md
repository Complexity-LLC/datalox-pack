---
type: concept
title: Ambiguous viability gate review
workflow: flow_cytometry
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Ambiguous viability gate review

## Definition

Ambiguous viability gate review is the situation where the live/dead split is visibly unstable enough that an operator has to interpret cause and downstream consequence before changing the gate.

## Why It Matters

This concept explains why a small visual shift can still require a slower, evidence-based decision path.

## Examples

- A live shoulder that appears compressed because of a dim dead tail artifact.
- A gate adjustment that would change whether a sample passes QC.

## Related

- agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
