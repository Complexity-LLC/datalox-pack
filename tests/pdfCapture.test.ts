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

async function createSamplePdf(
  rootDir: string,
  options: {
    filename?: string;
    metadataTitle?: string;
    firstPageTitle?: string;
  } = {},
): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  if (typeof options.metadataTitle === "string") {
    pdf.setTitle(options.metadataTitle);
  }

  const first = pdf.addPage([612, 792]);
  first.drawText(options.firstPageTitle ?? "Example PDF", { x: 48, y: 740, size: 24, font });
  first.drawText("Abstract", { x: 48, y: 700, size: 18, font });
  first.drawText("Cells remained viable with >50% memory phenotype after scaffold treatment.", { x: 48, y: 676, size: 12, font });

  const second = pdf.addPage([612, 792]);
  second.drawText("Methods", { x: 48, y: 740, size: 24, font });
  second.drawText("Cells were resuspended in 5 mL RPMI and incubated at 37°C for 10 min.", { x: 48, y: 700, size: 12, font });
  second.drawText("The culture was supplemented with 200 uL cytokine mix at MOI 5.", { x: 48, y: 680, size: 12, font });

  const third = pdf.addPage([612, 792]);
  third.drawText("Supplementary Materials", { x: 48, y: 740, size: 24, font });
  third.drawText("Samples were washed with 1 mL buffer and plated at 1 x 10^6 cells/mL.", { x: 48, y: 700, size: 12, font });

  const pdfPath = path.join(rootDir, options.filename ?? "example.pdf");
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
    expect(payload.capture.pageCount).toBe(3);
    expect(payload.capture.title).toContain("Example");
    expect(note).toContain("## Signal");
    expect(note).toContain("## Agent Protocol");
    expect(note).toContain("## Operational Facts");
    expect(note).toContain("## Procedure Fragments");
    expect(note).toContain("Use this note when the task depends on claims, terminology, protocol parameters, assay conditions, or exact numeric values from Example PDF.");
    expect(note).toContain("5 mL");
    expect(note).toMatch(/37\s*°?C/);
    expect(note).toContain("200 uL");
    expect(note).toContain("MOI 5");
    expect(note).toContain("1 x 10^6 cells/mL");
    expect(note).toContain("Source URL: https://example.com/example.pdf");
    expect(note).toContain("Methods | page 2");
    expect(note).toContain("Supplementary Materials | page 3");
    expect(note).not.toContain("content trapped in a binary file");
    expect(spawnSync("test", ["-f", path.join(hostDir, payload.metadataPath)]).status).toBe(0);
  }, 60000);

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
      expect(note).toContain("## Operational Facts");
      expect(note).toContain("5 mL");
      expect(note).toContain("Prefer `Operational Facts` and `Procedure Fragments`");
    } finally {
      await client.close();
    }
  }, 60000);

  it("falls back to a later title candidate when the first slug candidate normalizes to empty", async () => {
    const hostDir = await createGitRepo();
    const pdfPath = await createSamplePdf(hostDir, {
      filename: "blank-metadata-title.pdf",
      metadataTitle: "   ",
      firstPageTitle: "Recovered English Title",
    });

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-pdf",
        "--repo",
        hostDir,
        "--path",
        pdfPath,
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
      capture: { title: string };
    };

    expect(payload.capture.title).toBe("Recovered English Title");
    expect(payload.notePath).toBe("agent-wiki/notes/pdf/recovered-english-title.md");
    expect(payload.metadataPath).toBe("agent-wiki/notes/pdf/recovered-english-title.capture.json");
  }, 60000);
});
