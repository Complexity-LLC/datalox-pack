import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  hasMarkdownSection,
  inferSkillNameFromPath,
  parseNoteDoc,
  parseSkillDoc,
  splitFrontmatter,
} from "./agent-pack/markdown.mjs";

const AUTHOR_ENV = "DATALOX_AUTHOR";
const CONFIG_PATH_ENV = "DATALOX_CONFIG_JSON";
const BASE_URL_ENV = "DATALOX_BASE_URL";
const DEFAULT_WORKFLOW_ENV = "DATALOX_DEFAULT_WORKFLOW";
const AGENT_PROFILE_ENV = "DATALOX_AGENT_PROFILE";
const MODE_ENV = "DATALOX_MODE";
const QMD_BIN_ENV = "DATALOX_QMD_BIN";
const PACK_MODES = ["repo_only", "service_backed"];
const AGENT_PROFILES = ["local_first", "runtime_first"];
const AGENT_INTERFACES = ["skill_loop", "runtime_compile"];
const SOURCE_KINDS = ["local_repo"];
const NOTE_RETRIEVAL_BACKENDS = ["native", "qmd"];
const DEFAULT_WIKI_DIR = "agent-wiki";
const DEFAULT_NOTE_DIR = `${DEFAULT_WIKI_DIR}/notes`;
const DEFAULT_META_DIR = `${DEFAULT_WIKI_DIR}/meta`;
const LEGACY_PATTERN_DIR = `${DEFAULT_WIKI_DIR}/patterns`;
const DEFAULT_SOURCE_DIR = `${DEFAULT_WIKI_DIR}/sources`;
const DEFAULT_CONCEPT_DIR = `${DEFAULT_WIKI_DIR}/concepts`;
const DEFAULT_COMPARISON_DIR = `${DEFAULT_WIKI_DIR}/comparisons`;
const DEFAULT_QUESTION_DIR = `${DEFAULT_WIKI_DIR}/questions`;
const DEFAULT_EVENTS_DIR = `${DEFAULT_WIKI_DIR}/events`;
const WIKI_PAGE_TYPES = ["note", "meta", "source", "concept", "comparison", "question"];
const DEFAULT_MAINTENANCE_CONFIG = Object.freeze({
  maxEvents: 12,
  minNoteOccurrences: 2,
  minSkillOccurrences: 3,
  backlog: Object.freeze({
    warn: Object.freeze({
      uncovered: 50,
      oldestAgeDays: 7,
      maintainableGroups: 1,
    }),
    urgent: Object.freeze({
      uncovered: 100,
      oldestAgeDays: 14,
      maintainableGroups: 5,
    }),
  }),
});
const KNOWLEDGE_MODEL = Object.freeze({
  primaryDurableEntry: "skill",
  supportingDurableEntry: "note",
  normalReadPath: ["detect_skill", "read_skill", "read_linked_notes", "act"],
  noteLinkField: "metadata.datalox.note_paths",
});

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    merged[key] = isRecord(baseValue) && isRecord(value)
      ? deepMerge(baseValue, value)
      : value;
  }
  return merged;
}

function expectString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Agent config field ${fieldName} must be a non-empty string`);
  }
  return value;
}

function expectBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`Agent config field ${fieldName} must be a boolean`);
  }
  return value;
}

function expectPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Agent config field ${fieldName} must be a positive integer`);
  }
  return value;
}

function expectOptionalPositiveInteger(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  return expectPositiveInteger(value, fieldName);
}

function expectStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Agent config field ${fieldName} must be an array of strings`);
  }
  return value;
}

function expectEnumArray(value, fieldName, allowedValues) {
  const values = expectStringArray(value, fieldName);
  for (const item of values) {
    if (!allowedValues.includes(item)) {
      throw new Error(`Agent config field ${fieldName} contains invalid value ${item}`);
    }
  }
  return values;
}

function expectEnumValue(value, fieldName, allowedValues) {
  const resolved = expectString(value, fieldName);
  if (!allowedValues.includes(resolved)) {
    throw new Error(`Agent config field ${fieldName} must be one of ${allowedValues.join(", ")}`);
  }
  return resolved;
}

function cloneBacklogThreshold(threshold) {
  return Object.fromEntries(
    Object.entries(threshold).filter(([, value]) => value !== undefined),
  );
}

function validateBacklogThreshold(raw, fieldName, fallback) {
  if (raw === undefined) {
    return cloneBacklogThreshold(fallback);
  }
  if (!isRecord(raw)) {
    throw new Error(`Agent config field ${fieldName} must be an object`);
  }

  const threshold = {};
  for (const key of ["uncovered", "oldestAgeDays", "maintainableGroups"]) {
    const value = expectOptionalPositiveInteger(raw[key], `${fieldName}.${key}`);
    if (value !== undefined) {
      threshold[key] = value;
    }
  }

  if (Object.keys(threshold).length === 0) {
    throw new Error(`Agent config field ${fieldName} must enable at least one backlog signal`);
  }

  return threshold;
}

function validateBacklogPolicy(raw, fieldName = "maintenance.backlog") {
  if (raw === undefined) {
    return {
      warn: cloneBacklogThreshold(DEFAULT_MAINTENANCE_CONFIG.backlog.warn),
      urgent: cloneBacklogThreshold(DEFAULT_MAINTENANCE_CONFIG.backlog.urgent),
    };
  }
  if (!isRecord(raw)) {
    throw new Error(`Agent config field ${fieldName} must be an object`);
  }

  return {
    warn: validateBacklogThreshold(raw.warn, `${fieldName}.warn`, DEFAULT_MAINTENANCE_CONFIG.backlog.warn),
    urgent: validateBacklogThreshold(raw.urgent, `${fieldName}.urgent`, DEFAULT_MAINTENANCE_CONFIG.backlog.urgent),
  };
}

function validateMaintenanceConfig(raw) {
  if (raw === undefined) {
    return {
      maxEvents: DEFAULT_MAINTENANCE_CONFIG.maxEvents,
      minNoteOccurrences: DEFAULT_MAINTENANCE_CONFIG.minNoteOccurrences,
      minSkillOccurrences: DEFAULT_MAINTENANCE_CONFIG.minSkillOccurrences,
      backlog: validateBacklogPolicy(undefined),
    };
  }
  if (!isRecord(raw)) {
    throw new Error("Agent config field maintenance must be an object");
  }

  return {
    maxEvents: expectOptionalPositiveInteger(raw.maxEvents, "maintenance.maxEvents") ?? DEFAULT_MAINTENANCE_CONFIG.maxEvents,
    minNoteOccurrences: expectOptionalPositiveInteger(raw.minNoteOccurrences, "maintenance.minNoteOccurrences")
      ?? DEFAULT_MAINTENANCE_CONFIG.minNoteOccurrences,
    minSkillOccurrences: expectOptionalPositiveInteger(raw.minSkillOccurrences, "maintenance.minSkillOccurrences")
      ?? DEFAULT_MAINTENANCE_CONFIG.minSkillOccurrences,
    backlog: validateBacklogPolicy(raw.backlog),
  };
}

function validateAgentConfig(raw) {
  const project = raw.project;
  const sources = raw.sources;
  const agent = raw.agent;
  const paths = raw.paths;
  const retrieval = raw.retrieval;
  const runtime = raw.runtime;
  const auth = raw.auth;

  if (!isRecord(project)) throw new Error("Agent config field project must be an object");
  if (!Array.isArray(sources)) throw new Error("Agent config field sources must be an array");
  if (!isRecord(agent)) throw new Error("Agent config field agent must be an object");
  if (!isRecord(paths)) throw new Error("Agent config field paths must be an object");
  if (retrieval !== undefined && !isRecord(retrieval)) {
    throw new Error("Agent config field retrieval must be an object");
  }
  if (!isRecord(runtime)) throw new Error("Agent config field runtime must be an object");
  if (!isRecord(auth)) throw new Error("Agent config field auth must be an object");
  if (!isRecord(runtime.endpoints)) {
    throw new Error("Agent config field runtime.endpoints must be an object");
  }

  return {
    version: expectPositiveInteger(raw.version, "version"),
    mode: expectEnumValue(raw.mode, "mode", PACK_MODES),
    project: {
      id: expectString(project.id, "project.id"),
      name: expectString(project.name, "project.name"),
    },
    sources: sources.map((source, index) => {
      if (!isRecord(source)) {
        throw new Error(`Agent config field sources[${index}] must be an object`);
      }
      return {
        kind: expectEnumValue(source.kind, `sources[${index}].kind`, SOURCE_KINDS),
        name: expectString(source.name, `sources[${index}].name`),
        enabled: expectBoolean(source.enabled, `sources[${index}].enabled`),
        root: expectString(source.root, `sources[${index}].root`),
      };
    }),
    agent: {
      profile: expectEnumValue(agent.profile, "agent.profile", AGENT_PROFILES),
      nativeSkillPolicy: expectEnumValue(
        agent.nativeSkillPolicy,
        "agent.nativeSkillPolicy",
        ["preserve"],
      ),
      detectOnEveryLoop: expectBoolean(agent.detectOnEveryLoop, "agent.detectOnEveryLoop"),
      configReadOrder: expectStringArray(agent.configReadOrder, "agent.configReadOrder"),
      interfaceOrder: expectEnumArray(agent.interfaceOrder, "agent.interfaceOrder", AGENT_INTERFACES),
    },
    paths: {
      seedSkillsDir: expectString(paths.seedSkillsDir, "paths.seedSkillsDir"),
      seedNotesDir: paths.seedNotesDir === undefined
        ? expectString(paths.seedPatternsDir, "paths.seedPatternsDir")
        : expectString(paths.seedNotesDir, "paths.seedNotesDir"),
      seedPatternsDir: paths.seedPatternsDir === undefined
        ? null
        : expectString(paths.seedPatternsDir, "paths.seedPatternsDir"),
      hostSkillsDir: paths.hostSkillsDir === null
        ? null
        : expectString(paths.hostSkillsDir, "paths.hostSkillsDir"),
      hostNotesDir: paths.hostNotesDir === undefined
        ? (paths.hostPatternsDir === null
          ? null
          : expectString(paths.hostPatternsDir, "paths.hostPatternsDir"))
        : (paths.hostNotesDir === null
          ? null
          : expectString(paths.hostNotesDir, "paths.hostNotesDir")),
      hostPatternsDir: paths.hostPatternsDir === null || paths.hostPatternsDir === undefined
        ? null
        : expectString(paths.hostPatternsDir, "paths.hostPatternsDir"),
    },
    retrieval: {
      notesBackend: retrieval?.notesBackend === undefined
        ? "native"
        : expectEnumValue(retrieval.notesBackend, "retrieval.notesBackend", NOTE_RETRIEVAL_BACKENDS),
    },
    maintenance: validateMaintenanceConfig(raw.maintenance),
    runtime: {
      enabled: expectBoolean(runtime.enabled, "runtime.enabled"),
      baseUrl: expectString(runtime.baseUrl, "runtime.baseUrl"),
      defaultWorkflow: expectString(runtime.defaultWorkflow, "runtime.defaultWorkflow"),
      requestTimeoutMs: expectPositiveInteger(runtime.requestTimeoutMs, "runtime.requestTimeoutMs"),
      endpoints: {
        compile: expectString(runtime.endpoints.compile, "runtime.endpoints.compile"),
      },
    },
    auth: {
      apiKeyEnv: expectString(auth.apiKeyEnv, "auth.apiKeyEnv"),
      contributorKeyEnv: expectString(auth.contributorKeyEnv, "auth.contributorKeyEnv"),
    },
  };
}

function applyEnvironmentOverrides(config) {
  const appliedEnvOverrides = [];
  const nextConfig = {
    ...config,
    agent: { ...config.agent },
    runtime: { ...config.runtime },
  };

  if (process.env[BASE_URL_ENV]) {
    nextConfig.runtime.baseUrl = process.env[BASE_URL_ENV];
    appliedEnvOverrides.push(BASE_URL_ENV);
  }
  if (process.env[DEFAULT_WORKFLOW_ENV]) {
    nextConfig.runtime.defaultWorkflow = process.env[DEFAULT_WORKFLOW_ENV];
    appliedEnvOverrides.push(DEFAULT_WORKFLOW_ENV);
  }
  if (process.env[AGENT_PROFILE_ENV]) {
    nextConfig.agent.profile = expectEnumValue(
      process.env[AGENT_PROFILE_ENV],
      AGENT_PROFILE_ENV,
      AGENT_PROFILES,
    );
    appliedEnvOverrides.push(AGENT_PROFILE_ENV);
  }
  if (process.env[MODE_ENV]) {
    nextConfig.mode = expectEnumValue(process.env[MODE_ENV], MODE_ENV, PACK_MODES);
    appliedEnvOverrides.push(MODE_ENV);
  }

  return { config: nextConfig, appliedEnvOverrides };
}

async function readJsonObject(filePath) {
  const parsed = await readJson(filePath);
  if (!isRecord(parsed)) {
    throw new Error(`Agent config at ${filePath} must be a JSON object`);
  }
  return parsed;
}

export async function loadAgentConfig(cwd = process.cwd()) {
  const configuredPath = process.env[CONFIG_PATH_ENV];
  if (configuredPath) {
    const sourcePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(cwd, configuredPath);
    const validated = validateAgentConfig(await readJsonObject(sourcePath));
    const { config, appliedEnvOverrides } = applyEnvironmentOverrides(validated);
    return {
      config,
      sourcePath,
      appliedEnvOverrides: [CONFIG_PATH_ENV, ...appliedEnvOverrides],
    };
  }

  const sourcePath = path.resolve(cwd, ".datalox/config.json");
  const localOverridePath = path.resolve(cwd, ".datalox/config.local.json");
  const baseConfig = await readJsonObject(sourcePath);
  const mergedConfig = (await fileExists(localOverridePath))
    ? deepMerge(baseConfig, await readJsonObject(localOverridePath))
    : baseConfig;
  const validated = validateAgentConfig(mergedConfig);
  const { config, appliedEnvOverrides } = applyEnvironmentOverrides(validated);

  return {
    config,
    sourcePath,
    localOverridePath: (await fileExists(localOverridePath)) ? localOverridePath : undefined,
    appliedEnvOverrides,
  };
}

function renderFrontmatterValue(key, value, indentLevel = 0) {
  const indent = " ".repeat(indentLevel);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}${key}: []`;
    }
    return [
      `${indent}${key}:`,
      ...value.map((item) => `${indent}  - ${item}`),
    ].join("\n");
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return `${indent}${key}: {}`;
    }
    return [
      `${indent}${key}:`,
      ...entries.map(([nestedKey, nestedValue]) =>
        renderFrontmatterValue(
          nestedKey.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`),
          nestedValue,
          indentLevel + 2,
        )
      ),
    ].join("\n");
  }

  return `${indent}${key}: ${String(value)}`;
}

function renderSkillMarkdown(payload) {
  const frontmatter = [
    "---",
    renderFrontmatterValue("name", payload.name),
    renderFrontmatterValue("description", payload.description),
    renderFrontmatterValue("metadata", {
      datalox: {
        id: payload.id,
        displayName: payload.displayName,
        workflow: payload.workflow,
        trigger: payload.trigger,
        notePaths: payload.notePaths ?? [],
        tags: payload.tags ?? [],
        status: payload.status,
        maturity: payload.maturity,
        evidenceCount: payload.evidenceCount,
        ...(payload.lastUsedAt ? { lastUsedAt: payload.lastUsedAt } : {}),
        ...(payload.author ? { author: payload.author } : {}),
        ...(payload.updatedAt ? { updatedAt: payload.updatedAt } : {}),
        ...(payload.repoHints ? { repoHints: payload.repoHints } : {}),
      },
    }),
    "---",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  const noteSection = (payload.notePaths ?? []).length > 0
    ? [
        "## Notes",
        "",
        ...(payload.notePaths ?? []).map((notePath) => `- ${notePath}`),
        "",
      ].join("\n")
    : null;

  const repoHintFiles = toArray(payload.repoHints?.files);
  const repoHintPrefixes = toArray(payload.repoHints?.pathPrefixes);
  const repoHintSignals = toArray(payload.repoHints?.packageSignals);
  const checkFirstSection = repoHintFiles.length > 0 || repoHintPrefixes.length > 0 || repoHintSignals.length > 0
    ? [
        "## Check First",
        "",
        ...(repoHintFiles.length > 0 ? ["Relevant files:", ...repoHintFiles.map((item) => `- ${item}`), ""] : []),
        ...(repoHintPrefixes.length > 0 ? ["Relevant paths:", ...repoHintPrefixes.map((item) => `- ${item}`), ""] : []),
        ...(repoHintSignals.length > 0 ? ["Repo signals:", ...repoHintSignals.map((item) => `- ${item}`), ""] : []),
      ].join("\n")
    : null;

  const body = [
    `# ${payload.displayName}`,
    "",
    payload.description,
    "",
    "## When to Use",
    "",
    payload.trigger,
    "",
    "## Workflow",
    "",
    "1. Confirm the current task really matches this skill.",
    "2. Read the linked notes before acting.",
    "3. Apply the notes' signal, interpretation, action, and examples to the current loop.",
    "4. If the case exposes a reusable gap, add or update a note and patch this skill.",
    "5. Run lint and refresh the visible control artifacts after patching knowledge.",
    "",
    "## Expected Output",
    "",
    "- State why this skill matched.",
    "- State what to do now based on the linked notes.",
    "- State what to watch for if the case is ambiguous or risky.",
    "",
    checkFirstSection,
    noteSection,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  return `${frontmatter}\n\n${body}\n`;
}

function resolveSeedRoot(config, sourcePath) {
  const source = config.sources.find((entry) => entry.enabled) ?? config.sources[0];
  const normalizedRoot = normalizePath(source?.root ?? ".")
    .replace(/^\.\/?/, "")
    .replace(/\/+$/, "");
  const depth = normalizedRoot && normalizedRoot !== "."
    ? normalizedRoot.split("/").filter(Boolean).length
    : 0;
  const upwardSegments = depth > 0 ? Array(depth).fill("..") : [];
  return path.resolve(path.dirname(sourcePath), ...upwardSegments);
}

function pathKey(filePath) {
  return normalizePath(path.resolve(filePath));
}

function isWithinDir(filePath, dirPath) {
  const relative = path.relative(dirPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolvePackPaths(config, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const sourcePath = options.sourcePath
    ? (path.isAbsolute(options.sourcePath)
      ? options.sourcePath
      : path.resolve(cwd, options.sourcePath))
    : path.resolve(cwd, ".datalox/config.json");
  const hostRoot = path.resolve(cwd);
  const seedRoot = resolveSeedRoot(config, sourcePath);

  return {
    hostRoot,
    seedRoot,
    hostWikiDir: path.resolve(hostRoot, DEFAULT_WIKI_DIR),
    hostEventsDir: path.resolve(hostRoot, DEFAULT_EVENTS_DIR),
    hostSkillsDir: path.resolve(hostRoot, config.paths.hostSkillsDir ?? "skills"),
    hostNotesDir: path.resolve(hostRoot, config.paths.hostNotesDir ?? config.paths.hostPatternsDir ?? DEFAULT_NOTE_DIR),
    hostMetaDir: path.resolve(hostRoot, DEFAULT_META_DIR),
    hostPatternsDir: path.resolve(hostRoot, config.paths.hostPatternsDir ?? LEGACY_PATTERN_DIR),
    hostSourcesDir: path.resolve(hostRoot, DEFAULT_SOURCE_DIR),
    hostConceptsDir: path.resolve(hostRoot, DEFAULT_CONCEPT_DIR),
    hostComparisonsDir: path.resolve(hostRoot, DEFAULT_COMPARISON_DIR),
    hostQuestionsDir: path.resolve(hostRoot, DEFAULT_QUESTION_DIR),
    seedWikiDir: path.resolve(seedRoot, DEFAULT_WIKI_DIR),
    seedSkillsDir: path.resolve(seedRoot, config.paths.seedSkillsDir),
    seedNotesDir: path.resolve(seedRoot, config.paths.seedNotesDir ?? config.paths.seedPatternsDir ?? DEFAULT_NOTE_DIR),
    seedMetaDir: path.resolve(seedRoot, DEFAULT_META_DIR),
    seedPatternsDir: path.resolve(seedRoot, config.paths.seedPatternsDir ?? LEGACY_PATTERN_DIR),
    seedSourcesDir: path.resolve(seedRoot, DEFAULT_SOURCE_DIR),
    seedConceptsDir: path.resolve(seedRoot, DEFAULT_CONCEPT_DIR),
    seedComparisonsDir: path.resolve(seedRoot, DEFAULT_COMPARISON_DIR),
    seedQuestionsDir: path.resolve(seedRoot, DEFAULT_QUESTION_DIR),
  };
}

export function parseArgs(argv) {
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
    const value = hasValue ? next : true;

    if (hasValue) {
      index += 1;
    }

    if (parsed[key] === undefined) {
      parsed[key] = value;
      continue;
    }

    if (Array.isArray(parsed[key])) {
      parsed[key].push(value);
      continue;
    }

    parsed[key] = [parsed[key], value];
  }

  return parsed;
}

function toArray(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function readSkillMarkdownEntries(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const skillFiles = entries
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return [path.join(dirPath, entry.name, "SKILL.md")];
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return [path.join(dirPath, entry.name)];
      }
      return [];
    })
    .sort((left, right) => left.localeCompare(right));

  const existingFiles = [];
  for (const filePath of skillFiles) {
    if (await fileExists(filePath)) {
      existingFiles.push(filePath);
    }
  }

  return Promise.all(
    existingFiles.map(async (filePath) => ({
      filePath,
      value: parseSkillDoc(filePath, await readFile(filePath, "utf8")),
    })),
  );
}

async function readDirMarkdown(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirMarkdown(filePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(filePath);
    }
  }
  return files;
}

async function readDirJson(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => path.join(dirPath, entry.name));
}

function skillIdentity(skill, filePath) {
  return skill.id || skill.name || inferSkillNameFromPath(filePath);
}

async function listSkillEntries(config, cwd = process.cwd(), sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const useSameDir = pathKey(paths.hostSkillsDir) === pathKey(paths.seedSkillsDir);
  const [seedEntries, hostEntries] = await Promise.all([
    useSameDir ? Promise.resolve([]) : readSkillMarkdownEntries(paths.seedSkillsDir),
    readSkillMarkdownEntries(paths.hostSkillsDir),
  ]);

  const merged = new Map();

  for (const entry of seedEntries) {
    merged.set(skillIdentity(entry.value, entry.filePath), {
      ...entry,
      origin: "seed",
      repoRoot: paths.seedRoot,
    });
  }

  for (const entry of hostEntries) {
    merged.set(skillIdentity(entry.value, entry.filePath), {
      ...entry,
      origin: "host",
      repoRoot: paths.hostRoot,
    });
  }

  return Array.from(merged.values()).sort((left, right) =>
    skillIdentity(left.value, left.filePath).localeCompare(skillIdentity(right.value, right.filePath)),
  );
}

async function listWikiEntries(config, cwd = process.cwd(), sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const merged = new Map();
  const dirSpecs = [
    {
      pageType: "note",
      seedDir: paths.seedNotesDir,
      hostDir: paths.hostNotesDir,
    },
    {
      pageType: "note",
      seedDir: paths.seedPatternsDir,
      hostDir: paths.hostPatternsDir,
    },
    {
      pageType: "meta",
      seedDir: paths.seedMetaDir,
      hostDir: paths.hostMetaDir,
    },
    {
      pageType: "source",
      seedDir: paths.seedSourcesDir,
      hostDir: paths.hostSourcesDir,
    },
    {
      pageType: "concept",
      seedDir: paths.seedConceptsDir,
      hostDir: paths.hostConceptsDir,
    },
    {
      pageType: "comparison",
      seedDir: paths.seedComparisonsDir,
      hostDir: paths.hostComparisonsDir,
    },
    {
      pageType: "question",
      seedDir: paths.seedQuestionsDir,
      hostDir: paths.hostQuestionsDir,
    },
  ];

  for (const spec of dirSpecs) {
    const useSameDir = pathKey(spec.hostDir) === pathKey(spec.seedDir);
    const [seedEntries, hostEntries] = await Promise.all([
      useSameDir ? Promise.resolve([]) : readDirMarkdown(spec.seedDir),
      readDirMarkdown(spec.hostDir),
    ]);

    for (const filePath of seedEntries) {
      const relativePath = normalizePath(path.relative(paths.seedRoot, filePath));
      merged.set(relativePath, {
        filePath,
        relativePath,
        origin: "seed",
        repoRoot: paths.seedRoot,
        pageType: spec.pageType,
      });
    }

    for (const filePath of hostEntries) {
      const relativePath = normalizePath(path.relative(paths.hostRoot, filePath));
      merged.set(relativePath, {
        filePath,
        relativePath,
        origin: "host",
        repoRoot: paths.hostRoot,
        pageType: spec.pageType,
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

const listPatternEntries = listWikiEntries;

async function resolvePatternFile(patternPath, cwd, sourcePath) {
  if (path.isAbsolute(patternPath)) {
    if (await fileExists(patternPath)) {
      return {
        filePath: patternPath,
        relativePath: normalizePath(patternPath),
        origin: "absolute",
      };
    }
    return null;
  }

  const { config } = await loadAgentConfig(cwd);
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const candidates = [
    {
      filePath: path.resolve(paths.hostRoot, patternPath),
      origin: "host",
    },
    {
      filePath: path.resolve(paths.seedRoot, patternPath),
      origin: "seed",
    },
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate.filePath)) {
      return {
        filePath: candidate.filePath,
        relativePath: normalizePath(patternPath),
        origin: candidate.origin,
      };
    }
  }

  return null;
}

export async function countPackFiles(config, cwd = process.cwd(), sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const [skills, wikiEntries, hostSkills, seedSkills, hostNotes, seedNotes, hostEvents] = await Promise.all([
    listSkillEntries(config, cwd, sourcePath),
    listWikiEntries(config, cwd, sourcePath),
    readSkillMarkdownEntries(paths.hostSkillsDir),
    pathKey(paths.hostSkillsDir) === pathKey(paths.seedSkillsDir)
      ? Promise.resolve([])
      : readSkillMarkdownEntries(paths.seedSkillsDir),
    readDirMarkdown(paths.hostNotesDir),
    pathKey(paths.hostNotesDir) === pathKey(paths.seedNotesDir)
      ? Promise.resolve([])
      : readDirMarkdown(paths.seedNotesDir),
    readDirJson(paths.hostEventsDir),
  ]);

  return {
    skills: skills.length,
    notes: wikiEntries.filter((entry) => entry.pageType === "note").length,
    wikiPages: wikiEntries.length,
    events: hostEvents.length,
    hostSkills: hostSkills.length,
    seedSkills: seedSkills.length,
    hostNotes: hostNotes.length,
    seedNotes: seedNotes.length,
  };
}

function isEventSourceRef(value) {
  return typeof value === "string"
    && value.startsWith("agent-wiki/events/")
    && value.endsWith(".json");
}

function normalizeMaintenanceStatus(status) {
  if (typeof status !== "string") {
    return null;
  }
  const normalized = status.trim().toLowerCase();
  return normalized || null;
}

function isCoveredRecordedEvent(payload) {
  return normalizeMaintenanceStatus(payload?.maintenanceStatus) === "covered"
    && typeof payload?.coveredByNotePath === "string"
    && payload.coveredByNotePath.trim().length > 0;
}

function selectPreferredText(values, maxLength = 140) {
  const normalized = values
    .filter((value) => typeof value === "string")
    .map((value) => truncateLine(value, maxLength))
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  const counts = new Map();
  for (const value of normalized) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return normalized
    .sort((left, right) => {
      const frequencyDelta = (counts.get(right) ?? 0) - (counts.get(left) ?? 0);
      if (frequencyDelta !== 0) {
        return frequencyDelta;
      }
      const lengthDelta = left.length - right.length;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }
      return left.localeCompare(right);
    })[0];
}

function buildMaintenanceCandidate(entries) {
  const sorted = [...entries].sort((left, right) => parseTimestamp(right.value?.timestamp) - parseTimestamp(left.value?.timestamp));
  const payloads = sorted.map((entry) => entry.value ?? {});
  const latestPayload = payloads[0] ?? {};
  return {
    workflow: latestPayload.workflow ?? UNKNOWN_WORKFLOW,
    stabilityKey: extractStabilityKeyFromPayload(latestPayload),
    eventPaths: sorted.map((entry) => entry.relativePath),
    eventCount: sorted.length,
    latestTimestamp: latestPayload.timestamp ?? null,
    eventSummaries: unique(payloads.map((payload) =>
      firstNonEmpty([payload.summary, payload.signal, payload.title])
    ).filter(Boolean)).slice(0, 3),
    matchedNotePaths: unique(payloads.flatMap((payload) => Array.isArray(payload.matchedNotePaths) ? payload.matchedNotePaths : [])),
    matchedSkillIds: unique(payloads.flatMap((payload) =>
      [payload.matchedSkillId, payload.explicitSkillId].filter(Boolean)
    )),
    covered: sorted.every((entry) => isCoveredRecordedEvent(entry.value)),
    entries: sorted,
    latestPayload,
  };
}

async function listParsedOperationalNotes(config, cwd, sourcePath, includeContent = false) {
  const wikiEntries = await listWikiEntries(config, cwd, sourcePath);
  const noteEntries = wikiEntries.filter((entry) => entry.pageType === "note");
  const parsed = await Promise.all(
    noteEntries.map(async (entry) => ({
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      origin: entry.origin,
      note: parseNoteDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), includeContent),
    })),
  );

  return parsed.filter((entry) => !["pdf", "web"].includes(String(entry.note.kind ?? "").toLowerCase()));
}

async function loadMaintenancePlannerInput(
  config,
  cwd = process.cwd(),
  sourcePath,
  {
    maxEvents = 50,
    includeCovered = false,
  } = {},
) {
  const [recordedEvents, noteEntries, skillEntries] = await Promise.all([
    listRecordedEvents(config, cwd, sourcePath),
    listParsedOperationalNotes(config, cwd, sourcePath, false),
    listLocalSkills(config, cwd, sourcePath),
  ]);

  const selectedEvents = [];
  let skippedCoveredEvents = 0;

  for (const entry of recordedEvents) {
    if (entry.value?.eventClass !== "trace") {
      continue;
    }
    if (!includeCovered && isCoveredRecordedEvent(entry.value)) {
      skippedCoveredEvents += 1;
      continue;
    }
    selectedEvents.push(entry);
    if (selectedEvents.length >= maxEvents) {
      break;
    }
  }

  const grouped = new Map();
  for (const entry of selectedEvents) {
    const key = [
      entry.value?.workflow ?? UNKNOWN_WORKFLOW,
      extractStabilityKeyFromPayload(entry.value),
    ].join("::");
    const existing = grouped.get(key) ?? [];
    existing.push(entry);
    grouped.set(key, existing);
  }

  const candidates = Array.from(grouped.values())
    .map((entries) => buildMaintenanceCandidate(entries))
    .sort((left, right) => parseTimestamp(right.latestTimestamp) - parseTimestamp(left.latestTimestamp));

  return {
    selectedEvents,
    skippedCoveredEvents,
    candidates,
    noteEntries,
    skillEntries,
  };
}

function getMaintenanceConfig(config) {
  return config?.maintenance ?? {
    maxEvents: DEFAULT_MAINTENANCE_CONFIG.maxEvents,
    minNoteOccurrences: DEFAULT_MAINTENANCE_CONFIG.minNoteOccurrences,
    minSkillOccurrences: DEFAULT_MAINTENANCE_CONFIG.minSkillOccurrences,
    backlog: validateBacklogPolicy(undefined),
  };
}

function buildRecommendedMaintenanceCommand(config) {
  const maintenance = getMaintenanceConfig(config);
  return `datalox maintain --max-events ${maintenance.maxEvents} --json`;
}

function getOldestUncoveredEvent(uncoveredEvents) {
  if (uncoveredEvents.length === 0) {
    return null;
  }
  const oldest = [...uncoveredEvents]
    .sort((left, right) => parseTimestamp(left.value?.timestamp) - parseTimestamp(right.value?.timestamp))[0];
  return {
    path: oldest.relativePath,
    timestamp: oldest.value?.timestamp ?? null,
  };
}

function calculateAgeDays(timestamp, now = new Date()) {
  const parsed = parseTimestamp(timestamp);
  if (!parsed) {
    return null;
  }
  return Math.max(0, (now.getTime() - parsed) / (24 * 60 * 60 * 1000));
}

function comparePolicySignal(value, threshold) {
  return threshold !== undefined && value !== null && value >= threshold;
}

function collectTriggeredBacklogSignals(level, threshold, values) {
  const triggered = [];
  for (const signal of ["uncovered", "oldestAgeDays", "maintainableGroups"]) {
    if (comparePolicySignal(values[signal], threshold[signal])) {
      triggered.push({
        level,
        signal,
        value: values[signal],
        threshold: threshold[signal],
      });
    }
  }
  return triggered;
}

function evaluateBacklogPolicy(stats, config) {
  const policy = getMaintenanceConfig(config).backlog;
  const values = {
    uncovered: stats.uncoveredEvents,
    oldestAgeDays: stats.oldestUncoveredAgeDays,
    maintainableGroups: stats.maintainableUnresolvedTraceGroupCount,
  };
  const urgent = collectTriggeredBacklogSignals("urgent", policy.urgent, values);
  if (urgent.length > 0) {
    return {
      level: "urgent",
      triggered: urgent,
    };
  }

  const warn = collectTriggeredBacklogSignals("warn", policy.warn, values);
  if (warn.length > 0) {
    return {
      level: "warn",
      triggered: warn,
    };
  }

  return {
    level: "none",
    triggered: [],
  };
}

function buildEventBacklogStats(recordedEvents, config, now = new Date()) {
  const maintenance = getMaintenanceConfig(config);
  const traceEvents = recordedEvents.filter((entry) => entry.value?.eventClass === "trace");
  const coveredEvents = traceEvents.filter((entry) => isCoveredRecordedEvent(entry.value));
  const uncoveredTraceEvents = traceEvents.filter((entry) => !isCoveredRecordedEvent(entry.value));
  const grouped = new Map();

  for (const entry of uncoveredTraceEvents) {
    const key = [
      entry.value?.workflow ?? UNKNOWN_WORKFLOW,
      extractStabilityKeyFromPayload(entry.value),
    ].join("::");
    const existing = grouped.get(key) ?? [];
    existing.push(entry);
    grouped.set(key, existing);
  }

  const unresolvedGroups = Array.from(grouped.values())
    .map((entries) => buildMaintenanceCandidate(entries))
    .sort((left, right) => parseTimestamp(right.latestTimestamp) - parseTimestamp(left.latestTimestamp));
  const repeatedGroups = unresolvedGroups.filter((candidate) => candidate.eventCount >= 2);
  const maintainableGroups = unresolvedGroups.filter((candidate) =>
    candidate.eventCount >= maintenance.minNoteOccurrences
  );
  const oldestUncoveredEvent = getOldestUncoveredEvent(uncoveredTraceEvents);
  const oldestUncoveredAgeDays = oldestUncoveredEvent
    ? calculateAgeDays(oldestUncoveredEvent.timestamp, now)
    : null;

  return {
    totalEvents: recordedEvents.length,
    traceEvents: traceEvents.length,
    nonTraceEvents: recordedEvents.length - traceEvents.length,
    uncoveredEvents: uncoveredTraceEvents.length,
    coveredEvents: coveredEvents.length,
    unresolvedTraceGroupCount: unresolvedGroups.length,
    repeatedUnresolvedTraceGroupCount: repeatedGroups.length,
    maintainableUnresolvedTraceGroupCount: maintainableGroups.length,
    oldestUncoveredEvent,
    oldestUncoveredAgeDays,
    maintainableGroups: maintainableGroups.slice(0, 5).map((candidate) => ({
      workflow: candidate.workflow,
      stabilityKey: candidate.stabilityKey,
      eventCount: candidate.eventCount,
      latestTimestamp: candidate.latestTimestamp,
      eventPaths: candidate.eventPaths,
      eventSummaries: candidate.eventSummaries,
    })),
  };
}

export async function getEventBacklogStatus(
  {
    now,
  } = {},
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const recordedEvents = await listRecordedEvents(config, cwd, sourcePath);
  const stats = buildEventBacklogStats(recordedEvents, config, now instanceof Date ? now : new Date());
  const policy = evaluateBacklogPolicy(stats, config);
  const recommendedCommand = buildRecommendedMaintenanceCommand(config);

  return {
    ...stats,
    policy,
    maintenanceRecommended: policy.level !== "none",
    recommendedCommand,
    recommendedCommands: policy.level === "none" ? [] : [recommendedCommand],
  };
}

function formatTimestamp(value) {
  return value ?? new Date().toISOString();
}

function truncateLine(value, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

const NOTE_PLACEHOLDER_PATTERNS = [
  /^add a concrete observed case here/i,
  /^add a concrete source, reviewer note, or case trace here/i,
  /^add a wiki page path such as agent-wiki\/notes\/example\.md/i,
];

function isGeneratedNotePlaceholder(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }
  return NOTE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeNoteBullets(values = [], maxItems = 3, maxLength = 160) {
  const normalized = unique(
    values
      .map((value) => truncateLine(value, maxLength))
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0)
      .filter((value) => !isGeneratedNotePlaceholder(value)),
  );
  return normalized.slice(0, maxItems);
}

function normalizeNoteSentence(value, maxLength = 180) {
  const normalized = String(value ?? "")
    .replace(/^use this note when\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
  if (!normalized) {
    return null;
  }
  return shortenSentence(normalized, maxLength);
}

function buildWhenToUseText({
  existingWhenToUse,
  signal,
  summary,
  title,
  task,
  step,
  workflow,
}) {
  const basis = firstNonEmpty([
    normalizeNoteSentence(existingWhenToUse, 180),
    normalizeNoteSentence(signal, 180),
    normalizeNoteSentence(summary, 180),
    normalizeNoteSentence(title, 140),
    task ? `working on ${normalizeNoteSentence(task, 140)}` : null,
    step ? `${normalizeNoteSentence(step, 140)}` : null,
    workflow ? `the same ${workflow} gap reappears` : null,
  ]) ?? "the same reusable gap reappears";
  if (/^(when|if|while|after|before)\b/i.test(basis)) {
    return `${basis.charAt(0).toUpperCase()}${basis.slice(1)}.`;
  }
  return `When ${basis}.`;
}

function renderOptionalListSection(title, items) {
  if (!items.length) {
    return [];
  }
  return [
    title,
    "",
    ...items.map((item) => `- ${item}`),
    "",
  ];
}

function comparePaths(left, right) {
  return left.localeCompare(right);
}

function parseTimestamp(value) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortByUpdatedAt(entries, docs) {
  return [...entries].sort((left, right) => {
    const rightDoc = docs.get(right.relativePath);
    const leftDoc = docs.get(left.relativePath);
    return parseTimestamp(rightDoc?.updatedAt) - parseTimestamp(leftDoc?.updatedAt);
  });
}

function renderIndexMarkdown({ config, skills, wikiEntries, wikiDocs }) {
  const generatedAt = new Date().toISOString();
  const noteUsage = new Map();

  for (const skillEntry of skills) {
    for (const notePath of toArray(skillEntry.value.notePaths)) {
      if (!noteUsage.has(notePath)) {
        noteUsage.set(notePath, []);
      }
      noteUsage.get(notePath).push(skillEntry.value.id);
    }
  }

  const lines = [
    "# Agent Wiki Index",
    "",
    `- Project: ${config.project.name}`,
    `- Generated: ${generatedAt}`,
    `- Skills: ${skills.length}`,
    `- Wiki pages: ${wikiEntries.length}`,
    "",
    "## Skills",
    "",
  ];

  for (const skillEntry of skills) {
    const skill = skillEntry.value;
    lines.push(`### ${skill.displayName ?? skill.name}`);
    lines.push("");
    lines.push(`- Id: ${skill.id}`);
    lines.push(`- Workflow: ${skill.workflow ?? "unknown"}`);
    lines.push(`- Trigger: ${truncateLine(skill.trigger || "none")}`);
    lines.push(`- Status: ${skill.status ?? "generated"}`);
    lines.push(`- Maturity: ${skill.maturity ?? "stable"}`);
    if (skill.evidenceCount) {
      lines.push(`- Evidence Count: ${skill.evidenceCount}`);
    }
    lines.push(`- Source: ${skillEntry.origin}`);
    if (skill.updatedAt) {
      lines.push(`- Updated: ${skill.updatedAt}`);
    }
    if (skill.lastUsedAt) {
      lines.push(`- Last Used: ${skill.lastUsedAt}`);
    }
    if (skill.author) {
      lines.push(`- Author: ${skill.author}`);
    }
    if (toArray(skill.notePaths).length === 0) {
      lines.push("- Notes: none");
    } else {
      lines.push("- Notes:");
      for (const notePath of toArray(skill.notePaths).sort(comparePaths)) {
        lines.push(`  - ${notePath}`);
      }
    }
    lines.push("");
  }

  lines.push("## Wiki Pages");
  lines.push("");

  const pageGroups = new Map();
  for (const entry of wikiEntries) {
    const group = wikiDocs.get(entry.relativePath)?.pageType ?? entry.pageType ?? "note";
    if (!pageGroups.has(group)) {
      pageGroups.set(group, []);
    }
    pageGroups.get(group).push(entry);
  }

  for (const pageType of WIKI_PAGE_TYPES) {
    const entries = sortByUpdatedAt(pageGroups.get(pageType) ?? [], wikiDocs);
    if (entries.length === 0) {
      continue;
    }

    lines.push(`### ${pageType.charAt(0).toUpperCase()}${pageType.slice(1)} Pages`);
    lines.push("");

    for (const pageEntry of entries) {
      const doc = wikiDocs.get(pageEntry.relativePath);
      lines.push(`#### ${doc?.title ?? path.basename(pageEntry.relativePath, ".md")}`);
      lines.push("");
      lines.push(`- Path: ${pageEntry.relativePath}`);
      lines.push(`- Type: ${doc?.pageType ?? pageEntry.pageType}`);
      lines.push(`- Source: ${pageEntry.origin}`);
      if (doc?.workflow) {
        lines.push(`- Workflow: ${doc.workflow}`);
      }
      if (doc?.status) {
        lines.push(`- Status: ${doc.status}`);
      }
      if (doc?.updatedAt) {
        lines.push(`- Updated: ${doc.updatedAt}`);
      }
      if (doc?.reviewAfter) {
        lines.push(`- Review After: ${doc.reviewAfter}`);
      }
      if (doc?.author) {
        lines.push(`- Author: ${doc.author}`);
      }
      if (pageType === "note" || pageType === "meta") {
        const linkedSkills = unique(noteUsage.get(pageEntry.relativePath) ?? []).sort(comparePaths);
        if (linkedSkills.length > 0) {
          lines.push("- Linked Skills:");
          for (const skillId of linkedSkills) {
            lines.push(`  - ${skillId}`);
          }
        } else {
          lines.push("- Linked Skills: none");
        }
      if (doc?.action) {
        lines.push(`- Action: ${truncateLine(doc.action)}`);
      }
      }
      if (doc?.related?.length > 0) {
        lines.push("- Related:");
        for (const relatedPath of doc.related.sort(comparePaths)) {
          lines.push(`  - ${relatedPath}`);
        }
      }
      if (doc?.sources?.length > 0) {
        lines.push("- Sources:");
        for (const sourcePath of doc.sources.sort(comparePaths)) {
          lines.push(`  - ${sourcePath}`);
        }
      }
      if (doc?.summary) {
        lines.push(`- Summary: ${truncateLine(doc.summary)}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderHotMarkdown({ config, skills, wikiEntries, wikiDocs, recentLogLines, backlogStatus = null }) {
  const generatedAt = new Date().toISOString();
  const recentSkills = [...skills]
    .sort((left, right) => parseTimestamp(right.value.updatedAt) - parseTimestamp(left.value.updatedAt))
    .slice(0, 3);
  const recentPages = sortByUpdatedAt(wikiEntries, wikiDocs).slice(0, 6);
  const nextReads = unique(
    recentPages.flatMap((entry) => {
      const doc = wikiDocs.get(entry.relativePath);
      return [...(doc?.related ?? []), ...(doc?.sources ?? [])];
    }),
  ).slice(0, 8);
  const lines = [
    "# Agent Wiki Hot Cache",
    "",
    `- Project: ${config.project.name}`,
    `- Generated: ${generatedAt}`,
    "",
    "## Recent Changes",
    "",
  ];

  if (recentLogLines.length === 0) {
    lines.push("- No recent changes recorded.");
  } else {
    lines.push(...recentLogLines);
  }

  if (backlogStatus?.maintenanceRecommended) {
    const oldest = backlogStatus.oldestUncoveredEvent?.timestamp
      ? `${backlogStatus.oldestUncoveredEvent.timestamp} | ${backlogStatus.oldestUncoveredEvent.path}`
      : "none";
    lines.push("");
    lines.push("## Maintenance Backlog");
    lines.push("");
    lines.push(`- Level: ${backlogStatus.policy.level}`);
    lines.push(`- Uncovered trace events: ${backlogStatus.uncoveredEvents}`);
    lines.push(`- Covered trace events: ${backlogStatus.coveredEvents}`);
    lines.push(`- Maintainable unresolved groups: ${backlogStatus.maintainableUnresolvedTraceGroupCount}`);
    lines.push(`- Oldest uncovered event: ${oldest}`);
    lines.push(`- Recommended command: ${backlogStatus.recommendedCommand}`);
  }

  lines.push("");
  lines.push("## Recently Updated Skills");
  lines.push("");
  if (recentSkills.length === 0) {
    lines.push("- No skills available.");
  } else {
    for (const skillEntry of recentSkills) {
      lines.push(`- ${skillEntry.value.displayName ?? skillEntry.value.name} | ${skillEntry.value.workflow ?? "unknown"} | ${truncateLine(skillEntry.value.trigger || skillEntry.value.description || "no trigger")}`);
    }
  }

  lines.push("");
  lines.push("## Recently Updated Pages");
  lines.push("");
  if (recentPages.length === 0) {
    lines.push("- No wiki pages available.");
  } else {
    for (const pageEntry of recentPages) {
      const doc = wikiDocs.get(pageEntry.relativePath);
      lines.push(`- ${doc?.pageType ?? pageEntry.pageType}: ${doc?.title ?? pageEntry.relativePath} | ${pageEntry.relativePath}`);
    }
  }

  lines.push("");
  lines.push("## Next Reads");
  lines.push("");
  if (nextReads.length === 0) {
    lines.push("- No linked follow-up pages.");
  } else {
    for (const nextRead of nextReads) {
      lines.push(`- ${nextRead}`);
    }
  }

  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderLogLine({ timestamp, action, detail, path: filePath }) {
  const parts = [formatTimestamp(timestamp), action];
  if (detail) {
    parts.push(truncateLine(detail));
  }
  if (filePath) {
    parts.push(filePath);
  }
  return `- ${parts.join(" | ")}`;
}

async function appendPackLog(config, cwd, sourcePath, entry) {
  const { hostWikiDir } = resolvePackPaths(config, { cwd, sourcePath });
  const logPath = path.join(hostWikiDir, "log.md");
  const header = "# Agent Wiki Log\n\n";
  const existing = await readTextIfPresent(logPath);
  const next = `${existing ?? header}${existing ? "\n" : ""}${renderLogLine(entry)}\n`;
  await ensureDir(hostWikiDir);
  await writeFile(logPath, next, "utf8");
  return logPath;
}

async function writeHotSnapshot(config, cwd, sourcePath) {
  const { hostWikiDir } = resolvePackPaths(config, { cwd, sourcePath });
  const [skills, wikiEntries, logContent, backlogStatus] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listWikiEntries(config, cwd, sourcePath),
    readTextIfPresent(path.join(hostWikiDir, "log.md")),
    listRecordedEvents(config, cwd, sourcePath).then((events) => {
      const stats = buildEventBacklogStats(events, config);
      const policy = evaluateBacklogPolicy(stats, config);
      const recommendedCommand = buildRecommendedMaintenanceCommand(config);
      return {
        ...stats,
        policy,
        maintenanceRecommended: policy.level !== "none",
        recommendedCommand,
        recommendedCommands: policy.level === "none" ? [] : [recommendedCommand],
      };
    }),
  ]);
  const wikiDocs = new Map();

  for (const entry of wikiEntries) {
    const content = await readFile(entry.filePath, "utf8");
    wikiDocs.set(entry.relativePath, parseNoteDoc(entry.relativePath, content, false));
  }

  const recentLogLines = (logContent ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .slice(-5);
  const hotPath = path.join(hostWikiDir, "hot.md");
  await ensureDir(hostWikiDir);
  await writeFile(
    hotPath,
    renderHotMarkdown({ config, skills, wikiEntries, wikiDocs, recentLogLines, backlogStatus }),
    "utf8",
  );
  return hotPath;
}

function renderLintMarkdown(result) {
  const lines = [
    "# Agent Wiki Lint",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- OK: ${result.ok}`,
    `- Issue Count: ${result.issueCount}`,
    "",
    "## Issues",
    "",
  ];

  if (result.issues.length === 0) {
    lines.push("- No issues found.");
  } else {
    for (const issue of result.issues) {
      const suffix = issue.path ? ` (${issue.path})` : "";
      lines.push(`- [${issue.level}] ${issue.code}: ${issue.message}${suffix}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function writeLintSnapshot(config, cwd, sourcePath, result) {
  const { hostWikiDir } = resolvePackPaths(config, { cwd, sourcePath });
  const lintPath = path.join(hostWikiDir, "lint.md");
  await ensureDir(hostWikiDir);
  await writeFile(lintPath, renderLintMarkdown(result), "utf8");
  return lintPath;
}

export async function refreshIndex(config, cwd = process.cwd(), sourcePath) {
  const { hostWikiDir } = resolvePackPaths(config, { cwd, sourcePath });
  const [skills, wikiEntries] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listWikiEntries(config, cwd, sourcePath),
  ]);
  const wikiDocs = new Map();

  for (const entry of wikiEntries) {
    const content = await readFile(entry.filePath, "utf8");
    wikiDocs.set(entry.relativePath, parseNoteDoc(entry.relativePath, content, false));
  }

  const indexPath = path.join(hostWikiDir, "index.md");
  await ensureDir(hostWikiDir);
  await writeFile(
    indexPath,
    renderIndexMarkdown({ config, skills, wikiEntries, wikiDocs }),
    "utf8",
  );
  return indexPath;
}

async function updateControlArtifacts(
  config,
  cwd = process.cwd(),
  sourcePath,
  { logEntry, lintResult } = {},
) {
  const indexPath = await refreshIndex(config, cwd, sourcePath);
  const logPath = logEntry
    ? await appendPackLog(config, cwd, sourcePath, logEntry)
    : null;
  const lintPath = lintResult
    ? await writeLintSnapshot(config, cwd, sourcePath, lintResult)
    : null;
  const hotPath = await writeHotSnapshot(config, cwd, sourcePath);

  return {
    indexPath,
    logPath,
    lintPath,
    hotPath,
  };
}

export async function refreshControlArtifacts(
  cwd = process.cwd(),
  { logEntry, lintResult } = {},
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  return updateControlArtifacts(config, cwd, sourcePath, { logEntry, lintResult });
}

export async function listLocalSkills(config, cwd = process.cwd(), sourcePath) {
  return listSkillEntries(config, cwd, sourcePath);
}

export async function listRecordedEvents(config, cwd = process.cwd(), sourcePath) {
  const { hostEventsDir, hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const eventFiles = await readDirJson(hostEventsDir);
  const entries = await Promise.all(
    eventFiles.map(async (filePath) => ({
      filePath,
      relativePath: normalizePath(path.relative(hostRoot, filePath)),
      value: await readJson(filePath),
    })),
  );

  return entries.sort((left, right) => parseTimestamp(right.value?.timestamp) - parseTimestamp(left.value?.timestamp));
}

export async function getLocalSkillById(config, skillId, cwd = process.cwd(), sourcePath) {
  if (!skillId) {
    return null;
  }

  const skills = await listLocalSkills(config, cwd, sourcePath);
  return skills.find(({ value }) => value.id === skillId || value.name === skillId) ?? null;
}

function tokenize(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    .filter((token) => !SEARCH_STOP_WORDS.has(token));
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "s",
  "so",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "use",
  "using",
  "we",
  "what",
  "when",
  "where",
  "which",
  "with",
]);
const UNKNOWN_WORKFLOW = "unknown";

function buildSkillQuerySections(skill) {
  return {
    primary: [
      skill.id,
      skill.name,
      skill.displayName,
      skill.trigger,
      skill.description,
      ...(skill.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    secondary: [
      skill.workflow,
      skill.body,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function normalizeSkillStatus(status) {
  if (typeof status !== "string") {
    return "generated";
  }
  return status.trim().toLowerCase() || "generated";
}

function isLocalSkillEligible(skill) {
  return !["archived", "inactive", "disabled", "deprecated", "demoted", "superseded"].includes(
    normalizeSkillStatus(skill?.status),
  );
}

function collectFieldPhraseMatches(taskText, fields) {
  if (!taskText) {
    return [];
  }

  return fields
    .flatMap(([label, value]) => {
      if (typeof value !== "string") {
        return [];
      }
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized.length < 4) {
        return [];
      }
      return (taskText === normalized || taskText.includes(normalized) || normalized.includes(taskText))
        ? [label]
        : [];
    });
}

function countRepoHintMatches(matches) {
  return matches.files.length + matches.prefixes.length + matches.packageSignals.length;
}

function parseGitChangedPaths(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((line) => {
      if (line.includes(" -> ")) {
        return line.split(" -> ").at(-1);
      }
      return line;
    })
    .filter(Boolean)
    .map(normalizePath);
}

async function collectRepoContext(cwd) {
  const [rootEntries, packageJsonText] = await Promise.all([
    readdir(cwd, { withFileTypes: true }).catch(() => []),
    readTextIfPresent(path.join(cwd, "package.json")),
  ]);

  const rootPaths = rootEntries.map((entry) => normalizePath(entry.name));
  const packageJson = packageJsonText ? JSON.parse(packageJsonText) : null;
  const packageSignals = packageJson
    ? [
        packageJson.name,
        packageJson.description,
        ...Object.keys(packageJson.scripts ?? {}),
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.devDependencies ?? {}),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
    : [];

  const gitStatus = spawnSync("git", ["status", "--short"], {
    cwd,
    encoding: "utf8",
  });

  const changedPaths = gitStatus.status === 0
    ? parseGitChangedPaths(gitStatus.stdout)
    : [];

  return {
    rootPaths,
    changedPaths,
    packageSignals,
  };
}

function collectRepoHintMatches(skill, repoContext) {
  const hints = skill.repoHints;
  if (!isRecord(hints)) {
    return {
      files: [],
      prefixes: [],
      packageSignals: [],
    };
  }

  const changed = repoContext.changedPaths;
  const root = repoContext.rootPaths;
  const packageSignals = repoContext.packageSignals;
  const matches = {
    files: [],
    prefixes: [],
    packageSignals: [],
  };

  for (const file of toArray(hints.files)) {
    const normalized = normalizePath(String(file));
    if (changed.includes(normalized) || root.includes(normalized)) {
      matches.files.push(normalized);
    }
  }

  for (const prefix of toArray(hints.pathPrefixes)) {
    const normalized = normalizePath(String(prefix));
    if (
      changed.some((value) => value.startsWith(normalized))
      || root.some((value) => value.startsWith(normalized.replace(/\/$/, "")))
    ) {
      matches.prefixes.push(normalized);
    }
  }

  for (const signal of toArray(hints.packageSignals)) {
    const token = String(signal).toLowerCase();
    if (packageSignals.includes(token)) {
      matches.packageSignals.push(token);
    }
  }

  return matches;
}

function evaluateSkillCandidate(skill, query, repoContext) {
  if (!isLocalSkillEligible(skill)) {
    return null;
  }

  const explicitSkillMatch = Boolean(
    query.skill && (skill.id === query.skill || skill.name === query.skill),
  );
  if (query.skill && !explicitSkillMatch) {
    return null;
  }

  const workflowMatch = Boolean(query.workflow && skill.workflow === query.workflow);
  if (query.workflow && !explicitSkillMatch && !workflowMatch) {
    return null;
  }

  const taskText = [query.task, query.step].filter(Boolean).join(" ").trim().toLowerCase();
  const queryTokens = [...new Set(tokenize(taskText))];
  const sections = buildSkillQuerySections(skill);
  const primaryMatches = unique(queryTokens.filter((token) => sections.primary.includes(token))).slice(0, 5);
  const secondaryMatches = unique(queryTokens.filter((token) => sections.secondary.includes(token))).slice(0, 5);
  const fieldPhraseMatches = collectFieldPhraseMatches(taskText, [
    ["skill id", skill.id],
    ["skill name", skill.name],
    ["display name", skill.displayName],
    ["trigger", skill.trigger],
    ["description", skill.description],
  ]);
  const repoHintMatches = collectRepoHintMatches(skill, repoContext);
  const repoHintCount = countRepoHintMatches(repoHintMatches);
  const hasTaskContext = taskText.length > 0;

  let admitted = explicitSkillMatch;
  if (!admitted) {
    if (!hasTaskContext) {
      admitted = false;
    } else if (fieldPhraseMatches.length > 0) {
      admitted = true;
    } else if (workflowMatch) {
      admitted = primaryMatches.length >= 2;
    } else {
      admitted = primaryMatches.length >= 2 || (primaryMatches.length >= 1 && secondaryMatches.length >= 1);
    }
  }

  if (!admitted) {
    return null;
  }

  const whyMatched = [];
  if (explicitSkillMatch) {
    whyMatched.push("explicit_skill_match");
  }
  if (workflowMatch) {
    whyMatched.push("workflow_match");
  }
  if (fieldPhraseMatches.length > 0) {
    whyMatched.push("field_phrase_match");
  }
  if (primaryMatches.length > 0) {
    whyMatched.push("primary_term_overlap");
  } else if (secondaryMatches.length > 0) {
    whyMatched.push("secondary_term_overlap");
  }
  if (repoHintMatches.files.length > 0) {
    whyMatched.push("repo_hint_file_match");
  }
  if (repoHintMatches.prefixes.length > 0) {
    whyMatched.push("repo_hint_path_prefix_match");
  }
  if (repoHintMatches.packageSignals.length > 0) {
    whyMatched.push("repo_hint_package_signal_match");
  }

  return {
    explicitSkillMatch,
    workflowMatch,
    fieldPhraseCount: unique(fieldPhraseMatches).length,
    primaryMatchCount: primaryMatches.length,
    secondaryMatchCount: secondaryMatches.length,
    repoHintCount,
    whyMatched,
  };
}

function compareSkillCandidates(left, right) {
  if (right.match.explicitSkillMatch !== left.match.explicitSkillMatch) {
    return Number(right.match.explicitSkillMatch) - Number(left.match.explicitSkillMatch);
  }
  if (right.match.workflowMatch !== left.match.workflowMatch) {
    return Number(right.match.workflowMatch) - Number(left.match.workflowMatch);
  }
  if (right.match.fieldPhraseCount !== left.match.fieldPhraseCount) {
    return right.match.fieldPhraseCount - left.match.fieldPhraseCount;
  }
  if (right.match.primaryMatchCount !== left.match.primaryMatchCount) {
    return right.match.primaryMatchCount - left.match.primaryMatchCount;
  }
  if (right.match.secondaryMatchCount !== left.match.secondaryMatchCount) {
    return right.match.secondaryMatchCount - left.match.secondaryMatchCount;
  }
  if (right.match.repoHintCount !== left.match.repoHintCount) {
    return right.match.repoHintCount - left.match.repoHintCount;
  }
  return left.skill.id.localeCompare(right.skill.id);
}

function isAuthoritativeSkillMatch(match) {
  if (!match || typeof match !== "object") {
    return false;
  }

  return Boolean(
    match.explicitSkillMatch
      || match.fieldPhraseCount > 0,
  );
}

async function readTextIfPresent(filePath) {
  return (await fileExists(filePath)) ? readFile(filePath, "utf8") : null;
}

async function loadNoteDoc(cwd, sourcePath, notePath, includeContent) {
  const resolvedNote = await resolvePatternFile(notePath, cwd, sourcePath);
  if (!resolvedNote) {
    throw new Error(`Note not found: ${notePath}`);
  }

  const content = await readFile(resolvedNote.filePath, "utf8");
  return {
    ...parseNoteDoc(resolvedNote.relativePath, content, includeContent),
    filePath: resolvedNote.filePath,
    origin: resolvedNote.origin,
  };
}

function buildLoopGuidance(noteDocs, whyMatched) {
  const supportingNotes = noteDocs.map((doc) => ({
    path: doc.path,
    title: doc.title,
    interpretation: doc.interpretation || null,
    action: doc.action || null,
    related: doc.related ?? [],
    sources: doc.sources ?? [],
  }));
  return {
    whyMatched,
    whatToDoNow: unique(noteDocs.map((doc) => doc.action).filter(Boolean)),
    watchFor: unique(noteDocs.map((doc) => doc.signal).filter(Boolean)),
    interpretations: unique(noteDocs.map((doc) => doc.interpretation).filter(Boolean)),
    nextReads: unique(
      noteDocs.flatMap((doc) => [...(doc.related ?? []), ...(doc.sources ?? [])]),
    ),
    supportingNotes,
  };
}

function buildNoteQuerySections(note) {
  return {
    primary: [
      note.title,
      note.whenToUse,
      note.signal,
      ...(note.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    secondary: [
      note.interpretation,
      note.action,
      note.summary,
      ...(note.examples ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    tertiary: [
      note.evidence,
      ...(note.related ?? []),
      ...(note.sources ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function normalizeNoteStatus(status) {
  if (typeof status !== "string") {
    return "active";
  }
  return status.trim().toLowerCase() || "active";
}

function isDirectNoteEligible(note) {
  return !["archived", "inactive", "disabled", "deprecated"].includes(normalizeNoteStatus(note.status));
}

function compareRetrievedNotes(left, right) {
  if (left.match.explicitSkillLink !== right.match.explicitSkillLink) {
    return Number(right.match.explicitSkillLink) - Number(left.match.explicitSkillLink);
  }
  if (left.match.titleMatch !== right.match.titleMatch) {
    return Number(right.match.titleMatch) - Number(left.match.titleMatch);
  }
  if (left.match.sectionPhraseCount !== right.match.sectionPhraseCount) {
    return right.match.sectionPhraseCount - left.match.sectionPhraseCount;
  }
  if (left.match.workflowMatch !== right.match.workflowMatch) {
    return Number(right.match.workflowMatch) - Number(left.match.workflowMatch);
  }
  if (left.match.primaryMatchCount !== right.match.primaryMatchCount) {
    return right.match.primaryMatchCount - left.match.primaryMatchCount;
  }
  if (left.match.secondaryMatchCount !== right.match.secondaryMatchCount) {
    return right.match.secondaryMatchCount - left.match.secondaryMatchCount;
  }
  const updatedAtDelta = parseTimestamp((right.noteDoc ?? right.note ?? {}).updatedAt)
    - parseTimestamp((left.noteDoc ?? left.note ?? {}).updatedAt);
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }
  return String((left.noteDoc ?? left.note ?? {}).path ?? "")
    .localeCompare(String((right.noteDoc ?? right.note ?? {}).path ?? ""));
}

function explainNoteMatch(note, query) {
  const reasons = [];

  if (!isDirectNoteEligible(note)) {
    reasons.push("note_status_filtered");
    return reasons;
  }

  if (query.workflow && note.workflow === query.workflow) {
    reasons.push("workflow_match");
  }

  if (query.skill && note.skillId === query.skill) {
    reasons.push("skill_linked_note");
  }

  const taskText = typeof query.task === "string" ? query.task.trim().toLowerCase() : "";
  const sections = buildNoteQuerySections(note);
  if (taskText) {
    if (note.title && (taskText.includes(note.title.toLowerCase()) || note.title.toLowerCase().includes(taskText))) {
      reasons.push("title_match");
    }
    if (note.whenToUse && note.whenToUse.toLowerCase().includes(taskText)) {
      reasons.push("when_to_use_match");
    }
    if (note.signal && note.signal.toLowerCase().includes(taskText)) {
      reasons.push("signal_match");
    }
    if (note.action && note.action.toLowerCase().includes(taskText)) {
      reasons.push("action_match");
    }
  }

  const queryTokens = tokenize([query.task, query.step].filter(Boolean).join(" "));
  const matchedTokens = unique(queryTokens.filter((token) =>
    sections.primary.includes(token)
    || sections.secondary.includes(token)
    || sections.tertiary.includes(token),
  )).slice(0, 5);
  if (matchedTokens.length > 0) {
    reasons.push("note_term_overlap");
  }

  return reasons;
}

function evaluateNoteCandidate(note, query) {
  if (!isDirectNoteEligible(note)) {
    return null;
  }

  if (query.workflow && note.workflow && note.workflow !== query.workflow) {
    return null;
  }

  const sections = buildNoteQuerySections(note);
  const taskText = typeof query.task === "string" ? query.task.trim().toLowerCase() : "";
  const queryTokens = [...new Set(tokenize([query.task, query.step].filter(Boolean).join(" ")))];
  const workflowMatch = Boolean(query.workflow && note.workflow === query.workflow);
  const explicitSkillLink = Boolean(query.skill && note.skillId === query.skill);
  const titleMatch = Boolean(
    taskText
    && note.title
    && (note.title.toLowerCase() === taskText
      || taskText.includes(note.title.toLowerCase())
      || note.title.toLowerCase().includes(taskText)),
  );
  const sectionPhraseMatches = collectFieldPhraseMatches(taskText, [
    ["when-to-use", note.whenToUse],
    ["signal", note.signal],
    ["action", note.action],
  ]);
  const primaryMatches = unique(queryTokens.filter((token) => sections.primary.includes(token))).slice(0, 5);
  const secondaryMatches = unique(queryTokens.filter((token) => sections.secondary.includes(token))).slice(0, 5);
  const hasTaskContext = taskText.length > 0;
  const strongMatch = explicitSkillLink || titleMatch || sectionPhraseMatches.length > 0;
  const fallbackMatch = !strongMatch && (
    !hasTaskContext
      ? workflowMatch
      : primaryMatches.length >= 2 || (primaryMatches.length >= 1 && secondaryMatches.length >= 1)
  );

  if (!strongMatch && !fallbackMatch) {
    return null;
  }

  return {
    whyMatched: explainNoteMatch(note, query),
    match: {
      explicitSkillLink,
      titleMatch,
      workflowMatch,
      strongMatch,
      sectionPhraseCount: sectionPhraseMatches.length,
      primaryMatchCount: primaryMatches.length,
      secondaryMatchCount: secondaryMatches.length,
    },
  };
}

function getConfiguredNotesBackend(config) {
  return config.retrieval?.notesBackend ?? "native";
}

function buildDirectNoteQueryText(query) {
  return [query.workflow, query.skill, query.task, query.step]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

async function listParsedNoteEntries(config, cwd, sourcePath, includeContent) {
  const wikiEntries = await listWikiEntries(config, cwd, sourcePath);
  const noteEntries = wikiEntries.filter((entry) => entry.pageType === "note");
  return Promise.all(
    noteEntries.map(async (entry) => ({
      filePath: entry.filePath,
      origin: entry.origin,
      note: parseNoteDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), includeContent),
    })),
  );
}

async function searchNotesWithNative(config, cwd, sourcePath, query, limit, includeContent) {
  const parsedNotes = await listParsedNoteEntries(config, cwd, sourcePath, includeContent);
  const candidates = parsedNotes
    .map((item) => ({
      ...item,
      evaluated: evaluateNoteCandidate(item.note, query),
    }))
    .filter((item) => item.evaluated)
    .map((item) => ({
      notePath: item.note.path,
      noteOrigin: item.origin,
      noteDoc: item.note,
      whyMatched: item.evaluated.whyMatched,
      match: item.evaluated.match,
    }));
  const strongOnly = candidates.some((item) => item.match.strongMatch)
    ? candidates.filter((item) => item.match.strongMatch)
    : candidates;
  return strongOnly
    .sort(compareRetrievedNotes)
    .slice(0, limit)
    .map(({ notePath, noteOrigin, noteDoc, whyMatched, match }) => ({
      notePath,
      noteOrigin,
      noteDoc,
      whyMatched,
      match,
    }));
}

function buildQmdNotesCollectionName(config, cwd, sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const projectKey = slugify(config.project.id || config.project.name || "repo");
  const repoHash = createHash("sha1").update(paths.hostRoot).digest("hex").slice(0, 12);
  return `datalox-${projectKey}-${repoHash}-notes`;
}

function resolveQmdBin() {
  return process.env[QMD_BIN_ENV] || "qmd";
}

function runQmdCommand(args, cwd) {
  const result = spawnSync(resolveQmdBin(), args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      [
        `QMD command failed: ${resolveQmdBin()} ${args.join(" ")}`,
        stderr ? `stderr: ${stderr}` : null,
        stdout ? `stdout: ${stdout}` : null,
      ].filter(Boolean).join("\n"),
    );
  }
  return result;
}

function collectionListContainsName(output, name) {
  const pattern = new RegExp(`^${name}\\b`, "m");
  return pattern.test(output);
}

async function ensureQmdNotesCollection(config, cwd, sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const notesDir = paths.hostNotesDir;
  if (!(await fileExists(notesDir))) {
    throw new Error(`QMD notes collection root does not exist: ${notesDir}`);
  }

  const collectionName = buildQmdNotesCollectionName(config, cwd, sourcePath);
  const listed = runQmdCommand(["collection", "list"], cwd).stdout ?? "";
  if (!collectionListContainsName(listed, collectionName)) {
    runQmdCommand(
      ["collection", "add", notesDir, "--name", collectionName, "--mask", "**/*.md"],
      cwd,
    );
    return {
      backend: "qmd",
      collectionName,
      notesDir,
      action: "created",
    };
  }

  return {
    backend: "qmd",
    collectionName,
    notesDir,
    action: "existing",
  };
}

export async function syncNoteRetrieval(cwd = process.cwd()) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const backend = getConfiguredNotesBackend(config);
  if (backend !== "qmd") {
    return {
      backend,
      synced: false,
      reason: "native backend does not require index sync",
    };
  }

  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const collectionName = buildQmdNotesCollectionName(config, cwd, sourcePath);
  const notesDir = paths.hostNotesDir;
  if (!(await fileExists(notesDir))) {
    throw new Error(`QMD notes collection root does not exist: ${notesDir}`);
  }

  const listed = runQmdCommand(["collection", "list"], cwd).stdout ?? "";
  const existed = collectionListContainsName(listed, collectionName);
  if (existed) {
    runQmdCommand(["collection", "remove", collectionName], cwd);
  }
  runQmdCommand(
    ["collection", "add", notesDir, "--name", collectionName, "--mask", "**/*.md"],
    cwd,
  );

  const noteFiles = await readDirMarkdown(notesDir);
  return {
    backend,
    synced: true,
    action: existed ? "refreshed" : "created",
    collectionName,
    notesDir: normalizePath(path.relative(cwd, notesDir) || "."),
    noteFileCount: noteFiles.length,
  };
}

function mapQmdResultToNotePath(collectionName, hostNotesDir, hostRoot, qmdFile) {
  if (typeof qmdFile !== "string" || !qmdFile.startsWith("qmd://")) {
    return null;
  }
  const raw = qmdFile.slice("qmd://".length);
  const prefix = `${collectionName}/`;
  if (!raw.startsWith(prefix)) {
    return null;
  }
  const relativeWithinNotes = raw.slice(prefix.length);
  const hostNotesRelativeDir = normalizePath(path.relative(hostRoot, hostNotesDir));
  return normalizePath(path.join(hostNotesRelativeDir, relativeWithinNotes));
}

async function searchNotesWithQmd(config, cwd, sourcePath, query, limit, includeContent) {
  const queryText = buildDirectNoteQueryText(query);
  if (!queryText) {
    return [];
  }

  const ensured = await ensureQmdNotesCollection(config, cwd, sourcePath);
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const result = runQmdCommand(
    ["query", "--json", "-n", String(limit), "-c", ensured.collectionName, queryText],
    cwd,
  );
  const parsed = JSON.parse(result.stdout || "[]");
  if (!Array.isArray(parsed)) {
    throw new Error("QMD query output must be a JSON array");
  }

  const candidates = new Map();
  for (const item of parsed) {
    if (!isRecord(item)) {
      continue;
    }
    const notePath = mapQmdResultToNotePath(
      ensured.collectionName,
      paths.hostNotesDir,
      paths.hostRoot,
      item.file,
    );
    if (!notePath) {
      continue;
    }
    const noteDoc = await loadNoteDoc(cwd, sourcePath, notePath, includeContent);
    const evaluated = evaluateNoteCandidate(noteDoc, query);
    if (!evaluated) {
      continue;
    }
    const candidate = {
      notePath: noteDoc.path,
      noteOrigin: noteDoc.origin,
      noteDoc,
      whyMatched: evaluated.whyMatched,
      match: evaluated.match,
    };
    const existing = candidates.get(noteDoc.path);
    if (!existing || compareRetrievedNotes(candidate, existing) < 0) {
      candidates.set(noteDoc.path, candidate);
    }
  }

  const ranked = Array.from(candidates.values());
  const strongOnly = ranked.some((item) => item.match.strongMatch)
    ? ranked.filter((item) => item.match.strongMatch)
    : ranked;
  return strongOnly
    .sort(compareRetrievedNotes)
    .slice(0, limit);
}

async function retrieveDirectNotes(config, cwd, sourcePath, query, limit, includeContent) {
  const backend = getConfiguredNotesBackend(config);
  if (backend === "qmd") {
    return {
      backend,
      directNotes: await searchNotesWithQmd(config, cwd, sourcePath, query, limit, includeContent),
    };
  }
  return {
    backend: "native",
    directNotes: await searchNotesWithNative(config, cwd, sourcePath, query, limit, includeContent),
  };
}

function buildNoteIdentity({
  id,
  fingerprint,
  workflow,
  skillId,
  title,
  signal,
  summary,
  task,
  step,
}) {
  if (id) {
    return slugify(id);
  }

  if (fingerprint) {
    const [fingerprintWorkflow, fingerprintSeed] = String(fingerprint).split("::");
    return slugify(`${fingerprintWorkflow ?? workflow ?? "unknown"}-${fingerprintSeed ?? "note"}`);
  }

  const seed = firstNonEmpty([signal, summary, task, step, title, skillId, workflow, "note"]) ?? "note";
  return slugify(`${workflow ?? "unknown"}-${seed}`);
}

function buildNoteIdentityFromStabilityKey(stabilityKey) {
  if (typeof stabilityKey !== "string" || stabilityKey.trim().length === 0) {
    return null;
  }
  const [workflow, seed] = stabilityKey.split("::");
  if (!seed || seed.trim().length === 0) {
    return null;
  }
  return slugify(`${workflow ?? "unknown"}-${seed}`);
}

function buildNoteIdentityKey({
  id,
  fingerprint,
  workflow,
  skillId,
  title,
  signal,
  summary,
  task,
  step,
}) {
  const effectiveWorkflow = workflow ?? "unknown";
  return `${effectiveWorkflow}::${buildNoteIdentity({
    id,
    fingerprint,
    workflow,
    skillId,
    title,
    signal,
    summary,
    task,
    step,
  })}`;
}

function buildParsedNoteIdentityKey(note) {
  return buildNoteIdentityKey({
    id: note.id ?? undefined,
    workflow: note.workflow ?? undefined,
    title: note.title,
    signal: note.signal,
    summary: note.summary,
  });
}

async function findExistingNoteByIdentity(config, cwd, sourcePath, identityKey) {
  const wikiEntries = await listWikiEntries(config, cwd, sourcePath);
  for (const entry of wikiEntries) {
    if (entry.pageType !== "note") {
      continue;
    }
    const parsed = parseNoteDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), false);
    if (buildParsedNoteIdentityKey(parsed) === identityKey) {
      return {
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        note: parsed,
      };
    }
  }
  return null;
}

export async function resolveLocalKnowledge(
  {
    task,
    workflow,
    step,
    skill,
    limit = 3,
    includeContent = false,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath, localOverridePath } = await loadAgentConfig(cwd);
  const [localSkills, repoContext] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    collectRepoContext(cwd),
  ]);

  const ranked = localSkills
    .map(({ filePath, value, origin, repoRoot }) => {
      const match = evaluateSkillCandidate(
        value,
        {
          task,
          workflow,
          step,
          skill,
        },
        repoContext,
      );
      return match
        ? {
            filePath,
            origin,
            repoRoot,
            skill: value,
            match,
          }
        : null;
    })
    .filter(Boolean)
    .sort(compareSkillCandidates)
    .slice(0, limit);

  const directNoteQuery = {
    task,
    workflow,
    step,
    skill,
  };
  const directNoteResolution = ranked.length === 0
    ? await retrieveDirectNotes(config, cwd, sourcePath, directNoteQuery, limit, includeContent)
    : {
      backend: getConfiguredNotesBackend(config),
      directNotes: [],
    };
  const directNotes = directNoteResolution.directNotes;

  const selectionBasis = skill
    ? "explicit_skill"
    : directNotes.length > 0 && ranked.length === 0
      ? "direct_note_query"
    : task || step || workflow
      ? "task_query"
      : "repo_context";

  const effectiveWorkflow = workflow
    || ranked[0]?.skill.workflow
    || directNotes[0]?.noteDoc.workflow
    || (selectionBasis === "repo_context" ? UNKNOWN_WORKFLOW : config.runtime.defaultWorkflow);

  const matches = await Promise.all(
    ranked.map(async (item) => {
      const noteResults = await Promise.all(
        toArray(item.skill.notePaths).map(async (notePath) => {
          try {
            return {
              ok: true,
              notePath,
              doc: await loadNoteDoc(cwd, sourcePath, notePath, includeContent),
            };
          } catch {
            return {
              ok: false,
              notePath,
              doc: null,
            };
          }
        }),
      );
      const linkedNotes = noteResults.filter((result) => result.ok).map((result) => result.doc);
      const missingNotePaths = noteResults.filter((result) => !result.ok).map((result) => result.notePath);
      return {
        skillPath: item.filePath,
        skillOrigin: item.origin,
        skill: item.skill,
        linkedNotes,
        missingNotePaths,
        authoritativeMatch: isAuthoritativeSkillMatch(item.match),
        readPath: KNOWLEDGE_MODEL.normalReadPath,
        loopGuidance: buildLoopGuidance(linkedNotes, item.match.whyMatched),
      };
    }),
  );

  const directNoteMatches = directNotes.map((entry) => ({
    notePath: entry.notePath,
    noteOrigin: entry.noteOrigin,
    note: entry.noteDoc ?? entry.note,
    whyMatched: entry.whyMatched,
  }));
  const authoritativeMatch = matches.find((entry) => entry.authoritativeMatch) ?? null;
  const matchedSkillId = authoritativeMatch?.skill.id ?? null;
  const matchedNotePaths = authoritativeMatch?.linkedNotes?.map((entry) => entry.path) ?? [];

  return {
    mode: config.mode,
    runtimeEnabled: config.runtime.enabled,
    detectOnEveryLoop: config.agent.detectOnEveryLoop,
    nativeSkillPolicy: config.agent.nativeSkillPolicy,
    directNoteBackend: directNoteResolution.backend,
    selectionBasis,
    configPath: sourcePath,
    localOverridePath,
    workflow: effectiveWorkflow,
    knowledgeModel: KNOWLEDGE_MODEL,
    repoContext,
    matches,
    matchedSkillId,
    matchedNotePaths,
    directNoteMatches,
    loopGuidance: ranked.length === 0
      ? buildLoopGuidance(
        directNoteMatches.map((entry) => entry.note),
        unique(directNoteMatches.flatMap((entry) => entry.whyMatched)),
      )
      : null,
  };
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeStableTextFile(baseDir, stem, content) {
  await ensureDir(baseDir);
  const filePath = path.join(baseDir, `${slugify(stem)}.md`);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function resolveAuthor() {
  return process.env[AUTHOR_ENV] || process.env.USER || "unknown";
}

export async function writeNoteDoc(
  {
    id,
    fingerprint,
    title,
    workflow,
    signal,
    interpretation,
    recommendedAction,
    summary,
    task,
    step,
    skillId,
    related = [],
    sources = [],
    examples = [],
    evidence = [],
    tags = [],
    kind = "workflow_note",
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const { hostNotesDir, hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const identityKey = buildNoteIdentityKey({
    id,
    fingerprint,
    workflow,
    skillId,
    title,
    signal,
  });
  const stableId = buildNoteIdentity({
    id,
    fingerprint,
    workflow,
    skillId,
    title,
    signal,
  });
  const author = resolveAuthor();
  const updatedAt = new Date().toISOString();
  const defaultFilePath = path.join(hostNotesDir, `${slugify(stableId)}.md`);
  const identityMatch = !(await fileExists(defaultFilePath))
    ? await findExistingNoteByIdentity(config, cwd, sourcePath, identityKey)
    : null;
  const filePath = identityMatch?.filePath ?? defaultFilePath;
  const operation = (await fileExists(filePath)) ? "update_note" : "create_note";
  const existingNote = operation === "update_note"
    ? (identityMatch?.note ?? parseNoteDoc(normalizePath(path.relative(hostRoot, filePath)), await readFile(filePath, "utf8"), false))
    : null;
  const existingUsage = existingNote?.usage ?? null;
  const titleText = firstNonEmpty([
    normalizeMaintenanceTextCandidate(title, 140),
    normalizeMaintenanceTextCandidate(existingNote?.title, 140),
    String(existingNote?.title ?? title ?? "").trim(),
  ]) ?? String(existingNote?.title ?? title ?? "").trim();
  const signalText = firstNonEmpty([
    normalizeMaintenanceTextCandidate(signal, 180),
    normalizeMaintenanceTextCandidate(existingNote?.signal, 180),
    titleText,
  ]) ?? titleText;
  const interpretationText = firstNonEmpty([
    normalizeMaintenanceTextCandidate(interpretation, 180),
    normalizeMaintenanceTextCandidate(existingNote?.interpretation, 180),
    summary ? `This ${workflow} loop keeps converging on ${shortenSentence(summary, 100)}.` : null,
    `This note captures a repeated ${workflow} decision around ${signalText.toLowerCase()}.`,
  ])?.trim() ?? "";
  const action = firstNonEmpty([
    !isGenericMaintenanceAction(recommendedAction) ? normalizeMaintenanceTextCandidate(recommendedAction, 180) : null,
    !isGenericMaintenanceAction(existingNote?.action) ? normalizeMaintenanceTextCandidate(existingNote?.action, 180) : null,
    task ? `Check this note before repeating ${task}.` : null,
    step ? `Check this note before repeating ${step}.` : null,
    `Check this note before repeating the same ${workflow} loop.`,
  ])?.trim() ?? "";
  const whenToUseText = buildWhenToUseText({
    existingWhenToUse: containsMaintenanceProtocolNoise(existingNote?.whenToUse) ? null : existingNote?.whenToUse,
    signal: signalText,
    summary,
    title: titleText,
    task,
    step,
    workflow,
  });
  const mergedRelated = normalizeNoteBullets([...(related ?? []), ...(existingNote?.related ?? [])], 4, 160);
  const mergedSources = unique([...(sources ?? []), ...(existingNote?.sources ?? [])]);
  const mergedTags = unique([...(existingNote?.tags ?? []), ...(tags ?? [])]);
  const mergedExamples = normalizeNoteBullets([...(examples ?? []), ...(existingNote?.examples ?? [])], 2, 180);
  const mergedEvidence = normalizeNoteBullets(
    [...(evidence ?? []), ...(existingNote?.evidenceLines ?? []), ...(sources ?? [])],
    3,
    180,
  );
  const content = [
    "---",
    renderFrontmatterValue("type", "note"),
    renderFrontmatterValue("id", stableId),
    renderFrontmatterValue("title", titleText),
    renderFrontmatterValue("kind", existingNote?.kind ?? kind),
    renderFrontmatterValue("workflow", workflow),
    (existingNote?.skillId ?? skillId) ? renderFrontmatterValue("skill", existingNote?.skillId ?? skillId) : null,
    renderFrontmatterValue("tags", mergedTags),
    renderFrontmatterValue("confidence", "medium"),
    renderFrontmatterValue("status", "active"),
    renderFrontmatterValue("related", mergedRelated),
    renderFrontmatterValue("sources", mergedSources),
    existingUsage ? renderFrontmatterValue("usage", existingUsage) : null,
    renderFrontmatterValue("author", author),
    renderFrontmatterValue("updated", updatedAt),
    "---",
    "",
    `# ${titleText}`,
    "",
    "## When to Use",
    "",
    whenToUseText,
    "",
    "## Signal",
    "",
    signalText,
    "",
    "## Interpretation",
    "",
    interpretationText,
    "",
    "## Action",
    "",
    action,
    "",
    ...renderOptionalListSection("## Examples", mergedExamples),
    ...renderOptionalListSection("## Evidence", mergedEvidence),
    ...renderOptionalListSection("## Related", mergedRelated),
  ]
    .filter(Boolean)
    .join("\n");

  await ensureDir(hostNotesDir);
  await writeFile(filePath, content, "utf8");
  const relativePath = normalizePath(path.relative(hostRoot, filePath));
  const artifacts = await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: operation,
      detail: `${title} for ${workflow}`,
      path: relativePath,
    },
  });

  return {
    filePath,
    relativePath,
    operation,
    payload: {
      version: 1,
      id: stableId,
      title: titleText,
      kind: existingNote?.kind ?? kind,
      workflow,
      signal: signalText,
      interpretation: interpretationText,
      action,
      recommendedAction: action,
      skillId: existingNote?.skillId ?? skillId ?? null,
      related: mergedRelated,
      sources: mergedSources,
      tags: mergedTags,
      examples: mergedExamples,
      evidence: mergedEvidence,
      author,
      updatedAt,
    },
    artifacts,
  };
}

function derivePromotedNoteKind(sourceKind) {
  return sourceKind && sourceKind !== "trace"
    ? sourceKind
    : "workflow_note";
}

export const writePatternDoc = writeNoteDoc;

export async function writeSkill(
  {
    id,
    filePath,
    name,
    displayName,
    workflow,
    trigger,
    description,
    notePaths = [],
    repoHints,
    tags = [],
    status,
    maturity,
    evidenceCount,
    lastUsedAt,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const { hostSkillsDir } = resolvePackPaths(config, { cwd, sourcePath });
  const stableId = id ?? `${workflow}.${slugify(name)}`;
  const stableName = name ?? slugify(displayName ?? stableId);
  const existingById = await getLocalSkillById(config, stableId, cwd, sourcePath);
  const existingByName = !existingById && stableName
    ? await getLocalSkillById(config, stableName, cwd, sourcePath)
    : null;
  const existingEntry = existingById ?? existingByName;
  const requestedFilePath = filePath
    ? (path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath))
    : null;
  const resolvedFilePath = requestedFilePath && isWithinDir(requestedFilePath, hostSkillsDir)
    ? requestedFilePath
    : existingEntry?.origin === "host"
      ? existingEntry.filePath
      : path.join(hostSkillsDir, slugify(stableName), "SKILL.md");
  const existing = existingEntry?.value ?? (
    (await fileExists(resolvedFilePath))
      ? parseSkillDoc(resolvedFilePath, await readFile(resolvedFilePath, "utf8"))
      : null
  );
  const operation = existing ? "update_skill" : "create_skill";

  const payload = {
    id: stableId,
    name: stableName,
    displayName: displayName ?? stableName,
    workflow,
    trigger,
    description,
    notePaths: unique([...(existing?.notePaths ?? []), ...notePaths]),
    repoHints: repoHints ?? existing?.repoHints,
    tags: unique([...(existing?.tags ?? []), ...tags]),
    status: status ?? existing?.status ?? "generated",
    maturity: maturity ?? existing?.maturity ?? "stable",
    evidenceCount: Math.max(
      Number.isInteger(existing?.evidenceCount) ? existing.evidenceCount : 0,
      Number.isInteger(evidenceCount) ? evidenceCount : 0,
    ),
    lastUsedAt: lastUsedAt ?? existing?.lastUsedAt ?? null,
    author: resolveAuthor(),
    updatedAt: new Date().toISOString(),
  };

  await ensureDir(path.dirname(resolvedFilePath));
  const content = renderSkillMarkdown(payload);
  const writtenFilePath = await writeFile(resolvedFilePath, content, "utf8").then(() => resolvedFilePath);
  const artifacts = await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: operation,
      detail: operation === "create_skill"
        ? `${payload.id} created with ${payload.notePaths.length} note(s)`
        : `${payload.id} updated with ${payload.notePaths.length} note(s)`,
      path: normalizePath(path.relative(resolvePackPaths(config, { cwd, sourcePath }).hostRoot, writtenFilePath)),
    },
  });

  return {
    filePath: writtenFilePath,
    payload,
    operation,
    artifacts,
  };
}

function isGenericMaintenanceAction(value) {
  return typeof value === "string"
    && /^(check|reuse) this note\b/i.test(value.trim());
}

const MAINTENANCE_PROTOCOL_MARKERS = [
  "# wrapped prompt",
  "# datalox loop guidance",
  "# datalox reusable-gap protocol",
  "# original prompt",
  "selection basis:",
  "matched skill:",
  "datalox_summary:",
  "datalox_title:",
  "datalox_signal:",
  "datalox_interpretation:",
  "datalox_action:",
  "datalox_decision:",
  "datalox_skill:",
];

function containsMaintenanceProtocolNoise(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return MAINTENANCE_PROTOCOL_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeMaintenanceTextCandidate(value, maxLength = 160) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || containsMaintenanceProtocolNoise(normalized)) {
    return null;
  }
  return truncateLine(normalized, maxLength);
}

function normalizeReusableBoundaryText(value, maxLength = 120) {
  const normalized = normalizeMaintenanceTextCandidate(value, maxLength + 40);
  if (typeof normalized !== "string") {
    return null;
  }
  const trimmed = normalized
    .replace(/^use this note when\s+/i, "")
    .replace(/^when\s+/i, "")
    .replace(/^use when\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
  if (!trimmed) {
    return null;
  }
  return shortenSentence(`${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`, maxLength);
}

function buildMaintenanceNoteSeed(candidate, existingNote = null) {
  const payloads = candidate.entries.map((entry) => entry.value ?? {});
  const cleanedRecommendedActions = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.recommendedAction, 160))
    .filter((value) => value && !isGenericMaintenanceAction(value));
  const cleanedTitles = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.title, 100))
    .filter(Boolean);
  const cleanedSignals = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.signal, 140))
    .filter(Boolean);
  const cleanedSummaries = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.summary, 160))
    .filter(Boolean);
  const cleanedTasks = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.task, 100))
    .filter(Boolean);
  const cleanedSteps = payloads
    .map((payload) => normalizeMaintenanceTextCandidate(payload.step, 120))
    .filter(Boolean);
  const repeatedObservations = unique(
    payloads
      .flatMap((payload) => Array.isArray(payload.observations) ? payload.observations : [])
      .map((value) => normalizeMaintenanceTextCandidate(value, 160))
      .filter(Boolean),
  ).slice(0, 3);
  const preferredTitle = firstNonEmpty([
    selectPreferredText(cleanedRecommendedActions, 100),
    selectPreferredText(cleanedTitles, 100),
    selectPreferredText(cleanedSummaries, 100),
    selectPreferredText(cleanedSignals, 100),
    selectPreferredText(cleanedTasks, 100),
    normalizeMaintenanceTextCandidate(existingNote?.title, 100),
    `${candidate.workflow} repeated trace pattern`,
  ]) ?? `${candidate.workflow} repeated trace pattern`;
  const preferredSignal = firstNonEmpty([
    selectPreferredText(cleanedSummaries, 140),
    selectPreferredText(cleanedTitles, 140),
    selectPreferredText(cleanedSignals, 140),
    preferredTitle,
  ]) ?? preferredTitle;
  const preferredInterpretation = firstNonEmpty([
    selectPreferredText(
      payloads
        .map((payload) => normalizeMaintenanceTextCandidate(payload.interpretation, 160))
        .filter(Boolean),
      160,
    ),
    candidate.eventCount > 1
      ? `This ${candidate.workflow} gap repeated across ${candidate.eventCount} grounded traces.`
      : null,
    normalizeMaintenanceTextCandidate(existingNote?.interpretation, 160),
  ]) ?? `This ${candidate.workflow} trace cluster exposed a reusable local pattern.`;
  const preferredAction = firstNonEmpty([
    selectPreferredText(cleanedRecommendedActions, 160),
    selectPreferredText(cleanedSummaries, 160),
    normalizeMaintenanceTextCandidate(existingNote?.action, 160),
    `Check this note before repeating the same ${candidate.workflow} loop.`,
  ]) ?? `Check this note before repeating the same ${candidate.workflow} loop.`;
  const effectiveSkillId = candidate.matchedSkillIds.length === 1
    ? candidate.matchedSkillIds[0]
    : existingNote?.skillId ?? null;

  return {
    id: existingNote?.id ?? buildNoteIdentityFromStabilityKey(candidate.stabilityKey) ?? buildNoteIdentity({
      workflow: candidate.workflow,
      skillId: effectiveSkillId,
      title: preferredTitle,
      signal: preferredSignal,
      summary: selectPreferredText(cleanedSummaries, 160),
      task: selectPreferredText(cleanedTasks, 160),
      step: selectPreferredText(cleanedSteps, 120),
    }),
    title: preferredTitle,
    workflow: candidate.workflow,
    signal: preferredSignal,
    interpretation: preferredInterpretation,
    recommendedAction: preferredAction,
    summary: selectPreferredText(cleanedSummaries, 180),
    task: selectPreferredText(cleanedTasks, 180),
    step: selectPreferredText(cleanedSteps, 120),
    skillId: effectiveSkillId,
    related: unique([
      ...(candidate.matchedNotePaths ?? []),
      ...(existingNote?.related ?? []),
    ]),
    sources: candidate.eventPaths,
    examples: unique([
      ...(candidate.eventSummaries ?? [])
        .map((value) => normalizeMaintenanceTextCandidate(value, 180))
        .filter(Boolean),
      ...(existingNote?.examples ?? []),
    ]).slice(0, 2),
    evidence: unique([
      ...candidate.eventPaths,
      ...repeatedObservations,
      ...(existingNote?.evidenceLines ?? []),
    ]).slice(0, 4),
    tags: unique([
      candidate.workflow,
      "maintenance",
      ...payloads.flatMap((payload) => Array.isArray(payload.tags) ? payload.tags : []),
      ...(existingNote?.tags ?? []),
    ]),
    kind: existingNote?.kind ?? "workflow_note",
  };
}

async function patchRecordedEventFiles(entries, patch) {
  const updated = [];
  for (const entry of entries) {
    const current = await readJson(entry.filePath);
    const next = {
      ...current,
      ...patch,
    };
    await writeFile(entry.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    updated.push({
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      payload: next,
    });
  }
  return updated;
}

function countNoteBackedEventSources(note) {
  return unique([
    ...(note.sources ?? []).filter(isEventSourceRef),
    ...(note.evidenceLines ?? []).filter(isEventSourceRef),
  ]).length;
}

function buildSkillDraftFromNote(note, evidenceCount) {
  const displayName = firstNonEmpty([
    normalizeReusableBoundaryText(
      isGenericMaintenanceAction(note.action) ? null : normalizeMaintenanceTextCandidate(note.action, 160),
      96,
    ),
    normalizeReusableBoundaryText(normalizeMaintenanceTextCandidate(note.title, 120), 96),
    normalizeReusableBoundaryText(normalizeMaintenanceTextCandidate(note.signal, 120), 96),
  ]);
  if (!displayName) {
    return null;
  }

  const trigger = firstNonEmpty([
    normalizeMaintenanceTextCandidate(note.whenToUse, 180),
    normalizeMaintenanceTextCandidate(note.signal, 180),
    normalizeMaintenanceTextCandidate(note.title, 120),
    displayName,
  ]);
  const description = firstNonEmpty([
    normalizeMaintenanceTextCandidate(note.interpretation, 180),
    normalizeMaintenanceTextCandidate(note.action, 180),
    normalizeMaintenanceTextCandidate(note.summary, 180),
  ]);
  if (!trigger || !description) {
    return null;
  }

  const stableName = slugify(displayName);
  return {
    id: `${note.workflow ?? UNKNOWN_WORKFLOW}.${stableName}`,
    name: stableName,
    displayName,
    workflow: note.workflow ?? UNKNOWN_WORKFLOW,
    trigger,
    description,
    notePaths: [note.path],
    tags: unique([...(note.tags ?? []), note.workflow ?? UNKNOWN_WORKFLOW, "generated"]),
    status: "generated",
    maturity: evidenceCount >= 4 ? "stable" : "draft",
    evidenceCount,
    lastUsedAt: new Date().toISOString(),
  };
}

function skillIdentityLooksIncidentShaped(skill) {
  const haystack = [
    skill?.name,
    skill?.displayName,
    skill?.trigger,
    skill?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return containsMaintenanceProtocolNoise(haystack)
    || haystack.includes("capture the reusable lesson")
    || haystack.includes("lesson from")
    || haystack.includes("incident")
    || haystack.includes("failure fix")
    || haystack.includes("error fix");
}

function scoreNoteForSkillSynthesis(note, evidenceCount) {
  let score = evidenceCount * 10;
  if ((note.workflow ?? UNKNOWN_WORKFLOW) !== UNKNOWN_WORKFLOW) {
    score += 200;
  }
  if (normalizeMaintenanceTextCandidate(note.whenToUse, 180)) {
    score += 40;
  }
  if (normalizeMaintenanceTextCandidate(note.signal, 180)) {
    score += 30;
  }
  if (normalizeMaintenanceTextCandidate(note.title, 120)) {
    score += 20;
  }
  if (!isGenericMaintenanceAction(note.action) && normalizeMaintenanceTextCandidate(note.action, 180)) {
    score += 30;
  }
  return score;
}

async function relinkNoteToSkill(note, skillId, cwd) {
  return writeNoteDoc(
    {
      id: note.id ?? buildNoteIdentity({
        workflow: note.workflow ?? UNKNOWN_WORKFLOW,
        skillId,
        title: note.title,
        signal: note.signal,
        summary: note.summary,
      }),
      title: note.title,
      workflow: note.workflow ?? UNKNOWN_WORKFLOW,
      signal: note.signal || note.title,
      interpretation: note.interpretation || note.summary || "",
      recommendedAction: note.action || note.summary || "",
      summary: note.summary ?? undefined,
      skillId,
      related: note.related ?? [],
      sources: note.sources ?? [],
      examples: note.examples ?? [],
      evidence: note.evidenceLines ?? [],
      tags: note.tags ?? [],
      kind: note.kind ?? "workflow_note",
    },
    cwd,
  );
}

async function reviewGeneratedDraftSkills(
  skillEntries,
  noteEntriesByPath,
  minSkillOccurrences,
  cwd,
) {
  const actions = [];

  for (const entry of skillEntries) {
    const skill = entry.value;
    if (normalizeSkillStatus(skill.status) !== "generated" || skill.maturity !== "draft") {
      continue;
    }

    const linkedNotes = toArray(skill.notePaths)
      .map((notePath) => noteEntriesByPath.get(notePath)?.note)
      .filter(Boolean);
    const strongestNote = linkedNotes
      .sort((left, right) => countNoteBackedEventSources(right) - countNoteBackedEventSources(left))[0] ?? null;
    const noteEvidenceCount = strongestNote ? countNoteBackedEventSources(strongestNote) : 0;
    const lacksEvidence = noteEvidenceCount < minSkillOccurrences;
    const incidentShaped = skillIdentityLooksIncidentShaped(skill);

    if (!lacksEvidence && !incidentShaped) {
      continue;
    }

    const archived = await writeSkill(
      {
        ...skill,
        filePath: entry.origin === "host" ? entry.filePath : undefined,
        status: "archived",
        maturity: "draft",
        evidenceCount: Math.max(skill.evidenceCount ?? 0, noteEvidenceCount),
      },
      cwd,
    );
    entry.value = archived.payload;
    entry.filePath = archived.filePath;
    actions.push({
      action: "demote_skill",
      reason: lacksEvidence ? "insufficient_note_backed_evidence" : "incident_shaped_identity",
      skillId: archived.payload.id,
      skillPath: normalizePath(path.relative(cwd, archived.filePath)),
      notePath: strongestNote?.path ?? null,
      evidenceCount: noteEvidenceCount,
    });
  }

  return actions;
}

async function synthesizeSkillsFromOperationalNotes(
  noteEntries,
  skillEntries,
  minSkillOccurrences,
  cwd,
) {
  const actions = [];
  const notesByPath = new Map(noteEntries.map((entry) => [entry.relativePath, entry]));
  const skillsById = new Map(skillEntries.map((entry) => [entry.value.id, entry]));
  const preferredDraftOwners = new Map();

  actions.push(...(await reviewGeneratedDraftSkills(skillEntries, notesByPath, minSkillOccurrences, cwd)));

  for (const noteEntry of noteEntries) {
    const note = noteEntry.note;
    const noteEvidenceCount = countNoteBackedEventSources(note);
    if (noteEvidenceCount < minSkillOccurrences) {
      continue;
    }

    const linkedSkillEntry = note.skillId ? skillsById.get(note.skillId) ?? null : null;
    const reusableSkill = linkedSkillEntry && isLocalSkillEligible(linkedSkillEntry.value)
      ? linkedSkillEntry
      : null;
    if (reusableSkill) {
      continue;
    }

    const draft = buildSkillDraftFromNote(note, noteEvidenceCount);
    if (!draft || skillIdentityLooksIncidentShaped(draft)) {
      continue;
    }

    const existing = preferredDraftOwners.get(draft.name);
    const current = {
      notePath: note.path,
      workflow: note.workflow ?? UNKNOWN_WORKFLOW,
      evidenceCount: noteEvidenceCount,
      qualityScore: scoreNoteForSkillSynthesis(note, noteEvidenceCount),
    };
    if (!existing) {
      preferredDraftOwners.set(draft.name, current);
      continue;
    }
    if (current.qualityScore > existing.qualityScore) {
      preferredDraftOwners.set(draft.name, current);
      continue;
    }
    if (current.qualityScore === existing.qualityScore && current.evidenceCount > existing.evidenceCount) {
      preferredDraftOwners.set(draft.name, current);
      continue;
    }
    if (
      current.qualityScore === existing.qualityScore
      && current.evidenceCount === existing.evidenceCount
      && current.notePath.localeCompare(existing.notePath) < 0
    ) {
      preferredDraftOwners.set(draft.name, current);
    }
  }

  for (const noteEntry of noteEntries) {
    const note = noteEntry.note;
    const noteEvidenceCount = countNoteBackedEventSources(note);
    if (noteEvidenceCount === 0) {
      continue;
    }

    const linkedSkillEntry = note.skillId ? skillsById.get(note.skillId) ?? null : null;
    const reusableSkill = linkedSkillEntry && isLocalSkillEligible(linkedSkillEntry.value)
      ? linkedSkillEntry
      : null;

    if (noteEvidenceCount < minSkillOccurrences) {
      actions.push({
        action: "keep_note_only",
        reason: "note_backed_evidence_below_skill_threshold",
        notePath: note.path,
        skillId: reusableSkill?.value.id ?? null,
        evidenceCount: noteEvidenceCount,
      });
      continue;
    }

    if ((note.workflow ?? UNKNOWN_WORKFLOW) === UNKNOWN_WORKFLOW && !reusableSkill?.value) {
      actions.push({
        action: "keep_note_only",
        reason: "workflow_unknown_for_skill_synthesis",
        notePath: note.path,
        skillId: null,
        evidenceCount: noteEvidenceCount,
      });
      continue;
    }

    const draft = buildSkillDraftFromNote(note, noteEvidenceCount);
    if (!draft || skillIdentityLooksIncidentShaped(draft)) {
      actions.push({
        action: "keep_note_only",
        reason: "note_semantics_not_reusable_enough_for_skill",
        notePath: note.path,
        skillId: null,
        evidenceCount: noteEvidenceCount,
      });
      continue;
    }

    const preferredOwner = preferredDraftOwners.get(draft.name);
    if (preferredOwner && preferredOwner.notePath !== note.path) {
      actions.push({
        action: "keep_note_only",
        reason: "overlapping_note_semantics_preferred_elsewhere",
        notePath: note.path,
        skillId: null,
        evidenceCount: noteEvidenceCount,
      });
      continue;
    }

    if (reusableSkill?.value) {
      const patched = await writeSkill(
        {
          ...reusableSkill.value,
          filePath: reusableSkill.origin === "host" ? reusableSkill.filePath : undefined,
          displayName: draft.displayName,
          trigger: draft.trigger,
          description: draft.description,
          notePaths: unique([...(reusableSkill.value.notePaths ?? []), note.path]),
          evidenceCount: Math.max(reusableSkill.value.evidenceCount ?? 0, noteEvidenceCount),
          lastUsedAt: new Date().toISOString(),
        },
        cwd,
      );
      skillsById.set(patched.payload.id, {
        ...reusableSkill,
        value: patched.payload,
        filePath: patched.filePath,
      });
      const relinkedNote = await relinkNoteToSkill(note, patched.payload.id, cwd);
      actions.push({
        action: "patch_skill",
        reason: "existing_note_backed_skill",
        notePath: relinkedNote.relativePath,
        skillId: patched.payload.id,
        skillPath: normalizePath(path.relative(cwd, patched.filePath)),
        evidenceCount: noteEvidenceCount,
      });
      continue;
    }

    const created = await writeSkill(draft, cwd);
    skillsById.set(created.payload.id, {
      filePath: created.filePath,
      origin: "host",
      repoRoot: cwd,
      value: created.payload,
    });
    const relinkedNote = await relinkNoteToSkill(note, created.payload.id, cwd);
    actions.push({
      action: "create_skill",
      reason: "note_backed_skill_synthesis",
      notePath: relinkedNote.relativePath,
      skillId: created.payload.id,
      skillPath: normalizePath(path.relative(cwd, created.filePath)),
      evidenceCount: noteEvidenceCount,
    });
  }

  return actions;
}

export async function maintainKnowledge(
  input = {},
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const maintenance = getMaintenanceConfig(config);
  const maxEvents = input.maxEvents ?? maintenance.maxEvents;
  const includeCovered = input.includeCovered ?? false;
  const minNoteOccurrences = input.minNoteOccurrences ?? maintenance.minNoteOccurrences;
  const minSkillOccurrences = input.minSkillOccurrences ?? maintenance.minSkillOccurrences;
  const synthesizeSkills = input.synthesizeSkills === true;
  const planner = await loadMaintenancePlannerInput(config, cwd, sourcePath, {
    maxEvents,
    includeCovered,
  });
  const notesByPath = new Map(planner.noteEntries.map((entry) => [entry.relativePath, entry]));
  const notesById = new Map(
    planner.noteEntries
      .filter((entry) => entry.note.id)
      .map((entry) => [entry.note.id, entry]),
  );
  const noteActions = [];
  const coverage = [];
  const touchedNotePaths = new Set();

  for (const candidate of planner.candidates) {
    if (candidate.covered) {
      noteActions.push({
        action: "noop",
        reason: "candidate_already_covered",
        stabilityKey: candidate.stabilityKey,
        workflow: candidate.workflow,
        notePath: candidate.entries[0]?.value?.coveredByNotePath ?? null,
        eventPaths: candidate.eventPaths,
      });
      continue;
    }

    if (candidate.eventCount < minNoteOccurrences) {
      noteActions.push({
        action: "noop",
        reason: "insufficient_repeated_trace_evidence",
        stabilityKey: candidate.stabilityKey,
        workflow: candidate.workflow,
        notePath: null,
        eventPaths: candidate.eventPaths,
      });
      continue;
    }

    const matchedNoteEntry = candidate.matchedNotePaths
      .map((notePath) => notesByPath.get(notePath))
      .find(Boolean)
      ?? (candidate.stabilityKey ? notesById.get(buildNoteIdentityFromStabilityKey(candidate.stabilityKey)) : null)
      ?? null;
    const noteSeed = buildMaintenanceNoteSeed(candidate, matchedNoteEntry?.note ?? null);
    const note = await writeNoteDoc(noteSeed, cwd);
    const coveredAt = new Date().toISOString();
    const updatedEvents = await patchRecordedEventFiles(candidate.entries, {
      coveredByNotePath: note.relativePath,
      coveredAt,
      maintenanceStatus: "covered",
    });
    const reloadedNote = await loadNoteDoc(cwd, sourcePath, note.relativePath, false);
    const reloadedEntry = {
      filePath: note.filePath,
      relativePath: note.relativePath,
      origin: "host",
      note: reloadedNote,
    };
    notesByPath.set(note.relativePath, reloadedEntry);
    touchedNotePaths.add(note.relativePath);
    if (reloadedNote.id) {
      notesById.set(reloadedNote.id, reloadedEntry);
    }
    noteActions.push({
      action: note.operation,
      reason: "repeated_trace_compaction",
      stabilityKey: candidate.stabilityKey,
      workflow: candidate.workflow,
      notePath: note.relativePath,
      eventPaths: candidate.eventPaths,
    });
    coverage.push({
      notePath: note.relativePath,
      coveredAt,
      eventPaths: updatedEvents.map((entry) => entry.relativePath),
    });
  }

  const skillActions = synthesizeSkills
    ? await synthesizeSkillsFromOperationalNotes(
      Array.from(notesByPath.values()).filter((entry) => !touchedNotePaths.has(entry.relativePath)),
      planner.skillEntries,
      minSkillOccurrences,
      cwd,
    )
    : [];

  await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: "maintain_knowledge",
      detail: `${planner.selectedEvents.length} event(s) scanned | ${noteActions.filter((entry) => entry.action !== "noop").length} note action(s) | ${synthesizeSkills ? skillActions.length : "0 skipped"} skill action(s)`,
    },
  });

  return {
    maxEvents,
    minNoteOccurrences,
    minSkillOccurrences,
    synthesizeSkills,
    scannedEvents: planner.selectedEvents.length,
    skippedCoveredEvents: planner.skippedCoveredEvents,
    candidateCount: planner.candidates.length,
    candidates: planner.candidates.map((candidate) => ({
      workflow: candidate.workflow,
      stabilityKey: candidate.stabilityKey,
      eventCount: candidate.eventCount,
      latestTimestamp: candidate.latestTimestamp,
      eventPaths: candidate.eventPaths,
      eventSummaries: candidate.eventSummaries,
      matchedNotePaths: candidate.matchedNotePaths,
      matchedSkillIds: candidate.matchedSkillIds,
      covered: candidate.covered,
    })),
    noteActions,
    coverage,
    skillActions,
  };
}

export async function attachNoteToSkill(
  {
    skillId,
    notePath,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const sourceSkill = await getLocalSkillById(config, skillId, cwd, sourcePath);

  if (!sourceSkill?.value) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  return writeSkill(
    {
      ...sourceSkill.value,
      filePath: sourceSkill.origin === "host" ? sourceSkill.filePath : undefined,
      notePaths: [...(sourceSkill.value.notePaths ?? []), notePath],
    },
    cwd,
  );
}

export async function attachPatternToSkill(
  {
    skillId,
    patternPath,
  },
  cwd = process.cwd(),
) {
  return attachNoteToSkill(
    {
      skillId,
      notePath: patternPath,
    },
    cwd,
  );
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function shortenSentence(value, maxLength = 180) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function sentenceFromTranscript(transcript) {
  if (!transcript || typeof transcript !== "string") {
    return null;
  }

  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return shortenSentence(firstSentence);
}

function derivePatternFields(input) {
  const title = firstNonEmpty([
    input.title,
    input.summary,
    input.observations?.[0],
    input.task,
    input.step,
    "interaction-pattern",
  ]) ?? "interaction-pattern";

  const signal = firstNonEmpty([
    input.signal,
    input.observations?.[0],
    sentenceFromTranscript(input.transcript),
    input.task,
    title,
  ]) ?? title;

  const interpretation = firstNonEmpty([
    input.interpretation,
    input.summary ? `This ${input.workflow} loop keeps converging on ${shortenSentence(input.summary, 100)}.` : null,
    `This interaction exposed a reusable ${input.workflow} decision.`,
  ]) ?? `Note for ${input.workflow}`;

  const recommendedAction = firstNonEmpty([
    input.recommendedAction,
    input.task ? `Check this note before repeating ${input.task}.` : null,
    input.step ? `Check this note before repeating ${input.step}.` : null,
    `Check this note before repeating the same ${input.workflow} loop.`,
  ]) ?? "Reuse this note before continuing.";

  return {
    title: shortenSentence(title, 120),
    signal,
    interpretation,
    recommendedAction,
  };
}

function deriveTraceFields(input) {
  const title = firstNonEmpty([
    input.title,
    input.summary,
    input.observations?.[0],
    input.task,
    input.step,
    "interaction-trace",
  ]) ?? "interaction-trace";

  const signal = firstNonEmpty([
    input.signal,
    input.observations?.[0],
    sentenceFromTranscript(input.transcript),
    input.task,
    title,
  ]) ?? title;

  return {
    title: shortenSentence(title, 120),
    signal,
    interpretation: input.interpretation ?? null,
    recommendedAction: input.recommendedAction ?? null,
  };
}

function buildEventFingerprint({
  workflow,
  skillId,
  title,
  signal,
  summary,
  task,
  step,
}) {
  const seed = firstNonEmpty([signal, summary, task, step, title, skillId, workflow, "event"]) ?? "event";
  return `${workflow ?? "unknown"}::${slugify(seed)}`;
}

const ADJUDICATION_DECISIONS = new Set([
  "record_trace",
  "create_operational_note",
  "patch_existing_skill",
  "create_new_skill",
  "needs_more_evidence",
]);

function normalizeAdjudicationDecision(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return ADJUDICATION_DECISIONS.has(normalized) ? normalized : null;
}

function sanitizeCandidateSkillSummary(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const skillId = typeof value.skillId === "string" && value.skillId.trim().length > 0
    ? value.skillId.trim()
    : null;

  if (!skillId) {
    return null;
  }

  return {
    skillId,
    displayName: typeof value.displayName === "string" && value.displayName.trim().length > 0
      ? value.displayName.trim()
      : skillId,
    workflow: typeof value.workflow === "string" && value.workflow.trim().length > 0
      ? value.workflow.trim()
      : null,
    supportingNotes: Array.isArray(value.supportingNotes)
      ? value.supportingNotes
          .filter((note) => note && typeof note === "object")
          .map((note) => ({
            path: typeof note.path === "string" ? note.path : null,
            title: typeof note.title === "string" ? note.title : null,
          }))
          .filter((note) => note.path && note.title)
          .slice(0, 2)
      : [],
    whyMatched: Array.isArray(value.whyMatched)
      ? value.whyMatched
          .filter((reason) => typeof reason === "string" && reason.trim().length > 0)
          .slice(0, 3)
      : [],
  };
}

function normalizeCandidateSkillSummaries(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeCandidateSkillSummary(item))
    .filter(Boolean)
    .slice(0, 3);
}

function buildCandidateSkillSummariesFromResolution(resolution) {
  return normalizeCandidateSkillSummaries(
    (resolution?.matches ?? []).map((match) => ({
      skillId: match.skill.id,
      displayName: match.skill.displayName ?? match.skill.name ?? match.skill.id,
      workflow: match.skill.workflow ?? null,
      supportingNotes: (match.linkedNotes ?? []).slice(0, 2).map((note) => ({
        path: note.path,
        title: note.title,
      })),
      whyMatched: match.loopGuidance?.whyMatched ?? [],
    })),
  );
}

function buildPromotionLookupKey(payload) {
  return [
    payload.workflow ?? "unknown",
    slugify(firstNonEmpty([
      payload.title,
      payload.signal,
      payload.summary,
      payload.task,
      payload.step,
      "event",
    ]) ?? "event"),
  ].join("::");
}

function buildStabilityKey({
  workflow,
  skillId,
  task,
  step,
  title,
  signal,
  summary,
}) {
  const seed = firstNonEmpty([
    task,
    step,
    skillId,
    signal,
    summary,
    title,
    "event",
  ]) ?? "event";
  return `${workflow ?? "unknown"}::${slugify(seed)}`;
}

function extractStabilityKeyFromPayload(payload) {
  if (typeof payload?.stabilityKey === "string" && payload.stabilityKey.trim().length > 0) {
    return payload.stabilityKey.trim();
  }

  return buildStabilityKey({
    workflow: payload?.workflow ?? undefined,
    skillId: payload?.explicitSkillId ?? payload?.matchedSkillId ?? null,
    task: payload?.task ?? undefined,
    step: payload?.step ?? undefined,
    title: payload?.title ?? undefined,
    signal: payload?.signal ?? undefined,
    summary: payload?.summary ?? undefined,
  });
}

async function findOperationalNoteForPayload(config, cwd, sourcePath, payload) {
  const lookupKey = buildPromotionLookupKey(payload);
  const wikiEntries = await listWikiEntries(config, cwd, sourcePath);
  for (const entry of wikiEntries) {
    if (entry.pageType !== "note") {
      continue;
    }
    const parsed = parseNoteDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), false);
    const parsedKey = [
      parsed.workflow ?? "unknown",
      slugify(firstNonEmpty([
        parsed.title,
        parsed.signal,
        parsed.summary,
        "note",
      ]) ?? "note"),
    ].join("::");
    if (parsedKey === lookupKey) {
      return {
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        note: parsed,
      };
    }
  }
  return null;
}

async function findOperationalNoteFromMatchedPaths(cwd, sourcePath, payload) {
  const matchedNotePaths = Array.isArray(payload?.matchedNotePaths)
    ? payload.matchedNotePaths.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  for (const notePath of matchedNotePaths) {
    const resolved = await resolvePatternFile(notePath, cwd, sourcePath);
    if (!resolved) {
      continue;
    }
    const content = await readFile(resolved.filePath, "utf8");
    return {
      filePath: resolved.filePath,
      relativePath: resolved.relativePath,
      note: parseNoteDoc(resolved.relativePath, content, false),
    };
  }
  return null;
}

async function findStablePromotionMemory(config, cwd, sourcePath, payload, recordedEvents = null) {
  const stabilityKey = extractStabilityKeyFromPayload(payload);
  if (!stabilityKey) {
    return {
      stabilityKey: null,
      priorPromotablePayload: null,
      operationalNote: null,
      occurrenceCount: 1,
    };
  }

  const entries = recordedEvents ?? await listRecordedEvents(config, cwd, sourcePath);
  const relatedCandidates = entries.filter((entry) => (
    entry.value?.eventClass === "candidate"
      && extractStabilityKeyFromPayload(entry.value) === stabilityKey
  ));
  const priorPromotablePayload = relatedCandidates
    .filter((entry) => {
      const decision = normalizeAdjudicationDecision(entry.value?.adjudicationDecision);
      return Boolean(
        decision
          && decision !== "record_trace"
          && decision !== "needs_more_evidence",
      );
    })
    .sort((left, right) => parseTimestamp(right.value?.timestamp) - parseTimestamp(left.value?.timestamp))[0]?.value ?? null;

  const operationalNote = priorPromotablePayload
    ? await findOperationalNoteForPayload(config, cwd, sourcePath, priorPromotablePayload)
    : null;

  return {
    stabilityKey,
    priorPromotablePayload,
    operationalNote,
    occurrenceCount: relatedCandidates.length + 1,
  };
}

function buildAdjudicationPacket(payload, occurrenceCount) {
  const recentObservations = Array.isArray(payload.observations)
    ? payload.observations.filter(Boolean).slice(0, 3)
    : [];
  return {
    traceSummary: firstNonEmpty([payload.summary, payload.signal, payload.title]) ?? null,
    repeatedEventSummary: {
      occurrenceCount,
      eventKind: payload.eventKind ?? null,
      recentObservations,
    },
    candidateSkills: normalizeCandidateSkillSummaries(payload.candidateSkills),
    linkedOperationalNotes: Array.isArray(payload.matchedNotePaths)
      ? payload.matchedNotePaths.filter(Boolean).slice(0, 3)
      : [],
    linkedSourceNotes: [],
  };
}

function resolveAdjudicatedSkillTarget(payload) {
  const explicitSkillId = typeof payload.explicitSkillId === "string" && payload.explicitSkillId.trim().length > 0
    ? payload.explicitSkillId.trim()
    : null;
  if (explicitSkillId) {
    return explicitSkillId;
  }

  const requestedSkillId = typeof payload.adjudicationSkillId === "string" && payload.adjudicationSkillId.trim().length > 0
    ? payload.adjudicationSkillId.trim()
    : null;
  if (!requestedSkillId) {
    return null;
  }

  const candidateSkillIds = new Set(
    normalizeCandidateSkillSummaries(payload.candidateSkills)
      .filter((candidate) => {
        if (!payload.workflow) {
          return true;
        }
        return candidate.workflow === payload.workflow;
      })
      .map((candidate) => candidate.skillId),
  );
  return candidateSkillIds.has(requestedSkillId) ? requestedSkillId : null;
}

function decideAdjudicatedPromotion({
  payload,
  occurrenceCount,
  operationalNoteExists,
  linkedOperationalNoteExists,
  stickyPromotion,
}) {
  const decision = normalizeAdjudicationDecision(payload.adjudicationDecision);
  if (!decision) {
    if (stickyPromotion) {
      return {
        action: "create_note_from_gap",
        reason: "an identical repeated run already established this reusable gap; do not regress to trace only.",
        selectedSkillId: null,
      };
    }
    return {
      action: "record_only",
      reason: "candidate event did not include an explicit adjudication decision.",
      selectedSkillId: null,
    };
  }

  const selectedSkillId = resolveAdjudicatedSkillTarget(payload);

  switch (decision) {
    case "record_trace":
    case "needs_more_evidence":
      if (stickyPromotion) {
        return {
          action: "create_note_from_gap",
          reason: "an identical repeated run already established this reusable gap; do not regress to trace only.",
          selectedSkillId,
        };
      }
      return {
        action: "record_only",
        reason: "agent requested more evidence before promoting this gap.",
        selectedSkillId,
      };
    case "create_operational_note":
      return {
        action: "create_note_from_gap",
        reason: "agent adjudicated this run as reusable operational knowledge worth recording as a note.",
        selectedSkillId,
      };
    case "patch_existing_skill":
      if (payload.sourceKind && payload.sourceKind !== "trace") {
        return {
          action: "create_note_from_gap",
          reason: "source-derived inputs can create notes but cannot patch skills directly.",
          selectedSkillId: null,
        };
      }
      if (!selectedSkillId) {
        return {
          action: "record_only",
          reason: "agent requested a skill patch without a valid explicit or candidate skill target.",
          selectedSkillId: null,
        };
      }
      if (occurrenceCount < 2 && !operationalNoteExists) {
        return {
          action: "create_note_from_gap",
          reason: "single-run skill patches are not allowed; create the operational note first.",
          selectedSkillId,
        };
      }
      return {
        action: "patch_skill_with_note",
        reason: "agent selected an existing skill target and the note stage has already been satisfied.",
        selectedSkillId,
      };
    case "create_new_skill":
      if (payload.sourceKind && payload.sourceKind !== "trace") {
        return {
          action: "create_note_from_gap",
          reason: "source-derived inputs can create notes but cannot create skills directly.",
          selectedSkillId: null,
        };
      }
      if (!operationalNoteExists && !linkedOperationalNoteExists) {
        return {
          action: "create_note_from_gap",
          reason: "new skill creation requires the note stage first.",
          selectedSkillId: null,
        };
      }
      return {
        action: "create_skill_from_gap",
        reason: "agent selected new skill creation after the note stage.",
        selectedSkillId: null,
      };
    default:
      return {
        action: "record_only",
        reason: "unknown adjudication decision.",
        selectedSkillId: null,
      };
  }
}

async function writeTurnEventFile(payload, cwd = process.cwd(), sourcePathOverride) {
  const loaded = await loadAgentConfig(cwd);
  const config = loaded.config;
  const sourcePath = sourcePathOverride ?? loaded.sourcePath;
  const { hostEventsDir, hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const eventId = payload.id ?? `${timestamp.replace(/[:.]/g, "-")}--${slugify(payload.title ?? payload.fingerprint ?? "event")}`;
  const nextPayload = {
    version: 1,
    ...payload,
    id: eventId,
    timestamp,
  };
  const filePath = path.join(hostEventsDir, `${eventId}.json`);

  await ensureDir(hostEventsDir);
  await writeFile(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  const relativePath = normalizePath(path.relative(hostRoot, filePath));
  const artifacts = await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: "record_event",
      detail: `${nextPayload.eventKind ?? "observation"} | ${nextPayload.workflow ?? "unknown"} | ${nextPayload.fingerprint ?? nextPayload.eventClass ?? "trace"}`,
      path: relativePath,
    },
  });

  return {
    filePath,
    relativePath,
    payload: nextPayload,
    artifacts,
  };
}

export async function recordTurnResult(
  {
    sourceKind = "trace",
    task,
    workflow,
    step,
    skillId,
    adjudicationDecision,
    adjudicationSkillId,
    candidateSkills = [],
    matchedSkillIdHint = null,
    summary,
    observations = [],
    changedFiles = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
    outcome,
    eventKind = "observation",
    eventClass = "trace",
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const resolution = await resolveLocalKnowledge(
    {
      task,
      workflow,
      step,
      skill: skillId,
      limit: 1,
      includeContent: false,
    },
    cwd,
  );
  const topMatch = resolution.matches[0] ?? null;
  const reusableMatch = topMatch?.authoritativeMatch && (!workflow || topMatch.skill.workflow === workflow)
    ? topMatch
    : null;
  const candidateSkillIds = new Set(
    normalizeCandidateSkillSummaries(candidateSkills)
      .filter((candidate) => !workflow || candidate.workflow === workflow)
      .map((candidate) => candidate.skillId),
  );
  const hintedMatch = !reusableMatch
    && typeof matchedSkillIdHint === "string"
    && matchedSkillIdHint.trim().length > 0
    && candidateSkillIds.has(matchedSkillIdHint.trim())
      ? resolution.matches.find((match) => match.skill.id === matchedSkillIdHint.trim()) ?? null
      : null;
  const selectedMatch = reusableMatch ?? hintedMatch;
  const effectiveWorkflow = workflow
    || selectedMatch?.skill.workflow
    || ((task || step || summary || title || signal) ? UNKNOWN_WORKFLOW : config.runtime.defaultWorkflow);
  const effectiveEventClass = eventClass === "candidate" ? "candidate" : "trace";
  const derived = effectiveEventClass === "candidate"
    ? derivePatternFields({
        workflow: effectiveWorkflow,
        task,
        step,
        summary,
        observations,
        transcript,
        title,
        signal,
        interpretation,
        recommendedAction,
      })
    : deriveTraceFields({
        workflow: effectiveWorkflow,
        task,
        step,
        summary,
        observations,
        transcript,
        title,
        signal,
        interpretation,
        recommendedAction,
      });
  const fingerprint = effectiveEventClass === "candidate"
    ? buildEventFingerprint({
        workflow: effectiveWorkflow,
        skillId: skillId ?? adjudicationSkillId ?? null,
        title: derived.title,
        signal: derived.signal,
        summary,
        task,
        step,
      })
    : null;
  const stabilityKey = buildStabilityKey({
    workflow: effectiveWorkflow,
    skillId: skillId ?? selectedMatch?.skill.id ?? adjudicationSkillId ?? null,
    task,
    step,
    title: derived.title,
    signal: derived.signal,
    summary,
  });
  const existingEvents = effectiveEventClass === "candidate"
    ? await listRecordedEvents(config, cwd, sourcePath)
    : [];
  const occurrenceCount = effectiveEventClass === "candidate"
    ? existingEvents.filter((entry) => entry.value?.eventClass === "candidate" && entry.value?.fingerprint === fingerprint).length + 1
    : 1;
  const event = await writeTurnEventFile(
    {
      eventKind,
      eventClass: effectiveEventClass,
      sourceKind,
      workflow: effectiveWorkflow,
      task: task ?? null,
      step: step ?? null,
      summary: summary ?? null,
      observations,
      changedFiles,
      transcript: transcript ?? null,
      title: derived.title,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      outcome: outcome ?? null,
      tags: unique([...tags, effectiveWorkflow]),
      fingerprint,
      stabilityKey,
      adjudicationDecision: normalizeAdjudicationDecision(adjudicationDecision),
      adjudicationSkillId: adjudicationSkillId ?? null,
      candidateSkills: normalizeCandidateSkillSummaries(candidateSkills).length > 0
        ? normalizeCandidateSkillSummaries(candidateSkills)
        : buildCandidateSkillSummariesFromResolution(resolution),
      explicitSkillId: skillId ?? null,
      matchedSkillId: selectedMatch?.skill.id ?? null,
      matchedNotePaths: selectedMatch?.linkedNotes?.map((doc) => doc.path) ?? [],
    },
    cwd,
    sourcePath,
  );

  return {
    event,
    occurrenceCount,
    fingerprint,
    resolution,
  };
}

export async function compileRecordedEvent(
  {
    eventPath,
    minWikiOccurrences = 2,
    minSkillOccurrences = 3,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const { hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const recordedEvents = await listRecordedEvents(config, cwd, sourcePath);
  const normalizedEventPath = eventPath
    ? normalizePath(
      path.isAbsolute(eventPath)
        ? path.relative(hostRoot, eventPath)
        : eventPath
    )
    : null;
  const recordedEntry = normalizedEventPath
    ? recordedEvents.find((entry) => entry.relativePath === normalizedEventPath)
    : recordedEvents[0] ?? null;

  if (!recordedEntry) {
    throw new Error(`Recorded event not found: ${eventPath ?? "latest"}`);
  }

  const payload = recordedEntry.value ?? {};
  const stabilityMemory = await findStablePromotionMemory(config, cwd, sourcePath, payload, recordedEvents);
  if (payload.eventClass !== "candidate") {
    if (!stabilityMemory.priorPromotablePayload && !stabilityMemory.operationalNote) {
      return {
        event: {
          filePath: recordedEntry.filePath,
          relativePath: recordedEntry.relativePath,
          payload,
        },
        occurrenceCount: 1,
        fingerprint: payload.fingerprint ?? null,
        adjudicationPacket: buildAdjudicationPacket(payload, 1),
        decision: {
          action: "record_only",
          reason: "trace events are grounded history only; they do not enter the promotion ladder.",
          occurrenceCount: 1,
        },
        promotion: null,
      };
    }

    const stableSeed = stabilityMemory.priorPromotablePayload ?? payload;
    const noteSeed = stabilityMemory.operationalNote?.note ?? null;
    const effectiveWorkflow = payload.workflow
      ?? noteSeed?.workflow
      ?? stableSeed.workflow
      ?? UNKNOWN_WORKFLOW;
    const note = await writeNoteDoc(
      {
        id: noteSeed?.id ?? buildNoteIdentityFromStabilityKey(stabilityMemory.stabilityKey) ?? buildNoteIdentity({
          fingerprint: stableSeed.fingerprint ?? payload.fingerprint,
          workflow: effectiveWorkflow,
          skillId: stableSeed.matchedSkillId ?? stableSeed.explicitSkillId ?? null,
          title: stableSeed.title,
          signal: stableSeed.signal,
          summary: stableSeed.summary,
          task: payload.task ?? stableSeed.task,
          step: payload.step ?? stableSeed.step,
        }),
        fingerprint: stableSeed.fingerprint ?? payload.fingerprint,
        title: noteSeed?.title ?? stableSeed.title ?? payload.title,
        workflow: effectiveWorkflow,
        signal: noteSeed?.signal ?? stableSeed.signal ?? payload.signal,
        interpretation: noteSeed?.interpretation ?? stableSeed.interpretation ?? payload.interpretation,
        recommendedAction: noteSeed?.action ?? stableSeed.recommendedAction ?? payload.recommendedAction,
        summary: payload.summary ?? stableSeed.summary,
        task: payload.task ?? stableSeed.task,
        step: payload.step ?? stableSeed.step,
        skillId: noteSeed?.skillId ?? stableSeed.matchedSkillId ?? stableSeed.explicitSkillId ?? null,
        related: unique([
          ...(payload.matchedNotePaths ?? []),
          ...(stableSeed.matchedNotePaths ?? []),
        ]),
        sources: unique([recordedEntry.relativePath]),
        examples: unique([
          payload.summary,
          stableSeed.summary,
        ].filter(Boolean)),
        evidence: unique([
          recordedEntry.relativePath,
          ...(payload.observations ?? []),
          ...(stableSeed.observations ?? []),
        ].filter(Boolean)),
        tags: unique([...(payload.tags ?? []), "promoted"]),
        kind: noteSeed?.kind ?? derivePromotedNoteKind(payload.sourceKind ?? stableSeed.sourceKind),
      },
      cwd,
    );

    return {
      event: {
        filePath: recordedEntry.filePath,
        relativePath: recordedEntry.relativePath,
        payload,
      },
      occurrenceCount: stabilityMemory.occurrenceCount,
      fingerprint: payload.fingerprint ?? null,
      adjudicationPacket: buildAdjudicationPacket(payload, stabilityMemory.occurrenceCount),
      decision: {
        action: "create_note_from_gap",
        reason: "an identical repeated run already established this reusable gap; do not regress to trace only.",
        occurrenceCount: stabilityMemory.occurrenceCount,
      },
      promotion: {
        note,
        skill: null,
      },
    };
  }
  const occurrenceCount = recordedEvents.filter((entry) => entry.value?.eventClass === "candidate" && entry.value?.fingerprint === payload.fingerprint).length;
  const linkedOperationalNote = await findOperationalNoteFromMatchedPaths(cwd, sourcePath, payload);
  const operationalNote = await findOperationalNoteForPayload(config, cwd, sourcePath, payload);
  const noteStageNote = operationalNote ?? linkedOperationalNote ?? stabilityMemory.operationalNote ?? null;
  const adjudicationPacket = buildAdjudicationPacket(payload, occurrenceCount);
  const decision = {
    ...decideAdjudicatedPromotion({
      payload,
      occurrenceCount,
      operationalNoteExists: Boolean(operationalNote),
      linkedOperationalNoteExists: Boolean(linkedOperationalNote),
      stickyPromotion: Boolean(stabilityMemory.priorPromotablePayload || stabilityMemory.operationalNote),
    }),
    occurrenceCount,
  };
  const recorded = {
    event: {
      filePath: recordedEntry.filePath,
      relativePath: recordedEntry.relativePath,
      payload,
    },
    occurrenceCount,
    fingerprint: payload.fingerprint ?? null,
    adjudicationPacket,
  };

  if (decision.action === "record_only") {
    return {
      ...recorded,
      decision,
      promotion: null,
    };
  }

  const effectiveWorkflow = payload.workflow
    ?? noteStageNote?.note.workflow
    ?? stabilityMemory.priorPromotablePayload?.workflow
    ?? UNKNOWN_WORKFLOW;

  if (decision.action === "create_note_from_gap") {
    const noteSeed = stabilityMemory.operationalNote?.note ?? null;
    const stableSeed = stabilityMemory.priorPromotablePayload ?? payload;
    const note = await writeNoteDoc(
      {
        id: noteSeed?.id ?? buildNoteIdentityFromStabilityKey(stabilityMemory.stabilityKey) ?? buildNoteIdentity({
          fingerprint: stableSeed.fingerprint ?? payload.fingerprint,
          workflow: effectiveWorkflow,
          skillId: noteSeed?.skillId ?? decision.selectedSkillId ?? stableSeed.matchedSkillId ?? stableSeed.explicitSkillId ?? null,
          title: stableSeed.title ?? payload.title,
          signal: stableSeed.signal ?? payload.signal,
          summary: stableSeed.summary ?? payload.summary,
          task: payload.task ?? stableSeed.task,
          step: payload.step ?? stableSeed.step,
        }),
        fingerprint: stableSeed.fingerprint ?? payload.fingerprint,
        title: noteSeed?.title ?? stableSeed.title ?? payload.title,
        workflow: effectiveWorkflow,
        signal: noteSeed?.signal ?? stableSeed.signal ?? payload.signal,
        interpretation: noteSeed?.interpretation ?? stableSeed.interpretation ?? payload.interpretation,
        recommendedAction: noteSeed?.action ?? stableSeed.recommendedAction ?? payload.recommendedAction,
        summary: stableSeed.summary ?? payload.summary,
        task: payload.task ?? stableSeed.task,
        step: payload.step ?? stableSeed.step,
        skillId: noteSeed?.skillId ?? decision.selectedSkillId ?? stableSeed.matchedSkillId ?? stableSeed.explicitSkillId ?? null,
        related: unique([
          ...(payload.matchedNotePaths ?? []),
          ...(stableSeed.matchedNotePaths ?? []),
        ]),
        sources: [recordedEntry.relativePath],
        examples: unique([
          payload.summary,
          stableSeed.summary,
        ].filter(Boolean)),
        evidence: unique([
          recordedEntry.relativePath,
          ...(payload.observations ?? []),
          ...(stableSeed.observations ?? []),
        ].filter(Boolean)),
        tags: unique([...(payload.tags ?? []), "promoted"]),
        kind: noteSeed?.kind ?? derivePromotedNoteKind(payload.sourceKind ?? stableSeed.sourceKind),
      },
      cwd,
    );

    return {
      ...recorded,
      decision,
      promotion: {
        note,
        skill: null,
      },
    };
  }

  const learned = await learnFromInteraction(
    {
      task: payload.task ?? undefined,
      workflow: effectiveWorkflow,
      step: payload.step ?? undefined,
      skillId: decision.action === "patch_skill_with_note"
        ? (decision.selectedSkillId ?? undefined)
        : undefined,
      allowAutoSkillMatch: decision.action !== "create_skill_from_gap",
      summary: payload.summary ?? undefined,
      observations: payload.observations ?? [],
      transcript: payload.transcript ?? undefined,
      tags: unique([...(payload.tags ?? []), "promoted"]),
      title: payload.title ?? undefined,
      signal: payload.signal ?? undefined,
      interpretation: payload.interpretation ?? undefined,
      recommendedAction: payload.recommendedAction ?? undefined,
      noteId: noteStageNote?.note.id ?? buildNoteIdentity({
        fingerprint: payload.fingerprint,
        workflow: effectiveWorkflow,
        skillId: decision.action === "patch_skill_with_note"
          ? (decision.selectedSkillId ?? null)
          : null,
        title: payload.title,
        signal: payload.signal,
        summary: payload.summary,
        task: payload.task,
        step: payload.step,
      }),
      sourceRefs: [recordedEntry.relativePath],
      evidence: unique([recordedEntry.relativePath, ...(payload.changedFiles ?? [])].filter(Boolean)),
      occurrenceCount: decision.occurrenceCount,
    },
    cwd,
  );

  return {
    ...recorded,
    decision,
    promotion: learned,
  };
}

export async function promoteGap(
  {
    sourceKind = "trace",
    task,
    workflow,
    step,
    skillId,
    matchedSkillIdHint = null,
    adjudicationDecision,
    adjudicationSkillId,
    summary,
    observations = [],
    changedFiles = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
    outcome,
    eventKind = "observation",
    minWikiOccurrences = 2,
    minSkillOccurrences = 3,
  },
  cwd = process.cwd(),
) {
  const recorded = await recordTurnResult(
    {
      sourceKind,
      task,
      workflow,
      step,
      skillId,
      matchedSkillIdHint,
      adjudicationDecision,
      adjudicationSkillId,
      summary,
      observations,
      changedFiles,
      transcript,
      tags,
      title,
      signal,
      interpretation,
      recommendedAction,
      outcome,
      eventKind,
      eventClass: "candidate",
    },
    cwd,
  );
  const compiled = await compileRecordedEvent(
    {
      eventPath: recorded.event.relativePath,
      minWikiOccurrences,
      minSkillOccurrences,
    },
    cwd,
  );

  return {
    ...recorded,
    decision: compiled.decision,
    promotion: compiled.promotion,
  };
}

export async function learnFromInteraction(
  {
    task,
    workflow,
    step,
    skillId,
    allowAutoSkillMatch = true,
    summary,
    observations = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
    noteId,
    sourceRefs = [],
    evidence = [],
    occurrenceCount,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);

  let sourceSkill = null;
  if (skillId) {
    sourceSkill = await getLocalSkillById(config, skillId, cwd, sourcePath);
  } else if (allowAutoSkillMatch) {
    const resolution = await resolveLocalKnowledge(
      {
        task: task ?? "",
        workflow,
        step,
        limit: 1,
      },
      cwd,
    );
    if (resolution.matches.length > 0) {
      const topMatch = resolution.matches[0];
      const workflowAllowsReuse = !workflow || topMatch.skill.workflow === workflow;
      if (workflowAllowsReuse) {
        sourceSkill = {
          value: topMatch.skill,
          filePath: topMatch.skillPath,
          origin: topMatch.skillOrigin,
        };
      }
    }
  }

  const effectiveWorkflow = workflow
    || sourceSkill?.value?.workflow
    || ((task || step || summary || title || signal) ? UNKNOWN_WORKFLOW : config.runtime.defaultWorkflow);

  const derived = derivePatternFields({
    workflow: effectiveWorkflow,
    task,
    step,
    summary,
    observations,
    transcript,
    title,
    signal,
    interpretation,
    recommendedAction,
  });

  let inheritedRelated = [];
  let inheritedSources = [];
  if (sourceSkill?.value?.notePaths?.length) {
    const existingNoteDocs = await Promise.all(
      sourceSkill.value.notePaths.map((notePath) =>
        loadNoteDoc(cwd, sourcePath, notePath, false)
      ),
    );
    inheritedRelated = unique(sourceSkill.value.notePaths);
    inheritedSources = unique(existingNoteDocs.flatMap((doc) => doc.sources ?? []));
  }

  const note = await writeNoteDoc(
    {
      id: noteId ?? buildNoteIdentity({
        workflow: effectiveWorkflow,
        skillId: sourceSkill?.value?.id ?? skillId ?? null,
        title: derived.title,
        signal: derived.signal,
        summary,
        task,
        step,
      }),
      title: derived.title,
      workflow: effectiveWorkflow,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      summary,
      task,
      step,
      skillId: sourceSkill?.value?.id,
      related: inheritedRelated,
      sources: unique([...(sourceRefs ?? []), ...inheritedSources]),
      examples: unique([summary, ...observations].filter(Boolean)),
      evidence: unique([...(evidence ?? []), ...(sourceRefs ?? [])]),
      tags: unique([...tags, effectiveWorkflow]),
      kind: "workflow_note",
    },
    cwd,
  );

  let skill = null;
  if (sourceSkill?.value) {
    const existingEvidenceCount = Number.isInteger(sourceSkill.value.evidenceCount)
      ? sourceSkill.value.evidenceCount
      : 0;
    const nextEvidenceCount = Math.max(existingEvidenceCount, occurrenceCount ?? existingEvidenceCount + 1, 1);
    const nextMaturity = sourceSkill.value.maturity === "draft" && nextEvidenceCount >= 3
      ? "stable"
      : sourceSkill.value.maturity ?? "stable";
    skill = await writeSkill(
      {
        ...sourceSkill.value,
        filePath: sourceSkill.origin === "host" ? sourceSkill.filePath : undefined,
        notePaths: [...(sourceSkill.value.notePaths ?? []), note.relativePath],
        maturity: nextMaturity,
        evidenceCount: nextEvidenceCount,
        lastUsedAt: new Date().toISOString(),
      },
      cwd,
    );
  } else {
    const generatedName = slugify(firstNonEmpty([task, step, derived.title, "generated-skill"]) ?? "generated-skill");
    const nextEvidenceCount = Math.max(occurrenceCount ?? 1, 1);
    const nextMaturity = nextEvidenceCount >= 3 ? "stable" : "draft";
    skill = await writeSkill(
      {
        id: `${effectiveWorkflow}.${generatedName}`,
        name: generatedName,
        displayName: derived.title,
        workflow: effectiveWorkflow,
        trigger: firstNonEmpty([task, step, `Use when ${derived.signal}`]),
        description: firstNonEmpty([summary, derived.interpretation]),
        notePaths: [note.relativePath],
        tags: unique([...tags, effectiveWorkflow, "generated"]),
        status: "generated",
        maturity: nextMaturity,
        evidenceCount: nextEvidenceCount,
        lastUsedAt: new Date().toISOString(),
      },
      cwd,
    );
  }

  const resolution = await resolveLocalKnowledge(
    {
      task: task ?? derived.title,
      workflow: effectiveWorkflow,
      skill: skill.payload.id,
      limit: 1,
    },
    cwd,
  );

  return {
    note,
    skill,
    resolution,
  };
}

export async function lintPack(cwd = process.cwd()) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const [skills, wikiFiles] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listWikiEntries(config, cwd, sourcePath),
  ]);

  const issues = [];
  const referencedNotePaths = new Set();
  const referencedWikiPaths = new Set();
  const nameKeys = new Map();
  const triggerKeys = new Map();
  const wikiPaths = new Set(wikiFiles.map((entry) => normalizePath(entry.relativePath)));
  const parsedDocs = new Map();
  const noteIdentityPaths = new Map();

  const isExternalRef = (value) => /^(https?:)?\/\//.test(value) || value.startsWith("doi:") || value.startsWith("urn:");
  const parseDocForEntry = async (entry) => {
    if (!parsedDocs.has(entry.relativePath)) {
      parsedDocs.set(
        entry.relativePath,
        parseNoteDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), false),
      );
    }
    return parsedDocs.get(entry.relativePath);
  };

  for (const { filePath, value: skill } of skills) {
    const nameKey = `${skill.workflow}::${skill.name}`;
    const triggerKey = `${skill.workflow}::${skill.trigger}`;

    if (!Array.isArray(skill.notePaths) || skill.notePaths.length === 0) {
      issues.push({
        level: "error",
        code: "skill_missing_notes",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill must declare at least one note path.",
      });
    }

    if (!hasMarkdownSection(skill.body, "When to Use")) {
      issues.push({
        level: "warning",
        code: "skill_missing_when_to_use_section",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill body should contain a 'When to Use' section. See .datalox/skill.schema.md.",
      });
    }

    if (!hasMarkdownSection(skill.body, "Workflow")) {
      issues.push({
        level: "warning",
        code: "skill_missing_workflow_section",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill body should contain a 'Workflow' section. See .datalox/skill.schema.md.",
      });
    }

    if (!hasMarkdownSection(skill.body, "Expected Output")) {
      issues.push({
        level: "warning",
        code: "skill_missing_expected_output_section",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill body should contain an 'Expected Output' section. See .datalox/skill.schema.md.",
      });
    }

    if (!hasMarkdownSection(skill.body, "Notes") && !hasMarkdownSection(skill.body, "Pattern Docs")) {
      issues.push({
        level: "warning",
        code: "skill_missing_notes_section",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill body should contain a 'Notes' section. See .datalox/skill.schema.md.",
      });
    }

    if (nameKeys.has(nameKey)) {
      issues.push({
        level: "warning",
        code: "duplicate_skill_name",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: `Another skill already uses workflow/name ${nameKey}.`,
      });
    } else {
      nameKeys.set(nameKey, filePath);
    }

    if (triggerKeys.has(triggerKey)) {
      issues.push({
        level: "warning",
        code: "overlapping_skill_trigger",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: `Another skill already uses workflow/trigger ${triggerKey}.`,
      });
    } else {
      triggerKeys.set(triggerKey, filePath);
    }

    for (const notePath of toArray(skill.notePaths)) {
      referencedNotePaths.add(normalizePath(notePath));
      referencedWikiPaths.add(normalizePath(notePath));
      const resolvedNote = await resolvePatternFile(notePath, cwd, sourcePath);
      if (!resolvedNote) {
        issues.push({
          level: "error",
          code: "skill_broken_note_link",
          skillId: skill.id,
          path: normalizePath(path.relative(cwd, filePath)),
          message: `Note not found: ${notePath}`,
        });
        continue;
      }

      const parsed = await parseDocForEntry(resolvedNote);

      if (!parsed.signal) {
        issues.push({
          level: "error",
          code: "note_missing_signal",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note is missing a Signal section. See agent-wiki/note.schema.md.",
        });
      }
      if (!parsed.interpretation) {
        issues.push({
          level: "error",
          code: "note_missing_interpretation",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note is missing an Interpretation section. See agent-wiki/note.schema.md.",
        });
      }
      if (!parsed.action) {
        issues.push({
          level: "error",
          code: "note_missing_action",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note is missing an Action section. See agent-wiki/note.schema.md.",
        });
      }
      if (!parsed.whenToUse) {
        issues.push({
          level: "warning",
          code: "note_missing_when_to_use",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note should contain a When to Use section. See agent-wiki/note.schema.md.",
        });
      }
      if (!parsed.examples?.length) {
        issues.push({
          level: "warning",
          code: "note_missing_examples",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note should contain at least one example or concrete case note.",
        });
      }
      if (!parsed.evidenceLines?.length && !parsed.sources?.length) {
        issues.push({
          level: "warning",
          code: "note_missing_evidence",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note should include Evidence or at least one source reference.",
        });
      }
      if (!parsed.related?.length) {
        issues.push({
          level: "warning",
          code: "note_missing_related",
          skillId: skill.id,
          path: normalizePath(notePath),
          message: "Note should link at least one related wiki page.",
        });
      }
    }
  }

  for (const wikiEntry of wikiFiles) {
    const parsed = await parseDocForEntry(wikiEntry);
    const localRefs = [...(parsed.related ?? []), ...(parsed.sources ?? [])]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .filter((value) => !isExternalRef(value));

    for (const ref of localRefs) {
      referencedWikiPaths.add(ref);
    }
  }

  for (const wikiEntry of wikiFiles) {
    const relativePath = wikiEntry.relativePath;
    const parsed = await parseDocForEntry(wikiEntry);
    const localRefs = [...(parsed.related ?? []), ...(parsed.sources ?? [])]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .filter((value) => !isExternalRef(value));

    if (
      (wikiEntry.pageType === "note" || parsed.pageType === "note")
      && !referencedNotePaths.has(relativePath)
      && !referencedWikiPaths.has(relativePath)
    ) {
      issues.push({
        level: "warning",
        code: "orphan_note",
        path: relativePath,
        message: "Note is not referenced by any skill or other wiki page.",
      });
    }

    if (wikiEntry.pageType === "note" || parsed.pageType === "note") {
      const noteIdentity = buildParsedNoteIdentityKey(parsed);
      if (noteIdentityPaths.has(noteIdentity)) {
        issues.push({
          level: "warning",
          code: "duplicate_note_identity",
          path: relativePath,
          message: `Another note already uses identity ${noteIdentity}.`,
        });
      } else {
        noteIdentityPaths.set(noteIdentity, relativePath);
      }
    }

    for (const ref of localRefs) {
      if (!wikiPaths.has(ref)) {
        issues.push({
          level: "warning",
          code: "missing_wiki_reference",
          path: relativePath,
          message: `Referenced wiki page not found: ${ref}`,
        });
      }
    }

    if (parsed.reviewAfter && parseTimestamp(parsed.reviewAfter) > 0 && parseTimestamp(parsed.reviewAfter) < Date.now()) {
      issues.push({
        level: "warning",
        code: "stale_page_review_due",
        path: relativePath,
        message: `Wiki page review is overdue since ${parsed.reviewAfter}.`,
      });
    }

    if (parsed.status === "superseded" && !localRefs.some((ref) => wikiPaths.has(ref))) {
      issues.push({
        level: "warning",
        code: "superseded_page_without_successor",
        path: relativePath,
        message: "Superseded wiki page should point to a replacement via Related or Sources.",
      });
    }

    if (parsed.contradictionLines?.length > 0 && !parsed.evidenceLines?.length && !parsed.sources?.length) {
      issues.push({
        level: "warning",
        code: "unsupported_contradiction",
        path: relativePath,
        message: "Contradictions should cite evidence or source pages.",
      });
    }
  }

  const result = {
    ok: issues.every((issue) => issue.level !== "error"),
    issueCount: issues.length,
    issues,
    counts: {
      skills: skills.length,
      notes: wikiFiles.filter((entry) => entry.pageType === "note").length,
      wikiPages: wikiFiles.length,
    },
  };
  const artifacts = await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: "lint_pack",
      detail: result.ok
        ? "pack lint completed with no blocking issues"
        : `pack lint found ${result.issueCount} issue(s)`,
      path: `${DEFAULT_WIKI_DIR}/lint.md`,
    },
    lintResult: result,
  });

  return {
    ...result,
    artifacts,
  };
}
