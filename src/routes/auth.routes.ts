import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { eq, and, desc, isNull, gt } from 'drizzle-orm';
import { db, isTransientDbError, withDbRetry } from '../db/index.ts';
import {
  users,
  roles,
  userRoles,
  userSessions,
  verificationTokens,
  beneficiaryProfiles,
  supporterProfiles,
  verificationCases,
  consentRecords,
  notifications,
  guardianRelationships,
} from '../db/schema.ts';
import {
  hashPassword,
  verifyPassword,
  generateNumericOtp,
  sha256Hex,
  signSessionToken,
  generateTotpSecret,
  computeTotpCode,
  verifyTotpCode,
  encryptSensitiveText,
  decryptSensitiveText,
} from '../lib/crypto.ts';
import {
  requireAuth,
  type AuthRequest,
  loadUserAuthContext,
  writeAuditLog,
  setSessionCookie,
  clearSessionCookie,
} from '../middleware/auth.ts';
import { dispatchTalksasaSms } from '../lib/talksasa.ts';
import { normalizeKenyanMsisdn } from '../lib/talksasaUtils.ts';
import type { RoleCode } from '../types/domain.ts';

export const authRouter = Router();

const SELF_ASSIGNABLE_ROLES: RoleCode[] = [
  'ORPHAN_GUARDIAN',
  'DESTITUTE',
  'NEEDY',
  'SUPPORTIVE',
  'WELL_WISHER',
];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
  phoneE164: z.string().min(8).max(20).optional(),
  countryCode: z.string().length(2).default('KE'),
  selectedRoles: z.array(z.string()).length(1),
  county: z.string().min(2).max(80).default('Nairobi'),
  subCounty: z.string().max(80).optional(),
  ward: z.string().max(80).optional(),
  displayAlias: z.string().min(2).max(100).optional(),
  vulnerabilitySummary: z.string().max(1000).optional(),
  guardianOrgName: z.string().max(140).optional(),
  guardianRelationship: z.string().max(80).optional(),
  isMinorCase: z.boolean().optional(),
  organisationName: z.string().max(140).optional(),
  supporterType: z.enum(['SUPPORTIVE', 'WELL_WISHER', 'CORPORATE']).optional(),
});

function generateReferenceCode(prefix: string): string {
  const num = crypto.randomInt(1000, 9999);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-KE-2026-${num}${suffix}`;
}

authRouter.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid registration details', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const normalizedEmail = data.email.trim().toLowerCase();

    // Security rule: Exactly one self-assignable role per registration; never SUPER_ADMIN or FIELD_OFFICER
    const validRoles = data.selectedRoles.filter((r): r is RoleCode =>
      SELF_ASSIGNABLE_ROLES.includes(r as RoleCode)
    );
    if (validRoles.length !== 1 || data.selectedRoles.length !== 1) {
      return res.status(403).json({
        error: 'Select exactly one eligible account category during registration.',
      });
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const normalizedPhone = data.phoneE164?.trim()
      ? normalizeKenyanMsisdn(data.phoneE164.trim())
      : null;
    if (normalizedPhone && !normalizedPhone.ok) {
      return res.status(400).json({ error: normalizedPhone.error || 'Invalid Kenyan phone format.' });
    }

    const passwordHash = await hashPassword(data.password);
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        fullName: data.fullName.trim(),
        phoneE164: normalizedPhone?.ok ? normalizedPhone.e164 : null,
        passwordHash,
        countryCode: data.countryCode,
        approvalStatus: 'ACTIVE',
      })
      .returning();

    for (const rCode of validRoles) {
      const [roleRow] = await db.select().from(roles).where(eq(roles.code, rCode)).limit(1);
      if (roleRow) {
        await db.insert(userRoles).values({
          userId: newUser.id,
          roleId: roleRow.id,
          status: 'ACTIVE',
        });
      }
    }

    // Create beneficiary profile if any beneficiary classification selected
    const beneficiaryRole = validRoles.find((r) =>
      ['ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY'].includes(r)
    );
    if (beneficiaryRole) {
      const refCode = generateReferenceCode('HC');
      const [bp] = await db
        .insert(beneficiaryProfiles)
        .values({
          userId: newUser.id,
          referenceCode: refCode,
          classification: beneficiaryRole,
          displayAlias:
            data.displayAlias?.trim() ||
            `${data.county} ${beneficiaryRole === 'ORPHAN_GUARDIAN' ? 'Guardian Case' : 'Household'} #${refCode.slice(-4)}`,
          countryCode: data.countryCode,
          county: data.county,
          subCounty: data.subCounty || null,
          ward: data.ward || null,
          guardianOrgName: data.guardianOrgName || null,
          isMinorCase: beneficiaryRole === 'ORPHAN_GUARDIAN' ? (data.isMinorCase ?? true) : false,
          vulnerabilitySummary:
            data.vulnerabilitySummary?.trim() ||
            'Initial intake submitted pending V1–V4 verification review.',
          verificationLevel: 'V0',
          verificationStatus: 'INTAKE_SUBMITTED',
          safeguardingCleared: false,
          publicListingApproved: false,
        })
        .returning();

      await db.insert(verificationCases).values({
        caseNumber: `VC-${refCode}`,
        beneficiaryId: bp.id,
        officerWorkspace:
          beneficiaryRole === 'ORPHAN_GUARDIAN' ? 'SOCIAL_WELFARE_OFFICER' : 'VERIFICATION_OFFICER',
        verificationLevel: 'V0',
        stage: 'DOCUMENT_REVIEW',
        fieldCounty: data.county,
        caseDeadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      if (beneficiaryRole === 'ORPHAN_GUARDIAN') {
        await db.insert(guardianRelationships).values({
          beneficiaryId: bp.id,
          guardianUserId: newUser.id,
          relationshipType: data.guardianRelationship || data.guardianOrgName || 'Verified Legal Guardian',
          legalDocVerified: false,
          consentAuthority: true,
        });
      }

      await db.insert(consentRecords).values({
        beneficiaryId: bp.id,
        grantedByUserId: newUser.id,
        consentScope: 'DATA_PROCESSING',
        granted: true,
      });
    }

    // Create supporter profile if Supportive or Well Wisher selected
    const supporterRole = validRoles.find((r) => ['SUPPORTIVE', 'WELL_WISHER'].includes(r));
    if (supporterRole) {
      await db.insert(supporterProfiles).values({
        userId: newUser.id,
        supporterType: data.supporterType || supporterRole,
        displayName: data.organisationName?.trim() || data.fullName.trim(),
        preferredCurrency: data.countryCode === 'KE' ? 'KES' : 'USD',
      });
    }

    // Issue Email & Phone OTP verification tokens
    const emailOtp = generateNumericOtp(6);
    await db.insert(verificationTokens).values({
      userId: newUser.id,
      channel: 'EMAIL_VERIFY',
      target: normalizedEmail,
      codeHash: sha256Hex(emailOtp),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    let phoneOtpPreview: string | undefined;
    if (newUser.phoneE164) {
      const phoneOtp = generateNumericOtp(6);
      phoneOtpPreview = phoneOtp;
      await db.insert(verificationTokens).values({
        userId: newUser.id,
        channel: 'PHONE_OTP',
        target: newUser.phoneE164,
        codeHash: sha256Hex(phoneOtp),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      await dispatchTalksasaSms({
        recipientPhone: newUser.phoneE164,
        message: `Humanity Connect verification code: ${phoneOtp}. Expires in 15 minutes. Do not share this code.`,
        templateCode: 'OTP',
        userId: newUser.id,
        idempotencyKey: `reg-otp-${newUser.id}`,
      }).catch((smsErr) => console.error('TalkSasa registration OTP dispatch error:', smsErr));
    }

    // Create initial session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const token = signSessionToken({ sid: sessionId, uid: newUser.id, exp: expiresAt.getTime() });
    await db.insert(userSessions).values({
      id: sessionId,
      userId: newUser.id,
      tokenHash: sha256Hex(token),
      deviceLabel: (req.headers['user-agent'] || 'Web Browser').slice(0, 60),
      userAgent: req.headers['user-agent'] || null,
      ipHash: req.ip ? sha256Hex(req.ip) : null,
      activeRoleCode: validRoles[0],
      expiresAt,
    });

    await db.insert(notifications).values({
      userId: newUser.id,
      category: 'SYSTEM',
      title: 'Welcome to Humanity Connect',
      body: 'Your account is active. Complete email and phone verification to unlock full portal actions.',
    });

    await writeAuditLog({
      actorUserId: newUser.id,
      actorRole: validRoles[0],
      action: 'USER_REGISTERED',
      entityType: 'users',
      entityId: newUser.id,
      ip: req.ip,
      details: { roles: validRoles, countryCode: data.countryCode },
    });

    const authUser = await loadUserAuthContext(newUser.id, validRoles[0], false, sessionId);
    setSessionCookie(req, res, token);
    res.status(201).json({
      token,
      user: authUser,
      verificationHints: {
        emailCodeIssued: true,
        phoneOtpIssued: Boolean(phoneOtpPreview),
      },
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      deviceLabel: z.string().max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email and password are required.' });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const [userRow] = await withDbRetry(() =>
      db.select().from(users).where(eq(users.email, email)).limit(1)
    );

    if (!userRow || !userRow.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials or Google Sign-In account.' });
    }

    if (userRow.approvalStatus === 'SUSPENDED') {
      return res.status(403).json({
        error: userRow.suspensionReason || 'Account suspended pending review.',
      });
    }

    if (userRow.lockedUntil && userRow.lockedUntil > new Date()) {
      const mins = Math.ceil((userRow.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Too many failed login attempts. Try again in ${mins} minute(s).`,
      });
    }

    const ok = await verifyPassword(parsed.data.password, userRow.passwordHash);
    if (!ok) {
      const attempts = userRow.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db
        .update(users)
        .set({ failedLoginAttempts: attempts, lockedUntil })
        .where(eq(users.id, userRow.id));
      await writeAuditLog({
        actorUserId: userRow.id,
        actorRole: 'ANONYMOUS',
        action: 'LOGIN_FAILED',
        entityType: 'users',
        entityId: userRow.id,
        ip: req.ip,
        details: { attempts, locked: Boolean(lockedUntil) },
      });
      return res.status(401).json({
        error: lockedUntil
          ? 'Account temporarily locked after 5 failed attempts (15 minutes).'
          : 'Invalid email or password.',
      });
    }

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, userRow.id));

    const ctxPreview = await loadUserAuthContext(userRow.id);
    const primaryRole = ctxPreview?.activeRole || 'SUPPORTIVE';

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const token = signSessionToken({ sid: sessionId, uid: userRow.id, exp: expiresAt.getTime() });
    await db.insert(userSessions).values({
      id: sessionId,
      userId: userRow.id,
      tokenHash: sha256Hex(token),
      deviceLabel: parsed.data.deviceLabel || (req.headers['user-agent'] || 'Browser').slice(0, 60),
      userAgent: req.headers['user-agent'] || null,
      ipHash: req.ip ? sha256Hex(req.ip) : null,
      activeRoleCode: primaryRole,
      expiresAt,
    });

    await writeAuditLog({
      actorUserId: userRow.id,
      actorRole: primaryRole,
      action: 'LOGIN_SUCCESS',
      entityType: 'user_sessions',
      entityId: sessionId,
      ip: req.ip,
    });

    const user = await loadUserAuthContext(userRow.id, primaryRole, false, sessionId);
    setSessionCookie(req, res, token);
    res.json({
      token,
      user,
      mfaChallengeRequired: Boolean(user?.mfaEnabled),
    });
  } catch (err: any) {
    console.error('Login error:', err);
    if (isTransientDbError(err)) {
      return res.status(503).json({
        error: 'Database connection interrupted while signing in. Please retry shortly.',
      });
    }
    res.status(500).json({ error: 'Login failed.' });
  }
});

authRouter.post('/logout', async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const rawBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (req.authUser?.sessionId) {
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.id, req.authUser.sessionId));
    } else if (rawBearer && rawBearer.startsWith('hc1.')) {
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.tokenHash, sha256Hex(rawBearer)));
    }
  } catch {
    // Best-effort revocation
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

authRouter.post('/switch-role', requireAuth, async (req: AuthRequest, res) => {
  const { role } = req.body as { role?: string };
  if (!role || !req.authUser!.roles.includes(role as RoleCode)) {
    return res.status(403).json({
      error: 'You are not authorised to switch to this role.',
    });
  }
  if (req.authUser!.sessionId) {
    await db
      .update(userSessions)
      .set({ activeRoleCode: role })
      .where(eq(userSessions.id, req.authUser!.sessionId));
  }
  const updated = await loadUserAuthContext(
    req.authUser!.userId,
    role,
    req.authUser!.mfaVerifiedInSession,
    req.authUser!.sessionId
  );
  await writeAuditLog({
    actorUserId: req.authUser!.userId,
    actorRole: role,
    action: 'ROLE_SWITCHED',
    entityType: 'user_sessions',
    entityId: req.authUser!.sessionId,
    ip: req.ip,
    details: { activeRole: role },
  });
  res.json({ user: updated });
});

authRouter.post('/verify-phone/send', requireAuth, async (req: AuthRequest, res) => {
  const { phoneE164 } = req.body as { phoneE164?: string };
  const rawPhone = (phoneE164 || req.authUser!.phoneE164 || '').trim();
  const norm = normalizeKenyanMsisdn(rawPhone);
  if (!norm.ok) {
    return res.status(400).json({
      error: norm.error || 'Valid phone number (e.g. +2547XXXXXXXX or 07XXXXXXXX) is required.',
    });
  }

  await db
    .update(users)
    .set({ phoneE164: norm.e164 })
    .where(eq(users.id, req.authUser!.userId));

  const otp = generateNumericOtp(6);
  await db.insert(verificationTokens).values({
    userId: req.authUser!.userId,
    channel: 'PHONE_OTP',
    target: norm.e164,
    codeHash: sha256Hex(otp),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const smsResult = await dispatchTalksasaSms({
    recipientPhone: norm.e164,
    message: `Humanity Connect OTP: ${otp}. Valid for 10 minutes.`,
    templateCode: 'OTP',
    userId: req.authUser!.userId,
  });

  await writeAuditLog({
    actorUserId: req.authUser!.userId,
    actorRole: req.authUser!.activeRole,
    action: 'PHONE_OTP_DISPATCHED',
    entityType: 'talksasa_sms_logs',
    entityId: smsResult.logId,
    ip: req.ip,
    details: {
      dispatchRef: smsResult.dispatchRef,
      deliveryStatus: smsResult.deliveryStatus,
      gatewayLive: smsResult.gatewayLive,
    },
  });

  res.json({
    sent: true,
    targetMasked: norm.masked,
    dispatchRef: smsResult.dispatchRef,
    deliveryStatus: smsResult.deliveryStatus,
    gatewayLive: smsResult.gatewayLive,
    sandboxOtp:
      process.env.NODE_ENV === 'production' || (smsResult.gatewayLive && smsResult.deliveryStatus === 'SENT')
        ? undefined
        : otp,
  });
});

authRouter.post('/verify-phone/confirm', requireAuth, async (req: AuthRequest, res) => {
  const { code } = req.body as { code?: string };
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return res.status(400).json({ error: 'Enter the 6-digit phone verification code.' });
  }
  const [tokenRow] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.userId, req.authUser!.userId),
        eq(verificationTokens.channel, 'PHONE_OTP'),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .orderBy(desc(verificationTokens.createdAt))
    .limit(1);

  if (!tokenRow || tokenRow.attempts >= 5) {
    return res.status(400).json({ error: 'OTP expired or maximum attempts reached. Request a new code.' });
  }
  if (tokenRow.codeHash !== sha256Hex(code.trim())) {
    await db
      .update(verificationTokens)
      .set({ attempts: tokenRow.attempts + 1 })
      .where(eq(verificationTokens.id, tokenRow.id));
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  await db
    .update(verificationTokens)
    .set({ consumedAt: new Date() })
    .where(eq(verificationTokens.id, tokenRow.id));
  await db
    .update(users)
    .set({ phoneVerifiedAt: new Date() })
    .where(eq(users.id, req.authUser!.userId));

  await writeAuditLog({
    actorUserId: req.authUser!.userId,
    actorRole: req.authUser!.activeRole,
    action: 'PHONE_VERIFIED',
    entityType: 'users',
    entityId: req.authUser!.userId,
    ip: req.ip,
  });

  const user = await loadUserAuthContext(
    req.authUser!.userId,
    req.authUser!.activeRole,
    req.authUser!.mfaVerifiedInSession,
    req.authUser!.sessionId
  );
  res.json({ verified: true, user });
});

authRouter.post('/verify-email/send', requireAuth, async (req: AuthRequest, res) => {
  const code = generateNumericOtp(6);
  await db.insert(verificationTokens).values({
    userId: req.authUser!.userId,
    channel: 'EMAIL_VERIFY',
    target: req.authUser!.email,
    codeHash: sha256Hex(code),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  res.json({
    sent: true,
    sandboxCode: process.env.NODE_ENV === 'production' ? undefined : code,
  });
});

authRouter.post('/verify-email/confirm', requireAuth, async (req: AuthRequest, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'Verification code required.' });
  const [tokenRow] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.userId, req.authUser!.userId),
        eq(verificationTokens.channel, 'EMAIL_VERIFY'),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .orderBy(desc(verificationTokens.createdAt))
    .limit(1);

  if (!tokenRow || tokenRow.codeHash !== sha256Hex(code.trim())) {
    return res.status(400).json({ error: 'Invalid or expired email verification code.' });
  }
  await db
    .update(verificationTokens)
    .set({ consumedAt: new Date() })
    .where(eq(verificationTokens.id, tokenRow.id));
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, req.authUser!.userId));

  const user = await loadUserAuthContext(
    req.authUser!.userId,
    req.authUser!.activeRole,
    req.authUser!.mfaVerifiedInSession,
    req.authUser!.sessionId
  );
  res.json({ verified: true, user });
});

authRouter.post('/password-reset/request', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const [userRow] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  let sandboxCode: string | undefined;
  if (userRow) {
    const code = generateNumericOtp(6);
    sandboxCode = process.env.NODE_ENV === 'production' ? undefined : code;
    await db.insert(verificationTokens).values({
      userId: userRow.id,
      channel: 'PASSWORD_RESET',
      target: userRow.email,
      codeHash: sha256Hex(code),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });
  }
  res.json({
    message: 'If an account matches this email, a reset verification code has been issued.',
    sandboxCode,
  });
});

authRouter.post('/password-reset/confirm', async (req, res) => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };
  if (!email || !code || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Email, 6-digit code, and 8+ character password required.' });
  }
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!userRow) return res.status(400).json({ error: 'Invalid reset request.' });

  const [tokenRow] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.userId, userRow.id),
        eq(verificationTokens.channel, 'PASSWORD_RESET'),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .orderBy(desc(verificationTokens.createdAt))
    .limit(1);

  if (!tokenRow || tokenRow.codeHash !== sha256Hex(code.trim())) {
    return res.status(400).json({ error: 'Invalid or expired password reset code.' });
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(verificationTokens)
    .set({ consumedAt: new Date() })
    .where(eq(verificationTokens.id, tokenRow.id));
  await db
    .update(users)
    .set({ passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userRow.id));
  // Revoke existing sessions on password reset
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.userId, userRow.id));

  await writeAuditLog({
    actorUserId: userRow.id,
    actorRole: 'USER',
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'users',
    entityId: userRow.id,
    ip: req.ip,
  });

  res.json({ reset: true });
});

authRouter.post('/mfa/setup', requireAuth, async (req: AuthRequest, res) => {
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ mfaSecretEnc: encryptSensitiveText(secret) })
    .where(eq(users.id, req.authUser!.userId));

  const otpauthUri = `otpauth://totp/HumanityConnect:${encodeURIComponent(req.authUser!.email)}?secret=${secret}&issuer=HumanityConnect`;
  res.json({
    secret,
    otpauthUri,
    currentVerificationHint:
      process.env.NODE_ENV === 'production' ? undefined : computeTotpCode(secret),
  });
});

authRouter.post('/mfa/verify', requireAuth, async (req: AuthRequest, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: '6-digit MFA code required.' });
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.authUser!.userId))
    .limit(1);
  if (!userRow?.mfaSecretEnc) {
    return res.status(400).json({ error: 'MFA has not been initialized for this account.' });
  }
  const secret = decryptSensitiveText(userRow.mfaSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    return res.status(401).json({ error: 'Invalid MFA authenticator code.' });
  }
  await db
    .update(users)
    .set({ mfaEnabled: true })
    .where(eq(users.id, userRow.id));

  if (req.authUser!.sessionId) {
    await db
      .update(userSessions)
      .set({ mfaVerifiedAt: new Date() })
      .where(eq(userSessions.id, req.authUser!.sessionId));
  }

  await writeAuditLog({
    actorUserId: userRow.id,
    actorRole: req.authUser!.activeRole,
    action: 'MFA_VERIFIED',
    entityType: 'users',
    entityId: userRow.id,
    ip: req.ip,
  });

  const user = await loadUserAuthContext(
    userRow.id,
    req.authUser!.activeRole,
    true,
    req.authUser!.sessionId
  );
  res.json({ verified: true, user });
});

authRouter.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  const list = await db
    .select({
      id: userSessions.id,
      deviceLabel: userSessions.deviceLabel,
      activeRoleCode: userSessions.activeRoleCode,
      mfaVerifiedAt: userSessions.mfaVerifiedAt,
      lastSeenAt: userSessions.lastSeenAt,
      expiresAt: userSessions.expiresAt,
      revokedAt: userSessions.revokedAt,
      createdAt: userSessions.createdAt,
    })
    .from(userSessions)
    .where(eq(userSessions.userId, req.authUser!.userId))
    .orderBy(desc(userSessions.lastSeenAt));
  res.json({
    sessions: list.map((s) => ({ ...s, isCurrent: s.id === req.authUser!.sessionId })),
  });
});

authRouter.delete('/sessions/:sessionId', requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.id, String(req.params.sessionId)),
        eq(userSessions.userId, req.authUser!.userId)
      )
    );
  res.json({ revoked: true });
});

// Secure Server-Side First Super Admin Provisioning (Requires SUPER_ADMIN_PROVISION_SECRET, zero hardcoded credentials)
authRouter.post('/provision-super-admin', async (req, res) => {
  const configuredSecret = process.env.SUPER_ADMIN_PROVISION_SECRET;
  const providedSecret = req.headers['x-provision-secret'];
  if (!configuredSecret || configuredSecret.startsWith('REPLACE_')) {
    return res.status(503).json({
      error: 'Server-side Super Admin provisioning requires SUPER_ADMIN_PROVISION_SECRET to be configured in environment secrets.',
    });
  }
  if (typeof providedSecret !== 'string' || providedSecret !== configuredSecret) {
    return res.status(403).json({ error: 'Invalid provisioning secret.' });
  }

  const schema = z.object({
    email: z.string().email(),
    fullName: z.string().min(3),
    password: z.string().min(12),
    phoneE164: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide email, fullName, phoneE164, and 12+ char password.' });
  }

  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.code, 'SUPER_ADMIN'))
    .limit(1);
  if (!superAdminRole) return res.status(500).json({ error: 'Role registry missing.' });

  const existingSuperAdmins = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.roleId, superAdminRole.id))
    .limit(1);

  if (existingSuperAdmins.length > 0) {
    return res.status(409).json({
      error: 'Initial Super Admin has already been provisioned. Use an existing Super Admin session with MFA to assign additional officers.',
    });
  }

  const totpSecret = generateTotpSecret();
  const passwordHash = await hashPassword(parsed.data.password);
  const [adminUser] = await db
    .insert(users)
    .values({
      email: parsed.data.email.trim().toLowerCase(),
      fullName: parsed.data.fullName.trim(),
      phoneE164: parsed.data.phoneE164.trim(),
      passwordHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      mfaEnabled: true,
      mfaSecretEnc: encryptSensitiveText(totpSecret),
      approvalStatus: 'ACTIVE',
    })
    .returning();

  await db.insert(userRoles).values({
    userId: adminUser.id,
    roleId: superAdminRole.id,
    assignedBy: adminUser.id,
    status: 'ACTIVE',
  });

  await writeAuditLog({
    actorUserId: adminUser.id,
    actorRole: 'SUPER_ADMIN',
    action: 'FIRST_SUPER_ADMIN_PROVISIONED',
    entityType: 'users',
    entityId: adminUser.id,
    ip: req.ip,
  });

  res.status(201).json({
    provisioned: true,
    userId: adminUser.id,
    mfaTotpSecret: totpSecret,
  });
});
