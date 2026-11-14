import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('registers and signs in every category, including when supporter profiles are missing', {
  skip: !process.env.REGISTRATION_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
  process.env.SESSION_SIGNING_SECRET = 'registration-test-only-session-secret';
  delete process.env.TALKSASA_API_TOKEN;
  const { db, pool } = await import('../db/index.ts');
  const schema = await import('../db/schema.ts');
  const { eq } = await import('drizzle-orm');
  const express = (await import('express')).default;
  const { authRouter } = await import('./auth.routes.ts');
  const app = express();
  app.use(express.json(), authRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    // This disposable database was initialized from the current schema.
    await pool.query('ALTER TABLE supporter_profiles RENAME TO supporter_profiles_before_test');
    await pool.query('ALTER TABLE organisations RENAME TO organisations_before_test');
    const roles = ['SUPPORTIVE', 'WELL_WISHER', 'ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY'];
    for (const [index, role] of roles.entries()) {
      const email = `registration-${index}@example.test`;
      const response = await fetch(`${base}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, password: 'registration-test-password', fullName: 'Test User',
          phoneE164: `071234567${index}`, countryCode: 'KE',
          selectedRoles: [role], county: 'Nairobi', subCounty: 'Westlands',
          guardianRelationship: 'Aunt', organisationName: role === 'WELL_WISHER' ? 'Test Foundation' : undefined,
        }),
      });
      assert.equal(response.status, 201, `${role}: ${await response.clone().text()}`);
      const data = await response.json() as { token: string; user: { userId: string; roles: string[] } };
      assert.ok(data.token);
      assert.deepEqual(data.user.roles, [role]);
      assert.match(response.headers.get('set-cookie') || '', /hc_session=/);
      if (role === 'SUPPORTIVE' || role === 'WELL_WISHER') {
        const [profile] = await db.select().from(schema.supporterProfiles)
          .where(eq(schema.supporterProfiles.userId, data.user.userId));
        assert.equal(profile.supporterType, role);
      } else {
        const [profile] = await db.select().from(schema.beneficiaryProfiles)
          .where(eq(schema.beneficiaryProfiles.userId, data.user.userId));
        assert.equal(profile.classification, role);
      }
      const login = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'registration-test-password' }),
      });
      assert.equal(login.status, 200, role);
    }

    await pool.query(`ALTER TABLE supporter_profiles ADD CONSTRAINT test_reject_registration
      CHECK (display_name <> 'Rejected User') NOT VALID`);
    const failed = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'rejected@example.test', password: 'registration-test-password', fullName: 'Rejected User',
        selectedRoles: ['SUPPORTIVE'], county: 'Nairobi',
      }),
    });
    assert.equal(failed.status, 500);
    const failure = await failed.text();
    assert.doesNotMatch(failure, /insert|supporter_profiles|Rejected User|rejected@example\.test/i);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.email, 'rejected@example.test'))).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await pool.end();
  }
});
