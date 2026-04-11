import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadAgentConfig } from "../../dist/src/agent/loadAgentConfig.js";

const AUTHOR_ENV = "DATALOX_AUTHOR";

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
    hostSkillsDir: path.resolve(hostRoot, config.paths.hostSkillsDir ?? "skills"),
    hostPatternsDir: path.resolve(hostRoot, config.paths.hostPatternsDir ?? ".datalox/patterns"),
    hostMetaDir: path.resolve(hostRoot, ".datalox/meta"),
    seedSkillsDir: path.resolve(seedRoot, config.paths.seedSkillsDir),
    seedPatternsDir: path.resolve(seedRoot, config.paths.seedPatternsDir),
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

async function readDirJson(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Promise.all(
    jsonFiles.map(async (entry) => ({
      filePath: path.join(dirPath, entry.name),
      value: await readJson(path.join(dirPath, entry.name)),
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

function skillIdentity(skill, filePath) {
  return skill.id || skill.name || path.basename(filePath, ".json");
}

async function listSkillEntries(config, cwd = process.cwd(), sourcePath) {
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const useSameDir = pathKey(paths.hostSkillsDir) === pathKey(paths.seedSkillsDir);
  const [seedEntries, hostEntries] = await Promise.all([
    useSameDir ? Promise.resolve([]) : readDirJson(paths.seedSkillsDir),
    readDirJson(paths.hostSkillsDir),
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
  const useSameDir = pathKey(paths.hostPatternsDir) === pathKey(paths.seedPatternsDir);
  const [seedEntries, hostEntries] = await Promise.all([
    useSameDir ? Promise.resolve([]) : readDirMarkdown(paths.seedPatternsDir),
    readDirMarkdown(paths.hostPatternsDir),
  ]);

  const merged = new Map();

  for (const filePath of seedEntries) {
    const relativePath = normalizePath(path.relative(paths.seedRoot, filePath));
    merged.set(relativePath, {
      filePath,
      relativePath,
      origin: "seed",
      repoRoot: paths.seedRoot,
    });
  }

  for (const filePath of hostEntries) {
    const relativePath = normalizePath(path.relative(paths.hostRoot, filePath));
    merged.set(relativePath, {
      filePath,
      relativePath,
      origin: "host",
      repoRoot: paths.hostRoot,
    });
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
  const [skills, patterns, hostSkills, seedSkills, hostPatterns, seedPatterns] = await Promise.all([
    listSkillEntries(config, cwd, sourcePath),
    listPatternEntries(config, cwd, sourcePath),
    readDirJson(paths.hostSkillsDir),
    pathKey(paths.hostSkillsDir) === pathKey(paths.seedSkillsDir)
      ? Promise.resolve([])
      : readDirJson(paths.seedSkillsDir),
    readDirMarkdown(paths.hostPatternsDir),
    pathKey(paths.hostPatternsDir) === pathKey(paths.seedPatternsDir)
      ? Promise.resolve([])
      : readDirMarkdown(paths.seedPatternsDir),
  ]);

  return {
    skills: skills.length,
    patterns: patterns.length,
    hostSkills: hostSkills.length,
    seedSkills: seedSkills.length,
    hostPatterns: hostPatterns.length,
    seedPatterns: seedPatterns.length,
  };
}

export async function listLocalSkills(config, cwd = process.cwd(), sourcePath) {
  return listSkillEntries(config, cwd, sourcePath);
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
  return fileExists(filePath) ? readFile(filePath, "utf8") : null;
}

function parsePatternDoc(relativePath, content, includeContent) {
  const lines = content.split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^# /, "").trim()
    ?? path.basename(relativePath, ".md");
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

  const signal = (sections.signal ?? []).join(" ").trim();
  const interpretation = (sections.interpretation ?? []).join(" ").trim();
  const recommendedAction = (
    sections["recommended action"]
    ?? sections.action
    ?? []
  ).join(" ").trim();
  const summary = recommendedAction || interpretation || signal;

  return {
    path: relativePath,
    title,
    summary,
    workflow: metadata.workflow ?? null,
    skillId: metadata.skill ?? null,
    tags: metadata.tags ? String(metadata.tags).split(",").map((value) => value.trim()).filter(Boolean) : [],
    signal,
    interpretation,
    recommendedAction,
    content: includeContent ? content : null,
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
    supportingPatterns: patternDocs.map((doc) => ({
      path: doc.path,
      title: doc.title,
      interpretation: doc.interpretation || null,
      recommendedAction: doc.recommendedAction || null,
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

async function writeStableJsonFile(baseDir, stem, payload) {
  await ensureDir(baseDir);
  const filePath = path.join(baseDir, `${slugify(stem)}.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
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
    tags = [],
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath } = await loadAgentConfig(cwd);
  const { hostPatternsDir, hostRoot } = resolvePackPaths(config, { cwd, sourcePath });
  const stableId = id ?? `${workflow}-${slugify(title)}`;
  const content = [
    `# ${title}`,
    "",
    `- Workflow: ${workflow}`,
    skillId ? `- Skill: ${skillId}` : null,
    tags.length > 0 ? `- Tags: ${tags.join(", ")}` : null,
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
  ]
    .filter(Boolean)
    .join("\n");

  const filePath = await writeStableTextFile(hostPatternsDir, stableId, content);
  const relativePath = normalizePath(path.relative(hostRoot, filePath));

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
      tags,
      author: resolveAuthor(),
      updatedAt: new Date().toISOString(),
    },
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
      : path.join(hostSkillsDir, `${slugify(stableName)}.json`);
  const existing = existingEntry?.value ?? ((await fileExists(resolvedFilePath)) ? await readJson(resolvedFilePath) : null);

  const payload = {
    version: 1,
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

  return {
    filePath: await writeFile(resolvedFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8").then(() => resolvedFilePath),
    payload,
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
      sourceSkill = {
        value: resolution.matches[0].skill,
        filePath: resolution.matches[0].skillPath,
        origin: resolution.matches[0].skillOrigin,
      };
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

  const pattern = await writePatternDoc(
    {
      title: derived.title,
      workflow: effectiveWorkflow,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      skillId: sourceSkill?.value?.id,
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
  const paths = resolvePackPaths(config, { cwd, sourcePath });
  const metaPatternPaths = await readDirMarkdown(paths.hostMetaDir);
  const [skills, patternFiles] = await Promise.all([
    listLocalSkills(config, cwd, sourcePath),
    listPatternEntries(config, cwd, sourcePath),
  ]);

  const issues = [];
  const referencedPatternPaths = new Set();
  const nameKeys = new Map();
  const triggerKeys = new Map();

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

      const parsed = parsePatternDoc(
        resolvedPattern.relativePath,
        await readFile(resolvedPattern.filePath, "utf8"),
        false,
      );

      if (!parsed.signal) {
        issues.push({
          level: "error",
          code: "pattern_missing_signal",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing a Signal section. See .datalox/pattern.schema.md.",
        });
      }
      if (!parsed.interpretation) {
        issues.push({
          level: "error",
          code: "pattern_missing_interpretation",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing an Interpretation section. See .datalox/pattern.schema.md.",
        });
      }
      if (!parsed.recommendedAction) {
        issues.push({
          level: "error",
          code: "pattern_missing_action",
          skillId: skill.id,
          path: normalizePath(patternPath),
          message: "Pattern doc is missing a Recommended Action section. See .datalox/pattern.schema.md.",
        });
      }
    }
  }

  for (const patternEntry of patternFiles) {
    const relativePath = patternEntry.relativePath;
    if (!referencedPatternPaths.has(relativePath)) {
      issues.push({
        level: "warning",
        code: "orphan_pattern_doc",
        path: relativePath,
        message: "Pattern doc is not referenced by any skill.",
      });
    }
  }

  for (const metaFilePath of metaPatternPaths) {
    const relativePath = normalizePath(path.relative(paths.hostRoot, metaFilePath));
    if (!referencedPatternPaths.has(relativePath)) {
      issues.push({
        level: "warning",
        code: "orphan_pattern_doc",
        path: relativePath,
        message: "Meta pattern doc is not referenced by any skill.",
      });
    }
  }

  return {
    ok: issues.every((issue) => issue.level !== "error"),
    issueCount: issues.length,
    issues,
    counts: {
      skills: skills.length,
      patternDocs: patternFiles.length,
    },
  };
}
