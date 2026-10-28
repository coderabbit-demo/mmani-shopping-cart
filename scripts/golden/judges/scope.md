# Judge 1 — Scope and intent

Apply `preamble.md`. Check only scope and intent:

- Every changed file is needed for the brief.
- No intent drift: no new public API, option or dependency that the brief did not ask for.
- The PR stays within the size limit (under 30 changed files, excluding goldens).
- A fix round addresses every listed finding and nothing else.

## Validation note

On a known-good round all four should pass; on a planted bad round (an unrelated file edit, a deleted test, a missing fix, a review-quoting comment with a TODO) each judge should fail for its own property.

End with `VERDICT: PASS` or `VERDICT: FAIL`, followed by your reasons, each citing file and line.
