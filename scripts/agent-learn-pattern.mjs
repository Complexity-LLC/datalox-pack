import process from "node:process";

import { parseArgs, writeWorkingPattern } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.workflow || !args.title || !args.signal || !args.interpretation || !args.action) {
  process.stderr.write("Usage: node scripts/agent-learn-pattern.mjs --workflow <workflow> --title <title> --signal <signal> --interpretation <interpretation> --action <recommended-action> [--id <pattern-id>] [--skill <skill-id>] [--tag <tag>] [--json]\n");
  process.exit(1);
}

const result = await writeWorkingPattern(
  {
    id: typeof args.id === "string" ? args.id : undefined,
    title: args.title,
    workflow: args.workflow,
    signal: args.signal,
    interpretation: args.interpretation,
    recommendedAction: args.action,
    skillId: typeof args.skill === "string" ? args.skill : undefined,
    tags: Array.isArray(args.tag) ? args.tag : args.tag ? [args.tag] : [],
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Working pattern written: ${result.filePath}\n`);
}
