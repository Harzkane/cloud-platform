/**
 * Returns honest status lines when deployment.logs is empty (Go worker hasn't
 * sent any log chunks yet). Shows real status context instead of fabricating
 * specific steps or fake timings.
 *
 * Once the Go worker sends the first /internal/deploy/callback with a logChunk,
 * the DB logs field becomes non-empty and parseRealLogs() takes over automatically.
 */

export interface LogLine {
  time: string;
  text: string;
  kind: 'info' | 'success' | 'error' | 'muted';
}

export function getMockLogs(
  status: string,
  _startedAt: string,
  _runtime = 'node:20-alpine'
): LogLine[] {
  // NOTE: These are NOT fake build steps — they are honest status messages shown
  // only while dep.logs is empty. Real BuildKit output from the Go worker replaces
  // this panel as soon as the first log chunk is appended to the deployment record.
  switch (status) {
    case 'QUEUED':
      return [
        { time: '', text: '→ Deployment queued — waiting for a worker to pick it up...', kind: 'muted' },
        { time: '', text: '  This can take up to 30s if the worker is starting up.', kind: 'muted' },
      ];
    case 'CLONING':
      return [
        { time: '', text: '→ Cloning repository from GitHub...', kind: 'info' },
        { time: '', text: '  Real-time build logs will appear here shortly.', kind: 'muted' },
      ];
    case 'BUILDING':
    case 'PUSHING':
      return [
        { time: '', text: '→ Build in progress on the worker VM...', kind: 'info' },
        { time: '', text: '  Large apps (Next.js) can take 10–20 minutes on first build.', kind: 'muted' },
        { time: '', text: '  Real-time Docker output will stream here once the first chunk arrives.', kind: 'muted' },
        { time: '', text: '  ▶ Click "Stream" above to open the live log view.', kind: 'muted' },
      ];
    case 'STARTING':
      return [
        { time: '', text: '→ Container starting — running health checks...', kind: 'info' },
      ];
    case 'FAILED':
      return [
        { time: '', text: '✗ Deployment failed. No log data was captured.', kind: 'error' },
        { time: '', text: '  Check the live log stream for details, or re-deploy.', kind: 'muted' },
      ];
    case 'RUNNING':
    case 'SUCCESS':
    default:
      return [
        { time: '', text: '✓ Deployment completed successfully.', kind: 'success' },
        { time: '', text: '  Log data was not captured for this deployment.', kind: 'muted' },
      ];
  }
}

/**
 * Converts the raw `deployment.logs` string (from Go worker) into LogLine objects
 * with proper styling, so real logs match the same visual format as mock logs.
 */
export function parseRealLogs(rawLogs: string): LogLine[] {
  return rawLogs
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const kind: LogLine['kind'] =
        line.startsWith('✓') ? 'success' :
        line.startsWith('✗') || line.includes('[ERROR]') ? 'error' :
        line.startsWith('→') ? 'info' : 'muted';
      return { time: '', text: line, kind };
    });
}
