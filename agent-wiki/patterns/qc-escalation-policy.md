---
type: pattern
title: QC escalation policy
workflow: flow_cytometry
skill: flow-cytometry.review-ambiguous-viability-gate
tags:
  - flow_cytometry
  - qc
  - escalation
confidence: high
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
author: yifanjin
updated: 2026-04-12T15:10:00.000Z
review_after: 2026-07-12
---

# QC escalation policy

## When to Use

Use this pattern when a gate change would materially alter downstream interpretation, QC acceptance, or whether a result is allowed to ship.

## Signal

Changing the viability gate would materially alter downstream interpretation or QC acceptance.

## Interpretation

The decision exceeds normal operator discretion. The technical ambiguity is no longer just a local review issue because the consequences propagate into a higher-stakes quality decision.

## Recommended Action

Escalate before applying the change.

## Do Not

Do not finalize the gate unilaterally when the change has downstream QC consequences.

## Exceptions

If the downstream effect is negligible and already covered by a documented operator exception, escalation may not be required.

## Examples

- A gate adjustment that would flip the sample from acceptable to failed QC.

## Evidence

- This pattern exists to prevent local gate tuning from bypassing QC judgment boundaries.
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md

## Related

- agent-wiki/patterns/viability-gate-review.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- agent-wiki/concepts/ambiguous-viability-gate-review.md
