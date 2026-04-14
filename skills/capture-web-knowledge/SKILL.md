---
name: capture-web-knowledge
description: Use when an existing website needs to be captured into repo-local knowledge an agent can reuse.
metadata:
  datalox:
    id: web-capture.capture-web-knowledge
    workflow: web_capture
    trigger: Use when analyzing a website's layout, tokens, and components into reusable repo knowledge.
    note_paths:
      - agent-wiki/notes/capture-web-knowledge.md
    tags:
      - web_capture
      - design_doc
      - website_analysis
      - agent_memory
    status: approved
    author: yifanjin
    updated_at: 2026-04-13T00:00:00.000Z
---

# Capture Web Knowledge

Use this skill when an existing website should become reusable repo-local knowledge instead of a one-off screenshot or chat summary.

## When to Use

- Reverse-engineering an existing website into reusable repo knowledge
- Capturing a design system before recreating a page in code
- Giving an agent a visual source of truth instead of relying on vague style descriptions

## When Not to Use

- Editing a design system that already has an accurate design brief under `designs/web/`
- Pure content scraping without layout or visual-system intent
- Pixel-perfect visual QA after implementation

## Workflow

1. Ensure browser capture is available once on the machine:
   `npx playwright install chromium`
2. Run the generic web capture path instead of freehand summarizing:
   `datalox capture-web --repo . --url <url> --artifact design-doc`
3. Read the generated outputs together:
   - `designs/web/<slug>.md`
   - `agent-wiki/notes/web/<slug>.md`
   - `agent-wiki/assets/web/<slug>/desktop.png`
   - `agent-wiki/assets/web/<slug>/mobile.png`
4. Use `designs/web/<slug>.md` as the working brief when the task is visual recreation.
5. If implementation work needs reusable variables, emit them directly:
   `datalox capture-web --repo . --url <url> --artifact css-variables`
6. Use `--artifact design-tokens` for normalized JSON tokens and `--artifact tailwind-theme` only when the target stack actually needs a Tailwind theme file.
7. If the task only needs source evidence, use `datalox capture-web --artifact source-page` instead of forcing a design brief.
8. If the site has multiple important routes, capture them separately and patch the right artifact intentionally instead of merging everything into one vague note.
9. If a capture is worth showing publicly, publish that specific slug with `datalox publish-web-capture --repo . --capture <slug>` instead of dumping raw local workspace files into a showcase repo.

## Checks Before Editing

- Prefer factual extracted tokens, sections, and components over subjective style adjectives.
- Keep the final design brief useful for another agent that never saw the original site.
- Treat screenshots and source pages as evidence, not as the agent-facing brief.

## Expected Output

- A reusable note under `agent-wiki/notes/web/`
- Desktop and mobile screenshots under `agent-wiki/assets/web/<slug>/`
- An optional `designs/web/<slug>.md` artifact when `--artifact design-doc` is used
- An optional `designs/web/<slug>.vars.css` artifact when `--artifact css-variables` is used
- A log entry in `agent-wiki/log.md`
- A publish path into object storage when the capture should join the public corpus

## Notes

- agent-wiki/notes/capture-web-knowledge.md
