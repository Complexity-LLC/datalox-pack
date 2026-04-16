import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  adoptPack,
  autoBootstrapIfSafe,
  getDefaultPackUrl,
  lintLocalPack,
  patchKnowledge,
  probeBootstrapCandidate,
  promoteGap,
  recordTurnResult,
  resolveLoop,
  syncNoteRetrieval,
} from "../core/packCore.js";
import { installHostIntegrations, type InstallHost } from "../core/installCore.js";
import { capturePdfArtifact } from "../core/pdfCapture.js";
import { publishWebCapture } from "../core/publishWebCapture.js";
import { captureDesignFromUrl, captureWebArtifact } from "../core/webCapture.js";
import { runClaudeWrapper } from "../adapters/claude/run.js";
import { runCodexWrapper } from "../adapters/codex/run.js";
import { runGenericWrapper } from "../adapters/generic/run.js";
import { parseCliArgs, toStringArray } from "./args.js";

function resolveCliPackRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../", import.meta.url)),
    fileURLToPath(new URL("../../../", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "package.json"))
      && existsSync(path.join(candidate, "scripts", "lib", "agent-pack.mjs"))
    ) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

function usage(): string {
  return [
    "Usage:",
    "  datalox install [all|codex|claude] [--json]",
    "  datalox bootstrap [--repo <path>] [--pack-source <path-or-git-url>] [--json]",
    "  datalox setup [all|codex|claude] [--repo <path>] [--pack-source <path-or-git-url>] [--json]",
    "  datalox adopt <host-repo-path> [--pack-source <path-or-git-url>] [--json]",
    "  datalox probe-bootstrap [--repo <path>] [--json]",
    "  datalox auto-bootstrap [--repo <path>] [--pack-source <path-or-git-url>] [--json]",
    "  datalox capture-web [--repo <path>] --url <url> [--artifact <design-doc|design-tokens|css-variables|tailwind-theme|note|source-page>] [--title <title>] [--slug <slug>] [--output <path>] [--json]",
    "  datalox capture-design [--repo <path>] --url <url> [--title <title>] [--slug <slug>] [--output <path>] [--json]",
    "  datalox capture-pdf [--repo <path>] --path <pdf-path> [--title <title>] [--slug <slug>] [--source-url <url>] [--json]",
    "  datalox publish-web-capture [--repo <path>] --capture <slug> [--bucket <bucket>] [--prefix <prefix>] [--public-base-url <url>] [--json]",
    "  datalox resolve [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--limit <n>] [--include-content] [--json]",
    "  datalox retrieval sync [--repo <path>] [--json]",
    "  datalox record [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--changed-file <path>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--outcome <text>] [--tag <tag>] [--event-kind <kind>] [--json]",
    "  datalox patch [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--tag <tag>] [--json]",
    "  datalox promote [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--summary <summary>] [--observation <text>] [--changed-file <path>] [--transcript <text>] [--title <title>] [--signal <signal>] [--interpretation <text>] [--action <text>] [--outcome <text>] [--tag <tag>] [--event-kind <kind>] [--min-wiki-occurrences <n>] [--min-skill-occurrences <n>] [--json]",
    "  datalox lint [--repo <path>] [--json]",
    "  datalox wrap prompt [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--prompt <text>] [--json]",
    "  datalox wrap command [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--prompt <text>] [--summary <summary>] [--tag <tag>] [--event-kind <kind>] [--post-run-mode <off|record|auto|promote>] [--min-wiki-occurrences <n>] [--min-skill-occurrences <n>] [--json] -- <command> [args with __DATALOX_PROMPT__ placeholders]",
    "  datalox claude [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--prompt <text>] [--summary <summary>] [--tag <tag>] [--event-kind <kind>] [--post-run-mode <off|record|auto|promote>] [--min-wiki-occurrences <n>] [--min-skill-occurrences <n>] [--claude-bin <path>] [--json] [-- <claude args>]",
    "  datalox codex [--repo <path>] [--task <task>] [--workflow <workflow>] [--step <step>] [--skill <skill-id>] [--prompt <text>] [--summary <summary>] [--tag <tag>] [--event-kind <kind>] [--post-run-mode <off|record|auto|promote>] [--min-wiki-occurrences <n>] [--min-skill-occurrences <n>] [--codex-bin <path>] [--json] [-- <codex exec args>]",
  ].join("\n");
}

function writeResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parsePositiveInt(value: string | string[] | boolean | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseWebArtifactType(value: string | undefined): "design_doc" | "design_tokens" | "css_variables" | "tailwind_theme" | "note" | "source_page" {
  switch (value) {
    case "source-page":
      return "source_page";
    case "design-tokens":
      return "design_tokens";
    case "css-variables":
      return "css_variables";
    case "tailwind-theme":
      return "tailwind_theme";
    case "note":
      return "note";
    default:
      return "design_doc";
  }
}

function parseInstallHost(value: string | undefined): InstallHost {
  switch (value) {
    case "codex":
    case "claude":
      return value;
    default:
      return "all";
  }
}

async function bootstrapRepo(repoPath?: string, packSource?: string) {
  const probeBefore = await probeBootstrapCandidate(repoPath);
  if (probeBefore.status === "ready" || !probeBefore.canAutoBootstrap) {
    return {
      repoPath: probeBefore.repoPath,
      probeBefore,
      action: "none" as const,
      adoption: null,
      probeAfter: probeBefore,
    };
  }
  return autoBootstrapIfSafe({
    repoPath,
    packSource,
  });
}

function writePostRunSummary(prefix: string, postRun: unknown): void {
  if (!postRun || typeof postRun !== "object") {
    return;
  }
  const typed = postRun as {
    mode?: string;
    trigger?: string;
    result?: {
      event?: { relativePath?: string };
      decision?: { action?: string; reason?: string; occurrenceCount?: number };
    } | null;
  };
  const eventPath = typed.result?.event?.relativePath;
  const decision = typed.result?.decision;
  if (decision?.action) {
    process.stderr.write(
      `[${prefix}] ${decision.action} | ${decision.reason ?? "no reason"} | occurrences=${decision.occurrenceCount ?? "?"}${eventPath ? ` | ${eventPath}` : ""}\n`,
    );
    return;
  }
  process.stderr.write(
    `[${prefix}] ${typed.mode ?? "record"} | ${typed.trigger ?? "record_only"}${eventPath ? ` | ${eventPath}` : ""}\n`,
  );
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const [command, positional, ...rest] = args._;
  const asJson = args.json === true;

  switch (command) {
    case "install": {
      const host = parseInstallHost(positional);
      const result = await installHostIntegrations({
        host,
        packRootPath: resolveCliPackRoot(),
      });
      writeResult(result, true);
      return;
    }
    case "bootstrap": {
      const result = await bootstrapRepo(
        typeof args.repo === "string" ? args.repo : undefined,
        typeof args["pack-source"] === "string" ? args["pack-source"] : undefined,
      );
      writeResult(result, true);
      return;
    }
    case "setup": {
      const host = parseInstallHost(positional);
      const install = await installHostIntegrations({
        host,
        packRootPath: resolveCliPackRoot(),
      });
      const bootstrap = await bootstrapRepo(
        typeof args.repo === "string" ? args.repo : undefined,
        typeof args["pack-source"] === "string" ? args["pack-source"] : undefined,
      );
      writeResult({ install, bootstrap }, true);
      return;
    }
    case "adopt": {
      const hostRepoPath = positional;
      if (!hostRepoPath) {
        throw new Error("adopt requires <host-repo-path>");
      }
      const result = await adoptPack({
        hostRepoPath,
        packSource: typeof args["pack-source"] === "string" ? args["pack-source"] : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "probe-bootstrap": {
      const result = await probeBootstrapCandidate(typeof args.repo === "string" ? args.repo : undefined);
      writeResult(result, true);
      return;
    }
    case "auto-bootstrap": {
      const result = await autoBootstrapIfSafe({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        packSource: typeof args["pack-source"] === "string" ? args["pack-source"] : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "capture-web": {
      if (typeof args.url !== "string") {
        throw new Error("capture-web requires --url <url>");
      }
      const artifactType = parseWebArtifactType(typeof args.artifact === "string" ? args.artifact : "design-doc");
      const result = await captureWebArtifact({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        url: args.url,
        title: typeof args.title === "string" ? args.title : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        artifactType,
        outputPath: typeof args.output === "string" ? args.output : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "capture-pdf": {
      if (typeof args.path !== "string") {
        throw new Error("capture-pdf requires --path <pdf-path>");
      }
      const result = await capturePdfArtifact({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        path: args.path,
        title: typeof args.title === "string" ? args.title : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        sourceUrl: typeof args["source-url"] === "string" ? args["source-url"] : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "capture-design": {
      if (typeof args.url !== "string") {
        throw new Error("capture-design requires --url <url>");
      }
      const result = await captureDesignFromUrl({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        url: args.url,
        title: typeof args.title === "string" ? args.title : undefined,
        slug: typeof args.slug === "string" ? args.slug : undefined,
        outputPath: typeof args.output === "string" ? args.output : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "publish-web-capture": {
      if (typeof args.capture !== "string") {
        throw new Error("publish-web-capture requires --capture <slug>");
      }
      const result = await publishWebCapture({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        capture: args.capture,
        bucket: typeof args.bucket === "string" ? args.bucket : undefined,
        prefix: typeof args.prefix === "string" ? args.prefix : undefined,
        publicBaseUrl: typeof args["public-base-url"] === "string" ? args["public-base-url"] : undefined,
      });
      writeResult(result, true);
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
      writeResult(result, true);
      return;
    }
    case "retrieval": {
      if (positional !== "sync") {
        throw new Error("retrieval requires a subcommand; supported: sync");
      }
      const result = await syncNoteRetrieval({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
      });
      writeResult(result, true);
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
        changedFiles: toStringArray(args["changed-file"]),
        transcript: typeof args.transcript === "string" ? args.transcript : undefined,
        tags: toStringArray(args.tag),
        title: typeof args.title === "string" ? args.title : undefined,
        signal: typeof args.signal === "string" ? args.signal : undefined,
        interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
        recommendedAction: typeof args.action === "string" ? args.action : undefined,
        outcome: typeof args.outcome === "string" ? args.outcome : undefined,
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
      });
      writeResult(result, true);
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
      writeResult(result, true);
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
        changedFiles: toStringArray(args["changed-file"]),
        transcript: typeof args.transcript === "string" ? args.transcript : undefined,
        tags: toStringArray(args.tag),
        title: typeof args.title === "string" ? args.title : undefined,
        signal: typeof args.signal === "string" ? args.signal : undefined,
        interpretation: typeof args.interpretation === "string" ? args.interpretation : undefined,
        recommendedAction: typeof args.action === "string" ? args.action : undefined,
        outcome: typeof args.outcome === "string" ? args.outcome : undefined,
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
        minWikiOccurrences: Number.isFinite(minWikiOccurrences) ? minWikiOccurrences : undefined,
        minSkillOccurrences: Number.isFinite(minSkillOccurrences) ? minSkillOccurrences : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "lint": {
      const result = await lintLocalPack({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
      });
      writeResult(result, true);
      return;
    }
    case "wrap": {
      const subcommand = positional;
      const wrapInput = {
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skill: typeof args.skill === "string" ? args.skill : undefined,
        prompt: typeof args.prompt === "string" ? args.prompt : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        tags: toStringArray(args.tag),
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
        postRunMode: typeof args["post-run-mode"] === "string"
          ? args["post-run-mode"] as "off" | "record" | "auto" | "promote"
          : undefined,
        minWikiOccurrences: parsePositiveInt(args["min-wiki-occurrences"]),
        minSkillOccurrences: parsePositiveInt(args["min-skill-occurrences"]),
      };

      if (subcommand === "prompt") {
        const result = await runGenericWrapper(wrapInput);
        if (asJson) {
          writeResult(result, true);
          return;
        }
        process.stdout.write(`${result.envelope.wrappedPrompt}\n`);
        return;
      }

      if (subcommand === "command") {
        if (rest.length === 0) {
          throw new Error("wrap command requires a command after --");
        }
        const [childCommand, ...childArgs] = rest;
        const result = await runGenericWrapper({
          ...wrapInput,
          command: childCommand,
          args: childArgs,
        });
        if (asJson) {
          writeResult(result, true);
          process.exit(result.child?.exitCode ?? 0);
        }
        if (result.child?.stdout) {
          process.stdout.write(result.child.stdout);
        }
        if (result.child?.stderr) {
          process.stderr.write(result.child.stderr);
        }
        writePostRunSummary("datalox-wrap", result.postRun);
        process.exit(result.child?.exitCode ?? 0);
      }

      throw new Error("wrap requires subcommand prompt or command");
    }
    case "codex": {
      const codexArgs = positional !== undefined ? [positional, ...rest] : rest;
      const result = await runCodexWrapper({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skill: typeof args.skill === "string" ? args.skill : undefined,
        prompt: typeof args.prompt === "string" ? args.prompt : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        tags: toStringArray(args.tag),
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
        postRunMode: typeof args["post-run-mode"] === "string"
          ? args["post-run-mode"] as "off" | "record" | "auto" | "promote"
          : undefined,
        minWikiOccurrences: parsePositiveInt(args["min-wiki-occurrences"]),
        minSkillOccurrences: parsePositiveInt(args["min-skill-occurrences"]),
        codexBin: typeof args["codex-bin"] === "string" ? args["codex-bin"] : undefined,
        codexArgs,
      });
      if (asJson) {
        writeResult(result, true);
        process.exit(result.child.exitCode);
      }
      if (result.child.stdout) {
        process.stdout.write(result.child.stdout);
      }
      if (result.child.stderr) {
        process.stderr.write(result.child.stderr);
      }
      writePostRunSummary("datalox-codex", result.postRun);
      process.exit(result.child.exitCode);
    }
    case "claude": {
      const claudeArgs = positional !== undefined ? [positional, ...rest] : rest;
      const result = await runClaudeWrapper({
        repoPath: typeof args.repo === "string" ? args.repo : undefined,
        task: typeof args.task === "string" ? args.task : undefined,
        workflow: typeof args.workflow === "string" ? args.workflow : undefined,
        step: typeof args.step === "string" ? args.step : undefined,
        skill: typeof args.skill === "string" ? args.skill : undefined,
        prompt: typeof args.prompt === "string" ? args.prompt : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        tags: toStringArray(args.tag),
        eventKind: typeof args["event-kind"] === "string" ? args["event-kind"] : undefined,
        postRunMode: typeof args["post-run-mode"] === "string"
          ? args["post-run-mode"] as "off" | "record" | "auto" | "promote"
          : undefined,
        minWikiOccurrences: parsePositiveInt(args["min-wiki-occurrences"]),
        minSkillOccurrences: parsePositiveInt(args["min-skill-occurrences"]),
        claudeBin: typeof args["claude-bin"] === "string" ? args["claude-bin"] : undefined,
        claudeArgs,
      });
      if (asJson) {
        writeResult(result, true);
        process.exit(result.child.exitCode);
      }
      if (result.child.stdout) {
        process.stdout.write(result.child.stdout);
      }
      if (result.child.stderr) {
        process.stderr.write(result.child.stderr);
      }
      writePostRunSummary("datalox-claude", result.postRun);
      process.exit(result.child.exitCode);
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
