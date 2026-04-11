export const PACK_MODES = [
  "repo_only",
  "service_backed",
] as const;

export type PackMode = (typeof PACK_MODES)[number];

export const AGENT_PROFILES = [
  "local_first",
  "runtime_first",
] as const;

export type AgentProfile = (typeof AGENT_PROFILES)[number];

export const AGENT_INTERFACES = [
  "skill_loop",
  "runtime_compile",
] as const;

export type AgentInterface = (typeof AGENT_INTERFACES)[number];

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
    detectOnEveryLoop: boolean;
    configReadOrder: string[];
    interfaceOrder: AgentInterface[];
  };
  paths: {
    seedSkillsDir: string;
    seedPatternsDir: string;
    hostSkillsDir: string;
    hostPatternsDir: string;
  };
  runtime: {
    enabled: boolean;
    baseUrl: string;
    defaultWorkflow: string;
    requestTimeoutMs: number;
    endpoints: {
      compile: string;
    };
  };
  auth: {
    apiKeyEnv: string;
    contributorKeyEnv: string;
  };
}
