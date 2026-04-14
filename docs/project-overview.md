# Project Overview

`datalox-pack` is a portable agent memory and skill layer.

The repo is centered on:

- `skills/`
- `agent-wiki/notes/`
- `agent-wiki/events/`

The runtime loop is:

`detect -> use -> record -> promote -> lint`

The current concrete source kinds are:

- `trace`
- `web`
- `pdf`

The current durable outputs are:

- `note`
- `skill`

That is the core product boundary.
Avoid expanding taxonomy unless real usage proves another generated page type is necessary.
