import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

type Manifest = {
  configPath: string;
  instructionPaths: string[];
  conformancePaths: string[];
};

type ConformanceCase = {
  mustRead?: string[];
  mayReadIfNeeded?: string[];
  mustWrite?: string[];
  mustNotWrite?: string[];
  expectedResult?: Record<string, unknown>;
};

async function fileExists(relativePath: string) {
  await access(path.join(repoRoot, relativePath));
}

describe("pack contract", () => {
  it("publishes manifest entrypoints and conformance cases", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, ".datalox/manifest.json"), "utf8"),
    ) as Manifest;

    await fileExists("DATALOX.md");
    await fileExists(manifest.configPath);
    await Promise.all(manifest.instructionPaths.map((file) => fileExists(file)));
    await Promise.all(manifest.conformancePaths.map((file) => fileExists(file)));
  });

  it("keeps conformance file paths grounded in the repo contract", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, ".datalox/manifest.json"), "utf8"),
    ) as Manifest;

    const conformancePaths = manifest.conformancePaths.filter((file) => file.endsWith(".json"));

    for (const relativePath of conformancePaths) {
      const fixture = JSON.parse(
        await readFile(path.join(repoRoot, relativePath), "utf8"),
      ) as ConformanceCase;

      const mustExist = [
        ...(fixture.mustRead ?? []),
        ...(fixture.mayReadIfNeeded ?? []),
      ].filter((file) => !file.includes("<timestamp>"));

      await Promise.all(mustExist.map((file) => fileExists(file)));

      const writePaths = [
        ...(fixture.mustWrite ?? []),
        ...(fixture.mustNotWrite ?? []),
      ];

      expect(writePaths.length > 0 || fixture.expectedResult !== undefined).toBe(true);
    }
  });
});
