import 'dotenv/config';
import { z } from 'zod';
import { pool } from './index.ts';
import { provisionSuperAdmin, rotateSuperAdminPassword } from './superAdmin.ts';

async function main() {
  const mode = process.argv[2];
  if (mode !== 'bootstrap' && mode !== 'rotate') {
    throw new Error('Choose bootstrap or rotate: npm run super-admin -- bootstrap|rotate');
  }
  const parsed = z.object({
    SUPER_ADMIN_EMAIL: z.string().trim().email().transform((email) => email.toLowerCase()),
    SUPER_ADMIN_PASSWORD: z.string().min(12),
  }).safeParse(process.env);
  if (!parsed.success) throw new Error('Set SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters in environment secrets.');
  const { SUPER_ADMIN_EMAIL: email, SUPER_ADMIN_PASSWORD: password } = parsed.data;

  if (mode === 'rotate') {
    await rotateSuperAdminPassword(email, password);
    console.log('Super Admin password rotated and database sessions revoked.');
    return;
  }
  if (!process.env.ENCRYPTION_MASTER_KEY || process.env.ENCRYPTION_MASTER_KEY.length < 32 ||
      process.env.ENCRYPTION_MASTER_KEY.startsWith('REPLACE_')) {
    throw new Error('Set a persistent ENCRYPTION_MASTER_KEY before provisioning MFA.');
  }
  const result = await provisionSuperAdmin({ email, password, fullName: 'Super Admin' });
  if (!result) throw new Error('A Super Admin already exists; use rotate for that account instead.');
  console.log('Super Admin created. Store this MFA secret securely and enroll it in an authenticator app:');
  console.log(result.totpSecret);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Super Admin command failed.');
  process.exitCode = 1;
}).finally(() => pool.end());
