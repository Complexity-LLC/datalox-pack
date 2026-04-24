# Completed TODO Items

This document records work that was completed and verified, so `TODO.md` can stay focused on open work.

## Skill Boundary

Completed:

- Replaced patch-vs-create heuristics with agent-side adjudication.
- Stopped treating auto-retrieved matches as authoritative skill matches.
- Fixed the bootstrap problem before relying on note-aware adjudication.
- Created a clean first-note path for repeated operational gaps.
- Stopped using repetition count as the main semantic test for note creation.
- Allowed a single strong run to create an operational note.
- Added the mature-phase adjudication path for patch-vs-create.
- Added proof tests for the real boundary.

Implemented shape:

- deterministic layer retrieves candidate skills and linked notes
- agent returns a structured decision:
  - `record_only`
  - `create_operational_note`
  - `patch_existing_skill`
  - `create_new_skill`
  - `needs_more_evidence`
- code still enforces hard product rules:
  - `pdf/web/source` cannot patch skills directly
  - only operational evidence can create or patch skills
  - patched skills must come from explicit or retrieved candidates

## Concrete Steps

Completed:

1. separated retrieved candidates from authoritative targets
2. added bootstrap adjudication for the first operational note
3. made note creation semantic instead of repetition-only
4. added the mature adjudication path for patch-vs-create
5. enforced hard write rules after adjudication
6. kept adjudication packets small
7. added end-to-end proof coverage

Main touched areas:

- `scripts/lib/agent-pack.mjs`
- `src/adapters/shared.ts`
- `src/core/packCore.ts`
- `src/mcp/loopPulse.ts`
- wrapper / hook / agent-script tests

## Pass Criteria

Passed:

1. an ordinary wrapped run with weak evidence can stay `trace` only
2. a single strong operational run can create the first operational note with zero existing notes
3. repeated ordinary wrapped failure can create the first operational note without manual MCP intervention
4. a genuine existing-skill match can patch that skill automatically after adjudication
5. weak lexical overlap does not patch an unrelated skill
6. a true no-match path creates a note before it creates a skill
7. a single run cannot create or patch a skill
8. source-derived inputs can create evidence notes but cannot patch skills directly
9. the adjudication packet stays within a small bounded context budget
10. the runtime contract stays skill-first:
    - detect skill
    - read linked notes
    - act

## Bootstrap Payload Shape

Completed:

- confirmed the problem was bootstrap/adoption payload shape, not MCP itself
- defined a smaller default bootstrap contract
- split bootstrap into core runtime surfaces versus optional seed knowledge
- inventoried the minimum files needed for loop behavior
- removed whole-tree adoption of unrelated seed knowledge
- reduced the default seed set to the core pack-maintenance / host-wrapper knowledge
- kept the live skill-generation proof working with the smaller bootstrap set
- added focused adopt/auto-bootstrap proofs
- updated docs to match the smaller bootstrap contract

Passed:

1. fresh `adopt` and `auto-bootstrap` repos no longer get unrelated skills like `github`, `ordercli`, or `review-ambiguous-viability-gate`
2. fresh generic repos no longer get unrelated `pdf/` and `web/` note corpora by default
3. enforced wrapper behavior still works
4. first-note bootstrap still works
5. the live skill-generation proof still passes on a fresh repo

Residual open item:

- optional seed knowledge still needs an explicit separate install path if the pack keeps shipping extra example/domain bundles
