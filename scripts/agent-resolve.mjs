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
    includeRaw: Boolean(args["include-raw"]),
  },
  process.cwd(),
);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`Mode: ${result.mode}\n`);
  process.stdout.write(`Runtime enabled: ${result.runtimeEnabled}\n`);
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
    process.stdout.write(`Skill layer: ${first.skillLayer}\n`);
    process.stdout.write(`Skill path: ${first.skillPath}\n`);
    if (first.defaultDoc?.viewPath) {
      process.stdout.write(`Default view: ${first.defaultDoc.viewPath}\n`);
    }
    if (first.defaultDoc?.value) {
      process.stdout.write(`Default doc: ${first.defaultDoc.value}\n`);
    }
    if (first.defaultDoc?.view?.title) {
      process.stdout.write(`Guidance title: ${first.defaultDoc.view.title}\n`);
    }
    if (Array.isArray(first.defaultDoc?.view?.sections) && first.defaultDoc.view.sections.length > 0) {
      process.stdout.write("Guidance summary:\n");
      for (const section of first.defaultDoc.view.sections.slice(0, 4)) {
        process.stdout.write(`- ${section.title}: ${section.summary}\n`);
      }
    }
    if (Array.isArray(first.defaultDoc?.view?.patterns) && first.defaultDoc.view.patterns.length > 0) {
      process.stdout.write("View patterns:\n");
      for (const pattern of first.defaultDoc.view.patterns.slice(0, 3)) {
        process.stdout.write(`- ${pattern.id}: ${pattern.recommendedAction}\n`);
      }
    }
    for (const doc of first.supportingDocs) {
      process.stdout.write(`Supporting doc: ${doc.value}\n`);
    }
    for (const linkedPattern of first.linkedPatterns) {
      process.stdout.write(`Linked pattern: ${linkedPattern.pattern.id} (${linkedPattern.filePath})\n`);
    }
  }
}
