# Product Definition

This is the canonical definition of what `datalox-pack` is.

If other docs drift, this document wins.

## One-Sentence Definition

`datalox-pack` is a knowledge system for agents that helps them build and use reusable skills backed by grounded notes when the environment itself does not provide enough feedback.

## Why This Exists

Coding agents already get dense machine feedback from:

- compiler errors
- tests
- linters
- runtime failures

Many other domains do not have an equivalent loop.

In those domains, the agent often cannot tell:

- what went wrong
- which correction matters
- which pattern should be reused next time

Datalox exists to help create that missing feedback loop.

## What We Are Building

The product has two tightly connected parts:

1. A portable knowledge base for agents.
2. The tooling that captures, promotes, retrieves, and applies that knowledge.

The knowledge base is not a flat pile of memories. Its main durable forms are:

- `skill`
  A reusable operational entrypoint or workflow the agent can invoke again.
- `note`
  A grounded local pattern, exception, rule, or evidence document that supports a skill or stands on its own until a reusable workflow emerges.

The normal structure is:

- agents detect the relevant `skill` first
- that `skill` points to one or more supporting `notes`
- the agent reads the linked notes before acting

Captures grounded in `trace`, `web`, or `pdf` sources feed that system. The tooling does the operational work around it:

- observe traces, artifacts, and corrections
- record grounded evidence
- promote repeated local patterns into `note`
- promote repeated reusable workflows into `skill`
- retrieve the right skill and linked notes at the right loop boundary
- keep setup simple enough that the user's agent can do it

## Source Rules

The knowledge system has two acquisition paths and they should stay distinct:

- `pdf` / `web` / other `source` inputs can create `evidence notes`
- `trace` inputs can create `operational notes`
- only repeated operational evidence should create or patch a `skill`

A `skill` can link both kinds of notes:

- operational notes for action
- source notes for grounding

## Product Boundary

- `pack` = portable protocol and durable knowledge inside the repo
- `adapter` = host-specific enforcement and automation
- `MCP` = shared control surface, not the enforcement mechanism itself

## How Knowledge Should Emerge

Datalox should not be a raw log dump and should not be generic vector memory.

The intended progression is:

- `trace` = what happened
- `candidate` = a grounded reusable pattern worth watching
- `note` = repeated grounded local knowledge
- `skill` = repeated reusable workflow that can point to one or more notes

The system should prefer:

- provenance-aware capture
- high-quality promotion
- agent-readable outputs
- low-human-setup operation

## What We Are Not Building

We are not building:

- a coding-only compiler-feedback product
- a generic chat memory blob
- a hidden server-only memory layer that agents cannot inspect
- a human-first wiki with agent support added later

## Stable Product Sentence

Use this sentence when describing the project:

> Datalox is a knowledge system for agents that turns traces, artifacts, and corrections into reusable skills backed by grounded notes when the environment itself does not provide enough feedback.

## Repo Rule

When repo docs talk about Datalox, they should stay consistent with this definition:

- skills first, linked notes second
- knowledge base plus tooling, not a flat memory blob
- tooling around capture/promotion/retrieval after the skill-note structure
- missing feedback loops as the reason the product exists
- agent-first operation and setup
