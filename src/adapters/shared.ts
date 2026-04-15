import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  autoBootstrapIfSafe,
  compileRecordedEvent,
  recordLoopApplication,
  recordTurnResult,
  resolveLoop,
  type AutoBootstrapResult,
  type RecordTurnResultInput,
  type ResolveLoopInput,
} from "../core/packCore.js";

export interface LoopEnvelopeInput extends ResolveLoopInput {
  prompt?: string;
  sessionId?: string;
}

export interface LoopEnvelope {
  repoPath: string;
  sessionId: string | null;
  active: boolean;
  originalPrompt: string;
  wrappedPrompt: string;
  resolution: Awaited<ReturnType<typeof resolveLoop>> | null;
  bootstrap: AutoBootstrapResult;
  guidance: {
    workflow: string;
    selectionBasis: string;
    matchedSkillId: string | null;
    whyMatched: string[];
    whatToDoNow: string[];
    watchFor: string[];
    nextReads: string[];
    supportingNotes: Array<{
      path: string;
      title: string;
      whenToUse: string | null;
      signal: string | null;
      interpretation: string | null;
      action: string | null;
      examples: string[];
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
  sessionId?: string;
}

export interface WrapperPostRunResult {
  mode: "off" | "record" | "promote";
  trigger: "disabled" | "record_only" | "explicit_signal" | "failure_exit";
  result: Awaited<ReturnType<typeof recordTurnResult>> | Awaited<ReturnType<typeof compileRecordedEvent>> | null;
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

export function stripDataloxMarkers(text: string): string {
  return extractMarkers(text).cleanedText;
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
  resolution: Awaited<ReturnType<typeof resolveLoop>> | null,
  workflowHint?: string,
): LoopEnvelope["guidance"] {
  if (!resolution) {
    return {
      workflow: workflowHint ?? "unknown",
      selectionBasis: "bootstrap_unavailable",
      matchedSkillId: null,
      whyMatched: [],
      whatToDoNow: [],
      watchFor: [],
      nextReads: [],
      supportingNotes: [],
    };
  }
  const topMatch = resolution.matches[0];
  const directNotes = Array.isArray((resolution as { directNotes?: Array<{ noteDoc?: unknown }> }).directNotes)
    ? ((resolution as { directNotes?: Array<{ noteDoc?: {
      path: string;
      title: string;
      whenToUse?: string | null;
      signal?: string | null;
      interpretation?: string | null;
      action?: string | null;
      examples?: string[] | null;
    } }> }).directNotes ?? []).map((entry) => entry.noteDoc).filter(Boolean)
    : [];
  const noteDocs = topMatch?.noteDocs ?? directNotes;
  const supportingNotes = noteDocs.map((noteDoc: {
    path: string;
    title: string;
    whenToUse?: string | null;
    signal?: string | null;
    interpretation?: string | null;
    action?: string | null;
    examples?: string[] | null;
  }) => ({
    path: noteDoc.path,
    title: noteDoc.title,
    whenToUse: noteDoc.whenToUse ?? null,
    signal: noteDoc.signal ?? null,
    interpretation: noteDoc.interpretation ?? null,
    action: noteDoc.action ?? null,
    examples: Array.isArray(noteDoc.examples) ? noteDoc.examples.filter(Boolean) : [],
  }));
  const loopGuidance = topMatch?.loopGuidance ?? (resolution as { loopGuidance?: {
    whyMatched?: string[];
    whatToDoNow?: string[];
    watchFor?: string[];
    nextReads?: string[];
  } | null }).loopGuidance ?? null;
  return {
    workflow: resolution.workflow,
    selectionBasis: resolution.selectionBasis,
    matchedSkillId: topMatch?.skill.id ?? null,
    whyMatched: loopGuidance?.whyMatched ?? [],
    whatToDoNow: (loopGuidance?.whatToDoNow?.length ?? 0) > 0
      ? (loopGuidance?.whatToDoNow ?? [])
      : supportingNotes
        .map((note: LoopEnvelope["guidance"]["supportingNotes"][number]) => note.action)
        .filter((value: string | null): value is string => Boolean(value)),
    watchFor: (loopGuidance?.watchFor?.length ?? 0) > 0
      ? (loopGuidance?.watchFor ?? [])
      : supportingNotes
        .map((note: LoopEnvelope["guidance"]["supportingNotes"][number]) => note.signal)
        .filter((value: string | null): value is string => Boolean(value)),
    nextReads: loopGuidance?.nextReads ?? [],
    supportingNotes,
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

function renderSupportingNotes(notes: LoopEnvelope["guidance"]["supportingNotes"]): string[] {
  if (notes.length === 0) {
    return [];
  }

  const rendered: string[] = ["Supporting notes:"];
  for (const note of notes) {
    rendered.push(`- ${note.title} | ${note.path}`);
    if (note.whenToUse) {
      rendered.push(`  When to use: ${note.whenToUse}`);
    }
    if (note.signal) {
      rendered.push(`  Signal: ${note.signal}`);
    }
    if (note.interpretation) {
      rendered.push(`  Interpretation: ${note.interpretation}`);
    }
    if (note.action) {
      rendered.push(`  Action: ${note.action}`);
    }
    if (note.examples.length > 0) {
      rendered.push(`  Example: ${note.examples[0]}`);
    }
  }
  rendered.push("");
  return rendered;
}

export function renderWrappedPrompt(envelope: LoopEnvelope): string {
  if (!envelope.active) {
    return envelope.originalPrompt;
  }
  const guidanceLines = [
    "# Datalox Loop Guidance",
    `Selection basis: ${envelope.guidance.selectionBasis}`,
    `Workflow: ${envelope.guidance.workflow}`,
    `Matched skill: ${envelope.guidance.matchedSkillId ?? "none"}`,
    "",
    ...renderBulletSection("Why matched", envelope.guidance.whyMatched),
    ...renderBulletSection("What to do now", envelope.guidance.whatToDoNow),
    ...renderBulletSection("Watch for", envelope.guidance.watchFor),
    ...renderSupportingNotes(envelope.guidance.supportingNotes),
    ...renderBulletSection("Next reads", envelope.guidance.nextReads),
    "# Datalox Reusable-Gap Protocol",
    "Only if you discover a reusable gap, recurring workflow, or repeated failure worth remembering, append plain text marker lines at the very end of your response:",
    "- DATALOX_SUMMARY: one-line summary of the reusable gap",
    "- DATALOX_TITLE: short title for the future page or skill",
    "- DATALOX_SIGNAL: concrete signal or failure symptom",
    "- DATALOX_INTERPRETATION: why this gap is reusable",
    "- DATALOX_ACTION: what the next agent should do",
    "- DATALOX_OBSERVATION: optional repeated observations (repeatable)",
    "- DATALOX_TAG: optional tags (repeatable)",
    "If there is no reusable gap, do not emit any DATALOX_* lines.",
    "",
    "# Original Prompt",
    envelope.originalPrompt,
  ];

  return guidanceLines.join("\n").trim();
}

export async function buildLoopEnvelope(input: LoopEnvelopeInput): Promise<LoopEnvelope> {
  const repoPath = path.resolve(input.repoPath ?? process.cwd());
  const bootstrap = await autoBootstrapIfSafe({ repoPath });
  const resolution = bootstrap.probeAfter.status === "ready"
    ? await resolveLoop({
      repoPath,
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skill: input.skill,
      limit: input.limit,
      includeContent: input.includeContent,
    })
    : null;
  const originalPrompt = toPrompt(input);
  const guidance = summarizeResolution(resolution, input.workflow);
  const baseEnvelope = {
    repoPath,
    sessionId: input.sessionId ?? null,
    active: resolution !== null,
    originalPrompt,
    resolution,
    bootstrap,
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
    DATALOX_SESSION_ID: envelope.sessionId ?? "",
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
  if (!child || !envelope.active) {
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

  const payloadBase: RecordTurnResultInput = {
    repoPath: envelope.repoPath,
    task: input.task ?? (envelope.originalPrompt || undefined),
    workflow: input.workflow ?? envelope.guidance.workflow,
    step: input.step,
    skillId: input.skillId ?? envelope.guidance.matchedSkillId ?? undefined,
    summary: input.summary
      ?? markers.summary
      ?? firstNonEmpty([
        firstNonEmptyLine(sanitized.child.stderr),
        firstNonEmptyLine(sanitized.child.stdout),
      ]),
    observations,
    transcript: buildTranscript(envelope, sanitized.child),
    matchedNotePaths: envelope.guidance.supportingNotes.map((note) => note.path),
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
    sessionId: envelope.sessionId ?? undefined,
    hostKind: input.hostKind,
  };

  const recorded = await recordTurnResult(payloadBase);

  if (sanitized.child.exitCode === 0 && envelope.guidance.supportingNotes.length > 0) {
    await recordLoopApplication({
      repoPath: envelope.repoPath,
      notePaths: envelope.guidance.supportingNotes.map((note) => note.path),
    });
  }

  const shouldCompile = postRunMode !== "off" && postRunMode !== "record";
  const result = shouldCompile
    ? await compileRecordedEvent({
      repoPath: envelope.repoPath,
      eventPath: recorded.event.relativePath,
      minWikiOccurrences: input.minWikiOccurrences,
      minSkillOccurrences: input.minSkillOccurrences,
    })
    : recorded;

  return {
    mode: shouldCompile ? "promote" : "record",
    trigger,
    result,
  };
}
