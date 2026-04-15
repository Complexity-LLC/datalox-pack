import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright";

import { autoBootstrapIfSafe, probeBootstrapCandidate, refreshControlArtifacts } from "./packCore.js";
import {
  extractWebSource,
  type PageSnapshot,
  type SourceBundle,
} from "./sourceBundle.js";

export type WebArtifactType = "design_doc" | "note" | "design_tokens" | "tailwind_theme" | "css_variables";
export type WebArtifactInputType = WebArtifactType | "source_page";

export interface CaptureWebInput {
  repoPath?: string;
  url: string;
  title?: string;
  slug?: string;
  artifactType?: WebArtifactInputType;
  outputPath?: string;
}

export interface CaptureWebResult {
  repoPath: string;
  url: string;
  artifactType: WebArtifactType;
  artifactPath: string | null;
  notePath: string;
  sourcePagePath: string;
  metadataPath: string;
  screenshotPaths: {
    desktop: string;
    mobile: string;
  };
  capture: {
    title: string;
    desktop: PageSnapshot;
    mobile: PageSnapshot;
  };
}

export interface WebCaptureMetadata {
  version: 1;
  slug: string;
  url: string;
  domain: string | null;
  title: string;
  capturedAt: string;
  artifactType: WebArtifactType;
  artifactPath: string | null;
  artifactContentType: string | null;
  notePath: string;
  sourcePagePath: string;
  screenshotPaths: {
    desktop: string;
    mobile: string;
  };
  tags: string[];
  capture: {
    title: string;
    desktop: PageSnapshot;
    mobile: PageSnapshot;
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

function formatList(items: string[], emptyLine: string): string[] {
  if (items.length === 0) {
    return [`- ${emptyLine}`];
  }
  return items.map((item) => `- ${item}`);
}

function formatKeyValueList(
  items: Array<{ name: string; value: string }>,
  emptyLine: string,
): string[] {
  if (items.length === 0) {
    return [`- ${emptyLine}`];
  }
  return items.map((item) => `- \`${item.name}\`: ${item.value}`);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function take(items: string[], limit: number): string[] {
  return dedupe(items).slice(0, limit);
}

function cleanFontName(value: string): string {
  return value
    .split(",")[0]
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
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

function firstNonEmpty(items: Array<string | null | undefined>): string | null {
  for (const item of items) {
    const normalized = item?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function chooseTitle(input: { explicitTitle?: string; snapshotTitle: string; slug: string }): string {
  return input.explicitTitle?.trim() || input.snapshotTitle.trim() || input.slug;
}

function deriveSlug(url: string, explicitSlug?: string, explicitTitle?: string): string {
  if (explicitSlug?.trim()) {
    return slugify(explicitSlug);
  }

  if (explicitTitle?.trim()) {
    return slugify(explicitTitle);
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return slugify(path.basename(parsed.pathname, path.extname(parsed.pathname)));
    }
    return slugify(`${parsed.hostname}${parsed.pathname === "/" ? "" : `-${parsed.pathname}`}`);
  } catch {
    return slugify(url);
  }
}

function toIndexedRecord(prefix: string, values: string[]): Record<string, string> {
  return Object.fromEntries(
    values.map((value, index) => [`${prefix}-${String(index + 1).padStart(2, "0")}`, value]),
  );
}

function describeWebTypography(style: NonNullable<SourceBundle["style"]>): string {
  const fonts = take([
    ...style.cssVariables
      .filter((item) => /font|display/i.test(item.name))
      .map((item) => cleanFontName(item.value)),
    ...style.fonts.map(cleanFontName),
  ], 2);
  if (fonts.length === 0) {
    return "the captured type system";
  }
  if (fonts.length === 1) {
    return `${fonts[0]} as the dominant type family`;
  }
  return `${fonts[0]} paired with ${fonts[1]}`;
}

function describeWebPalette(style: NonNullable<SourceBundle["style"]>): string {
  const palette = take([...style.colors, ...style.backgrounds], 3);
  if (palette.length === 0) {
    return "the captured palette";
  }
  return `a palette anchored by ${readableList(palette)}`;
}

function describeWebLayout(bundle: SourceBundle, desktop: PageSnapshot): string {
  const headings = take(
    bundle.structure.headings
      .map((heading) => heading.trim())
      .filter((value) => value && value.length <= 80),
    3,
  );
  if (headings.length > 0) {
    return `a hero-to-section flow built around ${readableList(headings)}`;
  }

  const sectionTitles = take(
    bundle.structure.sections
      .map((section) => section.title.trim())
      .filter((value) => value && value.length <= 40),
    3,
  );
  if (sectionTitles.length > 0) {
    return `a page rhythm built around ${readableList(sectionTitles)}`;
  }

  const navItems = take(desktop.navItems, 3);
  if (navItems.length > 0) {
    return `top-level navigation organized around ${readableList(navItems)}`;
  }

  const heading = bundle.structure.headings[0]?.trim();
  if (heading) {
    return `a hero-led page that opens with "${heading}"`;
  }

  return "the captured page structure";
}

function buildWebExamples(input: {
  bundle: SourceBundle;
  desktop: PageSnapshot;
  mobile: PageSnapshot;
}): string[] {
  const examples = [
    input.bundle.structure.headings[0]
      ? `Lead headline: ${input.bundle.structure.headings[0]}`
      : null,
    input.desktop.navItems.length > 0
      ? `Navigation labels: ${take(input.desktop.navItems, 5).join(", ")}`
      : null,
    input.desktop.buttons.length > 0
      ? `Primary button language: ${take(input.desktop.buttons, 3).join(", ")}`
      : null,
    input.bundle.structure.headings.length > 0
      ? `Section flow: ${take(input.bundle.structure.headings, 3).join(" -> ")}`
      : null,
    input.mobile.buttons.length > 0
      ? `Mobile-visible buttons: ${take(input.mobile.buttons, 3).join(", ")}`
      : null,
  ];

  return dedupe(examples.filter(Boolean) as string[]);
}

function normalizeCssVariableName(name: string): string {
  return name
    .replace(/^--+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeFontFamily(value: string): string {
  const first = value.split(",")[0]?.trim() ?? value.trim();
  return first.replace(/^['"]+|['"]+$/g, "");
}

function sortCssDimensionValues(values: string[]): string[] {
  return [...values].sort((left, right) => {
    const leftNumber = Number.parseFloat(left);
    const rightNumber = Number.parseFloat(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });
}

interface DesignTokensArtifact {
  source: {
    kind: "web";
    title: string;
    url: string;
    notePath: string;
    capturedAt: string;
  };
  color: {
    text: Record<string, string>;
    background: Record<string, string>;
    variable: Record<string, string>;
  };
  font: {
    family: Record<string, string>;
    size: Record<string, string>;
    weight: Record<string, string>;
  };
  radius: Record<string, string>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
}

function buildDesignTokens(input: {
  bundle: SourceBundle;
  notePath: string;
  capturedAt: string;
}): DesignTokensArtifact {
  const style = input.bundle.style;
  if (!style) {
    throw new Error("Web source bundle was missing style evidence.");
  }
  const colorVariables = style.cssVariables.filter((item) => /(color|bg|background|brand|accent|surface)/i.test(item.name));
  const fontVariables = style.cssVariables.filter((item) => /font/i.test(item.name));
  const radiusVariables = style.cssVariables.filter((item) => /radius/i.test(item.name));
  const shadowVariables = style.cssVariables.filter((item) => /shadow/i.test(item.name));

  return {
    source: {
      kind: "web",
      title: input.bundle.source.title,
      url: input.bundle.source.url ?? "",
      notePath: input.notePath,
      capturedAt: input.capturedAt,
    },
    color: {
      text: toIndexedRecord("text", style.colors),
      background: toIndexedRecord("background", style.backgrounds),
      variable: Object.fromEntries(
        colorVariables.map((item) => [normalizeCssVariableName(item.name), item.value]),
      ),
    },
    font: {
      family: toIndexedRecord(
        "family",
        dedupe([
          ...style.fonts.map(normalizeFontFamily),
          ...fontVariables.map((item) => normalizeFontFamily(item.value)),
        ]),
      ),
      size: toIndexedRecord("size", style.fontSizes),
      weight: toIndexedRecord("weight", style.fontWeights),
    },
    radius: {
      ...toIndexedRecord("radius", sortCssDimensionValues(style.borderRadii)),
      ...Object.fromEntries(
        radiusVariables.map((item) => [normalizeCssVariableName(item.name), item.value]),
      ),
    },
    shadow: {
      ...toIndexedRecord("shadow", style.shadows),
      ...Object.fromEntries(
        shadowVariables.map((item) => [normalizeCssVariableName(item.name), item.value]),
      ),
    },
    motion: toIndexedRecord("transition", style.transitions),
  };
}

function indentJson(value: unknown, spaces: number): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `${" ".repeat(spaces)}${line}`)
    .join("\n");
}

function renderDesignTokens(input: {
  bundle: SourceBundle;
  notePath: string;
  capturedAt: string;
}): string {
  return `${JSON.stringify(buildDesignTokens(input), null, 2)}\n`;
}

function renderTailwindTheme(input: {
  bundle: SourceBundle;
  notePath: string;
  capturedAt: string;
}): string {
  const tokens = buildDesignTokens(input);
  const theme = {
    colors: {
      ...tokens.color.text,
      ...tokens.color.background,
      ...tokens.color.variable,
    },
    fontFamily: Object.fromEntries(
      Object.entries(tokens.font.family).map(([key, value]) => [key, [value]]),
    ),
    fontSize: tokens.font.size,
    fontWeight: tokens.font.weight,
    borderRadius: tokens.radius,
    boxShadow: tokens.shadow,
    transitionProperty: tokens.motion,
  };

  return [
    `export const source = ${JSON.stringify(tokens.source, null, 2)} as const;`,
    "",
    "export const theme = {",
    `  colors: ${indentJson(theme.colors, 2).trimStart()},`,
    `  fontFamily: ${indentJson(theme.fontFamily, 2).trimStart()},`,
    `  fontSize: ${indentJson(theme.fontSize, 2).trimStart()},`,
    `  fontWeight: ${indentJson(theme.fontWeight, 2).trimStart()},`,
    `  borderRadius: ${indentJson(theme.borderRadius, 2).trimStart()},`,
    `  boxShadow: ${indentJson(theme.boxShadow, 2).trimStart()},`,
    `  transitionProperty: ${indentJson(theme.transitionProperty, 2).trimStart()},`,
    "} as const;",
    "",
    "export default theme;",
    "",
  ].join("\n");
}

function quoteCssString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed;
  }
  return `"${trimmed.replace(/"/g, "\\\"")}"`;
}

function formatCssVariableValue(key: string, value: string): string {
  if (/^--datalox-font-family-/.test(key)) {
    if (value.includes(",")) {
      return value;
    }
    if (/\s/.test(value)) {
      return quoteCssString(value);
    }
  }
  return value;
}

function renderCssVariables(input: {
  bundle: SourceBundle;
  notePath: string;
  capturedAt: string;
}): string {
  const style = input.bundle.style;
  if (!style) {
    throw new Error("Web source bundle was missing style evidence.");
  }

  const tokens = buildDesignTokens(input);
  const lines: string[] = [
    "/*",
    ` * Source: ${tokens.source.title}`,
    ` * URL: ${tokens.source.url}`,
    ` * Note: ${tokens.source.notePath}`,
    ` * Captured at: ${tokens.source.capturedAt}`,
    " */",
    ":root {",
  ];

  if (style.cssVariables.length > 0) {
    lines.push("  /* Captured source variables */");
    for (const item of style.cssVariables) {
      lines.push(`  ${item.name}: ${item.value};`);
    }
    lines.push("");
  }

  lines.push("  /* Datalox normalized variables */");

  const tokenGroups = [
    ["--datalox-color-text-", tokens.color.text],
    ["--datalox-color-background-", tokens.color.background],
    ["--datalox-color-variable-", tokens.color.variable],
    ["--datalox-font-family-", tokens.font.family],
    ["--datalox-font-size-", tokens.font.size],
    ["--datalox-font-weight-", tokens.font.weight],
    ["--datalox-radius-", tokens.radius],
    ["--datalox-shadow-", tokens.shadow],
    ["--datalox-transition-", tokens.motion],
  ] as const;

  for (const [prefix, values] of tokenGroups) {
    for (const [key, value] of Object.entries(values)) {
      const variableName = `${prefix}${key.replace(/^(text|background|family|size|weight|radius|shadow|transition)-/, "")}`;
      lines.push(`  ${variableName}: ${formatCssVariableValue(variableName, value)};`);
    }
  }

  lines.push("}", "");
  return lines.join("\n");
}

async function ensurePackReady(repoPath: string): Promise<void> {
  const probeBefore = await probeBootstrapCandidate(repoPath);
  if (probeBefore.canAutoBootstrap) {
    await autoBootstrapIfSafe({ repoPath });
  }
  const probeAfter = await probeBootstrapCandidate(repoPath);
  if (probeAfter.status !== "ready") {
    throw new Error(
      `Datalox repo is not ready for design capture: ${probeAfter.reasons.join("; ") || probeAfter.status}`,
    );
  }
}

async function captureSnapshot(pageUrl: string, viewport: { width: number; height: number }, screenshotPath: string) {
  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright Chromium is not installed for design capture. Run \`npx playwright install chromium\` first. Original error: ${message}`,
    );
  }
  try {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
    });
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const snapshot = await page.evaluate(() => {
      const isVisible = (element: Element): boolean => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        return (
          rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden"
          && style.opacity !== "0"
        );
      };

      const textOf = (element: Element): string => {
        const ariaLabel = element.getAttribute("aria-label")?.trim();
        if (ariaLabel) {
          return ariaLabel;
        }
        return (element.textContent ?? "").replace(/\s+/g, " ").trim();
      };

      const visibleElements = Array.from(document.querySelectorAll("body *"))
        .filter(isVisible)
        .slice(0, 300);

      const unique = (items: Array<string | null | undefined>) =>
        [...new Set(items.map((item) => (item ?? "").trim()).filter(Boolean))];

      const normalizeColor = (value: string | null) => {
        if (!value) {
          return null;
        }
        const trimmed = value.trim();
        if (!trimmed || trimmed === "transparent" || trimmed === "rgba(0, 0, 0, 0)") {
          return null;
        }
        return trimmed;
      };

      const collectBySelector = (selector: string, limit: number) =>
        Array.from(document.querySelectorAll(selector))
          .filter(isVisible)
          .map((element) => textOf(element))
          .filter(Boolean)
          .slice(0, limit);

      const navItems = collectBySelector("nav a, nav button", 12);
      const headings = collectBySelector("h1, h2, h3", 12);
      const buttons = collectBySelector("button, a[role='button'], input[type='submit']", 10);

      const sections = Array.from(document.querySelectorAll("main section, section, header, footer, nav"))
        .filter(isVisible)
        .slice(0, 12)
        .map((element) => {
          const heading = element.querySelector("h1, h2, h3, h4, h5, h6");
          const label = textOf(heading ?? element) || element.getAttribute("aria-label") || element.id || "";
          return {
            tag: element.tagName.toLowerCase(),
            label: label.trim(),
            text: textOf(element).slice(0, 140),
          };
        })
        .filter((entry) => entry.label || entry.text);

      const fontFamilies = unique(
        visibleElements.map((element) => window.getComputedStyle(element as HTMLElement).fontFamily),
      ).slice(0, 8);
      const fontSizes = unique(
        visibleElements.map((element) => window.getComputedStyle(element as HTMLElement).fontSize),
      ).slice(0, 10);
      const fontWeights = unique(
        visibleElements.map((element) => window.getComputedStyle(element as HTMLElement).fontWeight),
      ).slice(0, 10);
      const colors = unique(
        visibleElements.map((element) => normalizeColor(window.getComputedStyle(element as HTMLElement).color)),
      ).slice(0, 12);
      const backgrounds = unique(
        visibleElements.map((element) => normalizeColor(window.getComputedStyle(element as HTMLElement).backgroundColor)),
      ).slice(0, 12);
      const borderRadii = unique(
        visibleElements.map((element) => window.getComputedStyle(element as HTMLElement).borderRadius),
      )
        .filter((value) => value && value !== "0px")
        .slice(0, 10);
      const shadows = unique(
        visibleElements.map((element) => window.getComputedStyle(element as HTMLElement).boxShadow),
      )
        .filter((value) => value && value !== "none")
        .slice(0, 10);
      const transitions = unique(
        visibleElements.map((element) => {
          const style = window.getComputedStyle(element as HTMLElement);
          if (!style.transitionProperty || style.transitionProperty === "all 0s ease 0s") {
            return style.transition;
          }
          return `${style.transitionProperty} ${style.transitionDuration} ${style.transitionTimingFunction}`;
        }),
      )
        .filter((value) => value && value !== "all 0s ease 0s" && value !== "0s")
        .slice(0, 10);

      const cssVariableMap = new Map<string, string>();
      for (const target of [document.documentElement, document.body]) {
        const styles = window.getComputedStyle(target);
        for (const propertyName of Array.from(styles)) {
          if (!propertyName.startsWith("--")) {
            continue;
          }
          if (!/(color|font|space|radius|shadow|surface|bg|background|brand|accent)/i.test(propertyName)) {
            continue;
          }
          const value = styles.getPropertyValue(propertyName).trim();
          if (value) {
            cssVariableMap.set(propertyName, value);
          }
        }
      }

      return {
        title: document.title.trim(),
        url: window.location.href,
        metaDescription: document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ?? null,
        lang: document.documentElement.getAttribute("lang"),
        navItems,
        headings,
        buttons,
        sections,
        fonts: fontFamilies,
        fontSizes,
        fontWeights,
        colors,
        backgrounds,
        borderRadii,
        shadows,
        transitions,
        cssVariables: Array.from(cssVariableMap.entries()).map(([name, value]) => ({ name, value })),
        forms: Array.from(document.querySelectorAll("form")).filter(isVisible).length,
        inputs: Array.from(document.querySelectorAll("input, textarea, select")).filter(isVisible).length,
        links: Array.from(document.querySelectorAll("a")).filter(isVisible).length,
      };
    });
    return snapshot as PageSnapshot;
  } finally {
    await browser.close();
  }
}

function renderWebNote(input: {
  bundle: SourceBundle;
  sourceSlug: string;
  notePath: string;
  artifactPath: string | null;
  screenshotDesktopPath: string;
  screenshotMobilePath: string;
  desktop: PageSnapshot;
  mobile: PageSnapshot;
}): string {
  const updatedAt = new Date().toISOString();
  const style = input.bundle.style;
  if (!style) {
    throw new Error("Web source bundle was missing style evidence.");
  }
  const typography = describeWebTypography(style);
  const palette = describeWebPalette(style);
  const layout = describeWebLayout(input.bundle, input.desktop);
  const leadHeading = input.bundle.structure.headings[0]?.trim();
  const navLabels = take(input.desktop.navItems, 4);
  const examples = buildWebExamples({
    bundle: input.bundle,
    desktop: input.desktop,
    mobile: input.mobile,
  });

  return [
    "---",
    "type: note",
    "kind: web",
    `title: ${input.bundle.source.title}`,
    "workflow: web_capture",
    "status: active",
    input.artifactPath ? "related:" : "related: []",
    ...(input.artifactPath ? [`  - ${input.artifactPath}`] : []),
    "sources: []",
    `updated: ${updatedAt}`,
    "---",
    "",
    `# ${input.bundle.source.title}`,
    "",
    "## When to Use",
    "",
    `Use this reference when building pages that should borrow ${typography}, ${palette}, and ${layout}.`,
    "",
    "## Signal",
    "",
    firstNonEmpty([
      leadHeading
        ? `Observed the headline "${leadHeading}" with ${navLabels.length > 0 ? `${readableList(navLabels)} in the top navigation, ` : ""}${palette}.`
        : null,
      `Captured live web evidence from ${input.bundle.source.url} with ${typography} and ${layout}.`,
    ]) ?? `Captured live web evidence from ${input.bundle.source.url}.`,
    "",
    "## Interpretation",
    "",
    `The page gets most of its character from ${typography}, while ${layout} keeps the hierarchy legible and reusable for later implementation work.`,
    "",
    "## Action",
    "",
    `Start from ${layout}, preserve ${typography}, and reuse ${palette} as the visual baseline before copying exact copywriting or section order.`,
    "",
    "## Examples",
    "",
    ...formatList(
      examples,
      "No extracted examples.",
    ),
    "",
    "## Evidence",
    "",
    `- Source URL: ${input.bundle.source.url}`,
    `- Note path: ${input.notePath}`,
    `- Source slug: ${input.sourceSlug}`,
    `- Captured at: ${input.bundle.source.capturedAt}`,
    `- Meta description: ${input.desktop.metaDescription ?? "none"}`,
    `- Desktop screenshot: ${input.screenshotDesktopPath}`,
    `- Mobile screenshot: ${input.screenshotMobilePath}`,
    ...formatKeyValueList(style.cssVariables, "No CSS variables detected."),
    "",
    "## Related",
    "",
    ...(input.artifactPath ? [`- ${input.artifactPath}`] : ["- Add a derived design artifact when one exists."]),
    "",
    "## Structure",
    "",
    ...formatList(
      input.bundle.structure.sections.map((section) => `${section.title}: ${section.text}`),
      "No visible sections detected.",
    ),
    "",
  ].join("\n");
}

function renderDesignDoc(input: {
  bundle: SourceBundle;
  sourcePath: string;
  screenshotDesktopPath: string;
  screenshotMobilePath: string;
  desktop: PageSnapshot;
  mobile: PageSnapshot;
}): string {
  const style = input.bundle.style;
  if (!style) {
    throw new Error("Web source bundle was missing style evidence.");
  }
  return [
    `# ${input.bundle.source.title} Design`,
    "",
    `- Source URL: ${input.bundle.source.url}`,
    `- Source page: ${input.sourcePath}`,
    `- Desktop screenshot: ${input.screenshotDesktopPath}`,
    `- Mobile screenshot: ${input.screenshotMobilePath}`,
    "",
    "## Typography",
    "",
    ...formatList(style.fonts, "No fonts detected."),
    "",
    "### Font Sizes",
    "",
    ...formatList(style.fontSizes, "No font sizes detected."),
    "",
    "### Font Weights",
    "",
    ...formatList(style.fontWeights, "No font weights detected."),
    "",
    "## Color System",
    "",
    "### CSS Variables",
    "",
    ...formatKeyValueList(style.cssVariables, "No CSS variables detected."),
    "",
    "### Text Colors",
    "",
    ...formatList(style.colors, "No colors detected."),
    "",
    "### Surface Colors",
    "",
    ...formatList(style.backgrounds, "No backgrounds detected."),
    "",
    "## Layout Structure",
    "",
    "### Navigation",
    "",
    ...formatList(input.desktop.navItems, "No navigation labels detected."),
    "",
    "### Headings",
    "",
    ...formatList(input.bundle.structure.headings, "No headings detected."),
    "",
    "### Sections",
    "",
    ...formatList(
      input.bundle.structure.sections.map((section) => `${section.title}: ${section.text}`),
      "No sections detected.",
    ),
    "",
    "## Components",
    "",
    `- Visible links: ${input.desktop.links}`,
    `- Visible forms: ${input.desktop.forms}`,
    `- Visible inputs: ${input.desktop.inputs}`,
    "",
    "### Buttons",
    "",
    ...formatList(input.desktop.buttons, "No button labels detected."),
    "",
    "## Surfaces",
    "",
    "### Border Radius",
    "",
    ...formatList(style.borderRadii, "No rounded surfaces detected."),
    "",
    "### Shadows",
    "",
    ...formatList(style.shadows, "No shadows detected."),
    "",
    "## Motion",
    "",
    ...formatList(style.transitions, "No transitions detected."),
    "",
    "## Responsive Notes",
    "",
    `- Mobile headings: ${input.mobile.headings.length}`,
    `- Mobile buttons: ${input.mobile.buttons.length}`,
    `- Mobile sections: ${input.mobile.sections.length}`,
    "",
    "## Usage",
    "",
    "- Use this file as the agent-facing design brief when recreating or extending the captured site.",
    "- Use the source page and screenshots when the extracted tokens are not enough.",
    "",
  ].join("\n");
}

function resolveArtifactPath(input: {
  repoPath: string;
  sourceSlug: string;
  artifactType: WebArtifactType;
  outputPath?: string;
}): string | null {
  switch (input.artifactType) {
    case "design_doc":
      return path.resolve(input.repoPath, input.outputPath ?? path.join("designs", "web", `${input.sourceSlug}.md`));
    case "design_tokens":
      return path.resolve(input.repoPath, input.outputPath ?? path.join("designs", "web", `${input.sourceSlug}.tokens.json`));
    case "css_variables":
      return path.resolve(input.repoPath, input.outputPath ?? path.join("designs", "web", `${input.sourceSlug}.vars.css`));
    case "tailwind_theme":
      return path.resolve(input.repoPath, input.outputPath ?? path.join("designs", "web", `${input.sourceSlug}.tailwind.ts`));
    case "note":
      return null;
  }
}

function getArtifactContentType(artifactType: WebArtifactType): string | null {
  switch (artifactType) {
    case "design_doc":
    case "note":
      return "text/markdown; charset=utf-8";
    case "design_tokens":
      return "application/json";
    case "css_variables":
      return "text/css; charset=utf-8";
    case "tailwind_theme":
      return "application/typescript; charset=utf-8";
  }
}

export async function captureWebArtifact(input: CaptureWebInput): Promise<CaptureWebResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  await ensurePackReady(repoPath);

  const sourceSlug = deriveSlug(input.url, input.slug, input.title);
  const requestedArtifactType = input.artifactType ?? "design_doc";
  const artifactType: WebArtifactType = requestedArtifactType === "source_page" ? "note" : requestedArtifactType;
  const assetsDir = path.join(repoPath, "agent-wiki", "assets", "web", sourceSlug);
  const notesDir = path.join(repoPath, "agent-wiki", "notes", "web");
  const desktopScreenshotPath = path.join(assetsDir, "desktop.png");
  const mobileScreenshotPath = path.join(assetsDir, "mobile.png");
  const notePath = path.join(notesDir, `${sourceSlug}.md`);
  const metadataPath = path.join(notesDir, `${sourceSlug}.capture.json`);
  const artifactPath = resolveArtifactPath({
    repoPath,
    sourceSlug,
    artifactType,
    outputPath: input.outputPath,
  });
  const artifactContentType = getArtifactContentType(artifactType);

  await mkdir(assetsDir, { recursive: true });
  await mkdir(notesDir, { recursive: true });
  if (artifactPath) {
    await mkdir(path.dirname(artifactPath), { recursive: true });
  }

  const desktop = await captureSnapshot(input.url, { width: 1440, height: 1024 }, desktopScreenshotPath);
  const mobile = await captureSnapshot(input.url, { width: 390, height: 844 }, mobileScreenshotPath);
  const pageTitle = chooseTitle({
    explicitTitle: input.title,
    snapshotTitle: desktop.title,
    slug: sourceSlug,
  });

  const relativeDesktopScreenshotPath = path.relative(repoPath, desktopScreenshotPath) || desktopScreenshotPath;
  const relativeMobileScreenshotPath = path.relative(repoPath, mobileScreenshotPath) || mobileScreenshotPath;
  const relativeNotePath = path.relative(repoPath, notePath) || notePath;
  const relativeMetadataPath = path.relative(repoPath, metadataPath) || metadataPath;
  const relativeArtifactPath = artifactPath ? path.relative(repoPath, artifactPath) || artifactPath : null;
  const capturedAt = new Date().toISOString();
  const sourceBundle = extractWebSource({
    id: sourceSlug,
    title: pageTitle,
    capturedAt,
    url: input.url,
    desktop,
    mobile,
    screenshots: [relativeDesktopScreenshotPath, relativeMobileScreenshotPath],
  });

  await writeFile(
    notePath,
    renderWebNote({
      bundle: sourceBundle,
      sourceSlug,
      notePath: relativeNotePath,
      artifactPath: relativeArtifactPath,
      screenshotDesktopPath: relativeDesktopScreenshotPath,
      screenshotMobilePath: relativeMobileScreenshotPath,
      desktop,
      mobile,
    }),
    "utf8",
  );
  if (artifactPath && relativeArtifactPath) {
    const artifactContent = (() => {
      switch (artifactType) {
        case "design_doc":
          return renderDesignDoc({
            bundle: sourceBundle,
            sourcePath: relativeNotePath,
            screenshotDesktopPath: relativeDesktopScreenshotPath,
            screenshotMobilePath: relativeMobileScreenshotPath,
            desktop,
            mobile,
          });
        case "design_tokens":
          return renderDesignTokens({
            bundle: sourceBundle,
            notePath: relativeNotePath,
            capturedAt,
          });
        case "css_variables":
          return renderCssVariables({
            bundle: sourceBundle,
            notePath: relativeNotePath,
            capturedAt,
          });
        case "tailwind_theme":
          return renderTailwindTheme({
            bundle: sourceBundle,
            notePath: relativeNotePath,
            capturedAt,
          });
        case "note":
          return null;
      }
    })();
    if (!artifactContent) {
      throw new Error(`Unsupported artifact renderer for ${artifactType}`);
    }
    await writeFile(
      artifactPath,
      artifactContent,
      "utf8",
    );
  }

  const domain = (() => {
    try {
      return new URL(input.url).hostname || null;
    } catch {
      return null;
    }
  })();
  const metadata: WebCaptureMetadata = {
    version: 1,
    slug: sourceSlug,
    url: input.url,
    domain,
    title: pageTitle,
    capturedAt,
    artifactType,
    artifactPath: relativeArtifactPath,
    artifactContentType,
    notePath: relativeNotePath,
    sourcePagePath: relativeNotePath,
    screenshotPaths: {
      desktop: relativeDesktopScreenshotPath,
      mobile: relativeMobileScreenshotPath,
    },
    tags: ["web_capture", artifactType, ...(domain ? [domain] : [])],
    capture: {
      title: pageTitle,
      desktop: {
        ...desktop,
        fonts: take(desktop.fonts, 8),
        fontSizes: take(desktop.fontSizes, 10),
        fontWeights: take(desktop.fontWeights, 10),
        colors: take(desktop.colors, 12),
        backgrounds: take(desktop.backgrounds, 12),
        borderRadii: take(desktop.borderRadii, 10),
        shadows: take(desktop.shadows, 10),
        transitions: take(desktop.transitions, 10),
      },
      mobile,
    },
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  await refreshControlArtifacts({
    repoPath,
    logEntry: {
      action: "capture_web_artifact",
      detail: `${input.url} -> ${relativeArtifactPath ?? relativeNotePath}`,
      path: relativeNotePath,
    },
  });

  return {
    repoPath,
    url: input.url,
    artifactType,
    artifactPath: relativeArtifactPath,
    notePath: relativeNotePath,
    sourcePagePath: relativeNotePath,
    metadataPath: relativeMetadataPath,
    screenshotPaths: {
      desktop: relativeDesktopScreenshotPath,
      mobile: relativeMobileScreenshotPath,
    },
    capture: metadata.capture,
  };
}

export async function captureDesignFromUrl(input: Omit<CaptureWebInput, "artifactType">): Promise<CaptureWebResult> {
  return captureWebArtifact({
    ...input,
    artifactType: "design_doc",
  });
}
