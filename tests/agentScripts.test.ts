import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
    configReadOrder: [
      "env:DATALOX_CONFIG_JSON",
      ".datalox/config.local.json",
      ".datalox/config.json",
      "AGENTS.md",
    ],
    interfaceOrder: [
      "local_skill",
      "working_knowledge",
      "proposal_writeback",
      "runtime_compile",
      "retrieval_search",
    ],
    docReadOrder: [
      "materialized_view",
      "raw_doc",
    ],
    citationRequired: true,
    escalateWhenNoMatch: true,
    fetchPolicy: "metadata_first",
  },
  paths: {
    localSkillsDir: ".datalox/skills",
    localDocsDir: ".datalox/docs",
    localViewsDir: ".datalox/views",
    workingSkillsDir: ".datalox/working/skills",
    workingPatternsDir: ".datalox/working/patterns",
  },
  runtime: {
    enabled: false,
    baseUrl: "http://localhost:3000",
    defaultWorkflow: "flow_cytometry",
    requestTimeoutMs: 10000,
    endpoints: {
      compile: "/v1/runtime/compile",
      search: "/v1/retrieval/search",
      fileMetadata: "/v1/files/:id",
      fileDownload: "/v1/files/:id/download",
    },
  },
  retrieval: {
    defaultLimit: 5,
    maxSnippets: 3,
    allowedDocRefKinds: ["path", "file_id", "url"],
  },
  materialization: {
    preferredViewType: "skill_doc_v1",
    traceStrategy: "source_anchors",
    viewFormatVersion: 1,
  },
  writeback: {
    enabled: true,
    proposalsDir: ".datalox/proposals",
    proposedSkillsDir: ".datalox/proposals/skills",
    proposedPatternsDir: ".datalox/proposals/patterns",
    capturesDir: ".datalox/captures",
    authorEnv: "DATALOX_AUTHOR",
  },
  auth: {
    apiKeyEnv: "DATALOX_API_KEY",
    contributorKeyEnv: "DATALOX_CONTRIBUTOR_KEY",
  },
};

async function createPack(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox/skills"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/docs"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/views"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/working/skills"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/working/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/proposals/skills"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/proposals/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox/captures"), { recursive: true });

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
          fastify: "^5.0.0",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(tempDir, ".datalox/skills/review-ambiguous-viability-gate.json"),
    JSON.stringify(
      {
        version: 1,
        id: "flow-cytometry.review-ambiguous-viability-gate",
        name: "review-ambiguous-viability-gate",
        displayName: "Review Ambiguous Viability Gate",
        workflow: "flow_cytometry",
        trigger: "Use when live/dead separation is ambiguous during viability gate review.",
        description: "Start from the viability gate review doc and inspect the exception case.",
        defaultDocRef: {
          kind: "path",
          value: ".datalox/docs/viability-gate-review.md",
          viewPath: ".datalox/views/viability-gate-review.skill-doc.json",
        },
        supportingDocRefs: [],
        tags: ["flow_cytometry", "viability", "review"],
        status: "approved",
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(tempDir, ".datalox/skills/evolve-portable-pack.json"),
    JSON.stringify(
      {
        version: 1,
        id: "repo-engineering.evolve-portable-pack",
        name: "evolve-portable-pack",
        displayName: "Evolve Portable Pack",
        workflow: "repo_engineering",
        trigger: "Use when changing the portable pack or agent guidance.",
        description: "Start from the portable-pack editing doc.",
        defaultDocRef: {
          kind: "path",
          value: ".datalox/docs/evolve-portable-pack.md",
          viewPath: ".datalox/views/evolve-portable-pack.skill-doc.json",
        },
        supportingDocRefs: [],
        repoHints: {
          files: ["AGENTS.md", "CLAUDE.md", "package.json"],
          pathPrefixes: [".datalox/", "docs/"],
          packageSignals: ["fastify", "demo-pack"],
        },
        tags: ["repo_engineering", "portable_pack"],
        status: "approved",
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(tempDir, ".datalox/docs/viability-gate-review.md"),
    "# Review ambiguous viability gate\n\n## Judgment patterns\n\nUse caution.\n",
  );
  await writeFile(
    path.join(tempDir, ".datalox/docs/evolve-portable-pack.md"),
    "# Evolve portable pack\n\n## Steps\n\nUse the local pack first.\n",
  );
  await writeFile(
    path.join(tempDir, ".datalox/views/viability-gate-review.skill-doc.json"),
    JSON.stringify(
      {
        version: 1,
        viewType: "skill_doc_v1",
        docId: "flow-cytometry.viability-gate-review",
        sourceDocPath: ".datalox/docs/viability-gate-review.md",
        workflow: "flow_cytometry",
        title: "Review ambiguous viability gate",
        sections: [
          {
            id: "judgment-patterns",
            title: "Judgment patterns",
            kind: "judgment",
            summary: "Distinguish artifact from real drift.",
            sourceAnchors: ["## Judgment patterns"],
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(tempDir, ".datalox/views/evolve-portable-pack.skill-doc.json"),
    JSON.stringify(
      {
        version: 1,
        viewType: "skill_doc_v1",
        docId: "repo-engineering.evolve-portable-pack",
        sourceDocPath: ".datalox/docs/evolve-portable-pack.md",
        workflow: "repo_engineering",
        title: "Evolve portable pack",
        sections: [
          {
            id: "steps",
            title: "Steps",
            kind: "procedure",
            summary: "Use the local pack first.",
            sourceAnchors: ["## Steps"],
          },
        ],
      },
      null,
      2,
    ),
  );
}

function runNodeScript(tempDir: string, scriptRelativePath: string, args: string[] = []) {
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
    expect(body.counts.approvedSkills).toBe(2);
    expect(body.counts.workingSkills).toBe(0);
  });

  it("resolves a local skill and its materialized view", async () => {
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
    expect(body.matches[0].defaultDoc.view.title).toBe("Review ambiguous viability gate");
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

  it("writes skill and pattern proposals to the repo", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const patternResult = runNodeScript(tempDir, "scripts/agent-propose-pattern.mjs", [
      "--workflow",
      "flow_cytometry",
      "--title",
      "dim dead tail overlap",
      "--signal",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely artifact",
      "--action",
      "review exception doc",
      "--json",
    ]);
    expect(patternResult.status).toBe(0);

    const skillResult = runNodeScript(tempDir, "scripts/agent-propose-skill.mjs", [
      "--id",
      "flow-cytometry.new-skill",
      "--name",
      "new-skill",
      "--workflow",
      "flow_cytometry",
      "--trigger",
      "Use for demo",
      "--description",
      "Demo skill proposal",
      "--default-doc",
      ".datalox/docs/viability-gate-review.md",
      "--json",
    ]);
    expect(skillResult.status).toBe(0);

    const patternFiles = await readdir(path.join(tempDir, ".datalox/proposals/patterns"));
    const skillFiles = await readdir(path.join(tempDir, ".datalox/proposals/skills"));
    expect(patternFiles.some((file) => file.endsWith(".json"))).toBe(true);
    expect(skillFiles.some((file) => file.endsWith(".json"))).toBe(true);

    const proposalContent = JSON.parse(
      await readFile(
        path.join(
          tempDir,
          ".datalox/proposals/patterns",
          patternFiles.find((file) => file.endsWith(".json"))!,
        ),
        "utf8",
      ),
    );
    expect(proposalContent.proposalType).toBe("pattern");
  });

  it("writes working knowledge and resolves it immediately", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnPatternResult = runNodeScript(tempDir, "scripts/agent-learn-pattern.mjs", [
      "--id",
      "dim-dead-tail-overlap",
      "--workflow",
      "flow_cytometry",
      "--title",
      "dim dead tail overlap",
      "--signal",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely artifact",
      "--action",
      "review exception doc",
      "--skill",
      "flow-cytometry.review-ambiguous-viability-gate",
      "--json",
    ]);
    expect(learnPatternResult.status).toBe(0);

    const learnSkillResult = runNodeScript(tempDir, "scripts/agent-learn-skill.mjs", [
      "--id",
      "flow-cytometry.review-ambiguous-viability-gate",
      "--name",
      "review-ambiguous-viability-gate",
      "--display-name",
      "Review Ambiguous Viability Gate",
      "--workflow",
      "flow_cytometry",
      "--trigger",
      "Use when live/dead separation is ambiguous during viability gate review.",
      "--description",
      "Overlay with a linked working pattern.",
      "--default-doc",
      ".datalox/docs/viability-gate-review.md",
      "--pattern",
      "dim-dead-tail-overlap",
      "--json",
    ]);
    expect(learnSkillResult.status).toBe(0);

    const resolveResult = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);

    const body = JSON.parse(resolveResult.stdout);
    expect(body.nativeSkillPolicy).toBe("preserve");
    expect(body.matches[0].skillLayer).toBe("working");
    expect(body.matches[0].linkedPatterns).toHaveLength(1);
    expect(body.matches[0].linkedPatterns[0].pattern.id).toBe("dim-dead-tail-overlap");
  });

  it("captures an interaction and materializes it into working knowledge", async () => {
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
      "--transcript",
      "The analyst paused because the dim dead tail overlapped the live shoulder and needed the exception path again.",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception doc before widening gate",
      "--json",
    ]);
    expect(learnResult.status).toBe(0);

    const body = JSON.parse(learnResult.stdout);
    expect(body.capture.payload.captureType).toBe("interaction");
    expect(body.materialized.pattern.payload.skillId).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(body.materialized.skill.payload.id).toBe("flow-cytometry.review-ambiguous-viability-gate");

    const captureFiles = await readdir(path.join(tempDir, ".datalox/captures"));
    expect(captureFiles.some((file) => file.endsWith(".json"))).toBe(true);

    const resolveResult = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);

    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skillLayer).toBe("working");
    expect(resolved.matches[0].linkedPatterns).toHaveLength(1);
    expect(resolved.matches[0].linkedPatterns[0].pattern.recommendedAction).toContain("review exception doc");
    expect(resolved.matches[0].defaultDoc.viewPath).toBe(".datalox/views/viability-gate-review.skill-doc.json");
  });
});
