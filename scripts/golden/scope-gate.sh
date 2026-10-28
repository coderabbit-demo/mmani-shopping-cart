#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: scope-gate.sh <base> <head> [allow-file]
Reject protected files unless covered by an ALLOW: glob in allow-file.
With allow-file, every changed file must match an ALLOW: glob.
Globs use Bash pattern matching against repository-relative paths; * spans /.
Renames check both the old and new paths. Deletions are checked too.
HELP
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
if [[ $# -lt 2 || $# -gt 3 ]]; then usage >&2; exit 2; fi
base=$(git rev-parse --verify --end-of-options "$1^{commit}")
head=$(git rev-parse --verify --end-of-options "$2^{commit}")
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
trap 'rm -f "$changes"' EXIT
# Disable rename detection so both paths must satisfy the allowlist.
git -C "$repo" diff --no-ext-diff --no-renames --name-only -z "$base" "$head" -- > "$changes"
failed=0
while IFS= read -r -d '' path; do
  allowed=0
  for pattern in "${patterns[@]}"; do
    if [[ $path == $pattern ]]; then allowed=1; break; fi
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
if [[ $failed == 0 ]]; then printf 'PASS: diff is within scope\n'; fi
exit "$failed"
