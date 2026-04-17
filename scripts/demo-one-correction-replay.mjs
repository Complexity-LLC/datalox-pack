#!/usr/bin/env node
import process from "node:process";

import {
  formatCommandForDocs,
  replaceRepoPath,
  runDemoFlow,
  shellQuote,
  summarizeList,
} from "./lib/demo-one-correction.mjs";

function parseDelayMs(argv) {
  const flagIndex = argv.indexOf("--delay-ms");
  if (flagIndex === -1) {
    return argv.includes("--no-delay") ? 0 : 550;
  }

  const value = Number.parseInt(argv[flagIndex + 1] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : 550;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function emit(line = "", delayMs = 0) {
  process.stdout.write(`${line}\n`);
  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

async function emitList(values, delayMs) {
  for (const value of summarizeList(values)) {
    await emit(`- ${value}`, delayMs);
  }
}

async function main() {
  const delayMs = parseDelayMs(process.argv.slice(2));
  const result = await runDemoFlow();
  const exportLine = `export DEMO_REPO=${shellQuote(result.demoRepoPath)}`;
  const resolveCommand = formatCommandForDocs(result.resolveArgs, result.demoRepoPath);
  const patchCommand = formatCommandForDocs(result.patchArgs, result.demoRepoPath);
  const lintCommand = formatCommandForDocs(result.lintArgs, result.demoRepoPath);

  await emit("# Datalox one-correction demo", delayMs);
  await emit(`# repo-local state lives in: ${result.demoRepoPath}`, delayMs);
  await emit("", delayMs);

  await emit(`$ ${exportLine}`, delayMs);
  await emit("", delayMs);

  await emit(`$ ${resolveCommand}`, delayMs);
  await emit(`Top skill: ${result.beforeMatch?.skill?.id ?? "none"}`, delayMs);
  await emit("What the agent would do:", delayMs);
  await emitList(result.beforeMatch?.loopGuidance?.whatToDoNow ?? [], delayMs);
  await emit("", delayMs);

  await emit(`$ ${patchCommand}`, delayMs);
  await emit(`Note written or updated: ${result.notePath}`, delayMs);
  await emit(`Skill operation: ${result.patched.skill?.operation ?? "unknown"}`, delayMs);
  await emit(`Skill path: ${replaceRepoPath(result.skillPath, result.demoRepoPath)}`, delayMs);
  await emit("", delayMs);

  await emit(`$ ${resolveCommand}`, delayMs);
  await emit(`Top skill: ${result.afterMatch?.skill?.id ?? "none"}`, delayMs);
  await emit("What the agent does now:", delayMs);
  await emitList(result.afterMatch?.loopGuidance?.whatToDoNow ?? [], delayMs);
  await emit("", delayMs);

  await emit(`$ ${lintCommand}`, delayMs);
  await emit(`Lint OK: ${result.lint.ok}`, delayMs);
  await emit(`Lint issue count: ${result.lint.issueCount}`, delayMs);
  await emit("Recent log lines:", delayMs);
  await emitList(result.logTail, delayMs);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
