import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.APP_PORT) || Number(process.env.DEFAULT_APP_PORT) || 3000;
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

function findSystemPython(): string {
  for (const candidate of ['python3', 'python']) {
    const res = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (res.status === 0) return candidate;
  }
  throw new Error('Python 3 tidak ditemukan di sistem.');
}

function checkPythonDepsReady(pythonBin: string): boolean {
  if (!fs.existsSync(pythonBin)) return false;
  const probe = spawnSync(
    pythonBin,
    ['-c', 'import spotapi, fastapi, uvicorn, PIL, dotenv, requests'],
    { cwd: __dirname, stdio: 'ignore' },
  );
  return probe.status === 0;
}

function ensurePythonDependencies(): string {
  if (checkPythonDepsReady(VENV_PYTHON)) {
    return VENV_PYTHON;
  }

  const sysPython = findSystemPython();
  console.log('[soundclear] Menyiapkan lingkungan Python & dependensi SpotAPI...');

  if (!fs.existsSync(VENV_PYTHON)) {
    const venvRes = spawnSync(sysPython, ['-m', 'venv', VENV_DIR], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    if (venvRes.status !== 0) {
      // Fallback for Debian/Ubuntu without ensurepip
      const fallbackRes = spawnSync(sysPython, ['-m', 'venv', '--without-pip', VENV_DIR], {
        cwd: __dirname,
        stdio: 'inherit',
      });
      if (fallbackRes.status !== 0) {
        throw new Error('Gagal membuat virtualenv Python di backend/.venv');
      }
    }
  }

  const hasPip = spawnSync(VENV_PYTHON, ['-m', 'pip', '--version'], { stdio: 'ignore' }).status === 0;
  if (!hasPip) {
    console.log('[soundclear] Memasang pip ke virtualenv Python...');
    const bootstrapRes = spawnSync(
      'bash',
      ['-c', `curl -sSL https://bootstrap.pypa.io/get-pip.py | "${VENV_PYTHON}"`],
      { cwd: __dirname, stdio: 'inherit' },
    );
    if (bootstrapRes.status !== 0) {
      throw new Error('Gagal memasang pip ke virtualenv Python.');
    }
  }

  const pipInstall = spawnSync(
    VENV_PYTHON,
    ['-m', 'pip', 'install', '--no-cache-dir', '-r', REQUIREMENTS_FILE],
    { cwd: __dirname, stdio: 'inherit' },
  );
  if (pipInstall.status !== 0) {
    throw new Error('Gagal memasang dependensi Python dari backend/requirements.txt');
  }

  return VENV_PYTHON;
}

function startPythonBackend(pythonBin: string): void {
  if (shuttingDown) return;
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
      console.error(
        `[soundclear] Backend Python berhenti (code=${code}, signal=${signal}). Memulai ulang...`,
      );
      setTimeout(() => startPythonBackend(pythonBin), 1000);
    }
  });
}

async function waitForPythonHealth(timeoutMs = 25000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(
          `http://${PYTHON_HOST}:${PYTHON_PORT}/api/health`,
          { timeout: 1500 },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Backend Python tidak merespons pada /api/health tepat waktu.');
}

function proxyApiToPython(req: Request, res: Response): void {
  const targetPath = req.originalUrl;
  const isStreamRequest = targetPath.startsWith('/api/stream');
  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  delete headers.host;

  const proxyReq = http.request(
    {
      hostname: PYTHON_HOST,
      port: PYTHON_PORT,
      path: targetPath,
      method: req.method,
      headers,
      timeout: isStreamRequest ? 120000 : 30000,
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);
      for (const [key, val] of Object.entries(proxyRes.headers)) {
        if (val !== undefined && key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, val);
        }
      }
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ detail: 'Permintaan ke backend Python melewati batas waktu.' });
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        detail: `Gagal menghubungi backend Python SpotAPI: ${err.message}`,
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
  const pythonBin = ensurePythonDependencies();
  startPythonBackend(pythonBin);
  await waitForPythonHealth();
  console.log(`[soundclear] Python FastAPI SpotAPI backend ready on ${PYTHON_HOST}:${PYTHON_PORT}`);

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[soundclear] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  cleanup();
  console.error('[soundclear] Failed to start server:', err);
  process.exit(1);
});
