import process from "node:process";

import { parseArgs, resolveLocalKnowledge } from "./lib/agent-pack.mjs";

const args = parseArgs(process.argv.slice(2));

const result = await resolveLocalKnowledge(
  {
    task: typeof args.task === "string" ? args.task : "",
    workflow: typeof args.workflow === "string" ? args.workflow : undefined,
    step: typeof args.step === "string" ? args.step : undefined,
    skill: typeof args.skill === "string" ? args.skill : undefined,
    limit: typeof args.limit === "string" ? Number(args.limit) : 3,
    includeContent: Boolean(args["include-content"]),
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Mode: ${result.mode}\n`);
  process.stdout.write(`Runtime enabled: ${result.runtimeEnabled}\n`);
  process.stdout.write(`Detect on every loop: ${result.detectOnEveryLoop}\n`);
  process.stdout.write(`Native skill policy: ${result.nativeSkillPolicy}\n`);
  process.stdout.write(`Selection basis: ${result.selectionBasis}\n`);
  process.stdout.write(`Workflow: ${result.workflow}\n`);
  if (Array.isArray(result.repoContext?.changedPaths) && result.repoContext.changedPaths.length > 0) {
    process.stdout.write(`Repo changes: ${result.repoContext.changedPaths.slice(0, 5).join(", ")}\n`);
  }
  if (result.matches.length === 0) {
    process.stdout.write("No local skill match found.\n");
  } else {
    const [first] = result.matches;
    process.stdout.write(`Top skill: ${first.skill.displayName ?? first.skill.name}\n`);
    process.stdout.write(`Skill path: ${first.skillPath}\n`);
    if (first.loopGuidance.whyMatched.length > 0) {
      process.stdout.write("Why matched:\n");
      for (const reason of first.loopGuidance.whyMatched) {
        process.stdout.write(`- ${reason}\n`);
      }
    }
    if (first.loopGuidance.whatToDoNow.length > 0) {
      process.stdout.write("What to do now:\n");
      for (const action of first.loopGuidance.whatToDoNow) {
        process.stdout.write(`- ${action}\n`);
      }
    }
    if (first.loopGuidance.watchFor.length > 0) {
      process.stdout.write("Watch for:\n");
      for (const signal of first.loopGuidance.watchFor) {
        process.stdout.write(`- ${signal}\n`);
      }
    }
    for (const patternDoc of first.patternDocs) {
      process.stdout.write(`Pattern doc: ${patternDoc.path}\n`);
      if (patternDoc.title) {
        process.stdout.write(`- ${patternDoc.title}: ${patternDoc.summary}\n`);
      }
    }
  }
}
