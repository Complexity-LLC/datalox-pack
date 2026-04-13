# Datalox Pack Protocol

This pack is intentionally simple.

An agent should use it on every loop with one minimal cycle:

1. detect
2. use
3. record
4. promote
5. lint

The pack must also keep four visible control artifacts in the host repo:

- `agent-wiki/index.md`
- `agent-wiki/log.md`
- `agent-wiki/lint.md`
- `agent-wiki/hot.md`

Do not replace the agent's native skills. Datalox is additive.
When a host supports post-turn hooks, `node bin/datalox-auto-promote.js` is the standard automatic promotion entrypoint.

## Read Order

1. `.datalox/manifest.json`
2. `.datalox/config.local.json` if it exists
3. `.datalox/config.json`
4. this file
5. `agent-wiki/hot.md` if it exists
6. `AGENTS.md` or a tool-specific instruction file if present

Common committed tool-specific entry files in this repo:

- `CLAUDE.md`
- `WIKI.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/datalox-pack.mdc`
- `.windsurf/rules/datalox-pack.md`

If this pack is used from another repo, read seed knowledge from this repo and write generated knowledge into the host repo.

## Loop Rule

At the start of every agent loop:

1. inspect current task text and workflow
2. inspect repo context when needed:
   changed git paths, repo root files, and package metadata
3. select the best matching skill in `skills/`
4. read the pattern docs listed in that skill's `metadata.datalox.pattern_paths`
5. if needed, follow the pattern docs' `related` and `sources` links into the wider `agent-wiki/`
6. act using the pattern docs' signal, interpretation, and recommended action

Host repo skills and pattern docs override seed-pack files when both define the same knowledge.

This is the `detect -> use` part of the loop.

## Learning Rule

When the agent discovers a reusable gap:

1. record the turn result into `agent-wiki/events/`
2. keep the first occurrence as an event only
3. promote repeated evidence into a wiki page or skill conservatively

Promotion rule:

- occurrence `1`: `record_only`
- occurrence `2` with an existing skill match: `patch_skill_with_pattern`
- occurrence `2` with no skill match: `create_wiki_pattern`
- occurrence `3+` with no skill match: `create_skill_from_gap`

If the new knowledge still belongs to an existing task boundary, patch the current skill. Create a new skill only when the work represents a distinct recurring task with its own stable trigger and workflow.

This is the `record -> promote` part of the loop.

These writes belong to the host repo, not the seed pack repo.

After patching, refresh:

- `agent-wiki/index.md` so the current skill-pattern graph is visible
- `agent-wiki/log.md` so the change is recorded chronologically
- `agent-wiki/hot.md` so the next session can restore recent context

`agent-wiki/events/` is the grounded evidence layer behind those promotions.

## Lint Rule

Run lint over the local pack when changing skills or wiki pages.

Lint checks:

- skills missing `metadata.datalox.pattern_paths`
- missing pattern doc paths
- pattern docs missing `Signal`, `Interpretation`, or `Recommended Action`
- pattern docs missing evidence or related pages
- orphan pattern docs and orphan supporting wiki pages
- duplicate or overlapping skills in the same workflow
- overdue `review_after` pages
- contradiction pages without supporting evidence or source links

This is the `lint` part of the loop.

There is no separate working layer in this version.

After linting, refresh:

- `agent-wiki/lint.md` with the latest pack health snapshot
- `agent-wiki/log.md` with the lint result

## Control Artifacts

### `agent-wiki/index.md`

Human-readable map of the current effective pack:

- skills
- triggers
- linked pattern docs
- supporting wiki pages by type
- source origin (`host` or `seed`)
- last updated metadata when available

### `agent-wiki/log.md`

Append-only change trail. Record at least:

- pattern docs written
- skills created
- skills updated
- lint runs

### `agent-wiki/lint.md`

Latest lint snapshot in markdown so a human can see why the pack is healthy or broken without running tools.

### `agent-wiki/hot.md`

Recent-context cache for the next session. This should be the first wiki page an agent reads when it wants fast local context instead of scanning the whole knowledge layer.

## Agent Wiki Shape

`agent-wiki/` is a typed supporting knowledge layer:

- `patterns/`: loop-time judgment and action pages
- `sources/`: provenance and supporting source pages
- `concepts/`: reusable domain ideas behind patterns
- `comparisons/`: choice pages for competing workflows or interpretations
- `questions/`: recurring open questions with current answers
- `meta/`: maintenance and control pages for the wiki itself

Skills should usually link to `patterns/` first. Patterns can then point into the rest of `agent-wiki/` through `related` and `sources`.

## Skill Shape

Each skill should live at `skills/<skill-name>/SKILL.md`.

Use YAML frontmatter plus markdown body.

Top-level required frontmatter fields:

- `name`
- `description`

Put Datalox-specific runtime fields under `metadata.datalox`.

Recommended `metadata.datalox` fields:

- `id`
- `workflow`
- `trigger`
- `pattern_paths`
- `tags`

Optional `metadata.datalox` fields:

- `display_name`
- `status`
- `author`
- `updated_at`
- `repo_hints`

The skill body must be the primary workflow artifact. It should contain a real playbook:

- `When to Use`
- `Workflow`
- `Expected Output`
- `Pattern Docs`

See `.datalox/skill.schema.md`.

## Current Default

- mode: `repo_only`
- runtime required: `false`
- detect on every loop: `true`

## Practical Distribution

For host repo adoption:

- local pack: `bash bin/adopt-host-repo.sh /path/to/host-repo`
- GitHub-hosted pack: `bash bin/adopt-from-github.sh /path/to/host-repo`

For multi-agent skill discovery:

- `bash bin/setup-multi-agent.sh`

For loop ownership in supported hosts:

- prefer the MCP bridge at `node dist/src/mcp/server.js`
- use the CLI bridge at `node dist/src/cli/main.js` when MCP is not available
- use `record_turn_result` / `datalox record` before promotion when you need explicit event grounding
- use `promote_gap` / `datalox promote` when you want the pack to decide between event-only, wiki promotion, or skill creation
- for hosts with hook APIs, use `node bin/datalox-auto-promote.js` as the post-turn hook command

Minimal MCP host config:

```json
{
  "mcpServers": {
    "datalox-pack": {
      "command": "node",
      "args": ["/absolute/path/to/datalox-pack/dist/src/mcp/server.js"]
    }
  }
}
```

Implementation status and remaining work:

- see `docs/implementation-checklist.md`
