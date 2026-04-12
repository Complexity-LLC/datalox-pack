# Datalox Index

- Project: Datalox Flow Cytometry Demo
- Generated: 2026-04-12T10:31:16.870Z
- Skills: 2
- Pattern docs: 4

## Skills

### Review Ambiguous Viability Gate

- Id: flow-cytometry.review-ambiguous-viability-gate
- Workflow: flow_cytometry
- Trigger: Use when live/dead separation is ambiguous during viability gate review.
- Status: approved
- Source: host
- Pattern Docs:
  - .datalox/patterns/dead-tail-exception.md
  - .datalox/patterns/qc-escalation-policy.md
  - .datalox/patterns/viability-gate-review.md

### Evolve Portable Pack

- Id: repo-engineering.evolve-portable-pack
- Workflow: repo_engineering
- Trigger: Use when changing the portable pack or agent guidance in this repo.
- Status: approved
- Source: host
- Updated: 2026-04-12T10:31:16.869Z
- Author: yifanjin
- Pattern Docs:
  - .datalox/meta/evolve-portable-pack.md
  - .datalox/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md

## Pattern Docs

### Dead tail exception

- Path: .datalox/patterns/dead-tail-exception.md
- Source: host
- Workflow: flow_cytometry
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Review the exception path first and avoid widening the gate until the artifact explanation is checked.

### QC escalation policy

- Path: .datalox/patterns/qc-escalation-policy.md
- Source: host
- Workflow: flow_cytometry
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Escalate before applying the change.

### multi-agent bootstrap surfaces

- Path: .datalox/patterns/repo-engineering-multi-agent-bootstrap-surfaces.md
- Source: host
- Workflow: repo_engineering
- Updated: 2026-04-12T10:31:16.852Z
- Author: yifanjin
- Linked Skills:
  - repo-engineering.evolve-portable-pack
- Recommended Action: add WIKI, GEMINI, Copilot, Cursor, Windsurf, and GitHub bootstrap surfaces and keep them aligned with DATALOX.md

### Review ambiguous viability gate

- Path: .datalox/patterns/viability-gate-review.md
- Source: host
- Workflow: flow_cytometry
- Linked Skills:
  - flow-cytometry.review-ambiguous-viability-gate
- Recommended Action: Check the exception and escalation pattern docs before widening the gate.
