import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  donations,
  paymentTransactions,
  supporterProfiles,
  humanitarianFunds,
  needRequests,
  sponsorships,
  ledgerEntries,
  financialApprovals,
  notifications,
  beneficiaryProfiles,
} from '../db/schema.ts';
import {
  requireAuth,
  requireRole,
  requirePrivilegedMfa,
  type AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';
import { sha256Hex } from '../lib/crypto.ts';

export const paymentsRouter = Router();

function getDarajaBaseUrl() {
  return process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function fetchDarajaOAuthToken(): Promise<{ accessToken: string; mode: 'LIVE_DARAJA' | 'SANDBOX_SIMULATED' }> {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) {
    return { accessToken: '', mode: 'SANDBOX_SIMULATED' };
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const resp = await fetch(
    `${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  if (!resp.ok) {
    throw new Error(`Daraja OAuth authentication failed (${resp.status})`);
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Daraja OAuth token missing in response');
  return { accessToken: data.access_token, mode: 'LIVE_DARAJA' };
}

function normalizeKenyaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  return digits;
}

// POST /api/payments/mpesa/stk-push — Backend-only Daraja STK Push initiation
paymentsRouter.post('/mpesa/stk-push', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      phone: z.string().min(9).max(16),
      amountMinor: z.number().int().positive(),
      pathway: z.enum(['DIRECT_SPONSORSHIP', 'CENTRAL_FUND']),
      beneficiaryId: z.string().uuid().optional(),
      needRequestId: z.string().uuid().optional(),
      fundId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(8).optional(),
      isGiftDonation: z.boolean().default(false),
      giftHonoreeName: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid phone number, positive amount, and pathway required.' });
    }
    const d = parsed.data;
    const msisdn = normalizeKenyaPhone(d.phone);
    if (!/^254[17]\d{8}$/.test(msisdn)) {
      return res.status(400).json({ error: 'Enter a valid Kenyan M-Pesa number (e.g. 0712345678 or +254712345678).' });
    }

    const idemKey = d.idempotencyKey || `stk-${req.authUser!.userId}-${crypto.randomUUID()}`;
    const [existingTx] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, idemKey))
      .limit(1);
    if (existingTx) {
      return res.json({ deduplicated: true, transaction: existingTx });
    }

    const [supporter] = await db
      .select()
      .from(supporterProfiles)
      .where(eq(supporterProfiles.userId, req.authUser!.userId))
      .limit(1);
    if (!supporter) {
      return res.status(400).json({ error: 'Supporter profile required before payment initiation.' });
    }

    const oauth = await fetchDarajaOAuthToken();
    const amountKes = Math.max(1, Math.round(d.amountMinor / 100));
    let checkoutRequestId = `ws_CO_${crypto.randomBytes(8).toString('hex')}`;

    if (oauth.mode === 'LIVE_DARAJA' && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14);
      const password = Buffer.from(
        `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
      ).toString('base64');

      const stkRes = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: process.env.MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: amountKes,
          PartyA: msisdn,
          PartyB: process.env.MPESA_SHORTCODE,
          PhoneNumber: msisdn,
          CallBackURL: process.env.MPESA_CALLBACK_URL || `${process.env.APP_URL}/api/payments/mpesa/callback`,
          AccountReference: d.pathway === 'DIRECT_SPONSORSHIP' ? 'HC-SPONSOR' : 'HC-FUND',
          TransactionDesc: 'Humanity Connect Contribution',
        }),
      });
      const stkJson = (await stkRes.json()) as { CheckoutRequestID?: string; errorMessage?: string };
      if (!stkRes.ok || !stkJson.CheckoutRequestID) {
        return res.status(502).json({ error: stkJson.errorMessage || 'Daraja STK Push request failed.' });
      }
      checkoutRequestId = stkJson.CheckoutRequestID;
    }

    const created = await db.transaction(async (tx) => {
      const [donation] = await tx
        .insert(donations)
        .values({
          supporterId: supporter.id,
          pathway: d.pathway,
          beneficiaryId: d.beneficiaryId ?? null,
          needRequestId: d.needRequestId ?? null,
          fundId: d.fundId ?? null,
          isPledge: false,
          isGiftDonation: d.isGiftDonation,
          giftHonoreeName: d.giftHonoreeName || null,
          amountMinor: d.amountMinor,
          currency: 'KES',
          status: 'PAYMENT_PENDING',
        })
        .returning();

      const [ptx] = await tx
        .insert(paymentTransactions)
        .values({
          donationId: donation.id,
          provider: 'MPESA_DARAJA',
          idempotencyKey: idemKey,
          checkoutRequestId,
          phoneE164: `+${msisdn}`,
          amountMinor: d.amountMinor,
          currency: 'KES',
          verificationStatus: 'CALLBACK_PENDING',
        })
        .returning();

      return { donation, transaction: ptx };
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'MPESA_STK_INITIATED',
      entityType: 'payment_transactions',
      entityId: created.transaction.id,
      ip: req.ip,
      details: { mode: oauth.mode, checkoutRequestId },
    });

    res.status(201).json({
      ...created,
      gatewayMode: oauth.mode,
      message: 'STK Push initiated. Awaiting verified Safaricom Daraja callback.',
    });
  } catch (err: any) {
    console.error('STK Push error:', err);
    res.status(500).json({ error: err.message || 'Unable to initiate M-Pesa STK Push.' });
  }
});

// Shared atomic settlement processor with duplicate callback protection & double-entry ledger
async function settleDarajaCallback(payload: {
  checkoutRequestId: string;
  resultCode: number;
  mpesaReceiptNumber?: string;
  amountKes?: number;
  rawBody: unknown;
}) {
  return db.transaction(async (tx) => {
    const [ptx] = await tx
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.checkoutRequestId, payload.checkoutRequestId))
      .limit(1);

    if (!ptx) throw new Error('Unknown CheckoutRequestID.');
    if (ptx.verificationStatus === 'VERIFIED') {
      return { duplicateCallback: true, transaction: ptx };
    }

    const [donation] = await tx
      .select()
      .from(donations)
      .where(eq(donations.id, ptx.donationId))
      .limit(1);
    if (!donation) throw new Error('Associated donation record missing.');

    if (payload.resultCode !== 0) {
      const [failedTx] = await tx
        .update(paymentTransactions)
        .set({
          verificationStatus: 'FAILED',
          failureReason: `Daraja ResultCode ${payload.resultCode}`,
          rawCallbackHash: sha256Hex(JSON.stringify(payload.rawBody)),
        })
        .where(eq(paymentTransactions.id, ptx.id))
        .returning();
      await tx.update(donations).set({ status: 'FAILED' }).where(eq(donations.id, donation.id));
      return { settled: false, transaction: failedTx };
    }

    // Validate settled amount matches expected transaction amount
    if (payload.amountKes !== undefined) {
      const expectedKes = Math.round(ptx.amountMinor / 100);
      if (Math.abs(payload.amountKes - expectedKes) > 1) {
        throw new Error(`Callback amount mismatch: expected KES ${expectedKes}, got KES ${payload.amountKes}.`);
      }
    }

    const receipt =
      payload.mpesaReceiptNumber || `QK${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const [verifiedTx] = await tx
      .update(paymentTransactions)
      .set({
        verificationStatus: 'VERIFIED',
        mpesaReceiptNumber: receipt,
        rawCallbackHash: sha256Hex(JSON.stringify(payload.rawBody)),
        verifiedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, ptx.id))
      .returning();

    await tx
      .update(donations)
      .set({ status: 'CONFIRMED', confirmedAt: new Date() })
      .where(eq(donations.id, donation.id));

    // Double-entry accounting journal entries (strictly separates donation trust liability from platform revenue)
    const journalGroupId = crypto.randomUUID();
    const liabilityCode =
      donation.pathway === 'DIRECT_SPONSORSHIP'
        ? '2010-DIRECT-SPONSORSHIP-TRUST'
        : '2020-CENTRAL-HUMANITARIAN-FUND';
    const liabilityName =
      donation.pathway === 'DIRECT_SPONSORSHIP'
        ? 'Direct Sponsorship Trust Payable'
        : 'Central Humanitarian Fund Restricted Pool';

    await tx.insert(ledgerEntries).values([
      {
        journalGroupId,
        pathway: donation.pathway,
        accountCode: '1010-MPESA-CLEARING',
        accountName: 'Safaricom M-Pesa Settlement Clearing',
        debitMinor: donation.amountMinor,
        creditMinor: 0,
        currency: donation.currency,
        referenceType: 'PAYMENT',
        referenceId: verifiedTx.id,
        description: `Verified M-Pesa receipt ${receipt}`,
      },
      {
        journalGroupId,
        pathway: donation.pathway,
        accountCode: liabilityCode,
        accountName: liabilityName,
        debitMinor: 0,
        creditMinor: donation.amountMinor,
        currency: donation.currency,
        referenceType: 'PAYMENT',
        referenceId: verifiedTx.id,
        description: `100% donor principal credited to ${donation.pathway} (0% platform fee deducted from donor principal)`,
      },
    ]);

    if (donation.pathway === 'DIRECT_SPONSORSHIP') {
      if (donation.needRequestId) {
        await tx
          .update(needRequests)
          .set({
            fulfilledAmountMinor: sql`${needRequests.fulfilledAmountMinor} + ${donation.amountMinor}`,
            status: 'FUNDING',
          })
          .where(eq(needRequests.id, donation.needRequestId));
      }
      if (donation.beneficiaryId) {
        await tx
          .update(sponsorships)
          .set({ status: 'ACTIVE', startedAt: new Date() })
          .where(
            and(
              eq(sponsorships.supporterId, donation.supporterId),
              eq(sponsorships.beneficiaryId, donation.beneficiaryId),
              eq(sponsorships.status, 'PENDING_FIRST_PAYMENT')
            )
          );
      }
    } else if (donation.pathway === 'CENTRAL_FUND' && donation.fundId) {
      await tx
        .update(humanitarianFunds)
        .set({
          availableBalanceMinor: sql`${humanitarianFunds.availableBalanceMinor} + ${donation.amountMinor}`,
          totalReceivedMinor: sql`${humanitarianFunds.totalReceivedMinor} + ${donation.amountMinor}`,
        })
        .where(eq(humanitarianFunds.id, donation.fundId));
    }

    return { settled: true, transaction: verifiedTx, journalGroupId };
  });
}

// POST /api/payments/mpesa/callback — Official Safaricom Daraja Webhook
paymentsRouter.post('/mpesa/callback', async (req, res) => {
  try {
    const webhookSecret = process.env.MPESA_WEBHOOK_SECRET;
    if (webhookSecret && req.headers['x-mpesa-webhook-secret'] !== webhookSecret) {
      return res.status(403).json({ error: 'Invalid webhook verification signature.' });
    }

    const body = req.body as any;
    const stk = body?.Body?.stkCallback;
    const checkoutRequestId = stk?.CheckoutRequestID || body?.checkoutRequestId;
    const resultCode = typeof stk?.ResultCode === 'number' ? stk.ResultCode : body?.resultCode;

    if (!checkoutRequestId || typeof resultCode !== 'number') {
      return res.status(400).json({ error: 'Malformed Daraja callback payload.' });
    }

    let mpesaReceipt: string | undefined = body?.mpesaReceiptNumber;
    let amountKes: number | undefined;
    const items: Array<{ Name: string; Value: unknown }> = stk?.CallbackMetadata?.Item || [];
    for (const item of items) {
      if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value);
      if (item.Name === 'Amount') amountKes = Number(item.Value);
    }

    const result = await settleDarajaCallback({
      checkoutRequestId,
      resultCode,
      mpesaReceiptNumber: mpesaReceipt,
      amountKes,
      rawBody: body,
    });

    await writeAuditLog({
      actorRole: 'MPESA_GATEWAY',
      action: result.settled ? 'MPESA_CALLBACK_SETTLED' : 'MPESA_CALLBACK_PROCESSED',
      entityType: 'payment_transactions',
      entityId: result.transaction.id,
      ip: req.ip,
      details: { checkoutRequestId, resultCode },
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted', ...result });
  } catch (err: any) {
    console.error('M-Pesa callback error:', err);
    res.status(400).json({ error: err.message || 'Callback rejected.' });
  }
});

// GET /api/payments/:id/status
paymentsRouter.get('/:id/status', requireAuth, async (req: AuthRequest, res) => {
  const [tx] = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, String(req.params.id)))
    .limit(1);
  if (!tx) return res.status(404).json({ error: 'Payment transaction not found.' });
  res.json({ transaction: tx });
});

// POST /api/payments/mpesa/stk-query
paymentsRouter.post('/mpesa/stk-query', requireAuth, async (req: AuthRequest, res) => {
  const { checkoutRequestId } = req.body as { checkoutRequestId?: string };
  if (!checkoutRequestId) return res.status(400).json({ error: 'checkoutRequestId is required.' });

  const [tx] = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.checkoutRequestId, checkoutRequestId))
    .limit(1);
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

  res.json({
    checkoutRequestId,
    verificationStatus: tx.verificationStatus,
    mpesaReceiptNumber: tx.mpesaReceiptNumber,
    verifiedAt: tx.verifiedAt,
    env: process.env.MPESA_ENV || 'sandbox',
  });
});

// Maker-Checker Financial Approval Queue (Disbursements, Refunds, Reversals)
paymentsRouter.post(
  '/approvals/request',
  requireAuth,
  requireRole('SUPER_ADMIN', 'FINANCE_OFFICER', 'FIELD_OFFICER'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    const schema = z.object({
      operationType: z.enum(['DISBURSEMENT', 'REFUND', 'REVERSAL', 'FUND_ALLOCATION']),
      pathway: z.enum(['DIRECT_SPONSORSHIP', 'CENTRAL_FUND']),
      targetEntityId: z.string().uuid(),
      amountMinor: z.number().int().positive(),
      reason: z.string().min(6),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid approval request.' });

    const [approval] = await db
      .insert(financialApprovals)
      .values({
        ...parsed.data,
        makerUserId: req.authUser!.userId,
        status: 'PENDING_CHECKER',
      })
      .returning();

    res.status(201).json({ approval });
  }
);

paymentsRouter.post(
  '/approvals/:id/decide',
  requireAuth,
  requireRole('SUPER_ADMIN', 'FINANCE_OFFICER'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    const { decision } = req.body as { decision?: 'APPROVED' | 'REJECTED' };
    if (!decision) return res.status(400).json({ error: 'APPROVED or REJECTED required.' });

    const [approval] = await db
      .select()
      .from(financialApprovals)
      .where(eq(financialApprovals.id, String(req.params.id)))
      .limit(1);
    if (!approval) return res.status(404).json({ error: 'Approval record not found.' });
    if (approval.makerUserId === req.authUser!.userId) {
      return res.status(403).json({
        error: 'Maker-Checker separation enforced: the initiating officer cannot approve their own financial request.',
      });
    }

    const [updated] = await db
      .update(financialApprovals)
      .set({
        checkerUserId: req.authUser!.userId,
        status: decision,
        decidedAt: new Date(),
      })
      .where(eq(financialApprovals.id, approval.id))
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: `FINANCIAL_MAKER_CHECKER_${decision}`,
      entityType: 'financial_approvals',
      entityId: approval.id,
      ip: req.ip,
    });

    res.json({ approval: updated });
  }
);

// GET /api/payments/reports/monthly — Double-Entry Financial Statement
paymentsRouter.get(
  '/reports/monthly',
  requireAuth,
  requireRole(
    'SUPER_ADMIN',
    'FINANCE_OFFICER',
    'AUDITOR',
    'FIELD_OFFICER',
    'VERIFICATION_OFFICER',
    'WELFARE_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'DATA_MANAGEMENT_OFFICER',
    'HR_OFFICER',
    'SAFEGUARDING_OFFICER',
    'WELL_WISHER'
  ),
  async (_req: AuthRequest, res) => {
    const [journals, approvals, pledgesSummary, verifiedSummary, funds] = await Promise.all([
      db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(100),
      db.select().from(financialApprovals).orderBy(desc(financialApprovals.createdAt)).limit(30),
      db
        .select({
          totalPledgedMinor: sql<number>`coalesce(sum(${donations.amountMinor}), 0)::int`,
        })
        .from(donations)
        .where(eq(donations.status, 'PLEDGED')),
      db
        .select({
          totalVerifiedMinor: sql<number>`coalesce(sum(${paymentTransactions.amountMinor}), 0)::int`,
        })
        .from(paymentTransactions)
        .where(eq(paymentTransactions.verificationStatus, 'VERIFIED')),
      db.select().from(humanitarianFunds),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      pledgedNotReceivedMinor: pledgesSummary[0]?.totalPledgedMinor ?? 0,
      verifiedReceivedMinor: verifiedSummary[0]?.totalVerifiedMinor ?? 0,
      funds,
      journalEntries: journals,
      makerCheckerApprovals: approvals,
    });
  }
);

// GET /api/payments/integration-guide — Safaricom Daraja Production & Sandbox Integration Guide
paymentsRouter.get('/integration-guide', (_req, res) => {
  res.json({
    provider: 'Safaricom Daraja M-Pesa (Kenya)',
    endpoints: [
      'POST /api/payments/mpesa/stk-push',
      'POST /api/payments/mpesa/callback',
      'GET /api/payments/:id/status',
      'POST /api/payments/mpesa/stk-query',
    ],
    requiredEnvVars: [
      'MPESA_ENV=sandbox|production',
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_SHORTCODE',
      'MPESA_PASSKEY',
      'MPESA_CALLBACK_URL',
      'MPESA_WEBHOOK_SECRET',
    ],
    securityGuarantees: [
      'Credentials stored strictly in backend environment variables; never exposed to React bundle.',
      'Idempotency key prevents duplicate STK push transactions.',
      'Duplicate callback protection checks verificationStatus === VERIFIED inside PostgreSQL transaction.',
      'Pledges are never counted as settled balances until Daraja ResultCode === 0 is verified server-side.',
      'Production B2C disbursements require Maker-Checker two-person approval and are blocked in sandbox mode.',
    ],
  });
});
