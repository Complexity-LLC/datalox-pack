import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const builtCliPath = path.join(repoRoot, "dist", "src", "cli", "main.js");
const builtMcpPath = path.join(repoRoot, "dist", "src", "mcp", "server.js");

const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempDirs].map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
      tempDirs.delete(dir);
    }),
  );
});

async function createGitRepo(): Promise<string> {
  const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-pdf-"));
  tempDirs.add(hostDir);
  spawnSync("git", ["init"], { cwd: hostDir, encoding: "utf8" });
  return hostDir;
}

async function createSamplePdf(rootDir: string): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const first = pdf.addPage([612, 792]);
  first.drawText("Example PDF", { x: 48, y: 740, size: 24, font });
  first.drawText("Introduction to the method.", { x: 48, y: 700, size: 12, font });
  first.drawText("Key result one.", { x: 48, y: 680, size: 12, font });

  const second = pdf.addPage([612, 792]);
  second.drawText("Evaluation", { x: 48, y: 740, size: 24, font });
  second.drawText("Key result two.", { x: 48, y: 700, size: 12, font });
  second.drawText("Conclusion.", { x: 48, y: 680, size: 12, font });

  const pdfPath = path.join(rootDir, "example.pdf");
  await writeFile(pdfPath, await pdf.save());
  return pdfPath;
}

describe("pdf capture", () => {
  it("captures a pdf into a repo-local note through the CLI", async () => {
    const hostDir = await createGitRepo();
    const pdfPath = await createSamplePdf(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-pdf",
        "--repo",
        hostDir,
        "--path",
        pdfPath,
        "--source-url",
        "https://example.com/example.pdf",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      notePath: string;
      metadataPath: string;
      capture: { title: string; pageCount: number; headings: string[] };
    };

    const note = await readFile(path.join(hostDir, payload.notePath), "utf8");
    expect(payload.capture.pageCount).toBe(2);
    expect(payload.capture.title).toContain("Example");
    expect(note).toContain("## Signal");
    expect(note).toContain("## Evidence");
    expect(note).toContain("Source URL: https://example.com/example.pdf");
    expect(note).toContain("Introduction to the method.");
    expect(note).toContain("Evaluation");
    expect(spawnSync("test", ["-f", path.join(hostDir, payload.metadataPath)]).status).toBe(0);
  }, 30000);

  it("captures a pdf through the MCP server", async () => {
    const hostDir = await createGitRepo();
    const pdfPath = await createSamplePdf(hostDir);

    const transport = new StdioClientTransport({
      command: "node",
      args: [builtMcpPath],
      cwd: repoRoot,
    });
    const client = new Client({ name: "pdf-test", version: "0.1.0" });
    await client.connect(transport);

    try {
      const response = await client.callTool({
        name: "capture_pdf_artifact",
        arguments: {
          repo_path: hostDir,
          path: pdfPath,
        },
      });
      const result = (response.structuredContent as { result: { notePath: string } }).result;
      const note = await readFile(path.join(hostDir, result.notePath), "utf8");

      expect(note).toContain("# Example PDF");
      expect(note).toContain("## Structure");
      expect(note).toContain("Key result one.");
    } finally {
      await client.close();
    }
  }, 30000);
});
