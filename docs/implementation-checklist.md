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
- `.datalox/patterns/*.md`
- `.datalox/index.md`
- `.datalox/log.md`
- `.datalox/lint.md`

Add a loop bridge that:

1. resolves the current skill before the model acts
2. injects compact guidance into the loop
3. patches knowledge after reusable learning
4. refreshes index, log, and lint

## Phase 1: Shared Core

- [ ] Extract the reusable logic from [agent-pack.mjs](/Users/yifanjin/datalox-pack/scripts/lib/agent-pack.mjs) into a shared core module.
- [ ] Keep the core transport-free. No CLI-only or MCP-only assumptions.
- [ ] Move these operations behind stable functions:
  - `resolveLoop`
  - `patchKnowledge`
  - `lintPack`
  - `adoptPack`
  - `refreshControlArtifacts`
- [ ] Keep markdown files as the source of truth. Do not introduce a separate compiled database as the primary store.
- [ ] Preserve host-write, seed-read behavior.

## Phase 2: MCP First

- [ ] Create an MCP server package or entrypoint in this repo.
- [ ] Expose only four tools:
  - `resolve_loop`
  - `patch_knowledge`
  - `lint_pack`
  - `adopt_pack`
- [ ] Make MCP responses strict JSON, not markdown.
- [ ] Keep the MCP layer thin. It should only validate input, call core functions, and return structured output.
- [ ] Make `resolve_loop` return:
  - selected skill
  - why matched
  - what to do now
  - watch for
  - supporting pattern docs
- [ ] Make `patch_knowledge` return:
  - pattern written
  - skill `create_skill` or `update_skill`
  - refreshed artifact paths
- [ ] Make `lint_pack` return issues plus the refreshed `.datalox/lint.md` path.
- [ ] Add one documented MCP integration example for Claude/Codex-compatible hosts.

## Phase 3: CLI Companion

- [ ] Replace script-first public usage with one stable `datalox` command surface.
- [ ] Support these commands:
  - `datalox adopt`
  - `datalox resolve`
  - `datalox patch`
  - `datalox lint`
- [ ] Keep `--json` on every command.
- [ ] Make CLI a wrapper over the same core used by MCP.
- [ ] Keep the existing scripts only as temporary compatibility shims or remove them once the CLI is stable.

## Phase 4: Loop Ownership

- [ ] Define the pre-turn contract:
  - current task
  - optional workflow
  - optional step
  - repo context
- [ ] Define the post-turn contract:
  - observation
  - interpretation
  - recommended action
  - optional explicit skill id
- [ ] Ensure the bridge, not the model alone, decides when to call resolve and patch.
- [ ] Keep skill creation conservative:
  - create a new skill only when no existing skill matches strongly enough
  - otherwise patch the matched skill with a new pattern doc

## Phase 5: Control And Trust

- [ ] Keep `.datalox/index.md` refreshed after create/update operations.
- [ ] Keep `.datalox/log.md` refreshed after create/update/lint operations.
- [ ] Keep `.datalox/lint.md` refreshed after lint operations.
- [ ] Preserve explicit events in the log:
  - `create_skill`
  - `update_skill`
  - `patch_pattern`
  - `lint_pack`
- [ ] Keep lint enforcing both:
  - structural graph health
  - skill playbook quality

## Phase 6: Verification

- [ ] Add one end-to-end MCP test:
  - resolve
  - patch
  - lint
  - artifact refresh
- [ ] Add one end-to-end CLI test for the same loop.
- [ ] Add one host-repo adoption test where the pack is external and all writes land in the host repo.
- [ ] Add one explicit no-match test that proves a new skill is created.
- [ ] Keep `npm run check` and `npm test` green.

## Acceptance Criteria

This work is done when:

- [ ] A supported agent host can call Datalox before each loop through MCP.
- [ ] The returned guidance changes the agent's behavior in the current turn.
- [ ] Reusable learning can be written back through MCP or CLI.
- [ ] New skills are visibly created when there is no good match.
- [ ] Existing skills are patched instead of duplicated when a match already exists.
- [ ] `.datalox/index.md`, `.datalox/log.md`, and `.datalox/lint.md` remain the visible control surface.

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
