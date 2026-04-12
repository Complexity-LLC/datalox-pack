import process from "node:process";

import { parseArgs, writeSkill } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.id || !args.name || !args.workflow || !args.trigger || !args.description) {
  process.stderr.write("Usage: node scripts/agent-learn-skill.mjs --id <id> --name <name> --workflow <workflow> --trigger <trigger> --description <description> [--display-name <label>] [--pattern-path <path>] [--tag <tag>] [--json]\nThis writes a body-first SKILL.md playbook with Datalox metadata nested under metadata.datalox.\n");
  process.exit(1);
}

const result = await writeSkill(
  {
    id: args.id,
    name: args.name,
    displayName: typeof args["display-name"] === "string" ? args["display-name"] : undefined,
    workflow: args.workflow,
    trigger: args.trigger,
    description: args.description,
    patternPaths: Array.isArray(args["pattern-path"])
      ? args["pattern-path"]
      : args["pattern-path"]
        ? [args["pattern-path"]]
        : [],
    tags: Array.isArray(args.tag) ? args.tag : args.tag ? [args.tag] : [],
    status: "generated",
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Skill written: ${result.filePath}\n`);
}
