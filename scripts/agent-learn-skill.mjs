import process from "node:process";

import { parseArgs, writeWorkingSkill } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.id || !args.name || !args.workflow || !args.trigger || !args.description || !args["default-doc"]) {
  process.stderr.write("Usage: node scripts/agent-learn-skill.mjs --id <id> --name <name> --workflow <workflow> --trigger <trigger> --description <description> --default-doc <path> [--display-name <label>] [--supporting-doc <path>] [--pattern <pattern-id>] [--tag <tag>] [--json]\n");
  process.exit(1);
}

const result = await writeWorkingSkill(
  {
    id: args.id,
    name: args.name,
    displayName: typeof args["display-name"] === "string" ? args["display-name"] : undefined,
    workflow: args.workflow,
    trigger: args.trigger,
    description: args.description,
    defaultDoc: args["default-doc"],
    supportingDocs: Array.isArray(args["supporting-doc"])
      ? args["supporting-doc"]
      : args["supporting-doc"]
        ? [args["supporting-doc"]]
        : [],
    patternIds: Array.isArray(args.pattern) ? args.pattern : args.pattern ? [args.pattern] : [],
    tags: Array.isArray(args.tag) ? args.tag : args.tag ? [args.tag] : [],
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Working skill written: ${result.filePath}\n`);
}
