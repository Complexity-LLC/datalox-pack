---
type: meta
title: Capture web knowledge
workflow: web_capture
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources: []
updated: 2026-04-13T00:00:00.000Z
---

# Capture Web Knowledge

## Signal

The agent needs concrete reusable knowledge from a live website, not another abstract discussion.

## Interpretation

The right move is to capture observable layout, tokens, and components into repo files the agent can reuse later.

## Recommended Action

Run the web capture flow, save screenshots, keep the source page in `agent-wiki/sources/web/`, and only generate `designs/web/<slug>.md` when a design brief is actually needed.

## Evidence

- `designs/web/<slug>.md` becomes an optional working brief.
- `agent-wiki/sources/web/*.md` stores the backing evidence.

## Related

- agent-wiki/concepts/loop-bridge.md
