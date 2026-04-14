# Datalox Refactor Checklist

Status: complete for this pass.

This refactor reduces `datalox-pack` to a smaller, agent-first knowledge model:

- concrete source kinds: `trace`, `web`, `pdf`
- durable outputs: `note`, `skill`
- durable repo surfaces:
  - `skills/`
  - `agent-wiki/notes/`
  - `agent-wiki/events/`
  - `agent-wiki/index.md`
  - `agent-wiki/log.md`
  - `agent-wiki/lint.md`
  - `agent-wiki/hot.md`

## Core Rule

- [x] Reusable local learning becomes a `note`.
- [x] Reusable workflow learning becomes a `skill`.
- [x] `note` holds both rule and concrete evidence/examples.
- [x] New automatic writes go to `agent-wiki/notes/` and `skills/`.

## Phase 1: Freeze The Contract

- [x] `DATALOX.md` documents `trace | web | pdf` as the supported source kinds.
- [x] `DATALOX.md` and `README.md` document `note | skill` as the durable outputs.
- [x] Public docs de-emphasize generated `question`, `comparison`, `concept`, `doc`, and `pattern` pages.
- [x] Public docs keep only a short migration note for legacy folders.

## Phase 2: Reduce The Wiki Surface

- [x] `agent-wiki/notes/` is the default knowledge folder.
- [x] New automatic writes no longer target `patterns/`, `sources/`, `concepts/`, `comparisons/`, or `questions/`.
- [x] Legacy folders remain readable during migration.
- [x] Index and lint treat notes and skills as the main knowledge graph.
- [x] Manual adoption now copies the reduced note-first surface instead of the old generated taxonomy.

## Phase 3: Make Trace First-Class

- [x] `trace` is a first-class source kind.
- [x] `extractTraceSource()` exists in the shared core.
- [x] Trace evidence includes task, workflow, transcript, summary, observations, signal, interpretation, action, matched skill, changed files, and outcome.
- [x] `recordTurnResult` persists grounded trace evidence in `agent-wiki/events/`.
- [x] `recordTurnResult` and `promoteGap` return a normalized `traceBundle`.

## Phase 4: Add One Minimal Shared Source Bundle

- [x] `src/core/sourceBundle.ts` defines a transport-free `SourceBundle`.
- [x] The bundle supports only `trace`, `web`, and `pdf`.
- [x] The bundle stays close to extracted evidence instead of abstract summaries.

## Phase 5: Split Extraction From Rendering

- [x] Web capture uses `extractWebSource()` plus renderer-specific outputs.
- [x] Trace has explicit rendering helpers in `src/core/traceArtifacts.ts`.
- [x] Web renderers and trace renderers consume shared source-bundle evidence instead of ad hoc command-level state.
- [x] CLI and MCP surfaces call core operations instead of duplicating renderer internals.

## Phase 6: Simplify Promotion

- [x] The default reusable output is `note`.
- [x] Promotion now chooses only `note` or `skill`.
- [x] Promotion keeps legacy content readable but stops generating new `doc`, `pattern`, `question`, `comparison`, or `concept` pages.
- [x] Log output uses explicit actions such as `create_note`, `update_note`, `create_skill`, and `update_skill`.
- [x] Repeated no-match gaps create live draft skills early enough for the user to feel the change immediately.

## Phase 7: Define Note Shape Clearly

- [x] `agent-wiki/note.schema.md` defines the note contract.
- [x] Generated notes include title, source kind, signal, interpretation, action, evidence, examples, and related links.
- [x] Notes are strong enough that an agent can act from one page.
- [x] Rule and evidence stay on the same generated page by default.

## Phase 8: Keep Web Specific Work Concrete

- [x] Web capture supports `note`.
- [x] Web capture supports `design_doc`.
- [x] Web capture supports `design_tokens`.
- [x] Web capture supports `tailwind_theme`.
- [x] Tokens are derived from extracted evidence, not post-hoc guesswork.
- [x] Tailwind output is derived from semantic tokens.
- [x] Web artifacts write to:
  - `designs/web/<slug>.md`
  - `designs/web/<slug>.tokens.json`
  - `designs/web/<slug>.tailwind.ts`

## Phase 9: Add PDF As The Next Source Adapter

- [x] `extractPdfSource()` exists on the shared source-bundle path.
- [x] PDF capture writes notes first.
- [x] PDF capture writes:
  - `agent-wiki/notes/pdf/<slug>.md`
  - `agent-wiki/notes/pdf/<slug>.capture.json`
- [x] PDF capture does not invent a separate knowledge system.

## Phase 10: Keep The Public Surface Small

- [x] There is no generic `capture-source` command yet.
- [x] Public entrypoints stay concrete:
  - `capture-web`
  - `capture-pdf`
- [x] Core CLI commands emit JSON for agent consumption.
- [x] Wrapper commands stay specialized because they must preserve prompt or child-process behavior.
- [x] MCP surface stays small and concrete.

## Phase 11: Migration

- [x] Adopted repos are not broken abruptly.
- [x] Legacy supporting paths are still readable.
- [x] New automatic writes go to `agent-wiki/notes/` and `skills/`.
- [x] The refactor avoids a large migration subsystem.

## Verification

- [x] Source bundle tests cover `trace`, `web`, and `pdf`.
- [x] Promotion tests cover the `note | skill` ladder.
- [x] Note tests cover actionable rule plus concrete evidence/examples.
- [x] Web capture tests cover:
  - note
  - design doc
  - design tokens
  - tailwind theme
- [x] Migration behavior keeps legacy supporting pages readable.
- [x] `npm run check` is green.
- [x] `npm test` is green.

## Acceptance Criteria

- [x] `trace`, `web`, and `pdf` fit the same source pipeline.
- [x] `note` is the default reusable knowledge unit.
- [x] `skill` remains the reusable workflow unit.
- [x] A generated note is sufficient for the agent to act from one page.
- [x] New automatic supporting writes go to `agent-wiki/notes/`.
- [x] Web capture emits semantic design tokens.
- [x] Tailwind output is derived from those tokens.
- [x] PDF capture writes useful notes without inventing a second knowledge system.
- [x] The repo no longer depends on auto-generated `doc`, `pattern`, `question`, `comparison`, or `concept` pages to feel useful.

## Non-Goals

- [x] No vector database.
- [x] No heavy review UI.
- [x] No broad taxonomy expansion.
- [x] No generic source framework beyond the concrete adapters actually supported.
- [x] No document-platform product layer.
