# Agent Wiki Comparison Page Schema

Comparison pages help the agent choose between competing workflows, interpretations, or tactics.

## File Location

- Store comparison pages in `agent-wiki/comparisons/`

## Recommended Frontmatter

```yaml
---
type: comparison
title: Human-readable comparison title
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

### Overview

What choice this comparison is helping resolve.

### Comparison

Use a table or bullet list to contrast the options.

### Verdict

State the operational choice clearly.

### Related

Wiki-relative paths to the patterns or questions this comparison informs.
