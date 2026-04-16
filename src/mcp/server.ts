import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { buildLoopPulse } from "./loopPulse.js";
import { buildSharedMcpInputSchema, getSharedMcpCommands, parseSharedMcpInput } from "../surface/sharedCommands.js";

const server = new McpServer({
  name: "datalox-pack",
  version: "0.1.0",
});

const JsonValueSchema = z.record(z.string(), z.unknown()).or(z.array(z.unknown()));
const JsonResultSchema = {
  result: JsonValueSchema,
  loop_pulse: z.record(z.string(), z.unknown()),
};

function maybeRepoPath(command: string, input: Record<string, unknown>): string | undefined {
  if (typeof input.repo_path === "string") {
    return input.repo_path;
  }
  if (command === "adopt_pack" && typeof input.host_repo_path === "string") {
    return input.host_repo_path;
  }
  return undefined;
}

for (const command of getSharedMcpCommands()) {
  server.registerTool(
    command.mcpTool,
    {
      description: command.description,
      inputSchema: buildSharedMcpInputSchema(command),
      outputSchema: JsonResultSchema,
    },
    async (input) => {
      const rawInput = input as Record<string, unknown>;
      const normalizedInput = parseSharedMcpInput(command, rawInput);
      const result = await command.run(normalizedInput);
      const loopPulse = await buildLoopPulse({
        command: command.mcpTool,
        repoPath: maybeRepoPath(command.mcpTool, rawInput),
        result,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ result, loop_pulse: loopPulse }, null, 2) }],
        structuredContent: {
          result,
          loop_pulse: loopPulse,
        },
      };
    },
  );
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
