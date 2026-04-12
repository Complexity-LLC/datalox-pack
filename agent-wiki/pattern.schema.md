# Agent Wiki Pattern Schema

Pattern docs are the agent-facing judgment pages linked from skills. They should be specific enough that an agent can act on them in one loop and a human can inspect why they exist.

## File Location

- Store pattern docs in `agent-wiki/patterns/`
- Store meta or maintenance patterns in `agent-wiki/meta/`
- Skills in `skills/<skill-name>/SKILL.md` should link to these pages through `pattern_paths`

## Recommended Frontmatter

```yaml
---
type: pattern
title: Human-readable pattern title
workflow: workflow_id
skill: skill_id
tags:
  - tag
confidence: low | medium | high
related: []
sources: []
author: name
updated: 2026-04-12T10:31:16.852Z
---
```

Use frontmatter for compact machine-readable metadata. The body should still be written for an agent or reviewer to read directly.

## Required Sections

### When to Use

Describe the recurring task boundary or moment in the loop when this pattern should apply. This should be concrete enough that an agent can recognize the situation quickly.

### Signal

Describe the specific observation that triggers the pattern. Prefer narrow, observable language over high-level labels.

### Interpretation

State the judgment behind the signal. Explain what the observation usually means, what alternative explanations exist, and why it matters.

### Recommended Action

State the next action the agent should take. Make this concrete, scoped, and auditable.

## Strongly Recommended Sections

### Do Not

State what the agent should avoid doing when this pattern matches.

### Exceptions

State known edge cases where the usual action should not be applied directly.

### Examples

Record one or more real cases, representative examples, or short case notes. This is the easiest way to keep patterns specific instead of generic.

### Evidence

Citations, source notes, reviewer comments, or file references that justify the pattern.

### Related

Other patterns, skills, or docs that should be read alongside this one.

## Authoring Rules

- Prefer one distinct judgment pattern per file.
- Use specific observations, not category labels.
- Write actions that are usable inside one agent loop.
- Add at least one example whenever the pattern comes from a real recurring case.
- Keep contradictions or unresolved ambiguity in `Exceptions` or `Evidence`, not hidden inside one sentence.

## Lint Rules

Lint treats these as errors:

- missing `Signal`
- missing `Interpretation`
- missing `Recommended Action`

Lint treats these as warnings:

- missing `When to Use`
- missing `Examples`
- orphan pattern doc not linked by any skill
