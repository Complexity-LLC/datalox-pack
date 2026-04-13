import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runInNewContext } from "node:vm";

const AUTHOR_ENV = "DATALOX_AUTHOR";
const CONFIG_PATH_ENV = "DATALOX_CONFIG_JSON";
const BASE_URL_ENV = "DATALOX_BASE_URL";
const DEFAULT_WORKFLOW_ENV = "DATALOX_DEFAULT_WORKFLOW";
const AGENT_PROFILE_ENV = "DATALOX_AGENT_PROFILE";
const MODE_ENV = "DATALOX_MODE";
const PACK_MODES = ["repo_only", "service_backed"];
const AGENT_PROFILES = ["local_first", "runtime_first"];
const AGENT_INTERFACES = ["skill_loop", "runtime_compile"];
const SOURCE_KINDS = ["local_repo"];
const DEFAULT_WIKI_DIR = "agent-wiki";
const DEFAULT_PATTERN_DIR = `${DEFAULT_WIKI_DIR}/patterns`;
const DEFAULT_META_DIR = `${DEFAULT_WIKI_DIR}/meta`;
const DEFAULT_SOURCE_DIR = `${DEFAULT_WIKI_DIR}/sources`;
const DEFAULT_CONCEPT_DIR = `${DEFAULT_WIKI_DIR}/concepts`;
const DEFAULT_COMPARISON_DIR = `${DEFAULT_WIKI_DIR}/comparisons`;
const DEFAULT_QUESTION_DIR = `${DEFAULT_WIKI_DIR}/questions`;
const DEFAULT_EVENTS_DIR = `${DEFAULT_WIKI_DIR}/events`;
const WIKI_PAGE_TYPES = ["pattern", "meta", "source", "concept", "comparison", "question"];

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

function validateAgentConfig(raw) {
  const project = raw.project;
  const sources = raw.sources;
  const agent = raw.agent;
  const paths = raw.paths;
  const runtime = raw.runtime;
  const auth = raw.auth;

  if (!isRecord(project)) throw new Error("Agent config field project must be an object");
  if (!Array.isArray(sources)) throw new Error("Agent config field sources must be an array");
  if (!isRecord(agent)) throw new Error("Agent config field agent must be an object");
  if (!isRecord(paths)) throw new Error("Agent config field paths must be an object");
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
      seedPatternsDir: expectString(paths.seedPatternsDir, "paths.seedPatternsDir"),
      hostSkillsDir: paths.hostSkillsDir === null
        ? null
        : expectString(paths.hostSkillsDir, "paths.hostSkillsDir"),
      hostPatternsDir: paths.hostPatternsDir === null
        ? null
        : expectString(paths.hostPatternsDir, "paths.hostPatternsDir"),
    },
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

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeFrontmatterValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFrontmatterValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        toCamelCase(key),
        normalizeFrontmatterValue(nestedValue),
      ]),
    );
  }

  return value;
}

function parseFlowLiteral(rawValue) {
  return normalizeFrontmatterValue(
    runInNewContext(`(${rawValue})`, Object.create(null), { timeout: 100 }),
  );
}

function parseFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseFlowLiteral(trimmed);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function collectFlowBlock(lines, startIndex, indentLevel) {
  let index = startIndex;
  let depth = 0;
  let inString = false;
  let stringQuote = null;
  let escaped = false;
  const blockLines = [];

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() && blockLines.length === 0) {
      index += 1;
      continue;
    }

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (blockLines.length > 0 && indent < indentLevel && depth <= 0) {
      break;
    }

    const content = line.slice(Math.min(indentLevel, indent));
    blockLines.push(content);

    for (const char of content) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (inString) {
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === stringQuote) {
          inString = false;
          stringQuote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringQuote = char;
        continue;
      }

      if (char === "{" || char === "[") {
        depth += 1;
        continue;
      }

      if (char === "}" || char === "]") {
        depth -= 1;
      }
    }

    index += 1;
    if (blockLines.length > 0 && depth <= 0) {
      break;
    }
  }

  return {
    value: parseFlowLiteral(blockLines.join("\n")),
    nextIndex: index,
  };
}

function parseFrontmatterBlock(lines, startIndex, indentLevel) {
  let index = startIndex;
  const values = [];
  const object = {};
  let mode = null;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent < indentLevel) {
      break;
    }

    const content = line.slice(indent);
    if (content.startsWith("- ")) {
      if (mode === null) mode = "array";
      if (mode !== "array") {
        throw new Error("Invalid frontmatter: cannot mix array and object entries in one block");
      }
      values.push(parseFrontmatterScalar(content.slice(2)));
      index += 1;
      continue;
    }

    const match = content.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${content}`);
    }

    if (mode === null) mode = "object";
    if (mode !== "object") {
      throw new Error("Invalid frontmatter: cannot mix object and array entries in one block");
    }

    const [, key, rawValue = ""] = match;
    if (rawValue.trim()) {
      object[toCamelCase(key)] = parseFrontmatterScalar(rawValue);
      index += 1;
      continue;
    }

    let nestedStartIndex = index + 1;
    while (nestedStartIndex < lines.length && !lines[nestedStartIndex].trim()) {
      nestedStartIndex += 1;
    }
    const nestedLine = lines[nestedStartIndex];
    const nestedIndent = nestedLine?.match(/^ */)?.[0].length ?? 0;
    const nestedContent = nestedLine ? nestedLine.slice(Math.min(indent + 2, nestedIndent)).trim() : "";
    if (nestedContent.startsWith("{") || nestedContent.startsWith("[")) {
      const nested = collectFlowBlock(lines, nestedStartIndex, indent + 2);
      object[toCamelCase(key)] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    const nested = parseFrontmatterBlock(lines, index + 1, indent + 2);
    object[toCamelCase(key)] = nested.value;
    index = nested.nextIndex;
  }

  return {
    value: mode === "array" ? values : object,
    nextIndex: index,
  };
}

function parseFrontmatter(rawFrontmatter) {
  const lines = rawFrontmatter.split("\n");
  const result = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const [, key, rawValue = ""] = match;
    if (rawValue.trim()) {
      result[toCamelCase(key)] = parseFrontmatterScalar(rawValue);
      index += 1;
      continue;
    }

    let nestedStartIndex = index + 1;
    while (nestedStartIndex < lines.length && !lines[nestedStartIndex].trim()) {
      nestedStartIndex += 1;
    }
    const nestedLine = lines[nestedStartIndex];
    const nestedIndent = nestedLine?.match(/^ */)?.[0].length ?? 0;
    const nestedContent = nestedLine ? nestedLine.slice(Math.min(2, nestedIndent)).trim() : "";
    if (nestedContent.startsWith("{") || nestedContent.startsWith("[")) {
      const nested = collectFlowBlock(lines, nestedStartIndex, 2);
      result[toCamelCase(key)] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    const nested = parseFrontmatterBlock(lines, index + 1, 2);
    result[toCamelCase(key)] = nested.value;
    index = nested.nextIndex;
  }

  return result;
}

function splitFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: content.trim(),
    };
  }

  const endMarker = "\n---\n";
  const endIndex = content.indexOf(endMarker, 4);
  if (endIndex === -1) {
    throw new Error("Skill markdown is missing closing frontmatter fence");
  }

  return {
    frontmatter: parseFrontmatter(content.slice(4, endIndex)),
    body: content.slice(endIndex + endMarker.length).trim(),
  };
}

function inferSkillNameFromPath(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === "skill.md") {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(filePath, path.extname(filePath));
}

function parseSkillDoc(filePath, content) {
  const { frontmatter, body } = splitFrontmatter(content);
  const heading = body.split("\n").find((line) => line.startsWith("# "))?.replace(/^# /, "").trim();
  const metadata = isRecord(frontmatter.metadata) ? frontmatter.metadata : {};
  const datalox = isRecord(metadata.datalox) ? metadata.datalox : {};
  const name = frontmatter.name ?? inferSkillNameFromPath(filePath);
  const displayName = datalox.displayName ?? frontmatter.displayName ?? heading ?? name;

  return {
    id: datalox.id ?? frontmatter.id ?? name,
    name,
    displayName,
    workflow: datalox.workflow ?? frontmatter.workflow ?? null,
    trigger: datalox.trigger ?? frontmatter.trigger ?? "",
    description: frontmatter.description ?? "",
    patternPaths: toArray(datalox.patternPaths ?? frontmatter.patternPaths),
    repoHints: isRecord(datalox.repoHints)
      ? datalox.repoHints
      : isRecord(frontmatter.repoHints)
        ? frontmatter.repoHints
        : undefined,
    tags: toArray(datalox.tags ?? frontmatter.tags),
    status: datalox.status ?? frontmatter.status ?? "generated",
    author: datalox.author ?? frontmatter.author ?? null,
    updatedAt: datalox.updatedAt ?? frontmatter.updatedAt ?? null,
    body,
  };
}

function hasMarkdownSection(body, sectionName) {
  const pattern = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  return pattern.test(body);
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
        patternPaths: payload.patternPaths ?? [],
        tags: payload.tags ?? [],
        status: payload.status,
        ...(payload.author ? { author: payload.author } : {}),
        ...(payload.updatedAt ? { updatedAt: payload.updatedAt } : {}),
        ...(payload.repoHints ? { repoHints: payload.repoHints } : {}),
      },
    }),
    "---",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  const patternSection = (payload.patternPaths ?? []).length > 0
    ? [
        "## Pattern Docs",
        "",
        ...(payload.patternPaths ?? []).map((patternPath) => `- ${patternPath}`),
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
    "2. Read the linked pattern docs before acting.",
    "3. Apply the pattern docs' signal, interpretation, and recommended action to the current loop.",
    "4. If the case exposes a reusable gap, add or update a pattern doc and patch this skill.",
    "5. Run lint and refresh the visible control artifacts after patching knowledge.",
    "",
    "## Expected Output",
    "",
    "- State why this skill matched.",
    "- State what to do now based on the linked pattern docs.",
    "- State what to watch for if the case is ambiguous or risky.",
    "",
    checkFirstSection,
    patternSection,
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
    hostPatternsDir: path.resolve(hostRoot, config.paths.hostPatternsDir ?? DEFAULT_PATTERN_DIR),
    hostMetaDir: path.resolve(hostRoot, DEFAULT_META_DIR),
    hostSourcesDir: path.resolve(hostRoot, DEFAULT_SOURCE_DIR),
    hostConceptsDir: path.resolve(hostRoot, DEFAULT_CONCEPT_DIR),
    hostComparisonsDir: path.resolve(hostRoot, DEFAULT_COMPARISON_DIR),
    hostQuestionsDir: path.resolve(hostRoot, DEFAULT_QUESTION_DIR),
    seedWikiDir: path.resolve(seedRoot, DEFAULT_WIKI_DIR),
    seedSkillsDir: path.resolve(seedRoot, config.paths.seedSkillsDir),
    seedPatternsDir: path.resolve(seedRoot, config.paths.seedPatternsDir),
    seedMetaDir: path.resolve(seedRoot, DEFAULT_META_DIR),
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
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => path.join(dirPath, entry.name));
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

async function listPatternEntries(config, cwd = process.cwd(), sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const merged = new Map();
  const dirSpecs = [
    {
      pageType: "pattern",
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
  const [skills, wikiEntries, hostSkills, seedSkills, hostPatterns, seedPatterns, hostEvents] = await Promise.all([
    listSkillEntries(config, cwd, sourcePath),
    listPatternEntries(config, cwd, sourcePath),
    readSkillMarkdownEntries(paths.hostSkillsDir),
    pathKey(paths.hostSkillsDir) === pathKey(paths.seedSkillsDir)
      ? Promise.resolve([])
      : readSkillMarkdownEntries(paths.seedSkillsDir),
    readDirMarkdown(paths.hostPatternsDir),
    pathKey(paths.hostPatternsDir) === pathKey(paths.seedPatternsDir)
      ? Promise.resolve([])
      : readDirMarkdown(paths.seedPatternsDir),
    readDirJson(paths.hostEventsDir),
  ]);

  return {
    skills: skills.length,
    patterns: wikiEntries.filter((entry) => entry.pageType === "pattern").length,
    wikiPages: wikiEntries.length,
    events: hostEvents.length,
    hostSkills: hostSkills.length,
    seedSkills: seedSkills.length,
    hostPatterns: hostPatterns.length,
    seedPatterns: seedPatterns.length,
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
  const patternUsage = new Map();

  for (const skillEntry of skills) {
    for (const patternPath of toArray(skillEntry.value.patternPaths)) {
      if (!patternUsage.has(patternPath)) {
        patternUsage.set(patternPath, []);
      }
      patternUsage.get(patternPath).push(skillEntry.value.id);
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
    lines.push(`- Source: ${skillEntry.origin}`);
    if (skill.updatedAt) {
      lines.push(`- Updated: ${skill.updatedAt}`);
    }
    if (skill.author) {
      lines.push(`- Author: ${skill.author}`);
    }
    if (toArray(skill.patternPaths).length === 0) {
      lines.push("- Pattern Docs: none");
    } else {
      lines.push("- Pattern Docs:");
      for (const patternPath of toArray(skill.patternPaths).sort(comparePaths)) {
        lines.push(`  - ${patternPath}`);
      }
    }
    lines.push("");
  }

  lines.push("## Wiki Pages");
  lines.push("");

  const pageGroups = new Map();
  for (const entry of wikiEntries) {
    const group = wikiDocs.get(entry.relativePath)?.pageType ?? entry.pageType ?? "pattern";
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
      if (pageType === "pattern" || pageType === "meta") {
        const linkedSkills = unique(patternUsage.get(pageEntry.relativePath) ?? []).sort(comparePaths);
        if (linkedSkills.length > 0) {
          lines.push("- Linked Skills:");
          for (const skillId of linkedSkills) {
            lines.push(`  - ${skillId}`);
          }
        } else {
          lines.push("- Linked Skills: none");
        }
        if (doc?.recommendedAction) {
          lines.push(`- Recommended Action: ${truncateLine(doc.recommendedAction)}`);
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

function renderHotMarkdown({ config, skills, wikiEntries, wikiDocs, recentLogLines }) {
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
  const [skills, wikiEntries, logContent] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listPatternEntries(config, cwd, sourcePath),
    readTextIfPresent(path.join(hostWikiDir, "log.md")),
  ]);
  const wikiDocs = new Map();

  for (const entry of wikiEntries) {
    const content = await readFile(entry.filePath, "utf8");
    wikiDocs.set(entry.relativePath, parsePatternDoc(entry.relativePath, content, false));
  }

  const recentLogLines = (logContent ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .slice(-5);
  const hotPath = path.join(hostWikiDir, "hot.md");
  await ensureDir(hostWikiDir);
  await writeFile(
    hotPath,
    renderHotMarkdown({ config, skills, wikiEntries, wikiDocs, recentLogLines }),
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
    listPatternEntries(config, cwd, sourcePath),
  ]);
  const wikiDocs = new Map();

  for (const entry of wikiEntries) {
    const content = await readFile(entry.filePath, "utf8");
    wikiDocs.set(entry.relativePath, parsePatternDoc(entry.relativePath, content, false));
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
    .filter(Boolean);
}

function buildSkillText(skill) {
  return [
    skill.id,
    skill.name,
    skill.displayName,
    skill.workflow,
    skill.trigger,
    skill.description,
    skill.body,
    ...(skill.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

function scoreRepoHints(skill, repoContext) {
  const matches = collectRepoHintMatches(skill, repoContext);
  return (matches.files.length * 70) + (matches.prefixes.length * 60) + (matches.packageSignals.length * 25);
}

function scoreSkill(skill, query, repoContext) {
  const text = buildSkillText(skill);
  let score = 0;

  if (query.workflow && skill.workflow === query.workflow) {
    score += 40;
  }

  if (query.skill) {
    if (skill.id === query.skill || skill.name === query.skill) {
      score += 1000;
    } else {
      return -1;
    }
  }

  const tokens = tokenize([query.task, query.step].filter(Boolean).join(" "));
  for (const token of new Set(tokens)) {
    if (text.includes(token)) {
      score += 8;
    }
  }

  if (query.task && text.includes(query.task.toLowerCase())) {
    score += 20;
  }

  const repoHintWeight = query.skill || query.workflow
    ? 0.05
    : query.task || query.step
      ? 0.2
      : 1;
  score += Math.round(scoreRepoHints(skill, repoContext) * repoHintWeight);

  return score;
}

async function readTextIfPresent(filePath) {
  return (await fileExists(filePath)) ? readFile(filePath, "utf8") : null;
}

function inferWikiPageType(relativePath, frontmatterType) {
  if (typeof frontmatterType === "string" && WIKI_PAGE_TYPES.includes(frontmatterType)) {
    return frontmatterType;
  }
  if (relativePath.includes("/meta/")) return "meta";
  if (relativePath.includes("/sources/")) return "source";
  if (relativePath.includes("/concepts/")) return "concept";
  if (relativePath.includes("/comparisons/")) return "comparison";
  if (relativePath.includes("/questions/")) return "question";
  return "pattern";
}

function normalizeSectionList(lines = []) {
  return lines
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function normalizeFrontmatterRefs(value) {
  return unique(
    toArray(value)
      .map((item) => String(item).trim())
      .filter(Boolean),
  );
}

function extractMarkdownSections(body) {
  const lines = body.split("\n");
  const metadata = {};
  let activeSection = null;
  const sections = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const metadataMatch = line.match(/^- ([^:]+):\s*(.+)$/);
    if (metadataMatch && activeSection === null) {
      metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2];
      continue;
    }

    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      activeSection = sectionMatch[1].toLowerCase();
      if (!sections[activeSection]) {
        sections[activeSection] = [];
      }
      continue;
    }

    if (activeSection) {
      sections[activeSection].push(line);
    }
  }

  return { lines, metadata, sections };
}

function parseWikiDoc(relativePath, content, includeContent) {
  const { frontmatter, body } = splitFrontmatter(content);
  const { lines, metadata, sections } = extractMarkdownSections(body);
  const title = frontmatter.title
    ?? lines.find((line) => line.startsWith("# "))?.replace(/^# /, "").trim()
    ?? path.basename(relativePath, ".md");
  const pageType = inferWikiPageType(relativePath, frontmatter.type);
  const related = unique([
    ...normalizeFrontmatterRefs(frontmatter.related),
    ...normalizeSectionList(sections.related),
  ]);
  const sources = unique([
    ...normalizeFrontmatterRefs(frontmatter.sources),
    ...normalizeSectionList(sections.sources),
  ]);
  const evidenceLines = normalizeSectionList(sections.evidence);
  const contradictionLines = [
    ...(sections.contradictions ?? []).map((line) => line.trim()).filter(Boolean),
    ...(body.includes("[!contradiction]") ? ["contradiction_callout_present"] : []),
  ];
  const summary = firstNonEmpty([
    (sections.overview ?? []).join(" ").trim(),
    (sections.definition ?? []).join(" ").trim(),
    (sections.answer ?? []).join(" ").trim(),
    (sections.verdict ?? []).join(" ").trim(),
    (sections["recommended action"] ?? []).join(" ").trim(),
    (sections.interpretation ?? []).join(" ").trim(),
    (sections.signal ?? []).join(" ").trim(),
  ]);

  return {
    path: relativePath,
    pageType,
    title,
    summary,
    frontmatter,
    metadata,
    body,
    sections,
    workflow: frontmatter.workflow ?? metadata.workflow ?? null,
    skillId: frontmatter.skill ?? metadata.skill ?? null,
    tags: Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map((value) => String(value).trim()).filter(Boolean)
      : metadata.tags
        ? String(metadata.tags).split(",").map((value) => value.trim()).filter(Boolean)
        : [],
    author: frontmatter.author ?? metadata.author ?? null,
    updatedAt: frontmatter.updated ?? metadata.updated ?? null,
    reviewAfter: frontmatter.reviewAfter ?? frontmatter.review_after ?? metadata.review_after ?? null,
    confidence: frontmatter.confidence ?? null,
    status: frontmatter.status ?? metadata.status ?? "active",
    related,
    sources,
    evidenceLines,
    contradictionLines,
    content: includeContent ? content : null,
  };
}

function parsePatternDoc(relativePath, content, includeContent) {
  const page = parseWikiDoc(relativePath, content, includeContent);
  const { frontmatter, metadata, sections } = page;
  const signal = (sections.signal ?? []).join(" ").trim();
  const whenToUse = (
    sections["when to use"]
    ?? sections["when-to-use"]
    ?? []
  ).join(" ").trim();
  const interpretation = (sections.interpretation ?? []).join(" ").trim();
  const recommendedAction = (
    sections["recommended action"]
    ?? sections.action
    ?? []
  ).join(" ").trim();
  const examples = (
    sections.examples
    ?? []
  )
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  const doNot = (
    sections["do not"]
    ?? sections.donot
    ?? []
  ).join(" ").trim();
  const exceptions = (sections.exceptions ?? []).join(" ").trim();
  const evidence = page.evidenceLines.join(" ").trim();
  const summary = page.summary ?? recommendedAction ?? interpretation ?? signal;

  return {
    path: relativePath,
    pageType: page.pageType,
    title: page.title,
    summary,
    workflow: page.workflow,
    skillId: page.skillId,
    tags: page.tags,
    author: page.author,
    updatedAt: page.updatedAt,
    reviewAfter: page.reviewAfter,
    confidence: page.confidence,
    status: page.status,
    sources: page.sources,
    related: page.related,
    contradictionLines: page.contradictionLines,
    evidenceLines: page.evidenceLines,
    whenToUse,
    signal,
    interpretation,
    recommendedAction,
    doNot,
    exceptions,
    examples,
    evidence,
    content: page.content,
  };
}

async function loadPatternDoc(cwd, sourcePath, patternPath, includeContent) {
  const resolvedPattern = await resolvePatternFile(patternPath, cwd, sourcePath);
  if (!resolvedPattern) {
    throw new Error(`Pattern doc not found: ${patternPath}`);
  }

  const content = await readFile(resolvedPattern.filePath, "utf8");
  return {
    ...parsePatternDoc(resolvedPattern.relativePath, content, includeContent),
    filePath: resolvedPattern.filePath,
    origin: resolvedPattern.origin,
  };
}

function explainSkillMatch(skill, query, repoContext) {
  const reasons = [];

  if (query.skill && (skill.id === query.skill || skill.name === query.skill)) {
    reasons.push(`explicit skill match: ${query.skill}`);
  }

  if (query.workflow && skill.workflow === query.workflow) {
    reasons.push(`workflow match: ${query.workflow}`);
  }

  const queryTokens = tokenize([query.task, query.step].filter(Boolean).join(" "));
  const skillText = buildSkillText(skill);
  const matchedTokens = unique(queryTokens.filter((token) => skillText.includes(token))).slice(0, 5);
  if (matchedTokens.length > 0) {
    reasons.push(`task overlap: ${matchedTokens.join(", ")}`);
  }

  const repoHintMatches = collectRepoHintMatches(skill, repoContext);
  if (repoHintMatches.files.length > 0) {
    reasons.push(`repo file hints: ${repoHintMatches.files.join(", ")}`);
  }
  if (repoHintMatches.prefixes.length > 0) {
    reasons.push(`repo path hints: ${repoHintMatches.prefixes.join(", ")}`);
  }
  if (repoHintMatches.packageSignals.length > 0) {
    reasons.push(`package hints: ${repoHintMatches.packageSignals.join(", ")}`);
  }

  return reasons;
}

function buildLoopGuidance(patternDocs, whyMatched) {
  return {
    whyMatched,
    whatToDoNow: unique(patternDocs.map((doc) => doc.recommendedAction).filter(Boolean)),
    watchFor: unique(patternDocs.map((doc) => doc.signal).filter(Boolean)),
    interpretations: unique(patternDocs.map((doc) => doc.interpretation).filter(Boolean)),
    nextReads: unique(
      patternDocs.flatMap((doc) => [...(doc.related ?? []), ...(doc.sources ?? [])]),
    ),
    supportingPatterns: patternDocs.map((doc) => ({
      path: doc.path,
      title: doc.title,
      interpretation: doc.interpretation || null,
      recommendedAction: doc.recommendedAction || null,
      related: doc.related ?? [],
      sources: doc.sources ?? [],
    })),
  };
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
    .map(({ filePath, value, origin, repoRoot }) => ({
      filePath,
      origin,
      repoRoot,
      skill: value,
      score: scoreSkill(
        value,
        {
          task,
          workflow,
          step,
          skill,
        },
        repoContext,
      ),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  const effectiveWorkflow = workflow
    || ranked[0]?.skill.workflow
    || config.runtime.defaultWorkflow;

  const selectionBasis = skill
    ? "explicit_skill"
    : task || step || workflow
      ? "task_query"
      : "repo_context";

  const matches = await Promise.all(
    ranked.map(async (item) => {
      const patternDocs = await Promise.all(
        toArray(item.skill.patternPaths).map((patternPath) =>
          loadPatternDoc(cwd, sourcePath, patternPath, includeContent)
        ),
      );
      const whyMatched = explainSkillMatch(
        item.skill,
        {
          task,
          workflow,
          step,
          skill,
        },
        repoContext,
      );

      return {
        score: item.score,
        skillPath: item.filePath,
        skillOrigin: item.origin,
        skill: item.skill,
        patternDocs,
        loopGuidance: buildLoopGuidance(patternDocs, whyMatched),
      };
    }),
  );

  return {
    mode: config.mode,
    runtimeEnabled: config.runtime.enabled,
    detectOnEveryLoop: config.agent.detectOnEveryLoop,
    nativeSkillPolicy: config.agent.nativeSkillPolicy,
    selectionBasis,
    configPath: sourcePath,
    localOverridePath,
    workflow: effectiveWorkflow,
    repoContext,
    matches,
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

export async function writePatternDoc(
  {
    id,
    title,
    workflow,
    signal,
    interpretation,
    recommendedAction,
    skillId,
    related = [],
    sources = [],
    tags = [],
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const { hostPatternsDir, hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const stableId = id ?? `${workflow}-${slugify(title)}`;
  const author = resolveAuthor();
  const updatedAt = new Date().toISOString();
  const titleText = title.trim();
  const defaultWhenToUse = signal.trim().endsWith(".")
    ? signal.trim()
    : `${signal.trim()}.`;
  const content = [
    "---",
    "type: pattern",
    `title: ${titleText}`,
    `workflow: ${workflow}`,
    skillId ? `skill: ${skillId}` : null,
    tags.length > 0 ? "tags:" : "tags: []",
    ...(tags.length > 0 ? tags.map((tag) => `  - ${tag}`) : []),
    "confidence: medium",
    "status: active",
    related.length > 0 ? "related:" : "related: []",
    ...(related.length > 0 ? related.map((item) => `  - ${item}`) : []),
    sources.length > 0 ? "sources:" : "sources: []",
    ...(sources.length > 0 ? sources.map((item) => `  - ${item}`) : []),
    `author: ${author}`,
    `updated: ${updatedAt}`,
    "---",
    "",
    `# ${titleText}`,
    "",
    "## When to Use",
    "",
    `Use this pattern when ${defaultWhenToUse.charAt(0).toLowerCase()}${defaultWhenToUse.slice(1)}`,
    "",
    "",
    "## Signal",
    "",
    signal,
    "",
    "## Interpretation",
    "",
    interpretation,
    "",
    "## Recommended Action",
    "",
    recommendedAction,
    "",
    "## Examples",
    "",
    "- Add a concrete observed case here when this pattern repeats.",
    "",
    "## Evidence",
    "",
    ...(sources.length > 0
      ? sources.map((item) => `- ${item}`)
      : ["- Add a concrete source, reviewer note, or case trace here."]),
    "",
    "## Related",
    "",
    ...(related.length > 0
      ? related.map((item) => `- ${item}`)
      : ["- Add a wiki page path such as agent-wiki/concepts/example.md."]),
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const filePath = await writeStableTextFile(hostPatternsDir, stableId, content);
  const relativePath = normalizePath(path.relative(hostRoot, filePath));
  const artifacts = await updateControlArtifacts(config, cwd, sourcePath, {
    logEntry: {
      action: "patch_pattern",
      detail: `${title} for ${workflow}`,
      path: relativePath,
    },
  });

  return {
    filePath,
    relativePath,
    payload: {
      version: 1,
      id: stableId,
      title,
      workflow,
      signal,
      interpretation,
      recommendedAction,
      skillId: skillId ?? null,
      related,
      sources,
      tags,
      author,
      updatedAt,
    },
    artifacts,
  };
}

export async function writeSkill(
  {
    id,
    filePath,
    name,
    displayName,
    workflow,
    trigger,
    description,
    patternPaths = [],
    repoHints,
    tags = [],
    status,
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
    patternPaths: unique([...(existing?.patternPaths ?? []), ...patternPaths]),
    repoHints: repoHints ?? existing?.repoHints,
    tags: unique([...(existing?.tags ?? []), ...tags]),
    status: status ?? existing?.status ?? "generated",
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
        ? `${payload.id} created with ${payload.patternPaths.length} pattern doc(s)`
        : `${payload.id} updated with ${payload.patternPaths.length} pattern doc(s)`,
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

export async function attachPatternToSkill(
  {
    skillId,
    patternPath,
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
      patternPaths: [...(sourceSkill.value.patternPaths ?? []), patternPath],
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
    `This interaction exposed a reusable pattern for ${input.workflow}.`,
  ]) ?? `Pattern for ${input.workflow}`;

  const recommendedAction = firstNonEmpty([
    input.recommendedAction,
    "Reuse this pattern before changing the current workflow.",
  ]) ?? "Reuse this pattern before continuing.";

  return {
    title: shortenSentence(title, 120),
    signal,
    interpretation,
    recommendedAction,
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
      detail: `${nextPayload.eventKind ?? "observation"} | ${nextPayload.workflow ?? "unknown"} | ${nextPayload.fingerprint}`,
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
    task,
    workflow,
    step,
    skillId,
    summary,
    observations = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
    eventKind = "observation",
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
  const reusableMatch = topMatch && (!workflow || topMatch.skill.workflow === workflow)
    ? topMatch
    : null;
  const effectiveWorkflow = workflow
    || reusableMatch?.skill.workflow
    || config.runtime.defaultWorkflow;
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
  const fingerprint = buildEventFingerprint({
    workflow: effectiveWorkflow,
    skillId: skillId ?? topMatch?.skill.id,
    title: derived.title,
    signal: derived.signal,
    summary,
    task,
    step,
  });
  const existingEvents = await listRecordedEvents(config, cwd, sourcePath);
  const occurrenceCount = existingEvents.filter((entry) => entry.value?.fingerprint === fingerprint).length + 1;
  const event = await writeTurnEventFile(
    {
      eventKind,
      workflow: effectiveWorkflow,
      task: task ?? null,
      step: step ?? null,
      summary: summary ?? null,
      observations,
      transcript: transcript ?? null,
      title: derived.title,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      tags: unique([...tags, effectiveWorkflow]),
      fingerprint,
      explicitSkillId: skillId ?? null,
      matchedSkillId: reusableMatch?.skill.id ?? null,
      matchedSkillScore: reusableMatch?.score ?? null,
      matchedPatternPaths: reusableMatch?.patternDocs?.map((doc) => doc.path) ?? [],
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

function decidePromotionAction({ occurrenceCount, matchedSkillId, minWikiOccurrences, minSkillOccurrences }) {
  if (matchedSkillId) {
    if (occurrenceCount >= minWikiOccurrences) {
      return {
        action: "patch_skill_with_pattern",
        reason: "repeated gap matched an existing skill, so patch the skill and supporting wiki.",
      };
    }
    return {
      action: "record_only",
      reason: "single observed gap for an existing skill; keep it in events and hot cache until it repeats.",
    };
  }

  if (occurrenceCount >= minSkillOccurrences) {
    return {
      action: "create_skill_from_gap",
      reason: "repeated gap has no matching skill and crossed the new-skill threshold.",
    };
  }

  if (occurrenceCount >= minWikiOccurrences) {
    return {
      action: "create_wiki_pattern",
      reason: "gap repeated enough to justify a reusable wiki pattern, but not a new skill yet.",
    };
  }

  return {
    action: "record_only",
    reason: "first observation stays as an event only.",
  };
}

export async function promoteGap(
  {
    task,
    workflow,
    step,
    skillId,
    summary,
    observations = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
    eventKind = "observation",
    minWikiOccurrences = 2,
    minSkillOccurrences = 3,
  },
  cwd = process.cwd(),
) {
  const recorded = await recordTurnResult(
    {
      task,
      workflow,
      step,
      skillId,
      summary,
      observations,
      transcript,
      tags,
      title,
      signal,
      interpretation,
      recommendedAction,
      eventKind,
    },
    cwd,
  );
  const topMatch = recorded.resolution.matches[0] ?? null;
  const reusableMatch = topMatch && (!workflow || topMatch.skill.workflow === workflow)
    ? topMatch
    : null;
  const decision = {
    ...decidePromotionAction({
      occurrenceCount: recorded.occurrenceCount,
      matchedSkillId: skillId ?? reusableMatch?.skill.id ?? null,
      minWikiOccurrences,
      minSkillOccurrences,
    }),
    occurrenceCount: recorded.occurrenceCount,
  };

  if (decision.action === "record_only") {
    return {
      ...recorded,
      decision,
      promotion: null,
    };
  }

  const effectiveWorkflow = workflow
    || reusableMatch?.skill.workflow
    || recorded.event.payload.workflow;

  if (decision.action === "create_wiki_pattern") {
    const pattern = await writePatternDoc(
      {
        title: recorded.event.payload.title,
        workflow: effectiveWorkflow,
        signal: recorded.event.payload.signal,
        interpretation: recorded.event.payload.interpretation,
        recommendedAction: recorded.event.payload.recommendedAction,
        skillId: null,
        related: unique(recorded.event.payload.matchedPatternPaths ?? []),
        sources: [],
        tags: unique([...(recorded.event.payload.tags ?? []), "promoted"]),
      },
      cwd,
    );

    return {
      ...recorded,
      decision,
      promotion: {
        pattern,
        skill: null,
      },
    };
  }

  const learned = await learnFromInteraction(
    {
      task,
      workflow: effectiveWorkflow,
      step,
      skillId: decision.action === "patch_skill_with_pattern" ? (skillId ?? reusableMatch?.skill.id) : undefined,
      summary,
      observations,
      transcript,
      tags: unique([...tags, "promoted"]),
      title,
      signal,
      interpretation,
      recommendedAction,
    },
    cwd,
  );

  return {
    ...recorded,
    decision,
    promotion: learned,
  };
}

export async function learnFromInteraction(
  {
    task,
    workflow,
    step,
    skillId,
    summary,
    observations = [],
    transcript,
    tags = [],
    title,
    signal,
    interpretation,
    recommendedAction,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);

  let sourceSkill = null;
  if (skillId) {
    sourceSkill = await getLocalSkillById(config, skillId, cwd, sourcePath);
  } else {
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
    || config.runtime.defaultWorkflow;

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
  if (sourceSkill?.value?.patternPaths?.length) {
    const existingPatternDocs = await Promise.all(
      sourceSkill.value.patternPaths.map((patternPath) =>
        loadPatternDoc(cwd, sourcePath, patternPath, false)
      ),
    );
    inheritedRelated = unique(sourceSkill.value.patternPaths);
    inheritedSources = unique(existingPatternDocs.flatMap((doc) => doc.sources ?? []));
  }

  const pattern = await writePatternDoc(
    {
      title: derived.title,
      workflow: effectiveWorkflow,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      skillId: sourceSkill?.value?.id,
      related: inheritedRelated,
      sources: inheritedSources,
      tags: unique([...tags, effectiveWorkflow]),
    },
    cwd,
  );

  let skill = null;
  if (sourceSkill?.value) {
    skill = await writeSkill(
      {
        ...sourceSkill.value,
        filePath: sourceSkill.origin === "host" ? sourceSkill.filePath : undefined,
        patternPaths: [...(sourceSkill.value.patternPaths ?? []), pattern.relativePath],
      },
      cwd,
    );
  } else {
    const generatedName = slugify(firstNonEmpty([task, step, derived.title, "generated-skill"]) ?? "generated-skill");
    skill = await writeSkill(
      {
        id: `${effectiveWorkflow}.${generatedName}`,
        name: generatedName,
        displayName: derived.title,
        workflow: effectiveWorkflow,
        trigger: firstNonEmpty([task, step, `Use when ${derived.signal}`]),
        description: firstNonEmpty([summary, derived.interpretation]),
        patternPaths: [pattern.relativePath],
        tags: unique([...tags, effectiveWorkflow, "generated"]),
        status: "generated",
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
    pattern,
    skill,
    resolution,
  };
}

export async function lintPack(cwd = process.cwd()) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const [skills, wikiFiles] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listPatternEntries(config, cwd, sourcePath),
  ]);

  const issues = [];
  const referencedPatternPaths = new Set();
  const referencedWikiPaths = new Set();
  const nameKeys = new Map();
  const triggerKeys = new Map();
  const wikiPaths = new Set(wikiFiles.map((entry) => normalizePath(entry.relativePath)));
  const parsedDocs = new Map();

  const isExternalRef = (value) => /^(https?:)?\/\//.test(value) || value.startsWith("doi:") || value.startsWith("urn:");
  const parseDocForEntry = async (entry) => {
    if (!parsedDocs.has(entry.relativePath)) {
      parsedDocs.set(
        entry.relativePath,
        parsePatternDoc(entry.relativePath, await readFile(entry.filePath, "utf8"), false),
      );
    }
    return parsedDocs.get(entry.relativePath);
  };

  for (const { filePath, value: skill } of skills) {
    const nameKey = `${skill.workflow}::${skill.name}`;
    const triggerKey = `${skill.workflow}::${skill.trigger}`;

    if (!Array.isArray(skill.patternPaths) || skill.patternPaths.length === 0) {
      issues.push({
        level: "error",
        code: "skill_missing_patterns",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill must declare at least one pattern path.",
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

    if (!hasMarkdownSection(skill.body, "Pattern Docs")) {
      issues.push({
        level: "warning",
        code: "skill_missing_pattern_docs_section",
        skillId: skill.id,
        path: normalizePath(path.relative(cwd, filePath)),
        message: "Skill body should contain a 'Pattern Docs' section. See .datalox/skill.schema.md.",
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

    for (const patternPath of toArray(skill.patternPaths)) {
      referencedPatternPaths.add(normalizePath(patternPath));
      referencedWikiPaths.add(normalizePath(patternPath));
      const resolvedPattern = await resolvePatternFile(patternPath, cwd, sourcePath);
      if (!resolvedPattern) {
        issues.push({
          level: "error",
          code: "missing_pattern_doc",
          skillId: skill.id,
          path: normalizePath(path.relative(cwd, filePath)),
          message: `Pattern doc not found: ${patternPath}`,
        });
        continue;
      }

      const parsed = await parseDocForEntry(resolvedPattern);

      if (!parsed.signal) {
        issues.push({
          level: "error",
          code: "pattern_missing_signal",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing a Signal section. See agent-wiki/pattern.schema.md.",
        });
      }
      if (!parsed.interpretation) {
        issues.push({
          level: "error",
          code: "pattern_missing_interpretation",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing an Interpretation section. See agent-wiki/pattern.schema.md.",
        });
      }
      if (!parsed.recommendedAction) {
        issues.push({
          level: "error",
          code: "pattern_missing_action",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing a Recommended Action section. See agent-wiki/pattern.schema.md.",
        });
      }
      if (!parsed.whenToUse) {
        issues.push({
          level: "warning",
          code: "pattern_missing_when_to_use",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc should contain a When to Use section. See agent-wiki/pattern.schema.md.",
        });
      }
      if (!parsed.examples?.length) {
        issues.push({
          level: "warning",
          code: "pattern_missing_examples",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc should contain at least one example or concrete case note.",
        });
      }
      if (!parsed.evidenceLines?.length && !parsed.sources?.length) {
        issues.push({
          level: "warning",
          code: "pattern_missing_evidence",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc should include Evidence or at least one source reference.",
        });
      }
      if (!parsed.related?.length) {
        issues.push({
          level: "warning",
          code: "pattern_missing_related",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc should link at least one related wiki page.",
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
      (wikiEntry.pageType === "pattern" || parsed.pageType === "pattern")
      && !referencedPatternPaths.has(relativePath)
      && !referencedWikiPaths.has(relativePath)
    ) {
      issues.push({
        level: "warning",
        code: "orphan_pattern_doc",
        path: relativePath,
        message: "Pattern doc is not referenced by any skill or other wiki page.",
      });
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

  for (const wikiEntry of wikiFiles) {
    const doc = parsedDocs.get(wikiEntry.relativePath);
    if (doc?.pageType !== "pattern" && doc?.pageType !== "meta" && !referencedWikiPaths.has(wikiEntry.relativePath)) {
      issues.push({
        level: "warning",
        code: "orphan_wiki_page",
        path: wikiEntry.relativePath,
        message: "Wiki page is not referenced by any pattern, source, or related link.",
      });
    }
  }

  const result = {
    ok: issues.every((issue) => issue.level !== "error"),
    issueCount: issues.length,
    issues,
    counts: {
      skills: skills.length,
      patternDocs: wikiFiles.filter((entry) => entry.pageType === "pattern").length,
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
