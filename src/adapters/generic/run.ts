import {
  buildLoopEnvelope,
  finalizeWrappedRun,
  runWrappedCommand,
  sanitizeWrappedCommandResult,
  type LoopEnvelope,
  type LoopEnvelopeInput,
  type WrapperPostRunInput,
  type WrapperPostRunResult,
  type WrappedCommandResult,
} from "../shared.js";

export interface GenericWrapInput extends LoopEnvelopeInput, WrapperPostRunInput {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface GenericWrapResult {
  envelope: LoopEnvelope;
  child: WrappedCommandResult | null;
  postRun: WrapperPostRunResult | null;
}

export async function runGenericWrapper(input: GenericWrapInput): Promise<GenericWrapResult> {
  if (input.postRunMode === "review") {
    throw new Error("Generic wrapped commands do not support autonomous review. Use datalox codex or datalox claude for review mode.");
  }

  const envelope = await buildLoopEnvelope(input);

  if (!input.command) {
    return {
      envelope,
      child: null,
      postRun: null,
    };
  }

  const args = input.args ?? [];
  if (envelope.active && !args.some((arg) => arg.includes("__DATALOX_PROMPT__"))) {
    throw new Error("Generic wrapped commands require a __DATALOX_PROMPT__ placeholder when Datalox guidance is active.");
  }

  const executed = runWrappedCommand(input.command, input.args ?? [], envelope, {
    cwd: envelope.repoPath,
    env: input.env,
  });
  const sanitized = sanitizeWrappedCommandResult(executed);

  return {
    envelope,
    child: sanitized.child,
    postRun: await finalizeWrappedRun(envelope, executed, {
      hostKind: "generic",
      task: input.task,
      workflow: input.workflow,
      step: input.step,
      skillId: input.skillId ?? input.skill,
      summary: input.summary,
      tags: input.tags,
      eventKind: input.eventKind,
      postRunMode: input.postRunMode,
      minWikiOccurrences: input.minWikiOccurrences,
      minSkillOccurrences: input.minSkillOccurrences,
      reviewModel: input.reviewModel,
      reviewer: null,
    }),
  };
}
