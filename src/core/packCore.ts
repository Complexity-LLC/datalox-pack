import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, cp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { extractTraceSource } from "./sourceBundle.js";

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
  changedFiles?: string[];
  transcript?: string;
  tags?: string[];
  title?: string;
  signal?: string;
  interpretation?: string;
  recommendedAction?: string;
  outcome?: string;
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
  installMode?: "manual" | "auto" | "repair";
}

interface AdoptPackResult {
  hostRepoPath: string;
  packRootPath: string;
  copied: string[];
  skipped: string[];
  installStampPath: string;
  installMode: "manual" | "auto" | "repair";
}

interface InstallStamp {
  version: 1;
  installedAt: string;
  installMode: "manual" | "auto" | "repair";
  packRootPath: string;
}

export interface BootstrapProbeResult {
  repoPath: string;
  status: "ready" | "bootstrappable" | "repairable" | "blocked";
  canAutoBootstrap: boolean;
  reasons: string[];
  installStampPath: string;
  installStamp: InstallStamp | null;
  detected: {
    isGitRepo: boolean;
    isWritable: boolean;
    hasDataloxMd: boolean;
    hasManifest: boolean;
    hasConfig: boolean;
    hasAgentWiki: boolean;
    hasInstallStamp: boolean;
    ownedRootSignals: string[];
  };
}

export interface AutoBootstrapInput {
  repoPath?: string;
  packSource?: string;
}

export interface AutoBootstrapResult {
  repoPath: string;
  probeBefore: BootstrapProbeResult;
  action: "none" | "adopted" | "repaired";
  adoption: AdoptPackResult | null;
  probeAfter: BootstrapProbeResult;
}

function resolvePackRootPath(): string {
  const candidates = [
    fileURLToPath(new URL("../../", import.meta.url)),
    fileURLToPath(new URL("../../../", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "package.json"))
      && existsSync(path.join(candidate, "scripts", "lib", "agent-pack.mjs"))
    ) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

const PACK_ROOT = resolvePackRootPath();
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
  "bin/claude-global-auto-promote.sh",
  "bin/datalox-auto-promote.js",
  "bin/datalox-claude.js",
  "bin/datalox-codex.js",
  "bin/datalox-wrap.js",
  "bin/install-default-host-integrations.sh",
  "bin/setup-multi-agent.sh",
  "agent-wiki/note.schema.md",
];
const TREE_ADOPTION_PATHS = [
  "skills",
  "agent-wiki/notes",
];
const INSTALL_STAMP_RELATIVE_PATH = ".datalox/install.json";

async function loadLegacyPackModule() {
  return import(pathToFileURL(path.join(PACK_ROOT, "scripts", "lib", "agent-pack.mjs")).href);
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

function isGitRepo(repoPath: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoPath,
    encoding: "utf8",
  });
  return result.status === 0;
}

async function isWritableDirectory(repoPath: string): Promise<boolean> {
  try {
    await access(repoPath, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function readInstallStamp(installStampPath: string): Promise<InstallStamp | null> {
  try {
    const raw = await readFile(installStampPath, "utf8");
    const parsed = JSON.parse(raw) as InstallStamp;
    if (parsed && parsed.version === 1 && typeof parsed.installedAt === "string") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeInstallStamp(
  hostRepoPath: string,
  packRootPath: string,
  installMode: "manual" | "auto" | "repair",
): Promise<string> {
  const installStampPath = path.join(hostRepoPath, INSTALL_STAMP_RELATIVE_PATH);
  await mkdir(path.dirname(installStampPath), { recursive: true });
  const payload: InstallStamp = {
    version: 1,
    installedAt: new Date().toISOString(),
    installMode,
    packRootPath,
  };
  await writeFile(installStampPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return installStampPath;
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

export async function probeBootstrapCandidate(repoPath?: string): Promise<BootstrapProbeResult> {
  const resolvedRepoPath = resolveRepoPath(repoPath);
  const installStampPath = path.join(resolvedRepoPath, INSTALL_STAMP_RELATIVE_PATH);
  const hasDataloxMd = await fileExists(path.join(resolvedRepoPath, "DATALOX.md"));
  const hasManifest = await fileExists(path.join(resolvedRepoPath, ".datalox", "manifest.json"));
  const hasConfig = await fileExists(path.join(resolvedRepoPath, ".datalox", "config.json"));
  const hasAgentWiki = await fileExists(path.join(resolvedRepoPath, "agent-wiki"));
  const hasInstallStamp = await fileExists(installStampPath);
  const installStamp = hasInstallStamp ? await readInstallStamp(installStampPath) : null;
  const detectedRoots = [
    hasDataloxMd ? "DATALOX.md" : null,
    hasManifest || hasConfig || hasInstallStamp ? ".datalox/" : null,
    hasAgentWiki ? "agent-wiki/" : null,
  ].filter((value): value is string => Boolean(value));
  const completeCore = hasDataloxMd && hasManifest && hasConfig && hasAgentWiki;
  const gitRepo = isGitRepo(resolvedRepoPath);
  const writable = await isWritableDirectory(resolvedRepoPath);

  if (!writable) {
    return {
      repoPath: resolvedRepoPath,
      status: "blocked",
      canAutoBootstrap: false,
      reasons: ["repo is not writable"],
      installStampPath,
      installStamp,
      detected: {
        isGitRepo: gitRepo,
        isWritable: writable,
        hasDataloxMd,
        hasManifest,
        hasConfig,
        hasAgentWiki,
        hasInstallStamp,
        ownedRootSignals: detectedRoots,
      },
    };
  }

  if (installStamp && completeCore) {
    return {
      repoPath: resolvedRepoPath,
      status: "ready",
      canAutoBootstrap: false,
      reasons: ["repo already has a stamped Datalox installation"],
      installStampPath,
      installStamp,
      detected: {
        isGitRepo: gitRepo,
        isWritable: writable,
        hasDataloxMd,
        hasManifest,
        hasConfig,
        hasAgentWiki,
        hasInstallStamp,
        ownedRootSignals: detectedRoots,
      },
    };
  }

  if ((installStamp && !completeCore) || (!installStamp && completeCore)) {
    return {
      repoPath: resolvedRepoPath,
      status: "repairable",
      canAutoBootstrap: true,
      reasons: [
        installStamp
          ? "stamped Datalox install is missing critical files and can be repaired safely"
          : "repo has a complete legacy Datalox layout but no install stamp; stamping and refill are safe",
      ],
      installStampPath,
      installStamp,
      detected: {
        isGitRepo: gitRepo,
        isWritable: writable,
        hasDataloxMd,
        hasManifest,
        hasConfig,
        hasAgentWiki,
        hasInstallStamp,
        ownedRootSignals: detectedRoots,
      },
    };
  }

  if (!gitRepo) {
    return {
      repoPath: resolvedRepoPath,
      status: "blocked",
      canAutoBootstrap: false,
      reasons: ["automatic bootstrap only runs inside a git worktree"],
      installStampPath,
      installStamp,
      detected: {
        isGitRepo: gitRepo,
        isWritable: writable,
        hasDataloxMd,
        hasManifest,
        hasConfig,
        hasAgentWiki,
        hasInstallStamp,
        ownedRootSignals: detectedRoots,
      },
    };
  }

  if (detectedRoots.length === 0) {
    return {
      repoPath: resolvedRepoPath,
      status: "bootstrappable",
      canAutoBootstrap: true,
      reasons: ["repo has no Datalox-owned files yet and can be bootstrapped safely"],
      installStampPath,
      installStamp,
      detected: {
        isGitRepo: gitRepo,
        isWritable: writable,
        hasDataloxMd,
        hasManifest,
        hasConfig,
        hasAgentWiki,
        hasInstallStamp,
        ownedRootSignals: detectedRoots,
      },
    };
  }

  return {
    repoPath: resolvedRepoPath,
    status: "blocked",
    canAutoBootstrap: false,
    reasons: [
      `repo already contains partial Datalox-owned paths (${detectedRoots.join(", ")}) without a safe repair marker`,
    ],
    installStampPath,
    installStamp,
    detected: {
      isGitRepo: gitRepo,
      isWritable: writable,
      hasDataloxMd,
      hasManifest,
      hasConfig,
      hasAgentWiki,
      hasInstallStamp,
      ownedRootSignals: detectedRoots,
    },
  };
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
  const result = await legacy.learnFromInteraction(
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
  return {
    ...result,
    note: result.pattern,
  };
}

export async function recordTurnResult(input: RecordTurnResultInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  const result = await legacy.recordTurnResult(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      observations: input.observations ?? [],
      changedFiles: input.changedFiles ?? [],
      transcript: input.transcript,
      tags: input.tags ?? [],
      title: input.title,
      signal: input.signal,
      interpretation: input.interpretation,
      recommendedAction: input.recommendedAction,
      outcome: input.outcome,
      eventKind: input.eventKind,
    },
    repoPath,
  );
  return {
    ...result,
    traceBundle: extractTraceSource({
      id: result.event.payload.id,
      title: result.event.payload.title,
      capturedAt: result.event.payload.timestamp,
      task: result.event.payload.task ?? input.task,
      workflow: result.event.payload.workflow ?? input.workflow,
      step: result.event.payload.step ?? input.step,
      transcript: result.event.payload.transcript ?? input.transcript,
      summary: result.event.payload.summary ?? input.summary,
      observations: result.event.payload.observations ?? input.observations ?? [],
      signal: result.event.payload.signal ?? input.signal,
      interpretation: result.event.payload.interpretation ?? input.interpretation,
      action: result.event.payload.recommendedAction ?? input.recommendedAction,
      matchedSkillId: result.event.payload.matchedSkillId ?? input.skillId,
      changedFiles: result.event.payload.changedFiles ?? input.changedFiles ?? [],
      outcome: result.event.payload.outcome ?? input.outcome,
    }),
  };
}

export async function promoteGap(input: PromoteGapInput) {
  const repoPath = resolveRepoPath(input.repoPath);
  const legacy = await loadLegacyPackModule();
  const result = await legacy.promoteGap(
    {
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      observations: input.observations ?? [],
      changedFiles: input.changedFiles ?? [],
      transcript: input.transcript,
      tags: input.tags ?? [],
      title: input.title,
      signal: input.signal,
      interpretation: input.interpretation,
      recommendedAction: input.recommendedAction,
      outcome: input.outcome,
      eventKind: input.eventKind,
      minWikiOccurrences: input.minWikiOccurrences,
      minSkillOccurrences: input.minSkillOccurrences,
    },
    repoPath,
  );
  return {
    ...result,
    promotion: result.promotion
      ? {
        ...result.promotion,
        note: result.promotion.pattern ?? null,
      }
      : null,
    traceBundle: extractTraceSource({
      id: result.event.payload.id,
      title: result.event.payload.title,
      capturedAt: result.event.payload.timestamp,
      task: result.event.payload.task ?? input.task,
      workflow: result.event.payload.workflow ?? input.workflow,
      step: result.event.payload.step ?? input.step,
      transcript: result.event.payload.transcript ?? input.transcript,
      summary: result.event.payload.summary ?? input.summary,
      observations: result.event.payload.observations ?? input.observations ?? [],
      signal: result.event.payload.signal ?? input.signal,
      interpretation: result.event.payload.interpretation ?? input.interpretation,
      action: result.event.payload.recommendedAction ?? input.recommendedAction,
      matchedSkillId: result.event.payload.matchedSkillId ?? input.skillId,
      changedFiles: result.event.payload.changedFiles ?? input.changedFiles ?? [],
      outcome: result.event.payload.outcome ?? input.outcome,
    }),
  };
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
  const installMode = input.installMode ?? "manual";
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

  const installStampPath = await writeInstallStamp(hostRepoPath, packRootPath, installMode);
  copied.push(installStampPath);

  return {
    hostRepoPath,
    packRootPath,
    copied: copied.map((item) => path.relative(hostRepoPath, item) || "."),
    skipped: skipped.map((item) => path.relative(hostRepoPath, item) || "."),
    installStampPath: path.relative(hostRepoPath, installStampPath) || ".",
    installMode,
  };
}

export async function autoBootstrapIfSafe(input: AutoBootstrapInput = {}): Promise<AutoBootstrapResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  const probeBefore = await probeBootstrapCandidate(repoPath);
  if (!probeBefore.canAutoBootstrap) {
    return {
      repoPath,
      probeBefore,
      action: "none",
      adoption: null,
      probeAfter: probeBefore,
    };
  }

  const installMode = probeBefore.status === "repairable" ? "repair" : "auto";
  const adoption = await adoptPack({
    hostRepoPath: repoPath,
    packSource: input.packSource,
    installMode,
  });
  const probeAfter = await probeBootstrapCandidate(repoPath);

  return {
    repoPath,
    probeBefore,
    action: installMode === "repair" ? "repaired" : "adopted",
    adoption,
    probeAfter,
  };
}

export function getDefaultPackUrl(): string {
  return DEFAULT_PACK_URL;
}
