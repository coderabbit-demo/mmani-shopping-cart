#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: strict-gate.sh <pr-number>
Require CodeRabbit approval on the current head, no unresolved threads,
no Critical/Major in the latest CodeRabbit review, and successful head
checks/statuses. typecheck, unit, golden, CodeRabbit Security, and Security
Gate must be present and successful. Skipped/neutral checks do not pass.
Requires authenticated gh, Node >=22.6.0, and Bash. Read-only GitHub calls.
HELP
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
if [[ $# != 1 || ! $1 =~ ^[1-9][0-9]*$ ]]; then usage >&2; exit 2; fi
trap 'printf "FAIL: could not retrieve or evaluate GitHub gate data\n" >&2' ERR
repo=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
owner=${repo%%/*}
name=${repo#*/}
pr=$1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
head=$(gh api "repos/$repo/pulls/$pr" --jq '.head.sha')
if [[ ! $head =~ ^[0-9a-f]{40}$ ]]; then printf 'FAIL: invalid head SHA\n' >&2; exit 1; fi
gh api --paginate --slurp "repos/$repo/pulls/$pr/reviews?per_page=100" > "$tmp/reviews.json"
gh api graphql --paginate --slurp -F owner="$owner" -F name="$name" -F number="$pr" -f query='
query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes { isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}' > "$tmp/threads.json"
gh api --paginate --slurp "repos/$repo/commits/$head/check-runs?per_page=100&filter=latest" > "$tmp/checks.json"
gh api --paginate --slurp "repos/$repo/commits/$head/statuses?per_page=100" > "$tmp/statuses.json"
result=0
node --input-type=module - "$tmp" "$head" <<'JS' || result=$?
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [directory, head] = process.argv.slice(2);
const read = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
const failures = [];
const reviews = read('reviews.json').flat()
  .filter((review) => ['coderabbitai[bot]', 'coderabbitai'].includes(review.user?.login))
  .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || a.id - b.id);
const decisive = reviews.filter((review) => ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)).at(-1);
if (decisive?.state !== 'APPROVED' || decisive.commit_id !== head) {
  failures.push('CodeRabbit has not approved the current head');
}
const latest = reviews.at(-1);
if (!latest) failures.push('CodeRabbit review is missing');
else if (/\b(Critical|Major)\b/i.test(latest.body ?? '')) {
  failures.push('latest CodeRabbit review contains Critical or Major');
}
const threads = read('threads.json').flatMap((page) => {
  if (page.errors?.length) throw new Error('GitHub returned GraphQL errors');
  return page.data.repository.pullRequest.reviewThreads.nodes;
});
const unresolved = threads.filter((thread) => thread.isResolved !== true).length;
if (unresolved) failures.push(`${unresolved} unresolved review thread(s)`);
const checks = read('checks.json').flatMap((page) => page.check_runs);
const statuses = new Map();
for (const status of read('statuses.json').flat()) {
  if (!statuses.has(status.context)) statuses.set(status.context, status);
}
for (const check of checks) {
  if (check.head_sha !== head || check.status !== 'completed' || check.conclusion !== 'success') {
    failures.push(`check ${check.name}: ${check.status}/${check.conclusion ?? 'pending'}`);
  }
}
for (const status of statuses.values()) {
  if (status.state !== 'success') failures.push(`status ${status.context}: ${status.state}`);
}
const names = new Set([...checks.map((check) => check.name), ...statuses.keys()]);
for (const name of ['typecheck', 'unit', 'golden', 'CodeRabbit Security', 'Security Gate']) {
  if (!names.has(name)) failures.push(`required check is missing: ${name}`);
}
for (const failure of failures) console.error(`FAIL: ${failure}`);
process.exitCode = failures.length ? 1 : 0;
JS
current_head=$(gh api "repos/$repo/pulls/$pr" --jq '.head.sha')
if [[ $current_head != "$head" ]]; then
  printf 'FAIL: PR head changed during gate evaluation; run again\n' >&2
  result=1
fi
if [[ $result == 0 ]]; then printf 'PASS: strict gate for PR #%s at %s\n' "$pr" "$head"; fi
exit "$result"
