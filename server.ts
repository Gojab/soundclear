import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 8787;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const IS_PROD = process.env.NODE_ENV === 'production';

let backendProcess: ChildProcess | null = null;
let shuttingDown = false;

async function isSoundClearBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { service?: string };
    return data?.service === 'soundclear';
  } catch {
    return false;
  }
}

async function waitForBackend(timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSoundClearBackendUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function ensurePythonBackend(): Promise<void> {
  if (await isSoundClearBackendUp()) {
    return;
  }

  const backendDir = path.join(__dirname, 'backend');
  const venvPython = path.join(backendDir, '.venv', 'bin', 'python');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  backendProcess = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'main:app', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
    {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    },
  );

  backendProcess.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[backend] ${line}`);
  });

  backendProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.error(`[backend] ${line}`);
  });

  backendProcess.on('exit', (code) => {
    backendProcess = null;
    if (!shuttingDown && code !== 0) {
      console.error(`[backend] exited with code ${code}, restarting in 2s...`);
      setTimeout(() => {
        if (!shuttingDown) {
          void ensurePythonBackend();
        }
      }, 2000);
    }
  });

  const ready = await waitForBackend(15000);
  if (ready) {
    console.log(`[backend] FastAPI ready at ${BACKEND_URL}`);
  } else {
    console.warn('[backend] FastAPI did not respond within 15s, continuing startup');
  }
}

function cleanupBackend(): void {
  shuttingDown = true;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

process.on('SIGINT', () => {
  cleanupBackend();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupBackend();
  process.exit(0);
});
process.on('exit', cleanupBackend);

async function startServer(): Promise<void> {
  await ensurePythonBackend();

  const app = express();

  app.use('/api', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const targetPath = req.originalUrl.replace(/^\/api/, '') || '/';
    const targetUrl = `${BACKEND_URL}${targetPath}`;

    try {
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: {
          Accept: 'application/json',
          ...(hasBody && req.headers['content-type']
            ? { 'Content-Type': String(req.headers['content-type']) }
            : {}),
        },
        body:
          hasBody && Buffer.isBuffer(req.body) && req.body.length > 0
            ? new Uint8Array(req.body)
            : undefined,
      });

      const contentType = upstream.headers.get('content-type') || 'application/json';
      const bodyText = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', contentType).send(bodyText);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tidak dapat terhubung ke layanan musik.';
      res.status(502).json({
        detail: `Server backend musik belum siap atau tidak terjangkau: ${message}`,
      });
    }
  });

  if (IS_PROD) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[soundclear] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[soundclear] Failed to start server:', err);
  cleanupBackend();
  process.exit(1);
});
