# Datalox Pack Gemini Instructions

This repo is a portable Datalox pack for agents.

Use it on every loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. detect a skill from `skills/<name>/SKILL.md`
4. read the linked pattern docs in `.datalox/patterns/`
5. use the pattern docs' signal, interpretation, and recommended action

When you learn something reusable:

1. write a pattern doc into the host repo `.datalox/patterns/`
2. update or create a host repo skill in `skills/`
3. lint the pack
4. refresh:
   - `.datalox/index.md`
   - `.datalox/log.md`
   - `.datalox/lint.md`

Preserve native Gemini or platform skills. Datalox is additive.
