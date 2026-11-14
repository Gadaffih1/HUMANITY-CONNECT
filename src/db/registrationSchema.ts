import { pool } from './index.ts';

let schemaPromise: Promise<void> | null = null;

export function ensureSupporterRegistrationSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = createMissingSupporterTables().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

async function createMissingSupporterTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(174501, 3)');
    const result = await client.query<{ organisations: string | null; supporters: string | null }>(`
      SELECT to_regclass('public.organisations')::text AS organisations,
             to_regclass('public.supporter_profiles')::text AS supporters
    `);
    if (!result.rows[0].organisations) {
      await client.query(`
        CREATE TABLE public.organisations (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text NOT NULL,
          org_type text NOT NULL,
          registration_number text,
          country_code text DEFAULT 'KE' NOT NULL,
          county text DEFAULT 'Nairobi' NOT NULL,
          contact_email text NOT NULL,
          verification_status text DEFAULT 'PENDING' NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL
        )
      `);
    }
    if (!result.rows[0].supporters) {
      await client.query(`
        CREATE TABLE public.supporter_profiles (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
          organisation_id uuid REFERENCES public.organisations(id),
          supporter_type text DEFAULT 'SUPPORTIVE' NOT NULL,
          display_name text NOT NULL,
          preferred_currency text DEFAULT 'KES' NOT NULL,
          anonymous_giving boolean DEFAULT false NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL
        )
      `);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
