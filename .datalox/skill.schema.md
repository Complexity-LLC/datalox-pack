# Skill Schema

A Datalox skill should be a real playbook, not a metadata wrapper.

## File Location

Each skill lives at:

```text
skills/<skill-name>/SKILL.md
```

## Frontmatter

Keep top-level frontmatter minimal:

```yaml
---
name: evolve-portable-pack
description: Use when changing the portable pack or agent guidance in this repo.
metadata:
  datalox:
    id: repo-engineering.evolve-portable-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack or agent guidance in this repo.
    pattern_paths:
      - .datalox/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
    tags:
      - repo_engineering
      - portable_pack
---
```

Top-level required fields:

- `name`
- `description`

Put Datalox-specific runtime fields under `metadata.datalox`.

Recommended `metadata.datalox` fields:

- `id`
- `workflow`
- `trigger`
- `pattern_paths`
- `tags`

Optional `metadata.datalox` fields:

- `status`
- `author`
- `updated_at`
- `repo_hints`

## Body

The markdown body is the real skill.

Required sections:

### When to Use

Say when this skill should be selected.

### Workflow

Give the actual steps the agent should follow.

### Expected Output

Say what the agent should produce or explain after using the skill.

### Pattern Docs

List the linked pattern docs that ground the skill.

## Writing Rule

The skill body should let an agent act even if it has not opened every linked pattern doc yet.

Pattern docs are supporting references. They are not a substitute for the skill body.

## Anti-Pattern

Do not write skills like this:

- large custom frontmatter
- tiny body
- "read the linked docs" as the only workflow
- no concrete output

That shape is a registry record, not a skill.
