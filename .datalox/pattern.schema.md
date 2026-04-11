# Pattern Doc Schema

A pattern doc encodes expert judgment as a retrievable signal. Every pattern doc must follow this structure.

## Required Sections

### Signal

What the agent observes that triggers this pattern. Be specific — this is what gets matched at runtime.

### Interpretation

What the signal means. This is the expert judgment: why the observation matters, what it usually indicates, and what could go wrong if ignored.

### Recommended Action

What the agent should do. Concrete, actionable, and scoped to this pattern. If escalation or consultation is needed, say so explicitly.

## Optional Metadata (before first section)

```
- Workflow: <workflow_id>
- Skill: <skill_id>
- Tags: <comma, separated, tags>
```

## Optional Sections

### Notes

Additional context, edge cases, or references that do not fit the three required sections.

## Lint Rules

Lint enforces the three required sections. A pattern doc missing any of `Signal`, `Interpretation`, or `Recommended Action` is an error. An unreferenced pattern doc (not linked by any skill) is a warning.
