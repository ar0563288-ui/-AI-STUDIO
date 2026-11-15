import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './server/auth.ts';
import { initDatabase } from './server/db.ts';
import { MEDIA_ROOT } from './server/media.ts';
import { chatRouter } from './server/routes/chat.ts';
import { studiosRouter } from './server/routes/studios.ts';

async function bootstrap() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '35mb' }));
  app.use(express.urlencoded({ extended: true, limit: '35mb' }));

  // General API rate limiter
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });

  // Generation endpoints rate limiter
  const genLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Generation rate limit reached. Wait a moment before submitting another job.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/studios/image', genLimiter);
  app.use('/api/studios/video', genLimiter);
  app.use('/api/studios/music', genLimiter);

  // Serve generated media files for Web & Android clients
  app.use('/media', express.static(MEDIA_ROOT));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AI STUDIO Unified Backend',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/studios', studiosRouter);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`AI STUDIO server listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start AI STUDIO server:', err);
  process.exit(1);
});
