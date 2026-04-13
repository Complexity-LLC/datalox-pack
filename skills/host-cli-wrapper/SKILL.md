---
name: host-cli-wrapper
description: Use when an agent host has no MCP integration or post-turn hook API, but you still need Datalox loop guidance injected into CLI-driven runs. Prefer `datalox codex` for Codex exec flows and `datalox wrap` for other CLI hosts.
metadata:
  datalox:
    id: repo-engineering.host-cli-wrapper
    workflow: repo_engineering
    trigger: Use when the host agent cannot auto-call Datalox through MCP or hooks and needs a CLI wrapper path.
    pattern_paths:
      - agent-wiki/meta/host-cli-wrapper-fallback.md
    tags:
      - repo_engineering
      - host_adapter
      - cli_wrapper
      - codex
    status: approved
    author: yifanjin
---

# Host CLI Wrapper

Use this skill when the host agent cannot call Datalox automatically through MCP or a post-turn hook, but still needs loop guidance on every run.

## When to Use

- The host has no MCP support
- The host has no automatic pre-turn or post-turn hook API
- The agent is launched from a CLI and accepts a prompt argument or environment variables
- You need a deterministic fallback that still injects Datalox guidance

## When Not to Use

- The host already supports MCP and can call `resolve_loop` directly
- The host already supports a post-turn hook and can call `bin/datalox-auto-promote.js`
- The task is not agent-loop work and does not need pack guidance

## Workflow

1. Prefer MCP if the host supports it.
2. Otherwise, prefer native hooks if the host supports them.
3. For Codex `exec`, use `datalox codex --repo <repo> --task "<task>" --prompt "<prompt>"`.
4. For other CLI hosts, use `datalox wrap command --repo <repo> --task "<task>" --prompt "<prompt>" -- <host-command> __DATALOX_PROMPT__`.
5. If the host cannot accept prompt placeholders, use `datalox wrap prompt` and pass the returned prompt to the host manually.
6. When the host has no automatic post-turn hook, use `datalox record` or `datalox promote` explicitly after repeated corrections.

## Checks Before Editing

- Keep the wrapper thin. It should resolve guidance and pass it into the host, not reimplement pack logic.
- Preserve the host repo as the write target for generated skills and wiki pages.
- Prefer placeholders and environment variables over shell-specific quoting tricks.
- Keep Codex-specific behavior inside the Codex wrapper and everything else in the generic wrapper.

## Expected Output

- State which wrapper path is being used: MCP, hook, `datalox codex`, or `datalox wrap`.
- State how the wrapped prompt is injected into the host.
- State whether promotion stays automatic or requires manual `record` / `promote`.

## Pattern Docs

- agent-wiki/meta/host-cli-wrapper-fallback.md

