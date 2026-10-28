# Judge 4 — Security, data and hygiene

Apply `preamble.md`. Check only security, data and hygiene:

- No secrets.
- No interpolated SQL or other sinks fed by untrusted input; queries stay read-only and lean.
- No widened privacy guard.
- No new dependency.
- No agent artifacts: reasoning comments, new TODOs, debug prints, or “As requested by the review…” style comments.

The scaffold brief explicitly approves its initial dependency set; apply that approved exception in PR 0.

## Validation note

On a known-good round all four should pass; on a planted bad round (an unrelated file edit, a deleted test, a missing fix, a review-quoting comment with a TODO) each judge should fail for its own property.

End with `VERDICT: PASS` or `VERDICT: FAIL`, followed by your reasons, each citing file and line.
