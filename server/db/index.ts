import 'dotenv/config';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

type DB = NeonHttpDatabase<typeof schema>;

/**
 * Dois bancos possíveis:
 *  - DATABASE_URL com postgres:// → Neon (produção e Vercel);
 *  - DATABASE_URL vazia ou "pglite" → Postgres embutido em ./.pglite, só
 *    para desenvolvimento local, sem precisar de conta em lugar nenhum.
 *    As migrações de ./drizzle são aplicadas na subida.
 */
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();

  if (url && url.startsWith('postgres')) {
    return drizzle(neon(url), { schema });
  }

  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL não definida na Vercel. Cole a connection string do Neon.');
  }

  // Import por variável para o bundler da Vercel não empacotar o PGlite.
  const pgliteMod = '@electric-sql/pglite';
  const drizzleMod = 'drizzle-orm/pglite';
  const migratorMod = 'drizzle-orm/pglite/migrator';
  const { PGlite } = await import(pgliteMod);
  const { drizzle: drizzlePglite } = await import(drizzleMod);
  const { migrate } = await import(migratorMod);

  const root = process.cwd();
  const dataDir = process.env.PGLITE_DIR || path.join(root, '.pglite');
  const client = new PGlite(dataDir === ':memory:' ? undefined : dataDir);
  const local = drizzlePglite(client, { schema });
  await migrate(local, { migrationsFolder: path.join(root, 'drizzle') });
  console.log(`  ↳ banco local PGlite em ${dataDir}`);
  return local as unknown as DB;
}

export const db = await connect();
export { schema };
