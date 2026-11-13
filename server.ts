import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

const PORT =
  Number(readCliArg('--port')) ||
  Number(process.env.APP_PORT) ||
  Number(process.env.DEFAULT_APP_PORT) ||
  Number(process.env.PORT) ||
  3000;
const HOST = readCliArg('--host') || '0.0.0.0';
const PYTHON_PORT = Number(process.env.PYTHON_PORT) || 8001;
const PYTHON_HOST = '127.0.0.1';
const IS_PROD = process.env.NODE_ENV === 'production';

const VENV_DIR = path.join(__dirname, 'backend', '.venv');
const VENV_PYTHON =
  process.platform === 'win32'
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');
const REQUIREMENTS_FILE = path.join(__dirname, 'backend', 'requirements.txt');

let pythonProc: ChildProcess | null = null;
let shuttingDown = false;
let pythonReady = false;
let pythonInitError: string | null = null;
let pythonReadyWaiters: Array<() => void> = [];

function notifyPythonReady(): void {
  pythonReady = true;
  pythonInitError = null;
  const waiters = pythonReadyWaiters;
  pythonReadyWaiters = [];
  for (const resolve of waiters) {
    resolve();
  }
}

function runCommandAsync(
  command: string,
  args: string[],
  options: { cwd?: string; stdio?: 'inherit' | 'ignore' | 'pipe' } = {},
): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? __dirname,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code }));
  });
}

async function findSystemPython(): Promise<string> {
  for (const candidate of ['python3', 'python']) {
    try {
      const res = await runCommandAsync(candidate, ['--version'], { stdio: 'ignore' });
      if (res.code === 0) return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error('Python 3 tidak ditemukan di sistem.');
}

async function checkPythonDepsReady(pythonBin: string): Promise<boolean> {
  if (!fs.existsSync(pythonBin)) return false;
  try {
    const res = await runCommandAsync(
      pythonBin,
      ['-c', 'import ytmusicapi, yt_dlp, fastapi, uvicorn, PIL, dotenv, requests'],
      { stdio: 'ignore' },
    );
    return res.code === 0;
  } catch {
    return false;
  }
}

async function ensurePythonDependencies(): Promise<string> {
  if (await checkPythonDepsReady(VENV_PYTHON)) {
    return VENV_PYTHON;
  }

  const sysPython = await findSystemPython();
  console.log('[soundclear] Menyiapkan lingkungan Python & dependensi SoundClear...');

  if (!fs.existsSync(VENV_PYTHON)) {
    const venvRes = await runCommandAsync(sysPython, ['-m', 'venv', VENV_DIR]);
    if (venvRes.code !== 0) {
      // Fallback for Debian/Ubuntu without ensurepip
      const fallbackRes = await runCommandAsync(sysPython, [
        '-m',
        'venv',
        '--without-pip',
        VENV_DIR,
      ]);
      if (fallbackRes.code !== 0) {
        throw new Error('Gagal membuat virtualenv Python di backend/.venv');
      }
    }
  }

  const pipCheck = await runCommandAsync(VENV_PYTHON, ['-m', 'pip', '--version'], {
    stdio: 'ignore',
  });
  if (pipCheck.code !== 0) {
    console.log('[soundclear] Memasang pip ke virtualenv Python...');
    const bootstrapRes = await runCommandAsync('bash', [
      '-c',
      `curl -sSL https://bootstrap.pypa.io/get-pip.py | "${VENV_PYTHON}"`,
    ]);
    if (bootstrapRes.code !== 0) {
      throw new Error('Gagal memasang pip ke virtualenv Python.');
    }
  }

  const pipInstall = await runCommandAsync(VENV_PYTHON, [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '-r',
    REQUIREMENTS_FILE,
  ]);
  if (pipInstall.code !== 0) {
    throw new Error('Gagal memasang dependensi Python dari backend/requirements.txt');
  }

  return VENV_PYTHON;
}

function isPythonHealthy(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${PYTHON_HOST}:${PYTHON_PORT}/api/health`,
      { timeout: 1500 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const parsed = JSON.parse(body) as { service?: string };
            resolve(parsed?.service === 'soundclear');
          } catch {
            resolve(true);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startPythonBackend(pythonBin: string): void {
  if (shuttingDown || pythonProc) return;
  pythonProc = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'backend.main:app', '--host', PYTHON_HOST, '--port', String(PYTHON_PORT)],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
      stdio: 'inherit',
    },
  );

  pythonProc.on('exit', (code, signal) => {
    pythonProc = null;
    if (!shuttingDown) {
      void isPythonHealthy().then((healthy) => {
        if (healthy) {
          notifyPythonReady();
          return;
        }
        pythonReady = false;
        console.error(
          `[soundclear] Backend Python berhenti (code=${code}, signal=${signal}). Memulai ulang...`,
        );
        setTimeout(() => startPythonBackend(pythonBin), 1500);
      });
    }
  });
}

async function waitForPythonHealth(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shuttingDown) return;
    if (await isPythonHealthy()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Backend Python tidak merespons pada /api/health tepat waktu.');
}

async function bootstrapPythonInBackground(): Promise<void> {
  try {
    if (await isPythonHealthy()) {
      notifyPythonReady();
      console.log(
        `[soundclear] Python FastAPI music backend already running on ${PYTHON_HOST}:${PYTHON_PORT}`,
      );
      return;
    }

    const pythonBin = await ensurePythonDependencies();
    if (shuttingDown) return;

    if (await isPythonHealthy()) {
      notifyPythonReady();
      return;
    }

    startPythonBackend(pythonBin);
    await waitForPythonHealth(30000);
    if (!shuttingDown) {
      notifyPythonReady();
      console.log(`[soundclear] Python FastAPI music backend ready on ${PYTHON_HOST}:${PYTHON_PORT}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pythonInitError = msg;
    console.error('[soundclear] Python backend initialization failed:', msg);
  }
}

function waitUntilPythonReady(res: Response, timeoutMs = 25000): Promise<boolean> {
  if (pythonReady) return Promise.resolve(true);
  if (pythonInitError) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.off('close', onClose);
      resolve(ok);
    };

    const onClose = () => finish(false);
    const timer = setTimeout(() => finish(pythonReady), timeoutMs);

    res.on('close', onClose);
    pythonReadyWaiters.push(() => finish(true));
  });
}

function proxyApiToPython(req: Request, res: Response): void {
  const targetPath = req.originalUrl;
  const pathname = targetPath.split('?')[0];

  if (!pythonReady) {
    if (pathname === '/api/health') {
      res.status(200).json({
        status: pythonInitError ? 'degraded' : 'starting',
        service: 'soundclear',
        provider: 'soundclear-cloud',
        ready: false,
        ...(pythonInitError ? { error: pythonInitError } : {}),
      });
      return;
    }

    void waitUntilPythonReady(res, 25000).then((ready) => {
      if (res.headersSent || res.writableEnded) return;
      if (!ready) {
        res.status(503).json({
          detail:
            pythonInitError ||
            'Backend musik sedang disiapkan. Silakan coba lagi beberapa detik.',
        });
        return;
      }
      forwardToPython(req, res, targetPath);
    });
    return;
  }

  forwardToPython(req, res, targetPath);
}

function forwardToPython(req: Request, res: Response, targetPath: string): void {
  const pathname = targetPath.split('?')[0];
  const isAudioStream = pathname.startsWith('/api/stream/');
  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  delete headers.host;

  const proxyReq = http.request(
    {
      hostname: PYTHON_HOST,
      port: PYTHON_PORT,
      path: targetPath,
      method: req.method,
      headers,
      timeout: isAudioStream ? 120000 : 30000,
    },
    (proxyRes) => {
      if (res.writableEnded || res.destroyed) {
        proxyRes.resume();
        return;
      }
      res.status(proxyRes.statusCode || 502);
      for (const [key, val] of Object.entries(proxyRes.headers)) {
        if (val !== undefined && key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, val);
        }
      }
      proxyRes.on('error', () => {
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      });
      proxyRes.pipe(res);
    },
  );

  res.on('close', () => {
    if (!proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent && !res.writableEnded) {
      res.status(504).json({ detail: 'Permintaan ke backend Python melewati batas waktu.' });
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.status(502).json({
        detail: `Gagal menghubungi backend musik Python: ${err.message}`,
      });
    }
  });

  req.pipe(proxyReq);
}

function cleanup(): void {
  shuttingDown = true;
  if (pythonProc) {
    pythonProc.kill('SIGTERM');
    pythonProc = null;
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', cleanup);

async function startServer(): Promise<void> {
  const app = express();
  app.use('/api', proxyApiToPython);

  if (IS_PROD && fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
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

  await new Promise<void>((resolve) => {
    app.listen(PORT, HOST, () => {
      console.log(`[soundclear] Server running at http://${HOST}:${PORT}`);
      resolve();
    });
  });

  // Initialize Python backend asynchronously after port 3000 is open
  // so cold starts (e.g., installing backend/.venv) never block startup health checks.
  void bootstrapPythonInBackground();
}

startServer().catch((err) => {
  cleanup();
  console.error('[soundclear] Failed to start server:', err);
  process.exit(1);
});
