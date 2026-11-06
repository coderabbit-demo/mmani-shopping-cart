import { journey, validate } from './checker.mjs';
import { pathToFileURL } from 'node:url';

export async function run(config, browser, assertion) {
  const checked = validate(config);
  const result = await journey(checked, browser, assertion);
  return { status: result.status, source: result.source, image: result.image, journey: result.journey };
}
export async function availability(config, fetcher = fetch) {
  validate(config);
  try {
    const response = await fetcher(config.url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 300;
  } catch { return false; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { url: process.env.CHECKER_URL, source: process.env.SOURCE_COMMIT, image: process.env.APP_IMAGE };
  const mode = process.argv[2];
  Promise.resolve().then(async () => {
    if (mode === 'availability') return { status: await availability(config) ? 'pass' : 'fail' };
    if (mode !== 'checkout') throw new Error('Invalid check');
    return run(config);
  }).then(result => { console.log(JSON.stringify(result)); if (result.status !== 'pass') process.exitCode = 1; }, () => { console.error('Cloud check failed'); process.exitCode = 1; });
}
