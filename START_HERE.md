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
- Automatic post-turn promotion for hosts with hook support:
  `node bin/datalox-auto-promote.js`
