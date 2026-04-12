# Agent Wiki Question Page Schema

Question pages capture recurring open questions that agents or reviewers need to answer consistently.

## File Location

- Store question pages in `agent-wiki/questions/`

## Recommended Frontmatter

```yaml
---
type: question
title: Human-readable question title
workflow: workflow_id
status: active | stale | superseded
related: []
sources: []
author: name
updated: 2026-04-12T10:31:16.852Z
review_after: 2026-07-12
---
```

## Recommended Sections

### Question

State the recurring question exactly.

### Answer

State the current best answer or decision rule.

### Escalate When

When the current answer is not enough.

### Related

Wiki-relative paths to the patterns, concepts, or comparisons that answer this question.
