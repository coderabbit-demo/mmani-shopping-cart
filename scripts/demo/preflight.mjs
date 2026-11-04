import { execFile } from 'node:child_process';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

const repo = 'coderabbit-demo/mmani-shopping-cart';
const endpoint = 'https://api.us3.datadoghq.com/api/v2/validate_keys';
const limit = 1024 * 1024;

function command(file, args) {
  const env = { ...process.env };
  delete env.DD_API_KEY;
  delete env.DD_APP_KEY;
  delete env.DD_APPLICATION_KEY;
  return new Promise((resolve, reject) => {
    execFile(file, args, { env, encoding: 'utf8', timeout: 15000, maxBuffer: limit, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function validateKeys(_url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(endpoint, { headers, timeout: 15000 }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
        if (data.length > 16384) request.destroy(new Error('response too large'));
      });
      response.on('error', (error) => { clearTimeout(deadline); reject(error); });
      response.on('end', () => { clearTimeout(deadline); resolve({ status: response.statusCode, body: data }); });
    });
    const deadline = setTimeout(() => request.destroy(new Error('timeout')), 15000);
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => { clearTimeout(deadline); reject(error); });
  });
}

function json(text) { return JSON.parse(text); }
function eventLines(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(json); }
function result(status, action) { return { status, action }; }

export async function preflight({ run = command, http = validateKeys, env = process.env, nodeVersion = process.versions.node } = {}) {
  const checks = {};
  const check = async (name, action, fn) => {
    try { checks[name] = await fn(); }
    catch { checks[name] = result('blocked', action); }
  };
  const pass = () => result('pass', 'No action needed.');
  const fail = (action) => result('fail', action);
  const blocked = (action) => result('blocked', action);
  const call = (file, ...args) => run(file, args);

  await check('node', 'Install the required Node runtime.', async () => {
    const parts = nodeVersion.split('.').map(Number);
    return parts[0] > 22 || (parts[0] === 22 && parts[1] >= 6) ? { ...pass(), version: parts.slice(0, 3).join('.') } : fail('Use Node 22.6 or later.');
  });
  for (const [name, args] of Object.entries({ npm: ['--version'], bash: ['--version'], git: ['--version'], gh: ['--version'], gcloud: ['--version'], terraform: ['--version'], coderabbit: ['--version'], docker: ['--version'] })) {
    await check(`tool_${name}`, `Install or repair ${name}.`, async () => {
      const version = (await call(name, ...args)).match(/\b\d+\.\d+(?:\.\d+)?\b/)?.[0];
      if (!version) return fail(`Check ${name} version output.`);
      const [major, minor = 0] = version.split('.').map(Number);
      if (name === 'bash' && (major < 3 || (major === 3 && minor < 2))) return fail('Use Bash 3.2 or later.');
      return { ...pass(), version };
    });
  }
  await check('github_auth', 'Check GitHub authentication and network access.', async () => {
    const identity = json(await call('gh', 'api', 'user'));
    return typeof identity.login === 'string' && identity.login ? pass() : fail('Check GitHub authentication.');
  });
  await check('repository', 'Check this checkout and GitHub repository access.', async () => {
    const remote = (await call('git', 'remote', 'get-url', 'origin')).trim();
    if (!/^(?:https:\/\/github\.com\/|git@github\.com:)coderabbit-demo\/mmani-shopping-cart(?:\.git)?$/.test(remote)) return fail('Use the intended repository checkout.');
    if (checks.github_auth.status !== 'pass') return blocked('Establish GitHub authentication before checking repository access.');
    const details = json(await call('gh', 'repo', 'view', repo, '--json', 'nameWithOwner,viewerPermission'));
    return details.nameWithOwner?.toLowerCase() === repo && ['READ', 'TRIAGE', 'WRITE', 'MAINTAIN', 'ADMIN'].includes(details.viewerPermission) ? pass() : fail('Check GitHub repository access.');
  });
  await check('gcloud_target', 'Check the selected gcloud account and project.', async () => {
    const account = (await call('gcloud', 'config', 'get-value', 'account')).trim();
    const project = (await call('gcloud', 'config', 'get-value', 'project')).trim();
    if (!account || account === '(unset)') return blocked('Select an authenticated gcloud account manually.');
    return project === 'se-demos-project' ? pass() : fail('Select the intended project manually.');
  });
  for (const [name, args] of Object.entries({ gcloud_token: ['auth', 'print-access-token', '--quiet'], adc_token: ['auth', 'application-default', 'print-access-token', '--quiet'] })) {
    await check(name, 'Refresh authentication manually and retry.', async () => (await call('gcloud', ...args)).trim() ? pass() : fail('Token refresh returned no token.'));
  }
  await check('coderabbit_auth', 'Check CodeRabbit authentication.', async () => {
    const auth = eventLines(await call('coderabbit', 'auth', 'status', '--agent'));
    return auth.some((x) => x.authenticated === true) ? pass() : fail('Authenticate CodeRabbit manually.');
  });
  await check('coderabbit_org', 'Check the selected CodeRabbit organization.', async () => {
    const events = eventLines(await call('coderabbit', 'auth', 'org', '--agent'));
    const orgs = events.flatMap((x) => Array.isArray(x.organizations) ? x.organizations : []);
    const selected = orgs.filter((x) => x.selected === true || x.isSelected === true || x.active === true);
    if (selected.length !== 1) return blocked('Confirm the active CodeRabbit organization manually.');
    return [selected[0].slug, selected[0].name].includes('coderabbit-demo') ? pass() : fail('Select coderabbit-demo manually.');
  });
  await check('coderabbit_repo', 'Check CodeRabbit repository task-list access.', async () => {
    if (checks.repository.status !== 'pass' || checks.coderabbit_auth.status !== 'pass' || checks.coderabbit_org.status !== 'pass') return blocked('Confirm the intended repository and CodeRabbit organization first.');
    const events = eventLines(await call('coderabbit', 'code', 'ls', '--repo', '.', '--agent'));
    const last = events.at(-1);
    if (last?.type === 'error' || last?.type === 'action_required') return fail('Check CodeRabbit repository access.');
    return last?.type === 'complete' && last.status === 'tasks_listed' ? pass() : blocked('Confirm CodeRabbit repository task-list access manually.');
  });
  await check('docker_daemon', 'Start Docker Desktop manually and retry.', async () => (await call('docker', 'version', '--format', '{{.Server.Version}}')).trim() ? pass() : blocked('Start Docker Desktop manually and retry.'));
  await check('docker_amd64', 'Check a running Buildx builder manually.', async () => {
    const output = await call('docker', 'buildx', 'inspect');
    const nodes = output.split(/^Name:\s*/m).slice(1);
    return nodes.some((node) => /^Status:\s*running\s*$/m.test(node) && /^Platforms:\s*.*(?:^|[ ,])linux\/amd64(?:\*|[,\s]|$)/m.test(node)) ? pass() : fail('Use a running builder advertising linux/amd64.');
  });
  await check('datadog_keys', 'Check US3 network access and retry.', async () => {
    const api = env.DD_API_KEY;
    const short = env.DD_APP_KEY;
    const long = env.DD_APPLICATION_KEY;
    if (env.DD_SITE && env.DD_SITE !== 'us3.datadoghq.com') return fail('Use the approved Datadog US3 site.');
    if (short && long && short !== long) return fail('Remove conflicting application key variables.');
    const app = short || long;
    if (!api || !app) return blocked('Supply Datadog US3 keys through the process environment.');
    const response = await http(endpoint, { 'DD-API-KEY': api, 'DD-APPLICATION-KEY': app, Accept: 'application/json' });
    if (response.status === 401 || response.status === 403) return fail('Check Datadog key authentication and authorization.');
    if (response.status !== 200) return blocked('Check the Datadog validation service and retry.');
    try { return json(response.body)?.status === 'ok' ? pass() : fail('Datadog validation returned an unexpected response.'); }
    catch { return fail('Datadog validation returned an unexpected response.'); }
  });
  const manual = [
    'Verify Jira identity and SC read access.',
    'Verify provisioning IAM, ADC quota project and Datadog telemetry and management scopes.',
    'Verify Slack channel membership, automation instructions, effective agent scope and write permissions.',
    'Prove the native incident handoff, replay and concurrent button behavior in a separately authorized rehearsal.',
    'Prove an actual linux/amd64 build before deployment.',
  ];
  return { checks, manual, exitCode: Object.values(checks).every((x) => x.status === 'pass') ? 0 : 1 };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('Usage: node scripts/demo/preflight.mjs [--help]\nRead-only checks for the DeskDrop Mac demo. Supply DD_API_KEY and DD_APP_KEY or DD_APPLICATION_KEY in the process environment.\n');
    return;
  }
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: node scripts/demo/preflight.mjs [--help]\n');
    process.exitCode = 2;
    return;
  }
  const summary = await preflight();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Preflight failed unexpectedly.\n'); process.exitCode = 1; });
}
