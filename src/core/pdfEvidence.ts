export type PdfFactField =
  | "volume"
  | "time"
  | "temperature"
  | "concentration"
  | "dose"
  | "cell_density"
  | "speed"
  | "count"
  | "percent"
  | "other";

export interface PdfOperationalFact {
  page: number;
  section: string;
  field: PdfFactField;
  raw: string;
  value: string;
  unit: string | null;
  subject: string | null;
  action: string | null;
  context: string;
}

export interface PdfProcedureFragment {
  page: number;
  section: string;
  text: string;
}

export interface PdfSectionSpan {
  title: string;
  startPage: number;
  endPage: number;
  summary: string;
}

export interface PdfEvidenceBundle {
  headings: string[];
  sections: Array<{ title: string; text: string }>;
  textSnippets: string[];
  operationalFacts: PdfOperationalFact[];
  procedureFragments: PdfProcedureFragment[];
  sectionMap: PdfSectionSpan[];
}

interface NormalizedPage {
  number: number;
  section: string;
  text: string;
  sentences: string[];
}

const CONTROL_TEXT_PATTERN = /[\u0000-\u001F\u007F]/g;
const WHITESPACE_PATTERN = /\s+/g;
const PROCEDURE_VERB_PATTERN = /\b(?:add(?:ed)?|adjust(?:ed)?|aliquot(?:ed)?|centrifug(?:e|ed)|collect(?:ed)?|concentrat(?:e|ed)|cultiv(?:ate|ated)|culture(?:d)?|dilut(?:e|ed)|electroporat(?:e|ed)|elut(?:e|ed)|fix(?:ed)?|harvest(?:ed)?|incubat(?:e|ed)|inject(?:ed)?|isolat(?:e|ed)|lyse(?:d)?|mix(?:ed)?|pellet(?:ed)?|permeabiliz(?:e|ed)|plate(?:d)?|prepare(?:d)?|pulse(?:d)?|resuspend(?:ed)?|seed(?:ed)?|separat(?:e|ed)|spin|spun|stain(?:ed)?|store(?:d)?|suspend(?:ed)?|thaw(?:ed)?|transduc(?:e|ed)|treat(?:ed)?|wash(?:ed)?)\b/i;
const FACT_VALUE_PATTERN = String.raw`(?:\d+(?:\.\d+)?(?:\s?(?:x|×)\s?10\^?\d+)?(?:e[+-]?\d+)?)`;
const FACT_UNIT_PATTERN = String.raw`(?:mg\/kg|ug\/kg|µg\/kg|μg\/kg|ng\/kg|mg\/mL|ug\/mL|µg\/mL|μg\/mL|ng\/mL|IU\/mL|TU\/mL|PFU\/mL|cells\/mL|cells\/well|cells|mL|uL|µL|μL|nL|L|nM|uM|µM|μM|mM|MOI|rpm|(?:x|×)\s?g|g|kg|days?|d|weeks?|wks?|wk|hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?|sec|s|°C|C|%|ng|ug|µg|μg|mg)`;
const NUMBER_UNIT_PATTERN = new RegExp(`\\b(${FACT_VALUE_PATTERN})\\s*(${FACT_UNIT_PATTERN})(?=$|\\s|[),.;:])`, "gi");
const MOI_PATTERN = new RegExp(`\\bMOI\\s*(?:of|=)?\\s*(${FACT_VALUE_PATTERN})\\b`, "gi");

const FULL_TEXT_REMOVALS: RegExp[] = [
  /As a library, NLM provides access to scientific literature\.\s*/gi,
  /Inclusion in an NLM database does not imply endorsement of, or agreement with, the contents by NLM or the National Institutes of Health\.\s*/gi,
  /Learn more:\s*PMC Disclaimer\s*\|\s*PMC Copyright Notice\s*/gi,
  /Articles from .*? are provided here courtesy of .*$/gim,
];

const LINE_DROP_PATTERNS: RegExp[] = [
  /^author information$/i,
  /^article notes$/i,
  /^copyright and license information$/i,
  /^pmcid:\s*/i,
  /^pmid:\s*/i,
  /^\[doi.*$/i,
  /^\[pubmed.*$/i,
  /^\[google scholar.*$/i,
  /^associated data$/i,
];

const SECTION_MATCHERS: Array<{ title: string; pattern: RegExp }> = [
  { title: "Supplementary Materials", pattern: /\b(?:supplementary materials?|appendix|supplementary methods?|supplementary figures?|supplementary tables?)\b/i },
  { title: "Methods", pattern: /\b(?:materials and methods|methods|experimental procedures?|method details?)\b/i },
  { title: "Results and Discussion", pattern: /\bresults and discussion\b/i },
  { title: "Results", pattern: /\bresults\b/i },
  { title: "Discussion", pattern: /\bdiscussion\b/i },
  { title: "Conclusion", pattern: /\bconclusions?\b/i },
  { title: "Abstract", pattern: /\babstract\b/i },
  { title: "Introduction", pattern: /\bintroduction\b/i },
  { title: "Figure Legends", pattern: /\b(?:figure legends?|fig\.?\s*s?\d+)\b/i },
  { title: "Tables", pattern: /\btable\s*s?\d+\b/i },
  { title: "Data Availability", pattern: /\bdata availability\b/i },
  { title: "References", pattern: /\breferences\b/i },
  { title: "Acknowledgments", pattern: /\backnowledg(?:e)?ments?\b/i },
];

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(WHITESPACE_PATTERN, " ").trim();
}

function normalizePdfText(value: string): string {
  let normalized = value.replace(CONTROL_TEXT_PATTERN, " ");
  normalized = normalized.replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2");
  for (const pattern of FULL_TEXT_REMOVALS) {
    normalized = normalized.replace(pattern, " ");
  }
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => compactText(line))
    .filter(Boolean)
    .filter((line) => !LINE_DROP_PATTERNS.some((pattern) => pattern.test(line)));
  return compactText(lines.join(" "));
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => compactText(sentence))
    .filter((sentence) => sentence.length >= 20);
}

function detectSection(text: string, previousSection: string | null): string {
  const earlyWindow = text.slice(0, 1500);
  for (const matcher of SECTION_MATCHERS) {
    if (matcher.pattern.test(earlyWindow)) {
      return matcher.title;
    }
  }
  return previousSection ?? "Document";
}

function isReferenceLike(sentence: string): boolean {
  return /\bet al\.\b/i.test(sentence)
    || /\b(?:pmid|doi)\b/i.test(sentence)
    || /\b(?:vol\.|pp\.|proc\.|journal|pubmed|google scholar)\b/i.test(sentence);
}

function classifyUnit(unit: string): PdfFactField {
  const normalized = unit.toLowerCase().replace(/\s+/g, "");
  if (normalized === "%" ) {
    return "percent";
  }
  if (normalized === "ml" || normalized === "ul" || normalized === "µl" || normalized === "μl" || normalized === "nl" || normalized === "l") {
    return "volume";
  }
  if (normalized === "nm" || normalized === "um" || normalized === "µm" || normalized === "μm" || normalized === "mm" || normalized.endsWith("/ml")) {
    return normalized.includes("cells/") ? "cell_density" : "concentration";
  }
  if (normalized === "moi" || normalized.endsWith("/kg")) {
    return "dose";
  }
  if (normalized === "rpm" || normalized === "xg" || normalized === "×g") {
    return "speed";
  }
  if (normalized === "days" || normalized === "day" || normalized === "d" || normalized === "weeks" || normalized === "wks" || normalized === "wk" || normalized === "hours" || normalized === "hour" || normalized === "hrs" || normalized === "hr" || normalized === "h" || normalized === "minutes" || normalized === "minute" || normalized === "mins" || normalized === "min" || normalized === "seconds" || normalized === "second" || normalized === "secs" || normalized === "sec" || normalized === "s") {
    return "time";
  }
  if (normalized === "°c" || normalized === "c") {
    return "temperature";
  }
  if (normalized === "cells" || normalized === "cells/well") {
    return "count";
  }
  return "other";
}

function inferAction(sentence: string): string | null {
  const matches = [...sentence.matchAll(new RegExp(PROCEDURE_VERB_PATTERN.source, "gi"))];
  if (matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1][0].toLowerCase();
}

function inferSubject(sentence: string, action: string | null): string | null {
  if (!action) {
    return null;
  }
  const lowerSentence = sentence.toLowerCase();
  const actionIndex = lowerSentence.lastIndexOf(action.toLowerCase());
  if (actionIndex <= 0) {
    return null;
  }
  const prefix = sentence
    .slice(0, actionIndex)
    .replace(/[(),]/g, " ")
    .replace(/\b(?:then|and|or|were|was|are|is|be|been|being|to|for|with|in|at|of|the|a|an|by|from|using|after|before|into|onto|on)\b/gi, " ");
  const tokens = prefix
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.slice(-4).join(" ");
}

function shouldKeepFact(section: string, sentence: string, action: string | null): boolean {
  if (section === "References") {
    return false;
  }
  if (isReferenceLike(sentence)) {
    return false;
  }
  if (action) {
    return true;
  }
  return section === "Methods"
    || section === "Supplementary Materials"
    || section === "Figure Legends"
    || section === "Tables"
    || section === "Results"
    || section === "Results and Discussion";
}

function collectFactsFromSentence(page: number, section: string, sentence: string): PdfOperationalFact[] {
  const action = inferAction(sentence);
  if (!shouldKeepFact(section, sentence, action)) {
    return [];
  }
  const subject = inferSubject(sentence, action);
  const facts: PdfOperationalFact[] = [];
  for (const match of sentence.matchAll(NUMBER_UNIT_PATTERN)) {
    const value = compactText(match[1]);
    const unit = compactText(match[2]);
    if (!value || !unit) {
      continue;
    }
    facts.push({
      page,
      section,
      field: classifyUnit(unit),
      raw: compactText(match[0]),
      value,
      unit,
      subject,
      action,
      context: sentence,
    });
  }
  for (const match of sentence.matchAll(MOI_PATTERN)) {
    const value = compactText(match[1]);
    if (!value) {
      continue;
    }
    facts.push({
      page,
      section,
      field: "dose",
      raw: `MOI ${value}`,
      value,
      unit: "MOI",
      subject,
      action,
      context: sentence,
    });
  }
  return facts;
}

function dedupeFacts(facts: PdfOperationalFact[]): PdfOperationalFact[] {
  const seen = new Set<string>();
  const deduped: PdfOperationalFact[] = [];
  for (const fact of facts) {
    const key = [
      fact.page,
      fact.section,
      fact.field,
      fact.raw.toLowerCase(),
      fact.context.toLowerCase(),
    ].join("::");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(fact);
  }
  return deduped;
}

function dedupeFragments(fragments: PdfProcedureFragment[]): PdfProcedureFragment[] {
  const seen = new Set<string>();
  const deduped: PdfProcedureFragment[] = [];
  for (const fragment of fragments) {
    const key = `${fragment.page}::${fragment.section}::${fragment.text.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(fragment);
  }
  return deduped;
}

function buildSectionMap(pages: NormalizedPage[]): PdfSectionSpan[] {
  const spans: PdfSectionSpan[] = [];
  for (const page of pages) {
    const summary = page.sentences.find((sentence) => !isReferenceLike(sentence)) ?? page.text.slice(0, 240);
    const previous = spans[spans.length - 1];
    if (previous && previous.title === page.section) {
      previous.endPage = page.number;
      if (!previous.summary && summary) {
        previous.summary = summary;
      }
      continue;
    }
    spans.push({
      title: page.section,
      startPage: page.number,
      endPage: page.number,
      summary,
    });
  }
  return spans;
}

function buildHeadings(sectionMap: PdfSectionSpan[]): string[] {
  return [...new Set(sectionMap.map((span) => span.title).filter(Boolean))].slice(0, 12);
}

function buildTextSnippets(pages: NormalizedPage[]): string[] {
  const snippets: string[] = [];
  for (const section of ["Abstract", "Methods", "Results", "Supplementary Materials", "Discussion", "Document"]) {
    for (const page of pages) {
      if (page.section !== section) {
        continue;
      }
      for (const sentence of page.sentences) {
        if (isReferenceLike(sentence)) {
          continue;
        }
        snippets.push(sentence);
        if (snippets.length >= 8) {
          return [...new Set(snippets)];
        }
      }
    }
  }
  return [...new Set(snippets)];
}

function buildSections(sectionMap: PdfSectionSpan[]): Array<{ title: string; text: string }> {
  return sectionMap.map((section) => ({
    title: section.startPage === section.endPage
      ? `${section.title} (page ${section.startPage})`
      : `${section.title} (pages ${section.startPage}-${section.endPage})`,
    text: section.summary,
  }));
}

export function extractPdfEvidence(input: {
  pageCount: number;
  pages: Array<{ number: number; text: string }>;
}): PdfEvidenceBundle {
  let currentSection: string | null = null;
  const normalizedPages: NormalizedPage[] = input.pages
    .map((page) => {
      const text = normalizePdfText(page.text);
      if (!text) {
        return null;
      }
      currentSection = detectSection(text, currentSection);
      return {
        number: page.number,
        section: currentSection,
        text,
        sentences: splitSentences(text),
      };
    })
    .filter((page): page is NormalizedPage => page !== null);

  const sectionMap = buildSectionMap(normalizedPages);
  const headings = buildHeadings(sectionMap);
  const textSnippets = buildTextSnippets(normalizedPages);

  const operationalFacts = dedupeFacts(
    normalizedPages.flatMap((page) =>
      page.sentences.flatMap((sentence) => collectFactsFromSentence(page.number, page.section, sentence)),
    ),
  );

  const procedureFragments = dedupeFragments(
    normalizedPages.flatMap((page) =>
      page.sentences
        .filter((sentence) => page.section !== "References")
        .filter((sentence) => PROCEDURE_VERB_PATTERN.test(sentence))
        .filter((sentence) => !isReferenceLike(sentence))
        .map((sentence) => ({
          page: page.number,
          section: page.section,
          text: sentence,
        })),
    ),
  ).slice(0, 80);

  return {
    headings,
    sections: buildSections(sectionMap),
    textSnippets,
    operationalFacts,
    procedureFragments,
    sectionMap,
  };
}
