import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  promoteGap,
  recordTurnResult,
  resolveLoop,
  type PromoteGapInput,
  type RecordTurnResultInput,
  type ResolveLoopInput,
} from "../core/packCore.js";

export interface LoopEnvelopeInput extends ResolveLoopInput {
  prompt?: string;
}

export interface LoopEnvelope {
  repoPath: string;
  originalPrompt: string;
  wrappedPrompt: string;
  resolution: Awaited<ReturnType<typeof resolveLoop>>;
  guidance: {
    workflow: string;
    selectionBasis: string;
    matchedSkillId: string | null;
    whyMatched: string[];
    whatToDoNow: string[];
    watchFor: string[];
    nextReads: string[];
    supportingPatterns: Array<{
      path: string;
      title: string;
    }>;
  };
}

export interface WrappedCommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WrapperPostRunInput {
  task?: string;
  workflow?: string;
  step?: string;
  skillId?: string;
  summary?: string;
  tags?: string[];
  eventKind?: string;
  postRunMode?: "off" | "record" | "auto" | "promote";
  minWikiOccurrences?: number;
  minSkillOccurrences?: number;
}

export interface WrapperPostRunResult {
  mode: "off" | "record" | "promote";
  trigger: "disabled" | "record_only" | "explicit_signal" | "failure_exit";
  result: Awaited<ReturnType<typeof recordTurnResult>> | Awaited<ReturnType<typeof promoteGap>> | null;
}

export interface WrappedLoopResult {
  envelope: LoopEnvelope;
  child: WrappedCommandResult | null;
  postRun: WrapperPostRunResult | null;
}

interface ParsedMarkers {
  cleanedText: string;
  summary?: string;
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
  eventKind?: string;
  observations: string[];
  tags: string[];
}

function toPrompt(input: LoopEnvelopeInput): string {
  if (typeof input.prompt === "string" && input.prompt.trim().length > 0) {
    return input.prompt;
  }
  if (typeof input.task === "string" && input.task.trim().length > 0) {
    return input.task;
  }
  return "";
}

function summarizeResolution(
  resolution: Awaited<ReturnType<typeof resolveLoop>>,
): LoopEnvelope["guidance"] {
  const topMatch = resolution.matches[0];
  return {
    workflow: resolution.workflow,
    selectionBasis: resolution.selectionBasis,
    matchedSkillId: topMatch?.skill.id ?? null,
    whyMatched: topMatch?.loopGuidance.whyMatched ?? [],
    whatToDoNow: topMatch?.loopGuidance.whatToDoNow ?? [],
    watchFor: topMatch?.loopGuidance.watchFor ?? [],
    nextReads: topMatch?.loopGuidance.nextReads ?? [],
    supportingPatterns: (topMatch?.loopGuidance.supportingPatterns ?? []).map((pattern: {
      path: string;
      title: string;
    }) => ({
      path: pattern.path,
      title: pattern.title,
    })),
  };
}

function renderBulletSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }
  return [
    `${title}:`,
    ...lines.map((line) => `- ${line}`),
    "",
  ];
}

export function renderWrappedPrompt(envelope: LoopEnvelope): string {
  const guidanceLines = [
    "# Datalox Loop Guidance",
    `Selection basis: ${envelope.guidance.selectionBasis}`,
    `Workflow: ${envelope.guidance.workflow}`,
    `Matched skill: ${envelope.guidance.matchedSkillId ?? "none"}`,
    "",
    ...renderBulletSection("Why matched", envelope.guidance.whyMatched),
    ...renderBulletSection("What to do now", envelope.guidance.whatToDoNow),
    ...renderBulletSection("Watch for", envelope.guidance.watchFor),
    ...renderBulletSection(
      "Supporting pages",
      envelope.guidance.supportingPatterns.map((pattern) => `${pattern.title} | ${pattern.path}`),
    ),
    ...renderBulletSection("Next reads", envelope.guidance.nextReads),
    "# Original Prompt",
    envelope.originalPrompt,
  ];

  return guidanceLines.join("\n").trim();
}

export async function buildLoopEnvelope(input: LoopEnvelopeInput): Promise<LoopEnvelope> {
  const repoPath = path.resolve(input.repoPath ?? process.cwd());
  const resolution = await resolveLoop({
    repoPath,
    task: input.task,
    workflow: input.workflow,
    step: input.step,
    skill: input.skill,
    limit: input.limit,
    includeContent: input.includeContent,
  });
  const originalPrompt = toPrompt(input);
  const guidance = summarizeResolution(resolution);
  const baseEnvelope = {
    repoPath,
    originalPrompt,
    resolution,
    guidance,
    wrappedPrompt: "",
  };

  return {
    ...baseEnvelope,
    wrappedPrompt: renderWrappedPrompt(baseEnvelope),
  };
}

export function buildWrapperEnv(envelope: LoopEnvelope): NodeJS.ProcessEnv {
  return {
    DATALOX_REPO_PATH: envelope.repoPath,
    DATALOX_ORIGINAL_PROMPT: envelope.originalPrompt,
    DATALOX_PROMPT: envelope.wrappedPrompt,
    DATALOX_GUIDANCE_JSON: JSON.stringify(envelope.guidance),
    DATALOX_SELECTION_BASIS: envelope.guidance.selectionBasis,
    DATALOX_WORKFLOW: envelope.guidance.workflow,
    DATALOX_MATCHED_SKILL: envelope.guidance.matchedSkillId ?? "",
  };
}

export function replacePromptPlaceholders(input: string, envelope: LoopEnvelope): string {
  return input
    .replaceAll("__DATALOX_PROMPT__", envelope.wrappedPrompt)
    .replaceAll("__DATALOX_ORIGINAL_PROMPT__", envelope.originalPrompt)
    .replaceAll("__DATALOX_GUIDANCE_JSON__", JSON.stringify(envelope.guidance))
    .replaceAll("__DATALOX_REPO_PATH__", envelope.repoPath)
    .replaceAll("__DATALOX_MATCHED_SKILL__", envelope.guidance.matchedSkillId ?? "")
    .replaceAll("__DATALOX_WORKFLOW__", envelope.guidance.workflow);
}

export function runWrappedCommand(
  command: string,
  args: string[],
  envelope: LoopEnvelope,
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): WrappedCommandResult {
  const result = spawnSync(
    command,
    args.map((arg) => replacePromptPlaceholders(arg, envelope)),
    {
      cwd: options.cwd ?? envelope.repoPath,
      env: {
        ...process.env,
        ...buildWrapperEnv(envelope),
        ...options.env,
      },
      encoding: "utf8",
    },
  );

  return {
    command,
    args: args.map((arg) => replacePromptPlaceholders(arg, envelope)),
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function firstNonEmpty(lines: Array<string | undefined | null>): string | undefined {
  for (const value of lines) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  return firstNonEmpty(text.split(/\r?\n/));
}

function parseMarkerLine(line: string, parsed: ParsedMarkers): boolean {
  const match = line.match(/^DATALOX_([A-Z_]+):\s*(.+)$/);
  if (!match) {
    return false;
  }
  const [, rawKey, rawValue] = match;
  const value = rawValue.trim();
  switch (rawKey) {
    case "SUMMARY":
      parsed.summary = value;
      return true;
    case "TITLE":
      parsed.title = value;
      return true;
    case "SIGNAL":
      parsed.signal = value;
      return true;
    case "INTERPRETATION":
      parsed.interpretation = value;
      return true;
    case "ACTION":
    case "RECOMMENDED_ACTION":
      parsed.recommendedAction = value;
      return true;
    case "EVENT_KIND":
      parsed.eventKind = value;
      return true;
    case "OBSERVATION":
      parsed.observations.push(value);
      return true;
    case "TAG":
      parsed.tags.push(value);
      return true;
    default:
      return false;
  }
}

function extractMarkers(text: string): ParsedMarkers {
  const parsed: ParsedMarkers = {
    cleanedText: "",
    observations: [],
    tags: [],
  };
  const keptLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!parseMarkerLine(line, parsed)) {
      keptLines.push(line);
    }
  }
  parsed.cleanedText = keptLines.join("\n").trim();
  return parsed;
}

function mergeMarkers(left: ParsedMarkers, right: ParsedMarkers): ParsedMarkers {
  return {
    cleanedText: "",
    summary: left.summary ?? right.summary,
    title: left.title ?? right.title,
    signal: left.signal ?? right.signal,
    interpretation: left.interpretation ?? right.interpretation,
    recommendedAction: left.recommendedAction ?? right.recommendedAction,
    eventKind: left.eventKind ?? right.eventKind,
    observations: [...left.observations, ...right.observations],
    tags: [...left.tags, ...right.tags],
  };
}

export function sanitizeWrappedCommandResult(result: WrappedCommandResult): {
  child: WrappedCommandResult;
  markers: ParsedMarkers;
} {
  const stdoutMarkers = extractMarkers(result.stdout);
  const stderrMarkers = extractMarkers(result.stderr);
  return {
    child: {
      ...result,
      stdout: stdoutMarkers.cleanedText,
      stderr: stderrMarkers.cleanedText,
    },
    markers: mergeMarkers(stdoutMarkers, stderrMarkers),
  };
}

function buildTranscript(envelope: LoopEnvelope, child: WrappedCommandResult | null): string | undefined {
  if (!child) {
    return envelope.wrappedPrompt || undefined;
  }

  const parts = [
    "# Wrapped Prompt",
    envelope.wrappedPrompt,
    "",
    "# Child Command",
    [child.command, ...child.args].join(" "),
    "",
    "# Exit Code",
    String(child.exitCode),
    "",
    "# Stdout",
    child.stdout || "(empty)",
    "",
    "# Stderr",
    child.stderr || "(empty)",
  ];
  return parts.join("\n").trim();
}

function buildFailureObservation(child: WrappedCommandResult): string | undefined {
  const firstLine = firstNonEmpty([
    firstNonEmptyLine(child.stderr),
    firstNonEmptyLine(child.stdout),
  ]);
  if (!firstLine) {
    return `Wrapped host command exited with code ${child.exitCode}.`;
  }
  return `Wrapped host command exited with code ${child.exitCode}: ${firstLine}`;
}

function hasExplicitPromotionSignal(markers: ParsedMarkers): boolean {
  return Boolean(
    markers.title
      || markers.signal
      || markers.interpretation
      || markers.recommendedAction
      || markers.eventKind
      || markers.observations.length > 0,
  );
}

export async function finalizeWrappedRun(
  envelope: LoopEnvelope,
  child: WrappedCommandResult | null,
  input: WrapperPostRunInput & { hostKind: string },
): Promise<WrapperPostRunResult> {
  const postRunMode = input.postRunMode ?? "auto";
  if (postRunMode === "off" || !child) {
    return {
      mode: "off",
      trigger: "disabled",
      result: null,
    };
  }

  const sanitized = sanitizeWrappedCommandResult(child);
  const markers = sanitized.markers;
  const trigger = hasExplicitPromotionSignal(markers)
    ? "explicit_signal"
    : sanitized.child.exitCode !== 0
      ? "failure_exit"
      : "record_only";

  const observations = markers.observations.length > 0
    ? [...markers.observations]
    : sanitized.child.exitCode !== 0
      ? [buildFailureObservation(sanitized.child)].filter((value): value is string => Boolean(value))
      : [];

  const payloadBase: RecordTurnResultInput & PromoteGapInput = {
    repoPath: envelope.repoPath,
    task: input.task ?? (envelope.originalPrompt || undefined),
    workflow: input.workflow ?? envelope.guidance.workflow,
    step: input.step,
    skillId: input.skillId,
    summary: input.summary
      ?? markers.summary
      ?? firstNonEmpty([
        firstNonEmptyLine(sanitized.child.stderr),
        firstNonEmptyLine(sanitized.child.stdout),
      ]),
    observations,
    transcript: buildTranscript(envelope, sanitized.child),
    tags: [
      ...(input.tags ?? []),
      ...markers.tags,
      `wrapper:${input.hostKind}`,
      sanitized.child.exitCode === 0 ? "success" : "failure",
    ],
    title: markers.title,
    signal: markers.signal,
    interpretation: markers.interpretation ?? (
      sanitized.child.exitCode === 0
        ? "Wrapped host command completed while using Datalox loop guidance."
        : "Wrapped host command failed while using Datalox loop guidance."
    ),
    recommendedAction: markers.recommendedAction ?? (
      sanitized.child.exitCode === 0
        ? "Reuse this wrapper path for the same task if the guidance stays helpful."
        : "Inspect the failure and retry only after the gap is understood."
    ),
    eventKind: input.eventKind ?? markers.eventKind ?? `wrapper:${input.hostKind}:${sanitized.child.exitCode === 0 ? "success" : "failure"}`,
    minWikiOccurrences: input.minWikiOccurrences,
    minSkillOccurrences: input.minSkillOccurrences,
  };

  const shouldPromote = postRunMode === "promote"
    || (postRunMode === "auto" && trigger !== "record_only");

  if (shouldPromote) {
    return {
      mode: "promote",
      trigger,
      result: await promoteGap(payloadBase),
    };
  }

  return {
    mode: "record",
    trigger,
    result: await recordTurnResult(payloadBase),
  };
}
