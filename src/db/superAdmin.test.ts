import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('provisions once and rotates an existing admin without changing roles or status', {
  skip: !process.env.SUPER_ADMIN_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.SUPER_ADMIN_TEST_DATABASE_URL;
  process.env.ENCRYPTION_MASTER_KEY = 'test-only-encryption-key-with-at-least-32-characters';
  process.env.SESSION_SIGNING_SECRET = 'test-only-session-signing-secret';
  const { db, pool } = await import('./index.ts');
  const { roles, users, userRoles, userSessions } = await import('./schema.ts');
  const { provisionSuperAdmin, rotateSuperAdminPassword } = await import('./superAdmin.ts');
  const { verifyPassword, decryptSensitiveText } = await import('../lib/crypto.ts');
  const { eq } = await import('drizzle-orm');

  try {
    const [existingRole] = await db.select({ id: roles.id }).from(roles)
      .where(eq(roles.code, 'SUPER_ADMIN'));
    assert.equal(existingRole, undefined, 'Use an empty, disposable database.');
    const [role] = await db.insert(roles).values({
      code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Test',
      isPrivileged: true, requiresMfa: true, selfAssignable: false,
    }).returning();
    await db.insert(users).values({ email: 'existing@example.test', fullName: 'Existing User' });
    await assert.rejects(provisionSuperAdmin({
      email: 'existing@example.test', fullName: 'Admin', password: 'a-test-password',
    }), /not be promoted/);

    const results = await Promise.all([1, 2].map(() => provisionSuperAdmin({
      email: 'admin@example.test', fullName: 'Admin', password: 'a-test-password',
    })));
    assert.equal(results.filter(Boolean).length, 1);
    const result = results.find((value) => value !== null)!;
    const [admin] = await db.select().from(users).where(eq(users.id, result.userId));
    assert.equal(admin.mfaEnabled, true);
    assert.equal(decryptSensitiveText(admin.mfaSecretEnc!), result.totpSecret);
    assert.equal(await verifyPassword('a-test-password', admin.passwordHash!), true);
    await db.insert(userSessions).values({
      userId: admin.id, tokenHash: 'test-token-hash', deviceLabel: 'Test',
      activeRoleCode: 'SUPER_ADMIN', expiresAt: new Date(Date.now() + 60000),
    });
    await db.update(users).set({ approvalStatus: 'SUSPENDED', failedLoginAttempts: 5 })
      .where(eq(users.id, admin.id));
    await assert.rejects(rotateSuperAdminPassword('existing@example.test', 'another-password'), /No existing SUPER_ADMIN/);
    await rotateSuperAdminPassword('admin@example.test', 'another-password');
    const [rotated] = await db.select().from(users).where(eq(users.id, admin.id));
    assert.equal(await verifyPassword('another-password', rotated.passwordHash!), true);
    assert.equal(rotated.approvalStatus, 'SUSPENDED');
    assert.equal(rotated.failedLoginAttempts, 0);
    const [session] = await db.select().from(userSessions).where(eq(userSessions.userId, admin.id));
    assert.ok(session.revokedAt);
    const [assignment] = await db.select().from(userRoles).where(eq(userRoles.userId, admin.id));
    assert.equal(assignment.roleId, role.id);

    await db.update(users).set({ approvalStatus: 'ACTIVE' }).where(eq(users.id, admin.id));
    const express = (await import('express')).default;
    const { authRouter } = await import('../routes/auth.routes.ts');
    const app = express();
    app.use(express.json(), authRouter);
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const login = async (password: string) => fetch(`http://127.0.0.1:${address.port}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.test', password }),
      });
      assert.equal((await login('a-test-password')).status, 401);
      const response = await login('another-password');
      assert.equal(response.status, 200);
      const body = await response.json() as { user: { activeRole: string }; mfaChallengeRequired: boolean };
      assert.equal(body.user.activeRole, 'SUPER_ADMIN');
      assert.equal(body.mfaChallengeRequired, true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  } finally {
    await pool.end();
  }
});
