import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadAgentConfig } from "../src/agent/loadAgentConfig.js";

const envKeys = [
  "DATALOX_CONFIG_JSON",
  "DATALOX_BASE_URL",
  "DATALOX_DEFAULT_WORKFLOW",
  "DATALOX_AGENT_PROFILE",
  "DATALOX_MODE",
] as const;

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = snapshot[key];
  }
}

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

describe("loadAgentConfig", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("loads repo config and merges config.local.json", async () => {
    const envSnapshot = snapshotEnv();
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-agent-config-"));
    tempDirs.push(tempDir);
    await mkdir(path.join(tempDir, ".datalox"));
    await writeFile(
      path.join(tempDir, ".datalox/config.json"),
      JSON.stringify(baseConfig, null, 2),
    );
    await writeFile(
      path.join(tempDir, ".datalox/config.local.json"),
      JSON.stringify(
        {
          runtime: {
            baseUrl: "https://api.example.datalox.com",
          },
        },
        null,
        2,
      ),
    );

    try {
      const loaded = await loadAgentConfig(tempDir);
      expect(loaded.config.runtime.baseUrl).toBe("https://api.example.datalox.com");
      expect(loaded.config.mode).toBe("repo_only");
      expect(loaded.config.agent.nativeSkillPolicy).toBe("preserve");
      expect(loaded.localOverridePath).toContain(".datalox/config.local.json");
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  it("uses DATALOX_CONFIG_JSON when set", async () => {
    const envSnapshot = snapshotEnv();
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-agent-config-"));
    tempDirs.push(tempDir);
    await mkdir(path.join(tempDir, ".datalox"));
    await writeFile(
      path.join(tempDir, "alt-config.json"),
      JSON.stringify(
        {
          ...baseConfig,
          project: {
            id: "alt",
            name: "Alt",
          },
        },
        null,
        2,
      ),
    );
    process.env.DATALOX_CONFIG_JSON = "./alt-config.json";

    try {
      const loaded = await loadAgentConfig(tempDir);
      expect(loaded.config.project.id).toBe("alt");
      expect(loaded.appliedEnvOverrides).toContain("DATALOX_CONFIG_JSON");
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  it("applies runtime env overrides after loading", async () => {
    const envSnapshot = snapshotEnv();
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-agent-config-"));
    tempDirs.push(tempDir);
    await mkdir(path.join(tempDir, ".datalox"));
    await writeFile(
      path.join(tempDir, ".datalox/config.json"),
      JSON.stringify(baseConfig, null, 2),
    );

    process.env.DATALOX_BASE_URL = "https://runtime.override";
    process.env.DATALOX_DEFAULT_WORKFLOW = "rna_seq";
    process.env.DATALOX_AGENT_PROFILE = "runtime_first";
    process.env.DATALOX_MODE = "service_backed";

    try {
      const loaded = await loadAgentConfig(tempDir);
      expect(loaded.config.runtime.baseUrl).toBe("https://runtime.override");
      expect(loaded.config.runtime.defaultWorkflow).toBe("rna_seq");
      expect(loaded.config.agent.profile).toBe("runtime_first");
      expect(loaded.config.mode).toBe("service_backed");
    } finally {
      restoreEnv(envSnapshot);
    }
  });
});
