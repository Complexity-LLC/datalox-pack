import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const builtCliPath = path.join(repoRoot, "dist", "src", "cli", "main.js");
const builtMcpPath = path.join(repoRoot, "dist", "src", "mcp", "server.js");

async function createSampleSite(rootDir: string): Promise<string> {
  const sitePath = path.join(rootDir, "sample-site.html");
  await writeFile(
    sitePath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Acme landing page for design capture tests." />
    <title>Acme Landing</title>
    <style>
      :root {
        --color-brand: #ff5a36;
        --color-surface: #0f172a;
        --font-display: "Space Grotesk", sans-serif;
        --radius-card: 24px;
        --shadow-card: 0 20px 40px rgba(15, 23, 42, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Inter", sans-serif;
        color: rgb(15, 23, 42);
        background: rgb(248, 250, 252);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 48px;
        background: white;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      nav a {
        margin-right: 20px;
        color: rgb(15, 23, 42);
        text-decoration: none;
        transition: color 0.2s ease;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 32px;
        padding: 72px 48px;
      }
      .hero-card {
        border-radius: 24px;
        background: rgb(255, 255, 255);
        box-shadow: var(--shadow-card);
        padding: 32px;
      }
      h1, h2 {
        font-family: var(--font-display);
        margin: 0 0 12px;
      }
      h1 { font-size: 64px; line-height: 1; }
      h2 { font-size: 32px; }
      p { font-size: 18px; line-height: 1.6; }
      .cta {
        display: inline-flex;
        align-items: center;
        padding: 14px 22px;
        border: none;
        border-radius: 999px;
        background: var(--color-brand);
        color: white;
        font-weight: 700;
        box-shadow: 0 12px 24px rgba(255, 90, 54, 0.28);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      section {
        padding: 32px 48px 56px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
      }
      .card {
        padding: 24px;
        border-radius: var(--radius-card);
        background: white;
        box-shadow: var(--shadow-card);
      }
      @media (max-width: 720px) {
        header { padding: 20px 24px; }
        .hero {
          grid-template-columns: 1fr;
          padding: 40px 24px;
        }
        h1 { font-size: 44px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <strong>Acme</strong>
      <nav>
        <a href="#product">Product</a>
        <a href="#pricing">Pricing</a>
        <a href="#docs">Docs</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div>
          <h1>Launch tasteful product pages faster.</h1>
          <p>Acme helps small teams ship polished launch pages with a clear content system and reusable UI blocks.</p>
          <button class="cta">Start Free</button>
        </div>
        <div class="hero-card">
          <h2>Built for teams</h2>
          <p>Shared sections, content review, and component reuse keep your launch site consistent.</p>
        </div>
      </section>
      <section id="product">
        <h2>Everything you need</h2>
        <div class="grid">
          <article class="card"><h3>Templates</h3><p>Start from proven layouts.</p></article>
          <article class="card"><h3>CMS</h3><p>Edit launch content safely.</p></article>
          <article class="card"><h3>Analytics</h3><p>Measure what visitors read.</p></article>
        </div>
      </section>
    </main>
  </body>
</html>`,
    "utf8",
  );
  return pathToFileURL(sitePath).href;
}

async function createGitRepo(): Promise<string> {
  const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-design-"));
  spawnSync("git", ["init"], { cwd: hostDir, encoding: "utf8" });
  return hostDir;
}

const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempDirs].map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
      tempDirs.delete(dir);
    }),
  );
});

describe("web capture", () => {
  it("captures a website into repo knowledge plus a per-capture design doc through the CLI", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-web",
        "--repo",
        hostDir,
        "--url",
        url,
        "--artifact",
        "design-doc",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      artifactType: string;
      artifactPath: string;
      notePath: string;
      sourcePagePath: string;
      screenshotPaths: { desktop: string; mobile: string };
    };

    const designDoc = await readFile(path.join(hostDir, payload.artifactPath), "utf8");
    const sourcePage = await readFile(path.join(hostDir, payload.notePath), "utf8");
    const logDoc = await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8");

    expect(payload.artifactType).toBe("design_doc");
    expect(payload.artifactPath).toContain("designs/web/");
    expect(designDoc).toContain("# Acme Landing Design");
    expect(designDoc).toContain("## Typography");
    expect(designDoc).toContain("## Color System");
    expect(designDoc).toContain("--color-brand");
    expect(designDoc).toContain("Pricing");
    expect(designDoc).toContain("Built for teams");
    expect(sourcePage).toContain("# Acme Landing");
    expect(sourcePage).toContain("Desktop screenshot");
    expect(logDoc).toContain("capture_web_artifact");
    expect(payload.notePath).toContain("agent-wiki/notes/web/");
    expect(payload.sourcePagePath).toBe(payload.notePath);
    expect(payload.screenshotPaths.desktop).toContain("agent-wiki/assets/web/");
    expect(spawnSync("test", ["-f", path.join(hostDir, payload.screenshotPaths.desktop)]).status).toBe(0);
    expect(spawnSync("test", ["-f", path.join(hostDir, payload.screenshotPaths.mobile)]).status).toBe(0);
    expect(spawnSync("test", ["-f", path.join(hostDir, ".datalox", "install.json")]).status).toBe(0);
  }, 30000);

  it("captures a website through the MCP server", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const transport = new StdioClientTransport({
      command: "node",
      args: [builtMcpPath],
      cwd: repoRoot,
    });
    const client = new Client({ name: "design-test", version: "0.1.0" });
    await client.connect(transport);

    try {
      const response = await client.callTool({
        name: "capture_web_artifact",
        arguments: {
          repo_path: hostDir,
          url,
          artifact_type: "design_doc",
        },
      });
      const result = (response.structuredContent as { result: {
        artifactPath: string;
        notePath: string;
        sourcePagePath: string;
      } }).result;
      const designDoc = await readFile(path.join(hostDir, result.artifactPath), "utf8");
      const sourcePage = await readFile(path.join(hostDir, result.notePath), "utf8");

      expect(designDoc).toContain("# Acme Landing Design");
      expect(designDoc).toContain("Start Free");
      expect(sourcePage).toContain("## Evidence");
      expect(sourcePage).toContain("Desktop screenshot");
    } finally {
      await client.close();
    }
  }, 30000);

  it("captures a website as source evidence only", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-web",
        "--repo",
        hostDir,
        "--url",
        url,
        "--artifact",
        "source-page",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      artifactType: string;
      artifactPath: string | null;
      notePath: string;
      sourcePagePath: string;
    };

    expect(payload.artifactType).toBe("note");
    expect(payload.artifactPath).toBeNull();
    expect(spawnSync("test", ["-d", path.join(hostDir, "designs", "web")]).status).not.toBe(0);
    expect(await readFile(path.join(hostDir, payload.notePath), "utf8")).toContain("# Acme Landing");
  }, 30000);

  it("captures semantic design tokens from a website", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-web",
        "--repo",
        hostDir,
        "--url",
        url,
        "--artifact",
        "design-tokens",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      artifactType: string;
      artifactPath: string;
      notePath: string;
    };
    const tokens = JSON.parse(await readFile(path.join(hostDir, payload.artifactPath), "utf8")) as {
      source: { notePath: string };
      color: { variable: Record<string, string> };
      font: { family: Record<string, string> };
      radius: Record<string, string>;
    };

    expect(payload.artifactType).toBe("design_tokens");
    expect(payload.artifactPath).toContain("designs/web/");
    expect(payload.artifactPath).toContain(".tokens.json");
    expect(tokens.source.notePath).toBe(payload.notePath);
    expect(tokens.color.variable["color-brand"]).toBe("#ff5a36");
    expect(Object.values(tokens.font.family)).toContain("Inter");
    expect(Object.values(tokens.radius)).toContain("24px");
  }, 30000);

  it("captures reusable css variables from a website", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-web",
        "--repo",
        hostDir,
        "--url",
        url,
        "--artifact",
        "css-variables",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      artifactType: string;
      artifactPath: string;
      notePath: string;
    };
    const cssVariables = await readFile(path.join(hostDir, payload.artifactPath), "utf8");

    expect(payload.artifactType).toBe("css_variables");
    expect(payload.artifactPath).toContain(".vars.css");
    expect(cssVariables).toContain(":root {");
    expect(cssVariables).toContain("--color-brand: #ff5a36;");
    expect(cssVariables).toContain(`Note: ${payload.notePath}`);
    expect(cssVariables).toContain("--datalox-color-text-01: rgb(15, 23, 42);");
    expect(cssVariables).toContain("--datalox-color-variable-color-brand: #ff5a36;");
    expect(cssVariables).toContain("--datalox-font-family-01: Inter;");
    expect(cssVariables).toContain('--datalox-font-family-02: "Space Grotesk";');
    expect(cssVariables).toContain("--datalox-radius-01: 24px;");
  }, 30000);

  it("captures a tailwind theme derived from design tokens", async () => {
    const hostDir = await createGitRepo();
    tempDirs.add(hostDir);
    const url = await createSampleSite(hostDir);

    const result = spawnSync(
      "node",
      [
        builtCliPath,
        "capture-web",
        "--repo",
        hostDir,
        "--url",
        url,
        "--artifact",
        "tailwind-theme",
        "--json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      artifactType: string;
      artifactPath: string;
    };
    const themeFile = await readFile(path.join(hostDir, payload.artifactPath), "utf8");

    expect(payload.artifactType).toBe("tailwind_theme");
    expect(payload.artifactPath).toContain(".tailwind.ts");
    expect(themeFile).toContain("export const source =");
    expect(themeFile).toContain("export const theme = {");
    expect(themeFile).toContain("\"color-brand\": \"#ff5a36\"");
    expect(themeFile).toContain("\"radius-01\": \"24px\"");
  }, 30000);
});
