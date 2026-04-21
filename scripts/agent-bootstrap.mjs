import process from "node:process";

import { countPackFiles, loadAgentConfig, parseArgs, resolvePackPaths } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));
const { config, sourcePath, localOverridePath } = await loadAgentConfig(process.cwd());
const resolvedPaths = resolvePackPaths(config, { cwd: process.cwd(), sourcePath });
const counts = await countPackFiles(config, process.cwd(), sourcePath);
const paths = {
  hostSkillsDir: resolvedPaths.hostSkillsDir,
  hostNotesDir: resolvedPaths.hostNotesDir,
  seedSkillsDir: resolvedPaths.seedSkillsDir,
  seedNotesDir: resolvedPaths.seedNotesDir,
  hostWikiDir: resolvedPaths.hostWikiDir,
};

const payload = {
  mode: config.mode,
  runtimeEnabled: config.runtime.enabled,
  configPath: sourcePath,
  localOverridePath: localOverridePath ?? null,
  profile: config.agent.profile,
  detectOnEveryLoop: config.agent.detectOnEveryLoop,
  nativeSkillPolicy: config.agent.nativeSkillPolicy,
  interfaceOrder: config.agent.interfaceOrder,
  paths,
  counts,
  artifacts: {
    indexPath: `${paths.hostWikiDir}/index.md`,
    logPath: `${paths.hostWikiDir}/log.md`,
    lintPath: `${paths.hostWikiDir}/lint.md`,
    hotPath: `${paths.hostWikiDir}/hot.md`,
  },
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(`Mode: ${payload.mode}\n`);
  process.stdout.write(`Runtime enabled: ${payload.runtimeEnabled}\n`);
  process.stdout.write(`Config: ${payload.configPath}\n`);
  process.stdout.write(`Detect on every loop: ${payload.detectOnEveryLoop}\n`);
  process.stdout.write(`Native skill policy: ${payload.nativeSkillPolicy}\n`);
  process.stdout.write(`Skills: ${payload.counts.skills}\n`);
  process.stdout.write(`Notes: ${payload.counts.notes}\n`);
  process.stdout.write(`Seed skills dir: ${payload.paths.seedSkillsDir}\n`);
  process.stdout.write(`Seed notes dir: ${payload.paths.seedNotesDir}\n`);
  process.stdout.write(`Host skills dir: ${payload.paths.hostSkillsDir}\n`);
  process.stdout.write(`Host notes dir: ${payload.paths.hostNotesDir}\n`);
  process.stdout.write(`Index: ${payload.artifacts.indexPath}\n`);
  process.stdout.write(`Log: ${payload.artifacts.logPath}\n`);
  process.stdout.write(`Lint snapshot: ${payload.artifacts.lintPath}\n`);
  process.stdout.write(`Hot cache: ${payload.artifacts.hotPath}\n`);
  process.stdout.write("Status: portable pack is readable without a running Datalox service\n");
}
