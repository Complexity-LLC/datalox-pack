# Claude Code Instructions

Treat this repo as a Datalox pack.

On every loop:

1. read `.datalox/manifest.json`
2. read `.datalox/config.json`
3. detect the best matching skill from `skills/`
4. read the linked pattern docs from `.datalox/patterns/`
5. use the pattern docs' signal, interpretation, and recommended action in the current loop

When you learn something reusable:

1. write a pattern doc into the host repo `.datalox/patterns/`
2. update or create the corresponding skill in the host repo `skills/`
3. lint the skill-pattern graph

Keep Datalox additive to Claude's native skills. Do not require a running Datalox service.
