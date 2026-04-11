import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  AGENT_INTERFACES,
  AGENT_PROFILES,
  DOC_READ_MODES,
  DOC_REF_KINDS,
  PACK_MODES,
  SOURCE_KINDS,
  type AgentConfig,
} from "../domain/agentConfig.js";

const CONFIG_PATH_ENV = "DATALOX_CONFIG_JSON";
const BASE_URL_ENV = "DATALOX_BASE_URL";
const DEFAULT_WORKFLOW_ENV = "DATALOX_DEFAULT_WORKFLOW";
const AGENT_PROFILE_ENV = "DATALOX_AGENT_PROFILE";
const MODE_ENV = "DATALOX_MODE";

export interface LoadedAgentConfig {
  config: AgentConfig;
  sourcePath: string;
  localOverridePath?: string;
  appliedEnvOverrides: string[];
}

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }

  const merged: JsonObject = { ...base };

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Agent config at ${filePath} must be a JSON object`);
  }
  return parsed;
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Agent config field ${fieldName} must be a non-empty string`);
  }
  return value;
}

function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Agent config field ${fieldName} must be a boolean`);
  }
  return value;
}

function expectPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`Agent config field ${fieldName} must be a positive integer`);
  }
  return value as number;
}

function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Agent config field ${fieldName} must be an array of strings`);
  }
  return value;
}

function expectEnumArray<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T,
): T[number][] {
  const values = expectStringArray(value, fieldName);
  for (const item of values) {
    if (!allowedValues.includes(item)) {
      throw new Error(`Agent config field ${fieldName} contains invalid value ${item}`);
    }
  }
  return values as T[number][];
}

function expectEnumValue<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T,
): T[number] {
  const resolved = expectString(value, fieldName);
  if (!allowedValues.includes(resolved)) {
    throw new Error(`Agent config field ${fieldName} must be one of ${allowedValues.join(", ")}`);
  }
  return resolved as T[number];
}

function validateAgentConfig(raw: JsonObject): AgentConfig {
  const project = raw.project;
  const sources = raw.sources;
  const agent = raw.agent;
  const paths = raw.paths;
  const runtime = raw.runtime;
  const retrieval = raw.retrieval;
  const materialization = raw.materialization;
  const writeback = raw.writeback;
  const auth = raw.auth;

  if (!isRecord(project)) {
    throw new Error("Agent config field project must be an object");
  }
  if (!Array.isArray(sources)) {
    throw new Error("Agent config field sources must be an array");
  }
  if (!isRecord(agent)) {
    throw new Error("Agent config field agent must be an object");
  }
  if (!isRecord(paths)) {
    throw new Error("Agent config field paths must be an object");
  }
  if (!isRecord(runtime)) {
    throw new Error("Agent config field runtime must be an object");
  }
  if (!isRecord(retrieval)) {
    throw new Error("Agent config field retrieval must be an object");
  }
  if (!isRecord(materialization)) {
    throw new Error("Agent config field materialization must be an object");
  }
  if (!isRecord(writeback)) {
    throw new Error("Agent config field writeback must be an object");
  }
  if (!isRecord(auth)) {
    throw new Error("Agent config field auth must be an object");
  }

  const endpoints = runtime.endpoints;
  if (!isRecord(endpoints)) {
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
        ["preserve"] as const,
      ),
      configReadOrder: expectStringArray(agent.configReadOrder, "agent.configReadOrder"),
      interfaceOrder: expectEnumArray(
        agent.interfaceOrder,
        "agent.interfaceOrder",
        AGENT_INTERFACES,
      ),
      docReadOrder: expectEnumArray(agent.docReadOrder, "agent.docReadOrder", DOC_READ_MODES),
      citationRequired: expectBoolean(agent.citationRequired, "agent.citationRequired"),
      escalateWhenNoMatch: expectBoolean(
        agent.escalateWhenNoMatch,
        "agent.escalateWhenNoMatch",
      ),
      fetchPolicy: expectEnumValue(
        agent.fetchPolicy,
        "agent.fetchPolicy",
        ["metadata_first", "content_first"] as const,
      ),
    },
    paths: {
      localSkillsDir: expectString(paths.localSkillsDir, "paths.localSkillsDir"),
      localDocsDir: expectString(paths.localDocsDir, "paths.localDocsDir"),
      localViewsDir: expectString(paths.localViewsDir, "paths.localViewsDir"),
      workingSkillsDir: expectString(paths.workingSkillsDir, "paths.workingSkillsDir"),
      workingPatternsDir: expectString(paths.workingPatternsDir, "paths.workingPatternsDir"),
    },
    runtime: {
      enabled: expectBoolean(runtime.enabled, "runtime.enabled"),
      baseUrl: expectString(runtime.baseUrl, "runtime.baseUrl"),
      defaultWorkflow: expectString(runtime.defaultWorkflow, "runtime.defaultWorkflow"),
      requestTimeoutMs: expectPositiveInteger(runtime.requestTimeoutMs, "runtime.requestTimeoutMs"),
      endpoints: {
        compile: expectString(endpoints.compile, "runtime.endpoints.compile"),
        search: expectString(endpoints.search, "runtime.endpoints.search"),
        fileMetadata: expectString(endpoints.fileMetadata, "runtime.endpoints.fileMetadata"),
        fileDownload: expectString(endpoints.fileDownload, "runtime.endpoints.fileDownload"),
        skillSearch:
          endpoints.skillSearch === undefined
            ? undefined
            : expectString(endpoints.skillSearch, "runtime.endpoints.skillSearch"),
        skillInstall:
          endpoints.skillInstall === undefined
            ? undefined
            : expectString(endpoints.skillInstall, "runtime.endpoints.skillInstall"),
        contributorRegister:
          endpoints.contributorRegister === undefined
            ? undefined
            : expectString(
                endpoints.contributorRegister,
                "runtime.endpoints.contributorRegister",
              ),
      },
    },
    retrieval: {
      defaultLimit: expectPositiveInteger(retrieval.defaultLimit, "retrieval.defaultLimit"),
      maxSnippets: expectPositiveInteger(retrieval.maxSnippets, "retrieval.maxSnippets"),
      allowedDocRefKinds: expectEnumArray(
        retrieval.allowedDocRefKinds,
        "retrieval.allowedDocRefKinds",
        DOC_REF_KINDS,
      ),
    },
    materialization: {
      preferredViewType: expectString(
        materialization.preferredViewType,
        "materialization.preferredViewType",
      ),
      traceStrategy: expectEnumValue(
        materialization.traceStrategy,
        "materialization.traceStrategy",
        ["source_anchors"] as const,
      ),
      viewFormatVersion: expectPositiveInteger(
        materialization.viewFormatVersion,
        "materialization.viewFormatVersion",
      ),
    },
    writeback: {
      enabled: expectBoolean(writeback.enabled, "writeback.enabled"),
      proposalsDir: expectString(writeback.proposalsDir, "writeback.proposalsDir"),
      proposedSkillsDir: expectString(
        writeback.proposedSkillsDir,
        "writeback.proposedSkillsDir",
      ),
      proposedPatternsDir: expectString(
        writeback.proposedPatternsDir,
        "writeback.proposedPatternsDir",
      ),
      capturesDir: expectString(writeback.capturesDir, "writeback.capturesDir"),
      authorEnv: expectString(writeback.authorEnv, "writeback.authorEnv"),
    },
    auth: {
      apiKeyEnv: expectString(auth.apiKeyEnv, "auth.apiKeyEnv"),
      contributorKeyEnv: expectString(auth.contributorKeyEnv, "auth.contributorKeyEnv"),
    },
  };
}

function applyEnvironmentOverrides(config: AgentConfig): {
  config: AgentConfig;
  appliedEnvOverrides: string[];
} {
  const appliedEnvOverrides: string[] = [];
  const nextConfig: AgentConfig = {
    ...config,
    agent: { ...config.agent },
    runtime: { ...config.runtime },
  };

  if (process.env[BASE_URL_ENV]) {
    nextConfig.runtime.baseUrl = process.env[BASE_URL_ENV]!;
    appliedEnvOverrides.push(BASE_URL_ENV);
  }

  if (process.env[DEFAULT_WORKFLOW_ENV]) {
    nextConfig.runtime.defaultWorkflow = process.env[DEFAULT_WORKFLOW_ENV]!;
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

  return {
    config: nextConfig,
    appliedEnvOverrides,
  };
}

export async function loadAgentConfig(cwd = process.cwd()): Promise<LoadedAgentConfig> {
  const configuredPath = process.env[CONFIG_PATH_ENV];

  if (configuredPath) {
    const sourcePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(cwd, configuredPath);
    const config = validateAgentConfig(await readJsonObject(sourcePath));
    const withEnv = applyEnvironmentOverrides(config);
    return {
      config: withEnv.config,
      sourcePath,
      appliedEnvOverrides: [CONFIG_PATH_ENV, ...withEnv.appliedEnvOverrides],
    };
  }

  const sourcePath = path.resolve(cwd, ".datalox/config.json");
  const localOverridePath = path.resolve(cwd, ".datalox/config.local.json");

  const baseConfig = await readJsonObject(sourcePath);
  const mergedConfig = await fileExists(localOverridePath)
    ? deepMerge(baseConfig, await readJsonObject(localOverridePath))
    : baseConfig;
  const config = validateAgentConfig(mergedConfig as JsonObject);
  const withEnv = applyEnvironmentOverrides(config);

  return {
    config: withEnv.config,
    sourcePath,
    localOverridePath: (await fileExists(localOverridePath)) ? localOverridePath : undefined,
    appliedEnvOverrides: withEnv.appliedEnvOverrides,
  };
}
