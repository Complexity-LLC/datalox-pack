import process from "node:process";

import { learnFromInteraction, parseArgs } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.workflow && !args.skill && !args.task) {
  process.stderr.write("Usage: node scripts/agent-learn-from-interaction.mjs [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--tag <tag>] [--json]\n");
  process.exit(1);
}

const result = await learnFromInteraction(
  {
    task: typeof args.task === "string" ? args.task : undefined,
    workflow: typeof args.workflow === "string" ? args.workflow : undefined,
    step: typeof args.step === "string" ? args.step : undefined,
    skillId: typeof args.skill === "string" ? args.skill : undefined,
    summary: typeof args.summary === "string" ? args.summary : undefined,
    observations: Array.isArray(args.observation) ? args.observation : args.observation ? [args.observation] : [],
    transcript: typeof args.transcript === "string" ? args.transcript : undefined,
    tags: Array.isArray(args.tag) ? args.tag : args.tag ? [args.tag] : [],
    title: typeof args.title === "string" ? args.title : undefined,
    signal: typeof args.signal === "string" ? args.signal : undefined,
    interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
    recommendedAction: typeof args.action === "string" ? args.action : undefined,
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Note written: ${result.note.filePath}\n`);
  process.stdout.write(`Skill ${result.skill.operation}: ${result.skill.filePath}\n`);
  process.stdout.write(`Top resolved skill: ${result.resolution.matches[0]?.skill.id ?? "none"}\n`);
}
