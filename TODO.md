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


## Retrieval Authority And Generated Skill Quality

- [ ] Confirm the current failure mode with grounded repro.
  Proven issue:
  a workflow-bound task can still set `matchedSkillId` from a weak lexical overlap when the skill shares the workflow and happens to contain broad tokens.
  The reproduced example was:
  - task: `Fix the center-viewer PDF preview runtime error '#e.getOrInsertComputed is not a function' in the desktop app.`
  - weakly matched skill: `desktop-agent-workspace.capture-the-reusable-lesson-from-the-desktop-host-stream-decode-failure-fix`
  - current reasons: `workflow_match`, `primary_term_overlap`
  This is wrong because the event is about PDF.js / WKWebView compatibility, while the matched skill is about Tauri SSE stream parsing.

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

- [ ] Add a narrow skill match adjudicator only for ambiguous cases.
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

- [ ] Replace direct event-to-skill creation with a periodic maintenance loop.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - wrapper / promote entry surfaces as needed
  Goal:
  - the online loop should focus on capture
  - the maintenance loop should focus on organization, compaction, and synthesis
  Target model:
  1. online loop records `trace`
  2. strong evidence may still create or update a `note`
  3. a periodic maintenance loop scans bounded recent traces
  4. the maintenance loop compacts traces into note-backed evidence
  5. only then does it decide whether to patch an existing skill or create a new one

- [ ] Add a bounded periodic trigger for trace maintenance.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - CLI / wrapper / MCP entrypoints as needed
  Acceptable triggers:
  - after `N` new traces
  - on session end
  - on explicit `promote`
  - on `lint`
  Do not:
  - run a whole-repo full-history scan on every turn
  - introduce a hidden global background process

- [ ] Scan and compact recent traces before skill synthesis.
  Main file:
  - `scripts/lib/agent-pack.mjs`
  Target behavior:
  - group recent unresolved traces by stable reusable signal
  - summarize repeated traces so raw event volume does not blow up
  - create a new operational note or update an existing note from the compacted evidence
  - mark which traces are now covered by that note
  Hard rule:
  - do not create a skill directly from raw trace scanning alone
  - the durable bridge must be `trace -> note -> skill`

- [ ] Synthesize skills from note-backed evidence, not raw event phrasing.
  Main file:
  - `scripts/lib/agent-pack.mjs`
  Target flow:
  1. identify notes with enough accumulated evidence
  2. gather the linked/recent traces that justify that note
  3. compare the note against candidate existing skills
  4. decide:
     - keep note only
     - patch existing skill
     - create new skill
     - demote low-quality generated skill
  Use the agent here as the semantic boundary, with a bounded packet:
  - compact note summary
  - compact trace summary
  - small candidate skill set

- [ ] Stop treating incident-capture phrasing as a good skill identity.
  Main file:
  - `scripts/lib/agent-pack.mjs`
  Current problem:
  generated skills can keep names/triggers like:
  - `capture-the-reusable-lesson-from-the-...-fix`
  - `Capture the reusable lesson from ...`
  That describes the learning incident, not the reusable workflow.
  Target:
  - new skill `name`, `displayName`, `trigger`, and `description` must describe the reusable operational boundary
  - event wording must not be copied through unchanged into skill identity fields

- [ ] Compile new skills from note semantics.
  Main file:
  - `scripts/lib/agent-pack.mjs`
  The draft should be derived from:
  - note `When to Use`
  - `Signal`
  - `Interpretation`
  - `Recommended Action`
  - workflow
  The draft should sound like:
  - `use-legacy-pdfjs-build-for-wkwebview`
  not:
  - `capture-the-reusable-lesson-from-the-...-fix`

- [ ] Add a cheap quality gate before writing a new skill.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - tests covering skill synthesis
  The gate should reject or demote a would-be skill when:
  - `When to Use` is incident phrasing instead of reusable workflow phrasing
  - trigger/description merely restate the capture event
  - the draft reads like a single bug summary rather than a reusable procedure boundary
  If the gate fails:
  - keep or update the note
  - do not create the skill yet

- [ ] Add a review/demotion pass for low-quality generated draft skills.
  Main files:
  - `scripts/lib/agent-pack.mjs`
  - docs or maintenance helpers as needed
  Target scope:
  - generated skills with:
    - `status: generated`
    - `maturity: draft`
    - very low evidence count
  Required behavior:
  - re-evaluate them from note-backed semantics
  - either rewrite into a real operational skill or keep only the note

- [ ] Add focused regression proofs for this exact bug family.
  Main files:
  - `tests/bridgeSurfaces.test.ts`
  - `tests/agentScripts.test.ts`
  - `tests/wrapperSurfaces.test.ts`
  Required proofs:
  1. the WKWebView / PDF.js task may surface the SSE skill as a candidate, but must not set `matchedSkillId`
  2. a real SSE task still matches the SSE skill authoritatively
  3. an ambiguous same-workflow query can be resolved by the adjudicator without exposing a false authoritative match
  4. repeated traces can be compacted into a note without unbounded raw-event growth
  5. a one-off incident can create or patch a note without creating a low-quality skill
  6. a new generated skill name/trigger comes from reusable note semantics, not incident-capture phrasing
  7. skill creation happens from note-backed synthesis, not directly from raw trace scanning

- [ ] Final pass criteria:
  1. weak workflow-bound lexical overlap no longer sets `matchedSkillId`
  2. `candidateSkills` can still surface suggestions without being treated as authoritative
  3. ambiguous cases use a cheap structured adjudicator only when deterministic accept/reject cannot decide
  4. recent traces can be compacted periodically so event volume does not grow without bound
  5. new skills are named after reusable workflows, not “capture the reusable lesson from ...” incidents
  6. the pasted PDF.js / WKWebView event shape would stay trace-or-note only unless a real matching skill exists
  7. true repeated reusable workflows can still create a good skill after the note stage


## Same-Repo Session And Agent Bootstrap

- [ ] Goal: make a fresh session or a different agent pick up the same repo-local Datalox pack automatically.
  This is about the same repo and the same local durable knowledge.
  It is not a global shared-memory project.

- [ ] Scope this work to repo-local handoff only.
  In scope:
  - new Cursor/Codex/Claude session in the same repo
  - another agent entering the same repo and discovering the pack automatically
  - preserving the same repo-local skills, notes, and control artifacts
  Out of scope:
  - cross-repo shared memory
  - global skills/notes ownership
  - multi-repo sync or merge policy

- [ ] Define the desired handoff contract.
  A new session/agent in the same repo should:
  1. discover the pack without manual re-explanation
  2. read the same startup surfaces in the right order
  3. use the same repo-local MCP / wrapper / hook path when available
  4. write new notes, skills, and events back into the same repo

- [ ] Audit the current bootstrap path for new sessions and new agents.
  Main surfaces to check:
  - `AGENTS.md`
  - `.datalox/manifest.json`
  - `.datalox/config.json`
  - host adapter install state
  - `START_HERE.md`
  - current MCP reconnect / reload path
  Confirm what already works and what still requires manual prompting.

- [ ] Make same-repo handoff explicit in repo docs and setup surfaces.
  Target:
  - a new session or different agent should know how to use the same repo pack
  - the repo should expose one clean “use this repo’s Datalox pack” instruction path
  Do not blur this with global shared-memory language.

- [ ] Add a concrete proof loop.
  Required live proof:
  1. start a fresh session or different agent in the same repo
  2. verify it detects the same pack automatically or via one explicit repo-local instruction
  3. verify it resolves the same skills/notes path
  4. verify it writes back into the same repo-local knowledge surfaces

- [ ] Final pass criteria:
  1. same-repo handoff works without re-explaining the project each time
  2. repo-local skills/notes/events remain the durable write target
  3. the docs clearly separate repo-local handoff from global shared memory
  4. no fake “global mode” is introduced just to make same-repo session handoff work
