import { describe, expect, it } from "vitest";

import {
  extractPdfSource,
  extractTraceSource,
  extractWebSource,
  type PageSnapshot,
} from "../src/core/sourceBundle.js";

function createSnapshot(): PageSnapshot {
  return {
    title: "Acme Landing",
    url: "https://example.com",
    metaDescription: "Acme landing page for tests.",
    lang: "en",
    navItems: ["Product", "Pricing", "Docs"],
    headings: ["Launch tasteful product pages faster.", "Everything you need"],
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
    shadows: ["0 20px 40px rgba(15, 23, 42, 0.18)"],
    transitions: ["color 0.2s ease"],
    cssVariables: [{ name: "--color-brand", value: "#ff5a36" }],
    forms: 0,
    inputs: 0,
    links: 3,
  };
}

describe("source bundles", () => {
  it("builds a trace bundle from grounded loop evidence", () => {
    const bundle = extractTraceSource({
      id: "trace-1",
      title: "Review ambiguous viability gate trace",
      capturedAt: "2026-04-14T00:00:00.000Z",
      task: "review ambiguous viability gate",
      workflow: "flow_cytometry",
      step: "review",
      summary: "Dead tail overlaps the live shoulder.",
      transcript: "User said the dead tail overlaps the live shoulder.",
      observations: ["dim dead tail overlaps live shoulder"],
      signal: "dim dead tail overlaps live shoulder",
      interpretation: "likely artifact",
      action: "review exception note before widening gate",
      matchedSkillId: "flow-cytometry.review-ambiguous-viability-gate",
      changedFiles: ["agent-wiki/notes/dead-tail-exception.md"],
      outcome: "needs note patch",
    });

    expect(bundle.kind).toBe("trace");
    expect(bundle.source.id).toBe("trace-1");
    expect(bundle.structure.headings).toContain("Workflow: flow_cytometry");
    expect(bundle.structure.sections.some((section) => section.title === "Transcript")).toBe(true);
    expect(bundle.evidence.textSnippets).toContain("review exception note before widening gate");
    expect(bundle.evidence.links).toContain("agent-wiki/notes/dead-tail-exception.md");
  });

  it("builds a web bundle from captured page evidence", () => {
    const desktop = createSnapshot();
    const mobile = {
      ...createSnapshot(),
      buttons: ["Start Free", "Watch Demo"],
      headings: ["Launch tasteful product pages faster."],
    };
    const bundle = extractWebSource({
      id: "acme-landing",
      title: "Acme Landing",
      capturedAt: "2026-04-14T00:00:00.000Z",
      url: "https://example.com",
      desktop,
      mobile,
      screenshots: ["agent-wiki/assets/web/acme/desktop.png", "agent-wiki/assets/web/acme/mobile.png"],
    });

    expect(bundle.kind).toBe("web");
    expect(bundle.source.url).toBe("https://example.com");
    expect(bundle.structure.headings).toContain("Launch tasteful product pages faster.");
    expect(bundle.evidence.screenshots).toContain("agent-wiki/assets/web/acme/desktop.png");
    expect(bundle.style?.cssVariables[0]).toEqual({ name: "--color-brand", value: "#ff5a36" });
  });

  it("builds a pdf bundle from extracted page text", () => {
    const bundle = extractPdfSource({
      id: "example-paper",
      title: "Example Paper",
      capturedAt: "2026-04-14T00:00:00.000Z",
      path: "papers/example.pdf",
      url: "https://example.com/example.pdf",
      pageCount: 2,
      pages: [
        { number: 1, text: "Example Paper\nIntroduction to the method.\nKey result one." },
        { number: 2, text: "Evaluation\nKey result two.\nConclusion." },
      ],
      citations: [{ label: "Example PDF", target: "https://example.com/example.pdf" }],
    });

    expect(bundle.kind).toBe("pdf");
    expect(bundle.source.path).toBe("papers/example.pdf");
    expect(bundle.structure.sections[0]?.title).toBe("Page 1");
    expect(bundle.structure.headings).toContain("Example Paper");
    expect(bundle.evidence.citations?.[0]?.target).toBe("https://example.com/example.pdf");
  });
});
