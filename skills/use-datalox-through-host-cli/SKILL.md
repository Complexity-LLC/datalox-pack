---
name: use-datalox-through-host-cli
description: Use when an agent host has no enforced Datalox wrapper path, or when MCP/native skill/hook surfaces are available but still model-chosen. Prefer `datalox codex` for Codex exec flows, `datalox claude` for Claude prompt runs, and `datalox wrap` for other CLI hosts.
metadata:
  datalox:
    id: repo-engineering.use-datalox-through-host-cli
    workflow: repo_engineering
    trigger: Use when the host agent cannot auto-call Datalox through MCP or hooks and needs a CLI wrapper path.
    note_paths:
      - agent-wiki/notes/use-datalox-through-host-cli.md
    tags:
      - repo_engineering
      - host_adapter
      - cli_wrapper
      - codex
    status: approved
    author: yifanjin
---

# Use Datalox Through Host CLI

Use this skill when the host agent cannot receive Datalox guidance through an enforced pre-run wrapper, but still needs loop guidance on every run.

## When to Use

- The host has no MCP support
- The host has no automatic pre-turn or post-turn hook API
- The host has MCP tools, but the active session is not inside an enforced Datalox wrapper
- Claude Code has native skills, MCP, or Stop-hook automation, but no active Claude wrapper sentinel
- The agent is launched from a CLI and accepts a prompt argument or environment variables
- You need a deterministic fallback that still injects Datalox guidance

## When Not to Use

- The active session is already inside an enforced Datalox wrapper such as `datalox codex` or `datalox claude`
- The task only needs post-turn recording and the host hook already calls `bin/datalox-auto-promote.js`
- The task is not agent-loop work and does not need pack guidance

## Workflow

1. If MCP tools are available in the active session, call `resolve_loop` before acting.
2. Use `record_turn_result` after meaningful grounded outcomes.
3. Treat native Codex chat with MCP as guidance-only unless a Datalox wrapper sentinel is present.
4. Treat Claude Code native skills and MCP as model-chosen guidance unless `currentSession.activeWrapper` is `"claude"` and `currentSession.wrapperEnforced` is `true`.
5. Treat the Claude Stop hook as post-turn sidecar automation only; it can record, compile, and maintain after Claude responds, but it cannot force pre-turn `resolve_loop`.
6. For enforceable Codex `exec`, use `datalox codex --repo <repo> --task "<task>" --prompt "<prompt>"`.
7. For enforceable Claude prompt runs, use `datalox claude --repo <repo> --task "<task>" --prompt "<prompt>" -- --print "<prompt>"` or the installed Claude shim when status proves it is automatic.
8. For other CLI hosts, use `datalox wrap command --repo <repo> --task "<task>" --prompt "<prompt>" -- <host-command> __DATALOX_PROMPT__`.
9. If the host cannot accept prompt placeholders, use `datalox wrap prompt` and pass the returned prompt to the host manually.
10. When the host has no automatic post-turn hook or wrapper, use `datalox record` or `datalox promote` explicitly after repeated corrections.

## Checks Before Editing

- Keep the wrapper thin. It should resolve guidance and pass it into the host, not reimplement pack logic.
- Preserve the host repo as the write target for generated skills and wiki pages.
- Prefer placeholders and environment variables over shell-specific quoting tricks.
- Keep Codex-specific behavior inside the Codex wrapper and everything else in the generic wrapper.
- Do not describe MCP availability as enforcement. MCP-only sessions still depend on the agent choosing to call the tools.
- Do not describe Claude Stop-hook or native-skill availability as pre-run enforcement.
- Keep Datalox additive to Claude native skills; do not shadow or replace Claude's own skill behavior.

## Expected Output

- State which surface is being used: MCP, hook, native skill, `datalox codex`, `datalox claude`, or `datalox wrap`.
- State how the wrapped prompt is injected into the host.
- State whether the active session is wrapper-enforced or guidance-only.
- State whether promotion stays automatic or requires manual `record` / `promote`.

## Notes

- agent-wiki/notes/use-datalox-through-host-cli.md
