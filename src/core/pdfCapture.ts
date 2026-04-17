import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
    textSnippets: string[];
  };
}

export interface PdfCaptureNoteSummary {
  title: string;
  notePath: string;
  whenToUse: string;
  signal: string;
  interpretation: string;
  action: string;
  examples: string[];
}

const CONTROL_TEXT_PATTERN = /[\u0000-\u001F\u007F]/g;

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath ?? process.cwd());
}

function slugify(value: string): string {
  const normalized = normalizeTitleCandidate(value);
  if (!normalized) {
    return "";
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeTitleCandidate(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .replace(CONTROL_TEXT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function chooseTitle(input: {
  explicitTitle?: string;
  parsedTitle?: string | null;
  extractedTitle?: string | null;
  sourcePath: string;
  slug: string;
}): string {
  return normalizeTitleCandidate(input.explicitTitle)
    || normalizeTitleCandidate(input.parsedTitle)
    || normalizeTitleCandidate(input.extractedTitle)
    || normalizeTitleCandidate(path.basename(input.sourcePath, path.extname(input.sourcePath)))
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

function readableList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function firstNonEmptyLine(value: string): string | null {
  for (const line of value.split(/\r?\n/)) {
    const normalized = normalizeTitleCandidate(line);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function chooseSlug(input: {
  explicitSlug?: string;
  explicitTitle?: string;
  parsedTitle?: string | null;
  extractedTitle?: string | null;
  sourcePath: string;
}): string {
  const candidates = [
    input.explicitSlug,
    input.explicitTitle,
    input.parsedTitle,
    input.extractedTitle,
    path.basename(input.sourcePath, path.extname(input.sourcePath)),
  ]
    .map((value) => normalizeTitleCandidate(value))
    .filter((value): value is string => value !== null);

  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (slug) {
      return slug;
    }
  }
  return "document";
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
  const summary = buildPdfCaptureNoteSummary(input);

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
    summary.whenToUse,
    "",
    "## Signal",
    "",
    summary.signal,
    "",
    "## Interpretation",
    "",
    summary.interpretation,
    "",
    "## Action",
    "",
    summary.action,
    "",
    "## Examples",
    "",
    ...formatList(summary.examples, "No extracted examples."),
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

function buildPdfCaptureNoteSummary(input: {
  title: string;
  sourcePath: string;
  sourceUrl: string | null;
  notePath: string;
  pageCount: number;
  headings: string[];
  textSnippets: string[];
}): PdfCaptureNoteSummary {
  const keyHeadings = input.headings.slice(0, 3);
  const keySnippets = input.textSnippets.slice(0, 3);
  const headingPhrase = keyHeadings.length > 0
    ? readableList(keyHeadings)
    : `${input.pageCount} extracted PDF page${input.pageCount === 1 ? "" : "s"}`;
  const sourceDescriptor = input.sourceUrl ?? input.sourcePath;

  return {
    title: input.title,
    notePath: input.notePath,
    whenToUse: `Use this note when the task depends on claims, terminology, or structure from ${input.title}.`,
    signal: `Captured ${input.pageCount} page(s) from ${sourceDescriptor}, centered on ${headingPhrase}.`,
    interpretation: keySnippets.length > 0
      ? `The document's reusable value is concentrated in ${headingPhrase}, with concrete excerpts such as "${keySnippets[0]}".`
      : `The document's reusable value is concentrated in ${headingPhrase}.`,
    action: `Use the extracted headings, snippets, and page structure below before summarizing, citing, or turning ${input.title} into implementation guidance.`,
    examples: input.textSnippets.slice(0, 5),
  };
}

export function describeCapturedPdfNote(input: CapturePdfResult): PdfCaptureNoteSummary {
  return buildPdfCaptureNoteSummary({
    title: input.capture.title,
    sourcePath: input.sourcePath,
    sourceUrl: input.sourceUrl,
    notePath: input.notePath,
    pageCount: input.capture.pageCount,
    headings: input.capture.headings,
    textSnippets: input.capture.textSnippets,
  });
}

interface StoredPdfCapture {
  relativeMetadataPath: string;
  absoluteMetadataPath: string;
  metadata: PdfCaptureMetadata;
}

async function readStoredPdfCaptures(repoPath: string): Promise<StoredPdfCapture[]> {
  const noteDir = path.join(repoPath, "agent-wiki", "notes", "pdf");
  try {
    const entries = await readdir(noteDir);
    const loaded = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".capture.json"))
        .map(async (entry) => {
          const absoluteMetadataPath = path.join(noteDir, entry);
          try {
            const parsed = JSON.parse(await readFile(absoluteMetadataPath, "utf8")) as Partial<PdfCaptureMetadata>;
            if (
              parsed.version !== 1
              || typeof parsed.sourcePath !== "string"
              || typeof parsed.notePath !== "string"
              || typeof parsed.title !== "string"
              || typeof parsed.pageCount !== "number"
              || !Array.isArray(parsed.headings)
              || !Array.isArray(parsed.textSnippets)
            ) {
              return null;
            }
            return {
              relativeMetadataPath: path.relative(repoPath, absoluteMetadataPath) || absoluteMetadataPath,
              absoluteMetadataPath,
              metadata: parsed as PdfCaptureMetadata,
            };
          } catch {
            return null;
          }
        }),
    );
    return loaded.filter((entry): entry is StoredPdfCapture => entry !== null);
  } catch {
    return [];
  }
}

async function isStoredPdfCaptureFresh(
  absolutePdfPath: string,
  absoluteMetadataPath: string,
  absoluteNotePath: string,
): Promise<boolean> {
  try {
    const [sourceStats, metadataStats, noteStats] = await Promise.all([
      stat(absolutePdfPath),
      stat(absoluteMetadataPath),
      stat(absoluteNotePath),
    ]);
    return metadataStats.mtimeMs >= sourceStats.mtimeMs && noteStats.mtimeMs >= sourceStats.mtimeMs;
  } catch {
    return false;
  }
}

async function findStoredPdfCapture(repoPath: string, absolutePdfPath: string): Promise<CapturePdfResult | null> {
  const normalizedSourcePath = normalizeRepoPath(repoPath, absolutePdfPath);
  const storedCaptures = await readStoredPdfCaptures(repoPath);
  for (const entry of storedCaptures) {
    if (entry.metadata.sourcePath !== normalizedSourcePath) {
      continue;
    }
    const absoluteNotePath = path.resolve(repoPath, entry.metadata.notePath);
    if (!await isStoredPdfCaptureFresh(absolutePdfPath, entry.absoluteMetadataPath, absoluteNotePath)) {
      continue;
    }
    return {
      repoPath,
      sourcePath: entry.metadata.sourcePath,
      sourceUrl: entry.metadata.sourceUrl ?? null,
      notePath: entry.metadata.notePath,
      metadataPath: entry.relativeMetadataPath,
      capture: {
        title: entry.metadata.title,
        pageCount: entry.metadata.pageCount,
        headings: entry.metadata.headings,
        textSnippets: entry.metadata.textSnippets,
      },
    };
  }
  return null;
}

async function capturePdfArtifactPrepared(repoPath: string, input: CapturePdfInput): Promise<CapturePdfResult> {
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

    const sourceSlug = chooseSlug({
      explicitSlug: input.slug,
      explicitTitle: input.title,
      parsedTitle: infoResult.info?.Title,
      extractedTitle,
      sourcePath: absolutePdfPath,
    });
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
        textSnippets: bundle.evidence.textSnippets,
      },
    };
  } finally {
    await parser.destroy();
  }
}

export async function capturePdfArtifact(input: CapturePdfInput): Promise<CapturePdfResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  await ensurePackReady(repoPath);
  return capturePdfArtifactPrepared(repoPath, input);
}

export async function ensurePdfArtifact(input: CapturePdfInput): Promise<CapturePdfResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  await ensurePackReady(repoPath);
  const absolutePdfPath = path.resolve(input.path);
  const existing = await findStoredPdfCapture(repoPath, absolutePdfPath);
  if (existing) {
    return existing;
  }
  return capturePdfArtifactPrepared(repoPath, input);
}
