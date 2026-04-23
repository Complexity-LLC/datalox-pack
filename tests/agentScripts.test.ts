import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const baseConfig = {
  version: 1,
  mode: "repo_only",
  project: {
    id: "demo",
    name: "Demo",
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
  runtime: {
    enabled: false,
    baseUrl: "http://localhost:3000",
    defaultWorkflow: "flow_cytometry",
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

async function createPack(tempDir: string) {
  await mkdir(path.join(tempDir, "skills"), { recursive: true });
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/notes"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/patterns"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/meta"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/sources"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/concepts"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/comparisons"), { recursive: true });
  await mkdir(path.join(tempDir, "agent-wiki/questions"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/review-ambiguous-viability-gate"), { recursive: true });
  await mkdir(path.join(tempDir, "skills/evolve-datalox-pack"), { recursive: true });

  await writeFile(
    path.join(tempDir, ".datalox/config.json"),
    JSON.stringify(baseConfig, null, 2),
  );
  await writeFile(path.join(tempDir, "AGENTS.md"), "# Demo agent instructions\n");
  await writeFile(path.join(tempDir, "CLAUDE.md"), "# Demo claude instructions\n");
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "demo-pack",
        dependencies: {
          vitest: "^2.0.0",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(tempDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
    `---
name: review-ambiguous-viability-gate
description: Use when live and dead populations are not cleanly separated during viability gate review.
metadata:
  datalox:
    id: flow-cytometry.review-ambiguous-viability-gate
    workflow: flow_cytometry
    trigger: Use when live/dead separation is ambiguous during viability gate review.
    note_paths:
      - agent-wiki/notes/viability-gate-review.md
    tags:
      - flow_cytometry
      - viability
      - review
    status: approved
---

# Review Ambiguous Viability Gate

## When to Use

Use when live/dead separation is ambiguous during viability gate review.

## Workflow

1. Read the linked pattern docs before changing the gate.
2. Treat this as a judgment step, not a mechanical threshold change.

## Expected Output

- State why this skill matched.
- State the recommended gate action.

## Notes

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "skills/evolve-datalox-pack/SKILL.md"),
    `---
name: evolve-datalox-pack
description: Keep the pack simple.
metadata:
  datalox:
    id: repo-engineering.evolve-datalox-pack
    workflow: repo_engineering
    trigger: Use when changing the portable pack or agent guidance.
    note_paths:
      - agent-wiki/notes/evolve-datalox-pack.md
    tags:
      - repo_engineering
      - portable_pack
    repo_hints:
      files:
        - AGENTS.md
        - CLAUDE.md
        - package.json
      path_prefixes:
        - skills/
        - .datalox/
      package_signals:
        - vitest
        - demo-pack
---

# Evolve Datalox Pack

## When to Use

Use when changing the portable pack or agent guidance.

## Workflow

1. Read the linked pattern docs before acting.
2. Keep the pack simple.

## Expected Output

- State why this skill matched.
- State the pack change being made.

## Notes

- agent-wiki/notes/evolve-datalox-pack.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/viability-gate-review.md"),
    `---
type: pattern
title: Review ambiguous viability gate
workflow: flow_cytometry
skill: flow-cytometry.review-ambiguous-viability-gate
status: active
related:
  - agent-wiki/notes/dead-tail-exception.md
  - agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Review ambiguous viability gate

## When to Use

Use this pattern when viability review is ambiguous and the live/dead split is not clearly separable.

## Signal

Live and dead populations are not cleanly separated.

## Interpretation

This is a judgment step, not a mechanical threshold change.

## Recommended Action

Review the linked exception pattern before changing the gate.

## Examples

- A boundary that looks unstable and needs exception review before widening the gate.

## Evidence

- agent-wiki/sources/flow-cytometry-demo-notes.md

## Related

- agent-wiki/notes/dead-tail-exception.md
- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/evolve-datalox-pack.md"),
    `---
type: pattern
title: Evolve Datalox pack
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Evolve Datalox pack

## When to Use

Use this pattern when the pack design adds complexity faster than user-visible benefit.

## Signal

The pack is getting too complicated.

## Interpretation

The right response is usually to simplify the loop, not add another layer.

## Recommended Action

Keep the loop as skill detection plus pattern docs.

## Examples

- Replacing hidden pack layers with visible wiki artifacts that an agent can inspect directly.

## Evidence

- agent-wiki/sources/portable-pack-design-notes.md

## Related

- agent-wiki/concepts/loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/notes/dead-tail-exception.md"),
    `---
type: pattern
title: Dead tail exception
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Dead tail exception

## When to Use

Use this pattern when dim dead-tail overlap makes the gate boundary look unstable.

## Signal

Dim dead tail overlaps live shoulder.

## Interpretation

This often indicates artifact rather than a true biological shift.

## Recommended Action

Review the exception path before widening the gate.

## Examples

- A dim tail drifting into the live shoulder after staining prep.

## Evidence

- agent-wiki/sources/flow-cytometry-demo-notes.md

## Related

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/sources/flow-cytometry-demo-notes.md"),
    `---
type: source
title: Flow cytometry demo notes
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources: []
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Flow cytometry demo notes

## Overview

Demo notes backing the seed flow-cytometry patterns.

## Key Claims

- Ambiguous viability review is a judgment step.

## Limitations

- Demo only.

## Related

- agent-wiki/questions/when-should-qc-escalate-after-viability-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/concepts/loop-bridge.md"),
    `---
type: concept
title: Loop bridge
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Loop bridge

## Definition

A loop bridge resolves a skill before the turn and can patch knowledge after the turn.

## Why It Matters

It makes the pack active instead of merely discoverable.

## Examples

- MCP resolve_loop.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md"),
    `---
type: comparison
title: Repo protocol vs loop bridge
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Repo protocol vs loop bridge

## Overview

This comparison explains when files are enough and when host integration is needed.

## Comparison

| Dimension | Repo protocol | Loop bridge |
|-----------|---------------|-------------|
| Automatic per-turn behavior | Low | High |

## Verdict

Use the loop bridge when you need per-turn behavior.

## Related

- agent-wiki/questions/when-should-a-new-skill-be-created.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/questions/when-should-qc-escalate-after-viability-review.md"),
    `---
type: question
title: When should QC escalate after viability review?
workflow: flow_cytometry
status: active
related:
  - agent-wiki/notes/viability-gate-review.md
sources:
  - agent-wiki/sources/flow-cytometry-demo-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# When should QC escalate after viability review?

## Question

When should an ambiguous viability decision escalate to QC?

## Answer

Escalate when the gate change would materially affect downstream QC acceptance.

## Escalate When

- The result would flip from pass to fail.

## Related

- agent-wiki/notes/viability-gate-review.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/questions/when-should-a-new-skill-be-created.md"),
    `---
type: question
title: When should a new skill be created?
workflow: repo_engineering
status: active
related:
  - agent-wiki/concepts/loop-bridge.md
sources:
  - agent-wiki/sources/portable-pack-design-notes.md
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# When should a new skill be created?

## Question

When should the pack create a new skill?

## Answer

Only when a new recurring task boundary appears.

## Escalate When

- The new knowledge is just another exception.

## Related

- agent-wiki/comparisons/repo-protocol-vs-loop-bridge.md
`,
  );
  await writeFile(
    path.join(tempDir, "agent-wiki/sources/portable-pack-design-notes.md"),
    `---
type: source
title: Portable pack design notes
workflow: repo_engineering
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources: []
updated: 2026-04-12T16:00:00.000Z
review_after: 2026-07-12
---

# Portable pack design notes

## Overview

Design notes behind the pack loop.

## Key Claims

- Host integration controls per-turn behavior.

## Limitations

- Design assumptions may change.

## Related

- agent-wiki/concepts/loop-bridge.md
`,
  );
}

async function createHostRepo(tempDir: string) {
  await mkdir(path.join(tempDir, ".datalox"), { recursive: true });
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "host-repo",
        dependencies: {
          vitest: "^2.0.0",
        },
      },
      null,
      2,
    ),
  );
}

function runNodeScript(
  tempDir: string,
  scriptRelativePath: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
) {
  return spawnSync("node", [path.join(repoRoot, scriptRelativePath), ...args], {
    cwd: tempDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATALOX_CONFIG_JSON: "",
      DATALOX_BASE_URL: "",
      DATALOX_DEFAULT_WORKFLOW: "",
      DATALOX_AGENT_PROFILE: "",
      DATALOX_MODE: "",
      ...envOverrides,
    },
  });
}

describe("agent scripts", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("bootstraps a repo_only pack", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-bootstrap.mjs", ["--json"]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.mode).toBe("repo_only");
    expect(body.runtimeEnabled).toBe(false);
    expect(body.detectOnEveryLoop).toBe(true);
    expect(body.counts.skills).toBe(2);
    expect(body.counts.notes).toBe(3);
    expect(body.counts.wikiPages).toBeGreaterThan(body.counts.notes);
    expect(body.counts.hostSkills).toBe(2);
    expect(body.counts.seedSkills).toBe(0);
    expect(body.paths.hostNotesDir).toContain("agent-wiki/notes");
    expect(body.paths.seedNotesDir).toContain("agent-wiki/notes");
  });

  it("resolves a local skill and its notes", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(body.matches[0]).not.toHaveProperty("score");
    expect(body.matches[0].linkedNotes[0].path).toBe("agent-wiki/notes/viability-gate-review.md");
    expect(body.matches[0].loopGuidance.whyMatched).toContain("workflow_match");
    expect(body.matches[0].loopGuidance.whatToDoNow[0]).toContain("Review the linked exception pattern");
    expect(body.matches[0].loopGuidance.watchFor[0]).toContain("Live and dead populations");
  });

  it("falls back to direct note retrieval when no skill matches the query", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);
    await writeFile(
      path.join(tempDir, "agent-wiki/notes/reversible-onboarding.md"),
      `---
type: note
id: agent-adoption-reversible-onboarding
title: Reversible onboarding for agent-managed repos
kind: trace
workflow: agent_adoption
tags:
  - agent_adoption
status: active
related:
  - agent-wiki/notes/evolve-datalox-pack.md
sources:
  - agent-wiki/events/example.json
updated: 2026-04-14T00:00:00.000Z
---

# Reversible onboarding for agent-managed repos

## When to Use

Use this note when a new repo needs a visible and reversible onboarding path before the first managed run.

## Signal

New repos keep failing because the install surface is hidden or irreversible.

## Interpretation

This is a reusable onboarding gap, not a one-off setup complaint.

## Action

Make the onboarding path visible and reversible before asking the next agent to continue.

## Examples

- A repo where agents keep failing because there is no visible install entrypoint.

## Evidence

- agent-wiki/events/example.json

## Related

- agent-wiki/notes/evolve-datalox-pack.md
`,
    );

    const result = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "make onboarding visible and reversible for a new repo",
      "--workflow",
      "agent_adoption",
      "--json",
    ]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.selectionBasis).toBe("direct_note_query");
    expect(body.matches).toHaveLength(0);
    expect(body.directNoteMatches[0].note.path).toBe("agent-wiki/notes/reversible-onboarding.md");
    expect(body.directNoteMatches[0]).not.toHaveProperty("score");
    expect(body.directNoteMatches[0]).not.toHaveProperty("backendScore");
    expect(body.loopGuidance.whatToDoNow[0]).toContain("visible and reversible");
    expect(body.loopGuidance.watchFor[0]).toContain("install surface is hidden or irreversible");
  });

  it("keeps repo-context resolution empty without an explicit task", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const result = runNodeScript(tempDir, "scripts/agent-resolve.mjs", ["--json"]);
    expect(result.status).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.selectionBasis).toBe("repo_context");
    expect(body.matches).toHaveLength(0);
    expect(body.directNoteMatches).toHaveLength(0);
  });

  it("writes a generated skill into skills and points it at notes", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnPatternResult = runNodeScript(tempDir, "scripts/agent-learn-pattern.mjs", [
      "--workflow",
      "flow_cytometry",
      "--title",
      "dim dead tail overlap",
      "--signal",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely artifact",
      "--action",
      "review exception pattern before widening gate",
      "--skill",
      "flow-cytometry.review-ambiguous-viability-gate",
      "--json",
    ]);
    expect(learnPatternResult.status).toBe(0);

    const patternBody = JSON.parse(learnPatternResult.stdout);
    const skillFile = await readFile(
      path.join(tempDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
      "utf8",
    );
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");
    const hotFile = await readFile(path.join(tempDir, "agent-wiki/hot.md"), "utf8");

    expect(patternBody.note.relativePath).toContain("agent-wiki/notes/");
    expect(skillFile).toContain(patternBody.note.relativePath);
    expect(skillFile).toContain("## Workflow");
    expect(indexFile).toContain("## Skills");
    expect(indexFile).toContain(patternBody.note.relativePath);
    expect(logFile).toContain("update_note");
    expect(logFile).toContain("update_skill");
    expect(hotFile).toContain("Agent Wiki Hot Cache");
  }, 10000);

  it("learns from interaction by writing a note and updating a skill in skills", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnResult = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--summary",
      "Repeated dim-dead-tail overlap during viability review",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);
    expect(learnResult.status).toBe(0);

    const body = JSON.parse(learnResult.stdout);
    expect(body.note.relativePath).toContain("agent-wiki/notes/");
    expect(body.note.payload.kind).toBe("workflow_note");
    expect(body.skill.payload.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(body.skill.operation).toBe("update_skill");
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");
    expect(indexFile).toContain(body.note.relativePath);
    expect(logFile).toContain("update_skill");

    const resolveResult = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(resolveResult.status).toBe(0);

    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(resolved.matches[0].linkedNotes.length).toBeGreaterThan(1);
    expect(
      resolved.matches[0].loopGuidance.whatToDoNow.some((value: string) =>
        value.toLowerCase().includes("widening gate") || value.toLowerCase().includes("exception path")
      ),
    ).toBe(true);
  }, 15000);

  it("reuses the same generated note for repeated related interactions instead of spawning note noise", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const runLearn = () => runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--summary",
      "Repeated dim-dead-tail overlap during viability review",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);

    const first = runLearn();
    expect(first.status).toBe(0);
    const firstBody = JSON.parse(first.stdout);

    const second = runLearn();
    expect(second.status).toBe(0);
    const secondBody = JSON.parse(second.stdout);

    expect(secondBody.note.relativePath).toBe(firstBody.note.relativePath);
    const generatedNoteReferences = secondBody.skill.payload.notePaths.filter(
      (value: string) => value === firstBody.note.relativePath,
    );
    expect(generatedNoteReferences.length).toBe(1);

    const noteFile = await readFile(path.join(tempDir, firstBody.note.relativePath), "utf8");
    expect(noteFile).toContain("Repeated dim-dead-tail overlap during viability review");
    expect(noteFile).toContain("dim dead tail overlaps live shoulder");
  }, 10000);

  it("runs the minimal detect use patch lint loop", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const detectAndUse = runNodeScript(tempDir, "scripts/agent-resolve.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--json",
    ]);
    expect(detectAndUse.status).toBe(0);

    const before = JSON.parse(detectAndUse.stdout);
    expect(before.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(before.matches[0].loopGuidance.whatToDoNow.length).toBeGreaterThan(0);

    const patch = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
      "--task",
      "review ambiguous live dead gate",
      "--workflow",
      "flow_cytometry",
      "--observation",
      "dim dead tail overlaps live shoulder",
      "--interpretation",
      "likely staining artifact",
      "--action",
      "review exception pattern before widening gate",
      "--json",
    ]);
    expect(patch.status).toBe(0);

    const patched = JSON.parse(patch.stdout);
    expect(patched.note.relativePath).toContain("agent-wiki/notes/");
    expect(patched.skill.payload.notePaths).toContain(patched.note.relativePath);
    expect(patched.skill.operation).toBe("update_skill");

    const lint = runNodeScript(tempDir, "scripts/agent-lint.mjs", ["--json"]);
    expect(lint.status).toBe(0);

    const lintBody = JSON.parse(lint.stdout);
    expect(lintBody.ok).toBe(true);
    expect(lintBody.issueCount).toBe(0);
    expect(await readFile(path.join(tempDir, "agent-wiki/lint.md"), "utf8")).toContain("Issue Count: 0");
    expect(await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8")).toContain("lint_pack");
    expect(await readFile(path.join(tempDir, "agent-wiki/hot.md"), "utf8")).toContain("Recent Changes");
  }, 20000);

  it("lints the minimal skill-pattern graph", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    await mkdir(path.join(tempDir, "skills/broken-skill"), { recursive: true });
    await writeFile(
      path.join(tempDir, "skills/broken-skill/SKILL.md"),
      `---
name: broken-skill
description: Broken test skill.
metadata:
  datalox:
    id: flow-cytometry.broken-skill
    workflow: flow_cytometry
    trigger: Use when the pack is broken.
    note_paths:
      - agent-wiki/notes/missing-pattern.md
      - agent-wiki/notes/bad-pattern.md
    status: generated
    tags:
      - flow_cytometry
---

# Broken Skill

## When to Use

Use when the pack is broken.
`,
    );

    await writeFile(
      path.join(tempDir, "agent-wiki/notes/bad-pattern.md"),
      "# Bad pattern\n\n## Signal\n\nOnly signal exists.\n",
    );
    await writeFile(
      path.join(tempDir, "agent-wiki/notes/orphan-pattern.md"),
      "# Orphan pattern\n\n## Signal\n\nUnused pattern.\n\n## Interpretation\n\nNo skill uses it.\n\n## Recommended Action\n\nAttach it or delete it.\n",
    );

    const lintResult = runNodeScript(tempDir, "scripts/agent-lint.mjs", ["--json"]);
    expect(lintResult.status).toBe(1);

    const body = JSON.parse(lintResult.stdout);
    expect(body.ok).toBe(false);
    expect(body.issues.some((issue: { code: string }) => issue.code === "skill_broken_note_link")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "note_missing_interpretation")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "note_missing_action")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "orphan_note")).toBe(true);
    expect(body.issues.some((issue: { code: string }) => issue.code === "skill_missing_workflow_section")).toBe(true);
    expect(await readFile(path.join(tempDir, "agent-wiki/lint.md"), "utf8")).toContain("skill_broken_note_link");
  }, 20000);

  it("reads seed knowledge from an external pack and writes generated knowledge into the host repo", async () => {
    const packDir = await mkdtemp(path.join(tmpdir(), "datalox-seed-pack-"));
    const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-host-repo-"));
    tempDirs.push(packDir, hostDir);
    await createPack(packDir);
    await createHostRepo(hostDir);

    const configPath = path.join(packDir, ".datalox/config.json");

    const resolveResult = runNodeScript(
      hostDir,
      "scripts/agent-resolve.mjs",
      [
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--json",
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(resolveResult.status).toBe(0);

    const resolved = JSON.parse(resolveResult.stdout);
    expect(resolved.matches[0].skill.id).toBe("flow-cytometry.review-ambiguous-viability-gate");
    expect(resolved.matches[0].skillOrigin).toBe("seed");

    const patchResult = runNodeScript(
      hostDir,
      "scripts/agent-learn-from-interaction.mjs",
      [
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--observation",
        "dim dead tail overlaps live shoulder",
        "--interpretation",
        "likely staining artifact",
        "--action",
        "review exception pattern before widening gate",
        "--json",
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(patchResult.status).toBe(0);

    const patched = JSON.parse(patchResult.stdout);
    const hostSkillPath = path.join(hostDir, "skills/review-ambiguous-viability-gate/SKILL.md");
    const hostPatternPath = path.join(hostDir, patched.note.relativePath);
    const seedSkill = await readFile(
      path.join(packDir, "skills/review-ambiguous-viability-gate/SKILL.md"),
      "utf8",
    );
    const hostSkill = await readFile(hostSkillPath, "utf8");
    const hostIndex = await readFile(path.join(hostDir, "agent-wiki/index.md"), "utf8");
    const hostLog = await readFile(path.join(hostDir, "agent-wiki/log.md"), "utf8");

    expect(hostSkill).toContain(patched.note.relativePath);
    expect(hostSkill).toContain("## Workflow");
    expect(seedSkill).not.toContain(patched.note.relativePath);
    expect(await readFile(hostPatternPath, "utf8")).toContain("Review the exception path before widening the gate");
    expect(hostIndex).toContain(patched.note.relativePath);
    expect(hostLog).toContain("update_skill");

    const resolveAgain = runNodeScript(
      hostDir,
      "scripts/agent-resolve.mjs",
      [
        "--task",
        "review ambiguous live dead gate",
        "--workflow",
        "flow_cytometry",
        "--json",
      ],
      { DATALOX_CONFIG_JSON: configPath },
    );
    expect(resolveAgain.status).toBe(0);

    const resolvedAgain = JSON.parse(resolveAgain.stdout);
    expect(resolvedAgain.matches[0].skillOrigin).toBe("host");
    expect(resolvedAgain.matches[0].linkedNotes.length).toBe(2);
  }, 15000);

  it("creates a new skill when no existing skill matches the interaction", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "datalox-pack-"));
    tempDirs.push(tempDir);
    await createPack(tempDir);

    const learnResult = runNodeScript(tempDir, "scripts/agent-learn-from-interaction.mjs", [
      "--task",
      "stabilize manual pack adoption in non technical repos",
      "--workflow",
      "agent_adoption",
      "--summary",
      "Users need the pack to be visible and reversible during setup",
      "--observation",
      "new repos need a visible onboarding flow and trust controls",
      "--interpretation",
      "this is a recurring adoption workflow rather than a one-off note",
      "--action",
      "create a skill that guides adoption and points to the pattern doc",
      "--json",
    ]);
    expect(learnResult.status).toBe(0);

    const body = JSON.parse(learnResult.stdout);
    const generatedSkillPath = body.skill.filePath;
    const generatedSkill = await readFile(generatedSkillPath, "utf8");
    const logFile = await readFile(path.join(tempDir, "agent-wiki/log.md"), "utf8");
    const indexFile = await readFile(path.join(tempDir, "agent-wiki/index.md"), "utf8");

    expect(body.skill.operation).toBe("create_skill");
    expect(body.skill.payload.id).toBe("agent_adoption.stabilize-manual-pack-adoption-in-non-technical-repos");
    expect(generatedSkill).toContain("## Workflow");
    expect(generatedSkill).toContain("agent-wiki/notes/");
    expect(logFile).toContain("create_skill");
    expect(indexFile).toContain("agent_adoption.stabilize-manual-pack-adoption-in-non-technical-repos");
  }, 10000);
});
