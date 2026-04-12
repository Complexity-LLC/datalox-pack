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
    seedPatternsDir: ".datalox/patterns",
    hostSkillsDir: "skills",
    hostPatternsDir: ".datalox/patterns",
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
  await mkdir(path.join(tempDir, "skills/review-ambiguous-viability-gate"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/evolve-portable-pack"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/meta"), { recursive: true });

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
      - .datalox/patterns/viability-gate-review.md
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

- .datalox/patterns/viability-gate-review.md
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
      - .datalox/patterns/evolve-portable-pack.md
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

- .datalox/patterns/evolve-portable-pack.md
`,
  );
  await writeFile(
    path.join(tempDir, ".datalox/patterns/viability-gate-review.md"),
    "# Review ambiguous viability gate\n\n## Signal\n\nLive and dead populations are not cleanly separated.\n\n## Interpretation\n\nThis is a judgment step, not a mechanical threshold change.\n\n## Recommended Action\n\nReview the linked exception pattern before changing the gate.\n",
  );
  await writeFile(
    path.join(tempDir, ".datalox/patterns/evolve-portable-pack.md"),
    "# Evolve portable pack\n\n## Signal\n\nThe pack is getting too complicated.\n\n## Interpretation\n\nThe right response is usually to simplify the loop, not add another layer.\n\n## Recommended Action\n\nKeep the loop as skill detection plus pattern docs.\n",
  );
  await writeFile(
    path.join(tempDir, ".datalox/meta/evolve-portable-pack.md"),
    "# Evolve portable pack meta\n\n## Signal\n\nThe pack keeps growing new layers.\n\n## Interpretation\n\nPortable pack work should prefer simpler behavior surfaces.\n\n## Recommended Action\n\nKeep Datalox additive to native skills and avoid extra indirection.\n",
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
    expect(await readFile(path.join(tempDir, ".datalox/log.md"), "utf8")).toContain("update_skill");
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
      expect(await readFile(path.join(tempDir, ".datalox/log.md"), "utf8")).toContain("lint_pack");
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
