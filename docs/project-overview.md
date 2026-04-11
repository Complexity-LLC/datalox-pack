# Project Overview

This repo is the portable, public side of Datalox.

Its purpose is to make the knowledge layer:

- cloneable
- inspectable
- writable by agents
- usable without infrastructure

## Core Model

The durable objects here are:

- `Skill`: an entrypoint for a task or workflow
- `Doc`: the source of truth
- `View`: a materialized agent-facing projection of a doc
- `Capture`: a raw interaction trace
- `Working Pattern`: immediately usable learned behavior

The flow is:

```text
Skill -> Doc -> View
Interaction -> Capture -> Working Pattern -> Working Skill
```

## Retrieval

Retrieval is local-first:

1. select a skill from task text or repo context
2. read its materialized view
3. read raw docs only if needed
4. apply working overlays when they exist

## Learning

Learning is also local-first:

1. capture a repeated interaction
2. materialize a working pattern
3. attach it to a working skill overlay
4. reuse it on the next resolve call

## Why This Repo Exists

This repo should stay focused on:

- pack format
- local retrieval
- local learning
- agent-facing instructions

The backend repo should own:

- hosted retrieval/runtime APIs
- indexing and storage infrastructure
- service-side context compilation
- contributor and permission logic

The backend should implement compatibility with this pack.
This pack should not depend on the backend to work.
