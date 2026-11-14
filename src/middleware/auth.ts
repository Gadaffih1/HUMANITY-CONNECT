import { Request, Response, NextFunction } from 'express';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  roles,
  userRoles,
  rolePermissions,
  permissions,
  userPermissions,
  userSessions,
  auditLogs,
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { sha256Hex, verifySessionToken } from '../lib/crypto.ts';
import { ADMIN_ACCESS_ROLE_CODES, type ApprovalStatus, type RoleCode } from '../types/domain.ts';

export interface AuthenticatedContext {
  userId: string;
  email: string;
  fullName: string;
  phoneE164: string | null;
  countryCode: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  mfaVerifiedInSession: boolean;
  approvalStatus: ApprovalStatus;
  roles: RoleCode[];
  activeRole: RoleCode;
  permissions: string[];
  sessionId?: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedContext;
}

export async function loadUserAuthContext(
  userId: string,
  requestedRole?: string,
  mfaVerifiedInSession = false,
  sessionId?: string
): Promise<AuthenticatedContext | null> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) return null;

  const assignedRoles = await db
    .select({
      roleId: roles.id,
      roleCode: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userRow.id), eq(userRoles.status, 'ACTIVE')));

  const roleCodes = assignedRoles.map((r) => r.roleCode as RoleCode);
  if (roleCodes.length === 0) {
    roleCodes.push('SUPPORTIVE');
  }

  const roleIds = assignedRoles.map((r) => r.roleId);
  const permSet = new Set<string>();
  if (roleIds.length > 0) {
    for (const rId of roleIds) {
      const rp = await db
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, rId));
      rp.forEach((p) => permSet.add(p.code));
    }
  }

  const directPerms = await db
    .select({ code: userPermissions.permissionCode })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userRow.id));
  directPerms.forEach((p) => permSet.add(p.code));

  const activeRole: RoleCode =
    requestedRole && roleCodes.includes(requestedRole as RoleCode)
      ? (requestedRole as RoleCode)
      : roleCodes.includes('SUPER_ADMIN')
        ? 'SUPER_ADMIN'
        : roleCodes[0];

  return {
    userId: userRow.id,
    email: userRow.email,
    fullName: userRow.fullName,
    phoneE164: userRow.phoneE164,
    countryCode: userRow.countryCode,
    emailVerified: Boolean(userRow.emailVerifiedAt),
    phoneVerified: Boolean(userRow.phoneVerifiedAt),
    mfaEnabled: userRow.mfaEnabled,
    mfaVerifiedInSession,
    approvalStatus: userRow.approvalStatus as ApprovalStatus,
    roles: roleCodes,
    activeRole,
    permissions: Array.from(permSet),
    sessionId,
  };
}

export const SESSION_COOKIE_NAME = 'hc_session';

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export async function resolveAuthFromRequest(req: Request): Promise<AuthenticatedContext | null> {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  const token = bearerToken || cookieToken;
  if (!token) return null;

  const headerActiveRole =
    typeof req.headers['x-active-role'] === 'string'
      ? req.headers['x-active-role']
      : undefined;

  // 1. Check Humanity Connect signed session token (hc1.*)
  if (token.startsWith('hc1.')) {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    const tokenHash = sha256Hex(token);
    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, payload.sid),
          eq(userSessions.tokenHash, tokenHash),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) return null;

    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, session.id));

    return loadUserAuthContext(
      session.userId,
      headerActiveRole || session.activeRoleCode,
      Boolean(session.mfaVerifiedAt),
      session.id
    );
  }

  // 2. Verify Firebase ID Token (Google OAuth Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || `${decoded.uid}@users.humanityconnect.org`).toLowerCase();
    const fullName = decoded.name || email.split('@')[0];

    const [existingByUid] = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, decoded.uid))
      .limit(1);

    let userRecord = existingByUid;
    if (!userRecord) {
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingByEmail) {
        const [updated] = await db
          .update(users)
          .set({
            firebaseUid: decoded.uid,
            emailVerifiedAt: existingByEmail.emailVerifiedAt || new Date(),
            lastLoginAt: new Date(),
          })
          .where(eq(users.id, existingByEmail.id))
          .returning();
        userRecord = updated;
      } else {
        const [inserted] = await db
          .insert(users)
          .values({
            firebaseUid: decoded.uid,
            email,
            fullName,
            emailVerifiedAt: decoded.email_verified ? new Date() : null,
            approvalStatus: 'ACTIVE',
            lastLoginAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.email,
            set: { firebaseUid: decoded.uid, lastLoginAt: new Date() },
          })
          .returning();
        userRecord = inserted;

        // Default new Google users to SUPPORTIVE role (never privileged)
        const [supportiveRole] = await db
          .select()
          .from(roles)
          .where(eq(roles.code, 'SUPPORTIVE'))
          .limit(1);
        if (supportiveRole) {
          await db
            .insert(userRoles)
            .values({
              userId: userRecord.id,
              roleId: supportiveRole.id,
              status: 'ACTIVE',
            })
            .onConflictDoNothing();
        }
      }
    }

    return loadUserAuthContext(userRecord.id, headerActiveRole, false);
  } catch {
    return null;
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ctx = await resolveAuthFromRequest(req);
    if (!ctx) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    if (ctx.approvalStatus === 'SUSPENDED') {
      return res.status(403).json({
        error: 'This account is currently suspended pending safeguarding or compliance review.',
      });
    }
    req.authUser = ctx;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const ctx = await resolveAuthFromRequest(req);
    if (ctx && ctx.approvalStatus !== 'SUSPENDED') {
      req.authUser = ctx;
    }
  } catch {
    // Ignore optional auth failures
  }
  next();
};

export const requireRole = (...allowedRoles: RoleCode[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const hasMatch = req.authUser.roles.some((r) => allowedRoles.includes(r));
    if (!hasMatch) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};

export const requirePermission = (permissionCode: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (
      !req.authUser.permissions.includes(permissionCode) &&
      !req.authUser.roles.includes('SUPER_ADMIN')
    ) {
      return res.status(403).json({
        error: `Missing required permission: ${permissionCode}.`,
      });
    }
    next();
  };
};

export const requireAnyAdminOrPermission = (requiredFlag?: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.authUser.roles.includes('SUPER_ADMIN')) {
      return next();
    }
    const hasAdminRole = req.authUser.roles.some((r) => ADMIN_ACCESS_ROLE_CODES.includes(r));
    const hasFlag = requiredFlag
      ? req.authUser.permissions.includes(requiredFlag)
      : req.authUser.permissions.some((p) => p.startsWith('can'));
    if (!hasAdminRole && !hasFlag) {
      return res.status(403).json({
        error: requiredFlag
          ? `Access denied. Required permission flag: ${requiredFlag}.`
          : 'Access denied. Sub-admin or officer privileges required.',
      });
    }
    if (requiredFlag && !req.authUser.permissions.includes(requiredFlag)) {
      return res.status(403).json({
        error: `Missing granular permission flag: ${requiredFlag}.`,
      });
    }
    next();
  };
};

export const requirePrivilegedMfa = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const isPrivileged = req.authUser.roles.some((r) => ADMIN_ACCESS_ROLE_CODES.includes(r));
  if (isPrivileged && req.authUser.mfaEnabled && !req.authUser.mfaVerifiedInSession) {
    return res.status(403).json({
      error: 'Multi-factor authentication (MFA) verification is required for this privileged action.',
      code: 'MFA_STEP_UP_REQUIRED',
    });
  }
  next();
};

export async function writeAuditLog(params: {
  actorUserId?: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  ip?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId ?? null,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      ipHash: params.ip ? sha256Hex(params.ip) : null,
      detailsJson: params.details ?? {},
    });
  } catch (err) {
    console.error('Audit log append failed:', err);
  }
}
