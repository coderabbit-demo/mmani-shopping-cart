export const PROJECT = 'coderabbit-automation-demo';
export const PROJECT_ID = 'prj_CmUrstyzwn8ialKqUthNz6kwC7UD';

export function sourceIdentity(env) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== PROJECT_ID ||
      !/^dpl_[a-zA-Z0-9]{1,100}$/.test(env.VERCEL_DEPLOYMENT_ID ?? '') ||
      !/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? '')) return null;
  return Object.freeze({ project: PROJECT, projectId: PROJECT_ID, environment: 'preview',
    deploymentId: env.VERCEL_DEPLOYMENT_ID, commit: env.VERCEL_GIT_COMMIT_SHA });
}

export function emitEvent(write, { requestId, actor, source, failed = false }) {
  const event = {
    schemaVersion: 1, timestamp: new Date().toISOString(), service: 'workflow-api',
    project: PROJECT, level: failed ? 'error' : 'info',
    event: failed ? 'health_failed' : 'health_checked', status: failed ? 500 : 200,
    requestId, actor,
    ...(source ? { source } : {}),
    ...(failed ? { code: 'INTERNAL_ERROR' } : {}),
  };
  const line = JSON.stringify(event);
  if (Buffer.byteLength(line) > 2048) throw new Error('Event exceeds limit');
  write(line);
}
