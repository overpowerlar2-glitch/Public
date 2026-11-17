import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// One pool per process, shared between the Next.js handlers and the game server.
const g = globalThis as unknown as { __tabiyaDb?: NodePgDatabase<typeof schema>; __tabiyaPool?: Pool };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and point it at a PostgreSQL database.');
  g.__tabiyaPool = new Pool({ connectionString: url, max: 20 });
  g.__tabiyaPool.on('error', (e) => console.error('[db] pool error', e.message));
  return drizzle(g.__tabiyaPool, { schema });
}

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_t, prop) {
    g.__tabiyaDb ??= create();
    const v = (g.__tabiyaDb as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(g.__tabiyaDb) : v;
  },
});

export { schema };
