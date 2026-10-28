# Brief 00b — `chore: automatic PR opening`

**Mode:** Brownfield, pipeline tooling only. Runs after PR 0 merges.
**Read first:** `docs/PLAN.md`, "Per-step loop", steps 1–6.

## Assumptions (verified 2026-10-28)

- `gh` 2.100.0 is on the orchestrator's machine. `gh pr create` takes `--base`, `--head`, `--title` and `--body-file`.
- The check-runs on a recent PR head (4c4ac45) are `CodeRabbit`, `CodeRabbit Security`, `golden`, `typecheck` and `unit`. The Security Gate is a pre-merge table row, not a check-run.
- The orchestrator runs macOS `/bin/bash` 3.2.57 with Node 24; CI runs Ubuntu with Node 22. Windows matters only for portability in tests.

## Goal

When verification is green, the pipeline opens the step's PR with no maintainer prompt.

## Deliverables

1. **`scripts/golden/open-pr.sh <branch> <brief-file> <results-file>`**
   - POSIX bash, `set -euo pipefail`, `--help`. Must work on macOS `/bin/bash` 3.2 and on bash 5. No new dependencies; uses `gh`.
   - Title: the backticked text in the brief's first `#` heading, for example `chore: scaffold + framework contract`.
   - Body: a link to the brief, then the results file verbatim (validation results, judge verdicts, red-then-green lists, skipped findings). It ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   - If an open PR already exists for the branch, update its body and print its URL. Otherwise, run `gh pr create --base main --head <branch>`.
   - Afterwards, post a `@coderabbitai test` comment once per PR. Skip it if an identical comment already exists.
   - Print the PR URL as the last line of stdout. Exit nonzero on any `gh` failure and never print a URL in that case. No path may exit 0 without a URL; use the fail-closed EXIT-trap pattern from `scope-gate.sh`.
   - Inputs are validated:
     - the branch name matches `^[A-Za-z0-9._/-]+$` and does not start with `-`;
     - both files exist;
     - the brief file is under `docs/briefs/`.

2. **`tests/scripts.test.mjs`** — tests driven by the fake-`gh` harness already used for `strict-gate.sh`:
   - creates a PR when none exists;
   - updates the body of an existing PR and creates no duplicate;
   - posts the `@coderabbitai test` comment exactly once across two runs;
   - exits nonzero, printing no URL, when `gh pr create` fails;
   - rejects a bad branch name and a brief outside `docs/briefs/`;
   - each test asserts the exit code and the stdout/stderr content.

3. **`scripts/golden/scope-gate.sh` compares from the merge base.**
   - Today it diffs `<base>` against `<head>` directly. Once `main` moves past the branch point, commits on `main` show up as branch changes and fail the gate. This happened on PR 0: the docs commit 1424799 on `main` was reported as out of scope.
   - Fix: diff `$(git merge-base <base> <head>)` against `<head>`.
   - Guard: a test where `main` gains a commit after the branch point and the gate still passes for an in-scope branch change.

4. **`scripts/golden/judges/scope.md` also checks the brief.** Add a check: every outside fact the brief assumes (under `## Assumptions (verified)`, or implied by its deliverables: check names, CLI flags, platforms, CodeRabbit settings) holds in the repo and environment. A wrong assumption is a FAIL with the evidence. Docs only; exempt from the test rule.

5. **`scripts/golden/judges/preamble.md` says judges take no hints.** State that the judge works only from the diff, the brief or fix-round message, and its property brief, and that it covers its whole property even if the orchestrator's message seems to point somewhere. Docs only; exempt from the test rule.

## CLI review (required before finishing)

Before finishing, run `coderabbit review --agent --committed --base main`. Fix valid findings only within the ALLOW globs, with a test for each behavior or security fix. In the report, list every CLI finding as fixed or skipped, with the reason. Never change a file outside ALLOW to satisfy a finding; report it instead.

## ALLOW

```
ALLOW: scripts/golden/open-pr.sh
ALLOW: scripts/golden/scope-gate.sh
ALLOW: tests/scripts.test.mjs
ALLOW: scripts/golden/judges/scope.md
ALLOW: scripts/golden/judges/preamble.md
```

## Required checks

`npm ci && npm run typecheck && npm test && npm run golden:check && npm run build`, also with bash 3.2 first in `PATH` if available.

## Report

The changed files, the output of each check, the test that covers each behavior, and the CLI-review finding list (fixed or skipped, with reasons).
