# Datalox Pack Copilot Instructions

This repository is a portable Datalox pack. It is file-based, markdown-first, and agent-oriented.

## Core Model

- `skills/<name>/SKILL.md`: canonical skills
- `.datalox/patterns/*.md`: canonical pattern docs
- `.datalox/index.md`: generated map of current knowledge
- `.datalox/log.md`: generated change trail
- `.datalox/lint.md`: generated lint snapshot

## Loop

1. detect a matching skill
2. use the linked pattern docs
3. patch new reusable knowledge
4. lint the pack

## Editing Rules

- keep skills in markdown `SKILL.md`, not JSON
- keep pattern docs in markdown
- keep Datalox additive to native agent skills
- prefer updating the existing skill over creating duplicates
- refresh `index.md`, `log.md`, and `lint.md` when patching or linting
