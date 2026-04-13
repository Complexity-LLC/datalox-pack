import {
  buildLoopEnvelope,
  finalizeWrappedRun,
  runWrappedCommand,
  sanitizeWrappedCommandResult,
  type LoopEnvelopeInput,
  type WrapperPostRunInput,
} from "../shared.js";

export interface CodexWrapperInput extends LoopEnvelopeInput, WrapperPostRunInput {
  codexBin?: string;
  codexArgs?: string[];
}

export async function runCodexWrapper(input: CodexWrapperInput) {
  const envelope = await buildLoopEnvelope(input);
  const codexBin = input.codexBin ?? process.env.DATALOX_CODEX_BIN ?? "codex";
  const codexArgs = input.codexArgs && input.codexArgs.length > 0
    ? [...input.codexArgs]
    : ["exec", "--skip-git-repo-check"];

  const hasPromptPlaceholder = codexArgs.some((arg) => arg.includes("__DATALOX_PROMPT__"));
  const finalArgs = hasPromptPlaceholder
    ? codexArgs
    : [...codexArgs, envelope.wrappedPrompt];
  const executed = runWrappedCommand(codexBin, finalArgs, envelope, {
    cwd: envelope.repoPath,
  });
  const sanitized = sanitizeWrappedCommandResult(executed);

  return {
    envelope,
    child: sanitized.child,
    postRun: await finalizeWrappedRun(envelope, executed, {
      hostKind: "codex",
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId,
      summary: input.summary,
      tags: input.tags,
      eventKind: input.eventKind,
      postRunMode: input.postRunMode,
      minWikiOccurrences: input.minWikiOccurrences,
      minSkillOccurrences: input.minSkillOccurrences,
    }),
  };
}
