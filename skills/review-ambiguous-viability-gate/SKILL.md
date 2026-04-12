---
name: review-ambiguous-viability-gate
description: Use when live and dead populations are not cleanly separated during viability gate review.
metadata:
  datalox:
    id: flow-cytometry.review-ambiguous-viability-gate
    workflow: flow_cytometry
    trigger: Use when live/dead separation is ambiguous during viability gate review.
    pattern_paths:
      - .datalox/patterns/viability-gate-review.md
      - .datalox/patterns/dead-tail-exception.md
      - .datalox/patterns/qc-escalation-policy.md
    tags:
      - flow_cytometry
      - viability
      - gating
      - review
    status: approved
---

# Review Ambiguous Viability Gate

Use this skill for ambiguous viability review. This is a judgment step, not a mechanical threshold change.

## When to Use

- Live and dead populations are not cleanly separated
- The dead tail overlaps the live shoulder
- A gate change could materially affect downstream QC or interpretation

## When Not to Use

- Clear-cut gates where standard procedure already applies
- Cases where the issue is instrumentation failure rather than judgment about the gate

## Workflow

1. Confirm the ambiguity is real and not just a visualization artifact.
2. Read the linked pattern docs before widening or shifting the gate.
3. Treat the pattern docs as judgment support: check signal, interpretation, and recommended action.
4. Prefer the narrowest change that preserves downstream interpretability.
5. Escalate if the decision materially changes QC, sample disposition, or downstream interpretation.

## Expected Output

- State why this skill matched.
- State the recommended gate action.
- State what evidence or exception pattern justified the action.
- State whether escalation is required.

## Pattern Docs

- .datalox/patterns/viability-gate-review.md
- .datalox/patterns/dead-tail-exception.md
- .datalox/patterns/qc-escalation-policy.md
