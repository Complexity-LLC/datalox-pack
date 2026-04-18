#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  formatCommandForDocs,
  replaceRepoPath,
  runDemoFlow,
  summarizeList,
} from "./lib/demo-one-correction.mjs";

function parseOutputPath(argv) {
  const flagIndex = argv.indexOf("--output");
  if (flagIndex === -1) {
    return path.join(process.cwd(), "docs", "one-correction-demo.generated.md");
  }

  const outputPath = argv[flagIndex + 1];
  if (!outputPath) {
    throw new Error("Expected a file path after --output");
  }

  return path.resolve(outputPath);
}

async function main() {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const result = await runDemoFlow();
  const resolveCommand = formatCommandForDocs(result.resolveArgs, result.demoRepoPath);
  const patchCommand = formatCommandForDocs(result.patchArgs, result.demoRepoPath);
  const lintCommand = formatCommandForDocs(result.lintArgs, result.demoRepoPath);

  const lines = [
    "# One-Correction Demo Transcript",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This transcript is generated from a real `resolve -> patch -> resolve -> lint` run.",
    "",
    "## Commands",
    "",
    "```bash",
    "export DEMO_REPO=/tmp/datalox-one-correction-demo",
    resolveCommand,
    patchCommand,
    resolveCommand,
    lintCommand,
    "```",
    "",
    "## Before Correction",
    "",
    `Top skill: \`${result.beforeMatch?.skill?.id ?? "none"}\``,
    "",
    "What the agent would do:",
    ...summarizeList(result.beforeMatch?.loopGuidance?.whatToDoNow ?? []).map((value) => `- ${value}`),
    "",
    "## Human Correction",
    "",
    `Note written or updated: \`${result.notePath}\``,
    `Skill operation: \`${result.patched.skill?.operation ?? "unknown"}\``,
    `Skill path: \`${replaceRepoPath(result.skillPath, result.demoRepoPath)}\``,
    "",
    "## Next Run",
    "",
    `Top skill: \`${result.afterMatch?.skill?.id ?? "none"}\``,
    "",
    "What the agent does now:",
    ...summarizeList(result.afterMatch?.loopGuidance?.whatToDoNow ?? []).map((value) => `- ${value}`),
    "",
    "## Pack State",
    "",
    `Lint OK: \`${result.lint.ok}\``,
    `Lint issue count: \`${result.lint.issueCount}\``,
    "",
    "Recent log lines:",
    ...result.logTail.map((value) => `- ${value}`),
  ];

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
