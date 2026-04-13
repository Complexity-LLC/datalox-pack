import process from "node:process";

import {
  adoptPack,
  getDefaultPackUrl,
  lintLocalPack,
  patchKnowledge,
  promoteGap,
  recordTurnResult,
  resolveLoop,
} from "../core/packCore.js";
import { parseCliArgs, toStringArray } from "./args.js";

function usage(): string {
  return [
    "Usage:",
    "  datalox adopt <host-repo-path> [--pack-source <path-or-git-url>] [--json]",
    "  datalox resolve [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--limit <n>] [--include-content] [--json]",
    "  datalox record [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--tag <tag>] [--event-kind <kind>] [--json]",
    "  datalox patch [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--tag <tag>] [--json]",
    "  datalox promote [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--tag <tag>] [--event-kind <kind>] [--min-wiki-occurrences <n>] [--min-skill-occurrences <n>] [--json]",
    "  datalox lint [--repo <path>] [--json]",
  ].join("\n");
}

function writeResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const [command, positional] = args._;
  const asJson = args.json === true;

  switch (command) {
    case "adopt": {
      const hostRepoPath = positional;
      if (!hostRepoPath) {
        throw new Error("adopt requires <host-repo-path>");
      }
      const result = await adoptPack({
        hostRepoPath,
        packSource: typeof args["pack-source"] === "string" ? args["pack-source"] : undefined,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`Host repo: ${result.hostRepoPath}\n`);
      process.stdout.write(`Pack source: ${result.packRootPath}\n`);
      process.stdout.write(`Copied: ${result.copied.length}\n`);
      process.stdout.write(`Skipped: ${result.skipped.length}\n`);
      return;
    }
    case "resolve": {
      const limit = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : undefined;
      const result = await resolveLoop({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skill: typeof args.skill === "string" ? args.skill : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        includeContent: args["include-content"] === true,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`Selection basis: ${result.selectionBasis}\n`);
      process.stdout.write(`Workflow: ${result.workflow}\n`);
      for (const match of result.matches) {
        process.stdout.write(`Skill: ${match.skill.id}\n`);
        process.stdout.write(`Why matched: ${match.loopGuidance.whyMatched.join("; ")}\n`);
        if (match.loopGuidance.whatToDoNow.length > 0) {
          process.stdout.write(`What to do now:\n`);
          for (const line of match.loopGuidance.whatToDoNow) {
            process.stdout.write(`- ${line}\n`);
          }
        }
      }
      return;
    }
    case "record": {
      const result = await recordTurnResult({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skillId: typeof args.skill === "string" ? args.skill : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        observations: toStringArray(args.observation),
        transcript: typeof args.transcript === "string" ? args.transcript : undefined,
        tags: toStringArray(args.tag),
        title: typeof args.title === "string" ? args.title : undefined,
        signal: typeof args.signal === "string" ? args.signal : undefined,
        interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
        recommendedAction: typeof args.action === "string" ? args.action : undefined,
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`Event: ${result.event.relativePath}\n`);
      process.stdout.write(`Occurrences: ${result.occurrenceCount}\n`);
      process.stdout.write(`Matched skill: ${result.resolution.matches[0]?.skill.id ?? "none"}\n`);
      return;
    }
    case "patch": {
      const result = await patchKnowledge({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skillId: typeof args.skill === "string" ? args.skill : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        observations: toStringArray(args.observation),
        transcript: typeof args.transcript === "string" ? args.transcript : undefined,
        tags: toStringArray(args.tag),
        title: typeof args.title === "string" ? args.title : undefined,
        signal: typeof args.signal === "string" ? args.signal : undefined,
        interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
        recommendedAction: typeof args.action === "string" ? args.action : undefined,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`Pattern doc: ${result.pattern.filePath}\n`);
      process.stdout.write(`Skill ${result.skill.operation}: ${result.skill.filePath}\n`);
      process.stdout.write(`Top resolved skill: ${result.resolution.matches[0]?.skill.id ?? "none"}\n`);
      return;
    }
    case "promote": {
      const minWikiOccurrences = typeof args["min-wiki-occurrences"] === "string"
        ? Number.parseInt(args["min-wiki-occurrences"], 10)
        : undefined;
      const minSkillOccurrences = typeof args["min-skill-occurrences"] === "string"
        ? Number.parseInt(args["min-skill-occurrences"], 10)
        : undefined;
      const result = await promoteGap({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skillId: typeof args.skill === "string" ? args.skill : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        observations: toStringArray(args.observation),
        transcript: typeof args.transcript === "string" ? args.transcript : undefined,
        tags: toStringArray(args.tag),
        title: typeof args.title === "string" ? args.title : undefined,
        signal: typeof args.signal === "string" ? args.signal : undefined,
        interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
        recommendedAction: typeof args.action === "string" ? args.action : undefined,
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
        minWikiOccurrences: Number.isFinite(minWikiOccurrences) ? minWikiOccurrences : undefined,
        minSkillOccurrences: Number.isFinite(minSkillOccurrences) ? minSkillOccurrences : undefined,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`Decision: ${result.decision.action}\n`);
      process.stdout.write(`Reason: ${result.decision.reason}\n`);
      process.stdout.write(`Occurrences: ${result.decision.occurrenceCount}\n`);
      if (result.promotion?.skill?.filePath) {
        process.stdout.write(`Skill: ${result.promotion.skill.filePath}\n`);
      }
      if (result.promotion?.pattern?.filePath) {
        process.stdout.write(`Pattern: ${result.promotion.pattern.filePath}\n`);
      }
      return;
    }
    case "lint": {
      const result = await lintLocalPack({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
      });
      if (asJson) {
        writeResult(result, true);
        return;
      }
      process.stdout.write(`OK: ${result.ok}\n`);
      process.stdout.write(`Issue count: ${result.issueCount}\n`);
      return;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(`${usage()}\n`);
      process.stdout.write(`Default pack URL: ${getDefaultPackUrl()}\n`);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
});
