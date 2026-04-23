import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { compileRecordedEvent, patchKnowledge, promoteGap, recordTurnResult } from "../src/core/packCore.js";

const repoRoot = process.cwd();
const builtCliPath = path.join(repoRoot, "dist", "src", "cli", "main.js");
const builtMcpPath = path.join(repoRoot, "dist", "src", "mcp", "server.js");

const baseConfig = {
  version: 1,
  mode: "repo_only",
  project: {
    id: "demo",
    name: "Demo",
  },
  sources: [
    {
      kind: "local_repo",
      name: "repo-pack",
      enabled: true,
      root: ".datalox",
    },
  ],
  agent: {
    profile: "local_first",
    nativeSkillPolicy: "preserve",
    detectOnEveryLoop: true,
    configReadOrder: [
      "env:DATALOX_CONFIG_JSON",
      ".datalox/config.local.json",
      ".datalox/config.json",
      "AGENTS.md",
    ],
    interfaceOrder: [
      "skill_loop",
      "runtime_compile",
    ],
  },
  paths: {
    seedSkillsDir: "skills",
    seedNotesDir: "agent-wiki/notes",
    hostSkillsDir: "skills",
    hostNotesDir: "agent-wiki/notes",
  },
  runtime: {
    enabled: false,
    baseUrl: "http://localhost:3000",
    defaultWorkflow: "flow_cytometry",
    requestTimeoutMs: 10000,
    endpoints: {
      compile: "/v1/runtime/compile",
    },
  },
  auth: {
    apiKeyEnv: "DATALOX_API_KEY",
    contributorKeyEnv: "DATALOX_CONTRIBUTOR_KEY",
  },
};

async function createPack(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/review-ambiguous-viability-gate"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/evolve-datalox-pack"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/notes"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/meta"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/sources"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/concepts"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/comparisons"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/questions"), { recursive: true });

  await writeFile(path.join(tempDir, ".datalox/config.json"), JSON.stringify(baseConfig, null, 2));
  await writeFile(path.join(tempDir, "AGENTS.md"), "# Demo agent instructions\n");
  await writeFile(path.join(tempDir, "CLAUDE.md"), "# Demo claude instructions\n");
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "demo-pack", dependencies: { vitest: "^2.0.0" } }, null, 2),
  );
  await writeFile(
    path.join(tempDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
    `---
name: review-ambiguous-viability-gate
description: Use when live and dead populations are not cleanly separated during viability gate review.
metadata:
  datalox:
    id: flow-cytometry.review-ambiguous-viability-gate
    workflow: flow_cytometry
    trigger: Use when live/dead separation is ambiguous during viability gate review.
    note_paths:
      - agent-wiki/notes/viability-gate-review.md
    tags:
      - flow_cytometry
      - viability
      - review
    status: approved
---

# Review Ambiguous Viability Gate

## When to Use

Use when live/dead separation is ambiguous during viability gate review.

## Workflow

1. Read the linked pattern docs before changing the gate.
2. Treat this as a judgment step, not a mechanical threshold change.

## Expected Output

- State why this skill matched.
- State the recommended gate action.

## Notes

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "skills/evolve-datalox-pack/SKILL.md"),
    `---
name: evolve-datalox-pack
description: Keep the pack simple.
metadata:
  datalox:
    id: repo-engineering.evolve-datalox-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack or agent guidance.
    note_paths:
      - agent-wiki/notes/evolve-datalox-pack.md
    tags:
      - repo_engineering
      - portable_pack
---

# Evolve Datalox Pack

## When to Use

Use when changing the portable pack or agent guidance.

## Workflow

1. Read the linked pattern docs before acting.
2. Keep the pack simple.

## Expected Output

- State why this skill matched.
- State the pack change being made.

## Notes

- agent-wiki/notes/evolve-datalox-pack.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/viability-gate-review.md"),
    `---
type: pattern
title: Review ambiguous viability gate
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/dead-tail-exception.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Review ambiguous viability gate

## When to Use

Use this pattern when viability review is ambiguous and the live/dead split is not clearly separable.

## Signal

Live and dead populations are not cleanly separated.

## Interpretation

This is a judgment step, not a mechanical threshold change.

## Recommended Action

Review the linked exception pattern before changing the gate.

## Examples

- A boundary that looks unstable and needs exception review before widening the gate.

## Evidence

- agent-wiki/sources/flow-cytometry-demo-notes.md

## Related

- agent-wiki/notes/dead-tail-exception.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/evolve-datalox-pack.md"),
    `---
type: pattern
title: Evolve Datalox pack
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Evolve Datalox pack

## When to Use

Use this pattern when the pack design adds complexity faster than user-visible benefit.

## Signal

The pack is getting too complicated.

## Interpretation

The right response is usually to simplify the loop, not add another layer.

## Recommended Action

Keep the loop as skill detection plus pattern docs.

## Examples

- Replacing hidden pack layers with visible wiki artifacts that an agent can inspect directly.

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/concepts/loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/meta/evolve-datalox-pack.md"),
    `---
type: pattern
title: Evolve Datalox pack meta
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Evolve Datalox pack meta

## Signal

The pack keeps growing new layers.

## Interpretation

Portable pack work should prefer simpler behavior surfaces.

## Recommended Action

Keep Datalox additive to native skills and avoid extra indirection.

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/concepts/loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/dead-tail-exception.md"),
    `---
type: pattern
title: Dead tail exception
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Dead tail exception

## When to Use

Use this pattern when dim dead-tail overlap makes the gate boundary look unstable.

## Signal

Dim dead tail overlaps live shoulder.

## Interpretation

This often indicates artifact rather than a true biological shift.

## Recommended Action

Review the exception path before widening the gate.

## Examples

- A dim tail drifting into the live shoulder after staining prep.

## Evidence

- agent-wiki/sources/flow-cytometry-demo-notes.md

## Related

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/sources/flow-cytometry-demo-notes.md"),
    `---
type: source
title: Flow cytometry demo notes
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources: []
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Flow cytometry demo notes

## Overview

Demo notes backing the seed flow-cytometry patterns.

## Key Claims

- Ambiguous viability review is a judgment step.

## Limitations

- Demo only.

## Related

- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/concepts/loop-bridge.md"),
    `---
type: concept
title: Loop bridge
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Loop bridge

## Definition

A loop bridge resolves a skill before the turn and can patch knowledge after the turn.

## Why It Matters

It makes the pack active instead of merely discoverable.

## Examples

- MCP resolve_loop.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md"),
    `---
type: comparison
title: Repo protocol vs loop bridge
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Repo protocol vs loop bridge

## Overview

This comparison explains when files are enough and when host integration is needed.

## Comparison

| Dimension | Repo protocol | Loop bridge |
|-----------|---------------|-------------|
| Automatic per-turn behavior | Low | High |

## Verdict

Use the loop bridge when you need per-turn behavior.

## Related

- agent-wiki/questions/when-should-a-new-skill-be-created.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/questions/when-should-qc-escalate-after-viability-review.md"),
    `---
type: question
title: When should QC escalate after viability review?
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# When should QC escalate after viability review?

## Question

When should an ambiguous viability decision escalate to QC?

## Answer

Escalate when the gate change would materially affect downstream QC acceptance.

## Escalate When

- The result would flip from pass to fail.

## Related

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/questions/when-should-a-new-skill-be-created.md"),
    `---
type: question
title: When should a new skill be created?
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# When should a new skill be created?

## Question

When should the pack create a new skill?

## Answer

Only when a new recurring task boundary appears.

## Escalate When

- The new knowledge is just another exception.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/sources/portable-pack-design-notes.md"),
    `---
type: source
title: Portable pack design notes
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources: []
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Portable pack design notes

## Overview

Design notes behind the pack loop.

## Key Claims

- Host integration controls per-turn behavior.

## Limitations

- Design assumptions may change.

## Related

- agent-wiki/concepts/loop-bridge.md
`,
  );
}

async function createMinimalPack(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/notes"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/meta"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/sources"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/concepts"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/comparisons"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/questions"), { recursive: true });

  await writeFile(path.join(tempDir, ".datalox/config.json"), JSON.stringify(baseConfig, null, 2));
  await writeFile(path.join(tempDir, "AGENTS.md"), "# Demo agent instructions\n");
  await writeFile(path.join(tempDir, "CLAUDE.md"), "# Demo claude instructions\n");
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "minimal-demo-pack", dependencies: {} }, null, 2),
  );
}

async function addFlowStyleSkill(tempDir: string) {
  await mkdir(path.join(tempDir, "skills/github"), { recursive: true });
  await writeFile(
    path.join(tempDir, "skills/github/SKILL.md"),
    `---
name: github
description: "GitHub operations via \`gh\` CLI: issues, PRs, CI runs, code review, API queries."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐙",
        "requires": { "bins": ["gh"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (brew)",
            },
          ],
      },
  }
---

# GitHub Skill

Use the \`gh\` CLI to interact with GitHub repositories, issues, PRs, and CI.

## When to Use

- Checking PR status, reviews, or merge readiness
- Viewing CI/workflow run status and logs

## Workflow

1. Use \`gh\` commands rather than browser-only flows.
2. Prefer direct repo and PR identifiers when available.

## Expected Output

- State the GitHub action being performed.
- Return the relevant PR or CI status clearly.
`,
  );
}

async function addCrlfSkill(tempDir: string) {
  await mkdir(path.join(tempDir, "skills/crlf-demo"), { recursive: true });
  await writeFile(
    path.join(tempDir, "skills/crlf-demo/SKILL.md"),
    [
      "---",
      "name: crlf-demo",
      "description: Use when validating CRLF frontmatter parsing.",
      "metadata:",
      "  datalox:",
      "    id: repo-engineering.crlf-demo",
      "    workflow: repo_engineering",
      "    trigger: Use when validating CRLF frontmatter parsing.",
      "    note_paths:",
      "      - agent-wiki/notes/crlf-demo.md",
      "---",
      "",
      "# CRLF Demo",
      "",
      "## When to Use",
      "",
      "Use when validating CRLF frontmatter parsing.",
      "",
      "## Workflow",
      "",
      "1. Resolve the explicit skill id.",
      "2. Load the linked note.",
      "",
      "## Notes",
      "",
      "- agent-wiki/notes/crlf-demo.md",
      "",
    ].join("\r\n"),
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/crlf-demo.md"),
    [
      "---",
      "type: note",
      "title: CRLF demo note",
      "workflow: repo_engineering",
      "status: active",
      "sources:",
      "  - agent-wiki/sources/portable-pack-design-notes.md",
      "---",
      "",
      "# CRLF demo note",
      "",
      "## When to Use",
      "",
      "Use this note when validating CRLF frontmatter parsing.",
      "",
      "## Signal",
      "",
      "A Windows-edited file uses CRLF line endings.",
      "",
      "## Interpretation",
      "",
      "Frontmatter parsing should still work.",
      "",
      "## Recommended Action",
      "",
      "Treat CRLF and LF files the same.",
      "",
      "## Evidence",
      "",
      "- agent-wiki/sources/portable-pack-design-notes.md",
      "",
      "## Related",
      "",
      "- agent-wiki/notes/evolve-datalox-pack.md",
      "",
    ].join("\r\n"),
  );
}

async function createHostRepo(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "host-repo" }, null, 2),
  );
}

function runBuiltCli(tempDir: string, args: string[], envOverrides: Record<string, string> = {}) {
  return spawnSync("node", [builtCliPath, ...args], {
    cwd: tempDir,
    encoding: "utf8",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });
}

function extractStructuredResult(result: unknown) {
  const envelope = extractStructuredEnvelope(result);
  if (
    envelope
    && typeof envelope === "object"
    && "result" in envelope
  ) {
    return (envelope as { result: unknown }).result;
  }

  const resolved = (typeof result === "object" && result !== null && "toolResult" in result)
    ? (result as { toolResult: unknown }).toolResult
    : result;

  const content = (resolved as { content?: Array<{ type: string; text?: string }> }).content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("No structured MCP result found");
  }
  return JSON.parse(text) as unknown;
}

function extractStructuredEnvelope(result: unknown) {
  const resolved = (typeof result === "object" && result !== null && "toolResult" in result)
    ? (result as { toolResult: unknown }).toolResult
    : result;

  if (
    resolved
    && typeof resolved === "object"
    && "structuredContent" in resolved
    && (resolved as { structuredContent?: unknown }).structuredContent
    && typeof (resolved as { structuredContent?: unknown }).structuredContent === "object"
  ) {
    return (resolved as { structuredContent: Record<string, unknown> }).structuredContent;
  }

  return null;
}

describe("bridge surfaces", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("runs the full loop through the built CLI", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-cli-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");

    const recordResult = runBuiltCli(tempDir, [
      "record",
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);
    expect(recordResult.status).toBe(0);
    const recorded = JSON.parse(recordResult.stdout);

    const patchResult = runBuiltCli(tempDir, [
      "patch",
      "--event-path",
      recorded.event.relativePath,
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);
    expect(patchResult.status).toBe(0);
    const patched = JSON.parse(patchResult.stdout);
    expect(patched.skill.operation).toBe("update_skill");
    const patchedNoteFile = await readFile(path.join(tempDir, "agent-wiki", "notes", "viability-gate-review.md"), "utf8");
    expect(patchedNoteFile).toContain("usage:");
    expect(patchedNoteFile).toContain("read_count: 1");

    const lintResult = runBuiltCli(tempDir, ["lint", "--json"]);
    expect(lintResult.status).toBe(0);
    const linted = JSON.parse(lintResult.stdout);
    expect(linted.ok).toBe(true);
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("update_skill");
  }, 60000);

  it("emits JSON for core CLI commands without requiring --json", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-cli-json-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(resolved.matches[0]).not.toHaveProperty("score");
    const noteFile = await readFile(path.join(tempDir, "agent-wiki", "notes", "viability-gate-review.md"), "utf8");
    expect(noteFile).toContain("read_count: 1");
    expect(noteFile).toContain("apply_count: 0");
  }, 20000);

  it("parses flow-style frontmatter in agent-native skills", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-flow-skill-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);
    await addFlowStyleSkill(tempDir);

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--task",
      "check PR status and CI",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches.some((match: any) => match.skill.name === "github")).toBe(true);
  }, 20000);

  it("does not admit null-workflow github for a workflow-bound repo-engineering query", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-flow-skill-reject-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);
    await addFlowStyleSkill(tempDir);

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--task",
      "evaluate issues in pack guidance",
      "--workflow",
      "repo_engineering",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches.some((match: any) => match.skill.name === "github")).toBe(false);
    expect(resolved.matches[0].skill.id).toBe("repo-engineering.evolve-datalox-pack");
  }, 20000);

  it("parses CRLF frontmatter in skills and linked notes", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-crlf-skill-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);
    await addCrlfSkill(tempDir);

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--skill",
      "repo-engineering.crlf-demo",
      "--workflow",
      "repo_engineering",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    const match = resolved.matches.find((item: any) => item.skill.id === "repo-engineering.crlf-demo");
    expect(match).toBeTruthy();
    expect(match.linkedNotes).toHaveLength(1);
    expect(match.linkedNotes[0].title).toBe("CRLF demo note");
  }, 20000);

  it("resolves a skill even when one linked note is missing", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-missing-linked-note-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);
    await writeFile(
      path.join(tempDir, "skills/evolve-datalox-pack/SKILL.md"),
      `---
name: evolve-datalox-pack
description: Keep the pack simple.
metadata:
  datalox:
    id: repo-engineering.evolve-datalox-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack or agent guidance.
    note_paths:
      - agent-wiki/notes/evolve-datalox-pack.md
      - agent-wiki/notes/missing-note.md
---

# Evolve Datalox Pack

## When to Use

Use when changing the portable pack or agent guidance.

## Notes

- agent-wiki/notes/evolve-datalox-pack.md
- agent-wiki/notes/missing-note.md
`,
    );

    const resolveResult = runBuiltCli(tempDir, [
      "resolve",
      "--skill",
      "repo-engineering.evolve-datalox-pack",
      "--workflow",
      "repo_engineering",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);
    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("repo-engineering.evolve-datalox-pack");
    expect(resolved.matches[0].linkedNotes).toHaveLength(1);
    expect(resolved.matches[0].linkedNotes[0].path).toBe("agent-wiki/notes/evolve-datalox-pack.md");
    expect(resolved.matches[0].missingNotePaths).toEqual(["agent-wiki/notes/missing-note.md"]);
  }, 20000);

  it("adopts the pack into a host repo through the built CLI", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-"));
    tempDirs.push(hostDir);
    await createHostRepo(hostDir);

    const adoptResult = runBuiltCli(repoRoot, [
      "adopt",
      hostDir,
      "--pack-source",
      repoRoot,
      "--json",
    ]);
    expect(adoptResult.status).toBe(0);
    const adopted = JSON.parse(adoptResult.stdout);
    expect(adopted.copied.some((item: string) => item === "DATALOX.md")).toBe(true);
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("durable outputs: `note`, `skill`");
    expect(await readFile(path.join(hostDir, "skills/evolve-datalox-pack/SKILL.md"), "utf8")).toContain("## Workflow");
  }, 20000);

  it("injects Datalox adapters into existing instruction files during adopt", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-existing-instructions-"));
    tempDirs.push(hostDir);
    await createHostRepo(hostDir);
    await mkdir(path.join(hostDir, ".github"), { recursive: true });
    await writeFile(path.join(hostDir, "AGENTS.md"), "# Host agent instructions\n", "utf8");
    await writeFile(path.join(hostDir, "CLAUDE.md"), "# Host claude instructions\n", "utf8");
    await writeFile(path.join(hostDir, ".github", "copilot-instructions.md"), "# Host copilot instructions\n", "utf8");

    const firstAdopt = runBuiltCli(repoRoot, [
      "adopt",
      hostDir,
      "--pack-source",
      repoRoot,
      "--json",
    ]);
    expect(firstAdopt.status).toBe(0);

    const adopted = JSON.parse(firstAdopt.stdout);
    expect(adopted.injected).toEqual(expect.arrayContaining([
      "AGENTS.md",
      "CLAUDE.md",
      ".github/copilot-instructions.md",
    ]));

    const agentsFile = await readFile(path.join(hostDir, "AGENTS.md"), "utf8");
    expect(agentsFile).toContain("# Host agent instructions");
    expect(agentsFile).toContain("DATALOX_PACK:BEGIN");
    expect(agentsFile).toContain("read it after this file");

    const claudeFile = await readFile(path.join(hostDir, "CLAUDE.md"), "utf8");
    expect(claudeFile).toContain("# Host claude instructions");
    expect(claudeFile).toContain("@DATALOX.md");
    expect(claudeFile).toContain("DATALOX_PACK:BEGIN");

    const copilotFile = await readFile(path.join(hostDir, ".github", "copilot-instructions.md"), "utf8");
    expect(copilotFile).toContain("# Host copilot instructions");
    expect(copilotFile).toContain("Also consult `AGENTS.md` and `DATALOX.md`");

    const secondAdopt = runBuiltCli(repoRoot, [
      "adopt",
      hostDir,
      "--pack-source",
      repoRoot,
      "--json",
    ]);
    expect(secondAdopt.status).toBe(0);

    const readopted = JSON.parse(secondAdopt.stdout);
    expect(readopted.injected).toEqual([]);
    expect((await readFile(path.join(hostDir, "AGENTS.md"), "utf8")).match(/DATALOX_PACK:BEGIN/gu)?.length ?? 0).toBe(1);
  }, 20000);

  it("runs the full loop through the MCP server", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-mcp-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [builtMcpPath],
      cwd: repoRoot,
      stderr: "pipe",
    });
    const client = new Client({ name: "datalox-pack-test-client", version: "1.0.0" }, { capabilities: {} });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "resolve_loop",
          "record_turn_result",
          "patch_knowledge",
          "promote_gap",
          "lint_pack",
          "adopt_pack",
        ]),
      );

      const resolveResult = await client.callTool({
        name: "resolve_loop",
        arguments: {
          repo_path: tempDir,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
        },
      });
      const resolveEnvelope = extractStructuredEnvelope(resolveResult) as any;
      const resolved = extractStructuredResult(resolveResult) as any;
      expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
      expect(resolved.matches[0]).not.toHaveProperty("score");
      expect(resolveEnvelope.loop_pulse.command).toBe("resolve_loop");
      expect(resolveEnvelope.loop_pulse.repo_path).toBe(tempDir);
      expect(resolveEnvelope.loop_pulse.recommended_next_tool).toBe("record_turn_result");
      expect(resolveEnvelope.loop_pulse.has_agent_wiki).toBe(true);

      const recordedResult = await client.callTool({
        name: "record_turn_result",
        arguments: {
          repo_path: tempDir,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
          observations: ["dim dead tail overlaps live shoulder"],
          interpretation: "likely staining artifact",
          recommended_action: "review exception pattern before widening gate",
        },
      });
      const recorded = extractStructuredResult(recordedResult) as any;
      expect(recorded.occurrenceCount).toBe(1);
      expect(recorded.event.relativePath).toContain("agent-wiki/events/");
      expect(recorded.event.payload.eventClass).toBe("trace");
      expect(recorded.event.payload).not.toHaveProperty("matchedSkillScore");

      const promoteResult = await client.callTool({
        name: "promote_gap",
        arguments: {
          repo_path: tempDir,
          event_path: recorded.event.relativePath,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
          observations: ["dim dead tail overlaps live shoulder"],
          interpretation: "likely staining artifact",
          recommended_action: "review exception pattern before widening gate",
          adjudication_decision: "patch_existing_skill",
          adjudication_skill_id: "flow-cytometry.review-ambiguous-viability-gate",
        },
      });
      const promoted = extractStructuredResult(promoteResult) as any;
      expect(promoted.decision.action).toBe("create_note_from_gap");
      expect(promoted.event.payload.eventClass).toBe("candidate");

      const secondPromoteResult = await client.callTool({
        name: "promote_gap",
        arguments: {
          repo_path: tempDir,
          event_path: recorded.event.relativePath,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
          observations: ["dim dead tail overlaps live shoulder"],
          interpretation: "likely staining artifact",
          recommended_action: "review exception pattern before widening gate",
          adjudication_decision: "patch_existing_skill",
          adjudication_skill_id: "flow-cytometry.review-ambiguous-viability-gate",
        },
      });
      const secondPromoted = extractStructuredResult(secondPromoteResult) as any;
      expect(secondPromoted.decision.action).toBe("patch_skill_with_note");
      expect(secondPromoted.promotion.skill.operation).toBe("update_skill");

      const lintResult = await client.callTool({
        name: "lint_pack",
        arguments: {
          repo_path: tempDir,
        },
      });
      const linted = extractStructuredResult(lintResult) as any;
      expect(linted.ok).toBe(true);
      expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("record_event");
      expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("lint_pack");
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30000);

  it("uses the CLI promotion ladder from event to wiki to skill", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-promote-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const seed = runBuiltCli(tempDir, [
      "record",
      "--task",
      "stabilize manual pack adoption in non technical repos",
      "--workflow",
      "agent_adoption",
      "--summary",
      "Users need the pack to be visible and reversible during setup",
      "--observation",
      "new repos need a visible onboarding flow and trust controls",
      "--interpretation",
      "this is a recurring adoption workflow rather than a one-off note",
      "--action",
      "create a skill that guides adoption and points to the pattern doc",
      "--json",
    ]);
    expect(seed.status).toBe(0);
    const seedBody = JSON.parse(seed.stdout);

    const first = runBuiltCli(tempDir, [
      "promote",
      "--event-path",
      seedBody.event.relativePath,
      "--decision",
      "create_operational_note",
      "--task",
      "stabilize manual pack adoption in non technical repos",
      "--workflow",
      "agent_adoption",
      "--summary",
      "Users need the pack to be visible and reversible during setup",
      "--observation",
      "new repos need a visible onboarding flow and trust controls",
      "--interpretation",
      "this is a recurring adoption workflow rather than a one-off note",
      "--action",
      "create a skill that guides adoption and points to the pattern doc",
      "--json",
    ]);
    expect(first.status).toBe(0);
    const firstBody = JSON.parse(first.stdout);
    expect(firstBody.decision.action).toBe("create_note_from_gap");
    expect(firstBody.promotion.note.relativePath).toContain("agent-wiki/notes/");
    expect(firstBody.promotion.skill).toBeNull();

    const second = runBuiltCli(tempDir, [
      "promote",
      "--event-path",
      seedBody.event.relativePath,
      "--decision",
      "create_new_skill",
      "--task",
      "stabilize manual pack adoption in non technical repos",
      "--workflow",
      "agent_adoption",
      "--summary",
      "Users need the pack to be visible and reversible during setup",
      "--observation",
      "new repos need a visible onboarding flow and trust controls",
      "--interpretation",
      "this is a recurring adoption workflow rather than a one-off note",
      "--action",
      "create a skill that guides adoption and points to the pattern doc",
      "--json",
    ]);
    expect(second.status).toBe(0);
    const secondBody = JSON.parse(second.stdout);
    expect(secondBody.decision.action).toBe("create_skill_from_gap");
    expect(secondBody.promotion.skill.operation).toBe("create_skill");
    expect(secondBody.promotion.skill.payload.maturity).toBe("draft");
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("record_event");
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("create_skill");
  }, 60000);

  it("records first and compiles repeated stored events into a note then a skill", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-compile-recorded-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const traceInput = {
      repoPath: tempDir,
      task: "stabilize release onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a reversible onboarding path before first agent run",
      observations: [
        "release onboarding keeps failing because repos have no visible install surface",
      ],
      interpretation: "this is a reusable onboarding gap rather than a one-off setup note",
      recommendedAction: "create an onboarding playbook and attach it to a reusable skill",
      outcome: "failure",
      eventKind: "implementation",
    };

    const firstTrace = await recordTurnResult(traceInput);
    expect(firstTrace.event.payload.eventClass).toBe("trace");
    const secondTrace = await recordTurnResult(traceInput);
    const compiledTrace = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: secondTrace.event.relativePath,
    });
    expect(compiledTrace.decision.action).toBe("record_only");
    expect(compiledTrace.decision.reason).toContain("trace events");
    expect(compiledTrace.promotion).toBeNull();

    const input = {
      repoPath: tempDir,
      task: "stabilize release onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a reversible onboarding path before first agent run",
      observations: [
        "release onboarding keeps failing because repos have no visible install surface",
      ],
      interpretation: "this is a reusable onboarding gap rather than a one-off setup note",
      recommendedAction: "create an onboarding playbook and attach it to a reusable skill",
      outcome: "failure",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate" as const,
      adjudicationDecision: "create_operational_note",
    };

    const firstRecorded = await recordTurnResult(input);
    expect(firstRecorded.event.relativePath).toContain("agent-wiki/events/");
    expect(firstRecorded.event.payload.eventClass).toBe("candidate");
    const firstCompiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: firstRecorded.event.relativePath,
    });
    expect(firstCompiled.decision.action).toBe("create_note_from_gap");
    expect(firstCompiled.promotion?.note?.relativePath).toContain("agent-wiki/notes/");
    expect(firstCompiled.promotion?.skill).toBeNull();

    const secondRecorded = await recordTurnResult({
      ...input,
      adjudicationDecision: "create_new_skill",
    });
    const secondCompiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: secondRecorded.event.relativePath,
    });
    expect(secondCompiled.decision.action).toBe("create_skill_from_gap");
    expect(secondCompiled.promotion?.skill?.operation).toBe("create_skill");
    const promotedNote = await readFile(path.join(tempDir, firstCompiled.promotion.note.relativePath), "utf8");
    expect(promotedNote).toContain("When release onboarding keeps failing because repos have no visible install surface.");
    expect(promotedNote).toContain("create an onboarding playbook and attach it to a reusable skill");
    expect(promotedNote).not.toContain("Reuse this note before changing the current workflow.");
    expect(await readFile(path.join(tempDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
    expect(await readFile(path.join(tempDir, "agent-wiki", "log.md"), "utf8")).toContain("create_note");
    expect(await readFile(path.join(tempDir, "agent-wiki", "log.md"), "utf8")).toContain("create_skill");
  }, 20000);

  it("keeps weak evidence as trace history only", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-trace-only-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "inspect a one-off onboarding failure",
      workflow: "agent_adoption",
      summary: "a one-off onboarding failure appeared once",
      observations: ["single weak signal"],
      interpretation: "not enough evidence yet",
      recommendedAction: "watch the next run before writing anything durable",
      eventKind: "implementation",
      eventClass: "trace",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("record_only");
    expect(compiled.decision.reason).toContain("trace events");
    expect(compiled.promotion).toBeNull();
  });

  it("creates the first operational note from a single strong run even with zero existing notes", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-first-note-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "stabilize first-run onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a committed onboarding step before autonomous edits",
      observations: ["fresh repos cannot recover when onboarding is hidden"],
      interpretation: "this is a reusable operational gap",
      recommendedAction: "write the onboarding step into a durable note before changing the workflow",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate",
      adjudicationDecision: "create_operational_note",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("create_note_from_gap");
    expect(compiled.promotion?.note?.relativePath).toContain("agent-wiki/notes/");
    expect(compiled.promotion?.skill).toBeNull();
    expect(compiled.adjudicationPacket.candidateSkills).toHaveLength(0);
    expect(compiled.adjudicationPacket.linkedOperationalNotes).toHaveLength(0);
  });

  it("does not let a single run create a skill before the note stage", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-single-run-skill-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "stabilize first-run onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a committed onboarding step before autonomous edits",
      observations: ["fresh repos cannot recover when onboarding is hidden"],
      interpretation: "this is a reusable operational gap",
      recommendedAction: "write the onboarding step into a durable note before changing the workflow",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate",
      adjudicationDecision: "create_new_skill",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("create_note_from_gap");
    expect(compiled.promotion?.note?.relativePath).toContain("agent-wiki/notes/");
    expect(compiled.promotion?.skill).toBeNull();
  });

  it("blocks weak cross-workflow lexical matches from patching unrelated skills", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-weak-match-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "review live delivery order status",
      workflow: "flow_cytometry",
      summary: "mixed words overlapped with an unrelated order workflow",
      observations: ["the task text mentions order status but the workflow is flow cytometry"],
      interpretation: "weak lexical overlap should not patch an unrelated host skill",
      recommendedAction: "record only until a real workflow match exists",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate",
      adjudicationDecision: "patch_existing_skill",
      adjudicationSkillId: "ordercli",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("record_only");
    expect(compiled.decision.reason).toContain("valid explicit or candidate skill target");
    expect(compiled.promotion).toBeNull();
  });

  it("lets source-derived inputs create notes but not patch skills directly", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-source-note-only-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      sourceKind: "pdf",
      task: "extract onboarding protocol details from a paper",
      workflow: "repo_engineering",
      summary: "the PDF described a reusable onboarding protocol",
      observations: ["source-derived protocol evidence should be grounded before workflow changes"],
      interpretation: "this is evidence worth keeping but not enough to patch a skill directly",
      recommendedAction: "record the evidence note and let later trace evidence decide any workflow change",
      eventKind: "capture:pdf",
      eventClass: "candidate",
      adjudicationDecision: "patch_existing_skill",
      adjudicationSkillId: "repo-engineering.evolve-datalox-pack",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("create_note_from_gap");
    expect(compiled.decision.reason).toContain("source-derived inputs can create notes");
    expect(compiled.promotion?.note?.relativePath).toContain("agent-wiki/notes/");
    expect(compiled.promotion?.skill).toBeNull();
  });

  it("keeps the adjudication packet bounded for normal runs", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-bounded-packet-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "review ambiguous live dead gate",
      workflow: "flow_cytometry",
      summary: "dim dead tail overlaps live shoulder during viability review",
      observations: ["obs-1", "obs-2", "obs-3", "obs-4 should be trimmed"],
      interpretation: "likely staining artifact",
      recommendedAction: "review exception pattern before widening gate",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate",
      adjudicationDecision: "create_operational_note",
    });
    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.adjudicationPacket.candidateSkills.length).toBeLessThanOrEqual(3);
    expect(compiled.adjudicationPacket.linkedOperationalNotes.length).toBeLessThanOrEqual(3);
    expect(compiled.adjudicationPacket.repeatedEventSummary.recentObservations.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(compiled.adjudicationPacket).length).toBeLessThan(2500);
  });

  it("keeps weak retrieval candidates from assigning workflow during post-run recording", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-weak-workflow-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);
    await mkdir(path.join(tempDir, "skills/repo-readme-helper"), { recursive: true });
    await writeFile(
      path.join(tempDir, "skills/repo-readme-helper/SKILL.md"),
      `---
name: repo-readme-helper
description: Handle repo readme helper tasks.
metadata:
  datalox:
    id: repo-engineering.repo-readme-helper
    workflow: repo_engineering
    trigger: Repo readme helper.
    tags:
      - repo
      - readme
      - helper
---

# Repo Readme Helper

## When to Use

Use when handling repo readme helper tasks.
`,
    );

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "Read README.md and say one sentence about this repo.",
      summary: "generic repo description request",
      observations: ["fresh repo asked for a one-line description"],
      interpretation: "this is a generic control run, not a reusable workflow match",
      recommendedAction: "record the trace without inheriting a workflow from weak candidates",
      eventKind: "wrapper:codex:success",
      eventClass: "trace",
    });

    expect(recorded.event.payload.workflow).toBe("unknown");
    expect(recorded.event.payload.matchedSkillId).toBeNull();
    expect(recorded.event.payload.candidateSkills.map((candidate: { skillId: string }) => candidate.skillId)).toContain(
      "repo-engineering.repo-readme-helper",
    );
  });

  it("does not let an identical repeated run regress from note promotion back to trace-only", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-sticky-adjudication-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);

    const firstRecorded = await recordTurnResult({
      repoPath: tempDir,
      task: "stabilize first-run onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a committed onboarding step before autonomous edits",
      observations: ["fresh repos cannot recover when onboarding is hidden"],
      interpretation: "this is a reusable operational gap",
      recommendedAction: "write the onboarding step into a durable note before changing the workflow",
      eventKind: "wrapper:generic:failure",
      eventClass: "candidate",
      adjudicationDecision: "create_operational_note",
    });
    const firstCompiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: firstRecorded.event.relativePath,
    });

    expect(firstCompiled.decision.action).toBe("create_note_from_gap");
    expect(firstCompiled.promotion?.note?.payload?.kind).toBe("workflow_note");
    expect(firstCompiled.promotion?.note?.relativePath).toContain("agent-wiki/notes/");
    const firstNoteFile = await readFile(path.join(tempDir, firstCompiled.promotion?.note?.relativePath ?? ""), "utf8");
    expect(firstNoteFile).toContain("kind: workflow_note");
    expect(firstNoteFile).toContain("workflow: agent_adoption");
    expect(firstNoteFile).toContain("When fresh repos cannot recover when onboarding is hidden.");
    expect(firstNoteFile).not.toContain("Use this note when stabilize first-run onboarding in agent-managed repos");
    expect(firstNoteFile).not.toContain("Add a concrete observed case here");
    expect(firstNoteFile).not.toContain("Add a concrete source, reviewer note, or case trace here");
    expect(firstNoteFile).not.toContain("Add a wiki page path such as agent-wiki/notes/example.md");

    const secondRecorded = await recordTurnResult({
      repoPath: tempDir,
      task: "stabilize first-run onboarding in agent-managed repos",
      workflow: "agent_adoption",
      summary: "new repos need a committed onboarding step before autonomous edits",
      observations: ["fresh repos cannot recover when onboarding is hidden"],
      eventKind: "wrapper:generic:failure",
      eventClass: "trace",
    });
    const secondCompiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: secondRecorded.event.relativePath,
    });

    expect(secondCompiled.recorded?.event?.payload?.eventClass ?? secondCompiled.event.payload.eventClass).toBe("trace");
    expect(secondCompiled.decision.action).toBe("create_note_from_gap");
    expect(secondCompiled.decision.reason).toContain("do not regress to trace only");
    expect(secondCompiled.promotion?.note?.relativePath).toBe(firstCompiled.promotion?.note?.relativePath);
  });

  it("keeps promoted note rendering compact and grounded", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-compact-promoted-note-"));
    tempDirs.push(tempDir);
    await createMinimalPack(tempDir);

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "Inspect the repo setup instructions. If there is a reusable setup gap, explain the correction for future agents in one short paragraph.",
      summary: "repo setup guidance still points at stale bootstrap entrypoints",
      signal: "README.md and START_HERE.md still point at missing bootstrap entrypoints",
      observations: [
        "README.md still points at a missing setup script.",
        "START_HERE.md still points at a missing adopt entrypoint.",
      ],
      interpretation: "the bootstrap path is fragmented across stale setup instructions",
      recommendedAction: "rewrite the setup instructions to the canonical CLI-backed entrypoints",
      changedFiles: [".claude/", ".cursor/", ".datalox/", "README.md", "START_HERE.md", "agent-wiki/", "bin/", "skills/"],
      eventKind: "wrapper:codex:success",
      eventClass: "candidate",
      adjudicationDecision: "create_operational_note",
    });

    const compiled = await compileRecordedEvent({
      repoPath: tempDir,
      eventPath: recorded.event.relativePath,
    });

    expect(compiled.decision.action).toBe("create_note_from_gap");
    const noteFile = await readFile(path.join(tempDir, compiled.promotion?.note?.relativePath ?? ""), "utf8");
    expect(noteFile).toContain("When README.md and START_HERE.md still point at missing bootstrap entrypoints.");
    expect(noteFile).toContain("## Evidence");
    expect(noteFile).toContain(recorded.event.relativePath);
    expect(noteFile).not.toContain("Use this note when inspect the repo setup instructions");
    expect(noteFile).not.toContain(".claude/");
    expect(noteFile).not.toContain(".cursor/");
    expect(noteFile).not.toContain(".datalox/");
    expect(noteFile).not.toContain("skills/");
    expect(noteFile).not.toContain("Add a concrete observed case here");
    expect(noteFile).not.toContain("Add a concrete source, reviewer note, or case trace here");
    expect(noteFile).not.toContain("Add a wiki page path such as agent-wiki/notes/example.md");
  });

  it("requires provenance for durable writes unless an explicit override is provided", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-provenance-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    await expect(patchKnowledge({
      repoPath: tempDir,
      task: "document a reusable onboarding correction",
      workflow: "agent_adoption",
      summary: "future agents need a committed onboarding step",
      title: "Committed onboarding step",
      signal: "onboarding kept depending on hidden setup",
      interpretation: "the setup correction is reusable across repos",
      recommendedAction: "write the onboarding step into repo guidance",
    })).rejects.toThrow("requires durable-write provenance");

    const recorded = await recordTurnResult({
      repoPath: tempDir,
      task: "document a reusable onboarding correction",
      workflow: "agent_adoption",
      summary: "future agents need a committed onboarding step",
      observations: ["onboarding kept depending on hidden setup"],
      eventClass: "candidate",
      eventKind: "wrapper:generic:failure",
    });

    const patched = await patchKnowledge({
      repoPath: tempDir,
      task: "document a reusable onboarding correction",
      workflow: "agent_adoption",
      summary: "future agents need a committed onboarding step",
      title: "Committed onboarding step",
      signal: "onboarding kept depending on hidden setup",
      interpretation: "the setup correction is reusable across repos",
      recommendedAction: "write the onboarding step into repo guidance",
      eventPath: recorded.event.relativePath,
    });
    expect(patched.note.relativePath).toContain("agent-wiki/notes/");

    const overridePatched = await patchKnowledge({
      repoPath: tempDir,
      task: "document a manual maintainer correction",
      workflow: "agent_adoption",
      summary: "maintainer wrote an explicit correction without a wrapper event",
      title: "Maintainer correction",
      signal: "manual maintenance path was used intentionally",
      interpretation: "the maintainer intentionally bypassed wrapper provenance",
      recommendedAction: "allow the correction because the maintainer explicitly overrode provenance checks",
      adminOverride: true,
    });
    expect(overridePatched.note.relativePath).toContain("agent-wiki/notes/");

    await expect(promoteGap({
      repoPath: tempDir,
      task: "promote a reusable onboarding correction",
      workflow: "agent_adoption",
      summary: "future agents need a committed onboarding step",
      observations: ["onboarding kept depending on hidden setup"],
      interpretation: "the setup correction is reusable across repos",
      recommendedAction: "write the onboarding step into repo guidance",
      outcome: "failure",
      eventKind: "wrapper:generic:failure",
    })).rejects.toThrow("requires durable-write provenance");

    const promoted = await promoteGap({
      repoPath: tempDir,
      task: "promote a reusable onboarding correction",
      workflow: "agent_adoption",
      summary: "future agents need a committed onboarding step",
      observations: ["onboarding kept depending on hidden setup"],
      interpretation: "the setup correction is reusable across repos",
      recommendedAction: "write the onboarding step into repo guidance",
      outcome: "failure",
      eventKind: "wrapper:generic:failure",
      eventPath: recorded.event.relativePath,
    });
    expect(promoted.event.relativePath).toContain("agent-wiki/events/");
  }, 20000);
});
