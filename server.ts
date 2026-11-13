import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { MusicServiceError, SoundClearService } from './server/ytmusicService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS) || 420;

const musicService = new SoundClearService(CACHE_TTL_SECONDS, 'ID');

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function createApiRouter(): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'soundclear' });
  });

  router.get(
    '/search',
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const filter = typeof req.query.filter === 'string' ? req.query.filter : null;
      const rawLimit = Number(req.query.limit) || 25;
      const limit = Math.max(1, Math.min(50, rawLimit));
      res.json(await musicService.search(q, filter, limit));
    }),
  );

  router.get(
    '/suggest',
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      res.json(await musicService.suggest(q));
    }),
  );

  router.get(
    '/home',
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit) || 8;
      const limit = Math.max(1, Math.min(20, rawLimit));
      res.json(await musicService.getHome(limit));
    }),
  );

  router.get(
    '/charts',
    asyncHandler(async (req, res) => {
      const country = typeof req.query.country === 'string' ? req.query.country : 'ID';
      res.json(await musicService.getCharts(country));
    }),
  );

  router.get(
    '/moods',
    asyncHandler(async (_req, res) => {
      res.json(await musicService.getMoods());
    }),
  );

  router.get(
    '/moods/:params',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getMoodPlaylists(req.params.params));
    }),
  );

  router.get(
    '/artist/:artistId',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getArtist(req.params.artistId));
    }),
  );

  router.get(
    '/artist/:artistId/albums',
    asyncHandler(async (req, res) => {
      const params = typeof req.query.params === 'string' ? req.query.params : '';
      if (!params) {
        res.status(400).json({ detail: 'Parameter params wajib diisi.' });
        return;
      }
      res.json(await musicService.getArtistAlbums(req.params.artistId, params));
    }),
  );

  router.get(
    '/album/:albumId',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getAlbum(req.params.albumId));
    }),
  );

  router.get(
    '/playlist/:playlistId',
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit) || 100;
      const limit = Math.max(1, Math.min(200, rawLimit));
      res.json(await musicService.getPlaylist(req.params.playlistId, limit));
    }),
  );

  router.get(
    '/watch/:videoId',
    asyncHandler(async (req, res) => {
      const radio = req.query.radio !== 'false';
      const playlistId =
        typeof req.query.playlistId === 'string' ? req.query.playlistId : null;
      const rawLimit = Number(req.query.limit) || 25;
      const limit = Math.max(1, Math.min(50, rawLimit));
      res.json(
        await musicService.getWatchPlaylist(req.params.videoId, playlistId, radio, limit),
      );
    }),
  );

  router.get(
    '/lyrics/:browseId',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getLyrics(req.params.browseId));
    }),
  );

  router.get(
    '/song/:videoId/credits',
    asyncHandler(async (req, res) => {
      const albumId = typeof req.query.albumId === 'string' ? req.query.albumId : null;
      const creditsBrowseId =
        typeof req.query.creditsBrowseId === 'string' ? req.query.creditsBrowseId : null;
      res.json(
        await musicService.getSongCredits(req.params.videoId, albumId, creditsBrowseId),
      );
    }),
  );

  router.get(
    '/song/:videoId/related',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getSongRelated(req.params.videoId));
    }),
  );

  router.get(
    '/podcast/:podcastId',
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit) || 100;
      const limit = Math.max(1, Math.min(200, rawLimit));
      res.json(await musicService.getPodcast(req.params.podcastId, limit));
    }),
  );

  router.get(
    '/episode/:videoId',
    asyncHandler(async (req, res) => {
      res.json(await musicService.getEpisode(req.params.videoId));
    }),
  );

  router.get(
    '/channel/:channelId/episodes',
    asyncHandler(async (req, res) => {
      const params = typeof req.query.params === 'string' ? req.query.params : '';
      if (!params) {
        res.status(400).json({ detail: 'Parameter params wajib diisi.' });
        return;
      }
      res.json(await musicService.getChannelEpisodes(req.params.channelId, params));
    }),
  );

  router.get('/account/status', (_req, res) => {
    res.json(musicService.getAccountStatus());
  });

  router.get('/account/library', (_req, res) => {
    res.json(musicService.getAccountLibrary());
  });

  router.post('/account/rate', (_req, res) => {
    res.json({ synced: false, reason: 'local_mode' });
  });

  router.post('/account/playlist', (_req, res) => {
    res.json({ synced: false, reason: 'local_mode' });
  });

  router.post('/account/playlist/items', (_req, res) => {
    res.json({ synced: false, reason: 'local_mode' });
  });

  router.post('/account/subscribe', (_req, res) => {
    res.json({ synced: false, reason: 'local_mode' });
  });

  router.get(
    '/artwork-color',
    asyncHandler(async (req, res) => {
      const url = typeof req.query.url === 'string' ? req.query.url : '';
      if (url.length < 10) {
        res.status(400).json({ detail: 'Parameter url tidak valid.' });
        return;
      }
      res.json(await musicService.extractArtworkColor(url));
    }),
  );

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MusicServiceError) {
      res.status(err.statusCode).json({ detail: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan server.';
    res.status(502).json({ detail: message });
  });

  return router;
}

async function startServer(): Promise<void> {
  const app = express();

  app.use('/api', createApiRouter());

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
  console.error('[soundclear] Failed to start server:', err);
  process.exit(1);
});
