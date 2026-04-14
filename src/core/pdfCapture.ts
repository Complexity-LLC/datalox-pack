import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFParse } from "pdf-parse";

import { autoBootstrapIfSafe, probeBootstrapCandidate, refreshControlArtifacts } from "./packCore.js";
import { extractPdfSource } from "./sourceBundle.js";

export interface CapturePdfInput {
  repoPath?: string;
  path: string;
  title?: string;
  slug?: string;
  sourceUrl?: string;
}

export interface PdfCaptureMetadata {
  version: 1;
  slug: string;
  sourcePath: string;
  sourceUrl: string | null;
  title: string;
  capturedAt: string;
  artifactType: "note";
  notePath: string;
  pageCount: number;
  headings: string[];
  sections: Array<{ title: string; text: string }>;
  textSnippets: string[];
}

export interface CapturePdfResult {
  repoPath: string;
  sourcePath: string;
  sourceUrl: string | null;
  notePath: string;
  metadataPath: string;
  capture: {
    title: string;
    pageCount: number;
    headings: string[];
  };
}

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath ?? process.cwd());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function chooseTitle(input: {
  explicitTitle?: string;
  parsedTitle?: string | null;
  extractedTitle?: string | null;
  sourcePath: string;
  slug: string;
}): string {
  return input.explicitTitle?.trim()
    || input.parsedTitle?.trim()
    || input.extractedTitle?.trim()
    || path.basename(input.sourcePath, path.extname(input.sourcePath))
    || input.slug;
}

function normalizeRepoPath(repoPath: string, targetPath: string): string {
  const absoluteTarget = path.resolve(targetPath);
  const relativePath = path.relative(repoPath, absoluteTarget);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return absoluteTarget;
}

function formatList(items: string[], emptyLine: string): string[] {
  if (items.length === 0) {
    return [`- ${emptyLine}`];
  }
  return items.map((item) => `- ${item}`);
}

function firstNonEmptyLine(value: string): string | null {
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

async function ensurePackReady(repoPath: string): Promise<void> {
  const probeBefore = await probeBootstrapCandidate(repoPath);
  if (probeBefore.canAutoBootstrap) {
    await autoBootstrapIfSafe({ repoPath });
  }
  const probeAfter = await probeBootstrapCandidate(repoPath);
  if (probeAfter.status !== "ready") {
    throw new Error(
      `Datalox repo is not ready for PDF capture: ${probeAfter.reasons.join("; ") || probeAfter.status}`,
    );
  }
}

function renderPdfNote(input: {
  title: string;
  sourcePath: string;
  sourceUrl: string | null;
  notePath: string;
  capturedAt: string;
  pageCount: number;
  headings: string[];
  sections: Array<{ title: string; text: string }>;
  textSnippets: string[];
}): string {
  return [
    "---",
    "type: note",
    "kind: pdf",
    `title: ${input.title}`,
    "workflow: pdf_capture",
    "status: active",
    input.sourceUrl ? "sources:" : "sources: []",
    ...(input.sourceUrl ? [`  - ${input.sourceUrl}`] : []),
    "related: []",
    `updated: ${input.capturedAt}`,
    "---",
    "",
    `# ${input.title}`,
    "",
    "## When to Use",
    "",
    "Use this note when a PDF should become repo-local knowledge another agent can act on without reopening the file first.",
    "",
    "## Signal",
    "",
    `Captured ${input.pageCount} PDF page(s) from ${input.sourceUrl ?? input.sourcePath}.`,
    "",
    "## Interpretation",
    "",
    "This note turns extracted PDF evidence into a reusable repo-local page instead of leaving the content trapped in a binary file.",
    "",
    "## Action",
    "",
    "Read this note before writing a workflow summary, extracting claims, or promoting the PDF knowledge into a skill-backed procedure.",
    "",
    "## Examples",
    "",
    ...formatList(input.textSnippets.slice(0, 5), "No extracted examples."),
    "",
    "## Evidence",
    "",
    `- Source path: ${input.sourcePath}`,
    ...(input.sourceUrl ? [`- Source URL: ${input.sourceUrl}`] : []),
    `- Note path: ${input.notePath}`,
    `- Captured at: ${input.capturedAt}`,
    `- Page count: ${input.pageCount}`,
    "",
    "## Related",
    "",
    "- Add follow-up notes or skills here when the PDF changes runtime behavior.",
    "",
    "## Structure",
    "",
    ...formatList(
      input.sections.map((section) => `${section.title}: ${section.text}`),
      "No structured sections detected.",
    ),
    "",
  ].join("\n");
}

export async function capturePdfArtifact(input: CapturePdfInput): Promise<CapturePdfResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  await ensurePackReady(repoPath);

  const absolutePdfPath = path.resolve(input.path);
  const pdfBuffer = await readFile(absolutePdfPath);
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  const capturedAt = new Date().toISOString();

  try {
    const infoResult = await parser.getInfo();
    const textResult = await parser.getText();
    const extractedTitle = textResult.pages
      .map((page) => firstNonEmptyLine(page.text))
      .find(Boolean) ?? null;

    const sourceSlug = slugify(
      input.slug
        ?? input.title
        ?? infoResult.info?.Title
        ?? extractedTitle
        ?? path.basename(absolutePdfPath, path.extname(absolutePdfPath)),
    );
    const title = chooseTitle({
      explicitTitle: input.title,
      parsedTitle: infoResult.info?.Title,
      extractedTitle,
      sourcePath: absolutePdfPath,
      slug: sourceSlug,
    });

    const noteDir = path.join(repoPath, "agent-wiki", "notes", "pdf");
    const notePath = path.join(noteDir, `${sourceSlug}.md`);
    const metadataPath = path.join(noteDir, `${sourceSlug}.capture.json`);
    await mkdir(noteDir, { recursive: true });

    const sourcePath = normalizeRepoPath(repoPath, absolutePdfPath);
    const bundle = extractPdfSource({
      id: sourceSlug,
      title,
      capturedAt,
      path: sourcePath,
      url: input.sourceUrl,
      pageCount: textResult.total,
      pages: textResult.pages.map((page) => ({
        number: page.num,
        text: page.text,
      })),
      citations: input.sourceUrl ? [{ label: input.sourceUrl, target: input.sourceUrl }] : undefined,
    });

    const relativeNotePath = path.relative(repoPath, notePath) || notePath;
    await writeFile(
      notePath,
      renderPdfNote({
        title,
        sourcePath,
        sourceUrl: input.sourceUrl ?? null,
        notePath: relativeNotePath,
        capturedAt,
        pageCount: textResult.total,
        headings: bundle.structure.headings,
        sections: bundle.structure.sections,
        textSnippets: bundle.evidence.textSnippets,
      }),
      "utf8",
    );

    const metadata: PdfCaptureMetadata = {
      version: 1,
      slug: sourceSlug,
      sourcePath,
      sourceUrl: input.sourceUrl ?? null,
      title,
      capturedAt,
      artifactType: "note",
      notePath: relativeNotePath,
      pageCount: textResult.total,
      headings: bundle.structure.headings,
      sections: bundle.structure.sections,
      textSnippets: bundle.evidence.textSnippets,
    };
    const relativeMetadataPath = path.relative(repoPath, metadataPath) || metadataPath;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    await refreshControlArtifacts({
      repoPath,
      logEntry: {
        action: "capture_pdf_artifact",
        detail: `${sourcePath} -> ${relativeNotePath}`,
        path: relativeNotePath,
      },
    });

    return {
      repoPath,
      sourcePath,
      sourceUrl: input.sourceUrl ?? null,
      notePath: relativeNotePath,
      metadataPath: relativeMetadataPath,
      capture: {
        title,
        pageCount: textResult.total,
        headings: bundle.structure.headings,
      },
    };
  } finally {
    await parser.destroy();
  }
}
