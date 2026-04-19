import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  autoBootstrapIfSafe,
  compileRecordedEvent,
  patchKnowledge,
  recordLoopApplication,
  recordTurnResult,
  resolveLoop,
  type AutoBootstrapResult,
  type RecordTurnResultInput,
  type ResolveLoopInput,
} from "../core/packCore.js";
import { resolveSourceRoute } from "./sourceRoutes.js";

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
  postRunMode?: "off" | "record" | "auto" | "promote" | "review";
  minWikiOccurrences?: number;
  minSkillOccurrences?: number;
  sessionId?: string;
  reviewModel?: string;
}

export interface WrapperReviewDecision {
  action: "noop" | "persist";
  reason: string;
  summary?: string;
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
  observations: string[];
  tags: string[];
}

export interface WrapperReviewResult {
  status: "skipped" | "completed" | "failed";
  model: string | null;
  decision: WrapperReviewDecision | null;
  persisted: Awaited<ReturnType<typeof patchKnowledge>> | null;
  error?: string;
}

export interface WrapperPostRunResult {
  mode: "off" | "record" | "promote" | "review";
  trigger: "disabled" | "record_only" | "explicit_signal" | "failure_exit";
  result: Awaited<ReturnType<typeof recordTurnResult>> | Awaited<ReturnType<typeof compileRecordedEvent>> | null;
  review: WrapperReviewResult | null;
}

export interface WrappedLoopResult {
  envelope: LoopEnvelope;
  child: WrappedCommandResult | null;
  postRun: WrapperPostRunResult | null;
}

export interface ObservedTurnInput {
  hostKind: string;
  eventClass?: "trace" | "candidate";
  task?: string;
  workflow?: string;
  step?: string;
  skillId?: string | null;
  summary?: string;
  observations?: string[];
  transcript?: string;
  changedFiles?: string[];
  matchedNotePaths?: string[];
  tags?: string[];
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
  eventKind?: string;
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

export interface WrapperReviewRunner {
  kind: string;
  model: string | null;
  run(prompt: string, envelope: LoopEnvelope): WrappedCommandResult;
}

const CONTROL_TEXT_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const STORED_TRANSCRIPT_LIMITS = {
  wrappedPrompt: 6000,
  command: 3000,
  stdout: 12000,
  stderr: 12000,
} as const;
const REVIEW_TRANSCRIPT_LIMITS = {
  wrappedPrompt: 4000,
  command: 2000,
  stdout: 6000,
  stderr: 6000,
} as const;

function sanitizeWrappedText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(CONTROL_TEXT_PATTERN, "");
}

export function stripDataloxMarkers(text: string): string {
  return extractMarkers(sanitizeWrappedText(text)).cleanedText;
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
  const originalPrompt = toPrompt(input);
  const bootstrap = await autoBootstrapIfSafe({ repoPath });
  const sourceRoute = bootstrap.probeAfter.status === "ready"
    && !input.skill
    && originalPrompt.trim().length > 0
    ? await resolveSourceRoute({
      repoPath,
      prompt: originalPrompt,
    })
    : null;
  const resolution = bootstrap.probeAfter.status === "ready"
    && !sourceRoute
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
  const guidance = sourceRoute?.guidance ?? summarizeResolution(resolution, input.workflow);
  const baseEnvelope = {
    repoPath,
    sessionId: input.sessionId ?? null,
    active: sourceRoute !== null || resolution !== null,
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
  const stdoutMarkers = extractMarkers(sanitizeWrappedText(result.stdout));
  const stderrMarkers = extractMarkers(sanitizeWrappedText(result.stderr));
  return {
    child: {
      ...result,
      stdout: stdoutMarkers.cleanedText,
      stderr: stderrMarkers.cleanedText,
    },
    markers: mergeMarkers(stdoutMarkers, stderrMarkers),
  };
}

function truncateTranscriptSection(text: string, maxChars?: number): string {
  const sanitized = sanitizeWrappedText(text).trim();
  if (!sanitized) {
    return "(empty)";
  }
  if (!maxChars || sanitized.length <= maxChars) {
    return sanitized;
  }
  const remaining = sanitized.length - maxChars;
  return `${sanitized.slice(0, maxChars).trimEnd()}\n[truncated ${remaining} chars]`;
}

function buildTranscript(
  envelope: LoopEnvelope,
  child: WrappedCommandResult | null,
  options: {
    wrappedPrompt?: number;
    command?: number;
    stdout?: number;
    stderr?: number;
  } = {},
): string | undefined {
  if (!child) {
    const wrappedPrompt = truncateTranscriptSection(envelope.wrappedPrompt, options.wrappedPrompt);
    return wrappedPrompt === "(empty)" ? undefined : wrappedPrompt;
  }

  const parts = [
    "# Wrapped Prompt",
    truncateTranscriptSection(envelope.wrappedPrompt, options.wrappedPrompt),
    "",
    "# Child Command",
    truncateTranscriptSection([child.command, ...child.args].join(" "), options.command),
    "",
    "# Exit Code",
    String(child.exitCode),
    "",
    "# Stdout",
    truncateTranscriptSection(child.stdout, options.stdout),
    "",
    "# Stderr",
    truncateTranscriptSection(child.stderr, options.stderr),
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

function collectChangedFiles(repoPath: string): string[] {
  const status = spawnSync("git", ["status", "--short"], {
    cwd: repoPath,
    encoding: "utf8",
  });
  if (status.status !== 0) {
    return [];
  }

  return status.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .slice(0, 25);
}

export function buildObservedTurnPayload(
  envelope: Pick<LoopEnvelope, "repoPath" | "sessionId" | "guidance" | "originalPrompt">,
  input: ObservedTurnInput,
): RecordTurnResultInput {
  const transcript = typeof input.transcript === "string"
    ? truncateTranscriptSection(input.transcript, STORED_TRANSCRIPT_LIMITS.stdout)
    : undefined;
  const changedFiles = Array.isArray(input.changedFiles)
    ? input.changedFiles.filter(Boolean).slice(0, 25)
    : [];
  const matchedNotePaths = Array.isArray(input.matchedNotePaths) && input.matchedNotePaths.length > 0
    ? input.matchedNotePaths.filter(Boolean)
    : envelope.guidance.supportingNotes.map((note) => note.path);

  return {
    repoPath: envelope.repoPath,
    eventClass: input.eventClass,
    task: input.task ?? (envelope.originalPrompt || undefined),
    workflow: input.workflow ?? envelope.guidance.workflow,
    step: input.step,
    skillId: input.skillId ?? envelope.guidance.matchedSkillId ?? undefined,
    summary: input.summary ?? firstNonEmptyLine(transcript ?? ""),
    observations: Array.isArray(input.observations) ? [...input.observations] : [],
    transcript,
    changedFiles,
    matchedNotePaths,
    tags: Array.isArray(input.tags) ? [...input.tags] : [],
    title: input.title,
    signal: input.signal,
    interpretation: input.interpretation,
    recommendedAction: input.recommendedAction,
    eventKind: input.eventKind,
    sessionId: envelope.sessionId ?? undefined,
    hostKind: input.hostKind,
  };
}

export async function recordObservedTurnPayload(
  envelope: Pick<LoopEnvelope, "repoPath" | "guidance">,
  payloadBase: RecordTurnResultInput,
  options: {
    applyMatchedNotes?: boolean;
  } = {},
) {
  const recorded = await recordTurnResult(payloadBase);
  const matchedNotePaths = Array.isArray(payloadBase.matchedNotePaths)
    ? payloadBase.matchedNotePaths.filter(Boolean)
    : [];

  if (options.applyMatchedNotes && matchedNotePaths.length > 0) {
    await recordLoopApplication({
      repoPath: envelope.repoPath,
      notePaths: matchedNotePaths,
    });
  }

  return recorded;
}

function renderReviewNotes(notes: LoopEnvelope["guidance"]["supportingNotes"]): string {
  if (notes.length === 0) {
    return "- none";
  }

  return notes.map((note) => {
    const parts = [`- ${note.title} (${note.path})`];
    if (note.action) {
      parts.push(`  action: ${note.action}`);
    }
    if (note.signal) {
      parts.push(`  signal: ${note.signal}`);
    }
    return parts.join("\n");
  }).join("\n");
}

function buildReviewPrompt(
  envelope: LoopEnvelope,
  child: WrappedCommandResult,
  payloadBase: RecordTurnResultInput,
  changedFiles: string[],
): string {
  const transcript = buildTranscript(envelope, child, REVIEW_TRANSCRIPT_LIMITS) ?? "(empty)";
  const observations = payloadBase.observations?.length
    ? payloadBase.observations.map((item) => `- ${item}`).join("\n")
    : "- none";
  const tags = payloadBase.tags?.length
    ? payloadBase.tags.map((item) => `- ${item}`).join("\n")
    : "- none";
  const changed = changedFiles.length > 0
    ? changedFiles.map((item) => `- ${item}`).join("\n")
    : "- none";

  return [
    "# Datalox Post-Run Review",
    "You are a second-pass reviewer deciding whether this wrapped run produced reusable repo-local knowledge.",
    "Persist only when the run revealed a grounded, reusable workflow, correction, or pitfall that future agents should follow.",
    "Return action=\"noop\" for one-off work, generic success/failure logging, or guidance already covered by the matched skill/notes.",
    "Prefer caution. Bad saves are worse than missed saves.",
    "",
    "Return JSON only. No markdown fences.",
    "",
    "{",
    "  \"action\": \"noop\" | \"persist\",",
    "  \"reason\": \"short reason\",",
    "  \"summary\": \"required when action=persist\",",
    "  \"title\": \"required when action=persist\",",
    "  \"signal\": \"required when action=persist\",",
    "  \"interpretation\": \"required when action=persist\",",
    "  \"recommendedAction\": \"required when action=persist\",",
    "  \"observations\": [\"optional concrete observations\"],",
    "  \"tags\": [\"optional tags\"]",
    "}",
    "",
    "## Current Loop Context",
    `Task: ${payloadBase.task ?? "(missing)"}`,
    `Workflow: ${payloadBase.workflow ?? "(missing)"}`,
    `Matched skill: ${payloadBase.skillId ?? "none"}`,
    `Trigger: ${child.exitCode === 0 ? "success" : "failure"}`,
    `Exit code: ${child.exitCode}`,
    `Selection basis: ${envelope.guidance.selectionBasis}`,
    "",
    "## Existing Guidance",
    `What to do now: ${envelope.guidance.whatToDoNow.join(" | ") || "none"}`,
    `Watch for: ${envelope.guidance.watchFor.join(" | ") || "none"}`,
    "Supporting notes:",
    renderReviewNotes(envelope.guidance.supportingNotes),
    "",
    "## Grounded Evidence",
    "Observations:",
    observations,
    "Tags:",
    tags,
    "Changed files:",
    changed,
    "",
    "## Wrapped Transcript",
    transcript,
  ].join("\n");
}

function tryParseJsonBlock(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Reviewer returned empty output.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error("Reviewer output did not contain a JSON object.");
}

function maybeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function maybeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseReviewDecision(raw: unknown): WrapperReviewDecision {
  if (!raw || typeof raw !== "object") {
    throw new Error("Reviewer JSON must be an object.");
  }

  const action = (raw as { action?: unknown }).action;
  if (action !== "noop" && action !== "persist") {
    throw new Error("Reviewer action must be 'noop' or 'persist'.");
  }

  const reason = maybeNonEmptyString((raw as { reason?: unknown }).reason);
  if (!reason) {
    throw new Error("Reviewer reason is required.");
  }

  const decision: WrapperReviewDecision = {
    action,
    reason,
    summary: maybeNonEmptyString((raw as { summary?: unknown }).summary),
    title: maybeNonEmptyString((raw as { title?: unknown }).title),
    signal: maybeNonEmptyString((raw as { signal?: unknown }).signal),
    interpretation: maybeNonEmptyString((raw as { interpretation?: unknown }).interpretation),
    recommendedAction: maybeNonEmptyString((raw as { recommendedAction?: unknown }).recommendedAction),
    observations: maybeStringArray((raw as { observations?: unknown }).observations),
    tags: maybeStringArray((raw as { tags?: unknown }).tags),
  };

  if (decision.action === "persist") {
    if (!decision.summary || !decision.title || !decision.signal || !decision.interpretation || !decision.recommendedAction) {
      throw new Error("Persist decisions must include summary, title, signal, interpretation, and recommendedAction.");
    }
  }

  return decision;
}

async function runSecondPassReview(
  envelope: LoopEnvelope,
  child: WrappedCommandResult,
  payloadBase: RecordTurnResultInput,
  reviewer: WrapperReviewRunner | null | undefined,
  changedFiles: string[],
): Promise<WrapperReviewResult> {
  if (!reviewer) {
    return {
      status: "skipped",
      model: null,
      decision: null,
      persisted: null,
      error: "No autonomous reviewer is configured for this wrapper path.",
    };
  }

  try {
    const prompt = buildReviewPrompt(envelope, child, payloadBase, changedFiles);
    const reviewRun = reviewer.run(prompt, envelope);
    if (reviewRun.exitCode !== 0) {
      return {
        status: "failed",
        model: reviewer.model,
        decision: null,
        persisted: null,
        error: reviewRun.stderr.trim() || `Reviewer exited with code ${reviewRun.exitCode}.`,
      };
    }

    const decision = parseReviewDecision(tryParseJsonBlock(reviewRun.stdout));
    const persisted = decision.action === "persist"
      ? await patchKnowledge({
        repoPath: envelope.repoPath,
        task: payloadBase.task,
        workflow: payloadBase.workflow,
        step: payloadBase.step,
        skillId: payloadBase.skillId,
        summary: decision.summary,
        observations: decision.observations,
        transcript: payloadBase.transcript,
        tags: [...(payloadBase.tags ?? []), ...decision.tags],
        title: decision.title,
        signal: decision.signal,
        interpretation: decision.interpretation,
        recommendedAction: decision.recommendedAction,
      })
      : null;

    return {
      status: "completed",
      model: reviewer.model,
      decision,
      persisted,
    };
  } catch (error) {
    return {
      status: "failed",
      model: reviewer.model,
      decision: null,
      persisted: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function finalizeWrappedRun(
  envelope: LoopEnvelope,
  child: WrappedCommandResult | null,
  input: WrapperPostRunInput & { hostKind: string; reviewer?: WrapperReviewRunner | null },
): Promise<WrapperPostRunResult> {
  const postRunMode = input.postRunMode ?? "auto";
  if (!child || !envelope.active) {
    return {
      mode: "off",
      trigger: "disabled",
      result: null,
      review: null,
    };
  }

  const sanitized = sanitizeWrappedCommandResult(child);
  const markers = sanitized.markers;
  const changedFiles = collectChangedFiles(envelope.repoPath);
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
  const eventClass = hasExplicitPromotionSignal(markers) ? "candidate" : "trace";

  const payloadBase = buildObservedTurnPayload(envelope, {
    hostKind: input.hostKind,
    eventClass,
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
    transcript: buildTranscript(envelope, sanitized.child, STORED_TRANSCRIPT_LIMITS),
    changedFiles,
    tags: [
      ...(input.tags ?? []),
      ...markers.tags,
      `wrapper:${input.hostKind}`,
      sanitized.child.exitCode === 0 ? "success" : "failure",
    ],
    title: markers.title,
    signal: markers.signal,
    interpretation: markers.interpretation,
    recommendedAction: markers.recommendedAction,
    eventKind: input.eventKind ?? markers.eventKind ?? `wrapper:${input.hostKind}:${sanitized.child.exitCode === 0 ? "success" : "failure"}`,
  });

  const recorded = await recordObservedTurnPayload(envelope, payloadBase, {
    applyMatchedNotes: sanitized.child.exitCode === 0,
  });

  if (postRunMode === "review" && !input.reviewer) {
    throw new Error(`Autonomous review is not configured for the ${input.hostKind} wrapper path.`);
  }

  if (postRunMode === "review") {
    return {
      mode: "review",
      trigger,
      result: recorded,
      review: await runSecondPassReview(
        envelope,
        sanitized.child,
        payloadBase,
        input.reviewer,
        changedFiles,
      ),
    };
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
    review: null,
  };
}
