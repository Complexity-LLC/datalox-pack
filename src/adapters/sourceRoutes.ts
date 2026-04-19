import { stat } from "node:fs/promises";
import path from "node:path";

import { describeCapturedPdfNote, ensurePdfArtifact } from "../core/pdfCapture.js";

export interface SourceRouteResolution {
  kind: "pdf";
  guidance: {
    workflow: string;
    selectionBasis: string;
    matchedSkillId: string | null;
    whyMatched: string[];
    whatToDoNow: string[];
    watchFor: string[];
    nextReads: string[];
    supportingNotes: Array<{
      path: string;
      title: string;
      whenToUse: string | null;
      signal: string | null;
      interpretation: string | null;
      action: string | null;
      examples: string[];
    }>;
  };
}

const QUOTED_PDF_PATH_PATTERN = /`([^`\n]+\.pdf)`|"([^"\n]+\.pdf)"|'([^'\n]+\.pdf)'/gi;
const BARE_PDF_PATH_PATTERN = /(?:^|[\s([<{])((?:~\/|\.{1,2}\/|\/)?[^\s"'`)>}\]]+\.pdf)(?=$|[\s),.:;!?>\]}])/gi;

function expandHomePath(candidate: string): string {
  if (!candidate.startsWith("~/")) {
    return candidate;
  }
  const home = process.env.HOME;
  if (!home) {
    return candidate;
  }
  return path.join(home, candidate.slice(2));
}

function extractPdfPathCandidates(prompt: string): string[] {
  const matches = new Set<string>();
  for (const match of prompt.matchAll(QUOTED_PDF_PATH_PATTERN)) {
    const candidate = match.slice(1).find(Boolean);
    if (candidate) {
      matches.add(candidate);
    }
  }
  for (const match of prompt.matchAll(BARE_PDF_PATH_PATTERN)) {
    const candidate = match[1];
    if (candidate && !candidate.includes("://")) {
      matches.add(candidate);
    }
  }
  return [...matches];
}

async function resolveExistingPdfPaths(repoPath: string, prompt: string): Promise<string[]> {
  const candidates = extractPdfPathCandidates(prompt);
  const resolved = await Promise.all(
    candidates.map(async (candidate) => {
      const expanded = expandHomePath(candidate);
      const absolutePath = path.isAbsolute(expanded)
        ? path.resolve(expanded)
        : path.resolve(repoPath, expanded);
      try {
        const fileStats = await stat(absolutePath);
        return fileStats.isFile() ? absolutePath : null;
      } catch {
        return null;
      }
    }),
  );
  return [...new Set(resolved.filter((value): value is string => value !== null))];
}

export async function resolveSourceRoute(input: {
  repoPath: string;
  prompt: string;
}): Promise<SourceRouteResolution | null> {
  const pdfPaths = await resolveExistingPdfPaths(input.repoPath, input.prompt);
  if (pdfPaths.length === 0) {
    return null;
  }

  const captures = await Promise.all(
    pdfPaths.map((pdfPath) => ensurePdfArtifact({
      repoPath: input.repoPath,
      path: pdfPath,
    })),
  );
  const notes = captures.map((capture) => describeCapturedPdfNote(capture));
  const primaryNote = notes[0];
  const primaryCapture = captures[0];

  return {
    kind: "pdf",
    guidance: {
      workflow: "pdf_capture",
      selectionBasis: "source_kind_pdf",
      matchedSkillId: null,
      whyMatched: [
        pdfPaths.length === 1
          ? `Prompt referenced a concrete PDF path: ${pdfPaths[0]}`
          : `Prompt referenced ${pdfPaths.length} concrete PDF paths.`,
        "PDF inputs should be captured into repo-local notes before generic repo-context skill matching.",
      ],
      whatToDoNow: [
        `Read ${primaryNote.notePath} before answering from the document.`,
        `Read ${primaryCapture.metadataPath} for normalized page evidence and section labels before extracting exact values.`,
        ...(notes.length > 1
          ? [`Cross-check the other captured PDF notes and metadata files: ${captures.slice(1).map((capture) => `${capture.notePath} + ${capture.metadataPath}`).join(", ")}`]
          : []),
      ],
      watchFor: [
        "The task depends on document evidence rather than the repo's default skill match.",
        "Prefer the normalized metadata JSON over reopening or dumping binary PDF content.",
        "Extract exact values only when the metadata page text shows a real unit or explicit procedure sentence.",
      ],
      nextReads: captures.flatMap((capture) => [capture.notePath, capture.metadataPath]),
      supportingNotes: notes.map((note) => ({
        path: note.notePath,
        title: note.title,
        whenToUse: note.whenToUse,
        signal: note.signal,
        interpretation: note.interpretation,
        action: note.action,
        examples: note.examples,
      })),
    },
  };
}
