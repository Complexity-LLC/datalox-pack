import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH_ENV = "DATALOX_CONFIG_JSON";
const BASE_URL_ENV = "DATALOX_BASE_URL";
const DEFAULT_WORKFLOW_ENV = "DATALOX_DEFAULT_WORKFLOW";
const AGENT_PROFILE_ENV = "DATALOX_AGENT_PROFILE";
const MODE_ENV = "DATALOX_MODE";

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
    if (isRecord(baseValue) && isRecord(value)) {
      merged[key] = deepMerge(baseValue, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function applyEnvOverrides(config) {
  const next = structuredClone(config);

  if (process.env[BASE_URL_ENV]) {
    next.runtime.baseUrl = process.env[BASE_URL_ENV];
  }
  if (process.env[DEFAULT_WORKFLOW_ENV]) {
    next.runtime.defaultWorkflow = process.env[DEFAULT_WORKFLOW_ENV];
  }
  if (process.env[AGENT_PROFILE_ENV]) {
    next.agent.profile = process.env[AGENT_PROFILE_ENV];
  }
  if (process.env[MODE_ENV]) {
    next.mode = process.env[MODE_ENV];
  }

  return next;
}

export async function loadPackConfig(cwd = process.cwd()) {
  const configuredPath = process.env[CONFIG_PATH_ENV];
  if (configuredPath) {
    const sourcePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(cwd, configuredPath);
    const config = applyEnvOverrides(await readJson(sourcePath));
    return {
      config,
      sourcePath,
      localOverridePath: undefined,
    };
  }

  const sourcePath = path.resolve(cwd, ".datalox/config.json");
  const localOverridePath = path.resolve(cwd, ".datalox/config.local.json");
  const baseConfig = await readJson(sourcePath);
  const mergedConfig = (await fileExists(localOverridePath))
    ? deepMerge(baseConfig, await readJson(localOverridePath))
    : baseConfig;

  return {
    config: applyEnvOverrides(mergedConfig),
    sourcePath,
    localOverridePath: (await fileExists(localOverridePath)) ? localOverridePath : undefined,
  };
}

export function resolvePackPaths(config, cwd = process.cwd()) {
  return {
    skillsDir: path.resolve(cwd, config.paths.localSkillsDir),
    docsDir: path.resolve(cwd, config.paths.localDocsDir),
    viewsDir: path.resolve(cwd, config.paths.localViewsDir),
    workingSkillsDir: path.resolve(cwd, config.paths.workingSkillsDir),
    workingPatternsDir: path.resolve(cwd, config.paths.workingPatternsDir),
    proposalsDir: path.resolve(cwd, config.writeback.proposalsDir),
    proposedSkillsDir: path.resolve(cwd, config.writeback.proposedSkillsDir),
    proposedPatternsDir: path.resolve(cwd, config.writeback.proposedPatternsDir),
    capturesDir: path.resolve(cwd, config.writeback.capturesDir),
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

async function readDirJson(dirPath) {
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

export async function countPackFiles(config, cwd = process.cwd()) {
  const paths = resolvePackPaths(config, cwd);

  const [skills, docs, views, workingSkills, workingPatterns] = await Promise.all([
    readDirJson(paths.skillsDir),
    readdir(paths.docsDir, { withFileTypes: true }),
    readDirJson(paths.viewsDir),
    readDirJson(paths.workingSkillsDir),
    readDirJson(paths.workingPatternsDir),
  ]);

  return {
    approvedSkills: skills.length,
    docs: docs.filter((entry) => entry.isFile()).length,
    views: views.length,
    workingSkills: workingSkills.length,
    workingPatterns: workingPatterns.length,
  };
}

export async function listLocalSkills(config, cwd = process.cwd()) {
  const { skillsDir, workingSkillsDir } = resolvePackPaths(config, cwd);
  const [approvedSkills, workingSkills] = await Promise.all([
    readDirJson(skillsDir),
    readDirJson(workingSkillsDir),
  ]);

  const merged = new Map();

  for (const entry of approvedSkills) {
    const skillId = entry.value.id ?? entry.value.name ?? entry.filePath;
    merged.set(skillId, {
      ...entry,
      layer: "approved",
    });
  }

  for (const entry of workingSkills) {
    const skillId = entry.value.id ?? entry.value.name ?? entry.filePath;
    merged.set(skillId, {
      ...entry,
      layer: "working",
    });
  }

  return [...merged.values()];
}

export async function getLocalSkillById(config, skillId, cwd = process.cwd()) {
  if (!skillId) {
    return null;
  }

  const skills = await listLocalSkills(config, cwd);
  return skills.find(({ value }) => value.id === skillId || value.name === skillId) ?? null;
}

export async function listWorkingPatterns(config, cwd = process.cwd()) {
  const { workingPatternsDir } = resolvePackPaths(config, cwd);
  const entries = await readDirJson(workingPatternsDir);
  return entries.map((entry) => ({
    ...entry,
    layer: "working",
  }));
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

function normalizePath(value) {
  return value.replaceAll("\\", "/");
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

function scoreRepoHints(skill, repoContext) {
  const hints = skill.repoHints;
  if (!isRecord(hints)) {
    return 0;
  }

  let score = 0;
  const changed = repoContext.changedPaths;
  const root = repoContext.rootPaths;
  const packageSignals = repoContext.packageSignals;

  for (const file of toArray(hints.files)) {
    const normalized = normalizePath(String(file));
    if (changed.includes(normalized)) {
      score += 70;
    }
    if (root.includes(normalized)) {
      score += 35;
    }
  }

  for (const prefix of toArray(hints.pathPrefixes)) {
    const normalized = normalizePath(String(prefix));
    if (changed.some((value) => value.startsWith(normalized))) {
      score += 60;
    }
    if (root.some((value) => value.startsWith(normalized.replace(/\/$/, "")))) {
      score += 20;
    }
  }

  for (const signal of toArray(hints.packageSignals)) {
    const token = String(signal).toLowerCase();
    if (packageSignals.includes(token)) {
      score += 25;
    }
  }

  return score;
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
  const uniqueTokens = new Set(tokens);
  for (const token of uniqueTokens) {
    if (text.includes(token)) {
      score += 8;
    }
  }

  if (query.task && text.includes(query.task.toLowerCase())) {
    score += 20;
  }

  if (query.layer === "working") {
    score += 3;
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

async function loadDocRef(cwd, ref, includeRaw) {
  if (ref.kind !== "path") {
    return {
      kind: ref.kind,
      value: ref.value,
      viewPath: ref.viewPath ?? null,
      view: null,
      rawDocPath: null,
      rawContent: null,
    };
  }

  const rawDocPath = path.resolve(cwd, ref.value);
  const viewPath = ref.viewPath ? path.resolve(cwd, ref.viewPath) : null;
  const view = viewPath ? await readJson(viewPath) : null;
  const rawContent = includeRaw ? await readTextIfPresent(rawDocPath) : null;

  return {
    kind: ref.kind,
    value: ref.value,
    viewPath: ref.viewPath ?? null,
    view,
    rawDocPath,
    rawContent,
  };
}

export async function resolveLocalKnowledge(
  {
    task,
    workflow,
    step,
    skill,
    limit = 3,
    includeRaw = false,
  },
  cwd = process.cwd(),
) {
  const { config, sourcePath, localOverridePath } = await loadPackConfig(cwd);
  const [localSkills, workingPatterns, repoContext] = await Promise.all([
    listLocalSkills(config, cwd),
    listWorkingPatterns(config, cwd),
    collectRepoContext(cwd),
  ]);

  const ranked = localSkills
    .map(({ filePath, value, layer }) => ({
      filePath,
      skill: value,
      layer,
      score: scoreSkill(
        value,
        {
          task,
          workflow,
          step,
          skill,
          layer,
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
    ranked.map(async (item) => ({
      score: item.score,
      skillLayer: item.layer,
      skillPath: item.filePath,
      skill: item.skill,
      defaultDoc: item.skill.defaultDocRef
        ? await loadDocRef(cwd, item.skill.defaultDocRef, includeRaw)
        : null,
      supportingDocs: await Promise.all(
        toArray(item.skill.supportingDocRefs).map((ref) => loadDocRef(cwd, ref, includeRaw)),
      ),
      linkedPatterns: workingPatterns
        .filter(({ value }) => value.workflow === effectiveWorkflow)
        .filter(({ value }) => {
          if (value.skillId && item.skill.id) {
            return value.skillId === item.skill.id;
          }
          if (Array.isArray(item.skill.patternIds) && item.skill.patternIds.length > 0) {
            return item.skill.patternIds.includes(value.id);
          }
          return false;
        })
        .map(({ filePath, value, layer }) => ({
          filePath,
          layer,
          pattern: value,
        })),
    })),
  );

  return {
    mode: config.mode,
    runtimeEnabled: config.runtime.enabled,
    nativeSkillPolicy: config.agent.nativeSkillPolicy,
    selectionBasis,
    configPath: sourcePath,
    localOverridePath,
    workflow: effectiveWorkflow,
    repoContext,
    matches,
  };
}

function currentTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeProposalFile(baseDir, stem, payload) {
  await ensureDir(baseDir);
  const fileName = `${currentTimestamp()}--${slugify(stem)}.json`;
  const filePath = path.join(baseDir, fileName);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

async function writeStableJsonFile(baseDir, stem, payload) {
  await ensureDir(baseDir);
  const filePath = path.join(baseDir, `${slugify(stem)}.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function resolveAuthor(config) {
  return process.env[config.writeback.authorEnv] || process.env.USER || "unknown";
}

export async function writePatternProposal(
  {
    workflow,
    title,
    signal,
    interpretation,
    recommendedAction,
    skillId,
    docPath,
    tags = [],
  },
  cwd = process.cwd(),
) {
  const { config } = await loadPackConfig(cwd);
  const { proposedPatternsDir } = resolvePackPaths(config, cwd);

  const payload = {
    version: 1,
    proposalType: "pattern",
    status: "proposed",
    createdAt: new Date().toISOString(),
    author: resolveAuthor(config),
    workflow,
    title,
    signal,
    interpretation,
    recommendedAction,
    skillId: skillId ?? null,
    docPath: docPath ?? null,
    tags,
  };

  const filePath = await writeProposalFile(proposedPatternsDir, title, payload);
  return { filePath, payload };
}

export async function writeSkillProposal(
  {
    id,
    name,
    displayName,
    workflow,
    trigger,
    description,
    defaultDoc,
    supportingDocs = [],
    tags = [],
  },
  cwd = process.cwd(),
) {
  const { config } = await loadPackConfig(cwd);
  const { proposedSkillsDir } = resolvePackPaths(config, cwd);

  const payload = {
    version: 1,
    proposalType: "skill",
    status: "proposed",
    createdAt: new Date().toISOString(),
    author: resolveAuthor(config),
    skill: {
      version: 1,
      id,
      name,
      displayName: displayName ?? name,
      workflow,
      trigger,
      description,
      defaultDocRef: {
        kind: "path",
        value: defaultDoc,
      },
      supportingDocRefs: supportingDocs.map((docPath) => ({
        kind: "path",
        value: docPath,
      })),
      tags,
      status: "proposed",
    },
  };

  const filePath = await writeProposalFile(proposedSkillsDir, name, payload);
  return { filePath, payload };
}

export async function writeWorkingPattern(
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
  const { config } = await loadPackConfig(cwd);
  const { workingPatternsDir } = resolvePackPaths(config, cwd);
  const stableId = id ?? slugify(title);
  const filePath = path.join(workingPatternsDir, `${slugify(stableId)}.json`);
  const existing = (await fileExists(filePath)) ? await readJson(filePath) : null;

  const payload = {
    version: 1,
    layer: "working",
    id: stableId,
    title,
    workflow,
    signal,
    interpretation,
    recommendedAction,
    skillId: skillId ?? null,
    tags,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: resolveAuthor(config),
  };

  return {
    filePath: await writeStableJsonFile(workingPatternsDir, stableId, payload),
    payload,
  };
}

export async function writeWorkingSkill(
  {
    id,
    name,
    displayName,
    workflow,
    trigger,
    description,
    defaultDoc,
    defaultDocRef,
    supportingDocs = [],
    supportingDocRefs,
    patternIds = [],
    tags = [],
  },
  cwd = process.cwd(),
) {
  const { config } = await loadPackConfig(cwd);
  const { workingSkillsDir } = resolvePackPaths(config, cwd);
  const stableId = id ?? slugify(name);
  const filePath = path.join(workingSkillsDir, `${slugify(stableId)}.json`);
  const existing = (await fileExists(filePath)) ? await readJson(filePath) : null;

  const payload = {
    version: 1,
    layer: "working",
    id: stableId,
    name,
    displayName: displayName ?? name,
    workflow,
    trigger,
    description,
    defaultDocRef: defaultDocRef ?? {
      kind: "path",
      value: defaultDoc,
    },
    supportingDocRefs: supportingDocRefs ?? supportingDocs.map((docPath) => ({
      kind: "path",
      value: docPath,
    })),
    patternIds,
    tags,
    status: "working",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: resolveAuthor(config),
  };

  return {
    filePath: await writeStableJsonFile(workingSkillsDir, stableId, payload),
    payload,
  };
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

  const normalized = transcript
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return shortenSentence(firstSentence);
}

function derivePatternFields(capture) {
  const title = firstNonEmpty([
    capture.patternHint?.title,
    capture.summary,
    capture.observations?.[0],
    capture.task,
    capture.step,
    "interaction-pattern",
  ]) ?? "interaction-pattern";

  const signal = firstNonEmpty([
    capture.patternHint?.signal,
    capture.observations?.[0],
    sentenceFromTranscript(capture.transcript),
    capture.task,
    title,
  ]) ?? title;

  const interpretation = firstNonEmpty([
    capture.patternHint?.interpretation,
    capture.outcome === "success"
      ? `This interaction surfaced a reusable workflow pattern for ${capture.workflow}.`
      : capture.outcome === "escalated"
        ? `This interaction required escalation and should be treated as a caution pattern for ${capture.workflow}.`
        : `This interaction exposed an ambiguity or blocker in ${capture.workflow}.`,
  ]) ?? `Interaction pattern for ${capture.workflow}`;

  const recommendedAction = firstNonEmpty([
    capture.patternHint?.recommendedAction,
    capture.outcome === "success"
      ? "Reuse this pattern before deviating from the current skill."
      : capture.outcome === "escalated"
        ? "Escalate before proceeding when this signal appears again."
        : "Inspect the linked docs and resolve the ambiguity before continuing.",
  ]) ?? "Inspect the linked docs before continuing.";

  return {
    title: shortenSentence(title, 120),
    signal,
    interpretation,
    recommendedAction,
  };
}

export async function writeInteractionCapture(
  {
    task,
    workflow,
    step,
    skillId,
    summary,
    observations = [],
    transcript,
    outcome = "success",
    tags = [],
    patternHint = {},
  },
  cwd = process.cwd(),
) {
  const { config } = await loadPackConfig(cwd);
  const { capturesDir } = resolvePackPaths(config, cwd);

  let resolvedSkill = null;
  if (skillId) {
    resolvedSkill = await getLocalSkillById(config, skillId, cwd);
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
      const [match] = resolution.matches;
      resolvedSkill = {
        id: match.skill.id,
        name: match.skill.name,
        workflow: match.skill.workflow,
        layer: match.skillLayer,
        filePath: match.skillPath,
      };
    }
  }

  const effectiveWorkflow = workflow
    || resolvedSkill?.value?.workflow
    || resolvedSkill?.workflow
    || config.runtime.defaultWorkflow;

  const payload = {
    version: 1,
    captureType: "interaction",
    status: "captured",
    createdAt: new Date().toISOString(),
    author: resolveAuthor(config),
    task: task ?? null,
    workflow: effectiveWorkflow,
    step: step ?? null,
    summary: summary ?? null,
    observations,
    transcript: transcript ?? null,
    outcome,
    tags,
    resolvedSkill: resolvedSkill
      ? ("value" in resolvedSkill
        ? {
            id: resolvedSkill.value.id,
            name: resolvedSkill.value.name,
            workflow: resolvedSkill.value.workflow,
            layer: resolvedSkill.layer,
            filePath: resolvedSkill.filePath,
          }
        : resolvedSkill)
      : null,
    patternHint: {
      title: patternHint.title ?? null,
      signal: patternHint.signal ?? null,
      interpretation: patternHint.interpretation ?? null,
      recommendedAction: patternHint.recommendedAction ?? null,
    },
  };

  const stem = firstNonEmpty([
    payload.patternHint.title,
    payload.summary,
    payload.task,
    payload.step,
    payload.workflow,
    "interaction",
  ]) ?? "interaction";

  const filePath = await writeProposalFile(capturesDir, stem, payload);
  return { filePath, payload };
}

export async function materializeInteractionCapture(
  {
    capturePath,
  },
  cwd = process.cwd(),
) {
  const absoluteCapturePath = path.isAbsolute(capturePath)
    ? capturePath
    : path.resolve(cwd, capturePath);

  const capture = await readJson(absoluteCapturePath);
  const { config } = await loadPackConfig(cwd);

  const resolvedSkillId = capture.resolvedSkill?.id ?? capture.resolvedSkill?.skillId ?? null;
  const sourceSkill = resolvedSkillId
    ? await getLocalSkillById(config, resolvedSkillId, cwd)
    : null;

  const derived = derivePatternFields(capture);
  const patternIdBase = resolvedSkillId
    ? `${resolvedSkillId}-${derived.title}`
    : `${capture.workflow}-${derived.title}`;
  const patternId = slugify(patternIdBase);

  const patternResult = await writeWorkingPattern(
    {
      id: patternId,
      title: derived.title,
      workflow: capture.workflow,
      signal: derived.signal,
      interpretation: derived.interpretation,
      recommendedAction: derived.recommendedAction,
      skillId: resolvedSkillId,
      tags: Array.from(new Set([...(capture.tags ?? []), capture.workflow, "captured_interaction"])),
    },
    cwd,
  );

  let skillResult = null;
  if (sourceSkill?.value) {
    const mergedPatternIds = Array.from(
      new Set([...(sourceSkill.value.patternIds ?? []), patternResult.payload.id]),
    );

    skillResult = await writeWorkingSkill(
      {
        id: sourceSkill.value.id,
        name: sourceSkill.value.name,
        displayName: sourceSkill.value.displayName,
        workflow: sourceSkill.value.workflow,
        trigger: sourceSkill.value.trigger,
        description: sourceSkill.value.description,
        defaultDocRef: sourceSkill.value.defaultDocRef,
        supportingDocRefs: sourceSkill.value.supportingDocRefs ?? [],
        patternIds: mergedPatternIds,
        tags: sourceSkill.value.tags ?? [],
      },
      cwd,
    );
  }

  const nextResolution = await resolveLocalKnowledge(
    {
      task: capture.task ?? "",
      workflow: capture.workflow,
      step: capture.step ?? undefined,
      skill: resolvedSkillId ?? undefined,
      limit: 1,
    },
    cwd,
  );

  return {
    capturePath: absoluteCapturePath,
    capture,
    pattern: patternResult,
    skill: skillResult,
    resolution: nextResolution,
  };
}
