# Agent Wiki Index

- Project: Datalox Flow Cytometry Demo
- Generated: 2026-04-12T15:44:44.187Z
- Skills: 2
- Wiki pages: 13

## Skills

### Review Ambiguous Viability Gate

- Id: flow-cytometry.review-ambiguous-viability-gate
- Workflow: flow_cytometry
- Trigger: Use when live/dead separation is ambiguous during viability gate review.
- Status: approved
- Source: host
- Pattern Docs:
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
  - agent-wiki/patterns/viability-gate-review.md

### Evolve Portable Pack

- Id: repo-engineering.evolve-portable-pack
- Workflow: repo_engineering
- Trigger: Use when changing the portable pack or agent guidance in this repo.
- Status: approved
- Source: host
- Updated: 2026-04-12T10:31:16.869Z
- Author: yifanjin
- Pattern Docs:
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md

## Wiki Pages

### Pattern Pages

#### Evolve portable pack

- Path: agent-wiki/meta/evolve-portable-pack.md
- Type: pattern
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T15:10:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Linked Skills:
  - repo-engineering.evolve-portable-pack
- Recommended Action: Keep the loop as: detect skill each turn, read linked pattern docs, and write generated skills back into `skills/`.
- Related:
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
  - agent-wiki/questions/when-should-a-new-skill-be-created.md
- Sources:
  - agent-wiki/sources/portable-pack-design-notes.md
- Summary: Keep the loop as: detect skill each turn, read linked pattern docs, and write generated skills back into `skills/`.

#### Dead tail exception

- Path: agent-wiki/patterns/dead-tail-exception.md
- Type: pattern
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T15:10:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Review the exception path first and avoid widening the gate until the artifact explanation is checked.
- Related:
  - agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/patterns/viability-gate-review.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: Review the exception path first and avoid widening the gate until the artifact explanation is checked.

#### QC escalation policy

- Path: agent-wiki/patterns/qc-escalation-policy.md
- Type: pattern
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T15:10:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Escalate before applying the change.
- Related:
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: Escalate before applying the change.

#### Review ambiguous viability gate

- Path: agent-wiki/patterns/viability-gate-review.md
- Type: pattern
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T15:10:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Check the exception and escalation pattern docs before widening the gate, then explain the proposed gate decision in terms of the observed…
- Related:
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: Check the exception and escalation pattern docs before widening the gate, then explain the proposed gate decision in terms of the observed…

#### Multi-agent bootstrap surfaces

- Path: agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
- Type: pattern
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T10:31:16.852Z
- Review After: 2026-07-12
- Author: yifanjin
- Linked Skills:
  - repo-engineering.evolve-portable-pack
- Recommended Action: Add WIKI, GEMINI, Copilot, Cursor, Windsurf, and GitHub bootstrap surfaces and keep them aligned with DATALOX.md.
- Related:
  - agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/meta/evolve-portable-pack.md
- Sources:
  - agent-wiki/sources/portable-pack-design-notes.md
- Summary: Add WIKI, GEMINI, Copilot, Cursor, Windsurf, and GitHub bootstrap surfaces and keep them aligned with DATALOX.md.

### Source Pages

#### Flow cytometry demo notes

- Path: agent-wiki/sources/flow-cytometry-demo-notes.md
- Type: source
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Summary: This source page records the demo assumptions behind the flow-cytometry seed knowledge in this pack.

#### Portable pack design notes

- Path: agent-wiki/sources/portable-pack-design-notes.md
- Type: source
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
  - agent-wiki/questions/when-should-a-new-skill-be-created.md
- Summary: This source page captures the design constraints behind the Datalox pack: host repo owns writes, skills stay native, and visible wiki artif…

### Concept Pages

#### Ambiguous viability gate review

- Path: agent-wiki/concepts/ambiguous-viability-gate-review.md
- Type: concept
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/qc-escalation-policy.md
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: Ambiguous viability gate review is the situation where the live/dead split is visibly unstable enough that an operator has to interpret cau…

#### Loop bridge

- Path: agent-wiki/concepts/loop-bridge.md
- Type: concept
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
  - agent-wiki/questions/when-should-a-new-skill-be-created.md
- Sources:
  - agent-wiki/sources/portable-pack-design-notes.md
- Summary: A loop bridge is the host-side integration that resolves the right skill before a turn and can patch knowledge after the turn.

### Comparison Pages

#### Manual threshold shift vs exception review

- Path: agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
- Type: comparison
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/patterns/dead-tail-exception.md
  - agent-wiki/patterns/viability-gate-review.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: This comparison helps the agent choose whether to directly move a viability gate or first slow down and test an exception explanation.

#### Repo protocol vs loop bridge

- Path: agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
- Type: comparison
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/meta/evolve-portable-pack.md
  - agent-wiki/questions/when-should-a-new-skill-be-created.md
- Sources:
  - agent-wiki/sources/portable-pack-design-notes.md
- Summary: This comparison separates what the repo files can guarantee from what a host integration can guarantee.

### Question Pages

#### When should a new skill be created?

- Path: agent-wiki/questions/when-should-a-new-skill-be-created.md
- Type: question
- Source: host
- Workflow: repo_engineering
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
  - agent-wiki/concepts/loop-bridge.md
  - agent-wiki/meta/evolve-portable-pack.md
- Sources:
  - agent-wiki/sources/portable-pack-design-notes.md
- Summary: Create a new skill only when the work represents a distinct recurring task boundary with its own stable trigger and workflow.

#### When should QC escalate after viability review?

- Path: agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
- Type: question
- Source: host
- Workflow: flow_cytometry
- Status: active
- Updated: 2026-04-12T16:00:00.000Z
- Review After: 2026-07-12
- Author: yifanjin
- Related:
  - agent-wiki/comparisons/manual-threshold-shift-vs-exception-review.md
  - agent-wiki/concepts/ambiguous-viability-gate-review.md
  - agent-wiki/patterns/qc-escalation-policy.md
- Sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
- Summary: Escalate when the proposed gate change would materially affect downstream interpretation, QC acceptance, or release readiness.
