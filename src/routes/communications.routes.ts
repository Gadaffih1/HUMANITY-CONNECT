import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications, beneficiaryProfiles, users } from '../db/schema.ts';
import { requireAuth, AuthRequest, writeAuditLog } from '../middleware/auth.ts';

export const communicationsRouter = Router();
communicationsRouter.use(requireAuth);

export const NOTIFICATION_TEMPLATES = [
  { code: 'REGISTRATION', channel: 'EMAIL', title: 'Karibu to Humanity Connect', maskPii: true },
  { code: 'OTP', channel: 'SMS', title: 'One-Time Verification Code (Expires 10m)', maskPii: true },
  { code: 'ACCOUNT_APPROVAL', channel: 'IN_APP', title: 'Account Verification Status Updated', maskPii: true },
  { code: 'CASE_SUBMISSION', channel: 'IN_APP', title: 'Beneficiary Case Logged (V0)', maskPii: true },
  { code: 'VERIFICATION', channel: 'SMS', title: 'Verification Stage Advanced', maskPii: true },
  { code: 'SPONSORSHIP', channel: 'EMAIL', title: 'Direct Sponsorship Agreement Activated', maskPii: true },
  { code: 'PAYMENT', channel: 'SMS', title: 'M-Pesa Contribution Confirmed', maskPii: true },
  { code: 'RECEIPT', channel: 'EMAIL', title: 'Official Humanity Connect Contribution Receipt', maskPii: true },
  { code: 'RECURRING_REMINDER', channel: 'PUSH', title: 'Upcoming Recurring Sponsorship Renewal', maskPii: true },
  { code: 'BENEFICIARY_UPDATE', channel: 'IN_APP', title: 'Household & Empowerment Progress Update', maskPii: true },
  { code: 'VOLUNTEER_ASSIGNMENT', channel: 'PUSH', title: 'County Field Assignment Scheduled', maskPii: true },
  { code: 'COMPLAINT', channel: 'IN_APP', title: 'Safeguarding / Service Feedback Received', maskPii: true },
  { code: 'SECURITY_ALERT', channel: 'EMAIL', title: 'New Device Sign-In or MFA Event', maskPii: true },
];

communicationsRouter.get('/centre', async (req: AuthRequest, res) => {
  const list = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, req.authUser!.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  res.json({
    templates: NOTIFICATION_TEMPLATES,
    notifications: list,
    safeguardingRule:
      'Direct unsupervised messaging between adult supporters and minor beneficiaries is strictly blocked. Messages route through verified guardians or Safeguarding Officers.',
  });
});

// Safe In-App Messaging with Minor Protection Enforcement
communicationsRouter.post('/message', async (req: AuthRequest, res) => {
  const schema = z.object({
    recipientBeneficiaryId: z.string().uuid().optional(),
    recipientUserId: z.string().uuid().optional(),
    subject: z.string().min(2).max(140),
    body: z.string().min(4).max(1500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid subject and message required.' });

  const { recipientBeneficiaryId, recipientUserId, subject, body } = parsed.data;
  let targetUserId = recipientUserId;

  if (recipientBeneficiaryId) {
    const [bp] = await db
      .select()
      .from(beneficiaryProfiles)
      .where(eq(beneficiaryProfiles.id, recipientBeneficiaryId))
      .limit(1);
    if (!bp) return res.status(404).json({ error: 'Beneficiary case not found.' });

    // Child Safeguarding Block: adult supporters cannot message minor cases directly
    const isSupporter =
      req.authUser!.activeRole === 'SUPPORTIVE' || req.authUser!.activeRole === 'WELL_WISHER';
    if (bp.isMinorCase && isSupporter) {
      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'SAFEGUARDING_DIRECT_MINOR_MSG_BLOCKED',
        entityType: 'beneficiary_profiles',
        entityId: bp.id,
        ip: req.ip,
      });
      return res.status(403).json({
        error:
          'Child Safeguarding Policy: Direct messaging to minor cases is disabled. Your message must be routed via the assigned Social Welfare / Safeguarding Officer.',
      });
    }
    targetUserId = bp.userId;
  }

  if (!targetUserId) {
    // Route to user's own inbox confirmation / support desk if no recipient specified
    targetUserId = req.authUser!.userId;
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!u) return res.status(404).json({ error: 'Recipient not found.' });
  }

  const [msg] = await db
    .insert(notifications)
    .values({
      userId: targetUserId,
      channel: 'IN_APP',
      category: 'BENEFICIARY_UPDATE',
      title: subject,
      body,
    })
    .returning();

  res.status(201).json({ message: msg });
});
