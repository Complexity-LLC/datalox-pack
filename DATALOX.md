# Datalox Pack Protocol

This pack is intentionally simple.

An agent should use it on every loop with one minimal cycle:

1. detect
2. use
3. patch
4. lint

Do not replace the agent's native skills. Datalox is additive.

## Read Order

1. `.datalox/manifest.json`
2. `.datalox/config.local.json` if it exists
3. `.datalox/config.json`
4. this file
5. `AGENTS.md` or a tool-specific instruction file if present

If this pack is used from another repo, read seed knowledge from this repo and write generated knowledge into the host repo.

## Loop Rule

At the start of every agent loop:

1. inspect current task text and workflow
2. inspect repo context when needed:
   changed git paths, repo root files, and package metadata
3. select the best matching skill in `skills/`
4. read the pattern docs listed in that skill's `patternPaths`
5. act using the pattern docs' signal, interpretation, and recommended action

Host repo skills and pattern docs override seed-pack files when both define the same knowledge.

This is the `detect -> use` part of the loop.

## Learning Rule

When the agent discovers a reusable pattern:

1. write a pattern doc into `.datalox/patterns/`
2. update or create a skill in `skills/`
3. put the pattern doc path into that skill's `patternPaths`

This is the `patch` part of the loop.

These writes belong to the host repo, not the seed pack repo.

## Lint Rule

Run lint over the local pack when changing skills or pattern docs.

Lint checks:

- skills missing `patternPaths`
- missing pattern doc paths
- pattern docs missing `Signal`, `Interpretation`, or `Recommended Action`
- orphan pattern docs
- duplicate or overlapping skills in the same workflow

This is the `lint` part of the loop.

There is no separate working layer in this version.

## Skill Shape

Each skill is a JSON file in `skills/` with:

- `id`
- `name`
- `workflow`
- `trigger`
- `description`
- `patternPaths`

## Current Default

- mode: `repo_only`
- runtime required: `false`
- detect on every loop: `true`
