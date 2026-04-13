import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright";

import { autoBootstrapIfSafe, probeBootstrapCandidate, refreshControlArtifacts } from "./packCore.js";

export type WebArtifactType = "design_doc" | "source_page";

export interface CaptureWebInput {
  repoPath?: string;
  url: string;
  title?: string;
  slug?: string;
  artifactType?: WebArtifactType;
  outputPath?: string;
}

interface PageSnapshot {
  title: string;
  url: string;
  metaDescription: string | null;
  lang: string | null;
  navItems: string[];
  headings: string[];
  buttons: string[];
  sections: Array<{ tag: string; label: string; text: string }>;
  fonts: string[];
  fontSizes: string[];
  fontWeights: string[];
  colors: string[];
  backgrounds: string[];
  borderRadii: string[];
  shadows: string[];
  transitions: string[];
  cssVariables: Array<{ name: string; value: string }>;
  forms: number;
  inputs: number;
  links: number;
}

export interface CaptureWebResult {
  repoPath: string;
  url: string;
  artifactType: WebArtifactType;
  artifactPath: string | null;
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

function renderSourcePage(input: {
  pageTitle: string;
  pageUrl: string;
  sourceSlug: string;
  sourcePath: string;
  screenshotDesktopPath: string;
  screenshotMobilePath: string;
  desktop: PageSnapshot;
  mobile: PageSnapshot;
}): string {
  const updatedAt = new Date().toISOString();
  return [
    "---",
    "type: source",
    `title: ${input.pageTitle}`,
    "workflow: design_capture",
    "status: active",
    "related: []",
    "sources: []",
    `updated: ${updatedAt}`,
    "---",
    "",
    `# ${input.pageTitle}`,
    "",
    "## Overview",
    "",
    `- Source URL: ${input.pageUrl}`,
    `- Source slug: ${input.sourceSlug}`,
    `- Meta description: ${input.desktop.metaDescription ?? "none"}`,
    `- Desktop screenshot: ${input.screenshotDesktopPath}`,
    `- Mobile screenshot: ${input.screenshotMobilePath}`,
    "",
    "## Key Claims",
    "",
    ...formatList(
      [
        `The page uses fonts: ${input.desktop.fonts.join(", ") || "none detected"}.`,
        `Desktop navigation labels: ${input.desktop.navItems.join(", ") || "none detected"}.`,
        `Observed heading structure: ${input.desktop.headings.join(" | ") || "none detected"}.`,
      ],
      "No extracted claims.",
    ),
    "",
    "## Evidence",
    "",
    ...formatKeyValueList(input.desktop.cssVariables, "No CSS variables detected."),
    "",
    "## Desktop Sections",
    "",
    ...formatList(
      input.desktop.sections.map((section) => `${section.tag}: ${section.label || section.text}`),
      "No visible sections detected.",
    ),
    "",
    "## Mobile Notes",
    "",
    ...formatList(
      [
        `Visible mobile headings: ${input.mobile.headings.join(" | ") || "none detected"}.`,
        `Visible mobile buttons: ${input.mobile.buttons.join(", ") || "none detected"}.`,
        `Visible mobile sections: ${String(input.mobile.sections.length)}.`,
      ],
      "No mobile notes detected.",
    ),
    "",
  ].join("\n");
}

function renderDesignDoc(input: {
  pageTitle: string;
  pageUrl: string;
  sourcePath: string;
  screenshotDesktopPath: string;
  screenshotMobilePath: string;
  desktop: PageSnapshot;
  mobile: PageSnapshot;
}): string {
  return [
    `# ${input.pageTitle} Design`,
    "",
    `- Source URL: ${input.pageUrl}`,
    `- Source page: ${input.sourcePath}`,
    `- Desktop screenshot: ${input.screenshotDesktopPath}`,
    `- Mobile screenshot: ${input.screenshotMobilePath}`,
    "",
    "## Typography",
    "",
    ...formatList(input.desktop.fonts, "No fonts detected."),
    "",
    "### Font Sizes",
    "",
    ...formatList(input.desktop.fontSizes, "No font sizes detected."),
    "",
    "### Font Weights",
    "",
    ...formatList(input.desktop.fontWeights, "No font weights detected."),
    "",
    "## Color System",
    "",
    "### CSS Variables",
    "",
    ...formatKeyValueList(input.desktop.cssVariables, "No CSS variables detected."),
    "",
    "### Text Colors",
    "",
    ...formatList(input.desktop.colors, "No colors detected."),
    "",
    "### Surface Colors",
    "",
    ...formatList(input.desktop.backgrounds, "No backgrounds detected."),
    "",
    "## Layout Structure",
    "",
    "### Navigation",
    "",
    ...formatList(input.desktop.navItems, "No navigation labels detected."),
    "",
    "### Headings",
    "",
    ...formatList(input.desktop.headings, "No headings detected."),
    "",
    "### Sections",
    "",
    ...formatList(
      input.desktop.sections.map((section) => `${section.tag}: ${section.label || section.text}`),
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
    ...formatList(input.desktop.borderRadii, "No rounded surfaces detected."),
    "",
    "### Shadows",
    "",
    ...formatList(input.desktop.shadows, "No shadows detected."),
    "",
    "## Motion",
    "",
    ...formatList(input.desktop.transitions, "No transitions detected."),
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

export async function captureWebArtifact(input: CaptureWebInput): Promise<CaptureWebResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  await ensurePackReady(repoPath);

  const sourceSlug = deriveSlug(input.url, input.slug, input.title);
  const artifactType = input.artifactType ?? "design_doc";
  const assetsDir = path.join(repoPath, "agent-wiki", "assets", "web", sourceSlug);
  const sourcesDir = path.join(repoPath, "agent-wiki", "sources", "web");
  const desktopScreenshotPath = path.join(assetsDir, "desktop.png");
  const mobileScreenshotPath = path.join(assetsDir, "mobile.png");
  const sourcePagePath = path.join(sourcesDir, `${sourceSlug}.md`);
  const metadataPath = path.join(sourcesDir, `${sourceSlug}.capture.json`);
  const artifactPath = artifactType === "design_doc"
    ? path.resolve(repoPath, input.outputPath ?? path.join("designs", "web", `${sourceSlug}.md`))
    : null;

  await mkdir(assetsDir, { recursive: true });
  await mkdir(sourcesDir, { recursive: true });
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
  const relativeSourcePagePath = path.relative(repoPath, sourcePagePath) || sourcePagePath;
  const relativeMetadataPath = path.relative(repoPath, metadataPath) || metadataPath;
  const relativeArtifactPath = artifactPath ? path.relative(repoPath, artifactPath) || artifactPath : null;
  const capturedAt = new Date().toISOString();

  await writeFile(
    sourcePagePath,
    renderSourcePage({
      pageTitle,
      pageUrl: input.url,
      sourceSlug,
      sourcePath: relativeSourcePagePath,
      screenshotDesktopPath: relativeDesktopScreenshotPath,
      screenshotMobilePath: relativeMobileScreenshotPath,
      desktop,
      mobile,
    }),
    "utf8",
  );
  if (artifactPath && relativeArtifactPath) {
    await writeFile(
      artifactPath,
      renderDesignDoc({
        pageTitle,
        pageUrl: input.url,
        sourcePath: relativeSourcePagePath,
        screenshotDesktopPath: relativeDesktopScreenshotPath,
        screenshotMobilePath: relativeMobileScreenshotPath,
        desktop,
        mobile,
      }),
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
    sourcePagePath: relativeSourcePagePath,
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
      detail: `${input.url} -> ${relativeArtifactPath ?? relativeSourcePagePath}`,
      path: relativeSourcePagePath,
    },
  });

  return {
    repoPath,
    url: input.url,
    artifactType,
    artifactPath: relativeArtifactPath,
    sourcePagePath: relativeSourcePagePath,
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
