# Datalox Pack

This repo is a portable Datalox pack for agents.

The current version is intentionally narrow:

- detect a skill on every agent loop
- expose actionable guidance from linked pattern docs
- keep generated skills in `skills/`
- keep reusable pattern docs in `agent-wiki/patterns/`
- lint the skill-pattern graph for broken links and invalid pattern docs
- keep visible control artifacts in `agent-wiki/index.md`, `agent-wiki/log.md`, and `agent-wiki/lint.md`

No server is required.

## Fast Adoption

If the pack repo is already local:

```bash
bash bin/adopt-host-repo.sh /path/to/host-repo
```

If you only have the GitHub repo:

```bash
bash bin/adopt-from-github.sh /path/to/host-repo
```

To wire skills into common agent tools:

```bash
bash bin/setup-multi-agent.sh
```

## Loop Bridge

For automatic loop-time adoption in supported hosts, use the MCP server first and the CLI as fallback:

```bash
npm install
npm run build
node dist/src/mcp/server.js
```

The companion CLI exposes the same core operations:

```bash
node dist/src/cli/main.js resolve --task "review ambiguous live dead gate" --workflow flow_cytometry --json
node dist/src/cli/main.js patch --task "review ambiguous live dead gate" --workflow flow_cytometry --observation "dim dead tail overlaps live shoulder" --interpretation "likely artifact" --action "review exception pattern before widening gate" --json
node dist/src/cli/main.js lint --json
```

Example MCP host config:

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

The human-visible payoff is in three generated files:

- `agent-wiki/index.md`: what the agent currently knows
- `agent-wiki/log.md`: what it changed, including `create_skill`, `update_skill`, `patch_pattern`, and `lint_pack`
- `agent-wiki/lint.md`: whether the pack is still healthy

## Read First

1. [DATALOX.md](DATALOX.md)
2. [.datalox/manifest.json](.datalox/manifest.json)
3. [.datalox/config.json](.datalox/config.json)
4. [AGENTS.md](AGENTS.md)
5. [CLAUDE.md](CLAUDE.md) when relevant
6. [WIKI.md](WIKI.md) and [GEMINI.md](GEMINI.md) when relevant

## Repo Contract

- `skills/`: seed skills for the pack, stored as `skills/<name>/SKILL.md`
- `agent-wiki/patterns/`: seed pattern docs for the pack
- `agent-wiki/index.md`: generated skill-pattern map in the host repo
- `agent-wiki/log.md`: generated operation log in the host repo
- `agent-wiki/lint.md`: generated lint snapshot in the host repo
- `.datalox/skill.schema.md`: authoring contract for future skills
- `START_HERE.md`: human-friendly first-run guide
- host repos should write generated skills into their own `skills/`
- host repos should write generated pattern docs into their own `agent-wiki/patterns/`

## Optional Reference Implementation

The legacy Node scripts are optional helpers for testing the same protocol:

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
The host repo should also show updated `agent-wiki/index.md` and `agent-wiki/log.md`.

## Skill Authoring Rule

Skills should be written as operational playbooks, not metadata wrappers.

- Keep top-level frontmatter minimal: `name`, `description`
- Put Datalox-specific machine fields under `metadata.datalox`
- Put the real procedure in the markdown body

See [skill.schema.md](.datalox/skill.schema.md).

## Docs

- [docs/project-overview.md](docs/project-overview.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)
- [docs/implementation-checklist.md](docs/implementation-checklist.md)
- [START_HERE.md](START_HERE.md)

## Development

```bash
npm install
npm run check
npm test
```
