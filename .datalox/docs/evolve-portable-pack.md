# Evolve portable pack

## When to use this

Use this when you are changing the repo-local knowledge pack, agent instructions, or the local-first workflow around `.datalox/`.

## Steps

1. Preserve the repo as the source of truth for approved skills, docs, and views.
2. Keep Datalox additive to an agent's native skill system.
3. Put immediate-use self-updates into `.datalox/working/`.
4. Put review-oriented candidates into `.datalox/proposals/`.
5. Avoid changing server logic unless the task actually needs server behavior.

## Judgment patterns

- If a tool resolves the right files but still feels hard to use, improve the summary output before adding more configuration.
- If a new behavior is only useful to the current agent right now, keep it in the working layer instead of promoting it immediately.
- If a change would replace or hide an agent platform's own built-in skills, that is the wrong boundary.

## Escalation rules

- Escalate when a change affects both the portable pack contract and the server/runtime contract.
- Escalate when a local working overlay should become approved shared knowledge.
