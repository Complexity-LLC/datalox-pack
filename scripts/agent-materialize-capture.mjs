import process from "node:process";

import { materializeInteractionCapture, parseArgs } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.capture) {
  process.stderr.write("Usage: node scripts/agent-materialize-capture.mjs --capture <path> [--json]\n");
  process.exit(1);
}

const result = await materializeInteractionCapture(
  {
    capturePath: args.capture,
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Working pattern written: ${result.pattern.filePath}\n`);
  if (result.skill) {
    process.stdout.write(`Working skill updated: ${result.skill.filePath}\n`);
  }
  process.stdout.write(`Top resolved skill: ${result.resolution.matches[0]?.skill.id ?? "none"}\n`);
}
