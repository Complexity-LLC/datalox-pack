# Datalox Pack

This repo is the public portable Datalox pack.

It is designed to work with no install requirement. The pack files are the
interface. Another agent should be able to use this repo after `git clone` by
reading the contract files directly.

It owns the repo-native knowledge contract:

- `.datalox/config.json`
- `.datalox/manifest.json`
- `.datalox/skills/`
- `.datalox/docs/`
- `.datalox/views/`
- `.datalox/captures/`
- `.datalox/working/`
- `.datalox/proposals/`

This repo is not the hosted backend/runtime service.
The backend should live in a separate repo and implement compatibility with this pack format.

## No-Install Path

Read these files in order:

1. [DATALOX.md](DATALOX.md)
2. [.datalox/manifest.json](.datalox/manifest.json)
3. [.datalox/config.json](.datalox/config.json)
4. [AGENTS.md](AGENTS.md)
5. [CLAUDE.md](CLAUDE.md) when relevant

If an agent can read those files and act on them, it can use the pack.

## What It Does

- lets an agent resolve local skills and supporting docs
- lets an agent read materialized views before raw docs
- lets an agent capture repeated interactions locally
- lets an agent materialize working patterns and working skill overlays
- works without a Datalox server

## Conformance

The pack is correct when another agent can follow the file protocol without
running the Node scripts.

Read:

- [docs/conformance.md](docs/conformance.md)
- [.datalox/conformance/resolve-approved-skill.json](.datalox/conformance/resolve-approved-skill.json)
- [.datalox/conformance/learn-working-pattern.json](.datalox/conformance/learn-working-pattern.json)
- [.datalox/conformance/refresh-working-skill.json](.datalox/conformance/refresh-working-skill.json)

## Docs

- [docs/project-overview.md](docs/project-overview.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)
- [docs/conformance.md](docs/conformance.md)

## Optional Reference Implementation

The `scripts/` directory is a reference implementation of the file protocol.
It is useful for CI, testing, and debugging, but it is not required for normal
pack use.

Examples:

```bash
node scripts/agent-resolve.mjs --task "review ambiguous live dead gate" --workflow flow_cytometry

node scripts/agent-learn-from-interaction.mjs \
  --task "review ambiguous live dead gate" \
  --workflow flow_cytometry \
  --observation "dim dead tail overlaps live shoulder" \
  --interpretation "likely artifact" \
  --action "review exception doc before widening gate"
```

## Development

```bash
npm install
npm run check
npm test
```
