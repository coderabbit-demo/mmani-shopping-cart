# Brief 00b — `chore: automatic PR opening`

**Mode:** Brownfield, pipeline tooling only. Runs after PR 0 merges.
**Read first:** `docs/PLAN.md`, "Per-step loop", step 5.

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

## ALLOW

```
ALLOW: scripts/golden/open-pr.sh
ALLOW: scripts/golden/scope-gate.sh
ALLOW: tests/scripts.test.mjs
```

## Required checks

`npm ci && npm run typecheck && npm test && npm run golden:check && npm run build`, also with bash 3.2 first in `PATH` if available.

## Report

The changed files, the output of each check, and the test that covers each behavior.
