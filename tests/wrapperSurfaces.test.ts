import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const builtCliPath = path.join(repoRoot, "dist", "src", "cli", "main.js");

describe("wrapper surfaces", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function adoptHostRepo(): Promise<string> {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-wrapper-host-"));
    tempDirs.push(hostDir);
    const adopt = spawnSync("bash", [path.join(repoRoot, "bin", "adopt-host-repo.sh"), hostDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(adopt.status).toBe(0);
    return hostDir;
  }

  it("builds a wrapped prompt for fallback CLI hosts", async () => {
    const hostDir = await adoptHostRepo();
    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "wrap",
        "prompt",
        "--repo",
        hostDir,
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--prompt",
        "Review the current viability gate and tell me what to do.",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# Datalox Loop Guidance");
    expect(result.stdout).toContain("Matched skill: flow-cytometry.review-ambiguous-viability-gate");
    expect(result.stdout).toContain("# Original Prompt");
    expect(result.stdout).toContain("Review the current viability gate and tell me what to do.");
  });

  it("runs a generic wrapped command with placeholders and env injection", async () => {
    const hostDir = await adoptHostRepo();
    const script = "process.stdout.write(JSON.stringify({prompt: process.argv[1], skill: process.env.DATALOX_MATCHED_SKILL, workflow: process.env.DATALOX_WORKFLOW}))";
    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "wrap",
        "command",
        "--repo",
        hostDir,
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--prompt",
        "Need a gate recommendation",
        "--",
        "node",
        "-e",
        script,
        "__DATALOX_PROMPT__",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.skill).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(parsed.workflow).toBe("flow_cytometry");
    expect(parsed.prompt).toContain("# Datalox Loop Guidance");
    expect(parsed.prompt).toContain("Need a gate recommendation");
    expect(result.stderr).toContain("[datalox-wrap] record");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
    expect((await readdir(path.join(hostDir, "agent-wiki", "events"))).length).toBe(1);
  });

  it("runs the Codex wrapper with a fake codex binary and preserves the resolved prompt envelope", async () => {
    const hostDir = await adoptHostRepo();
    const script = "process.stdout.write(JSON.stringify({args: process.argv.slice(1), skill: process.env.DATALOX_MATCHED_SKILL, workflow: process.env.DATALOX_WORKFLOW}))";
    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "codex",
        "--repo",
        hostDir,
        "--task",
        "change portable pack loop bridge",
        "--workflow",
        "repo_engineering",
        "--prompt",
        "Update the pack docs to mention wrappers.",
        "--codex-bin",
        "node",
        "--",
        "-e",
        script,
        "__DATALOX_PROMPT__",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.skill).toBe("repo-engineering.evolve-portable-pack");
    expect(parsed.workflow).toBe("repo_engineering");
    expect(parsed.args[0]).toContain("# Datalox Loop Guidance");
    expect(parsed.args[0]).toContain("Update the pack docs to mention wrappers.");
    expect(result.stderr).toContain("[datalox-codex] record");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
  });

  it("owns the full loop for repeated no-match failures and creates a new skill", async () => {
    const hostDir = await adoptHostRepo();
    const failingScript = "process.stderr.write('fatal onboarding gap\\n'); process.exit(1)";

    const runFailure = () =>
      spawnSync(
        "node",
        [
          builtCliPath,
          "wrap",
          "command",
          "--repo",
          hostDir,
          "--task",
          "stabilize onboarding in non technical repos",
          "--workflow",
          "agent_adoption",
          "--prompt",
          "Stabilize onboarding in non technical repos",
          "--",
          "node",
          "-e",
          failingScript,
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );

    const first = runFailure();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("record_only");

    const second = runFailure();
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("create_wiki_pattern");

    const third = runFailure();
    expect(third.status).toBe(1);
    expect(third.stderr).toContain("create_skill_from_gap");

    const logFile = await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8");
    const indexFile = await readFile(path.join(hostDir, "agent-wiki", "index.md"), "utf8");
    const generatedSkill = await readFile(
      path.join(hostDir, "skills", "stabilize-onboarding-in-non-technical-repos", "SKILL.md"),
      "utf8",
    );

    expect(logFile).toContain("record_event");
    expect(logFile).toContain("create_skill");
    expect(indexFile).toContain("agent_adoption.stabilize-onboarding-in-non-technical-repos");
    expect(generatedSkill).toContain("## Workflow");
  }, 20000);

  it("copies wrapper entrypoints and skills into adopted host repos", async () => {
    const hostDir = await adoptHostRepo();

    expect(await readFile(path.join(hostDir, "bin", "datalox-codex.js"), "utf8")).toContain("\"codex\"");
    expect(await readFile(path.join(hostDir, "bin", "datalox-wrap.js"), "utf8")).toContain("\"wrap\"");
    expect(await readFile(path.join(hostDir, "skills", "host-cli-wrapper", "SKILL.md"), "utf8")).toContain("Host CLI Wrapper");
  });
});
