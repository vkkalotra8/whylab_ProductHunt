import fs from 'node:fs';
import path from 'node:path';
import { query, getDatabasePool } from './client.ts';

export interface MigrationRecord {
  id: number;
  name: string;
  appliedAt: string;
}

/**
 * Returns list of migration SQL files sorted alphabetically.
 */
export function getMigrationFiles(migrationsDir?: string): string[] {
  const dir = migrationsDir ?? path.join(process.cwd(), 'src', 'server', 'db', 'migrations');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Ensures the migration tracking table exists and applies unapplied migrations.
 */
export async function runMigrations(migrationsDir?: string): Promise<{ applied: string[]; total: number }> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Cannot run migrations: PostgreSQL DATABASE_URL is not configured.');
  }

  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query('BEGIN');

    // Ensure tracker table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _whylab_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get applied migrations
    const res = await client.query<{ name: string }>('SELECT name FROM _whylab_migrations');
    const appliedSet = new Set(res.rows.map((r) => r.name));

    const files = getMigrationFiles(migrationsDir);
    const dir = migrationsDir ?? path.join(process.cwd(), 'src', 'server', 'db', 'migrations');

    for (const file of files) {
      if (!appliedSet.has(file)) {
        const filePath = path.join(dir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        await client.query(sql);
        await client.query('INSERT INTO _whylab_migrations (name) VALUES ($1)', [file]);
        applied.push(file);
      }
    }

    await client.query('COMMIT');
    return { applied, total: files.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
