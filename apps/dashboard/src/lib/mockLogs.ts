/**
 * Generates realistic mock build logs for a deployment.
 *
 * These are shown only when `deployment.logs` is empty — i.e. before
 * the Go worker is connected and writing real logs. Once the worker is
 * live, real log lines streamed via /internal/deploy/callback will
 * replace these automatically.
 */

export interface LogLine {
  time: string;
  text: string;
  kind: 'info' | 'success' | 'error' | 'muted';
}

function fmtTime(base: Date, offsetMs: number): string {
  const d = new Date(base.getTime() + offsetMs);
  return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour12: false });
}

export function getMockLogs(
  status: string,
  startedAt: string,
  runtime = 'node:20-alpine'
): LogLine[] {
  const base = new Date(startedAt);
  const runtimeLabel = runtime.split(':')[0] || 'node';

  const all: LogLine[] = [
    { time: fmtTime(base, 0),    text: '→ Cloning repository from GitHub...', kind: 'info' },
    { time: fmtTime(base, 900),  text: '✓ Repository cloned (823ms)', kind: 'success' },
    { time: fmtTime(base, 1000), text: `→ Building Docker image (${runtimeLabel})...`, kind: 'info' },
    { time: fmtTime(base, 2000), text: `  Dockerfile detected — using ${runtime}`, kind: 'muted' },
    { time: fmtTime(base, 3000), text: '  Step 1/6: FROM node:20-alpine', kind: 'muted' },
    { time: fmtTime(base, 4500), text: '  Step 2/6: WORKDIR /app', kind: 'muted' },
    { time: fmtTime(base, 6000), text: '  Step 3/6: COPY package*.json ./', kind: 'muted' },
    { time: fmtTime(base, 7000), text: '  Step 4/6: RUN npm ci --production', kind: 'muted' },
    { time: fmtTime(base, 35000),'text': '  Step 5/6: COPY . .', kind: 'muted' },
    { time: fmtTime(base, 36000), text: '  Step 6/6: CMD ["node", "dist/index.js"]', kind: 'muted' },
    { time: fmtTime(base, 48000), text: '✓ Docker image built successfully', kind: 'success' },
    { time: fmtTime(base, 48100), text: '→ Starting container on worker-node-1 (Lagos)...', kind: 'info' },
    { time: fmtTime(base, 51000), text: '✓ Container started · Port 3000', kind: 'success' },
    { time: fmtTime(base, 51500), text: '→ Running health check (GET /)...', kind: 'info' },
    { time: fmtTime(base, 53000), text: '✓ Health check passed (HTTP 200)', kind: 'success' },
    { time: fmtTime(base, 53100), text: '→ Updating DNS & SSL routing via Nginx...', kind: 'info' },
    { time: fmtTime(base, 54000), text: '✓ Deployment successful! 🎉', kind: 'success' },
  ];

  const failLines: LogLine[] = [
    { time: fmtTime(base, 0),    text: '→ Cloning repository from GitHub...', kind: 'info' },
    { time: fmtTime(base, 900),  text: '✓ Repository cloned (823ms)', kind: 'success' },
    { time: fmtTime(base, 1000), text: `→ Building Docker image (${runtimeLabel})...`, kind: 'info' },
    { time: fmtTime(base, 3000), text: '  Step 1/6: FROM node:20-alpine', kind: 'muted' },
    { time: fmtTime(base, 8000), text: '  Step 4/6: RUN npm ci --production', kind: 'muted' },
    { time: fmtTime(base, 12000), text: '  npm ERR! Cannot resolve dependency: some-package@^2.0.0', kind: 'error' },
    { time: fmtTime(base, 12100), text: '✗ Build failed — see error above', kind: 'error' },
    { time: fmtTime(base, 12200), text: '[ERROR] docker build exited with code 1', kind: 'error' },
  ];

  const inProgressLines: LogLine[] = [
    { time: fmtTime(base, 0),    text: '→ Cloning repository from GitHub...', kind: 'info' },
    { time: fmtTime(base, 900),  text: '✓ Repository cloned (823ms)', kind: 'success' },
    { time: fmtTime(base, 1000), text: `→ Building Docker image (${runtimeLabel})...`, kind: 'info' },
    { time: fmtTime(base, 3000), text: '  Step 1/6: FROM node:20-alpine', kind: 'muted' },
    { time: fmtTime(base, 4500), text: '  Step 2/6: WORKDIR /app', kind: 'muted' },
    { time: fmtTime(base, 6000), text: '  Step 3/6: COPY package*.json ./', kind: 'muted' },
    { time: fmtTime(base, 7000), text: '  Step 4/6: RUN npm ci --production  ← running...', kind: 'info' },
  ];

  switch (status) {
    case 'FAILED':
      return failLines;
    case 'QUEUED':
      return [{ time: fmtTime(base, 0), text: '→ Deployment queued, waiting for worker...', kind: 'muted' }];
    case 'CLONING':
      return [
        { time: fmtTime(base, 0), text: '→ Cloning repository from GitHub...', kind: 'info' },
      ];
    case 'BUILDING':
    case 'PUSHING':
    case 'STARTING':
      return inProgressLines;
    case 'READY':
    case 'RUNNING':
    case 'SUCCESS':
    default:
      return all;
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
