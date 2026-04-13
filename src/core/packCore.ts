import { spawnSync } from "node:child_process";
import { access, cp, mkdir, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ResolveLoopInput {
  repoPath?: string;
  task?: string;
  workflow?: string;
  step?: string;
  skill?: string;
  limit?: number;
  includeContent?: boolean;
}

export interface PatchKnowledgeInput {
  repoPath?: string;
  task?: string;
  workflow?: string;
  step?: string;
  skillId?: string;
  summary?: string;
  observations?: string[];
  transcript?: string;
  tags?: string[];
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
}

export interface RecordTurnResultInput {
  repoPath?: string;
  task?: string;
  workflow?: string;
  step?: string;
  skillId?: string;
  summary?: string;
  observations?: string[];
  transcript?: string;
  tags?: string[];
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
  eventKind?: string;
}

export interface PromoteGapInput extends RecordTurnResultInput {
  minWikiOccurrences?: number;
  minSkillOccurrences?: number;
}

export interface LintPackInput {
  repoPath?: string;
}

export interface RefreshControlArtifactsInput {
  repoPath?: string;
  logEntry?: {
    action: string;
    detail: string;
    path?: string;
  };
  lintResult?: unknown;
}

export interface AdoptPackInput {
  hostRepoPath: string;
  packSource?: string;
}

interface AdoptPackResult {
  hostRepoPath: string;
  packRootPath: string;
  copied: string[];
  skipped: string[];
}

const PACK_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_PACK_URL = "https://github.com/Complexity-LLC/datalox-pack.git";
const SINGLE_FILE_ADOPTION_PATHS = [
  "DATALOX.md",
  "AGENTS.md",
  "CLAUDE.md",
  "WIKI.md",
  "GEMINI.md",
  "START_HERE.md",
  ".claude/settings.json",
  ".claude/hooks/auto-promote.sh",
  ".github/copilot-instructions.md",
  ".cursor/rules/datalox-pack.mdc",
  ".windsurf/rules/datalox-pack.md",
  ".datalox/config.json",
  ".datalox/config.schema.json",
  ".datalox/manifest.json",
  ".datalox/skill.schema.md",
  "bin/datalox-auto-promote.js",
  "agent-wiki/pattern.schema.md",
  "agent-wiki/source.schema.md",
  "agent-wiki/concept.schema.md",
  "agent-wiki/comparison.schema.md",
  "agent-wiki/question.schema.md",
  "agent-wiki/page-types.md",
];
const TREE_ADOPTION_PATHS = [
  "skills",
  "agent-wiki/patterns",
  "agent-wiki/meta",
  "agent-wiki/sources",
  "agent-wiki/concepts",
  "agent-wiki/comparisons",
  "agent-wiki/questions",
];

async function loadLegacyPackModule() {
  return import(new URL("../../../scripts/lib/agent-pack.mjs", import.meta.url).href);
}

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath ?? process.cwd());
}

function isGitUrl(value: string): boolean {
  return /^https?:\/\//.test(value) || value.endsWith(".git");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(
  sourcePath: string,
  destinationPath: string,
  copied: string[],
  skipped: string[],
): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  if (await fileExists(destinationPath)) {
    skipped.push(destinationPath);
    return;
  }
  await cp(sourcePath, destinationPath, { recursive: false });
  copied.push(destinationPath);
}

async function copyTreeEntriesIfMissing(
  sourceDir: string,
  destinationDir: string,
  copied: string[],
  skipped: string[],
): Promise<void> {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (await fileExists(destinationPath)) {
      skipped.push(destinationPath);
      continue;
    }
    await cp(sourcePath, destinationPath, { recursive: true });
    copied.push(destinationPath);
  }
}

function runGit(args: string[], cwd?: string): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }
}

async function resolvePackRoot(packSource?: string): Promise<string> {
  if (!packSource) {
    return PACK_ROOT;
  }

  if (!isGitUrl(packSource)) {
    return path.resolve(packSource);
  }

  const cacheRoot = path.join(os.homedir(), ".datalox", "cache");
  const cacheName = path.basename(packSource).replace(/\.git$/, "") || "datalox-pack";
  const cachePath = path.join(cacheRoot, cacheName);
  await mkdir(cacheRoot, { recursive: true });

  if (await fileExists(path.join(cachePath, ".git"))) {
    runGit(["pull", "--ff-only"], cachePath);
  } else {
    if (await fileExists(cachePath)) {
      await rm(cachePath, { recursive: true, force: true });
    }
    runGit(["clone", "--depth", "1", packSource, cachePath]);
  }

  return cachePath;
}

async function ensureLocalPackCache(packRootPath: string): Promise<void> {
  const cacheRoot = path.join(os.homedir(), ".datalox", "cache");
  const cachePath = path.join(cacheRoot, "datalox-pack");

  if (path.resolve(packRootPath) === path.resolve(cachePath)) {
    return;
  }

  await mkdir(cacheRoot, { recursive: true });
  if (await fileExists(cachePath)) {
    return;
  }

  await symlink(packRootPath, cachePath, "dir");
}

export async function resolveLoop(input: ResolveLoopInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  return legacy.resolveLocalKnowledge(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skill: input.skill,
      limit: input.limit ?? 3,
      includeContent: input.includeContent ?? false,
    },
    repoPath,
  );
}

export async function patchKnowledge(input: PatchKnowledgeInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  return legacy.learnFromInteraction(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      observations: input.observations ?? [],
      transcript: input.transcript,
      tags: input.tags ?? [],
      title: input.title,
      signal: input.signal,
      interpretation: input.interpretation,
      recommendedAction: input.recommendedAction,
    },
    repoPath,
  );
}

export async function recordTurnResult(input: RecordTurnResultInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  return legacy.recordTurnResult(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      observations: input.observations ?? [],
      transcript: input.transcript,
      tags: input.tags ?? [],
      title: input.title,
      signal: input.signal,
      interpretation: input.interpretation,
      recommendedAction: input.recommendedAction,
      eventKind: input.eventKind,
    },
    repoPath,
  );
}

export async function promoteGap(input: PromoteGapInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  return legacy.promoteGap(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      observations: input.observations ?? [],
      transcript: input.transcript,
      tags: input.tags ?? [],
      title: input.title,
      signal: input.signal,
      interpretation: input.interpretation,
      recommendedAction: input.recommendedAction,
      eventKind: input.eventKind,
      minWikiOccurrences: input.minWikiOccurrences,
      minSkillOccurrences: input.minSkillOccurrences,
    },
    repoPath,
  );
}

export async function lintLocalPack(input: LintPackInput = {}) {
  const legacy = await loadLegacyPackModule();
  return legacy.lintPack(resolveRepoPath(input.repoPath));
}

export async function refreshControlArtifacts(input: RefreshControlArtifactsInput = {}) {
  const legacy = await loadLegacyPackModule();
  return legacy.refreshControlArtifacts(resolveRepoPath(input.repoPath), {
    logEntry: input.logEntry,
    lintResult: input.lintResult,
  });
}

export async function adoptPack(input: AdoptPackInput): Promise<AdoptPackResult> {
  const hostRepoPath = resolveRepoPath(input.hostRepoPath);
  const packRootPath = await resolvePackRoot(input.packSource);
  await ensureLocalPackCache(packRootPath);
  const copied: string[] = [];
  const skipped: string[] = [];

  await mkdir(path.join(hostRepoPath, ".datalox"), { recursive: true });
  await mkdir(path.join(hostRepoPath, ".claude", "hooks"), { recursive: true });
  await mkdir(path.join(hostRepoPath, ".github"), { recursive: true });
  await mkdir(path.join(hostRepoPath, ".cursor", "rules"), { recursive: true });
  await mkdir(path.join(hostRepoPath, ".windsurf", "rules"), { recursive: true });
  await mkdir(path.join(hostRepoPath, "bin"), { recursive: true });
  await mkdir(path.join(hostRepoPath, "skills"), { recursive: true });
  await mkdir(path.join(hostRepoPath, "agent-wiki", "events"), { recursive: true });

  for (const relativePath of SINGLE_FILE_ADOPTION_PATHS) {
    await copyIfMissing(
      path.join(packRootPath, relativePath),
      path.join(hostRepoPath, relativePath),
      copied,
      skipped,
    );
  }

  for (const relativePath of TREE_ADOPTION_PATHS) {
    await copyTreeEntriesIfMissing(
      path.join(packRootPath, relativePath),
      path.join(hostRepoPath, relativePath),
      copied,
      skipped,
    );
  }

  return {
    hostRepoPath,
    packRootPath,
    copied: copied.map((item) => path.relative(hostRepoPath, item) || "."),
    skipped: skipped.map((item) => path.relative(hostRepoPath, item) || "."),
  };
}

export function getDefaultPackUrl(): string {
  return DEFAULT_PACK_URL;
}
