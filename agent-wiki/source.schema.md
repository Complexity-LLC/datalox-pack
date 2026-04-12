# Agent Wiki Source Page Schema

Source pages record the origin of claims that patterns, concepts, and comparisons depend on.

## File Location

- Store source pages in `agent-wiki/sources/`

## Recommended Frontmatter

```yaml
---
type: source
title: Human-readable source title
workflow: workflow_id
source_kind: interview | note | doc | transcript | repo
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

What this source is and why it matters.

### Key Claims

Bullet points of the facts or judgments this source supports.

### Limitations

What the source does not prove, where it may be incomplete, or why it might age poorly.

### Related

Wiki-relative paths to the patterns, concepts, or questions that rely on this source.
