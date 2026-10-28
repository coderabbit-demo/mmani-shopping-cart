#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: red-green.sh <base> <head> <test-file>...
Run each named head test against base (must fail) and head (must pass).
Tests must be repository-relative .test.mjs files. Head test contents are
copied into base so a missing test at base cannot itself count as red.
Each worktree uses its own npm ci when it has a package.json. Installation,
missing test files, and syntax errors are setup failures, not red results.
Requires Git, Node >=22.6.0, npm, and Bash. Temporary worktrees are removed.
HELP
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
if [[ $# -lt 3 ]]; then usage >&2; exit 2; fi
base=$(git rev-parse --verify --end-of-options "$1^{commit}")
head=$(git rev-parse --verify --end-of-options "$2^{commit}")
shift 2
for file in "$@"; do
  case "$file" in
    /*|..|../*|*/../*|*/..|-*) printf 'Invalid test path: %s\n' "$file" >&2; exit 2 ;;
    *.test.mjs) ;;
    *) printf 'Expected a .test.mjs file: %s\n' "$file" >&2; exit 2 ;;
  esac
done
repo=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
cleanup() {
  git -C "$repo" worktree remove --force "$tmp/base" >/dev/null 2>&1 || true
  git -C "$repo" worktree remove --force "$tmp/head" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
git -C "$repo" worktree add --detach "$tmp/base" "$base"
git -C "$repo" worktree add --detach "$tmp/head" "$head"
for file in "$@"; do
  if [[ ! -f $tmp/head/$file || -L $tmp/head/$file ]]; then
    printf 'Head test missing or not a regular file: %s\n' "$file" >&2
    exit 2
  fi
  node --check "$tmp/head/$file"
  mkdir -p "$tmp/base/$(dirname "$file")"
  cp "$tmp/head/$file" "$tmp/base/$file"
done
for revision in base head; do
  if [[ -f $tmp/$revision/package.json ]]; then
    (cd "$tmp/$revision" && npm ci)
  fi
done
failed=0
for file in "$@"; do
  if (cd "$tmp/base" && node --experimental-strip-types --test "$file"); then
    printf 'FAIL: test is not red on base: %s\n' "$file" >&2
    failed=1
  else
    printf 'RED: %s\n' "$file"
  fi
  if (cd "$tmp/head" && node --experimental-strip-types --test "$file"); then
    printf 'GREEN: %s\n' "$file"
  else
    printf 'FAIL: test is not green on head: %s\n' "$file" >&2
    failed=1
  fi
done
exit "$failed"
