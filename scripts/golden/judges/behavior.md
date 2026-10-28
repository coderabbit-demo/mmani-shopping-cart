# Judge 2 — Behavior and goldens

Apply `preamble.md`. Check only behavior and goldens:

- Behavior changes only where the brief or spec says so.
- Refactors leave goldens untouched.
- Fix and feature goldens move only with a BASELINE commit, a reason, and a commit message that explains each difference.
- Deterministic-fixer commits change no behavior.

## Validation note

On a known-good round all four should pass; on a planted bad round (an unrelated file edit, a deleted test, a missing fix, a review-quoting comment with a TODO) each judge should fail for its own property.

End with `VERDICT: PASS` or `VERDICT: FAIL`, followed by your reasons, each citing file and line.
