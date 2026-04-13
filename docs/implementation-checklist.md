# MCP And CLI Implementation Checklist

This is the concrete implementation plan for making Datalox active on every agent loop.

## Recommendation

Build:

- one shared core
- MCP first
- CLI as required companion

Do not try to solve "universal automatic adoption" with repo files alone. The pack remains the source of truth, but a loop bridge must own pre-turn and post-turn behavior.

## Product Boundary

Keep the current pack as the durable knowledge layer:

- `skills/<skill-name>/SKILL.md`
- `agent-wiki/patterns/*.md`
- `agent-wiki/sources/*.md`
- `agent-wiki/concepts/*.md`
- `agent-wiki/comparisons/*.md`
- `agent-wiki/questions/*.md`
- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`

The skill loop should stay small:

1. detect a skill
2. read linked pattern docs
3. follow `related` and `sources` only when needed
4. patch knowledge
5. lint and refresh artifacts

Add a loop bridge that:

1. resolves the current skill before the model acts
2. injects compact guidance into the loop
3. patches knowledge after reusable learning
4. refreshes index, log, lint, and hot cache

## Phase 1: Shared Core

- [x] Extract the reusable logic from [agent-pack.mjs](/Users/yifanjin/datalox-pack/scripts/lib/agent-pack.mjs) into a shared core module.
- [x] Keep the core transport-free. No CLI-only or MCP-only assumptions.
- [x] Move these operations behind stable functions:
  - `resolveLoop`
  - `patchKnowledge`
  - `lintPack`
  - `adoptPack`
  - `refreshControlArtifacts`
- [x] Keep markdown files as the source of truth. Do not introduce a separate compiled database as the primary store.
- [x] Preserve host-write, seed-read behavior.

## Phase 2: MCP First

- [x] Create an MCP server package or entrypoint in this repo.
- [x] Expose only four tools:
  - `resolve_loop`
  - `patch_knowledge`
  - `lint_pack`
  - `adopt_pack`
- [x] Make MCP responses strict JSON, not markdown.
- [x] Keep the MCP layer thin. It should only validate input, call core functions, and return structured output.
- [x] Make `resolve_loop` return:
  - selected skill
  - why matched
  - what to do now
  - watch for
  - supporting pattern docs
- [x] Make `patch_knowledge` return:
  - pattern written
  - skill `create_skill` or `update_skill`
  - refreshed artifact paths
- [x] Make `lint_pack` return issues plus the refreshed `agent-wiki/lint.md` path.
- [x] Add one documented MCP integration example for Claude/Codex-compatible hosts.

## Phase 3: CLI Companion

- [x] Replace script-first public usage with one stable `datalox` command surface.
- [x] Support these commands:
  - `datalox adopt`
  - `datalox resolve`
  - `datalox patch`
  - `datalox lint`
- [x] Keep `--json` on every command.
- [x] Make CLI a wrapper over the same core used by MCP.
- [x] Keep the existing scripts only as temporary compatibility shims or remove them once the CLI is stable.

## Phase 4: Loop Ownership

- [x] Define the pre-turn contract:
  - current task
  - optional workflow
  - optional step
  - repo context
- [x] Define the post-turn contract:
  - observation
  - interpretation
  - recommended action
  - optional explicit skill id
- [x] Ensure the bridge, not the model alone, decides when to call resolve and patch.
- [x] Keep skill creation conservative:
  - create a new skill only when no existing skill matches strongly enough
  - otherwise patch the matched skill with a new pattern doc

## Phase 5: Control And Trust

- [x] Keep `agent-wiki/index.md` refreshed after create/update operations.
- [x] Keep `agent-wiki/log.md` refreshed after create/update/lint operations.
- [x] Keep `agent-wiki/lint.md` refreshed after lint operations.
- [x] Preserve explicit events in the log:
  - `create_skill`
  - `update_skill`
  - `patch_pattern`
  - `lint_pack`
- [x] Keep lint enforcing both:
  - structural graph health
  - skill playbook quality

## Phase 6: Verification

- [x] Add one end-to-end MCP test:
  - resolve
  - patch
  - lint
  - artifact refresh
- [x] Add one end-to-end CLI test for the same loop.
- [x] Add one host-repo adoption test where the pack is external and all writes land in the host repo.
- [x] Add one explicit no-match test that proves a new skill is created.
- [x] Keep `npm run check` and `npm test` green.

## Phase 7: Grounded Promotion Ladder

- [x] Add a host-owned event substrate under `agent-wiki/events/` for grounded turn results.
- [x] Record the current task, matched skill, matched wiki pages, and reusable observation before promoting anything.
- [x] Expose a core `recordTurnResult` operation and surface it through:
  - `record_turn_result` in MCP
  - `datalox record` in CLI
- [x] Add a core `promoteGap` operation with conservative thresholds:
  - first occurrence -> `record_only`
  - repeated gap with an existing skill match -> patch skill with a new pattern
  - repeated gap with no skill match -> create wiki pattern first, then create skill only after a higher threshold
- [x] Keep new-skill creation stricter than wiki promotion.
- [x] Log promotion decisions explicitly so humans can inspect why a gap became a wiki page or skill.
- [x] Add integration tests for:
  - record-only behavior
  - repeated-gap wiki promotion
  - repeated-gap skill creation

## Phase 8: Host Hook Automation

- [x] Add one generic post-turn hook entrypoint that any host can call:
  - `node bin/datalox-auto-promote.js`
- [x] Make the hook source-first so it works from the pack repo or the local GitHub cache without requiring `dist/`.
- [x] Add a real Claude Code integration:
  - `.claude/settings.json`
  - `.claude/hooks/auto-promote.sh`
- [x] Ensure host adoption copies the hook files into the host repo.
- [x] Ensure local adoption can resolve the pack runtime through `~/.datalox/cache/datalox-pack`.
- [x] Keep Codex on MCP for loop ownership until it exposes a real post-turn hook surface.
- [x] Add a test that feeds a stop-hook payload plus transcript into the hook runner and proves repeated events promote into a wiki page and then a skill.

## Phase 9: Host Wrappers

- [x] Add a Codex wrapper that resolves loop guidance before `codex exec`.
- [x] Add a generic CLI wrapper that can inject `__DATALOX_PROMPT__` into arbitrary host commands.
- [x] Expose wrapper env vars so unsupported hosts can read `DATALOX_PROMPT` and `DATALOX_GUIDANCE_JSON`.
- [x] Copy wrapper entrypoints into adopted host repos.
- [x] Ship a companion skill that tells agents when to use the wrapper fallback path.
- [x] Add wrapper tests for prompt-only wrapping, generic command wrapping, and Codex wrapper execution.

## Acceptance Criteria

This work is done when:

- [x] A supported agent host can call Datalox before each loop through MCP.
- [x] The returned guidance changes the agent's behavior in the current turn.
- [x] Reusable learning can be written back through MCP or CLI.
- [x] New skills are visibly created when there is no good match.
- [x] Existing skills are patched instead of duplicated when a match already exists.
- [x] `agent-wiki/index.md`, `agent-wiki/log.md`, and `agent-wiki/lint.md` remain the visible control surface.

## Non-Goals

Do not do these in the first bridge pass:

- [ ] no hosted Datalox server requirement
- [ ] no new UI
- [ ] no generic plugin marketplace
- [ ] no vector database as the primary store
- [ ] no large fallback chain for loop resolution

## Current Best Practice

For this repo, the best practice is:

1. keep the pack simple
2. build MCP first
3. keep CLI as the fallback and bootstrap path
4. let the bridge own the loop

That is the shortest path from portable pack to real agent adoption.
