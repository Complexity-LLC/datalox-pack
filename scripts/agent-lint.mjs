import process from "node:process";

import { lintPack, parseArgs } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));
const result = await lintPack(process.cwd());

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`OK: ${result.ok}\n`);
  process.stdout.write(`Issue count: ${result.issueCount}\n`);
  for (const issue of result.issues) {
    process.stdout.write(`[${issue.level}] ${issue.code}: ${issue.message}`);
    if (issue.path) {
      process.stdout.write(` (${issue.path})`);
    }
    process.stdout.write("\n");
  }
}

process.exit(result.ok ? 0 : 1);
