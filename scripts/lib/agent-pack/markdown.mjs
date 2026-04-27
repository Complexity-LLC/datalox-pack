import path from "node:path";
import { runInNewContext } from "node:vm";

const WIKI_PAGE_TYPES = ["note", "meta", "source", "concept", "comparison", "question"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function firstNonEmpty(values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function toInteger(value, fallback = 0) {
  if (Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return fallback;
}

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeFrontmatterValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFrontmatterValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        toCamelCase(key),
        normalizeFrontmatterValue(nestedValue),
      ]),
    );
  }

  return value;
}

function parseFlowLiteral(rawValue) {
  return normalizeFrontmatterValue(
    runInNewContext(`(${rawValue})`, Object.create(null), { timeout: 100 }),
  );
}

function parseFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseFlowLiteral(trimmed);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function collectFlowBlock(lines, startIndex, indentLevel) {
  let index = startIndex;
  let depth = 0;
  let inString = false;
  let stringQuote = null;
  let escaped = false;
  const blockLines = [];

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() && blockLines.length === 0) {
      index += 1;
      continue;
    }

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (blockLines.length > 0 && indent < indentLevel && depth <= 0) {
      break;
    }

    const content = line.slice(Math.min(indentLevel, indent));
    blockLines.push(content);

    for (const char of content) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (inString) {
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === stringQuote) {
          inString = false;
          stringQuote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringQuote = char;
        continue;
      }

      if (char === "{" || char === "[") {
        depth += 1;
        continue;
      }

      if (char === "}" || char === "]") {
        depth -= 1;
      }
    }

    index += 1;
    if (blockLines.length > 0 && depth <= 0) {
      break;
    }
  }

  return {
    value: parseFlowLiteral(blockLines.join("\n")),
    nextIndex: index,
  };
}

function parseFrontmatterBlock(lines, startIndex, indentLevel) {
  let index = startIndex;
  const values = [];
  const object = {};
  let mode = null;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent < indentLevel) {
      break;
    }

    const content = line.slice(indent);
    if (content.startsWith("- ")) {
      if (mode === null) mode = "array";
      if (mode !== "array") {
        throw new Error("Invalid frontmatter: cannot mix array and object entries in one block");
      }
      values.push(parseFrontmatterScalar(content.slice(2)));
      index += 1;
      continue;
    }

    const match = content.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${content}`);
    }

    if (mode === null) mode = "object";
    if (mode !== "object") {
      throw new Error("Invalid frontmatter: cannot mix object and array entries in one block");
    }

    const [, key, rawValue = ""] = match;
    if (rawValue.trim()) {
      object[toCamelCase(key)] = parseFrontmatterScalar(rawValue);
      index += 1;
      continue;
    }

    let nestedStartIndex = index + 1;
    while (nestedStartIndex < lines.length && !lines[nestedStartIndex].trim()) {
      nestedStartIndex += 1;
    }
    const nestedLine = lines[nestedStartIndex];
    const nestedIndent = nestedLine?.match(/^ */)?.[0].length ?? 0;
    const nestedContent = nestedLine ? nestedLine.slice(Math.min(indent + 2, nestedIndent)).trim() : "";
    if (nestedContent.startsWith("{") || nestedContent.startsWith("[")) {
      const nested = collectFlowBlock(lines, nestedStartIndex, indent + 2);
      object[toCamelCase(key)] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    const nested = parseFrontmatterBlock(lines, index + 1, indent + 2);
    object[toCamelCase(key)] = nested.value;
    index = nested.nextIndex;
  }

  return {
    value: mode === "array" ? values : object,
    nextIndex: index,
  };
}

export function parseFrontmatter(rawFrontmatter) {
  const lines = rawFrontmatter.split("\n");
  const result = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const [, key, rawValue = ""] = match;
    if (rawValue.trim()) {
      result[toCamelCase(key)] = parseFrontmatterScalar(rawValue);
      index += 1;
      continue;
    }

    let nestedStartIndex = index + 1;
    while (nestedStartIndex < lines.length && !lines[nestedStartIndex].trim()) {
      nestedStartIndex += 1;
    }
    const nestedLine = lines[nestedStartIndex];
    const nestedIndent = nestedLine?.match(/^ */)?.[0].length ?? 0;
    const nestedContent = nestedLine ? nestedLine.slice(Math.min(2, nestedIndent)).trim() : "";
    if (nestedContent.startsWith("{") || nestedContent.startsWith("[")) {
      const nested = collectFlowBlock(lines, nestedStartIndex, 2);
      result[toCamelCase(key)] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    const nested = parseFrontmatterBlock(lines, index + 1, 2);
    result[toCamelCase(key)] = nested.value;
    index = nested.nextIndex;
  }

  return result;
}

export function splitFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: normalized.trim(),
    };
  }

  const endMarker = "\n---\n";
  const endIndex = normalized.indexOf(endMarker, 4);
  if (endIndex === -1) {
    throw new Error("Skill markdown is missing closing frontmatter fence");
  }

  return {
    frontmatter: parseFrontmatter(normalized.slice(4, endIndex)),
    body: normalized.slice(endIndex + endMarker.length).trim(),
  };
}

export function inferSkillNameFromPath(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === "skill.md") {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(filePath, path.extname(filePath));
}

export function parseSkillDoc(filePath, content) {
  const { frontmatter, body } = splitFrontmatter(content);
  const heading = body.split("\n").find((line) => line.startsWith("# "))?.replace(/^# /, "").trim();
  const metadata = isRecord(frontmatter.metadata) ? frontmatter.metadata : {};
  const datalox = isRecord(metadata.datalox) ? metadata.datalox : {};
  const name = frontmatter.name ?? inferSkillNameFromPath(filePath);
  const displayName = datalox.displayName ?? frontmatter.displayName ?? heading ?? name;
  const notePaths = toArray(
    datalox.notePaths
    ?? datalox.note_paths
    ?? frontmatter.notePaths
    ?? frontmatter.note_paths
    ?? datalox.patternPaths
    ?? datalox.pattern_paths
    ?? frontmatter.patternPaths
    ?? frontmatter.pattern_paths,
  );

  return {
    id: datalox.id ?? frontmatter.id ?? name,
    name,
    displayName,
    workflow: datalox.workflow ?? frontmatter.workflow ?? null,
    trigger: datalox.trigger ?? frontmatter.trigger ?? "",
    description: frontmatter.description ?? "",
    notePaths,
    repoHints: isRecord(datalox.repoHints)
      ? datalox.repoHints
      : isRecord(frontmatter.repoHints)
        ? frontmatter.repoHints
        : undefined,
    tags: toArray(datalox.tags ?? frontmatter.tags),
    status: datalox.status ?? frontmatter.status ?? "generated",
    maturity: datalox.maturity ?? frontmatter.maturity ?? "stable",
    evidenceCount: toInteger(datalox.evidenceCount, toInteger(frontmatter.evidenceCount, 0)),
    lastUsedAt: datalox.lastUsedAt ?? frontmatter.lastUsedAt ?? null,
    author: datalox.author ?? frontmatter.author ?? null,
    updatedAt: datalox.updatedAt ?? frontmatter.updatedAt ?? null,
    body,
  };
}

export function hasMarkdownSection(body, sectionName) {
  const pattern = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  return pattern.test(body);
}

function inferWikiPageType(relativePath, frontmatterType) {
  if (typeof frontmatterType === "string" && WIKI_PAGE_TYPES.includes(frontmatterType)) {
    return frontmatterType;
  }
  if (relativePath.includes("/notes/")) return "note";
  if (relativePath.includes("/meta/")) return "meta";
  if (relativePath.includes("/sources/")) return "source";
  if (relativePath.includes("/concepts/")) return "concept";
  if (relativePath.includes("/comparisons/")) return "comparison";
  if (relativePath.includes("/questions/")) return "question";
  if (relativePath.includes("/patterns/")) return "note";
  return "note";
}

function normalizeSectionList(lines = []) {
  return lines
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function normalizeFrontmatterRefs(value) {
  return unique(
    toArray(value)
      .map((item) => String(item).trim())
      .filter(Boolean),
  );
}

function extractMarkdownSections(body) {
  const lines = body.split("\n");
  const metadata = {};
  let activeSection = null;
  const sections = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const metadataMatch = line.match(/^- ([^:]+):\s*(.+)$/);
    if (metadataMatch && activeSection === null) {
      metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2];
      continue;
    }

    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      activeSection = sectionMatch[1].toLowerCase();
      if (!sections[activeSection]) {
        sections[activeSection] = [];
      }
      continue;
    }

    if (activeSection) {
      sections[activeSection].push(line);
    }
  }

  return { lines, metadata, sections };
}

export function parseWikiDoc(relativePath, content, includeContent) {
  const { frontmatter, body } = splitFrontmatter(content);
  const { lines, metadata, sections } = extractMarkdownSections(body);
  const title = frontmatter.title
    ?? lines.find((line) => line.startsWith("# "))?.replace(/^# /, "").trim()
    ?? path.basename(relativePath, ".md");
  const pageType = inferWikiPageType(relativePath, frontmatter.type);
  const related = unique([
    ...normalizeFrontmatterRefs(frontmatter.related),
    ...normalizeSectionList(sections.related),
  ]);
  const sources = unique([
    ...normalizeFrontmatterRefs(frontmatter.sources),
    ...normalizeSectionList(sections.sources),
  ]);
  const evidenceLines = normalizeSectionList(sections.evidence);
  const contradictionLines = [
    ...(sections.contradictions ?? []).map((line) => line.trim()).filter(Boolean),
    ...(body.includes("[!contradiction]") ? ["contradiction_callout_present"] : []),
  ];
  const summary = firstNonEmpty([
    (sections.overview ?? []).join(" ").trim(),
    (sections.definition ?? []).join(" ").trim(),
    (sections.answer ?? []).join(" ").trim(),
    (sections.verdict ?? []).join(" ").trim(),
    (sections["recommended action"] ?? []).join(" ").trim(),
    (sections.interpretation ?? []).join(" ").trim(),
    (sections.signal ?? []).join(" ").trim(),
  ]);

  return {
    path: relativePath,
    pageType,
    title,
    summary,
    frontmatter,
    metadata,
    body,
    sections,
    workflow: frontmatter.workflow ?? metadata.workflow ?? null,
    skillId: frontmatter.skill ?? metadata.skill ?? null,
    tags: Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map((value) => String(value).trim()).filter(Boolean)
      : metadata.tags
        ? String(metadata.tags).split(",").map((value) => value.trim()).filter(Boolean)
        : [],
    author: frontmatter.author ?? metadata.author ?? null,
    updatedAt: frontmatter.updated ?? metadata.updated ?? null,
    reviewAfter: frontmatter.reviewAfter ?? frontmatter.review_after ?? metadata.review_after ?? null,
    confidence: frontmatter.confidence ?? null,
    status: frontmatter.status ?? metadata.status ?? "active",
    related,
    sources,
    evidenceLines,
    contradictionLines,
    content: includeContent ? content : null,
  };
}

export function parseNoteDoc(relativePath, content, includeContent) {
  const page = parseWikiDoc(relativePath, content, includeContent);
  const { sections } = page;
  const signal = (sections.signal ?? []).join(" ").trim();
  const whenToUse = (
    sections["when to use"]
    ?? sections["when-to-use"]
    ?? []
  ).join(" ").trim();
  const interpretation = (sections.interpretation ?? []).join(" ").trim();
  const action = (
    sections.action
    ?? sections["recommended action"]
    ?? sections.action
    ?? []
  ).join(" ").trim();
  const examples = (
    sections.examples
    ?? []
  )
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  const doNot = (
    sections["do not"]
    ?? sections.donot
    ?? []
  ).join(" ").trim();
  const exceptions = (sections.exceptions ?? []).join(" ").trim();
  const evidence = page.evidenceLines.join(" ").trim();
  const summary = page.summary ?? action ?? interpretation ?? signal;

  return {
    path: relativePath,
    id: page.frontmatter.id ?? null,
    pageType: page.pageType,
    kind: page.frontmatter.kind ?? null,
    title: page.title,
    summary,
    workflow: page.workflow,
    skillId: page.skillId,
    tags: page.tags,
    author: page.author,
    updatedAt: page.updatedAt,
    reviewAfter: page.reviewAfter,
    confidence: page.confidence,
    status: page.status,
    usage: isRecord(page.frontmatter.usage) ? page.frontmatter.usage : null,
    sources: page.sources,
    related: page.related,
    contradictionLines: page.contradictionLines,
    evidenceLines: page.evidenceLines,
    whenToUse,
    signal,
    interpretation,
    action,
    doNot,
    exceptions,
    examples,
    evidence,
    content: page.content,
  };
}
