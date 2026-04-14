---
type: note
kind: workflow_note
title: Capture web knowledge
workflow: web_capture
status: active
related:
  - skills/capture-web-knowledge/SKILL.md
sources: []
updated: 2026-04-14T00:00:00.000Z
---

# Capture Web Knowledge

## When to Use

Use this note when a live website should become reusable repo-local knowledge instead of another one-off screenshot or chat summary.

## Signal

The task needs grounded design evidence, reusable variables, or implementation-ready artifacts from a real site.

## Interpretation

Web capture should write one reusable note first, then emit only the artifact the downstream task actually needs.

## Action

- Use `design-doc` for an agent-facing brief.
- Use `design-tokens` for normalized JSON tokens.
- Use `css-variables` for a reusable `.vars.css` sheet.
- Use `tailwind-theme` only when the target stack actually needs a Tailwind theme artifact.

## Evidence

- Repo notes live under `agent-wiki/notes/web/`.
- Screenshots live under `agent-wiki/assets/web/<slug>/`.
- Derived artifacts live under `designs/web/`.
