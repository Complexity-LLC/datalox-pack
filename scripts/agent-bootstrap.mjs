import process from "node:process";

import { countPackFiles, loadPackConfig, resolvePackPaths, parseArgs } from "./lib/agent-pack.mjs";

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
  nativeSkillPolicy: config.agent.nativeSkillPolicy,
  interfaceOrder: config.agent.interfaceOrder,
  docReadOrder: config.agent.docReadOrder,
  paths,
  counts,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(`Mode: ${payload.mode}\n`);
  process.stdout.write(`Runtime enabled: ${payload.runtimeEnabled}\n`);
  process.stdout.write(`Config: ${payload.configPath}\n`);
  if (payload.localOverridePath) {
    process.stdout.write(`Local override: ${payload.localOverridePath}\n`);
  }
  process.stdout.write(`Profile: ${payload.profile}\n`);
  process.stdout.write(`Native skill policy: ${payload.nativeSkillPolicy}\n`);
  process.stdout.write(`Approved skills: ${payload.counts.approvedSkills}\n`);
  process.stdout.write(`Working skills: ${payload.counts.workingSkills}\n`);
  process.stdout.write(`Working patterns: ${payload.counts.workingPatterns}\n`);
  process.stdout.write(`Docs: ${payload.counts.docs}\n`);
  process.stdout.write(`Views: ${payload.counts.views}\n`);
  process.stdout.write(`Skills dir: ${payload.paths.skillsDir}\n`);
  process.stdout.write(`Working skills dir: ${payload.paths.workingSkillsDir}\n`);
  process.stdout.write(`Working patterns dir: ${payload.paths.workingPatternsDir}\n`);
  process.stdout.write(`Docs dir: ${payload.paths.docsDir}\n`);
  process.stdout.write(`Views dir: ${payload.paths.viewsDir}\n`);
  process.stdout.write(`Proposals dir: ${payload.paths.proposalsDir}\n`);
  process.stdout.write(`Status: portable pack is readable without a running Datalox service\n`);
}
