import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

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
    seedPatternsDir: "agent-wiki/patterns",
    hostSkillsDir: "skills",
    hostPatternsDir: "agent-wiki/patterns",
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
  await mkdir(path.join(tempDir, "skills/evolve-portable-pack"), { recursive: true });
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
    pattern_paths:
      - agent-wiki/patterns/viability-gate-review.md
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

## Pattern Docs

- agent-wiki/patterns/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "skills/evolve-portable-pack/SKILL.md"),
    `---
name: evolve-portable-pack
description: Keep the pack simple.
metadata:
  datalox:
    id: repo-engineering.evolve-portable-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack or agent guidance.
    pattern_paths:
      - agent-wiki/patterns/evolve-portable-pack.md
    tags:
      - repo_engineering
      - portable_pack
---

# Evolve Portable Pack

## When to Use

Use when changing the portable pack or agent guidance.

## Workflow

1. Read the linked pattern docs before acting.
2. Keep the pack simple.

## Expected Output

- State why this skill matched.
- State the pack change being made.

## Pattern Docs

- agent-wiki/patterns/evolve-portable-pack.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/patterns/viability-gate-review.md"),
    `---
type: pattern
title: Review ambiguous viability gate
workflow: flow_cytometry
status: active
related:
  - agent-wiki/patterns/dead-tail-exception.md
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

- agent-wiki/patterns/dead-tail-exception.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/patterns/evolve-portable-pack.md"),
    `---
type: pattern
title: Evolve portable pack
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Evolve portable pack

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
    path.join(tempDir, "agent-wiki/meta/evolve-portable-pack.md"),
    `---
type: pattern
title: Evolve portable pack meta
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Evolve portable pack meta

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
    path.join(tempDir, "agent-wiki/patterns/dead-tail-exception.md"),
    `---
type: pattern
title: Dead tail exception
workflow: flow_cytometry
status: active
related:
  - agent-wiki/patterns/viability-gate-review.md
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

- agent-wiki/patterns/viability-gate-review.md
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
  - agent-wiki/patterns/viability-gate-review.md
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
  - agent-wiki/patterns/evolve-portable-pack.md
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
  - agent-wiki/patterns/viability-gate-review.md
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

- agent-wiki/patterns/viability-gate-review.md
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
  - agent-wiki/patterns/evolve-portable-pack.md
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
  const resolved = (typeof result === "object" && result !== null && "toolResult" in result)
    ? (result as { toolResult: unknown }).toolResult
    : result;

  if (
    resolved
    && typeof resolved === "object"
    && "structuredContent" in resolved
    && (resolved as { structuredContent?: unknown }).structuredContent
    && typeof (resolved as { structuredContent?: unknown }).structuredContent === "object"
    && "result" in ((resolved as { structuredContent: Record<string, unknown> }).structuredContent)
  ) {
    return ((resolved as { structuredContent: { result: unknown } }).structuredContent).result;
  }

  const content = (resolved as { content?: Array<{ type: string; text?: string }> }).content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("No structured MCP result found");
  }
  return JSON.parse(text) as unknown;
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

    const patchResult = runBuiltCli(tempDir, [
      "patch",
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

    const lintResult = runBuiltCli(tempDir, ["lint", "--json"]);
    expect(lintResult.status).toBe(0);
    const linted = JSON.parse(lintResult.stdout);
    expect(linted.ok).toBe(true);
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("update_skill");
  });

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
  });

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
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("Datalox Pack Protocol");
    expect(await readFile(path.join(hostDir, "skills/evolve-portable-pack/SKILL.md"), "utf8")).toContain("## Workflow");
  });

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
        expect.arrayContaining(["resolve_loop", "patch_knowledge", "lint_pack", "adopt_pack"]),
      );

      const resolveResult = await client.callTool({
        name: "resolve_loop",
        arguments: {
          repo_path: tempDir,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
        },
      });
      const resolved = extractStructuredResult(resolveResult) as any;
      expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");

      const patchResult = await client.callTool({
        name: "patch_knowledge",
        arguments: {
          repo_path: tempDir,
          task: "review ambiguous live dead gate",
          workflow: "flow_cytometry",
          observations: ["dim dead tail overlaps live shoulder"],
          interpretation: "likely staining artifact",
          recommended_action: "review exception pattern before widening gate",
        },
      });
      const patched = extractStructuredResult(patchResult) as any;
      expect(patched.skill.operation).toBe("update_skill");

      const lintResult = await client.callTool({
        name: "lint_pack",
        arguments: {
          repo_path: tempDir,
        },
      });
      const linted = extractStructuredResult(lintResult) as any;
      expect(linted.ok).toBe(true);
      expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("lint_pack");
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
