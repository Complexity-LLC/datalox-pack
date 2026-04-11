import process from "node:process";

import { parseArgs, writePatternProposal } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.workflow || !args.title || !args.signal || !args.interpretation || !args.action) {
  process.stderr.write("Usage: node scripts/agent-propose-pattern.mjs --workflow <workflow> --title <title> --signal <signal> --interpretation <interpretation> --action <recommended-action> [--skill <skill-id>] [--doc <doc-path>] [--tag <tag>] [--json]\n");
  process.exit(1);
}

const result = await writePatternProposal(
  {
    workflow: args.workflow,
    title: args.title,
    signal: args.signal,
    interpretation: args.interpretation,
    recommendedAction: args.action,
    skillId: typeof args.skill === "string" ? args.skill : undefined,
    docPath: typeof args.doc === "string" ? args.doc : undefined,
    tags: Array.isArray(args.tag) ? args.tag : args.tag ? [args.tag] : [],
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Pattern proposal written: ${result.filePath}\n`);
}
