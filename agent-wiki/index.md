# Agent Wiki Index

- Project: Datalox Flow Cytometry Demo
- Generated: 2026-04-12T15:10:51.520Z
- Skills: 2
- Pattern docs: 5

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

## Pattern Docs

### Evolve portable pack

- Path: agent-wiki/meta/evolve-portable-pack.md
- Source: host
- Workflow: repo_engineering
- Updated: 2026-04-12T15:10:00.000Z
- Author: yifanjin
- Linked Skills:
  - repo-engineering.evolve-portable-pack
- Recommended Action: Keep the loop as: detect skill each turn, read linked pattern docs, and write generated skills back into `skills/`.

### Dead tail exception

- Path: agent-wiki/patterns/dead-tail-exception.md
- Source: host
- Workflow: flow_cytometry
- Updated: 2026-04-12T15:10:00.000Z
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Review the exception path first and avoid widening the gate until the artifact explanation is checked.

### QC escalation policy

- Path: agent-wiki/patterns/qc-escalation-policy.md
- Source: host
- Workflow: flow_cytometry
- Updated: 2026-04-12T15:10:00.000Z
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Escalate before applying the change.

### Multi-agent bootstrap surfaces

- Path: agent-wiki/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
- Source: host
- Workflow: repo_engineering
- Updated: 2026-04-12T10:31:16.852Z
- Author: yifanjin
- Linked Skills:
  - repo-engineering.evolve-portable-pack
- Recommended Action: Add WIKI, GEMINI, Copilot, Cursor, Windsurf, and GitHub bootstrap surfaces and keep them aligned with DATALOX.md.

### Review ambiguous viability gate

- Path: agent-wiki/patterns/viability-gate-review.md
- Source: host
- Workflow: flow_cytometry
- Updated: 2026-04-12T15:10:00.000Z
- Author: yifanjin
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Check the exception and escalation pattern docs before widening the gate, then explain the proposed gate decision in terms of the observed…
