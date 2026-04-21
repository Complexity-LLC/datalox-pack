import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const dataloxBinPath = path.join(repoRoot, "bin", "datalox.js");

export const demoTask = "stabilize repo onboarding for coding agents";
export const demoWorkflow = "agent_adoption";
export const demoObservation = "repo has no visible install surface for the agent";
export const demoInterpretation = "hidden setup keeps causing repeated onboarding mistakes";
export const demoAction = "add a committed README setup step and a bootstrap command before the first autonomous run";
export const demoSummary = "A first-run coding agent needs a visible and reversible onboarding path";

const baseConfig = {
  version: 1,
  mode: "repo_only",
  project: {
    id: "agent-onboarding-demo",
    name: "Agent Onboarding Demo",
  },
  sources: [
    {
      kind: "local_repo",
      name: "repo-pack",
      enabled: true,
      root: ".datalox",
    },
  ],
  agent: {
    profile: "local_first",
    nativeSkillPolicy: "preserve",
    detectOnEveryLoop: true,
    configReadOrder: [
      "env:DATALOX_CONFIG_JSON",
      ".datalox/config.local.json",
      ".datalox/config.json",
      "AGENTS.md",
    ],
    interfaceOrder: [
      "skill_loop",
      "runtime_compile",
    ],
  },
  paths: {
    seedSkillsDir: "skills",
    seedNotesDir: "agent-wiki/notes",
    hostSkillsDir: "skills",
    hostNotesDir: "agent-wiki/notes",
  },
  retrieval: {
    notesBackend: "native",
  },
  runtime: {
    enabled: false,
    baseUrl: "http://localhost:3000",
    defaultWorkflow: demoWorkflow,
    requestTimeoutMs: 10000,
    endpoints: {
      compile: "/v1/runtime/compile",
    },
  },
  auth: {
    apiKeyEnv: "DATALOX_API_KEY",
    contributorKeyEnv: "DATALOX_CONTRIBUTOR_KEY",
  },
};

export function shellQuote(value) {
  return /[^A-Za-z0-9_/:=.-]/.test(value) ? JSON.stringify(value) : value;
}

export function formatCommand(args) {
  return ["node", dataloxBinPath, ...args].map(shellQuote).join(" ");
}

export function normalizeBullet(value) {
  return typeof value === "string" ? value.replace(/^- /, "").trim() : String(value);
}

export function formatCommandForDocs(args, repoPath) {
  return formatCommand(args)
    .replace(`node ${shellQuote(dataloxBinPath)}`, "node bin/datalox.js")
    .replaceAll(repoPath, "$DEMO_REPO");
}

export function replaceRepoPath(value, repoPath, replacement = "$DEMO_REPO") {
  return typeof value === "string" ? value.replaceAll(repoPath, replacement) : String(value);
}

export function summarizeList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return ["none"];
  }

  return values.map((value) => normalizeBullet(value));
}

export function printList(values) {
  for (const value of summarizeList(values)) {
    process.stdout.write(`- ${value}\n`);
  }
}

export function runDatalox(args) {
  const result = spawnSync("node", [dataloxBinPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATALOX_CONFIG_JSON: "",
      DATALOX_BASE_URL: "",
      DATALOX_DEFAULT_WORKFLOW: "",
      DATALOX_AGENT_PROFILE: "",
      DATALOX_MODE: "",
    },
  });

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || `Command failed: ${formatCommand(args)}`;
    throw new Error(message.trim());
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Expected JSON output from ${formatCommand(args)}\n${String(error)}\n${result.stdout}`);
  }
}

async function createDemoRepo(repoPath) {
  await mkdir(path.join(repoPath, ".datalox"), { recursive: true });
  await mkdir(path.join(repoPath, "skills", "stabilize-repo-onboarding"), { recursive: true });
  await mkdir(path.join(repoPath, "agent-wiki", "notes"), { recursive: true });

  await writeFile(
    path.join(repoPath, ".datalox", "config.json"),
    JSON.stringify(baseConfig, null, 2),
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "agent-onboarding-demo",
        private: true,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "AGENTS.md"),
    "# Demo repo\n\nUse Datalox to keep coding-agent onboarding guidance visible and reusable.\n",
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "README.md"),
    "# Agent Onboarding Demo\n\nThis repo exists only to demo one correction becoming reusable guidance.\n",
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "skills", "stabilize-repo-onboarding", "SKILL.md"),
    `---
name: stabilize-repo-onboarding
description: Use when onboarding a coding agent into a repo must stay visible and reversible.
metadata:
  datalox:
    id: agent-adoption.stabilize-repo-onboarding
    workflow: ${demoWorkflow}
    trigger: Use when onboarding a coding agent into a repo must stay visible and reversible.
    note_paths:
      - agent-wiki/notes/repo-onboarding-playbook.md
    tags:
      - agent_adoption
      - onboarding
      - coding_agents
    status: approved
---

# Stabilize Repo Onboarding

## When to Use

Use when onboarding a coding agent into a repo must stay visible and reversible.

## Workflow

1. Read the linked onboarding note before the first autonomous run.
2. Prefer committed setup steps over hidden local setup.

## Expected Output

- State why the onboarding workflow matched.
- State the next onboarding step the agent should take.

## Notes

- agent-wiki/notes/repo-onboarding-playbook.md
`,
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "agent-wiki", "notes", "repo-onboarding-playbook.md"),
    `---
type: note
title: Repo onboarding playbook
workflow: ${demoWorkflow}
skill: agent-adoption.stabilize-repo-onboarding
status: active
related:
  - agent-wiki/notes/visible-bootstrap-surface.md
updated: 2026-04-16T00:00:00.000Z
review_after: 2026-07-16
---

# Repo onboarding playbook

## When to Use

Use this note when a coding agent is entering a repo for the first time and the team wants a reversible onboarding path.

## Signal

The agent needs repo-specific onboarding guidance before the first autonomous run.

## Interpretation

The repo should expose its setup path in committed files instead of relying on hidden local knowledge.

## Recommended Action

Start with the committed onboarding playbook before letting the agent make changes.

## Examples

- A team is connecting Codex or Claude Code to a repo for the first time.

## Evidence

- The setup should be inspectable and reversible by both humans and agents.

## Related

- agent-wiki/notes/visible-bootstrap-surface.md
`,
    "utf8",
  );

  await writeFile(
    path.join(repoPath, "agent-wiki", "notes", "visible-bootstrap-surface.md"),
    `---
type: note
title: Visible bootstrap surface
workflow: ${demoWorkflow}
status: active
related:
  - agent-wiki/notes/repo-onboarding-playbook.md
updated: 2026-04-16T00:00:00.000Z
review_after: 2026-07-16
---

# Visible bootstrap surface

## When to Use

Use this note when a coding agent cannot find a committed setup path in the repo.

## Signal

The repo does not expose a visible bootstrap surface for the agent.

## Interpretation

Hidden setup paths force the agent to guess and make onboarding mistakes.

## Recommended Action

Expose the bootstrap surface in committed repo files before autonomous changes are allowed.

## Examples

- A repo has local setup steps, but no committed onboarding command.

## Evidence

- Visible setup paths make correction and review easier.

## Related

- agent-wiki/notes/repo-onboarding-playbook.md
`,
    "utf8",
  );
}

export async function createTempDemoRepo() {
  if (!existsSync(dataloxBinPath)) {
    throw new Error(`Expected Datalox CLI at ${dataloxBinPath}`);
  }

  const demoRepoPath = await mkdtemp(path.join(tmpdir(), "datalox-one-correction-"));
  await createDemoRepo(demoRepoPath);
  return demoRepoPath;
}

export function buildDemoCommands(demoRepoPath) {
  const resolveArgs = [
    "resolve",
    "--repo",
    demoRepoPath,
    "--task",
    demoTask,
    "--workflow",
    demoWorkflow,
  ];
  const patchArgs = [
    "patch",
    "--repo",
    demoRepoPath,
    "--task",
    demoTask,
    "--workflow",
    demoWorkflow,
    "--summary",
    demoSummary,
    "--observation",
    demoObservation,
    "--interpretation",
    demoInterpretation,
    "--action",
    demoAction,
  ];
  const lintArgs = [
    "lint",
    "--repo",
    demoRepoPath,
  ];

  return {
    resolveArgs,
    patchArgs,
    lintArgs,
  };
}

export async function runDemoFlow() {
  const demoRepoPath = await createTempDemoRepo();
  const { resolveArgs, patchArgs, lintArgs } = buildDemoCommands(demoRepoPath);
  const before = runDatalox(resolveArgs);
  const patched = runDatalox(patchArgs);
  const after = runDatalox(resolveArgs);
  const lint = runDatalox(lintArgs);
  const logBody = await readFile(path.join(demoRepoPath, "agent-wiki", "log.md"), "utf8");
  const logTail = logBody
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .slice(-3)
    .map((line) => normalizeBullet(line));

  const beforeMatch = before.matches?.[0] ?? null;
  const afterMatch = after.matches?.[0] ?? null;

  return {
    demoRepoPath,
    resolveArgs,
    patchArgs,
    lintArgs,
    before,
    patched,
    after,
    lint,
    logTail,
    beforeMatch,
    afterMatch,
    notePath: patched.note?.relativePath ?? "unknown",
    skillPath: patched.skill?.relativePath ?? patched.skill?.filePath ?? "unknown",
  };
}
