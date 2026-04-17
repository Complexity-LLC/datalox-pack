import { z } from "zod";

import {
  adoptPack,
  lintLocalPack,
  patchKnowledge,
  promoteGap,
  promoteNote,
  recordTurnResult,
  resolveLoop,
} from "../core/packCore.js";
import { capturePdfArtifact } from "../core/pdfCapture.js";
import { publishWebCapture } from "../core/publishWebCapture.js";
import { captureDesignFromUrl, captureWebArtifact } from "../core/webCapture.js";

type CliArgsLike = Record<string, string | string[] | boolean> & { _: string[] };

type SharedArgKind = "string" | "boolean" | "string[]" | "int" | "enum";

interface SharedArgOption {
  canonical: string;
  cli?: string;
}

interface SharedArgSpec {
  key: string;
  description: string;
  kind: SharedArgKind;
  cliFlag?: string;
  cliPositionalIndex?: number;
  cliPositionalLabel?: string;
  mcpKey?: string;
  cliRequired?: boolean;
  mcpRequired?: boolean;
  positive?: boolean;
  options?: readonly SharedArgOption[];
}

export interface SharedCommandSpec {
  cliCommand?: string;
  mcpTool: string;
  description: string;
  args: readonly SharedArgSpec[];
  run(input: Record<string, unknown>): Promise<unknown>;
}

const artifactTypeOptions = [
  { canonical: "design_doc", cli: "design-doc" },
  { canonical: "design_tokens", cli: "design-tokens" },
  { canonical: "css_variables", cli: "css-variables" },
  { canonical: "tailwind_theme", cli: "tailwind-theme" },
  { canonical: "note", cli: "note" },
  { canonical: "source_page", cli: "source-page" },
] as const;

const repoPathArg: SharedArgSpec = {
  key: "repoPath",
  description: "Absolute or relative path to the host repo.",
  kind: "string",
  cliFlag: "repo",
  mcpKey: "repo_path",
  mcpRequired: true,
};

const taskArg: SharedArgSpec = {
  key: "task",
  description: "Current task text.",
  kind: "string",
  cliFlag: "task",
  mcpKey: "task",
};

const workflowArg: SharedArgSpec = {
  key: "workflow",
  description: "Workflow identifier.",
  kind: "string",
  cliFlag: "workflow",
  mcpKey: "workflow",
};

const stepArg: SharedArgSpec = {
  key: "step",
  description: "Current workflow step.",
  kind: "string",
  cliFlag: "step",
  mcpKey: "step",
};

const summaryArg: SharedArgSpec = {
  key: "summary",
  description: "Summary of the interaction or gap.",
  kind: "string",
  cliFlag: "summary",
  mcpKey: "summary",
};

const observationsArg: SharedArgSpec = {
  key: "observations",
  description: "Concrete observations from the current interaction.",
  kind: "string[]",
  cliFlag: "observation",
  mcpKey: "observations",
};

const changedFilesArg: SharedArgSpec = {
  key: "changedFiles",
  description: "Changed file paths relevant to the event.",
  kind: "string[]",
  cliFlag: "changed-file",
  mcpKey: "changed_files",
};

const transcriptArg: SharedArgSpec = {
  key: "transcript",
  description: "Optional transcript snippet for evidence.",
  kind: "string",
  cliFlag: "transcript",
  mcpKey: "transcript",
};

const tagsArg: SharedArgSpec = {
  key: "tags",
  description: "Tags attached to the command result.",
  kind: "string[]",
  cliFlag: "tag",
  mcpKey: "tags",
};

const titleArg: SharedArgSpec = {
  key: "title",
  description: "Human-readable title.",
  kind: "string",
  cliFlag: "title",
  mcpKey: "title",
};

const signalArg: SharedArgSpec = {
  key: "signal",
  description: "Recurring signal that triggered the work.",
  kind: "string",
  cliFlag: "signal",
  mcpKey: "signal",
};

const interpretationArg: SharedArgSpec = {
  key: "interpretation",
  description: "Interpretation of the signal.",
  kind: "string",
  cliFlag: "interpretation",
  mcpKey: "interpretation",
};

const recommendedActionArg: SharedArgSpec = {
  key: "recommendedAction",
  description: "Recommended next action.",
  kind: "string",
  cliFlag: "action",
  mcpKey: "recommended_action",
};

const outcomeArg: SharedArgSpec = {
  key: "outcome",
  description: "Observed outcome.",
  kind: "string",
  cliFlag: "outcome",
  mcpKey: "outcome",
};

const eventKindArg: SharedArgSpec = {
  key: "eventKind",
  description: "Event kind for the recorded interaction.",
  kind: "string",
  cliFlag: "event-kind",
  mcpKey: "event_kind",
};

const skillArg: SharedArgSpec = {
  key: "skill",
  description: "Skill identifier to resolve directly.",
  kind: "string",
  cliFlag: "skill",
  mcpKey: "skill",
};

const skillIdArg: SharedArgSpec = {
  key: "skillId",
  description: "Skill identifier for the recorded or promoted interaction.",
  kind: "string",
  cliFlag: "skill",
  mcpKey: "skill_id",
};

const limitArg: SharedArgSpec = {
  key: "limit",
  description: "Maximum number of matches to return.",
  kind: "int",
  cliFlag: "limit",
  mcpKey: "limit",
  positive: true,
};

const includeContentArg: SharedArgSpec = {
  key: "includeContent",
  description: "Include note contents in the resolution output.",
  kind: "boolean",
  cliFlag: "include-content",
  mcpKey: "include_content",
};

const minWikiOccurrencesArg: SharedArgSpec = {
  key: "minWikiOccurrences",
  description: "Override the note promotion threshold.",
  kind: "int",
  cliFlag: "min-wiki-occurrences",
  mcpKey: "min_wiki_occurrences",
  positive: true,
};

const minSkillOccurrencesArg: SharedArgSpec = {
  key: "minSkillOccurrences",
  description: "Override the skill promotion threshold.",
  kind: "int",
  cliFlag: "min-skill-occurrences",
  mcpKey: "min_skill_occurrences",
  positive: true,
};

const packSourceArg: SharedArgSpec = {
  key: "packSource",
  description: "Optional local path or git URL for the source pack.",
  kind: "string",
  cliFlag: "pack-source",
  mcpKey: "pack_source",
};

const hostRepoPathArg: SharedArgSpec = {
  key: "hostRepoPath",
  description: "Absolute or relative path to the host repo.",
  kind: "string",
  cliPositionalIndex: 0,
  cliPositionalLabel: "<host-repo-path>",
  mcpKey: "host_repo_path",
  cliRequired: true,
  mcpRequired: true,
};

const urlArg: SharedArgSpec = {
  key: "url",
  description: "Website URL to capture.",
  kind: "string",
  cliFlag: "url",
  mcpKey: "url",
  cliRequired: true,
  mcpRequired: true,
};

const pathArg: SharedArgSpec = {
  key: "path",
  description: "Absolute or relative path to the PDF file.",
  kind: "string",
  cliFlag: "path",
  mcpKey: "path",
  cliRequired: true,
  mcpRequired: true,
};

const captureArg: SharedArgSpec = {
  key: "capture",
  description: "Capture slug under agent-wiki/notes/web/<slug>.capture.json.",
  kind: "string",
  cliFlag: "capture",
  mcpKey: "capture",
  cliRequired: true,
  mcpRequired: true,
};

const slugArg: SharedArgSpec = {
  key: "slug",
  description: "Optional stable slug.",
  kind: "string",
  cliFlag: "slug",
  mcpKey: "slug",
};

const outputPathArg: SharedArgSpec = {
  key: "outputPath",
  description: "Optional output path for the derived artifact.",
  kind: "string",
  cliFlag: "output",
  mcpKey: "output_path",
};

const bucketArg: SharedArgSpec = {
  key: "bucket",
  description: "Optional target bucket.",
  kind: "string",
  cliFlag: "bucket",
  mcpKey: "bucket",
};

const prefixArg: SharedArgSpec = {
  key: "prefix",
  description: "Optional object prefix inside the target bucket.",
  kind: "string",
  cliFlag: "prefix",
  mcpKey: "prefix",
};

const publicBaseUrlArg: SharedArgSpec = {
  key: "publicBaseUrl",
  description: "Optional public base URL for published assets.",
  kind: "string",
  cliFlag: "public-base-url",
  mcpKey: "public_base_url",
};

const sourceUrlArg: SharedArgSpec = {
  key: "sourceUrl",
  description: "Optional source URL for the captured PDF.",
  kind: "string",
  cliFlag: "source-url",
  mcpKey: "source_url",
};

const artifactTypeArg: SharedArgSpec = {
  key: "artifactType",
  description: "Derived artifact type to write.",
  kind: "enum",
  cliFlag: "artifact",
  mcpKey: "artifact_type",
  options: artifactTypeOptions,
};

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function maybeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function maybeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function lastScalar(value: string | string[] | boolean | undefined): string | undefined {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (typeof value[index] === "string") {
        return value[index];
      }
    }
    return undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function parseCliBoolean(value: string | string[] | boolean | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  const raw = lastScalar(value);
  if (raw === undefined) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return true;
}

function parseCliInt(spec: SharedArgSpec, value: string | string[] | boolean | undefined): number | undefined {
  const raw = lastScalar(value);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${spec.cliFlag} must be an integer`);
  }
  if (spec.positive && parsed <= 0) {
    throw new Error(`--${spec.cliFlag} must be a positive integer`);
  }
  return parsed;
}

function parseCliEnum(spec: SharedArgSpec, value: string | string[] | boolean | undefined): string | undefined {
  const raw = lastScalar(value);
  if (raw === undefined) {
    return undefined;
  }
  const option = spec.options?.find((candidate) => candidate.cli === raw || candidate.canonical === raw);
  if (!option) {
    throw new Error(`--${spec.cliFlag} has unsupported value ${raw}`);
  }
  return option.canonical;
}

function parseCliValue(spec: SharedArgSpec, value: string | string[] | boolean | undefined): unknown {
  switch (spec.kind) {
    case "string":
      return lastScalar(value);
    case "string[]":
      if (value === undefined || value === false || value === true) {
        return [];
      }
      return Array.isArray(value) ? value : [value];
    case "boolean":
      return parseCliBoolean(value);
    case "int":
      return parseCliInt(spec, value);
    case "enum":
      return parseCliEnum(spec, value);
    default:
      return undefined;
  }
}

function isMissingCliValue(value: unknown): boolean {
  return value === undefined;
}

function mcpArgIsRequired(spec: SharedArgSpec): boolean {
  return spec.mcpRequired ?? false;
}

function buildMcpArgSchema(spec: SharedArgSpec): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (spec.kind) {
    case "string":
      schema = z.string();
      break;
    case "string[]":
      schema = z.array(z.string());
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "int":
      schema = spec.positive ? z.number().int().positive() : z.number().int();
      break;
    case "enum": {
      const options = (spec.options ?? []).map((option) => option.canonical);
      schema = z.enum(options as [string, ...string[]]);
      break;
    }
    default:
      schema = z.unknown();
      break;
  }
  if (!mcpArgIsRequired(spec)) {
    schema = schema.optional();
  }
  return schema.describe(spec.description);
}

const sharedCommandsInternal: SharedCommandSpec[] = [
  {
    cliCommand: "adopt",
    mcpTool: "adopt_pack",
    description: "Copy the Datalox pack into a host repo from the current repo or a git URL.",
    args: [hostRepoPathArg, packSourceArg],
    async run(input) {
      return adoptPack({
        hostRepoPath: maybeString(input.hostRepoPath) ?? "",
        packSource: maybeString(input.packSource),
      });
    },
  },
  {
    cliCommand: "capture-web",
    mcpTool: "capture_web_artifact",
    description: "Capture a live website into a repo-local note plus an optional reusable artifact such as a design brief, CSS variable sheet, tokens, or Tailwind theme.",
    args: [repoPathArg, urlArg, artifactTypeArg, titleArg, slugArg, outputPathArg],
    async run(input) {
      return captureWebArtifact({
        repoPath: maybeString(input.repoPath),
        url: maybeString(input.url) ?? "",
        artifactType: (maybeString(input.artifactType) as "design_doc" | "design_tokens" | "css_variables" | "tailwind_theme" | "note" | "source_page" | undefined),
        title: maybeString(input.title),
        slug: maybeString(input.slug),
        outputPath: maybeString(input.outputPath),
      });
    },
  },
  {
    cliCommand: "capture-design",
    mcpTool: "capture_design_source",
    description: "Compatibility alias: capture a live website into a design brief plus a reusable note and screenshots in the host repo.",
    args: [repoPathArg, urlArg, titleArg, slugArg, outputPathArg],
    async run(input) {
      return captureDesignFromUrl({
        repoPath: maybeString(input.repoPath),
        url: maybeString(input.url) ?? "",
        title: maybeString(input.title),
        slug: maybeString(input.slug),
        outputPath: maybeString(input.outputPath),
      });
    },
  },
  {
    cliCommand: "capture-pdf",
    mcpTool: "capture_pdf_artifact",
    description: "Capture a PDF into a repo-local note so agents can act from extracted evidence instead of reopening the file.",
    args: [repoPathArg, pathArg, titleArg, slugArg, sourceUrlArg],
    async run(input) {
      return capturePdfArtifact({
        repoPath: maybeString(input.repoPath),
        path: maybeString(input.path) ?? "",
        title: maybeString(input.title),
        slug: maybeString(input.slug),
        sourceUrl: maybeString(input.sourceUrl),
      });
    },
  },
  {
    cliCommand: "publish-web-capture",
    mcpTool: "publish_web_capture",
    description: "Publish one captured web instance to R2, write its manifest.json, and regenerate indexes/latest.json.",
    args: [repoPathArg, captureArg, bucketArg, prefixArg, publicBaseUrlArg],
    async run(input) {
      return publishWebCapture({
        repoPath: maybeString(input.repoPath),
        capture: maybeString(input.capture) ?? "",
        bucket: maybeString(input.bucket),
        prefix: maybeString(input.prefix),
        publicBaseUrl: maybeString(input.publicBaseUrl),
      });
    },
  },
  {
    cliCommand: "resolve",
    mcpTool: "resolve_loop",
    description: "Resolve the best matching Datalox skill for the current loop and return actionable guidance.",
    args: [repoPathArg, taskArg, workflowArg, stepArg, skillArg, limitArg, includeContentArg],
    async run(input) {
      return resolveLoop({
        repoPath: maybeString(input.repoPath),
        task: maybeString(input.task),
        workflow: maybeString(input.workflow),
        step: maybeString(input.step),
        skill: maybeString(input.skill),
        limit: maybeNumber(input.limit),
        includeContent: maybeBoolean(input.includeContent),
      });
    },
  },
  {
    cliCommand: "record",
    mcpTool: "record_turn_result",
    description: "Record a grounded loop event before promoting it into wiki pages or skills.",
    args: [
      repoPathArg,
      taskArg,
      workflowArg,
      stepArg,
      skillIdArg,
      summaryArg,
      observationsArg,
      changedFilesArg,
      transcriptArg,
      tagsArg,
      titleArg,
      signalArg,
      interpretationArg,
      recommendedActionArg,
      outcomeArg,
      eventKindArg,
    ],
    async run(input) {
      return recordTurnResult({
        repoPath: maybeString(input.repoPath),
        task: maybeString(input.task),
        workflow: maybeString(input.workflow),
        step: maybeString(input.step),
        skillId: maybeString(input.skillId),
        summary: maybeString(input.summary),
        observations: maybeStringArray(input.observations),
        changedFiles: maybeStringArray(input.changedFiles),
        transcript: maybeString(input.transcript),
        tags: maybeStringArray(input.tags),
        title: maybeString(input.title),
        signal: maybeString(input.signal),
        interpretation: maybeString(input.interpretation),
        recommendedAction: maybeString(input.recommendedAction),
        outcome: maybeString(input.outcome),
        eventKind: maybeString(input.eventKind),
      });
    },
  },
  {
    cliCommand: "patch",
    mcpTool: "patch_knowledge",
    description: "Write a reusable note, create or update a skill, and refresh the visible pack artifacts.",
    args: [
      repoPathArg,
      taskArg,
      workflowArg,
      stepArg,
      skillIdArg,
      summaryArg,
      observationsArg,
      transcriptArg,
      tagsArg,
      titleArg,
      signalArg,
      interpretationArg,
      recommendedActionArg,
    ],
    async run(input) {
      return patchKnowledge({
        repoPath: maybeString(input.repoPath),
        task: maybeString(input.task),
        workflow: maybeString(input.workflow),
        step: maybeString(input.step),
        skillId: maybeString(input.skillId),
        summary: maybeString(input.summary),
        observations: maybeStringArray(input.observations),
        transcript: maybeString(input.transcript),
        tags: maybeStringArray(input.tags),
        title: maybeString(input.title),
        signal: maybeString(input.signal),
        interpretation: maybeString(input.interpretation),
        recommendedAction: maybeString(input.recommendedAction),
      });
    },
  },
  {
    cliCommand: "promote",
    mcpTool: "promote_gap",
    description: "Promote repeated grounded events into reusable notes or new or updated skills using conservative thresholds.",
    args: [
      repoPathArg,
      taskArg,
      workflowArg,
      stepArg,
      skillIdArg,
      summaryArg,
      observationsArg,
      changedFilesArg,
      transcriptArg,
      tagsArg,
      titleArg,
      signalArg,
      interpretationArg,
      recommendedActionArg,
      outcomeArg,
      eventKindArg,
      minWikiOccurrencesArg,
      minSkillOccurrencesArg,
    ],
    async run(input) {
      return promoteGap({
        repoPath: maybeString(input.repoPath),
        task: maybeString(input.task),
        workflow: maybeString(input.workflow),
        step: maybeString(input.step),
        skillId: maybeString(input.skillId),
        summary: maybeString(input.summary),
        observations: maybeStringArray(input.observations),
        changedFiles: maybeStringArray(input.changedFiles),
        transcript: maybeString(input.transcript),
        tags: maybeStringArray(input.tags),
        title: maybeString(input.title),
        signal: maybeString(input.signal),
        interpretation: maybeString(input.interpretation),
        recommendedAction: maybeString(input.recommendedAction),
        outcome: maybeString(input.outcome),
        eventKind: maybeString(input.eventKind),
        minWikiOccurrences: maybeNumber(input.minWikiOccurrences),
        minSkillOccurrences: maybeNumber(input.minSkillOccurrences),
      });
    },
  },
  {
    cliCommand: "lint",
    mcpTool: "lint_pack",
    description: "Lint the local Datalox pack and refresh agent-wiki/lint.md.",
    args: [repoPathArg],
    async run(input) {
      return lintLocalPack({
        repoPath: maybeString(input.repoPath),
      });
    },
  },
  {
    cliCommand: "promote",
    mcpTool: "promote_note",
    description: "Promote a note up the knowledge stack: to researcher (~/.datalox/researcher/notes/) or domain (~/.datalox/domains/<name>/notes/). Use 'researcher' or 'domain:<name>' as the target.",
    args: [
      repoPathArg,
      {
        key: "notePath",
        description: "Path to the note file to promote (relative to repo or absolute).",
        kind: "string",
        cliFlag: "note",
        mcpKey: "note_path",
        cliRequired: true,
        mcpRequired: true,
      },
      {
        key: "to",
        description: "Promotion target: 'researcher' or 'domain:<name>' (e.g. 'domain:flow_cytometry').",
        kind: "string",
        cliFlag: "to",
        mcpKey: "to",
        cliRequired: true,
        mcpRequired: true,
      },
    ],
    async run(input) {
      return promoteNote({
        repoPath: maybeString(input.repoPath),
        notePath: maybeString(input.notePath) ?? "",
        to: maybeString(input.to) ?? "",
      });
    },
  },
];

export const SHARED_COMMANDS: readonly SharedCommandSpec[] = sharedCommandsInternal;

export function getSharedCliCommand(commandName: string | undefined): SharedCommandSpec | undefined {
  if (!commandName) {
    return undefined;
  }
  return SHARED_COMMANDS.find((spec) => spec.cliCommand === commandName);
}

export function getSharedMcpCommands(): readonly SharedCommandSpec[] {
  return SHARED_COMMANDS;
}

export function parseSharedCliInput(spec: SharedCommandSpec, args: CliArgsLike): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const positionals = args._.slice(1);
  for (const arg of spec.args) {
    const raw = arg.cliPositionalIndex !== undefined
      ? positionals[arg.cliPositionalIndex]
      : arg.cliFlag
        ? args[arg.cliFlag]
        : undefined;
    const parsed = parseCliValue(arg, raw);
    if (arg.cliRequired && isMissingCliValue(parsed)) {
      if (arg.cliPositionalLabel) {
        throw new Error(`${spec.cliCommand} requires ${arg.cliPositionalLabel}`);
      }
      throw new Error(`${spec.cliCommand} requires --${arg.cliFlag}`);
    }
    if (!isMissingCliValue(parsed)) {
      input[arg.key] = parsed;
    }
  }
  return input;
}

export function buildSharedMcpInputSchema(spec: SharedCommandSpec): Record<string, z.ZodTypeAny> {
  const schema: Record<string, z.ZodTypeAny> = {};
  for (const arg of spec.args) {
    if (!arg.mcpKey) {
      continue;
    }
    schema[arg.mcpKey] = buildMcpArgSchema(arg);
  }
  return schema;
}

export function parseSharedMcpInput(spec: SharedCommandSpec, input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const arg of spec.args) {
    if (!arg.mcpKey) {
      continue;
    }
    if (input[arg.mcpKey] !== undefined) {
      normalized[arg.key] = input[arg.mcpKey];
    }
  }
  return normalized;
}
