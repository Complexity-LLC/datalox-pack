import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("automatic host hooks", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("promotes repeated Claude stop-hook events into wiki pages and then a new skill", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-hook-host-"));
    tempDirs.push(hostDir);

    const adopt = spawnSync("bash", [path.join(repoRoot, "bin/adopt-host-repo.sh"), hostDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(adopt.status).toBe(0);

    const transcriptDir = path.join(hostDir, ".claude", "projects", "demo");
    await mkdir(transcriptDir, { recursive: true });
    const transcriptPath = path.join(transcriptDir, "session.jsonl");
    await writeFile(
      transcriptPath,
      [
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "stabilize manual pack adoption in non technical repos",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Users need a visible onboarding flow and trust controls so the agent can be corrected safely.",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const payload = JSON.stringify({
      hook_event_name: "Stop",
      cwd: hostDir,
      workflow: "agent_adoption",
      transcript_path: transcriptPath,
    });

    const runHook = () =>
      spawnSync("node", [path.join(hostDir, "bin", "datalox-auto-promote.js"), "--repo", hostDir], {
        cwd: hostDir,
        env: {
          ...process.env,
          DATALOX_PACK_ROOT: repoRoot,
        },
        input: payload,
        encoding: "utf8",
      });

    const first = runHook();
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("record_only");

    const second = runHook();
    expect(second.status).toBe(0);
    expect(second.stderr).toContain("create_wiki_pattern");

    const third = runHook();
    expect(third.status).toBe(0);
    expect(third.stderr).toContain("create_skill_from_gap");

    const logFile = await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8");
    const indexFile = await readFile(path.join(hostDir, "agent-wiki", "index.md"), "utf8");
    const generatedSkill = await readFile(
      path.join(hostDir, "skills", "stabilize-manual-pack-adoption-in-non-technical-repos", "SKILL.md"),
      "utf8",
    );

    expect(logFile).toContain("record_event");
    expect(logFile).toContain("create_skill");
    expect(indexFile).toContain("agent_adoption.stabilize-manual-pack-adoption-in-non-technical-repos");
    expect(generatedSkill).toContain("## Workflow");
  }, 20000);
});
