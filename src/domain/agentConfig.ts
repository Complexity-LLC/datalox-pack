export const PACK_MODES = [
  "repo_only",
  "service_backed",
] as const;

export type PackMode = (typeof PACK_MODES)[number];

export const AGENT_PROFILES = [
  "local_first",
  "runtime_first",
  "registry_first",
] as const;

export type AgentProfile = (typeof AGENT_PROFILES)[number];

export const AGENT_INTERFACES = [
  "local_skill",
  "working_knowledge",
  "proposal_writeback",
  "runtime_compile",
  "retrieval_search",
  "skill_registry",
] as const;

export type AgentInterface = (typeof AGENT_INTERFACES)[number];

export const DOC_READ_MODES = [
  "materialized_view",
  "raw_doc",
] as const;

export type DocReadMode = (typeof DOC_READ_MODES)[number];

export const DOC_REF_KINDS = [
  "path",
  "file_id",
  "url",
] as const;

export type DocRefKind = (typeof DOC_REF_KINDS)[number];

export const SOURCE_KINDS = [
  "local_repo",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface AgentConfig {
  version: number;
  mode: PackMode;
  project: {
    id: string;
    name: string;
  };
  sources: Array<{
    kind: SourceKind;
    name: string;
    enabled: boolean;
    root: string;
  }>;
  agent: {
    profile: AgentProfile;
    nativeSkillPolicy: "preserve";
    configReadOrder: string[];
    interfaceOrder: AgentInterface[];
    docReadOrder: DocReadMode[];
    citationRequired: boolean;
    escalateWhenNoMatch: boolean;
    fetchPolicy: "metadata_first" | "content_first";
  };
  paths: {
    localSkillsDir: string;
    localDocsDir: string;
    localViewsDir: string;
    workingSkillsDir: string;
    workingPatternsDir: string;
  };
  runtime: {
    enabled: boolean;
    baseUrl: string;
    defaultWorkflow: string;
    requestTimeoutMs: number;
    endpoints: {
      compile: string;
      search: string;
      fileMetadata: string;
      fileDownload: string;
      skillSearch?: string;
      skillInstall?: string;
      contributorRegister?: string;
    };
  };
  retrieval: {
    defaultLimit: number;
    maxSnippets: number;
    allowedDocRefKinds: DocRefKind[];
  };
  materialization: {
    preferredViewType: string;
    traceStrategy: "source_anchors";
    viewFormatVersion: number;
  };
  writeback: {
    enabled: boolean;
    proposalsDir: string;
    proposedSkillsDir: string;
    proposedPatternsDir: string;
    capturesDir: string;
    authorEnv: string;
  };
  auth: {
    apiKeyEnv: string;
    contributorKeyEnv: string;
  };
}
