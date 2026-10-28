#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: open-pr.sh <branch> <brief-file> <results-file>
Create a PR against main or update an open PR for the branch, then request
@coderabbitai test once per PR. The brief must be under docs/briefs/.
Requires authenticated gh, Git, Node >=22.6.0, and Bash >=3.2.
After every operation succeeds, print the PR URL as the last stdout line.
HELP
}

if [[ $# == 1 && $1 == --help ]]; then usage; exit 0; fi
completed=0
tmp=
url=
finish() {
  local status=$?
  trap - EXIT
  if [[ -n $tmp ]] && ! rm -rf "$tmp"; then
    printf 'FAIL: could not remove PR temporary files\n' >&2
    status=1
  fi
  if [[ $status == 0 && ( $completed != 1 || -z $url ) ]]; then
    printf 'FAIL: PR operation ended without a URL\n' >&2
    status=1
  fi
  if [[ $status == 0 ]]; then printf '%s\n' "$url"; fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ $# != 3 ]]; then usage >&2; exit 2; fi
tmp=$(mktemp -d)
node --input-type=module - "$1" "$2" "$3" "$tmp" <<'JS'
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const [branch, briefFile, resultsFile, directory] = process.argv.slice(2);
function fail(message) { throw new Error(message); }
function gh(...args) {
  try {
    const command = args[0] === 'api' ? `set -o pipefail
      gh "$@" | {
        matched=false
        valid=true
        seen=false
        while IFS= read -r count || [[ -n $count ]]; do
          seen=true
          case $count in
            ''|*[!0-9]*) valid=false ;;
            *[1-9]*) matched=true ;;
          esac
        done
        if [[ $valid == true && $seen == true ]]; then
          printf '%s\\n' "$matched"
        else
          printf 'null\\n'
        fi
      }` : 'exec gh "$@"';
    return execFileSync('bash', ['-c', command, 'gh', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    process.exitCode = Number.isInteger(error.status) && error.status > 0 ? error.status : 1;
    fail(`gh ${args.slice(0, args[0] === 'api' ? 1 : 2).join(' ')} failed (exit ${process.exitCode})`);
  }
}
function json(value) {
  try { return JSON.parse(value); } catch { fail('Invalid JSON returned by gh'); }
}

try {
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('-')) fail('Invalid branch');
  try {
    if (!statSync(briefFile).isFile() || !statSync(resultsFile).isFile()) throw new Error();
  } catch { fail('Brief and results must be existing files'); }
  const repoRoot = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim());
  const briefPath = realpathSync(briefFile);
  const withinBriefs = relative(join(repoRoot, 'docs', 'briefs'), briefPath);
  if (isAbsolute(withinBriefs) || withinBriefs === '..' || withinBriefs.startsWith(`..${sep}`)) {
    fail('Brief must be under docs/briefs/');
  }
  const brief = readFileSync(briefPath, 'utf8');
  const heading = brief.match(/^#[ \t]+(.+)$/m)?.[1];
  const title = heading?.match(/`([^`\r\n]+)`/)?.[1];
  const issues = [...brief.matchAll(/\*\*Jira:\*\*[ \t]*([A-Z][A-Z0-9]*-[0-9]+)(?=[ \t\r\n]|$)/g)];
  if (!title?.trim() || issues.length !== 1) fail('Brief must contain a backticked title in its first # heading and one valid **Jira:** field');
  const results = readFileSync(resultsFile);
  const repo = json(gh('repo', 'view', '--json', 'nameWithOwner,url'));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo?.nameWithOwner) ||
      typeof repo.url !== 'string' || !repo.url.startsWith('https://')) fail('Invalid repository returned by gh');
  const encodeLink = (part) => encodeURIComponent(part).replaceAll('(', '%28').replaceAll(')', '%29');
  const briefLink = `${repo.url}/blob/${encodeLink(branch)}/${relative(repoRoot, briefPath).split(sep).map(encodeLink).join('/')}`;
  const bodyFile = join(directory, 'body.md');
  writeFileSync(bodyFile, Buffer.concat([
    Buffer.from(`Jira: ${issues[0][1]}\n\n[Brief](${briefLink})\n\n`),
    results,
    Buffer.from('\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n'),
  ]));
  const listed = json(gh('pr', 'list', '--head', branch, '--state', 'open', '--limit', '1000', '--json', 'number,url,isCrossRepository'));
  if (!Array.isArray(listed) || listed.some((pr) => typeof pr?.isCrossRepository !== 'boolean')) fail('Invalid PR list returned by gh');
  const matches = listed.filter((pr) => !pr.isCrossRepository);
  if (matches.length > 1) fail('Multiple open PRs for branch');
  function prNumber(url) {
    const prefix = `${repo.url}/pull/`;
    if (typeof url !== 'string' || !url.startsWith(prefix) || !/^[1-9][0-9]*$/.test(url.slice(prefix.length))) fail('Invalid PR URL returned by gh');
    return url.slice(prefix.length);
  }
  let url;
  let number;
  if (matches.length) {
    url = matches[0].url;
    number = prNumber(url);
    if (!Number.isSafeInteger(matches[0].number) || String(matches[0].number) !== number) fail('Invalid PR number returned by gh');
    gh('pr', 'edit', number, '--body-file', bodyFile);
  } else {
    url = gh('pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body-file', bodyFile).trim();
    number = prNumber(url);
  }
  const matched = json(gh('api', '--paginate', `repos/${repo.nameWithOwner}/issues/${number}/comments?per_page=100`,
    '--jq', 'if type == "array" and all(.[]; (.body | type) == "string") then [.[] | select(.body == "@coderabbitai test")] | length else -1 end'));
  if (typeof matched !== 'boolean') fail('Invalid comments returned by gh');
  if (!matched) {
    gh('pr', 'comment', number, '--body', '@coderabbitai test');
  }
  writeFileSync(join(directory, 'url'), url);
} catch (error) {
  process.stderr.write(`FAIL: ${error.message}\n`);
  process.exitCode ||= 1;
}
JS
url=$(cat "$tmp/url")
completed=1
