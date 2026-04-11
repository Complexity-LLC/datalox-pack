# Datalox Pack

This repo is the public portable Datalox pack.

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

## What It Does

- lets an agent resolve local skills and supporting docs
- lets an agent read materialized views before raw docs
- lets an agent capture repeated interactions locally
- lets an agent materialize working patterns and working skill overlays
- works without a Datalox server

## Read First

1. [DATALOX.md](DATALOX.md)
2. [.datalox/manifest.json](.datalox/manifest.json)
3. [.datalox/config.json](.datalox/config.json)
4. [AGENTS.md](AGENTS.md)
5. [CLAUDE.md](CLAUDE.md) when relevant

## Local-Only Flow

Resolve knowledge:

```bash
node scripts/agent-resolve.mjs
node scripts/agent-resolve.mjs --task "review ambiguous live dead gate" --workflow flow_cytometry
```

Learn from interaction:

```bash
node scripts/agent-learn-from-interaction.mjs \
  --task "review ambiguous live dead gate" \
  --workflow flow_cytometry \
  --observation "dim dead tail overlaps live shoulder" \
  --interpretation "likely artifact" \
  --action "review exception doc before widening gate"
```

That flow writes:

- a raw interaction capture to `.datalox/captures/`
- a working pattern to `.datalox/working/patterns/`
- a working skill overlay to `.datalox/working/skills/`

The next resolve call can use that knowledge immediately.

## Docs

- [docs/project-overview.md](docs/project-overview.md)
- [docs/agent-configuration.md](docs/agent-configuration.md)

## Development

```bash
npm install
npm run check
npm test
```
