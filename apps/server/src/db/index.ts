import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function connect(url: string): Promise<Db> {
  const db = drizzle(new pg.Pool({ connectionString: url, max: 10 }), { schema });
  // Postgres may still be starting when compose brings everything up at once.
  for (let i = 0; ; i++) {
    try {
      await migrate(db, { migrationsFolder });
      return db;
    } catch (e: any) {
      if (i >= 30 || !/ECONNREFUSED|starting up|ENOTFOUND|EAI_AGAIN/.test(String(e?.message ?? e) + String(e?.cause?.code ?? ''))) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
export { schema };
