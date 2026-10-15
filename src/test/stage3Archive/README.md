# Retired stage-three policy tests

These six files are byte-preserved historical test entrypoints from main
`e59da20`. Their `.txt` suffix keeps them out of current test discovery and
TypeScript compilation after the stage-three live tactics were retired.

The four evaluation entrypoints require frozen historical bundles and policies;
they do not define acceptance for the restored current policy. The original
Hunter D attack-coupling assertions and A/C comparisons also stay archived.
The six portable spacing/reload/avoidance checks from `hunterReload.test.ts`
are active again in that file; its historical comparisons remain archived.
The 24 fixed Hunter observations from `hunterD.test.ts` are reused in
`stage3Revert.test.ts` against the same-current-rule legacy policy, without the
retired C-specific shot-admission requirements.
Their original versions, the original evaluation tools, reports and
result specifications remain available. No match result or frozen bundle was
deleted or overwritten.

Current cancellation checks are in `stage3Revert.test.ts`. Predictor correctness
checks remain active in `stage3.test.ts` and `stage3CurrentRules.test.ts`.
`hunter.ts`, `rangedShots.ts` and `rangedEnvironment.ts` are retained for these
historical diagnostics, and have no live controller/combat/navigation callers.
