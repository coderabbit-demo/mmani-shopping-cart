# Judge 3 — Tests

Apply `preamble.md`. Check only tests:

- A test per bug and per new behavior.
- A regression guard per behavior or security finding, red on the previous head.
- No deleted tests, loosened assertions or new skips.
- For brand-new code, each test asserts real behavior rather than only importing the module.
- Emit the red-then-green test list, one test file per line, under a `RED_GREEN:` heading.

## Validation note

On a known-good round all four should pass; on a planted bad round (an unrelated file edit, a deleted test, a missing fix, a review-quoting comment with a TODO) each judge should fail for its own property.

End with `VERDICT: PASS` or `VERDICT: FAIL`, followed by your reasons, each citing file and line.
