#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: scope-gate.sh <base> <head> [allow-file]
Compare head against its merge base with base.
Reject protected files unless covered by an ALLOW: glob in allow-file.
With allow-file, every changed file must match an ALLOW: glob.
Globs match repository-relative paths: * stays within one path segment;
** as a whole segment matches across zero or more path segments.
Renames check both the old and new paths. Deletions are checked too.
HELP
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
passed=0
changes=
finish() {
  local status=$?
  trap - EXIT
  if [[ -n $changes ]]; then rm -f "$changes" || status=1; fi
  if [[ $status == 0 && $passed != 1 ]]; then
    printf 'FAIL: scope evaluation ended without PASS\n' >&2
    status=1
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

matches_path() {
  local path=$1 glob=$2 first rest
  if [[ $glob == '**' ]]; then return 0; fi
  if [[ $glob != */* ]]; then
    [[ $path != */* && $path == $glob ]]
    return
  fi
  first=${glob%%/*}
  rest=${glob#*/}
  if [[ $first == '**' ]]; then
    if matches_path "$path" "$rest"; then return 0; fi
    if [[ $path == */* ]]; then
      matches_path "${path#*/}" "$glob"
      return
    fi
    return 1
  fi
  if [[ $path != */* || ${path%%/*} != $first ]]; then return 1; fi
  matches_path "${path#*/}" "$rest"
}

if [[ $# -lt 2 || $# -gt 3 ]]; then usage >&2; exit 2; fi
base=$(git rev-parse --verify --end-of-options "$1^{commit}")
head=$(git rev-parse --verify --end-of-options "$2^{commit}")
merge_base=$(git merge-base "$base" "$head")
repo=$(git rev-parse --show-toplevel)
patterns=()
if [[ $# == 3 ]]; then
  if [[ ! -f $3 ]]; then printf 'Allow file not found: %s\n' "$3" >&2; exit 2; fi
  while IFS= read -r line || [[ -n $line ]]; do
    if [[ $line == ALLOW:* ]]; then
      pattern=${line#ALLOW:}
      pattern="${pattern#"${pattern%%[![:space:]]*}"}"
      pattern="${pattern%"${pattern##*[![:space:]]}"}"
      if [[ -n $pattern ]]; then patterns+=("$pattern"); fi
    fi
  done < "$3"
fi
changes=$(mktemp)
# Disable rename detection so both paths must satisfy the allowlist.
git -C "$repo" diff --no-ext-diff --no-renames --name-only -z "$merge_base" "$head" -- > "$changes"
failed=0
while IFS= read -r -d '' path; do
  allowed=0
  for pattern in ${patterns[@]+"${patterns[@]}"}; do
    if matches_path "$path" "$pattern"; then allowed=1; break; fi
  done
  protected=0
  case "$path" in
    package.json|package-lock.json|.github/*|tests/golden/*) protected=1 ;;
  esac
  if [[ $allowed == 0 && ( $# == 3 || $protected == 1 ) ]]; then
    printf 'FAIL: outside approved scope: %q\n' "$path" >&2
    failed=1
  fi
done < "$changes"
if [[ $failed == 0 ]]; then
  printf 'PASS: diff is within scope\n'
  passed=1
fi
exit "$failed"
