#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: strict-gate.sh <pr-number>
Require CodeRabbit approval on the current head, no unresolved threads,
no Critical/Major in the latest CodeRabbit review, and passing head
checks/statuses. typecheck, unit, golden, and CodeRabbit Security must be present.
CodeRabbit Security also accepts neutral when completed on the current head.
All other checks require success. The latest CodeRabbit summary's Pre-merge checks
must contain a Security Gate row with the passed status image.
The same summary must have reviewed risk coverage for the current head.
Skipped GitHub checks do not pass.
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
gh api --paginate --slurp "repos/$repo/issues/$pr/comments?per_page=100" > "$tmp/comments.json"
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
const summary = read('comments.json').flat()
  .filter((comment) => ['coderabbitai', 'coderabbitai[bot]'].includes(comment.user?.login)
    && comment.body?.includes('Pre-merge checks'))
  .sort((a, b) => Date.parse(a.updated_at ?? a.created_at) - Date.parse(b.updated_at ?? b.created_at) || a.id - b.id)
  .at(-1);
if (!summary) {
  failures.push('CodeRabbit summary with Pre-merge checks is missing');
} else {
  const coverageMarkers = [...summary.body.matchAll(/<!--\s*final_review_risk_coverage\s*:\s*([\s\S]*?)-->/g)];
  const markerCount = (summary.body.match(/<!--\s*final_review_risk_coverage\b/g) ?? []).length;
  const coversHead = coverageMarkers.length > 0 && coverageMarkers.length === markerCount
    && coverageMarkers.every(([, json]) => {
      try {
        const coverage = JSON.parse(json);
        return coverage?.kind === 'reviewed' && coverage.coveredCommitId === head;
      } catch {
        return false;
      }
    });
  if (!coversHead) failures.push(`Security Gate summary does not cover head ${head}`);
  const marker = summary.body.indexOf('Pre-merge checks');
  const stack = [];
  const tags = [...summary.body.matchAll(/<\/?details\b[^>]*>/gi)];
  for (const tag of tags) {
    if (tag.index > marker) break;
    if (tag[0].startsWith('</')) stack.pop();
    else stack.push(tag.index);
  }
  const start = stack.at(-1) ?? marker;
  let end = summary.body.length;
  if (stack.length) {
    let depth = 0;
    for (const tag of tags.filter((tag) => tag.index >= start)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = tag.index; break; }
    }
  } else {
    const nextHeading = summary.body.slice(marker).search(/\n#{1,6}\s/);
    if (nextHeading !== -1) end = marker + nextHeading;
  }
  const rows = [...summary.body.slice(start, end).matchAll(/^\s*\|\s*Security Gate\s*\|([^|\n]*)\|/gm)];
  if (!rows.length) {
    failures.push('Security Gate row is missing from latest CodeRabbit summary');
  } else if (rows.length !== 1 || !/^!\[[^\]]*\]\(https:\/\/storage\.googleapis\.com\/coderabbit_public_assets\/pre-merge-checks-passed\.svg\)$/.test(rows[0][1].trim())) {
    failures.push('Security Gate status is not passed in latest CodeRabbit summary');
  }
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
  const passing = check.conclusion === 'success' ||
    (check.name === 'CodeRabbit Security' && check.conclusion === 'neutral');
  if (check.head_sha !== head || check.status !== 'completed' || !passing) {
    failures.push(`check ${check.name}: ${check.status}/${check.conclusion ?? 'pending'}`);
  }
}
for (const status of statuses.values()) {
  if (status.state !== 'success') failures.push(`status ${status.context}: ${status.state}`);
}
const names = new Set([...checks.map((check) => check.name), ...statuses.keys()]);
for (const name of ['typecheck', 'unit', 'golden', 'CodeRabbit Security']) {
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
