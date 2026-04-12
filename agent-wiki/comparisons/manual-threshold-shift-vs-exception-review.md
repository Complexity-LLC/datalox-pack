---
type: comparison
title: Manual threshold shift vs exception review
workflow: flow_cytometry
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/patterns/dead-tail-exception.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
author: yifanjin
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Manual threshold shift vs exception review

## Overview

This comparison helps the agent choose whether to directly move a viability gate or first slow down and test an exception explanation.

## Comparison

| Dimension | Manual Threshold Shift | Exception Review |
|-----------|------------------------|------------------|
| Speed | Faster | Slower |
| Trust | Lower when the signal is ambiguous | Higher when ambiguity is technical |
| Best use case | Clean, low-risk boundary adjustment | Ambiguous boundaries with artifact risk |

## Verdict

Prefer exception review when the signal is ambiguous or when the gate change has downstream QC consequences.

## Related

- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
