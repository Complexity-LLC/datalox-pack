import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  adoptPack,
  lintLocalPack,
  patchKnowledge,
  promoteGap,
  recordTurnResult,
  resolveLoop,
} from "../core/packCore.js";
import { capturePdfArtifact } from "../core/pdfCapture.js";
import { publishWebCapture } from "../core/publishWebCapture.js";
import { captureDesignFromUrl, captureWebArtifact } from "../core/webCapture.js";

const server = new McpServer({
  name: "datalox-pack",
  version: "0.1.0",
});

const JsonResultSchema = {
  result: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
};

server.registerTool(
  "capture_web_artifact",
  {
    description: "Capture a live website into a repo-local note plus an optional reusable artifact such as a design brief, CSS variable sheet, tokens, or Tailwind theme.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      url: z.string().describe("Website URL to capture."),
      artifact_type: z.enum(["design_doc", "design_tokens", "css_variables", "tailwind_theme", "note", "source_page"]).optional(),
      title: z.string().optional(),
      slug: z.string().optional(),
      output_path: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path, url, artifact_type, title, slug, output_path }) => {
    const result = await captureWebArtifact({
      repoPath: repo_path,
      url,
      artifactType: artifact_type,
      title,
      slug,
      outputPath: output_path,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "capture_pdf_artifact",
  {
    description: "Capture a PDF into a repo-local note so agents can act from extracted evidence instead of reopening the file.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      path: z.string().describe("Absolute or relative path to the PDF file."),
      title: z.string().optional(),
      slug: z.string().optional(),
      source_url: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path, path, title, slug, source_url }) => {
    const result = await capturePdfArtifact({
      repoPath: repo_path,
      path,
      title,
      slug,
      sourceUrl: source_url,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "capture_design_source",
  {
    description: "Compatibility alias: capture a live website into a design brief plus a reusable note and screenshots in the host repo.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      url: z.string().describe("Website URL to capture."),
      title: z.string().optional(),
      slug: z.string().optional(),
      output_path: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path, url, title, slug, output_path }) => {
    const result = await captureDesignFromUrl({
      repoPath: repo_path,
      url,
      title,
      slug,
      outputPath: output_path,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "publish_web_capture",
  {
    description: "Publish one captured web instance to R2, write its manifest.json, and regenerate indexes/latest.json.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      capture: z.string().describe("Capture slug under agent-wiki/notes/web/<slug>.capture.json."),
      bucket: z.string().optional(),
      prefix: z.string().optional(),
      public_base_url: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path, capture, bucket, prefix, public_base_url }) => {
    const result = await publishWebCapture({
      repoPath: repo_path,
      capture,
      bucket,
      prefix,
      publicBaseUrl: public_base_url,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "resolve_loop",
  {
    description: "Resolve the best matching Datalox skill for the current loop and return actionable guidance.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      task: z.string().optional(),
      workflow: z.string().optional(),
      step: z.string().optional(),
      skill: z.string().optional(),
      limit: z.number().int().positive().optional(),
      include_content: z.boolean().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path, task, workflow, step, skill, limit, include_content }) => {
    const result = await resolveLoop({
      repoPath: repo_path,
      task,
      workflow,
      step,
      skill,
      limit,
      includeContent: include_content,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "record_turn_result",
  {
    description: "Record a grounded loop event before promoting it into wiki pages or skills.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      task: z.string().optional(),
      workflow: z.string().optional(),
      step: z.string().optional(),
      skill_id: z.string().optional(),
      summary: z.string().optional(),
      observations: z.array(z.string()).optional(),
      changed_files: z.array(z.string()).optional(),
      transcript: z.string().optional(),
      tags: z.array(z.string()).optional(),
      title: z.string().optional(),
      signal: z.string().optional(),
      interpretation: z.string().optional(),
      recommended_action: z.string().optional(),
      outcome: z.string().optional(),
      event_kind: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({
    repo_path,
    task,
    workflow,
    step,
    skill_id,
    summary,
    observations,
    changed_files,
    transcript,
    tags,
    title,
    signal,
    interpretation,
    recommended_action,
    outcome,
    event_kind,
  }) => {
    const result = await recordTurnResult({
      repoPath: repo_path,
      task,
      workflow,
      step,
      skillId: skill_id,
      summary,
      observations,
      changedFiles: changed_files,
      transcript,
      tags,
      title,
      signal,
      interpretation,
      recommendedAction: recommended_action,
      outcome,
      eventKind: event_kind,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "patch_knowledge",
  {
    description: "Write a reusable note, create or update a skill, and refresh the visible pack artifacts.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      task: z.string().optional(),
      workflow: z.string().optional(),
      step: z.string().optional(),
      skill_id: z.string().optional(),
      summary: z.string().optional(),
      observations: z.array(z.string()).optional(),
      transcript: z.string().optional(),
      tags: z.array(z.string()).optional(),
      title: z.string().optional(),
      signal: z.string().optional(),
      interpretation: z.string().optional(),
      recommended_action: z.string().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({
    repo_path,
    task,
    workflow,
    step,
    skill_id,
    summary,
    observations,
    transcript,
    tags,
    title,
    signal,
    interpretation,
    recommended_action,
  }) => {
    const result = await patchKnowledge({
      repoPath: repo_path,
      task,
      workflow,
      step,
      skillId: skill_id,
      summary,
      observations,
      transcript,
      tags,
      title,
      signal,
      interpretation,
      recommendedAction: recommended_action,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "promote_gap",
  {
    description: "Promote repeated grounded events into reusable notes or new/updated skills using conservative thresholds.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
      task: z.string().optional(),
      workflow: z.string().optional(),
      step: z.string().optional(),
      skill_id: z.string().optional(),
      summary: z.string().optional(),
      observations: z.array(z.string()).optional(),
      changed_files: z.array(z.string()).optional(),
      transcript: z.string().optional(),
      tags: z.array(z.string()).optional(),
      title: z.string().optional(),
      signal: z.string().optional(),
      interpretation: z.string().optional(),
      recommended_action: z.string().optional(),
      outcome: z.string().optional(),
      event_kind: z.string().optional(),
      min_wiki_occurrences: z.number().int().positive().optional(),
      min_skill_occurrences: z.number().int().positive().optional(),
    },
    outputSchema: JsonResultSchema,
  },
  async ({
    repo_path,
    task,
    workflow,
    step,
    skill_id,
    summary,
    observations,
    changed_files,
    transcript,
    tags,
    title,
    signal,
    interpretation,
    recommended_action,
    outcome,
    event_kind,
    min_wiki_occurrences,
    min_skill_occurrences,
  }) => {
    const result = await promoteGap({
      repoPath: repo_path,
      task,
      workflow,
      step,
      skillId: skill_id,
      summary,
      observations,
      changedFiles: changed_files,
      transcript,
      tags,
      title,
      signal,
      interpretation,
      recommendedAction: recommended_action,
      outcome,
      eventKind: event_kind,
      minWikiOccurrences: min_wiki_occurrences,
      minSkillOccurrences: min_skill_occurrences,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "lint_pack",
  {
    description: "Lint the local Datalox pack and refresh agent-wiki/lint.md.",
    inputSchema: {
      repo_path: z.string().describe("Absolute or relative path to the host repo."),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ repo_path }) => {
    const result = await lintLocalPack({ repoPath: repo_path });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

server.registerTool(
  "adopt_pack",
  {
    description: "Copy the Datalox pack into a host repo from the current repo or a git URL.",
    inputSchema: {
      host_repo_path: z.string().describe("Absolute or relative path to the host repo."),
      pack_source: z.string().optional().describe("Optional local path or git URL for the source pack."),
    },
    outputSchema: JsonResultSchema,
  },
  async ({ host_repo_path, pack_source }) => {
    const result = await adoptPack({
      hostRepoPath: host_repo_path,
      packSource: pack_source,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
