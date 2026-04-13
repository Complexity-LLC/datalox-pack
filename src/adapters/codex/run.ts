import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildLoopEnvelope,
  finalizeWrappedRun,
  runWrappedCommand,
  stripDataloxMarkers,
  sanitizeWrappedCommandResult,
  type LoopEnvelopeInput,
  type WrapperPostRunInput,
} from "../shared.js";

export interface CodexWrapperInput extends LoopEnvelopeInput, WrapperPostRunInput {
  codexBin?: string;
  codexArgs?: string[];
}

const CODEX_OPTIONS_WITH_VALUES = new Set([
  "-c",
  "--config",
  "--enable",
  "--disable",
  "-i",
  "--image",
  "-m",
  "--model",
  "--local-provider",
  "-s",
  "--sandbox",
  "-p",
  "--profile",
  "-C",
  "--cd",
  "--add-dir",
  "--output-schema",
  "--color",
  "-o",
  "--output-last-message",
  "--base",
  "--commit",
  "--title",
]);

function findCodexSubcommandIndex(args: string[]): number {
  return args.findIndex((arg) => ["exec", "e", "review"].includes(arg));
}

function inferPromptFromCodexArgs(args: string[]): string | undefined {
  const index = findCodexPromptIndex(args);
  return index === -1 ? undefined : args[index];
}

function findCodexPromptIndex(args: string[]): number {
  const subcommandIndex = findCodexSubcommandIndex(args);
  if (subcommandIndex === -1) {
    return -1;
  }

  let promptIndex = -1;
  let skipNext = false;
  for (let index = subcommandIndex + 1; index < args.length; index += 1) {
    const arg = args[index];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      break;
    }
    if (arg.startsWith("--") && arg.includes("=")) {
      continue;
    }
    if (CODEX_OPTIONS_WITH_VALUES.has(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    promptIndex = index;
  }

  return promptIndex;
}

function findCodexOutputPath(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-o" || arg === "--output-last-message") {
      return args[index + 1];
    }
    if (arg.startsWith("--output-last-message=")) {
      return arg.slice("--output-last-message=".length);
    }
  }
  return undefined;
}

async function sanitizeCodexOutputFile(repoPath: string, outputPath: string | undefined): Promise<void> {
  if (!outputPath) {
    return;
  }
  const resolvedPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(repoPath, outputPath);

  try {
    const contents = await readFile(resolvedPath, "utf8");
    const sanitized = stripDataloxMarkers(contents);
    if (sanitized !== contents) {
      await writeFile(resolvedPath, sanitized, "utf8");
    }
  } catch {
    // Ignore missing or unreadable output files; Codex may not have written one.
  }
}

export async function runCodexWrapper(input: CodexWrapperInput) {
  const codexBin = input.codexBin ?? process.env.DATALOX_CODEX_BIN ?? "codex";
  const codexArgs = input.codexArgs && input.codexArgs.length > 0
    ? [...input.codexArgs]
    : ["exec", "--skip-git-repo-check"];
  const inferredPromptIndex = findCodexPromptIndex(codexArgs);
  const inferredPrompt = input.prompt ?? input.task ?? (
    inferredPromptIndex === -1 ? undefined : codexArgs[inferredPromptIndex]
  );
  const envelope = await buildLoopEnvelope({
    ...input,
    prompt: inferredPrompt,
  });

  const hasPromptPlaceholder = codexArgs.some((arg) => arg.includes("__DATALOX_PROMPT__"));
  let finalArgs: string[];
  if (hasPromptPlaceholder) {
    finalArgs = codexArgs;
  } else if (inferredPromptIndex !== -1) {
    finalArgs = [...codexArgs];
    finalArgs[inferredPromptIndex] = envelope.wrappedPrompt;
  } else {
    finalArgs = [...codexArgs, envelope.wrappedPrompt];
  }
  const executed = runWrappedCommand(codexBin, finalArgs, envelope, {
    cwd: envelope.repoPath,
  });
  await sanitizeCodexOutputFile(envelope.repoPath, findCodexOutputPath(finalArgs));
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
