import process from "node:process";

import { countPackFiles, loadPackConfig, parseArgs, resolvePackPaths } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));
const { config, sourcePath, localOverridePath } = await loadPackConfig(process.cwd());
const paths = resolvePackPaths(config, process.cwd());
const counts = await countPackFiles(config, process.cwd());

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
  process.stdout.write(`Patterns: ${payload.counts.patterns}\n`);
  process.stdout.write(`Skills dir: ${payload.paths.skillsDir}\n`);
  process.stdout.write(`Patterns dir: ${payload.paths.patternsDir}\n`);
  process.stdout.write("Status: portable pack is readable without a running Datalox service\n");
}
