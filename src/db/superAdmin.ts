import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { auditLogs, roles, userRoles, users, userSessions } from './schema.ts';
import { encryptSensitiveText, generateTotpSecret, hashPassword, sha256Hex } from '../lib/crypto.ts';

export async function provisionSuperAdmin(data: {
  email: string;
  fullName: string;
  password: string;
  phoneE164?: string;
  ip?: string;
}): Promise<{ userId: string; totpSecret: string } | null> {
  const passwordHash = await hashPassword(data.password);
  const totpSecret = generateTotpSecret();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(174501, 1)`);
    const [role] = await tx.select().from(roles).where(eq(roles.code, 'SUPER_ADMIN')).limit(1);
    if (!role) throw new Error('SUPER_ADMIN role missing; seed reference data first.');
    const [existingAdmin] = await tx.select({ id: userRoles.id }).from(userRoles)
      .where(eq(userRoles.roleId, role.id)).limit(1);
    if (existingAdmin) return null;

    const [existingUser] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.email, data.email)).limit(1);
    if (existingUser) throw new Error('The configured email already belongs to an account; it will not be promoted automatically.');

    const [admin] = await tx.insert(users).values({
      email: data.email,
      fullName: data.fullName,
      phoneE164: data.phoneE164,
      passwordHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: data.phoneE164 ? new Date() : null,
      mfaEnabled: true,
      mfaSecretEnc: encryptSensitiveText(totpSecret),
      approvalStatus: 'ACTIVE',
    }).returning();
    await tx.insert(userRoles).values({
      userId: admin.id,
      roleId: role.id,
      assignedBy: admin.id,
      status: 'ACTIVE',
    });
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: 'SUPER_ADMIN',
      action: 'FIRST_SUPER_ADMIN_PROVISIONED',
      entityType: 'users',
      entityId: admin.id,
      ipHash: data.ip ? sha256Hex(data.ip) : null,
    });
    return { userId: admin.id, totpSecret };
  });
}

export async function rotateSuperAdminPassword(email: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(174501, 1)`);
    const [admin] = await tx.select({ id: users.id }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.email, email), eq(roles.code, 'SUPER_ADMIN'))).limit(1);
    if (!admin) throw new Error('No existing SUPER_ADMIN account matches the configured email.');
    await tx.update(users).set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(users.id, admin.id));
    await tx.update(userSessions).set({ revokedAt: new Date() })
      .where(eq(userSessions.userId, admin.id));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: 'SYSTEM',
      action: 'SUPER_ADMIN_PASSWORD_ROTATED',
      entityType: 'users',
      entityId: admin.id,
    });
  });
}
