import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  async function initGitRepo(repoPath: string): Promise<void> {
    const result = spawnSync("git", ["init"], {
      cwd: repoPath,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
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
    expect(result.stdout).toContain("Signal: Live and dead populations are not cleanly separated during viability gate review.");
    expect(result.stdout).toContain("Action: Check the exception and escalation pattern docs before widening the gate");
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
    expect(result.stderr).toContain("[datalox-wrap] record_only");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
    const eventFiles = await readdir(path.join(hostDir, "agent-wiki", "events"));
    expect(eventFiles.length).toBe(1);
    const eventPayload = JSON.parse(
      await readFile(path.join(hostDir, "agent-wiki", "events", eventFiles[0]), "utf8"),
    );
    expect(eventPayload.hostKind).toBe("generic");
    expect(eventPayload.matchedSkillId).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(eventPayload.matchedNotePaths).toContain("agent-wiki/notes/viability-gate-review.md");
    const noteFile = await readFile(path.join(hostDir, "agent-wiki", "notes", "viability-gate-review.md"), "utf8");
    expect(noteFile).toContain("read_count: 1");
    expect(noteFile).toContain("apply_count: 1");
  }, 20000);

  it("records a raw wrapper event even when post-run compilation is turned off and no markers are emitted", async () => {
    const hostDir = await adoptHostRepo();
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
        "--post-run-mode",
        "off",
        "--",
        "node",
        "-e",
        "process.stdout.write('plain wrapped answer')",
        "__DATALOX_PROMPT__",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("plain wrapped answer");
    expect(result.stderr).toContain("[datalox-wrap] record | record_only");
    const eventFiles = await readdir(path.join(hostDir, "agent-wiki", "events"));
    expect(eventFiles.length).toBe(1);
    const eventPayload = JSON.parse(
      await readFile(path.join(hostDir, "agent-wiki", "events", eventFiles[0]), "utf8"),
    );
    expect(eventPayload.summary).toBe("plain wrapped answer");
    expect(eventPayload.eventKind).toBe("wrapper:generic:success");
    expect(eventPayload.hostKind).toBe("generic");
  }, 10000);

  it("treats DATALOX markers as optional enrichment on top of the recorded event", async () => {
    const hostDir = await adoptHostRepo();
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
        "--post-run-mode",
        "record",
        "--",
        "node",
        "-e",
        [
          "const lines = [",
          "\"DATALOX_TITLE: Ambiguous viability gate follow-up\",",
          "\"DATALOX_SIGNAL: user kept rechecking the same unstable boundary\",",
          "\"DATALOX_INTERPRETATION: this is a reusable review judgment rather than a one-off answer\",",
          "\"DATALOX_ACTION: revisit the linked note before widening the gate\",",
          "\"DATALOX_OBSERVATION: gate drift was visible on the live/dead shoulder\",",
          "\"Visible wrapped answer\"",
          "];",
          "process.stdout.write(lines.join('\\n'));",
        ].join(" "),
        "__DATALOX_PROMPT__",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("Visible wrapped answer");
    const eventFiles = await readdir(path.join(hostDir, "agent-wiki", "events"));
    expect(eventFiles.length).toBe(1);
    const eventPayload = JSON.parse(
      await readFile(path.join(hostDir, "agent-wiki", "events", eventFiles[0]), "utf8"),
    );
    expect(eventPayload.title).toBe("Ambiguous viability gate follow-up");
    expect(eventPayload.signal).toBe("user kept rechecking the same unstable boundary");
    expect(eventPayload.interpretation).toBe(
      "this is a reusable review judgment rather than a one-off answer",
    );
    expect(eventPayload.recommendedAction).toBe("revisit the linked note before widening the gate");
    expect(eventPayload.observations).toContain("gate drift was visible on the live/dead shoulder");
    expect(eventPayload.summary).toBe("Visible wrapped answer");
  }, 10000);

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
  }, 10000);

  it("runs the Claude wrapper with a fake claude binary and preserves the resolved prompt envelope", async () => {
    const hostDir = await adoptHostRepo();
    const fakeClaudePath = path.join(hostDir, "fake-claude.sh");
    await writeFile(
      fakeClaudePath,
      "#!/usr/bin/env bash\nnode -e 'process.stdout.write(JSON.stringify({args: process.argv.slice(1), skill: process.env.DATALOX_MATCHED_SKILL, workflow: process.env.DATALOX_WORKFLOW}))' -- \"$@\"\n",
      "utf8",
    );
    await chmod(fakeClaudePath, 0o755);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "claude",
        "--repo",
        hostDir,
        "--task",
        "change portable pack loop bridge",
        "--workflow",
        "repo_engineering",
        "--claude-bin",
        fakeClaudePath,
        "--",
        "--print",
        "Update the pack docs to mention Claude shims.",
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
    expect(parsed.args[0]).toBe("--print");
    expect(parsed.args[1]).toContain("# Datalox Loop Guidance");
    expect(parsed.args[1]).toContain("Update the pack docs to mention Claude shims.");
    expect(result.stderr).toContain("[datalox-claude] record");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("record_event");
  }, 10000);

  it("infers the prompt from raw codex exec args when no explicit Datalox prompt is given", async () => {
    const hostDir = await adoptHostRepo();
    const fakeCodexPath = path.join(hostDir, "fake-codex.sh");
    await writeFile(
      fakeCodexPath,
      "#!/usr/bin/env bash\nnode -e 'process.stdout.write(JSON.stringify({args: process.argv.slice(1), skill: process.env.DATALOX_MATCHED_SKILL}))' \"$@\"\n",
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "codex",
        "--repo",
        hostDir,
        "--codex-bin",
        fakeCodexPath,
        "--",
        "exec",
        "--skip-git-repo-check",
        "Update the pack docs to mention wrappers.",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.skill).toBe("repo-engineering.evolve-portable-pack");
    expect(parsed.args[0]).toBe("exec");
    expect(parsed.args[2]).toContain("# Datalox Loop Guidance");
    expect(parsed.args[2]).toContain("Update the pack docs to mention wrappers.");
  }, 10000);

  it("sanitizes Codex output files when the child uses -o", async () => {
    const hostDir = await adoptHostRepo();
    const fakeCodexPath = path.join(hostDir, "fake-codex-output.sh");
    await writeFile(
      fakeCodexPath,
      `#!/usr/bin/env bash
node - <<'EOF' "$@"
const fs = require("node:fs");
const args = process.argv.slice(2);
let outputPath;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-o" || arg === "--output-last-message") {
    outputPath = args[index + 1];
    break;
  }
  if (arg.startsWith("--output-last-message=")) {
    outputPath = arg.slice("--output-last-message=".length);
    break;
  }
}
const payload = [
  "DATALOX_TITLE: Wrapper output sanitation",
  "DATALOX_SIGNAL: marker lines leaked into the codex output file",
  "DATALOX_INTERPRETATION: the wrapper should scrub Datalox markers from user-facing output artifacts",
  "DATALOX_ACTION: strip the marker lines before leaving the output file on disk",
  "Visible answer only",
].join("\\n");
if (outputPath) {
  fs.writeFileSync(outputPath, payload, "utf8");
}
process.stdout.write(payload);
EOF
`,
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);

    const outputFile = path.join(hostDir, "codex-last-message.txt");
    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "codex",
        "--repo",
        hostDir,
        "--codex-bin",
        fakeCodexPath,
        "--",
        "exec",
        "-o",
        outputFile,
        "Inspect the onboarding path.",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("Visible answer only");
    expect(await readFile(outputFile, "utf8")).toBe("Visible answer only");
  }, 10000);

  it("auto-bootstraps a clean git repo on first wrapped Codex run", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-wrapper-auto-"));
    tempDirs.push(hostDir);
    await initGitRepo(hostDir);
    const fakeCodexPath = path.join(hostDir, "fake-codex-bootstrap.sh");
    await writeFile(
      fakeCodexPath,
      "#!/usr/bin/env bash\nnode -e 'process.stdout.write(JSON.stringify({args: process.argv.slice(1), skill: process.env.DATALOX_MATCHED_SKILL, repo: process.env.DATALOX_REPO_PATH}))' \"$@\"\n",
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "codex",
        "--repo",
        hostDir,
        "--codex-bin",
        fakeCodexPath,
        "--",
        "exec",
        "Explain the repo onboarding path.",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.repo).toBe(hostDir);
    expect(parsed.args[1]).toContain("# Datalox Loop Guidance");
    expect(await readFile(path.join(hostDir, ".datalox", "install.json"), "utf8")).toContain("\"installMode\": \"auto\"");
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("Datalox");
  }, 60000);

  it("refuses auto-bootstrap when partial Datalox-owned paths already exist", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-wrapper-blocked-"));
    tempDirs.push(hostDir);
    await initGitRepo(hostDir);
    await mkdir(path.join(hostDir, "agent-wiki"), { recursive: true });
    await writeFile(path.join(hostDir, "agent-wiki", "hot.md"), "# partial\n", "utf8");

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "wrap",
        "prompt",
        "--repo",
        hostDir,
        "--prompt",
        "Just answer normally.",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("Just answer normally.");
    expect(spawnSync("test", ["-f", path.join(hostDir, ".datalox", "install.json")]).status).not.toBe(0);
    expect(spawnSync("test", ["-f", path.join(hostDir, "DATALOX.md")]).status).not.toBe(0);
  }, 10000);

  it("patches a matched wrapper skill when the same wrapped failure repeats", async () => {
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
          "debug repeated wrapper failure in unsupported host cli path",
          "--workflow",
          "repo_engineering",
          "--skill",
          "repo-engineering.host-cli-wrapper",
          "--prompt",
          "Debug repeated wrapper failure in unsupported host cli path",
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
    expect(second.stderr).toContain("patch_skill_with_note");

    const third = runFailure();
    expect(third.status).toBe(1);
    expect(third.stderr).toContain("patch_skill_with_note");

    const logFile = await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8");
    const patchedSkill = await readFile(
      path.join(hostDir, "skills", "host-cli-wrapper", "SKILL.md"),
      "utf8",
    );

    expect(logFile).toContain("record_event");
    expect(logFile).toContain("create_note");
    expect(logFile).toContain("update_skill");
    expect(patchedSkill).toContain("agent-wiki/notes/");
  }, 60000);

  it("copies wrapper entrypoints and skills into adopted host repos", async () => {
    const hostDir = await adoptHostRepo();

    expect(await readFile(path.join(hostDir, "bin", "datalox-claude.js"), "utf8")).toContain("\"claude\"");
    expect(await readFile(path.join(hostDir, "bin", "datalox-codex.js"), "utf8")).toContain("\"codex\"");
    expect(await readFile(path.join(hostDir, "bin", "datalox-wrap.js"), "utf8")).toContain("\"wrap\"");
    expect(await readFile(path.join(hostDir, "skills", "host-cli-wrapper", "SKILL.md"), "utf8")).toContain("Host CLI Wrapper");
  }, 10000);
});
