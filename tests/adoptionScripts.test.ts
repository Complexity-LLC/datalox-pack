import { chmod, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();

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
    expect(await readFile(path.join(hostDir, "bin/datalox-wrap.js"), "utf8")).toContain("\"wrap\"");
    expect(await readFile(path.join(hostDir, "bin/install-default-host-integrations.sh"), "utf8")).toContain("Installed default host integrations.");
    expect(await readFile(path.join(hostDir, "bin/setup-multi-agent.sh"), "utf8")).toContain("Datalox Pack multi-agent setup");
    expect(await readFile(path.join(hostDir, ".github/copilot-instructions.md"), "utf8")).toContain("portable Datalox pack");
    expect(await readFile(path.join(hostDir, "skills/evolve-portable-pack/SKILL.md"), "utf8")).toContain("Evolve Portable Pack");
    expect(await readFile(path.join(hostDir, "skills/host-cli-wrapper/SKILL.md"), "utf8")).toContain("Host CLI Wrapper");
    expect(await readFile(path.join(hostDir, "agent-wiki/note.schema.md"), "utf8")).toContain("Action");
    expect(await readFile(path.join(hostDir, "agent-wiki/notes/host-cli-wrapper-fallback.md"), "utf8")).toContain("thin wrapper");
    expect(await readFile(path.join(hostDir, ".datalox/install.json"), "utf8")).toContain("\"installMode\": \"manual\"");
  }, 15000);

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
    expect(await readFile(path.join(homeDir, ".local/bin/codex"), "utf8")).toContain(`PACK_ROOT="${hostDir}"`);
    expect(await readFile(path.join(homeDir, ".local/bin/claude"), "utf8")).toContain(`PACK_ROOT="${hostDir}"`);
    expect(await readFile(path.join(homeDir, ".claude/hooks/datalox-auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
    expect(await readlink(path.join(homeDir, ".datalox/cache/datalox-pack"))).toBe(repoRoot);
  }, 15000);
});
