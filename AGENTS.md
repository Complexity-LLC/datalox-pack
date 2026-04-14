# Agent Instructions

Read in this order:

1. `.datalox/manifest.json`
2. `.datalox/config.json`
3. `agent-wiki/hot.md` when it exists
4. the selected `skills/<name>/SKILL.md`
5. the linked notes in `metadata.datalox.note_paths`

Use the pack with this model:

- source kinds: `trace`, `web`, `pdf`
- durable outputs: `note`, `skill`

Promotion rule:

- repeated local knowledge -> note
- repeated reusable workflow -> skill

Generate new supporting knowledge into `agent-wiki/notes/`, not legacy wiki folders.
