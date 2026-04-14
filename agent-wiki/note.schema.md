# Agent Wiki Note Schema

Notes are the default reusable knowledge unit in `agent-wiki/`.

Each note should be strong enough that an agent can read one page and get:

- what signal to notice
- how to interpret it
- what action to take
- what evidence or examples justify that action

## File Location

- Store reusable notes in `agent-wiki/notes/`
- Skills in `skills/<skill-name>/SKILL.md` should link to these pages through `note_paths`
- Old `patterns/`, `sources/`, `concepts/`, `comparisons/`, and `questions/` folders may still exist during migration, but new automatic writes should go to `notes/`

## Recommended Frontmatter

```yaml
---
type: note
kind: trace | web | pdf
title: Human-readable note title
workflow: workflow_id
skill: skill_id
tags:
  - tag
confidence: low | medium | high
status: active | stale | superseded
related: []
sources: []
author: name
updated: 2026-04-14T10:31:16.852Z
review_after: 2026-07-14
---
```

## Required Sections

### When to Use

Describe the recurring task boundary or loop moment when the note applies.

### Signal

Describe the concrete observation or situation that should trigger the note.

### Interpretation

State the judgment behind the signal.

### Action

State the next action the agent should take.

## Strongly Recommended Sections

### Examples

Give at least one concrete case, snippet, or observed example.

### Evidence

Citations, traces, screenshots, source notes, or reviewer comments that justify the note.

### Related

Other wiki paths that should be read alongside this note.

### Do Not

State what the agent should avoid when this note matches.

### Exceptions

State known edge cases where the usual action should not apply directly.

## Authoring Rules

- Keep one reusable rule per note.
- Prefer concrete signals over category labels.
- Keep the action usable inside one loop.
- Keep evidence and examples on the same page instead of splitting them into another generated artifact.
- Use `sources` and `related` when the note depends on richer supporting material.

## Lint Rules

Lint treats these as errors:

- missing `Signal`
- missing `Interpretation`
- missing `Action`

Lint treats these as warnings:

- missing `When to Use`
- missing `Examples`
- missing `Evidence` and no `sources`
- missing `Related`
- overdue `review_after`
- unsupported contradiction notes
- orphan note not linked by any skill or other wiki page
