import { describe, expect, it } from "vitest";

import {
  parseFrontmatter,
  parseNoteDoc,
  parseSkillDoc,
  splitFrontmatter,
} from "../scripts/lib/agent-pack/markdown.mjs";

const legacyAgentPackExports = [
  "attachNoteToSkill",
  "attachPatternToSkill",
  "compileRecordedEvent",
  "countPackFiles",
  "getLocalSkillById",
  "learnFromInteraction",
  "lintPack",
  "listLocalSkills",
  "listRecordedEvents",
  "loadAgentConfig",
  "maintainKnowledge",
  "runAutomaticMaintenance",
  "parseArgs",
  "promoteGap",
  "recordTurnResult",
  "refreshControlArtifacts",
  "refreshIndex",
  "resolveLocalKnowledge",
  "resolvePackPaths",
  "syncNoteRetrieval",
  "writeNoteDoc",
  "writePatternDoc",
  "writeSkill",
];

describe("agent pack markdown parsing", () => {
  it("keeps CRLF frontmatter parsing compatible", () => {
    const split = splitFrontmatter(
      "---\r\n"
      + "title: Example\r\n"
      + "metadata:\r\n"
      + "  datalox:\r\n"
      + "    note_paths:\r\n"
      + "      - agent-wiki/notes/example.md\r\n"
      + "---\r\n"
      + "# Example\r\n"
      + "\r\n"
      + "Body\r\n",
    );

    expect(split.frontmatter).toEqual({
      title: "Example",
      metadata: {
        datalox: {
          notePaths: ["agent-wiki/notes/example.md"],
        },
      },
    });
    expect(split.body).toBe("# Example\n\nBody");
  });

  it("parses flow literals and nested frontmatter without caller help", () => {
    expect(parseFrontmatter(
      "tags: [\"repo_engineering\", \"portable_pack\"]\n"
      + "metadata:\n"
      + "  datalox:\n"
      + "    repo_hints: { files: [\"AGENTS.md\"], package_signals: [\"vitest\"] }\n",
    )).toEqual({
      tags: ["repo_engineering", "portable_pack"],
      metadata: {
        datalox: {
          repoHints: {
            files: ["AGENTS.md"],
            packageSignals: ["vitest"],
          },
        },
      },
    });
  });

  it("parses skill docs with existing datalox aliases", () => {
    const parsed = parseSkillDoc(
      "/repo/skills/maintain-datalox-pack/SKILL.md",
      `---
name: maintain-datalox-pack
description: Keep the pack simple.
metadata:
  datalox:
    id: repo-engineering.maintain-datalox-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack.
    note_paths:
      - agent-wiki/notes/maintain-datalox-pack.md
    repo_hints:
      files:
        - AGENTS.md
      package_signals:
        - vitest
---

# Maintain Datalox Pack
`,
    );

    expect(parsed.id).toBe("repo-engineering.maintain-datalox-pack");
    expect(parsed.name).toBe("maintain-datalox-pack");
    expect(parsed.notePaths).toEqual(["agent-wiki/notes/maintain-datalox-pack.md"]);
    expect(parsed.repoHints).toEqual({
      files: ["AGENTS.md"],
      packageSignals: ["vitest"],
    });
  });

  it("parses note docs into agent-usable sections", () => {
    const parsed = parseNoteDoc(
      "agent-wiki/notes/maintain-datalox-pack.md",
      `---
type: note
title: Maintain Datalox Pack
workflow: repo_engineering
skill: repo-engineering.maintain-datalox-pack
status: active
related:
  - agent-wiki/notes/repo-engineering-multi-agent-bootstrap-surfaces.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
---

# Maintain Datalox Pack

## When to Use

Use when the pack is growing faster than the loop requires.

## Signal

The pack is getting too complicated.

## Interpretation

Simplify the protocol before adding a layer.

## Recommended Action

Keep the loop visible in repo files.

## Examples

- Replace hidden indirection with visible notes.

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md
`,
      true,
    );

    expect(parsed.pageType).toBe("note");
    expect(parsed.workflow).toBe("repo_engineering");
    expect(parsed.skillId).toBe("repo-engineering.maintain-datalox-pack");
    expect(parsed.whenToUse).toBe("Use when the pack is growing faster than the loop requires.");
    expect(parsed.action).toBe("Keep the loop visible in repo files.");
    expect(parsed.examples).toEqual(["Replace hidden indirection with visible notes."]);
    expect(parsed.content).toContain("# Maintain Datalox Pack");
  });

  it("keeps the legacy agent-pack public exports available", async () => {
    const legacyModule = await import("../scripts/lib/agent-pack.mjs");

    for (const exportName of legacyAgentPackExports) {
      expect(legacyModule, exportName).toHaveProperty(exportName);
    }
  });
});
