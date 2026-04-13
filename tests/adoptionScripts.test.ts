import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    expect(await readFile(path.join(hostDir, "DATALOX.md"), "utf8")).toContain("Datalox Pack Protocol");
    expect(await readFile(path.join(hostDir, "WIKI.md"), "utf8")).toContain("Treat this repository as a Datalox pack");
    expect(await readFile(path.join(hostDir, ".claude/settings.json"), "utf8")).toContain("\"Stop\"");
    expect(await readFile(path.join(hostDir, ".claude/hooks/auto-promote.sh"), "utf8")).toContain("datalox-auto-promote.js");
    expect(await readFile(path.join(hostDir, "bin/datalox-auto-promote.js"), "utf8")).toContain("promoteGap");
    expect(await readFile(path.join(hostDir, ".github/copilot-instructions.md"), "utf8")).toContain("portable Datalox pack");
    expect(await readFile(path.join(hostDir, "skills/evolve-portable-pack/SKILL.md"), "utf8")).toContain("Evolve Portable Pack");
    expect(await readFile(path.join(hostDir, "agent-wiki/pattern.schema.md"), "utf8")).toContain("Signal");
    expect(await readFile(path.join(hostDir, "agent-wiki/source.schema.md"), "utf8")).toContain("Source pages");
    expect(await readFile(path.join(hostDir, "agent-wiki/page-types.md"), "utf8")).toContain("patterns/");
  });
});
