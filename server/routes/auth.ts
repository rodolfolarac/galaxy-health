import { Router } from 'express';
import {
  verifyPasscode,
  issueSession,
  clearSession,
  isAuthed,
  renewIfOld,
  rateLimitLogin,
  registerFailedAttempt,
  clearAttempts,
} from '../lib/auth.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  const authenticated = isAuthed(req);
  if (authenticated) renewIfOld(req, res);
  res.json({ authenticated });
});

authRouter.post('/login', rateLimitLogin, async (req, res) => {
  const { passcode } = req.body ?? {};
  const ok = await verifyPasscode(String(passcode ?? ''));

  if (!ok) {
    await registerFailedAttempt(req);
    // Resposta propositalmente lenta e genérica.
    await new Promise((r) => setTimeout(r, 400));
    res.status(401).json({ error: 'Código inválido.' });
    return;
  }

  await clearAttempts(req);
  issueSession(res);
  res.json({ authenticated: true });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ authenticated: false });
});
