try { process.loadEnvFile(); } catch {}
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  .then(() => { console.log('Migrations applied.'); return pool.end(); })
  .catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
