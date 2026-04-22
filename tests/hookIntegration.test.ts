import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  async function initGitRepo(repoPath: string): Promise<void> {
    const result = spawnSync("git", ["init"], {
      cwd: repoPath,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  }

  it("patches a matched repo skill when the hook is explicitly told to record candidate events", async () => {
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
                text: "change portable pack loop bridge",
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
                text: [
                  "The wrapper contract should stay visible and committed for future agent runs.",
                  "DATALOX_TITLE: Wrapper contract should stay visible",
                  "DATALOX_SIGNAL: the same repo wrapper guidance kept disappearing from the committed path",
                  "DATALOX_INTERPRETATION: this is a reusable wrapper workflow gap rather than a one-off hook transcript",
                  "DATALOX_ACTION: patch the existing portable-pack skill so the committed wrapper path stays visible",
                  "DATALOX_DECISION: patch_existing_skill",
                  "DATALOX_SKILL: repo-engineering.evolve-datalox-pack",
                ].join("\n"),
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
      workflow: "repo_engineering",
      transcript_path: transcriptPath,
    });

    const runHook = () =>
      spawnSync("node", [path.join(hostDir, "bin", "datalox-auto-promote.js"), "--repo", hostDir, "--event-class", "candidate"], {
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
    expect(first.stderr).toContain("create_note_from_gap");

    const second = runHook();
    expect(second.status).toBe(0);
    expect(second.stderr).toContain("patch_skill_with_note");

    const third = runHook();
    expect(third.status).toBe(0);
    expect(third.stderr).toContain("patch_skill_with_note");

    const logFile = await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8");
    const patchedSkill = await readFile(
      path.join(hostDir, "skills", "evolve-datalox-pack", "SKILL.md"),
      "utf8",
    );

    expect(logFile).toContain("record_event");
    expect(logFile).toContain("create_note");
    expect(logFile).toContain("update_skill");
    expect(patchedSkill).toContain("agent-wiki/notes/");
  }, 60000);

  it("auto-bootstraps a clean git repo from the host hook path before promoting", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-hook-auto-"));
    tempDirs.push(hostDir);
    await initGitRepo(hostDir);

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
            content: [{ type: "text", text: "stabilize onboarding in non technical repos" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "A reusable onboarding workflow is missing." }],
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

    const first = spawnSync("node", [path.join(repoRoot, "bin", "datalox-auto-promote.js"), "--repo", hostDir], {
      cwd: hostDir,
      env: {
        ...process.env,
        DATALOX_PACK_ROOT: repoRoot,
      },
      input: payload,
      encoding: "utf8",
    });

    expect(first.status).toBe(0);
    expect(first.stderr).toContain("record_only");
    expect(await readFile(path.join(hostDir, ".datalox", "install.json"), "utf8")).toContain("\"installMode\": \"auto\"");
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("Datalox");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
  }, 60000);

  it("records hook events with resolved loop provenance instead of a transcript-only payload", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-hook-provenance-"));
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
            content: [{ type: "text", text: "change portable pack loop bridge" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "The wrapper contract should stay visible and committed." }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const payload = JSON.stringify({
      hook_event_name: "Stop",
      cwd: hostDir,
      workflow: "repo_engineering",
      transcript_path: transcriptPath,
    });

    const result = spawnSync("node", [path.join(hostDir, "bin", "datalox-auto-promote.js"), "--repo", hostDir], {
      cwd: hostDir,
      env: {
        ...process.env,
        DATALOX_PACK_ROOT: repoRoot,
      },
      input: payload,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const eventFiles = await readdir(path.join(hostDir, "agent-wiki", "events"));
    expect(eventFiles.length).toBe(1);
    const eventPayload = JSON.parse(
      await readFile(path.join(hostDir, "agent-wiki", "events", eventFiles[0]), "utf8"),
    );
    expect(eventPayload.eventClass).toBe("trace");
    expect(eventPayload.hostKind).toBe("hook");
    expect(eventPayload.workflow).toBe("repo_engineering");
    expect(eventPayload.matchedSkillId).toBe("repo-engineering.evolve-datalox-pack");
    expect(eventPayload.matchedNotePaths).toContain("agent-wiki/notes/evolve-datalox-pack.md");
  }, 60000);
});
