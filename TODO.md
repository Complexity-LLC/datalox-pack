# TODO

Completed items were moved to:

- [docs/completed-todo-items.md](/Users/yifanjin/datalox-pack/docs/completed-todo-items.md)

That doc now holds:

- completed skill-boundary work
- completed concrete implementation steps
- completed pass-criteria proofs
- completed bootstrap-payload-shape work


## Refactor `agent-pack.mjs`

- [ ] Goal: split `scripts/lib/agent-pack.mjs` into smaller modules without behavior drift.
  This is a seam-extraction refactor, not a redesign.
  Do not change the runtime contract, promotion rules, retrieval policy, or live loop semantics as part of the split.

- [ ] Step 1: inventory the current responsibilities inside `scripts/lib/agent-pack.mjs`.
  Identify and pin the main seams:
  - frontmatter / markdown parsing
  - skill/note read models
  - retrieval and candidate shaping
  - adjudication packet shaping
  - promotion decision compiler
  - event/note/skill write paths
  - lint / pack maintenance helpers

- [ ] Step 2: extract parsing helpers into a read-only module first.
  Target examples:
  - `splitFrontmatter`
  - `parseFrontmatter`
  - `parseSkillDoc`
  - `parseNoteDoc`
  Requirements:
  - no output-shape changes
  - no frontmatter compatibility changes
  - CRLF handling must stay intact

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
  2. The live skill-generation proof in `docs/skill-generation-proof-live-2026-04-23.md` still passes on a fresh repo.
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

- [ ] Goal: keep the online loop narrow, cheap, and note-first.
  Current reality:
  - the online loop can still create a `skill`
  Target model:
  - online loop should primarily:
    - detect a skill or no-match
    - record `trace`
    - maybe create or update a `note` when the signal is strong
  Preferred boundary:
  - new-skill creation should default to the later periodic maintenance / synthesis loop
  Online exception:
  - online skill creation may remain as a narrow compatibility path for unusually clear cases, but it should not be the dominant or default path

- [ ] Confirm the current retrieval failure mode with grounded repro.
  Proven issue:
  a workflow-bound task can still set `matchedSkillId` from a weak lexical overlap when the skill shares the workflow and happens to contain broad tokens.
  The reproduced example was:
  - task: `Fix the center-viewer PDF preview runtime error '#e.getOrInsertComputed is not a function' in the desktop app.`
  - weakly matched skill: `desktop-agent-workspace.capture-the-reusable-lesson-from-the-desktop-host-stream-decode-failure-fix`
  - current reasons: `workflow_match`, `primary_term_overlap`
  This is wrong because the event is about PDF.js / WKWebView compatibility, while the matched skill is about Tauri SSE stream parsing.
  Pass criteria:
  - the repro is recorded with the exact input task, returned candidate skill, and wrong `matchedSkillId`
  - there is a focused test or live-proof fixture that fails before the fix and passes after it

- [ ] Tighten authoritative skill matching.
  Main file:
  - `scripts/lib/agent-pack.mjs`
  Current bug:
  - `isAuthoritativeSkillMatch()` still treats `workflowMatch && primaryMatchCount >= 2` as authoritative
  Target:
  - deterministic authoritative match requires:
    - `explicit_skill_match`, or
    - `field_phrase_match`
  Not enough:
  - `workflow_match` + lexical token overlap
  Weak lexical matches may still appear in `candidateSkills`, but must not set:
  - `matchedSkillId`
  - `matchedNotePaths`
  Pass criteria:
  - the WKWebView / PDF.js repro may still return the SSE skill as a weak candidate, but `matchedSkillId` stays `null`
  - the same-workflow lexical-overlap case no longer becomes authoritative without `explicit_skill_match` or `field_phrase_match`

- [ ] Keep lexical retrieval as candidate generation only.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - `src/adapters/shared.ts`
  Target contract:
  - `candidateSkills` may still include weak same-workflow suggestions
  - `matchedSkillId` stays `null` unless the match is authoritative
  - wrapper/MCP/CLI outputs should clearly separate:
    - candidate suggestions
    - authoritative selected skill
  Pass criteria:
  - wrapper, MCP, and CLI outputs expose candidate suggestions without silently upgrading them into the authoritative selected skill
  - weak same-workflow candidates can still be surfaced for agent inspection while the durable event shape records no false authoritative match

- [ ] Add a narrow skill match adjudicator only for ambiguous online cases.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - `src/adapters/shared.ts`
  Do not call a model on every loop.
  Use a 3-tier path:
  1. deterministic accept
  2. deterministic reject
  3. cheap agent adjudication only when the candidate set is ambiguous
  Ambiguous means examples like:
  - same workflow
  - no explicit skill match
  - no field phrase match
  - only weak lexical overlap
  - multiple plausible candidates
  Adjudicator packet should stay small:
  - current task/step/summary
  - top `2-5` candidate skills
  - compact YAML/body summaries only
  Output must be structured, for example:
  - `matchedSkillId`
  - `noMatch`
  - `alternatives`
  - `reason`
  Code still enforces:
  - adjudicator may only choose from the provided candidate set
  - no-match is allowed
  - weak lexical matches remain suggestions if the adjudicator does not confirm them
  Pass criteria:
  - deterministic accept and deterministic reject paths do not call the adjudicator
  - an actually ambiguous same-workflow query calls the adjudicator with a bounded packet and returns a structured result
  - the adjudicator cannot select a skill outside the provided candidate set

- [ ] Keep online capture note-safe.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - wrapper / hook / MCP entry surfaces as needed
  Target:
  - a one-off incident may remain `trace`
  - a strong incident may create or update a `note`
  - online skill creation remains allowed only as a narrow compatibility path
  - the online loop must not treat direct new-skill creation as the default outcome for raw trace capture
  Pass criteria:
  - a one-off weak incident stays `trace`
  - a one-off strong incident may create or update a `note`
  - online new-skill creation is either absent or clearly rarer than note creation in the same class of cases
  - the preferred path for new skills remains later note-backed synthesis, not eager online promotion

- [ ] Add focused regression proofs for the online boundary.
  Main files:
  - `tests/bridgeSurfaces.test.ts`
  - `tests/agentScripts.test.ts`
  - `tests/wrapperSurfaces.test.ts`
  Required proofs:
  1. the WKWebView / PDF.js task may surface the SSE skill as a candidate, but must not set `matchedSkillId`
  2. a real SSE task still matches the SSE skill authoritatively
  3. an ambiguous same-workflow query can be resolved by the adjudicator without exposing a false authoritative match
  4. a one-off incident can create or patch a note without creating a low-quality skill
  5. if online new-skill creation still exists, it is exercised only in a narrow explicit proof and does not become the default path
  Pass criteria:
  - the focused suite covers all five proofs above
  - the suite fails if lexical overlap becomes authoritative again
  - the suite fails if online new-skill creation becomes the broad/default path again

- [ ] Final pass criteria:
  1. weak workflow-bound lexical overlap no longer sets `matchedSkillId`
  2. `candidateSkills` can still surface suggestions without being treated as authoritative
  3. ambiguous cases use a cheap structured adjudicator only when deterministic accept/reject cannot decide
  4. the pasted PDF.js / WKWebView event shape would stay trace-or-note only unless a real matching skill exists
  5. online new-skill creation is no longer the default product path
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
