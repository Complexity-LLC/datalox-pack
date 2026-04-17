#!/usr/bin/env node
import process from "node:process";

import {
  buildDemoCommands,
  createTempDemoRepo,
  formatCommand,
  printList,
  runDemoFlow,
} from "./lib/demo-one-correction.mjs";

async function main() {
  const setupOnly = process.argv.slice(2).includes("--setup-only");

  if (setupOnly) {
    const demoRepoPath = await createTempDemoRepo();
    const { resolveArgs, patchArgs, lintArgs } = buildDemoCommands(demoRepoPath);

    process.stdout.write(`Demo repo: ${demoRepoPath}\n`);
    process.stdout.write(`Export helper: export DEMO_REPO=${demoRepoPath}\n`);
    process.stdout.write("\nCommands for a live recording:\n");
    process.stdout.write(`${formatCommand(resolveArgs)}\n`);
    process.stdout.write(`${formatCommand(patchArgs)}\n`);
    process.stdout.write(`${formatCommand(resolveArgs)}\n`);
    process.stdout.write(`${formatCommand(lintArgs)}\n`);
    process.stdout.write("\nRun the commands above in order to record the demo manually.\n");
    return;
  }

  const result = await runDemoFlow();

  process.stdout.write(`Demo repo: ${result.demoRepoPath}\n`);
  process.stdout.write(`Export helper: export DEMO_REPO=${result.demoRepoPath}\n`);
  process.stdout.write("\nCommands for a live recording:\n");
  process.stdout.write(`${formatCommand(result.resolveArgs)}\n`);
  process.stdout.write(`${formatCommand(result.patchArgs)}\n`);
  process.stdout.write(`${formatCommand(result.resolveArgs)}\n`);
  process.stdout.write(`${formatCommand(result.lintArgs)}\n`);

  process.stdout.write("\nBefore correction\n");
  process.stdout.write(`Top skill: ${result.beforeMatch?.skill?.id ?? "none"}\n`);
  process.stdout.write("What the agent would do:\n");
  printList(result.beforeMatch?.loopGuidance?.whatToDoNow ?? []);

  process.stdout.write("\nHuman correction\n");
  process.stdout.write(`Note written or updated: ${result.notePath}\n`);
  process.stdout.write(`Skill operation: ${result.patched.skill?.operation ?? "unknown"}\n`);
  process.stdout.write(`Skill path: ${result.skillPath}\n`);

  process.stdout.write("\nNext run\n");
  process.stdout.write(`Top skill: ${result.afterMatch?.skill?.id ?? "none"}\n`);
  process.stdout.write("What the agent does now:\n");
  printList(result.afterMatch?.loopGuidance?.whatToDoNow ?? []);

  process.stdout.write("\nPack state\n");
  process.stdout.write(`Lint OK: ${result.lint.ok}\n`);
  process.stdout.write(`Lint issue count: ${result.lint.issueCount}\n`);
  process.stdout.write("Recent log lines:\n");
  printList(result.logTail);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
