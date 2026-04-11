# Datalox Pack

This repo is a portable Datalox pack for agents.

The current version is intentionally narrow:

- detect a skill on every agent loop
- expose actionable guidance from linked pattern docs
- keep generated skills in `skills/`
- keep reusable pattern docs in `.datalox/patterns/`
- lint the skill-pattern graph for broken links and invalid pattern docs

No server is required.

## Core Loop

The pack is built around one minimal loop:

1. `detect`
   Find the best matching skill in `skills/` from task text, workflow, and repo context.
2. `use`
   Read the linked pattern docs and surface `why matched`, `what to do now`, and `watch for`.
3. `patch`
   When the agent finds a reusable gap, write a pattern doc and update or create a skill.
4. `lint`
   Check that the skill-pattern graph is still coherent.

When this pack is used from another repo, it acts as a seed pack. Reads can come from this repo, but generated skills and pattern docs must be written into the host repo.

## Read First

1. [DATALOX.md](DATALOX.md)
2. [.datalox/manifest.json](.datalox/manifest.json)
3. [.datalox/config.json](.datalox/config.json)
4. [AGENTS.md](AGENTS.md)
5. [CLAUDE.md](CLAUDE.md) when relevant

## Repo Contract

- `skills/`: seed skills for the pack
- `.datalox/patterns/`: seed pattern docs for the pack
- host repos should write generated skills into their own `skills/`
- host repos should write generated pattern docs into their own `.datalox/patterns/`

## Optional Reference Implementation

The Node scripts are optional helpers for testing the same protocol:

```bash
# detect + use
node scripts/agent-resolve.mjs --task "review ambiguous live dead gate" --workflow flow_cytometry

# patch
node scripts/agent-lint.mjs

node scripts/agent-learn-from-interaction.mjs \
  --task "review ambiguous live dead gate" \
  --workflow flow_cytometry \
  --observation "dim dead tail overlaps live shoulder" \
  --interpretation "likely artifact" \
  --action "review exception doc before widening gate"

# lint
node scripts/agent-lint.mjs
```

After the patch step, the next resolve call should return the updated skill with the new pattern doc already linked in.

## Docs

- [docs/project-overview.md](docs/project-overview.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)

## Development

```bash
npm install
npm run check
npm test
```
