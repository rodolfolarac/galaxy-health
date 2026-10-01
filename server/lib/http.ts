import type { Request } from 'express';
import { z } from 'zod';

/** Erro com status HTTP — o handler central devolve a mensagem ao cliente. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(what = 'Registro'): never {
  throw new HttpError(404, `${what} não encontrado.`);
}

export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, `Dados inválidos — ${where}${issue?.message ?? 'verifique os campos'}`);
  }
  return r.data;
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id inválido.');
  return n;
}

/** Data local no formato YYYY-MM-DD (vem do navegador; o servidor roda em UTC). */
export const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD');

export function dayQuery(req: Request, name = 'day'): string {
  const v = String(req.query[name] ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Parâmetro ${name} inválido.`);
  return v;
}

/**
 * Texto opcional: string vazia vira null; ausente continua ausente (senão um
 * PATCH parcial apagaria o campo).
 *
 * Atenção: nada de `.default()` nos schemas — no Zod 4 o default é aplicado
 * mesmo dentro de `.partial()`, o que zeraria campos em todo PATCH. Os
 * padrões ficam no banco (DEFAULT das colunas).
 */
export const optText = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

export const optInt = z.number().int().min(0).max(100000).nullish();
export const idList = z.array(z.number().int().positive()).max(12);
