import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();

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
  await mkdir(path.join(tempDir, "skills"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/meta"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/review-ambiguous-viability-gate"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/evolve-portable-pack"), { recursive: true });

  await writeFile(
    path.join(tempDir, ".datalox/config.json"),
    JSON.stringify(baseConfig, null, 2),
  );
  await writeFile(path.join(tempDir, "AGENTS.md"), "# Demo agent instructions\n");
  await writeFile(path.join(tempDir, "CLAUDE.md"), "# Demo claude instructions\n");
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "demo-pack",
        dependencies: {
          vitest: "^2.0.0",
        },
      },
      null,
      2,
    ),
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
    repo_hints:
      files:
        - AGENTS.md
        - CLAUDE.md
        - package.json
      path_prefixes:
        - skills/
        - .datalox/
      package_signals:
        - vitest
        - demo-pack
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
    "# Review ambiguous viability gate\n\n## When to Use\n\nUse this pattern when viability review is ambiguous and the live/dead split is not clearly separable.\n\n## Signal\n\nLive and dead populations are not cleanly separated.\n\n## Interpretation\n\nThis is a judgment step, not a mechanical threshold change.\n\n## Recommended Action\n\nReview the linked exception pattern before changing the gate.\n\n## Examples\n\n- A boundary that looks unstable and needs exception review before widening the gate.\n",
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/patterns/evolve-portable-pack.md"),
    "# Evolve portable pack\n\n## When to Use\n\nUse this pattern when the pack design adds complexity faster than user-visible benefit.\n\n## Signal\n\nThe pack is getting too complicated.\n\n## Interpretation\n\nThe right response is usually to simplify the loop, not add another layer.\n\n## Recommended Action\n\nKeep the loop as skill detection plus pattern docs.\n\n## Examples\n\n- Replacing hidden pack layers with visible wiki artifacts that an agent can inspect directly.\n",
  );
}

async function createHostRepo(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "host-repo",
        dependencies: {
          vitest: "^2.0.0",
        },
      },
      null,
      2,
    ),
  );
}

function runNodeScript(
  tempDir: string,
  scriptRelativePath: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
) {
  return spawnSync("node", [path.join(repoRoot, scriptRelativePath), ...args], {
    cwd: tempDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATALOX_CONFIG_JSON: "",
      DATALOX_BASE_URL: "",
      DATALOX_DEFAULT_WORKFLOW: "",
      DATALOX_AGENT_PROFILE: "",
      DATALOX_MODE: "",
      ...envOverrides,
    },
  });
}

describe("agent scripts", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("bootstraps a repo_only pack", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-bootstrap.mjs", ["--json"]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.mode).toBe("repo_only");
    expect(body.runtimeEnabled).toBe(false);
    expect(body.detectOnEveryLoop).toBe(true);
    expect(body.counts.skills).toBe(2);
    expect(body.counts.patterns).toBe(2);
    expect(body.counts.hostSkills).toBe(2);
    expect(body.counts.seedSkills).toBe(0);
  });

  it("resolves a local skill and its pattern docs", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(body.matches[0].patternDocs[0].path).toBe("agent-wiki/patterns/viability-gate-review.md");
    expect(body.matches[0].loopGuidance.whyMatched).toContain("workflow match: flow_cytometry");
    expect(body.matches[0].loopGuidance.whatToDoNow[0]).toContain("Review the linked exception pattern");
    expect(body.matches[0].loopGuidance.watchFor[0]).toContain("Live and dead populations");
  });

  it("auto-selects a local skill from repo context without an explicit task", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-resolve.mjs", ["--json"]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.selectionBasis).toBe("repo_context");
    expect(body.matches[0].skill.id).toBe("repo-engineering.evolve-portable-pack");
    expect(body.workflow).toBe("repo_engineering");
  });

  it("writes a generated skill into skills and points it at pattern docs", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnPatternResult = runNodeScript(tempDir, "scripts/agent-learn-pattern.mjs", [
      "--workflow",
      "flow_cytometry",
      "--title",
      "dim dead tail overlap",
      "--signal",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely artifact",
      "--action",
      "review exception pattern before widening gate",
      "--skill",
      "flow-cytometry.review-ambiguous-viability-gate",
      "--json",
    ]);
    expect(learnPatternResult.status).toBe(0);

    const patternBody = JSON.parse(learnPatternResult.stdout);
    const skillFile = await readFile(
      path.join(tempDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
      "utf8",
    );
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");

    expect(patternBody.pattern.relativePath).toContain("agent-wiki/patterns/");
    expect(skillFile).toContain(patternBody.pattern.relativePath);
    expect(skillFile).toContain("## Workflow");
    expect(indexFile).toContain("## Skills");
    expect(indexFile).toContain(patternBody.pattern.relativePath);
    expect(logFile).toContain("patch_pattern");
    expect(logFile).toContain("update_skill");
  });

  it("learns from interaction by writing a pattern doc and updating a skill in skills", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnResult = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--summary",
      "Repeated dim-dead-tail overlap during viability review",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);
    expect(learnResult.status).toBe(0);

    const body = JSON.parse(learnResult.stdout);
    expect(body.pattern.relativePath).toContain("agent-wiki/patterns/");
    expect(body.skill.payload.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(body.skill.operation).toBe("update_skill");
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");
    expect(indexFile).toContain(body.pattern.relativePath);
    expect(logFile).toContain("update_skill");

    const resolveResult = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);

    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(resolved.matches[0].patternDocs.length).toBeGreaterThan(1);
    expect(resolved.matches[0].loopGuidance.whatToDoNow.some((value: string) => value.includes("review exception pattern"))).toBe(true);
  });

  it("runs the minimal detect use patch lint loop", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const detectAndUse = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(detectAndUse.status).toBe(0);

    const before = JSON.parse(detectAndUse.stdout);
    expect(before.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(before.matches[0].loopGuidance.whatToDoNow.length).toBeGreaterThan(0);

    const patch = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
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
    expect(patch.status).toBe(0);

    const patched = JSON.parse(patch.stdout);
    expect(patched.pattern.relativePath).toContain("agent-wiki/patterns/");
    expect(patched.skill.payload.patternPaths).toContain(patched.pattern.relativePath);
    expect(patched.skill.operation).toBe("update_skill");

    const lint = runNodeScript(tempDir, "scripts/agent-lint.mjs", ["--json"]);
    expect(lint.status).toBe(0);

    const lintBody = JSON.parse(lint.stdout);
    expect(lintBody.ok).toBe(true);
    expect(lintBody.issueCount).toBe(0);
    expect(await readFile(path.join(tempDir, "agent-wiki/lint.md"), "utf8")).toContain("Issue Count: 0");
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("lint_pack");
  });

  it("lints the minimal skill-pattern graph", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    await mkdir(path.join(tempDir, "skills/broken-skill"), { recursive: true });
    await writeFile(
      path.join(tempDir, "skills/broken-skill/SKILL.md"),
      `---
name: broken-skill
description: Broken test skill.
metadata:
  datalox:
    id: flow-cytometry.broken-skill
    workflow: flow_cytometry
    trigger: Use when the pack is broken.
    pattern_paths:
      - agent-wiki/patterns/missing-pattern.md
      - agent-wiki/patterns/bad-pattern.md
    status: generated
    tags:
      - flow_cytometry
---

# Broken Skill

## When to Use

Use when the pack is broken.
`,
    );

    await writeFile(
      path.join(tempDir, "agent-wiki/patterns/bad-pattern.md"),
      "# Bad pattern\n\n## Signal\n\nOnly signal exists.\n",
    );
    await writeFile(
      path.join(tempDir, "agent-wiki/patterns/orphan-pattern.md"),
      "# Orphan pattern\n\n## Signal\n\nUnused pattern.\n\n## Interpretation\n\nNo skill uses it.\n\n## Recommended Action\n\nAttach it or delete it.\n",
    );

    const lintResult = runNodeScript(tempDir, "scripts/agent-lint.mjs", ["--json"]);
    expect(lintResult.status).toBe(1);

    const body = JSON.parse(lintResult.stdout);
    expect(body.ok).toBe(false);
    expect(body.issues.some((issue: { code: string }) => issue.code === "missing_pattern_doc")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "pattern_missing_interpretation")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "pattern_missing_action")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "orphan_pattern_doc")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "skill_missing_workflow_section")).toBe(true);
    expect(await readFile(path.join(tempDir, "agent-wiki/lint.md"), "utf8")).toContain("missing_pattern_doc");
  });

  it("reads seed knowledge from an external pack and writes generated knowledge into the host repo", async () => {
    const packDir = await mkdtemp(path.join(tmpdir(), "datalox-seed-pack-"));
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-repo-"));
    tempDirs.push(packDir, hostDir);
    await createPack(packDir);
    await createHostRepo(hostDir);

    const configPath = path.join(packDir, ".datalox/config.json");

    const resolveResult = runNodeScript(
      hostDir,
      "scripts/agent-resolve.mjs",
      [
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--json",
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(resolveResult.status).toBe(0);

    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(resolved.matches[0].skillOrigin).toBe("seed");

    const patchResult = runNodeScript(
      hostDir,
      "scripts/agent-learn-from-interaction.mjs",
      [
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
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(patchResult.status).toBe(0);

    const patched = JSON.parse(patchResult.stdout);
    const hostSkillPath = path.join(hostDir, "skills/review-ambiguous-viability-gate/SKILL.md");
    const hostPatternPath = path.join(hostDir, patched.pattern.relativePath);
    const seedSkill = await readFile(
      path.join(packDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
      "utf8",
    );
    const hostSkill = await readFile(hostSkillPath, "utf8");
    const hostIndex = await readFile(path.join(hostDir, "agent-wiki/index.md"), "utf8");
    const hostLog = await readFile(path.join(hostDir, "agent-wiki/log.md"), "utf8");

    expect(hostSkill).toContain(patched.pattern.relativePath);
    expect(hostSkill).toContain("## Workflow");
    expect(seedSkill).not.toContain(patched.pattern.relativePath);
    expect(await readFile(hostPatternPath, "utf8")).toContain("review exception pattern before widening gate");
    expect(hostIndex).toContain(patched.pattern.relativePath);
    expect(hostLog).toContain("update_skill");

    const resolveAgain = runNodeScript(
      hostDir,
      "scripts/agent-resolve.mjs",
      [
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--json",
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(resolveAgain.status).toBe(0);

    const resolvedAgain = JSON.parse(resolveAgain.stdout);
    expect(resolvedAgain.matches[0].skillOrigin).toBe("host");
    expect(resolvedAgain.matches[0].patternDocs.length).toBe(2);
  });

  it("creates a new skill when no existing skill matches the interaction", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnResult = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
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
    expect(learnResult.status).toBe(0);

    const body = JSON.parse(learnResult.stdout);
    const generatedSkillPath = body.skill.filePath;
    const generatedSkill = await readFile(generatedSkillPath, "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");

    expect(body.skill.operation).toBe("create_skill");
    expect(body.skill.payload.id).toBe("agent_adoption.stabilize-manual-pack-adoption-in-non-technical-repos");
    expect(generatedSkill).toContain("## Workflow");
    expect(generatedSkill).toContain("agent-wiki/patterns/");
    expect(logFile).toContain("create_skill");
    expect(indexFile).toContain("agent_adoption.stabilize-manual-pack-adoption-in-non-technical-repos");
  });
});
