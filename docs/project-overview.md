# Project Overview

This repo is the portable public side of Datalox.

The current version is intentionally small.

## What It Is

Datalox gives an agent two repo-local things:

- `Skill`: a lightweight entrypoint for a task or workflow
- `Agent Wiki`: the supporting knowledge layer a skill points to

The loop is:

```text
current task -> detect skill -> read pattern docs -> act
                           -> patch when needed
                           -> lint after patch
```

## What Gets Written

When the agent learns something reusable:

```text
interaction -> pattern doc -> skill update
```

Generated skills stay in `skills/`.
Loop-time pattern docs live in `agent-wiki/patterns/`.
Richer support can live in `agent-wiki/sources/`, `agent-wiki/concepts/`, `agent-wiki/comparisons/`, and `agent-wiki/questions/`.

When the pack is external, those writes belong to the host repo while this repo remains the seed pack.

## Why It Is So Small

This repo is for proving one thing first:

an agent can detect the right repo-local skill every loop, use linked wiki pages immediately, and keep the graph healthy with lint.

Everything else is secondary until that works reliably.
