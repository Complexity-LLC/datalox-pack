# Conformance

This pack is designed to work without installation.

Conformance means an agent can read the pack files directly, follow the
protocol in [DATALOX.md](/Users/yifanjin/datalox-pack/DATALOX.md), and
complete the example flows in `.datalox/conformance/` without relying on the
Node scripts.

## Required Behaviors

1. Read `.datalox/manifest.json` and `.datalox/config.json`.
2. Resolve an approved skill from task text and repo context.
3. Prefer a materialized view over the raw doc when both exist.
4. Write raw interaction traces to `.datalox/captures/`.
5. Write immediate-use overlays to `.datalox/working/`.
6. Keep review-oriented candidates in `.datalox/proposals/`.
7. Preserve the agent's native/global skills.

## Example Cases

- `.datalox/conformance/resolve-approved-skill.json`
- `.datalox/conformance/learn-working-pattern.json`
- `.datalox/conformance/refresh-working-skill.json`

Each case lists:

- the task or interaction input
- the pack files that should be read
- the paths that should be written when learning occurs
- the minimum expected result

## Reference Implementation

The files under `scripts/` are a reference implementation of the same protocol.
They are useful for debugging and CI. They are not the pack contract.
