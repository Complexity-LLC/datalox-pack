# TODO

## Skill Boundary

- [x] Replace patch-vs-create heuristics with agent-side adjudication.
  The deterministic layer should only retrieve candidate skills and linked notes.
  The agent should return one structured decision:
  `record_only`, `create_operational_note`, `patch_existing_skill`, or `create_new_skill`.
  Code should still enforce hard product rules:
  `pdf/web/source` cannot patch skills directly, only repeated operational evidence can create or patch a skill, and the agent can only patch one of the retrieved candidate skills.

- [x] Stop treating auto-retrieved matches as authoritative skill matches.
  Retrieval should produce candidate skills plus linked notes, not silently upcast the top lexical match into a patch target.
  A weak retrieval match should remain a suggestion unless the agent explicitly selects it.

- [x] Fix the bootstrap problem before relying on note-aware adjudication.
  Notes cannot be a prerequisite for creating the first note.
  The current path already depends on notes, but ordinary wrapped runs still generate only trace events.
  That means the agent often has no first operational note to read before deciding whether to patch an existing skill or create a new one.
  The bootstrap phase must operate from repeated trace evidence even when there are zero existing notes.

- [x] Create a clean first-note path for repeated operational gaps.
  This is the bootstrap phase.
  The wrapped agent, hook, or CLI/MCP caller can now emit a structured adjudication decision so normal wrapped failures can cross:
  `trace -> candidate -> operational note`
  before any skill patch/create decision is attempted.
  The adjudication packet can rely on repeated traces plus candidate skills, but it does not require linked notes to exist yet.
  The pass criterion is that a normal repeated operational failure can produce at least one operational note without manual MCP intervention.

- [x] Stop using repetition count as the main semantic test for note creation.
  Repetition is only a debounce/brake, not the definition of value.
  Some single runs are worth recording as operational notes immediately, and some repeated runs are still noise.
  The agent should decide whether a run is reusable enough to become a note.
  Code should still enforce the write rules.

- [x] Let a single run create an operational note when the evidence is strong enough.
  The adjudication output should distinguish:
  `record_trace`, `create_operational_note`, `patch_existing_skill`, `create_new_skill`, and `needs_more_evidence`.
  A single run may create a note when the pattern is specific, actionable, and grounded.
  A single run should not create a skill.

- [x] After the first operational note exists, let the agent adjudicate:
  This is the mature phase.
  `patch existing skill` vs `create new skill`.
  The decision packet should include only the minimum bounded context:
  current trace summary, a compact repeated-event summary, top candidate skills, linked operational notes, and linked source notes.
  Do not inject full raw traces, whole notes, or large repo context by default.
  The adjudication path must stay cheap enough for normal runs and must not depend on a giant context window.
  The output must be structured and machine-validated, not free-form prose.

- [x] Add proof tests for the real boundary.
  Required proofs:
  1. a single strong operational run can create a first operational note when there are zero existing notes
  2. repeated ordinary wrapped failure with no explicit skill match can still create a first operational note without manual MCP intervention
  3. repeated failure with a genuinely matching skill patches that skill
  4. repeated failure with only weak lexical overlap does not patch an unrelated skill
  5. repeated failure with no real match creates a new skill only after the note stage
  6. the adjudication packet stays within a small bounded context budget and does not require whole-note or whole-trace injection

## Concrete Steps

- [x] Step 1: separate retrieved candidates from authoritative targets.
  Main files:
  `scripts/lib/agent-pack.mjs`
  `src/adapters/shared.ts`
  Change the runtime contract so retrieval returns only candidate skills and linked notes.
  Do not upcast the top auto-match into an explicit patch target.
  Keep explicit user-selected `skillId` separate from auto-retrieved `matchedSkillId`.

- [x] Step 2: add a bootstrap adjudication path for the first operational note.
  Main files:
  `scripts/lib/agent-pack.mjs`
  `src/adapters/shared.ts`
  `src/mcp/loopPulse.ts`
  Build a compact adjudication packet from:
  current trace summary, compact repeated-event summary, and top candidate skills.
  Let the agent choose:
  `record_trace`, `create_operational_note`, or `needs_more_evidence`.
  Do not require any existing notes in this phase.

- [x] Step 3: make note creation semantic, not repetition-only.
  Main files:
  `scripts/lib/agent-pack.mjs`
  Keep repetition only as a brake.
  A single strong run may create an operational note.
  A repeated weak run may still stay trace-only.
  Code must still enforce that a single run cannot create or patch a skill.

- [x] Step 4: add the mature adjudication path for patch-vs-create.
  Main files:
  `scripts/lib/agent-pack.mjs`
  `src/adapters/shared.ts`
  After at least one operational note exists, build a bounded mature packet from:
  current trace summary, compact repeated-event summary, top candidate skills, linked operational notes, and linked source notes.
  Let the agent choose:
  `patch_existing_skill`, `create_new_skill`, `create_operational_note`, `record_trace`, or `needs_more_evidence`.
  Validate the output against product rules before writing.

- [x] Step 5: enforce hard write rules in code after adjudication.
  Main files:
  `scripts/lib/agent-pack.mjs`
  `src/core/packCore.ts`
  Hard rules:
  `pdf/web/source` cannot patch skills directly.
  Only operational evidence can create or patch skills.
  A patched skill must be one of the retrieved candidate skills or an explicit user-selected skill.
  New skill creation still requires stronger evidence than note creation.

- [x] Step 6: keep the adjudication packet small.
  Main files:
  `src/adapters/shared.ts`
  `scripts/lib/agent-pack.mjs`
  Never inject full raw traces, full note bodies, or large repo context by default.
  Use summaries, top-k candidate skills, and compact note excerpts only.
  The path should be cheap enough for normal wrapped runs.

- [x] Step 7: add end-to-end proofs, not only unit tests.
  Main files:
  `tests/wrapperSurfaces.test.ts`
  `tests/hookIntegration.test.ts`
  `tests/agentScripts.test.ts`
  Add proof-style tests for first-note bootstrap, true match patching, weak-match rejection, no-match new-skill creation, and bounded context size.

## Pass Criteria

- [x] Pass 1: an ordinary wrapped run with weak evidence can stay `trace` only.

- [x] Pass 2: a single strong operational run can create the first operational note even when there are zero existing notes.

- [x] Pass 3: repeated ordinary wrapped failure can still create the first operational note without manual MCP intervention.

- [x] Pass 4: a genuine existing-skill match can patch that skill automatically after adjudication.

- [x] Pass 5: weak lexical overlap does not patch an unrelated skill.

- [x] Pass 6: a true no-match path creates a note before it creates a skill.

- [x] Pass 7: a single run cannot create or patch a skill.

- [x] Pass 8: source-derived inputs can create evidence notes but cannot patch skills directly.

- [x] Pass 9: the adjudication packet stays within a small bounded context budget and does not require full-note or full-trace injection.

- [x] Pass 10: the runtime contract stays skill-first:
  detect skill -> read linked notes -> act
  and the bootstrap path does not deadlock when there are no notes yet.


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

- [x] Confirm the current problem precisely.
  Grounded claim:
  fresh repos currently receive unrelated seed knowledge through `adoptPack()` / `autoBootstrapIfSafe()`, not through MCP itself.
  Proven examples already observed in fresh repos:
  - `skills/github/SKILL.md`
  - `skills/ordercli/SKILL.md`
  - `skills/review-ambiguous-viability-gate/SKILL.md`
  - `agent-wiki/notes/pdf/*`
  - `agent-wiki/notes/web/*`

- [x] Define the target bootstrap contract.
  Fresh generic repos should receive only:
  - core runtime/instruction surfaces
  - the minimum seed knowledge required for the loop to function
  They should not automatically receive unrelated domain/example skills and notes.

- [x] Split bootstrap payload into two classes.
  1. core runtime surfaces
  2. optional seed knowledge
  Core runtime surfaces should stay automatic.
  Optional seed knowledge should be minimal by default or explicitly opted into.

- [x] Inventory what is actually required for a fresh repo to function.
  Main files:
  - `src/core/packCore.ts`
  - `.datalox/manifest.json`
  Determine which adopted paths are truly necessary for:
  - wrapper enforcement
  - bootstrap
  - event recording
  - note creation
  - skill creation

- [x] Remove whole-tree adoption of unrelated seed knowledge.
  Main file:
  - `src/core/packCore.ts`
  Current issue:
  - `TREE_ADOPTION_PATHS = ["skills", "agent-wiki/notes"]`
  Target:
  - stop copying entire `skills/`
  - stop copying entire `agent-wiki/notes/`
  - replace that with a smaller explicit allowlist or a minimal bootstrap bundle

- [x] Decide the minimal default seed set.
  Candidate default keepers:
  - only repo-evolution/bootstrap knowledge needed for the pack to explain itself
  - only the smallest number of skills needed for host wrapper operation
  Candidate removals from default bootstrap:
  - `github`
  - `ordercli`
  - `review-ambiguous-viability-gate`
  - unrelated `pdf/` and `web/` note corpora

- [ ] Make optional seed knowledge explicit.
  If the pack still ships extra example/domain skills, they should live behind a separate install path, not fresh-repo bootstrap.
  Examples:
  - example skills bundle
  - domain bundle
  - demo corpus
  But do not add a large new product surface unless needed; start with a small explicit split.

- [x] Keep the live proof loop working with the smaller bootstrap set.
  Required behaviors that must still work in a fresh repo:
  - enforced wrapper path
  - first operational note creation
  - second-run skill creation
  - repo-local retrieval of newly created note and skill

- [x] Add focused adoption/bootstrapping proofs.
  Main files:
  - `tests/adoptionScripts.test.ts`
  - `tests/wrapperSurfaces.test.ts`
  - `tests/bridgeSurfaces.test.ts`
  Required proofs:
  1. fresh adopted repo does not contain unrelated seeded skills
  2. fresh auto-bootstrapped repo does not contain unrelated seeded notes
  3. enforcement still works on a minimal adopted repo
  4. note creation still works on a minimal adopted repo
  5. skill creation proof loop still works on a minimal adopted repo

- [x] Update docs to match the smaller bootstrap contract.
  Main docs:
  - `README.md`
  - `START_HERE.md`
  - `docs/product-definition.md`
  - `docs/skill-generation-proof-live-2026-04-23.md` if the proof setup changes
  The docs should stop implying that every adopted repo receives the whole seed corpus.

- [x] Final pass criteria:
  1. fresh `adopt` and `auto-bootstrap` repos no longer get unrelated skills like `github`, `ordercli`, or `review-ambiguous-viability-gate`
  2. fresh generic repos no longer get unrelated `pdf/` and `web/` note corpora by default
  3. enforced wrapper behavior still works
  4. first-note bootstrap still works
  5. the live skill-generation proof still passes on a fresh repo
