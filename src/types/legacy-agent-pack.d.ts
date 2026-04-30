declare module "../../scripts/lib/agent-pack.mjs" {
  export function resolveLocalKnowledge(input: unknown, cwd?: string): Promise<any>;
  export function syncNoteRetrieval(cwd?: string): Promise<any>;
  export function learnFromInteraction(input: unknown, cwd?: string): Promise<any>;
  export function maintainKnowledge(input: unknown, cwd?: string): Promise<any>;
  export function runAutomaticMaintenance(input: unknown, cwd?: string): Promise<any>;
  export function lintPack(cwd?: string): Promise<any>;
  export function refreshControlArtifacts(
    cwd?: string,
    options?: {
      logEntry?: {
        action: string;
        detail: string;
        path?: string;
      };
      lintResult?: unknown;
    },
  ): Promise<any>;
}
