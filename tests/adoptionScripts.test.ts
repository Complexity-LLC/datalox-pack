import { chmod, cp, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function copyPackSnapshot(sourceRoot: string, destinationRoot: string): Promise<void> {
  const entries = await readdir(sourceRoot);
  for (const entry of entries) {
    if (entry === ".git" || entry === "node_modules" || entry === "dist") {
      continue;
    }
    await cp(path.join(sourceRoot, entry), path.join(destinationRoot, entry), {
      recursive: true,
      filter: (sourcePath) => {
        const relativePath = path.relative(sourceRoot, sourcePath);
        const segments = relativePath.split(path.sep);
        return !segments.includes(".git") && !segments.includes("node_modules") && !segments.includes("dist");
      },
    });
  }
}

describe("adoption scripts", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("adopts the pack into a host repo with one command", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-adopt-"));
    tempDirs.push(hostDir);

    const result = spawnSync("bash", [path.join(repoRoot, "bin/adopt-host-repo.sh"), hostDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("source kinds: `trace`, `web`, `pdf`");
    expect(await readFile(path.join(hostDir, "WIKI.md"), "utf8")).toContain("agent-wiki/notes/");
    expect(await readFile(path.join(hostDir, ".claude/settings.json"), "utf8")).toContain("\"Stop\"");
    expect(await readFile(path.join(hostDir, ".claude/hooks/auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
    expect(await readFile(path.join(hostDir, "bin/datalox-auto-promote.js"), "utf8")).toContain("compileRecordedEvent");
    expect(await readFile(path.join(hostDir, "bin/claude-global-auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
    expect(await readFile(path.join(hostDir, "bin/datalox-claude.js"), "utf8")).toContain("\"claude\"");
    expect(await readFile(path.join(hostDir, "bin/datalox-codex.js"), "utf8")).toContain("\"codex\"");
    expect(await readFile(path.join(hostDir, "bin/datalox.js"), "utf8")).toContain("Unable to resolve Datalox runtime root for datalox.js");
    expect(await readFile(path.join(hostDir, "bin/datalox-wrap.js"), "utf8")).toContain("\"wrap\"");
    expect(await readFile(path.join(hostDir, "bin/disable-default-host-integrations.sh"), "utf8")).toContain("CLI-first disable flow");
    expect(await readFile(path.join(hostDir, "bin/install-default-host-integrations.sh"), "utf8")).toContain("Compatibility shim for the CLI-first install flow.");
    expect(await readFile(path.join(hostDir, "bin/setup-multi-agent.sh"), "utf8")).toContain("Datalox Pack multi-agent setup");
    expect(await readFile(path.join(hostDir, ".github/copilot-instructions.md"), "utf8")).toContain("portable Datalox pack");
    expect(await readFile(path.join(hostDir, "skills/maintain-datalox-pack/SKILL.md"), "utf8")).toContain("Maintain Datalox Pack");
    expect(await readFile(path.join(hostDir, "skills/use-datalox-through-host-cli/SKILL.md"), "utf8")).toContain("Use Datalox Through Host CLI");
    expect(await readFile(path.join(hostDir, "agent-wiki/note.schema.md"), "utf8")).toContain("Action");
    expect(await readFile(path.join(hostDir, "agent-wiki/notes/use-datalox-through-host-cli.md"), "utf8")).toContain("thin wrapper");
    expect(await readFile(path.join(hostDir, ".datalox/install.json"), "utf8")).toContain("\"installMode\": \"manual\"");
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/github")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/ordercli")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/review-ambiguous-viability-gate")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/capture-web-knowledge")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "agent-wiki/notes/pdf")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "agent-wiki/notes/web")]).status).not.toBe(0);
  }, 30000);

  it("lets an agent run host-local install-default-host-integrations.sh from an adopted repo", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-self-install-"));
    const homeDir = await mkdtemp(path.join(tmpdir(), "datalox-home-"));
    tempDirs.push(hostDir, homeDir);

    const adopt = spawnSync("bash", [path.join(repoRoot, "bin/adopt-host-repo.sh"), hostDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(adopt.status).toBe(0);

    const fakeCodex = path.join(homeDir, "fake-codex");
    const fakeClaude = path.join(homeDir, "fake-claude");
    await writeFile(fakeCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await writeFile(fakeClaude, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);
    await chmod(fakeClaude, 0o755);

    const install = spawnSync("bash", [path.join(hostDir, "bin/install-default-host-integrations.sh")], {
      cwd: hostDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        DATALOX_REAL_CODEX_BIN: fakeCodex,
        DATALOX_REAL_CLAUDE_BIN: fakeClaude,
      },
    });

    expect(install.status).toBe(0);
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain(`PACK_ROOT="${repoRoot}"`);
    expect(await readFile(path.join(homeDir, ".local/bin/claude"), "utf8")).toContain(`PACK_ROOT="${repoRoot}"`);
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain("DATALOX_DEFAULT_POST_RUN_MODE:=review");
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain("DATALOX_DEFAULT_REVIEW_MODEL:=gpt-5.4-mini");
    expect(await readFile(path.join(homeDir, ".local/bin/claude"), "utf8")).toContain("DATALOX_DEFAULT_POST_RUN_MODE:=review");
    expect(await readFile(path.join(homeDir, ".local/bin/claude"), "utf8")).toContain("DATALOX_DEFAULT_REVIEW_MODEL:=gpt-5.4-mini");
    expect(await readFile(path.join(homeDir, ".claude/hooks/datalox-auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
    expect(await readlink(path.join(homeDir, ".datalox/cache/datalox-pack"))).toBe(repoRoot);
  }, 15000);

  it("lets an agent stop host integrations from an adopted repo", async () => {
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-self-disable-"));
    const homeDir = await mkdtemp(path.join(tmpdir(), "datalox-disable-home-"));
    tempDirs.push(hostDir, homeDir);

    const adopt = spawnSync("bash", [path.join(repoRoot, "bin/adopt-host-repo.sh"), hostDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(adopt.status).toBe(0);

    const fakeCodex = path.join(homeDir, "fake-codex");
    const fakeClaude = path.join(homeDir, "fake-claude");
    await writeFile(fakeCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await writeFile(fakeClaude, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);
    await chmod(fakeClaude, 0o755);

    const install = spawnSync("bash", [path.join(hostDir, "bin/install-default-host-integrations.sh")], {
      cwd: hostDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        DATALOX_REAL_CODEX_BIN: fakeCodex,
        DATALOX_REAL_CLAUDE_BIN: fakeClaude,
      },
    });
    expect(install.status).toBe(0);

    const disable = spawnSync("bash", [path.join(hostDir, "bin/disable-default-host-integrations.sh")], {
      cwd: hostDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });

    expect(disable.status).toBe(0);
    expect(spawnSync("test", ["-e", path.join(homeDir, ".local/bin/codex")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(homeDir, ".local/bin/claude")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(homeDir, ".claude/hooks/datalox-auto-promote.sh")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(homeDir, ".codex/skills/datalox-pack")]).status).not.toBe(0);
    expect(await readFile(path.join(homeDir, ".claude/settings.json"), "utf8")).not.toContain("datalox-auto-promote.sh");
  }, 20000);

  it("runs setup-multi-agent.sh from a fresh pack copy without requiring exec permissions on nested scripts", async () => {
    const packDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-copy-"));
    const homeDir = await mkdtemp(path.join(tmpdir(), "datalox-setup-home-"));
    tempDirs.push(packDir, homeDir);

    await copyPackSnapshot(repoRoot, packDir);

    const fakeCodex = path.join(homeDir, "fake-codex");
    const fakeClaude = path.join(homeDir, "fake-claude");
    await writeFile(fakeCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await writeFile(fakeClaude, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);
    await chmod(fakeClaude, 0o755);

    const setup = spawnSync("bash", [path.join(packDir, "bin/setup-multi-agent.sh")], {
      cwd: packDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        DATALOX_REAL_CODEX_BIN: fakeCodex,
        DATALOX_REAL_CLAUDE_BIN: fakeClaude,
      },
    });

    expect(setup.status).toBe(0);
    const resolvedPackDir = await realpath(packDir);
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain(`PACK_ROOT="${resolvedPackDir}"`);
    expect(await readFile(path.join(homeDir, ".local/bin/claude"), "utf8")).toContain(`PACK_ROOT="${resolvedPackDir}"`);
    expect(await readlink(path.join(homeDir, ".codex/skills/datalox-pack"))).toBe(path.join(resolvedPackDir, "skills"));
    expect(await readFile(path.join(homeDir, ".claude/hooks/datalox-auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
  }, 60000);

  it("runs the CLI-first setup flow from a fresh pack copy and bootstraps the current repo", async () => {
    const packDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-cli-copy-"));
    const homeDir = await mkdtemp(path.join(tmpdir(), "datalox-cli-home-"));
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-cli-host-"));
    tempDirs.push(packDir, homeDir, hostDir);

    await copyPackSnapshot(repoRoot, packDir);

    const init = spawnSync("git", ["init"], {
      cwd: hostDir,
      encoding: "utf8",
    });
    expect(init.status).toBe(0);

    const fakeCodex = path.join(homeDir, "fake-codex");
    await writeFile(fakeCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);

    const setup = spawnSync("node", [path.join(packDir, "bin/datalox.js"), "setup", "codex"], {
      cwd: hostDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        DATALOX_REAL_CODEX_BIN: fakeCodex,
      },
    });

    expect(setup.status).toBe(0);
    const resolvedPackDir = await realpath(packDir);
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain(`PACK_ROOT="${resolvedPackDir}"`);
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("source kinds: `trace`, `web`, `pdf`");
    expect(await readFile(path.join(hostDir, ".datalox/install.json"), "utf8")).toContain("\"installMode\": \"auto\"");
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/github")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/ordercli")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "skills/review-ambiguous-viability-gate")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "agent-wiki/notes/pdf")]).status).not.toBe(0);
    expect(spawnSync("test", ["-e", path.join(hostDir, "agent-wiki/notes/web")]).status).not.toBe(0);
  }, 60000);

  it("reports enforced host adapters as automatic in status output", async () => {
    const packDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-status-copy-"));
    const homeDir = await mkdtemp(path.join(tmpdir(), "datalox-status-home-"));
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-status-host-"));
    tempDirs.push(packDir, homeDir, hostDir);

    await copyPackSnapshot(repoRoot, packDir);

    const init = spawnSync("git", ["init"], {
      cwd: hostDir,
      encoding: "utf8",
    });
    expect(init.status).toBe(0);

    const fakeCodex = path.join(homeDir, "fake-codex");
    await writeFile(fakeCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);

    const install = spawnSync("node", [path.join(packDir, "bin/datalox.js"), "install", "codex", "--json"], {
      cwd: packDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        DATALOX_REAL_CODEX_BIN: fakeCodex,
      },
    });
    expect(install.status).toBe(0);

    const status = spawnSync("node", [path.join(packDir, "bin/datalox.js"), "status", "--repo", hostDir, "--json"], {
      cwd: hostDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });

    expect(status.status).toBe(0);
    const parsed = JSON.parse(status.stdout);
    expect(parsed.adapters.codex.enforcementLevel).toBe("enforced");
    expect(parsed.adapters.codex.installed).toBe(true);
    expect(parsed.adapters.codex.automatic).toBe(true);
    expect(parsed.adapters.claude.enforcementLevel).toBe("enforced");
    expect(parsed.adapters.generic_cli.enforcementLevel).toBe("conditional");
    expect(parsed.adapters.mcp_only.enforcementLevel).toBe("guidance_only");
    expect(parsed.repo.bootstrapStatus).toBe("bootstrappable");
    expect(parsed.repo.enforcementLevel).toBe("enforced");

    const installJson = JSON.parse(await readFile(path.join(packDir, ".datalox", "install.json"), "utf8"));
    expect(installJson.packRootPath).toBe(await realpath(packDir));
    expect(installJson.enforcement.adapters.codex.automatic).toBe(true);
  }, 60000);
});
