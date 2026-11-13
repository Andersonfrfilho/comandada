import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { runMetaWhatsAppMigrations } from '@adatechnology/meta-whatsapp-module'
import { runSchedulingMigrations } from '@adatechnology/scheduling-module'
import { Pool } from 'pg'
import path from 'path'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
})

pool.on('error', (error) => {
  console.error('[DB] Unexpected pool error:', error.message)
})

export const db = drizzle(pool, { schema })

export async function runMigrations(): Promise<void> {
  // dev: cwd = apps/api/   production: WORKDIR /app — both have drizzle/ at root
  const migrationsFolder = process.env.MIGRATIONS_PATH ?? path.join(process.cwd(), 'drizzle/migrations')
  await migrate(db, { migrationsFolder })

  // O módulo traz o próprio schema (`meta_whatsapp`) e o próprio journal — o drizzle-kit deste
  // repo não enxerga essas migrations. O migrator é injetado porque o driver é escolha do host.
  await runMetaWhatsAppMigrations({ db, migrate })
  // Agenda (encomendas e reservas): schema `scheduling`, exige a extensão btree_gist no cluster.
  await runSchedulingMigrations({ db, migrate })

  // Triggers não podem ser expressos em schema Drizzle — aplicados aqui (idempotente)
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION fn_audit_logs_immutable() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs rows are immutable';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
    CREATE TRIGGER trg_audit_logs_no_update
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW EXECUTE PROCEDURE fn_audit_logs_immutable();

    DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs;
    CREATE TRIGGER trg_audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      FOR EACH ROW EXECUTE PROCEDURE fn_audit_logs_immutable();
  `)

  console.log('[DB] Migrations applied')
}

export async function checkDatabaseConnection(): Promise<void> {
  const client = await pool.connect()
  await client.query('SELECT 1')
  client.release()
  console.log('[DB] Connected')
}
