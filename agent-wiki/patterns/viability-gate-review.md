---
type: pattern
title: Review ambiguous viability gate
workflow: flow_cytometry
skill: flow-cytometry.review-ambiguous-viability-gate
tags:
  - flow_cytometry
  - viability
  - review
confidence: high
related:
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
sources: []
author: yifanjin
updated: 2026-04-12T15:10:00.000Z
---

# Review ambiguous viability gate

## When to Use

Use this pattern when the operator is reviewing a viability gate and the live/dead split is not clearly separable from the plotted signal.

## Signal

Live and dead populations are not cleanly separated during viability gate review.

## Interpretation

This is a judgment step, not just a mechanical threshold change. A small boundary adjustment can change downstream interpretation, so the agent should slow down and use supporting exceptions and escalation rules before editing the gate.

## Recommended Action

Check the exception and escalation pattern docs before widening the gate, then explain the proposed gate decision in terms of the observed signal.

## Do Not

Do not widen the gate just because the cluster boundary looks visually inconvenient.

## Exceptions

If the ambiguity is clearly explained by a known artifact pattern, follow that exception path first. If the ambiguity would materially affect downstream QC, escalate instead of deciding alone.

## Examples

- A viability review where the live shoulder looked compressed but the dead tail explanation had not yet been checked.

## Evidence

- This pattern is the default grounding pattern for `review-ambiguous-viability-gate`.

## Related

- agent-wiki/patterns/dead-tail-exception.md
- agent-wiki/patterns/qc-escalation-policy.md
