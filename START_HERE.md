# Start Here

This pack is for one simple outcome:

your agent gets better after one correction, and you can see what it learned.

## Fastest Path

1. Put this pack in the repo you want the agent to work on.
2. Tell the agent once:
   `Read DATALOX.md and use the Datalox pack.`
3. Watch these files:
   - `agent-wiki/index.md`
   - `agent-wiki/log.md`
   - `agent-wiki/lint.md`
   - `agent-wiki/hot.md`
   - `agent-wiki/events/`

## What You Should See

- `index.md`: what the agent currently knows
- `log.md`: what it changed
- `lint.md`: whether the pack is still healthy
- `hot.md`: the recent context snapshot for the next session

## What The Agent Reads First

1. `.datalox/manifest.json`
2. `.datalox/config.json`
3. `DATALOX.md`
4. `agent-wiki/hot.md` if it exists

## One-Click Options

- Adopt into a host repo:
  `bash bin/adopt-host-repo.sh /path/to/host-repo`
- Pull from GitHub and adopt:
  `bash bin/adopt-from-github.sh /path/to/host-repo`
- Wire skills into common agent tools:
  `bash bin/setup-multi-agent.sh`
- Automatic post-turn hook recording for hosts with hook support:
  `node bin/datalox-auto-promote.js`
  Default hook events are recorded as `trace`. Set `DATALOX_HOOK_EVENT_CLASS=candidate` only when the hook should enter the promotion ladder.
- Stop machine-level host interception:
  `bash bin/disable-default-host-integrations.sh`

If the host repo already has `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md`, adoption preserves that file and injects a small Datalox adapter instead of skipping the Datalox entrypoint.

## Normal Usage After Setup

The user's agent can run `bash bin/setup-multi-agent.sh` once. After that, the user should keep using the host normally.

- Codex:
  `codex exec "Update the onboarding docs."`
- Claude:
  `claude --print "Update the onboarding docs."`

The installed shims route those runs through Datalox automatically and default the second-pass reviewer to `review` mode with `gpt-5.4-mini`.

That automation is only true on supported host adapter paths. If a host only sees repo instructions or MCP tools, Datalox is guidance-only until a wrapper, hook, or plugin owns the loop.

To stop the host interception later, run `bash bin/disable-default-host-integrations.sh`.

To see whether the current repo is actually automatic or only guidance-only, run:

- `node bin/datalox.js status --repo . --json`

For the concrete enforcement roadmap, read [docs/automatic-enforcement-plan.md](docs/automatic-enforcement-plan.md).
