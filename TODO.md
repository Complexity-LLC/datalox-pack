# TODO

Completed items were moved to:

- [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)

That doc now holds:

- completed skill-boundary work
- completed concrete implementation steps
- completed pass-criteria proofs
- completed bootstrap-payload-shape work
- completed setup and partial-adoption recovery work


## Refactor `agent-pack.mjs`

- [ ] Goal: split `scripts/lib/agent-pack.mjs` into smaller modules without behavior drift.
  This is a boundary-extraction refactor, not a redesign.
  Do not change the runtime contract, promotion rules, retrieval policy, or live loop semantics as part of the split.

- [x] Step 1: inventory the current responsibilities inside `scripts/lib/agent-pack.mjs`.
  Identify and pin the main seams:
  - frontmatter / markdown parsing
  - skill/note read models
  - retrieval and candidate shaping
  - adjudication packet shaping
  - promotion decision compiler
  - event/note/skill write paths
  - lint / pack maintenance helpers

- [x] Step 2: extract parsing helpers into a read-only module first.
  Target examples:
  - `splitFrontmatter`
  - `parseFrontmatter`
  - `parseSkillDoc`
  - `parseNoteDoc`
  Requirements:
  - no output-shape changes
  - no frontmatter compatibility changes
  - CRLF handling must stay intact
  Completed first pass:
  - extracted markdown/frontmatter parsing into `scripts/lib/agent-pack/markdown.mjs`
  - kept `scripts/lib/agent-pack.mjs` as the compatibility surface for existing script imports
  - added focused parser and export-contract coverage in `tests/agentPackMarkdown.test.ts`

- [ ] Step 3: extract retrieval into its own module.
  Target examples:
  - candidate normalization helpers
  - note/skill lookup helpers
  - `resolveLocalKnowledge`
  Requirements:
  - no score/contract regressions
  - no retrieval-policy drift
  - `resolve` output must stay byte-for-byte compatible where possible

- [ ] Step 4: extract promotion/adjudication into its own module.
  Target examples:
  - `buildAdjudicationPacket`
  - stable promotion memory helpers
  - `decideAdjudicatedPromotion`
  - `recordTurnResult`
  - `compileRecordedEvent`
  Requirements:
  - keep the current skill-generation proof loop intact
  - do not reintroduce heuristic patch-vs-create logic
  - keep the note-stage and matched-note rules exactly as they work now

- [ ] Step 5: extract write surfaces into a persistence module.
  Target examples:
  - event file writes
  - note writes
  - skill writes
  Requirements:
  - preserve file locations
  - preserve generated frontmatter/content format
  - preserve provenance and log/index updates

- [ ] Step 6: extract lint/maintenance helpers last.
  Only move these after retrieval and promotion are already stable.
  Requirements:
  - no behavior cleanup mixed into the move
  - keep broken-link and missing-note checks intact

- [ ] Step 7: leave a thin compatibility surface in `scripts/lib/agent-pack.mjs`.
  It can become a barrel/orchestration file, but it should not keep growing as the default place for new logic.

- [ ] Constraint: no behavior rewrites inside the refactor.
  Specifically do not mix in:
  - retrieval redesign
  - new heuristics
  - prompt/protocol changes
  - note/skill schema changes
  - CLI/MCP contract renames

- [ ] Required proof after each extraction phase:
  - `npm run build`
  - `npx vitest run tests/bridgeSurfaces.test.ts tests/wrapperSurfaces.test.ts`
  - no regression in:
    - retrieval contract
    - enforcement loop
    - note promotion
    - skill creation

- [ ] Final pass criteria:
  1. `scripts/lib/agent-pack.mjs` is reduced to orchestration or thin exports, not a 4k+ line sink.
  2. The fresh-repo skill-generation proof documented in `docs/bootstrap-payload-shape-live-2026-04-23.md` still passes.
  3. Focused bridge/wrapper suites still pass.
  4. No runtime contract drift in:
     - `resolve`
     - `promote`
     - wrapper post-run payloads
     - MCP/CLI promotion surfaces


## Bootstrap Payload Shape

- Completed bootstrap payload work was moved to:
  - [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)
  That includes:
  - problem confirmation
  - target contract
  - bootstrap split
  - minimal default seed set
  - removal of whole-tree adoption
  - focused proofs and pass criteria

- [ ] Make optional seed knowledge explicit.
  If the pack still ships extra example/domain skills, they should live behind a separate install path, not fresh-repo bootstrap.
  Examples:
  - example skills bundle
  - domain bundle
  - demo corpus
  But do not add a large new product surface unless needed; start with a small explicit split.


## Online Retrieval And Note Capture

- Completed online retrieval / note-capture work was moved to:
  - [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)
  That includes:
  - authoritative match boundary tightening
  - candidate-only retrieval contract
  - bounded ambiguous-case adjudicator
  - note-safe online capture boundary
  - focused proofs and live validation
  6. periodic note-backed synthesis remains the primary path for creating new reusable skills


## Periodic Trace Maintenance And Skill Synthesis

- Completed maintenance-loop work was moved to:
  - [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)
  Grounded live proof:
  - [docs/periodic-trace-maintenance-live-2026-04-25.md](/Users/yifanjin/datalox-pack/docs/periodic-trace-maintenance-live-2026-04-25.md)


## Same-Repo Session And Agent Bootstrap

- Completed same-repo bootstrap work was moved to:
  - [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)
  Grounded live proof:
  - [docs/same-repo-bootstrap-live-2026-04-24.md](/Users/yifanjin/datalox-pack/docs/same-repo-bootstrap-live-2026-04-24.md)


## Claude Native Skill Installation

- Completed native skill installation work was moved to:
  - [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)
  That includes:
  - per-skill canonical link installation
  - disable/uninstall for new link shape
  - status reporting for native skill surfacing
  - doc updates
  - focused proofs and live validation
  Grounded live proof:
  - [docs/claude-native-skill-install-live-2026-04-27.md](/Users/yifanjin/datalox-pack/docs/claude-native-skill-install-live-2026-04-27.md)


## Maintenance Defaults And Skill Synthesis Boundary

- [ ] Goal: make periodic maintenance cheap and note-first by default before adding service-backed shared traces.
  Current issue:
  - `maintainKnowledge` defaults to `maxEvents = 50`
  - the same maintenance run always calls note-backed skill synthesis after trace compaction
  - this is too much default scope for a mini model or lightweight agent loop, especially once service-backed mode can increase event volume
  Target:
  - frequent cheap loop:
    - bounded trace scan
    - repeated trace group -> repo-local note
    - mark covered events
  - less frequent careful loop:
    - existing notes -> skill synthesis
    - explicit command or flag only
  - this must land before hook/wrapper backlog warnings recommend `datalox maintain`

- [ ] Step 1: lower the default maintenance scan window.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `scripts/agent-maintain.mjs`
  - `src/surface/sharedCommands.ts`
  Requirements:
  - default `maxEvents` should be small enough for lightweight maintenance, for example `12`
  - explicit `--max-events` continues to work for larger manual passes
  - service-backed planning should later fetch bounded repeated groups, not 50 raw events by default
  Pass criteria:
  - default maintain run scans the new smaller default
  - explicit `--max-events 50` still scans up to 50
  - docs and help text do not imply the default pass is broad synthesis

- [ ] Step 2: make `datalox maintain` note-only by default.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `scripts/agent-maintain.mjs`
  - `src/core/packCore.ts`
  - `src/surface/sharedCommands.ts`
  Requirements:
  - default maintenance compacts traces into notes and marks covered events
  - default maintenance does not create or patch skills
  - default maintenance may still report existing note evidence that is eligible for later skill synthesis
  - existing safety rule remains:
    - notes created in the current pass are excluded from skill synthesis
  Pass criteria:
  - repeated trace group creates or updates a note with no skill action by default
  - a note with enough evidence does not create a skill unless synthesis is explicitly requested
  - event coverage behavior stays unchanged

- [ ] Step 3: add an explicit skill synthesis path.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `scripts/agent-maintain.mjs`
  - `src/cli/main.ts`
  - `src/surface/sharedCommands.ts`
  Options:
  - add `datalox maintain --synthesize-skills`
  - or add a dedicated `datalox synthesize-skills`
  Preferred shape:
  - keep `maintain` as note-first
  - use an explicit flag or command for note-backed skill synthesis
  Requirements:
  - skill synthesis still requires note-backed evidence
  - `minSkillOccurrences` remains configurable
  - unknown-workflow and incident-shaped note protections remain
  Pass criteria:
  - explicit synthesis can create or patch a skill from existing note-backed evidence
  - default maintenance cannot create or patch a skill
  - generated skill ids remain reusable workflow names, not incident captures

- [ ] Step 4: update tests and completed-work docs after implementation.
  Target files:
  - `tests/bridgeSurfaces.test.ts`
  - `tests/agentScripts.test.ts`
  - `docs/completed-todo-items.md`
  Requirements:
  - update the existing maintenance regression to expect note-only default behavior
  - add explicit synthesis regression for the old second-pass skill creation path
  - record the completed behavior only after the implementation passes
  Pass criteria:
  - `npm run build` passes
  - focused maintenance tests pass
  - completed docs clearly say:
    - default maintenance is trace -> note only
    - skill synthesis is explicit and note-backed


## Event Backlog Visibility And Maintenance Nudges

- [ ] Goal: stop repos from silently accumulating large `agent-wiki/events/` backlogs with no notes, skills, or visible maintenance signal.
  Dependency:
  - complete `Maintenance Defaults And Skill Synthesis Boundary` first, so the recommended maintenance command is note-only by default
  Current issue:
  - hooks and wrappers can keep recording events every turn
  - this is not Claude Code-specific; Codex wrapper runs can show the same silent backlog behavior
  - `datalox-auto-promote` compiles the current hook event but does not drain accumulated backlog
  - `datalox maintain` exists but is manual
  - a repo can have 135+ events with no obvious warning, no compaction, and no agent-readable next action
  Target:
  - agents should see when the repo needs maintenance
  - Claude Code and Codex should both expose the same backlog status from shared pack logic
  - warnings should recommend a bounded note-only maintenance command
  - hooks should not run heavy synthesis automatically
  - Claude Code must not rely on stderr alone; the signal must land where the next agent turn can read it
  - backlog visibility must land before service-backed mode increases event volume

- [ ] Step 1: add shared event backlog stats and status output.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `src/core/packCore.ts`
  - `src/core/installCore.ts`
  - `src/cli/main.ts`
  Requirements:
  - add one shared helper for backlog stats and policy evaluation; status, hooks, and wrappers must call it instead of reimplementing counts
  - `status --json` reports:
    - total event count
    - uncovered event count
    - covered event count
    - maintainable unresolved trace group count
    - policy level: `none`, `warn`, or `urgent`
    - oldest uncovered event timestamp/path
    - `maintenanceRecommended`
    - recommended bounded command, for example:
      - `datalox maintain --max-events 12 --json`
  - output stays machine-readable first
  Pass criteria:
  - empty repo reports zero backlog
  - repo with covered events does not over-warn
  - repo with many uncovered events reports `maintenanceRecommended: true`
  - repo with a repeated group that meets `minNoteOccurrences` reports a maintainable group

- [ ] Step 2: add agent-readable backlog warning to hook/wrapper surfaces.
  Target files:
  - `bin/datalox-auto-promote.js`
  - `src/adapters/shared.ts`
  - wrapper tests
  Requirements:
  - after recording/compiling the current event, surfaces can warn when the shared backlog policy returns `warn` or `urgent`
  - apply the same warning contract to Claude Code hooks and Codex wrapper runs
  - warning must be compact and actionable
  - warning should recommend bounded note-only maintenance after the maintenance-defaults change lands
  - do not run broad maintenance or skill synthesis from the hook
  - Claude Code warning must be written to a next-turn-readable surface, such as `agent-wiki/hot.md` or an equivalent generated control artifact; stderr alone is not enough
  Pass criteria:
  - hook stderr includes a clear maintenance recommendation when backlog is high
  - Claude Code's next turn can discover the backlog recommendation from repo-local control artifacts
  - Codex wrapper JSON includes a machine-readable backlog warning
  - Claude Code and Codex report consistent counts for the same repo state
  - no automatic skill creation is triggered by the warning path

- [ ] Step 3: add a composite backlog policy.
  Target files:
  - `.datalox/config.schema.json`
  - `.datalox/config.json`
  - `src/agent/loadAgentConfig.ts`
  - `scripts/lib/agent-pack.mjs`
  Requirements:
  - policy evaluates three signals with OR semantics:
    - uncovered event depth
    - oldest uncovered event age
    - maintainable unresolved group count
  - maintainable group means a repeated unresolved trace group that already meets `minNoteOccurrences`
  - default policy is conservative and grounded in current observations, for example:
    - warn:
      - uncovered events >= `50`
      - oldest uncovered age >= `7` days
      - maintainable groups >= `1`
    - urgent:
      - uncovered events >= `100`
      - oldest uncovered age >= `14` days
      - maintainable groups >= `5`
  - each signal is configurable per repo
  - missing individual signal fields disable only that signal, but config validation must reject a policy that disables all warning signals
  - if config is absent, default policy still works
  Pass criteria:
  - changing config policy changes status/warning behavior
  - repo with 135 uncovered events reports urgent by depth
  - quiet repo with old uncovered events reports at least warn by age
  - small repo with one maintainable repeated group reports warn by group signal
  - invalid policy values fail clearly

- [ ] Step 4: add focused backlog tests.
  Target files:
  - `tests/bridgeSurfaces.test.ts`
  - `tests/wrapperSurfaces.test.ts`
  - `tests/agentScripts.test.ts`
  Requirements:
  - synthetic Claude Code hook and Codex wrapper runs both surface the backlog warning
  - synthetic repo with 135 uncovered events reports maintenance recommendation
  - repeated groups are counted separately from raw event count and only maintainable groups drive group warnings
  - old uncovered events can trigger warning even when raw count is low
  - covered events are excluded from urgent warning
  - hook/wrapper warning remains note-only and does not synthesize skills
  Pass criteria:
  - focused tests pass
  - `npm run build` passes


## Service-Backed Shared Trace Plane

- Current foundation already exists:
  - `datalox maintain` / `maintain_knowledge` runs a bounded repo-local maintenance pass
  - current maintenance scans `agent-wiki/events/`
  - repeated unresolved traces compact into `agent-wiki/notes/`
  - covered events are marked so the same trace group does not keep re-promoting
  - note-backed skill synthesis runs only from existing notes, normally on a later pass
  Service-backed work should reuse this materialization loop. Do not build a second note/skill promotion path.

- [ ] Goal: make `mode: "service_backed"` real so different agents and sessions can share traces, events, and coordination state for the same repo without turning notes and skills into a hidden global blob.
  The target boundary is:
  - shared/service-backed:
    - raw traces
    - recorded events
    - session state
    - leases / signals / checkpoints
    - maintenance coverage state
  - repo-owned:
    - `agent-wiki/notes/`
    - `skills/`
    - visible control artifacts
    - repo-local materialized reusable knowledge

- [ ] Step 1: define the service-backed boundary in config and docs.
  Ground it in the already-existing `service_backed` mode instead of inventing a parallel concept.
  Target files:
  - `.datalox/config.schema.json`
  - `.datalox/config.json`
  - `.datalox/manifest.json`
  - `docs/product-definition.md`
  Requirements:
  - `repo_only` stays the default
  - `service_backed` is documented as:
    - shared trace/event plane
    - repo-local note/skill materialization plane
  - do not describe the service as the primary durable home for notes or skills
  Pass criteria:
  - config schema can express the service-backed fields without ambiguity
  - docs explicitly say "agents share what happened; the repo owns what was learned"

- [ ] Step 2: add a stable repo identity and service namespace contract.
  The service must know when two sessions belong to the same repo and when they do not.
  Target files:
  - `src/domain/agentConfig.ts`
  - `src/agent/loadAgentConfig.ts`
  - `src/types/legacy-agent-pack.d.ts`
  - `scripts/lib/agent-pack.mjs`
  Add or clarify fields such as:
  - `repoId`
  - `workspaceRoot`
  - `branch` when available
  - `sessionId`
  - `agentId` / `hostKind`
  Requirements:
  - same repo from two agents resolves to the same service namespace
  - different repos cannot accidentally share traces
  - no heuristic matching for repo identity when a stable id is available
  Pass criteria:
  - two synthetic sessions with the same repo id land in the same trace namespace
  - a second repo with a different id does not see those traces

- [ ] Step 3: implement a service-backed trace/event client.
  This should be a real client surface, not a hidden fallback branch inside unrelated code.
  Target files:
  - `src/core/packCore.ts`
  - `src/adapters/shared.ts`
  - `src/cli/main.ts`
  - new dedicated module if needed, such as:
    - `src/core/serviceBackedTraceClient.ts`
  Requirements:
  - in `repo_only`, keep current local event behavior
  - in `service_backed`, record traces/events to the shared service using the repo namespace contract
  - agent-readable errors only; avoid human-first ceremony
  - do not silently fall back from service-backed writes to some hidden local substitute
  Pass criteria:
  - service-backed write path is exercised in tests
  - when the service rejects a write, the failure is explicit and attributable
  - `repo_only` behavior remains unchanged

- [ ] Step 4: teach retrieval and maintenance to read shared traces for the current repo.
  The online and maintenance loops must be able to see traces from other agents in the same repo.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `src/core/packCore.ts`
  - `src/adapters/shared.ts`
  Requirements:
  - online capture can still stay cheap
  - the existing `maintainKnowledge` planner reads a bounded unresolved trace set from the service for the current repo
  - local `agent-wiki/events/` traces and service-backed traces use one normalized planner input shape
  - no cross-repo bleed
  - current local note/skill retrieval remains repo-local
  - do not create a parallel service-only maintenance loop
  Pass criteria:
  - agent A writes a trace in service-backed mode
  - agent B in a fresh session, same repo, can see that trace in `maintainKnowledge` planner input
  - agent C in a different repo cannot

- [ ] Step 5: keep existing periodic maintenance as the materialization boundary.
  Shared traces must feed the current maintenance loop, compact into repo-local notes first, then synthesize repo-local skills from note-backed evidence.
  Target files:
  - `scripts/lib/agent-pack.mjs`
  - `scripts/agent-maintain.mjs`
  - `src/surface/sharedCommands.ts`
  Requirements:
  - do not create global notes or global skills
  - service-backed traces compact into repo-local notes
  - note-backed synthesis stays the primary path for new skills
  - notes created during the current pass must stay excluded from skill synthesis until a later pass, matching current repo-local behavior
  - covered/compacted service events are marked so they do not keep exploding the maintenance input
  - `repo_only` continues to scan only local `agent-wiki/events/`
  Pass criteria:
  - two service-backed traces from two different agents in the same repo compact into one repo-local note
  - repeating the same maintenance run does not re-promote the same unresolved traces forever
  - a repeated reusable workflow can still synthesize one repo-local skill from note-backed evidence
  - the existing repo-local maintenance regression still passes unchanged

- [ ] Step 6: share coordination state across agents in service-backed mode.
  This is where leases, signals, or checkpoints belong if Datalox wants cross-agent coordination.
  Target files:
  - `src/core/packCore.ts`
  - `src/cli/main.ts`
  - `src/surface/sharedCommands.ts`
  Requirements:
  - coordination state is scoped by repo id
  - it remains optional and does not block trace sharing
  - do not mix coordination metadata into skill or note files
  Pass criteria:
  - two agents in the same repo can exchange one coordination artifact through the shared plane
  - the same call in a different repo namespace returns nothing

- [ ] Step 7: add one explicit status/doctor surface for service-backed mode.
  The system needs a visible way to say whether the shared plane is actually connected.
  Target files:
  - `src/cli/main.ts`
  - `src/core/packCore.ts`
  - `README.md`
  - `START_HERE.md`
  Requirements:
  - `status --json` must say whether:
    - service-backed mode is enabled
    - the shared trace plane is reachable
    - the current repo id is known
  - keep the output machine-readable first
  Pass criteria:
  - fresh service-backed repo returns a positive status with repo id + connectivity
  - broken connectivity returns a clear explicit failure state

- [ ] Step 8: prove it with a fresh multi-agent live test.
  Use cheap models where possible.
  Required live proof shape:
  1. fresh repo in `service_backed` mode
  2. agent/session A records a trace
  3. fresh agent/session B in the same repo sees that trace
  4. maintenance compacts shared traces into one repo-local note
  5. repeated note-backed evidence can synthesize one repo-local skill
  6. agent/session C in a different repo does not see repo A's traces
  Write the result into a dedicated live proof doc under `docs/`.

- [ ] Final pass criteria:
  1. `mode: "service_backed"` is a real implemented mode, not just a schema value.
  2. Multiple agents in the same repo can share traces/events without sharing raw chat state.
  3. Notes and skills still materialize into the repo filesystem, not a hidden global store.
  4. Periodic maintenance compacts shared traces into repo-local notes and then repo-local skills.
  5. No cross-repo trace bleed occurs.
  6. `repo_only` mode keeps its current local-only behavior.
