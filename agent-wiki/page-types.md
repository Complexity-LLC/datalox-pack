# Agent Wiki Page Types

`agent-wiki/` is not only a pattern folder.

Use page types with different jobs:

- `patterns/`: loop-time judgment and action pages
- `sources/`: origin pages that justify claims
- `concepts/`: reusable domain ideas behind multiple patterns
- `comparisons/`: choice pages for competing workflows or interpretations
- `questions/`: recurring open questions with current answers
- `meta/`: maintenance and control pages for the wiki itself

For the runtime loop:

1. skills select the first pattern pages
2. pattern pages may point to `related` or `sources`
3. agents drill into those follow-up pages only when needed

This keeps the loop small while letting knowledge compound over time.
