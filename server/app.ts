import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { requireAuth } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { bandsRouter, muscleGroupsRouter } from './routes/catalog.js';
import { exercisesRouter } from './routes/exercises.js';
import { programRouter, workoutsRouter } from './routes/workouts.js';
import { sessionExercisesRouter, sessionsRouter, setsRouter } from './routes/sessions.js';
import { statsRouter } from './routes/stats.js';
import { bodyRouter, checkinsRouter } from './routes/log.js';
import { exportRouter } from './routes/export.js';
import { quickRouter } from './routes/quick.js';

export function createApp() {
  const app = express();

  // Atrás do proxy da Vercel, para req.ip e cookies secure funcionarem.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);

  // Tudo daqui para baixo exige o código de acesso.
  app.use('/api', requireAuth);
  app.use('/api/bands', bandsRouter);
  app.use('/api/muscle-groups', muscleGroupsRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/program', programRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/session-exercises', sessionExercisesRouter);
  app.use('/api/sets', setsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/checkins', checkinsRouter);
  app.use('/api/body', bodyRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/quick', quickRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Em produção fora da Vercel, o mesmo processo serve o front buildado.
  const dist = path.resolve(process.cwd(), 'dist');
  if (!process.env.VERCEL && fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Handler de erro: mensagens de validação vão para o cliente; stack trace nunca.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('[erro]', err);
      res.status(500).json({ error: 'Erro interno. Veja os logs do servidor.' });
    },
  );

  return app;
}
