---
type: pattern
title: Dead tail exception
workflow: flow_cytometry
skill: flow-cytometry.review-ambiguous-viability-gate
tags:
  - flow_cytometry
  - viability
  - artifact
confidence: medium
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
author: yifanjin
updated: 2026-04-12T15:10:00.000Z
review_after: 2026-07-12
---

# Dead tail exception

## When to Use

Use this pattern when the apparent gate ambiguity comes from a dim dead tail overlapping the live shoulder rather than from a clean biological shift.

## Signal

A dim dead tail overlaps the live shoulder and makes the boundary look unstable.

## Interpretation

This often indicates staining or preparation artifact instead of a true population shift. The unstable boundary is real in the plot, but its likely cause is technical rather than biological.

## Recommended Action

Review the exception path first and avoid widening the gate until the artifact explanation is checked.

## Do Not

Do not treat the overlap as proof that the live population itself moved.

## Exceptions

If repeat runs or orthogonal evidence show the same shift without the artifact signature, fall back to the main viability review pattern instead of this exception.

## Examples

- A dim tail on the dead side that drifts into the live shoulder after staining prep, making the cutoff appear unstable.

## Evidence

- Use this to explain why a visually ambiguous boundary does not automatically justify gate widening.
- agent-wiki/sources/flow-cytometry-demo-notes.md

## Related

- agent-wiki/patterns/viability-gate-review.md
- agent-wiki/concepts/ambiguous-viability-gate-review.md
- agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
