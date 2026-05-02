# Claude Instructions

Claude Code can see Datalox through separate surfaces. Treat them separately:

- `datalox claude` / Claude shim wrapper: enforceable pre-run guidance injection when the active run is inside the Datalox wrapper.
- Claude Stop hook: post-turn sidecar automation. It can record, compile, and maintain after Claude responds, but it cannot force pre-turn `resolve_loop`.
- Claude native skills at `~/.claude/skills/<skill-name>`: useful discovery surface, still model-chosen and sometimes restart-sensitive.
- Claude MCP tools: guidance-only unless Claude Code actually calls them.

Use `datalox status --json` to inspect the current surface state. Only treat Claude as wrapper-enforced when `currentSession.activeWrapper` is `"claude"` and `currentSession.wrapperEnforced` is `true`.

On each loop:

1. if MCP tools are available, call `resolve_loop` before Datalox-pack work
2. detect the best skill in `skills/`
3. read the linked notes in `agent-wiki/notes/`
4. act from the skill body plus those notes
5. record grounded events in `agent-wiki/events/` or call `record_turn_result` after meaningful outcomes
6. promote repeated gaps into notes or skills
7. refresh `agent-wiki/index.md`, `log.md`, `lint.md`, and `hot.md`

Useful commands:

- `datalox capture-web --repo . --url <url> --artifact design-doc`
- `datalox capture-web --repo . --url <url> --artifact design-tokens`
- `datalox capture-pdf --repo . --path <pdf-path>`
