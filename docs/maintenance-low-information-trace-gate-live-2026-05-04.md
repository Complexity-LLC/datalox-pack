# Maintenance Low-Information Trace Gate Live Proof - 2026-05-04

## Goal

Prove bounded maintenance drains low-information trace backlog without converting placeholder runs into active reusable notes.

## Covered Cases

1. Repeated low-information hook-like traces are drained with event metadata:
   - `maintenanceStatus: "drained_non_actionable"`
   - `maintenanceDrainReason: "low_information_trace_group"`
   - `maintenanceDrainedAt: <timestamp>`
2. No active note is created for the low-information group.
3. A matching existing bad note is archived, not deleted.
4. Re-running maintenance does not resurface the drained group.
5. A repeated trace with concrete interpretation and recommended action still creates a normal active operational note, even when `workflow: "unknown"`.
6. Singleton trace rollups are archived history, not active reusable guidance.

## Verification

Commands run from the repo root:

```bash
npm run build
npx vitest run tests/bridgeSurfaces.test.ts -t "maintenance|singleton|low-information|unknown"
npx vitest run tests/bridgeSurfaces.test.ts tests/wrapperSurfaces.test.ts tests/hookIntegration.test.ts tests/agentScripts.test.ts
```

Results:

- `npm run build` passed.
- Focused maintenance coverage passed: `7 passed`.
- Expanded bridge/wrapper/hook/agent-script coverage passed: `85 passed`.

## Boundary

The quality gate is deterministic. It only drains groups whose repeated fields are placeholders or operational metadata noise and that have no linked skill/note target and no concrete reusable action. Concrete repeated traces remain eligible for normal note compaction.
