import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loginAttempts } from '../db/schema.js';

const COOKIE = 'gh_session';
/** Sessão longa: o navegador lembra o acesso e ela se renova a cada visita. */
const MAX_AGE_DAYS = 180;
const RENEW_AFTER_DAYS = 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) {
    throw new Error('SESSION_SECRET ausente ou curta demais. Gere uma com: npm run passcode');
  }
  return s;
}

function passcodeHash(): string {
  const h = process.env.PASSCODE_HASH;
  if (!h) throw new Error('PASSCODE_HASH não definida. Gere com: npm run passcode');
  return h;
}

/** Comparação do código digitado com o hash bcrypt guardado no .env. */
export async function verifyPasscode(input: string): Promise<boolean> {
  if (typeof input !== 'string' || input.length === 0 || input.length > 200) return false;
  try {
    return await bcrypt.compare(input, passcodeHash());
  } catch {
    return false;
  }
}

export function issueSession(res: Response) {
  const token = jwt.sign({ sub: 'owner' }, secret(), { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readToken(req: Request): jwt.JwtPayload | null {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    return typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function isAuthed(req: Request): boolean {
  return readToken(req) !== null;
}

/** Renova o cookie se ele tiver mais de uma semana — quem usa sempre nunca é deslogado. */
export function renewIfOld(req: Request, res: Response) {
  const payload = readToken(req);
  if (!payload?.iat) return;
  const ageDays = (Date.now() / 1000 - payload.iat) / 86400;
  if (ageDays > RENEW_AFTER_DAYS) issueSession(res);
}

/** Middleware: tudo em /api (menos o login) exige sessão válida. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

/**
 * Freio contra força bruta no código de acesso, por IP. Guardado no banco
 * porque na Vercel cada instância serverless tem a própria memória.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function ipOf(req: Request) {
  return req.ip ?? 'unknown';
}

export async function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const [rec] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ipOf(req)));
  const now = Date.now();
  if (rec && rec.until.getTime() > now && rec.count >= MAX_ATTEMPTS) {
    const mins = Math.ceil((rec.until.getTime() - now) / 60000);
    res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${mins} min.` });
    return;
  }
  next();
}

export async function registerFailedAttempt(req: Request) {
  const ip = ipOf(req);
  const [rec] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
  const now = Date.now();
  if (!rec || rec.until.getTime() <= now) {
    const row = { ip, count: 1, until: new Date(now + WINDOW_MS) };
    await db
      .insert(loginAttempts)
      .values(row)
      .onConflictDoUpdate({ target: loginAttempts.ip, set: { count: 1, until: row.until } });
  } else {
    await db
      .update(loginAttempts)
      .set({ count: rec.count + 1 })
      .where(eq(loginAttempts.ip, ip));
  }
}

export async function clearAttempts(req: Request) {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ipOf(req)));
}
