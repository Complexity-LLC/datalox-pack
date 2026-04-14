import { describe, expect, it } from "vitest";

import { extractTraceSource } from "../src/core/sourceBundle.js";
import { renderSkillFromTrace, renderTraceNote } from "../src/core/traceArtifacts.js";

describe("trace artifacts", () => {
  it("renders a trace note with action, evidence, and examples on one page", () => {
    const bundle = extractTraceSource({
      id: "trace-1",
      title: "Review ambiguous viability gate trace",
      capturedAt: "2026-04-14T00:00:00.000Z",
      task: "review ambiguous viability gate",
      workflow: "flow_cytometry",
      transcript: "User said the dead tail overlaps the live shoulder.",
      observations: ["dim dead tail overlaps live shoulder"],
      signal: "dim dead tail overlaps live shoulder",
      interpretation: "likely artifact",
      action: "review exception note before widening gate",
      matchedSkillId: "flow-cytometry.review-ambiguous-viability-gate",
      changedFiles: ["agent-wiki/notes/dead-tail-exception.md"],
      outcome: "needs note patch",
    });

    const note = renderTraceNote({
      bundle,
      workflow: "flow_cytometry",
      notePath: "agent-wiki/notes/viability-gate-review.md",
      related: ["agent-wiki/notes/dead-tail-exception.md"],
      sources: ["agent-wiki/events/trace-1.json"],
    });

    expect(note).toContain("## Signal");
    expect(note).toContain("## Action");
    expect(note).toContain("## Examples");
    expect(note).toContain("## Evidence");
    expect(note).toContain("review exception note before widening gate");
    expect(note).toContain("agent-wiki/notes/dead-tail-exception.md");
  });

  it("renders a skill from trace-backed notes", () => {
    const skill = renderSkillFromTrace({
      id: "flow-cytometry.review-ambiguous-viability-gate",
      name: "review-ambiguous-viability-gate",
      description: "Review ambiguous viability gates using reusable trace-backed notes.",
      workflow: "flow_cytometry",
      trigger: "Use when viability review becomes ambiguous.",
      notePaths: ["agent-wiki/notes/viability-gate-review.md"],
      maturity: "draft",
      evidenceCount: 2,
      lastUsedAt: "2026-04-14T00:00:00.000Z",
    });

    expect(skill).toContain("note_paths:");
    expect(skill).toContain("## Workflow");
    expect(skill).toContain("## Notes");
    expect(skill).toContain("agent-wiki/notes/viability-gate-review.md");
  });
});
