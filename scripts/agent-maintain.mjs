import process from "node:process";

import { maintainKnowledge, parseArgs } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

const result = await maintainKnowledge(
  {
    maxEvents: typeof args["max-events"] === "string" ? Number.parseInt(args["max-events"], 10) : undefined,
    includeCovered: args["include-covered"] === true,
    minNoteOccurrences: typeof args["min-note-occurrences"] === "string"
      ? Number.parseInt(args["min-note-occurrences"], 10)
      : undefined,
    minSkillOccurrences: typeof args["min-skill-occurrences"] === "string"
      ? Number.parseInt(args["min-skill-occurrences"], 10)
      : undefined,
    synthesizeSkills: args["synthesize-skills"] === true,
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Scanned events: ${result.scannedEvents}\n`);
  process.stdout.write(`Note actions: ${result.noteActions.length}\n`);
  process.stdout.write(`Skill actions: ${result.skillActions.length}\n`);
}
