# Product Definition

This is the canonical definition of what `datalox-pack` is.

If other docs drift, this document wins.

## One-Sentence Definition

`datalox-pack` is a knowledge base for agents plus the tooling that captures, curates, retrieves, and applies that knowledge when the environment itself does not provide enough feedback.

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

1. A knowledge base for agents.
2. The tooling that captures, promotes, retrieves, and applies that knowledge.

The knowledge base stores reusable, agent-readable knowledge such as:

- notes
- skills
- captures grounded in trace, web, or PDF sources

The tooling does the operational work around that knowledge:

- observe traces, artifacts, and corrections
- record grounded evidence
- promote repeated or reusable patterns into durable knowledge
- retrieve the right knowledge at the right loop boundary
- keep setup simple enough that the user's agent can do it

## Product Boundary

- `pack` = portable protocol and durable knowledge inside the repo
- `adapter` = host-specific enforcement and automation
- `MCP` = shared control surface, not the enforcement mechanism itself

## How Knowledge Should Emerge

Datalox should not be a raw log dump and should not be generic vector memory.

The intended progression is:

- `trace` = what happened
- `candidate` = a grounded reusable pattern worth watching
- `note` = repeated local knowledge
- `skill` = repeated reusable workflow

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

> Datalox is a knowledge system for agents that turns traces, artifacts, and corrections into reusable, high-quality, agent-readable knowledge when the environment itself does not provide enough feedback.

## Repo Rule

When repo docs talk about Datalox, they should stay consistent with this definition:

- knowledge base first
- tooling around capture/promotion/retrieval second
- missing feedback loops as the reason the product exists
- agent-first operation and setup
