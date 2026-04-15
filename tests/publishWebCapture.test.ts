import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { adoptPack } from "../src/core/packCore.js";
import {
  publishWebCapture,
  type ObjectStore,
  type PublishedCaptureIndex,
  type PublishedCaptureManifest,
} from "../src/core/publishWebCapture.js";
import type { WebCaptureMetadata } from "../src/core/webCapture.js";

class MemoryObjectStore implements ObjectStore {
  readonly values = new Map<string, { body: Buffer; contentType: string }>();

  async putText(key: string, content: string, contentType: string): Promise<void> {
    this.values.set(key, { body: Buffer.from(content, "utf8"), contentType });
  }

  async putBytes(key: string, content: Buffer, contentType: string): Promise<void> {
    this.values.set(key, { body: Buffer.from(content), contentType });
  }

  async listKeys(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async readJson<T>(key: string): Promise<T> {
    const item = this.values.get(key);
    if (!item) {
      throw new Error(`Missing object: ${key}`);
    }
    return JSON.parse(item.body.toString("utf8")) as T;
  }

  readText(key: string): string {
    const item = this.values.get(key);
    if (!item) {
      throw new Error(`Missing object: ${key}`);
    }
    return item.body.toString("utf8");
  }
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

async function createHostRepo(): Promise<string> {
  const hostDir = await mkdtemp(path.join(tmpdir(), "datalox-publish-"));
  tempDirs.add(hostDir);
  await adoptPack({
    hostRepoPath: hostDir,
    packSource: process.cwd(),
  });
  return hostDir;
}

async function seedCapture(hostDir: string, slug: string, capturedAt: string) {
  await mkdir(path.join(hostDir, "agent-wiki", "notes", "web"), { recursive: true });
  await mkdir(path.join(hostDir, "agent-wiki", "assets", "web", slug), { recursive: true });
  await writeFile(path.join(hostDir, "agent-wiki", "notes", "web", `${slug}.md`), `# ${slug}\n`, "utf8");
  await writeFile(path.join(hostDir, "agent-wiki", "assets", "web", slug, "desktop.png"), Buffer.from(`${slug}-desktop`));
  await writeFile(path.join(hostDir, "agent-wiki", "assets", "web", slug, "mobile.png"), Buffer.from(`${slug}-mobile`));
  await mkdir(path.join(hostDir, "designs", "web"), { recursive: true });
  await writeFile(path.join(hostDir, "designs", "web", `${slug}.md`), `# ${slug} Design\n`, "utf8");

  const metadata: WebCaptureMetadata = {
    version: 1,
    slug,
    url: `https://${slug}.example.com`,
    domain: `${slug}.example.com`,
    title: `${slug} title`,
    capturedAt,
    artifactType: "design_doc",
    artifactPath: `designs/web/${slug}.md`,
    artifactContentType: "text/markdown; charset=utf-8",
    notePath: `agent-wiki/notes/web/${slug}.md`,
    sourcePagePath: `agent-wiki/notes/web/${slug}.md`,
    screenshotPaths: {
      desktop: `agent-wiki/assets/web/${slug}/desktop.png`,
      mobile: `agent-wiki/assets/web/${slug}/mobile.png`,
    },
    tags: ["web_capture", "design_doc", `${slug}.example.com`],
    capture: {
      title: `${slug} title`,
      desktop: {
        title: `${slug} title`,
        url: `https://${slug}.example.com`,
        metaDescription: `${slug} meta`,
        lang: "en",
        navItems: ["Product", "Pricing"],
        headings: ["Launch tasteful product pages faster."],
        buttons: ["Start Free"],
        sections: [
          { tag: "section", label: "Hero", text: "Launch tasteful product pages faster." },
          { tag: "section", label: "Features", text: "Everything you need." },
        ],
        fonts: ["Inter", "Space Grotesk"],
        fontSizes: ["18px", "64px"],
        fontWeights: ["400", "700"],
        colors: ["rgb(15, 23, 42)", "rgb(255, 90, 54)"],
        backgrounds: ["rgb(248, 250, 252)", "rgb(255, 255, 255)"],
        borderRadii: ["24px", "999px"],
        shadows: ["rgba(15, 23, 42, 0.18) 0px 20px 40px 0px"],
        transitions: ["color 0.2s ease"],
        cssVariables: [{ name: "--color-brand", value: "#ff5a36" }],
        forms: 0,
        inputs: 0,
        links: 3,
      },
      mobile: {
        title: `${slug} title`,
        url: `https://${slug}.example.com`,
        metaDescription: `${slug} meta`,
        lang: "en",
        navItems: ["Product", "Pricing"],
        headings: ["Launch tasteful product pages faster."],
        buttons: ["Start Free"],
        sections: [{ tag: "section", label: "Hero", text: "Launch tasteful product pages faster." }],
        fonts: ["Inter"],
        fontSizes: ["18px"],
        fontWeights: ["400"],
        colors: ["rgb(15, 23, 42)"],
        backgrounds: ["rgb(248, 250, 252)"],
        borderRadii: ["24px"],
        shadows: [],
        transitions: [],
        cssVariables: [{ name: "--color-brand", value: "#ff5a36" }],
        forms: 0,
        inputs: 0,
        links: 3,
      },
    },
  };

  await writeFile(
    path.join(hostDir, "agent-wiki", "notes", "web", `${slug}.capture.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

describe("publish web capture", () => {
  it("uploads capture artifacts, writes manifest.json, and regenerates indexes/latest.json", async () => {
    const hostDir = await createHostRepo();
    const store = new MemoryObjectStore();

    await seedCapture(hostDir, "acme", "2026-04-13T10:00:00.000Z");
    await seedCapture(hostDir, "bravo", "2026-04-13T12:00:00.000Z");

    const first = await publishWebCapture(
      {
        repoPath: hostDir,
        capture: "acme",
        bucket: "demo-bucket",
        prefix: "design-corpus",
        publicBaseUrl: "https://assets.example.com/",
      },
      { store },
    );
    const second = await publishWebCapture(
      {
        repoPath: hostDir,
        capture: "bravo",
        bucket: "demo-bucket",
        prefix: "design-corpus",
        publicBaseUrl: "https://assets.example.com/",
      },
      { store },
    );

    expect(store.readText("design-corpus/instances/acme/source.md")).toContain("# acme");
    expect(store.readText("design-corpus/instances/acme/acme.md")).toContain("# acme Design");

    const manifest = JSON.parse(
      store.readText("design-corpus/instances/acme/manifest.json"),
    ) as PublishedCaptureManifest;
    expect(manifest.id).toBe("acme");
    expect(manifest.objects.source_markdown.url).toBe("https://assets.example.com/design-corpus/instances/acme/source.md");
    expect(manifest.objects.artifact_file?.url).toBe("https://assets.example.com/design-corpus/instances/acme/acme.md");
    expect(manifest.objects.artifact_file?.content_type).toBe("text/markdown; charset=utf-8");
    expect(manifest.fonts).toContain("Inter");
    expect(manifest.section_labels).toContain("Hero");

    const latest = JSON.parse(
      store.readText("design-corpus/indexes/latest.json"),
    ) as PublishedCaptureIndex;
    expect(latest.count).toBe(2);
    expect(latest.items[0].id).toBe("bravo");
    expect(latest.items[1].id).toBe("acme");

    expect(first.manifestKey).toBe("design-corpus/instances/acme/manifest.json");
    expect(second.indexKey).toBe("design-corpus/indexes/latest.json");
    expect(await readFile(path.join(hostDir, "agent-wiki", "log.md"), "utf8")).toContain("publish_web_capture");
  }, 20000);
});
