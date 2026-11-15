import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db, isTransientDbError, withDbRetry } from '../db/index.ts';
import {
  notifications,
  beneficiaryProfiles,
  users,
  talksasaSmsLogs,
  talksasaWebhookEvents,
} from '../db/schema.ts';
import { requireAuth, requireRole, type AuthRequest, writeAuditLog } from '../middleware/auth.ts';
import {
  dispatchTalksasaSms,
  getTalkSasaGatewayPublicStatus,
  processTalksasaDlrWebhook,
  retryTalksasaSms,
} from '../lib/talksasa.ts';
import { screenGeneralCommunicationForConfidentiality } from '../lib/rbacPolicy.ts';

export const communicationsRouter = Router();

// Unauthenticated TalkSasa Delivery Receipt (DLR) Webhook Endpoint
communicationsRouter.post('/talksasa/dlr', async (req, res) => {
  try {
    const providedSecret =
      (typeof req.headers['x-talksasa-secret'] === 'string' && req.headers['x-talksasa-secret']) ||
      (typeof req.query.secret === 'string' && req.query.secret) ||
      null;
    const payload =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const result = await processTalksasaDlrWebhook({ payload, providedSecret });
    if (!result.accepted) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    console.error('TalkSasa DLR webhook error:', err);
    res.status(500).json({ error: 'Unable to process TalkSasa DLR webhook.' });
  }
});

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
  try {
    const list = await withDbRetry(() =>
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.authUser!.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50)
    );

    res.json({
      templates: NOTIFICATION_TEMPLATES,
      notifications: list,
      safeguardingRule:
        'Direct unsupervised messaging between adult supporters and minor beneficiaries is strictly blocked. Messages route through verified guardians or Safeguarding Officers.',
    });
  } catch (err) {
    console.error('Communications centre load error:', err);
    res.status(isTransientDbError(err) ? 503 : 500).json({ error: 'Unable to load communications centre.' });
  }
});

// Safe In-App Messaging with Minor Protection Enforcement
communicationsRouter.post('/message', async (req: AuthRequest, res) => {
  try {
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
      const [bp] = await withDbRetry(() =>
        db
          .select()
          .from(beneficiaryProfiles)
          .where(eq(beneficiaryProfiles.id, recipientBeneficiaryId))
          .limit(1)
      );
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

    let resolvedUserId: string;
    if (!targetUserId) {
      // Route to user's own inbox confirmation / support desk if no recipient specified
      resolvedUserId = req.authUser!.userId;
    } else {
      const lookupUserId = targetUserId;
      const [u] = await withDbRetry(() =>
        db.select({ id: users.id }).from(users).where(eq(users.id, lookupUserId)).limit(1)
      );
      if (!u) return res.status(404).json({ error: 'Recipient not found.' });
      resolvedUserId = lookupUserId;
    }

    const [msg] = await withDbRetry(() =>
      db
        .insert(notifications)
        .values({
          userId: resolvedUserId,
          channel: 'IN_APP',
          category: 'BENEFICIARY_UPDATE',
          title: subject,
          body,
        })
        .returning()
    );

    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('Send communication message error:', err);
    res.status(isTransientDbError(err) ? 503 : 500).json({ error: 'Unable to send message.' });
  }
});

// TalkSasa SMS Gateway Logs, Status Summary & Retry (Strict Cloud SQL Persistence)
communicationsRouter.get(
  '/talksasa/logs',
  requireRole(
    'SUPER_ADMIN',
    'HR_OFFICER',
    'VERIFICATION_OFFICER',
    'FINANCE_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'SAFEGUARDING_OFFICER',
    'DATA_MANAGEMENT_OFFICER',
    'AUDITOR'
  ),
  async (_req: AuthRequest, res) => {
    try {
      const [logs, webhooks] = await Promise.all([
        db.select().from(talksasaSmsLogs).orderBy(desc(talksasaSmsLogs.createdAt)).limit(100),
        db
          .select()
          .from(talksasaWebhookEvents)
          .orderBy(desc(talksasaWebhookEvents.receivedAt))
          .limit(50),
      ]);

      const counts = {
        total: logs.length,
        delivered: logs.filter((l) => l.deliveryStatus === 'DELIVERED').length,
        sent: logs.filter((l) => l.deliveryStatus === 'SENT').length,
        failed: logs.filter((l) => l.deliveryStatus === 'FAILED' || l.deliveryStatus === 'REJECTED').length,
        sandboxQueued: logs.filter((l) => l.deliveryStatus === 'SANDBOX_QUEUED' || l.deliveryStatus === 'QUEUED').length,
      };

      res.json({
        gateway: getTalkSasaGatewayPublicStatus(),
        counts,
        logs: logs.map((l) => ({
          id: l.id,
          dispatchRef: l.dispatchRef,
          templateCode: l.templateCode,
          senderId: l.senderId,
          recipientMasked: l.recipientMasked,
          messagePreview: l.messagePreview,
          smsUnits: l.smsUnits,
          providerUid: l.providerUid,
          deliveryStatus: l.deliveryStatus,
          httpStatus: l.httpStatus,
          attemptCount: l.attemptCount,
          errorReason: l.errorReason,
          sentAt: l.sentAt,
          deliveredAt: l.deliveredAt,
          createdAt: l.createdAt,
        })),
        webhooks,
      });
    } catch (err) {
      console.error('TalkSasa logs error:', err);
      res.status(500).json({ error: 'Unable to load TalkSasa SMS logs.' });
    }
  }
);

communicationsRouter.post(
  '/talksasa/send',
  requireRole(
    'SUPER_ADMIN',
    'HR_OFFICER',
    'VERIFICATION_OFFICER',
    'FINANCE_OFFICER',
    'COUNTY_REPRESENTATIVE'
  ),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      recipientPhone: z.string().min(9).max(20),
      message: z.string().min(5).max(480),
      templateCode: z
        .enum(['VERIFICATION', 'PAYMENT', 'ONBOARDING', 'GENERAL'])
        .default('GENERAL'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid Kenyan phone number and SMS message required.' });
    }

    const screen = screenGeneralCommunicationForConfidentiality(parsed.data.message);
    if (!screen.allowed) {
      return res.status(400).json({ error: screen.reason || 'Confidential PII blocked from SMS.' });
    }

    try {
      const result = await dispatchTalksasaSms({
        recipientPhone: parsed.data.recipientPhone,
        message: parsed.data.message,
        templateCode: parsed.data.templateCode,
        userId: req.authUser!.userId,
      });

      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'TALKSASA_SMS_DISPATCHED',
        entityType: 'talksasa_sms_logs',
        entityId: result.logId,
        ip: req.ip,
        details: {
          dispatchRef: result.dispatchRef,
          templateCode: parsed.data.templateCode,
          deliveryStatus: result.deliveryStatus,
        },
      });

      res.status(201).json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Unable to dispatch TalkSasa SMS.' });
    }
  }
);

communicationsRouter.post(
  '/talksasa/retry/:id',
  requireRole('SUPER_ADMIN', 'HR_OFFICER', 'VERIFICATION_OFFICER', 'FINANCE_OFFICER'),
  async (req: AuthRequest, res) => {
    try {
      const result = await retryTalksasaSms(req.params.id);
      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'TALKSASA_SMS_RETRIED',
        entityType: 'talksasa_sms_logs',
        entityId: result.logId,
        ip: req.ip,
        details: { dispatchRef: result.dispatchRef, deliveryStatus: result.deliveryStatus },
      });
      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Unable to retry SMS dispatch.' });
    }
  }
);
