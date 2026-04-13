#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    const hasValue = next !== undefined && !next.startsWith("--");
    parsed[key] = hasValue ? next : true;
    if (hasValue) {
      index += 1;
    }
  }

  return parsed;
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(value) {
  if (!value || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function truncate(value, maxLength = 240) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function firstTextContent(message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }

  const texts = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean);

  return texts.length > 0 ? texts.join("\n") : null;
}

function parseTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return {
      task: null,
      summary: null,
      transcript: null,
    };
  }

  const raw = readFileSync(transcriptPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = raw.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const lastUser = [...entries]
    .reverse()
    .find((entry) => entry.type === "user" && firstTextContent(entry));
  const lastAssistant = [...entries]
    .reverse()
    .find((entry) =>
      entry.type === "assistant"
      && firstTextContent(entry)
      && entry.isApiErrorMessage !== true
    );

  const task = firstTextContent(lastUser);
  const summary = firstTextContent(lastAssistant);
  const transcript = [
    task ? `User: ${task}` : null,
    summary ? `Assistant: ${summary}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    task: task ? truncate(task, 400) : null,
    summary: summary ? truncate(summary, 400) : null,
    transcript: transcript || null,
  };
}

function parseGitChangedPaths(repoPath) {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: repoPath,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((line) => line.includes(" -> ") ? line.split(" -> ").at(-1) : line);
}

function resolvePackRoot(args) {
  const candidates = [
    typeof args["pack-root"] === "string" ? args["pack-root"] : null,
    process.env.DATALOX_PACK_ROOT,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    path.join(os.homedir(), ".datalox", "cache", "datalox-pack"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (existsSync(path.join(normalized, "scripts", "lib", "agent-pack.mjs"))) {
      return normalized;
    }
  }

  throw new Error("Unable to resolve Datalox pack root for auto-promote hook");
}

function resolveRepoPath(args, payload) {
  const candidate = typeof args.repo === "string"
    ? args.repo
    : payload?.cwd
      ?? payload?.repo_path
      ?? payload?.project_path
      ?? payload?.workspace_path
      ?? process.env.CLAUDE_PROJECT_DIR
      ?? process.cwd();
  return path.resolve(candidate);
}

function buildObservations(changedPaths, payload) {
  const observations = [];
  if (changedPaths.length > 0) {
    observations.push(`Changed files: ${changedPaths.slice(0, 8).join(", ")}`);
  }
  if (payload?.hook_event_name) {
    observations.push(`Hook event: ${payload.hook_event_name}`);
  }
  if (payload?.stop_hook_active === true) {
    observations.push("Stop hook resumed the agent previously.");
  }
  return observations;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = parseJson(await readStdin()) ?? {};

  if (payload?.stop_hook_active === true) {
    return;
  }

  const repoPath = resolveRepoPath(args, payload);
  const configPath = path.join(repoPath, ".datalox", "config.json");
  if (!existsSync(configPath)) {
    return;
  }

  const packRoot = resolvePackRoot(args);
  const transcriptPath = typeof args["transcript-path"] === "string"
    ? args["transcript-path"]
    : payload?.transcript_path ?? payload?.transcriptPath;
  const transcript = parseTranscript(transcriptPath ? path.resolve(transcriptPath) : null);
  const changedPaths = parseGitChangedPaths(repoPath);
  const observations = buildObservations(changedPaths, payload);
  const task = typeof args.task === "string" ? args.task : transcript.task;
  const summary = typeof args.summary === "string" ? args.summary : transcript.summary;
  const interpretation = typeof args.interpretation === "string"
    ? args.interpretation
    : `Automatic post-turn promotion from ${payload?.hook_event_name ?? "host-hook"}.`;
  const recommendedAction = typeof args.action === "string"
    ? args.action
    : "Promote only if this gap repeats enough to justify a wiki page or skill.";

  if (!task && !summary && observations.length === 0) {
    return;
  }

  const moduleUrl = pathToFileURL(path.join(packRoot, "scripts", "lib", "agent-pack.mjs")).href;
  const { promoteGap } = await import(moduleUrl);
  const result = await promoteGap(
    {
      task: task ?? summary ?? "auto-promote-hook",
      workflow: typeof args.workflow === "string"
        ? args.workflow
        : typeof payload?.workflow === "string"
          ? payload.workflow
          : process.env.DATALOX_DEFAULT_WORKFLOW,
      step: typeof args.step === "string" ? args.step : undefined,
      summary: summary ?? undefined,
      observations,
      transcript: transcript.transcript ?? undefined,
      tags: ["auto_hook"],
      title: typeof args.title === "string" ? args.title : undefined,
      signal: typeof args.signal === "string" ? args.signal : undefined,
      interpretation,
      recommendedAction,
      eventKind: typeof args["event-kind"] === "string"
        ? args["event-kind"]
        : payload?.hook_event_name
          ? `hook:${payload.hook_event_name}`
          : "hook:auto-promote",
      minWikiOccurrences: typeof args["min-wiki-occurrences"] === "string"
        ? Number.parseInt(args["min-wiki-occurrences"], 10)
        : Number.parseInt(process.env.DATALOX_AUTO_PROMOTE_MIN_WIKI ?? "3", 10),
      minSkillOccurrences: typeof args["min-skill-occurrences"] === "string"
        ? Number.parseInt(args["min-skill-occurrences"], 10)
        : Number.parseInt(process.env.DATALOX_AUTO_PROMOTE_MIN_SKILL ?? "5", 10),
    },
    repoPath,
  );

  process.stderr.write(
    `[datalox-auto-promote] ${result.decision.action} | ${result.decision.reason} | occurrences=${result.decision.occurrenceCount}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`[datalox-auto-promote] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
