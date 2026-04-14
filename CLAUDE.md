# Claude Instructions

On each loop:

1. detect the best skill in `skills/`
2. read the linked notes in `agent-wiki/notes/`
3. act from the skill body plus those notes
4. record grounded events in `agent-wiki/events/`
5. promote repeated gaps into notes or skills
6. refresh `agent-wiki/index.md`, `log.md`, `lint.md`, and `hot.md`

Useful commands:

- `datalox capture-web --repo . --url <url> --artifact design-doc`
- `datalox capture-web --repo . --url <url> --artifact design-tokens`
- `datalox capture-pdf --repo . --path <pdf-path>`
