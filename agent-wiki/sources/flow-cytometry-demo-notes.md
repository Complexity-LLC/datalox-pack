---
type: source
title: Flow cytometry demo notes
workflow: flow_cytometry
source_kind: note
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
sources: []
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Flow cytometry demo notes

## Overview

This source page records the demo assumptions behind the flow-cytometry seed knowledge in this pack.

## Key Claims

- Ambiguous viability review is a judgment step, not a mechanical threshold edit.
- Dead-tail overlap is a common technical explanation for an unstable live/dead boundary.
- QC escalation matters when a gate change would materially alter downstream acceptance.

## Limitations

- This is demo knowledge, not validated production SOP.
- It should be replaced or supplemented with real reviewer notes before high-stakes use.

## Related

- agent-wiki/concepts/ambiguous-viability-gate-review.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
