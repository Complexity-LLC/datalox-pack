import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type InstallHost = "all" | "codex" | "claude";

export interface InstallHostIntegrationsInput {
  host?: InstallHost;
  packRootPath: string;
}

export interface InstallLinkSummary {
  linked: string[];
  skipped: string[];
}

export interface InstallHostShimResult {
  selected: boolean;
  installed: boolean;
  shimPath: string;
  realBinary: string | null;
  stableLinks: string[];
}

export interface InstallHostIntegrationsResult {
  host: InstallHost;
  packRootPath: string;
  packCachePath: string;
  skillLinks: InstallLinkSummary;
  codex: InstallHostShimResult;
  claude: InstallHostShimResult;
  claudeHookPath: string | null;
  claudeSettingsPath: string | null;
  pathExportsUpdated: string[];
}

const STABLE_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function validFullPackRoot(candidate: string): boolean {
  return (
    existsSync(path.join(candidate, "package.json"))
    && existsSync(path.join(candidate, "scripts", "lib", "agent-pack.mjs"))
  );
}

async function ensureLocalPackCache(packRootPath: string): Promise<string> {
  const cacheRoot = path.join(os.homedir(), ".datalox", "cache");
  const cachePath = path.join(cacheRoot, "datalox-pack");

  if (path.resolve(packRootPath) === path.resolve(cachePath)) {
    return cachePath;
  }

  await mkdir(cacheRoot, { recursive: true });
  if (existsSync(cachePath)) {
    if (validFullPackRoot(cachePath)) {
      return cachePath;
    }
    await rm(cachePath, { recursive: true, force: true });
  }

  await symlink(packRootPath, cachePath, "dir");
  return cachePath;
}

async function linkIfMissing(target: string, destination: string, summary: InstallLinkSummary): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });

  if (existsSync(destination)) {
    try {
      const stats = await lstat(destination);
      if (stats.isSymbolicLink()) {
        const existing = await readlink(destination);
        if (path.resolve(path.dirname(destination), existing) === path.resolve(target)) {
          summary.skipped.push(destination);
          return;
        }
      }
    } catch {
      // Fall through and preserve existing path.
    }
    summary.skipped.push(destination);
    return;
  }

  await symlink(target, destination, "dir");
  summary.linked.push(destination);
}

async function installSkillLinks(host: InstallHost, packRootPath: string): Promise<InstallLinkSummary> {
  const summary: InstallLinkSummary = { linked: [], skipped: [] };
  const skillsDir = path.join(packRootPath, "skills");
  const links = host === "codex"
    ? [
        path.join(os.homedir(), ".codex", "skills", "datalox-pack"),
      ]
    : host === "claude"
      ? [
          path.join(os.homedir(), ".claude", "skills", "datalox-pack"),
        ]
      : [
          path.join(os.homedir(), ".codex", "skills", "datalox-pack"),
          path.join(os.homedir(), ".claude", "skills", "datalox-pack"),
          path.join(os.homedir(), ".opencode", "skills", "datalox-pack"),
          path.join(os.homedir(), ".gemini", "skills", "datalox-pack"),
          path.join(packRootPath, ".cursor", "skills"),
          path.join(packRootPath, ".windsurf", "skills"),
        ];

  for (const destination of links) {
    await linkIfMissing(skillsDir, destination, summary);
  }

  return summary;
}

function selectedHosts(host: InstallHost): Array<Exclude<InstallHost, "all">> {
  return host === "all" ? ["codex", "claude"] : [host];
}

function findRealBinary(hostName: "codex" | "claude", shimPath: string, envOverride?: string): string | null {
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }

  const result = spawnSync("which", ["-a", hostName], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }

  const ignored = new Set([
    shimPath,
    ...STABLE_BIN_DIRS.map((dir) => path.join(dir, hostName)),
  ].map((item) => path.resolve(item)));

  for (const candidate of result.stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (ignored.has(path.resolve(candidate))) {
      continue;
    }
    return candidate;
  }
  return null;
}

async function installStableLinks(hostName: "codex" | "claude", shimPath: string): Promise<string[]> {
  const linked: string[] = [];

  for (const dir of STABLE_BIN_DIRS) {
    if (!existsSync(dir)) {
      continue;
    }
    try {
      await access(dir, fsConstants.W_OK);
    } catch {
      continue;
    }

    const target = path.join(dir, hostName);
    let stats = null;
    try {
      stats = await lstat(target);
    } catch {
      stats = null;
    }
    if (stats) {
      if (!stats.isSymbolicLink()) {
        continue;
      }
      const existing = await readlink(target);
      if (path.resolve(path.dirname(target), existing) === path.resolve(shimPath)) {
        continue;
      }
      continue;
    }

    await symlink(shimPath, target);
    linked.push(target);
  }

  return linked;
}

async function ensurePathExport(filePath: string): Promise<boolean> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    existing = "";
  }
  const exportLine = 'export PATH="$HOME/.local/bin:$PATH"';
  if (existing.includes(exportLine)) {
    return false;
  }
  const next = `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}# Prefer local host shims such as the Datalox Codex wrapper.\n${exportLine}\n`;
  await writeFile(filePath, next, "utf8");
  return true;
}

function buildCodexShim(realBinary: string, packRootPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REAL_CODEX_BIN=${JSON.stringify(realBinary)}
PACK_ROOT=${JSON.stringify(packRootPath)}

resolve_repo() {
  local repo="$(pwd)"
  local args=("$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[i]}" in
      -C|--cd)
        if (( i + 1 < \${#args[@]} )); then
          repo="\${args[i+1]}"
        fi
        ;;
    esac
  done
  (cd "$repo" >/dev/null 2>&1 && pwd) || printf '%s\\n' "$repo"
}

should_wrap() {
  local args=("$@")
  for arg in "\${args[@]}"; do
    case "$arg" in
      exec|e|review)
        return 0
        ;;
    esac
  done
  return 1
}

repo="$(resolve_repo "$@")"
if should_wrap "$@"; then
  export DATALOX_CODEX_BIN="$REAL_CODEX_BIN"
  exec node "$PACK_ROOT/bin/datalox-codex.js" --repo "$repo" -- "$@"
fi

exec "$REAL_CODEX_BIN" "$@"
`;
}

function buildClaudeShim(realBinary: string, packRootPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

REAL_CLAUDE_BIN=${JSON.stringify(realBinary)}
PACK_ROOT=${JSON.stringify(packRootPath)}

resolve_repo() {
  local repo="$(pwd)"
  local args=("$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[i]}" in
      -C|--cd|--cwd)
        if (( i + 1 < \${#args[@]} )); then
          repo="\${args[i+1]}"
        fi
        ;;
    esac
  done
  (cd "$repo" >/dev/null 2>&1 && pwd) || printf '%s\\n' "$repo"
}

should_wrap() {
  local args=("$@")
  if (( \${#args[@]} == 0 )); then
    return 1
  fi
  case "\${args[0]}" in
    mcp|update|config|-h|--help|-v|--version)
      return 1
      ;;
  esac
  for arg in "\${args[@]}"; do
    case "$arg" in
      -p|--print)
        return 0
        ;;
    esac
  done
  for arg in "\${args[@]}"; do
    case "$arg" in
      -*)
        ;;
      *)
        return 0
        ;;
    esac
  done
  return 1
}

repo="$(resolve_repo "$@")"
if should_wrap "$@"; then
  export DATALOX_CLAUDE_BIN="$REAL_CLAUDE_BIN"
  exec node "$PACK_ROOT/bin/datalox-claude.js" --repo "$repo" -- "$@"
fi

exec "$REAL_CLAUDE_BIN" "$@"
`;
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}

async function installClaudeHook(packRootPath: string): Promise<{ hookPath: string; settingsPath: string }> {
  const claudeHome = path.join(os.homedir(), ".claude");
  const hooksDir = path.join(claudeHome, "hooks");
  const settingsPath = path.join(claudeHome, "settings.json");
  const hookPath = path.join(hooksDir, "datalox-auto-promote.sh");

  await mkdir(hooksDir, { recursive: true });
  await copyFile(path.join(packRootPath, "bin", "claude-global-auto-promote.sh"), hookPath);
  await chmod(hookPath, 0o755);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const hooks = (parsed.hooks && typeof parsed.hooks === "object" ? parsed.hooks : {}) as Record<string, unknown>;
  parsed.hooks = hooks;
  for (const eventName of ["Stop", "SubagentStop"]) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] as Array<Record<string, unknown>> : [];
    const hasDatalox = entries.some((entry) => Array.isArray(entry.hooks) && entry.hooks.some((hook) => (
      hook
      && typeof hook === "object"
      && (hook as { type?: unknown }).type === "command"
      && typeof (hook as { command?: unknown }).command === "string"
      && (hook as { command: string }).command.includes("datalox-auto-promote.sh")
    )));
    if (!hasDatalox) {
      entries.push({
        hooks: [
          {
            type: "command",
            command: hookPath,
            timeout: 60,
          },
        ],
      });
    }
    hooks[eventName] = entries;
  }

  await writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { hookPath, settingsPath };
}

function createSkippedHostResult(hostName: "codex" | "claude", selected: boolean): InstallHostShimResult {
  return {
    selected,
    installed: false,
    shimPath: path.join(os.homedir(), ".local", "bin", hostName),
    realBinary: null,
    stableLinks: [],
  };
}

export async function installHostIntegrations(input: InstallHostIntegrationsInput): Promise<InstallHostIntegrationsResult> {
  const host = input.host ?? "all";
  const packRootPath = path.resolve(input.packRootPath);
  const localBin = path.join(os.homedir(), ".local", "bin");
  await mkdir(localBin, { recursive: true });
  const packCachePath = await ensureLocalPackCache(packRootPath);
  const skillLinks = await installSkillLinks(host, packRootPath);

  const selected = new Set(selectedHosts(host));
  const codexShimPath = path.join(localBin, "codex");
  const claudeShimPath = path.join(localBin, "claude");

  let codex = createSkippedHostResult("codex", selected.has("codex"));
  if (selected.has("codex")) {
    const realBinary = findRealBinary("codex", codexShimPath, process.env.DATALOX_REAL_CODEX_BIN);
    if (realBinary) {
      await writeExecutable(codexShimPath, buildCodexShim(realBinary, packRootPath));
      codex = {
        selected: true,
        installed: true,
        shimPath: codexShimPath,
        realBinary,
        stableLinks: await installStableLinks("codex", codexShimPath),
      };
    }
  }

  let claude = createSkippedHostResult("claude", selected.has("claude"));
  let claudeHookPath: string | null = null;
  let claudeSettingsPath: string | null = null;
  if (selected.has("claude")) {
    const realBinary = findRealBinary("claude", claudeShimPath, process.env.DATALOX_REAL_CLAUDE_BIN);
    if (realBinary) {
      await writeExecutable(claudeShimPath, buildClaudeShim(realBinary, packRootPath));
      claude = {
        selected: true,
        installed: true,
        shimPath: claudeShimPath,
        realBinary,
        stableLinks: await installStableLinks("claude", claudeShimPath),
      };
    }
    const hook = await installClaudeHook(packRootPath);
    claudeHookPath = hook.hookPath;
    claudeSettingsPath = hook.settingsPath;
  }

  const pathExportsUpdated: string[] = [];
  if (await ensurePathExport(path.join(os.homedir(), ".zshrc"))) {
    pathExportsUpdated.push(path.join(os.homedir(), ".zshrc"));
  }
  if (await ensurePathExport(path.join(os.homedir(), ".zprofile"))) {
    pathExportsUpdated.push(path.join(os.homedir(), ".zprofile"));
  }

  return {
    host,
    packRootPath: normalizePath(packRootPath),
    packCachePath: normalizePath(packCachePath),
    skillLinks: {
      linked: skillLinks.linked.map(normalizePath),
      skipped: skillLinks.skipped.map(normalizePath),
    },
    codex: {
      ...codex,
      shimPath: normalizePath(codex.shimPath),
      realBinary: codex.realBinary ? normalizePath(codex.realBinary) : null,
      stableLinks: codex.stableLinks.map(normalizePath),
    },
    claude: {
      ...claude,
      shimPath: normalizePath(claude.shimPath),
      realBinary: claude.realBinary ? normalizePath(claude.realBinary) : null,
      stableLinks: claude.stableLinks.map(normalizePath),
    },
    claudeHookPath: claudeHookPath ? normalizePath(claudeHookPath) : null,
    claudeSettingsPath: claudeSettingsPath ? normalizePath(claudeSettingsPath) : null,
    pathExportsUpdated: pathExportsUpdated.map(normalizePath),
  };
}
