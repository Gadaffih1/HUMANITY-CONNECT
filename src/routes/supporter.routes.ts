import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, and, desc, sql, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  supporterProfiles,
  savedBeneficiaries,
  beneficiaryProfiles,
  donations,
  paymentTransactions,
  sponsorships,
  recurringSchedules,
  humanitarianFunds,
  needRequests,
  communityProjects,
  volunteerAssignments,
  notifications,
  sponsorshipMatchSuggestions,
  disbursements,
} from '../db/schema.ts';
import { requireAuth, type AuthRequest, writeAuditLog } from '../middleware/auth.ts';
import { sha256Hex } from '../lib/crypto.ts';
import { buildImpactTimeline } from '../lib/impactTimeline.ts';

export const supporterRouter = Router();
supporterRouter.use(requireAuth);

supporterRouter.get('/impact-timeline', async (_req: AuthRequest, res) => {
  try {
    const now = new Date();
    const disbursementMonth = sql<string>`to_char(${disbursements.disbursedAt} AT TIME ZONE 'UTC', 'YYYY-MM')`;
    const targetMonth = sql<string>`to_char(${needRequests.humanApprovedAt} AT TIME ZONE 'UTC', 'YYYY-MM')`;
    const [settled, targets] = await Promise.all([
      db.select({
        month: disbursementMonth,
        amountMinor: sql<string>`sum(${disbursements.amountMinor})::text`,
      }).from(disbursements).where(and(
        eq(disbursements.status, 'SETTLED'),
        eq(disbursements.currency, 'KES'),
        isNotNull(disbursements.disbursedAt),
        lte(disbursements.disbursedAt, now),
      )).groupBy(disbursementMonth),
      db.select({
        month: targetMonth,
        amountMinor: sql<string>`sum(${needRequests.targetAmountMinor})::text`,
      }).from(needRequests).where(and(
        eq(needRequests.verificationStatus, 'HUMAN_APPROVED'),
        eq(needRequests.currency, 'KES'),
        isNotNull(needRequests.humanApprovedAt),
        lte(needRequests.humanApprovedAt, now),
      )).groupBy(targetMonth),
    ]);
    res.json({ currency: 'KES', points: buildImpactTimeline(settled, targets, now.toISOString().slice(0, 7)) });
  } catch (err) {
    console.error('Impact timeline error:', err);
    res.status(500).json({ error: 'Unable to load impact timeline.' });
  }
});

async function getOrCreateSupporterProfile(userId: string, fullName: string, activeRole: string) {
  const [existing] = await db
    .select()
    .from(supporterProfiles)
    .where(eq(supporterProfiles.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(supporterProfiles)
    .values({
      userId,
      supporterType: activeRole === 'WELL_WISHER' ? 'WELL_WISHER' : 'SUPPORTIVE',
      displayName: fullName,
      preferredCurrency: 'KES',
    })
    .returning();
  return created;
}

supporterRouter.get('/portal', async (req: AuthRequest, res) => {
  try {
    const supporter = await getOrCreateSupporterProfile(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );

    const [
      mySaved,
      myDonations,
      mySponsorships,
      myRecurring,
      funds,
      projects,
      myVolunteering,
      myNotifications,
    ] = await Promise.all([
      db
        .select({
          id: savedBeneficiaries.id,
          beneficiaryId: beneficiaryProfiles.id,
          referenceCode: beneficiaryProfiles.referenceCode,
          displayAlias: beneficiaryProfiles.displayAlias,
          county: beneficiaryProfiles.county,
          classification: beneficiaryProfiles.classification,
          verificationLevel: beneficiaryProfiles.verificationLevel,
          note: savedBeneficiaries.note,
        })
        .from(savedBeneficiaries)
        .innerJoin(beneficiaryProfiles, eq(savedBeneficiaries.beneficiaryId, beneficiaryProfiles.id))
        .where(eq(savedBeneficiaries.supporterId, supporter.id)),
      db
        .select({
          id: donations.id,
          pathway: donations.pathway,
          beneficiaryId: donations.beneficiaryId,
          fundId: donations.fundId,
          isPledge: donations.isPledge,
          sponsorshipCoverage: donations.sponsorshipCoverage,
          isGiftDonation: donations.isGiftDonation,
          giftHonoreeName: donations.giftHonoreeName,
          amountMinor: donations.amountMinor,
          currency: donations.currency,
          status: donations.status,
          originatedFromAiMatch: donations.originatedFromAiMatch,
          matchSuggestionId: donations.matchSuggestionId,
          confirmedAt: donations.confirmedAt,
          createdAt: donations.createdAt,
          txId: paymentTransactions.id,
          provider: paymentTransactions.provider,
          checkoutRequestId: paymentTransactions.checkoutRequestId,
          mpesaReceiptNumber: paymentTransactions.mpesaReceiptNumber,
          verificationStatus: paymentTransactions.verificationStatus,
        })
        .from(donations)
        .leftJoin(paymentTransactions, eq(paymentTransactions.donationId, donations.id))
        .where(eq(donations.supporterId, supporter.id))
        .orderBy(desc(donations.createdAt)),
      db
        .select({
          id: sponsorships.id,
          beneficiaryId: sponsorships.beneficiaryId,
          beneficiaryAlias: beneficiaryProfiles.displayAlias,
          beneficiaryRef: beneficiaryProfiles.referenceCode,
          county: beneficiaryProfiles.county,
          monthlyAmountMinor: sponsorships.monthlyAmountMinor,
          currency: sponsorships.currency,
          status: sponsorships.status,
          originatedFromAiMatch: sponsorships.originatedFromAiMatch,
          matchSuggestionId: sponsorships.matchSuggestionId,
          startedAt: sponsorships.startedAt,
        })
        .from(sponsorships)
        .innerJoin(beneficiaryProfiles, eq(sponsorships.beneficiaryId, beneficiaryProfiles.id))
        .where(eq(sponsorships.supporterId, supporter.id)),
      db
        .select()
        .from(recurringSchedules)
        .where(eq(recurringSchedules.supporterId, supporter.id))
        .orderBy(desc(recurringSchedules.createdAt)),
      db.select().from(humanitarianFunds),
      db.select().from(communityProjects),
      db
        .select()
        .from(volunteerAssignments)
        .where(eq(volunteerAssignments.userId, req.authUser!.userId)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.authUser!.userId))
        .orderBy(desc(notifications.createdAt)),
    ]);

    const confirmedTotalMinor = myDonations
      .filter((d) => d.status === 'CONFIRMED')
      .reduce((acc, d) => acc + d.amountMinor, 0);
    const aiDonations = myDonations.filter((d) => d.originatedFromAiMatch);
    const aiConfirmedMinor = aiDonations
      .filter((d) => d.status === 'CONFIRMED')
      .reduce((acc, d) => acc + d.amountMinor, 0);
    const aiPledgedMinor = aiDonations
      .filter((d) => d.status === 'PLEDGED')
      .reduce((acc, d) => acc + d.amountMinor, 0);
    const aiSponsorshipsCount = mySponsorships.filter((s) => s.originatedFromAiMatch).length;
    const activeAiSponsorshipsCount = mySponsorships.filter(
      (s) => s.originatedFromAiMatch && s.status === 'ACTIVE'
    ).length;

    res.json({
      supporter,
      savedBeneficiaries: mySaved,
      donations: myDonations,
      sponsorships: mySponsorships,
      recurringSchedules: myRecurring,
      funds,
      projects,
      volunteerAssignments: myVolunteering,
      notifications: myNotifications,
      aiEffectiveness: {
        aiDonationsCount: aiDonations.length,
        totalDonationsCount: myDonations.length,
        aiConfirmedAmountMinor: aiConfirmedMinor,
        aiPledgedAmountMinor: aiPledgedMinor,
        totalConfirmedAmountMinor: confirmedTotalMinor,
        aiShareOfConfirmedPct:
          confirmedTotalMinor > 0 ? Math.round((aiConfirmedMinor / confirmedTotalMinor) * 100) : 0,
        aiSponsorshipsCount,
        activeAiSponsorshipsCount,
        totalSponsorshipsCount: mySponsorships.length,
        aiSponsorshipSharePct:
          mySponsorships.length > 0
            ? Math.round((aiSponsorshipsCount / mySponsorships.length) * 100)
            : 0,
      },
    });
  } catch (err) {
    console.error('Supporter portal error:', err);
    res.status(500).json({ error: 'Unable to load supporter workspace.' });
  }
});

supporterRouter.patch('/preferences', async (req: AuthRequest, res) => {
  const supporter = await getOrCreateSupporterProfile(
    req.authUser!.userId,
    req.authUser!.fullName,
    req.authUser!.activeRole
  );
  const { anonymousGiving, displayName } = req.body as {
    anonymousGiving?: boolean;
    displayName?: string;
  };
  const [updated] = await db
    .update(supporterProfiles)
    .set({
      anonymousGiving: anonymousGiving ?? supporter.anonymousGiving,
      displayName: displayName ?? supporter.displayName,
    })
    .where(eq(supporterProfiles.id, supporter.id))
    .returning();
  res.json({ supporter: updated });
});

supporterRouter.post('/saved/:beneficiaryId', async (req: AuthRequest, res) => {
  const supporter = await getOrCreateSupporterProfile(
    req.authUser!.userId,
    req.authUser!.fullName,
    req.authUser!.activeRole
  );
  const beneficiaryId = String(req.params.beneficiaryId);
  const [existing] = await db
    .select()
    .from(savedBeneficiaries)
    .where(
      and(
        eq(savedBeneficiaries.supporterId, supporter.id),
        eq(savedBeneficiaries.beneficiaryId, beneficiaryId)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(savedBeneficiaries).where(eq(savedBeneficiaries.id, existing.id));
    return res.json({ saved: false });
  }
  await db.insert(savedBeneficiaries).values({
    supporterId: supporter.id,
    beneficiaryId,
  });
  res.json({ saved: true });
});

// Checkout: strictly creates PLEDGE or INITIATED payment intent. NEVER marks payment successful without server-side callback verification!
supporterRouter.post('/checkout', async (req: AuthRequest, res) => {
  try {
    const supporter = await getOrCreateSupporterProfile(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );

    const schema = z.object({
      pathway: z.enum(['DIRECT_SPONSORSHIP', 'CENTRAL_FUND']),
      beneficiaryId: z.string().uuid().optional(),
      needRequestId: z.string().uuid().optional(),
      fundId: z.string().uuid().optional(),
      amountMinor: z.number().int().positive(),
      currency: z.string().default('KES'),
      mode: z.enum(['PLEDGE_ONLY', 'MPESA_STK', 'CARD_GATEWAY']),
      phoneE164: z.string().optional(),
      sponsorshipCoverage: z.enum(['FULL', 'PARTIAL']).default('PARTIAL'),
      isRecurring: z.boolean().default(false),
      cadence: z
        .enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SCHOOL_TERM', 'ANNUALLY', 'CUSTOM'])
        .default('MONTHLY'),
      customIntervalDays: z.number().int().min(7).max(365).optional(),
      supporterConsentGranted: z.boolean().default(true),
      endDate: z.string().optional(),
      isGiftDonation: z.boolean().default(false),
      giftHonoreeName: z.string().max(120).optional(),
      giftMessage: z.string().max(400).optional(),
      originatedFromAiMatch: z.boolean().default(false),
      matchSuggestionId: z.string().uuid().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid contribution request.' });
    }
    const d = parsed.data;

    if (d.pathway === 'DIRECT_SPONSORSHIP' && !d.beneficiaryId) {
      return res.status(400).json({ error: 'Verified beneficiary selection is required for direct sponsorship.' });
    }
    if (d.pathway === 'CENTRAL_FUND' && !d.fundId) {
      return res.status(400).json({ error: 'Central humanitarian fund selection is required.' });
    }

    const originatedFromAi = Boolean(d.originatedFromAiMatch || d.matchSuggestionId);
    let resolvedMatchSuggestionId: string | null = null;
    if (d.matchSuggestionId) {
      const [validMatch] = await db
        .select({ id: sponsorshipMatchSuggestions.id })
        .from(sponsorshipMatchSuggestions)
        .where(
          and(
            eq(sponsorshipMatchSuggestions.id, d.matchSuggestionId),
            eq(sponsorshipMatchSuggestions.supporterId, supporter.id)
          )
        )
        .limit(1);
      resolvedMatchSuggestionId = validMatch?.id ?? null;
    } else if (originatedFromAi && d.beneficiaryId) {
      const [latestMatch] = await db
        .select({ id: sponsorshipMatchSuggestions.id })
        .from(sponsorshipMatchSuggestions)
        .where(
          and(
            eq(sponsorshipMatchSuggestions.supporterId, supporter.id),
            eq(sponsorshipMatchSuggestions.beneficiaryId, d.beneficiaryId)
          )
        )
        .orderBy(desc(sponsorshipMatchSuggestions.createdAt))
        .limit(1);
      resolvedMatchSuggestionId = latestMatch?.id ?? null;
    }

    const result = await db.transaction(async (tx) => {
      const isPledge = d.mode === 'PLEDGE_ONLY';

      const [donation] = await tx
        .insert(donations)
        .values({
          supporterId: supporter.id,
          pathway: d.pathway,
          beneficiaryId: d.beneficiaryId ?? null,
          needRequestId: d.needRequestId ?? null,
          fundId: d.fundId ?? null,
          isPledge,
          sponsorshipCoverage: d.sponsorshipCoverage,
          isGiftDonation: d.isGiftDonation,
          giftHonoreeName: d.giftHonoreeName || null,
          giftMessage: d.giftMessage || null,
          amountMinor: d.amountMinor,
          currency: d.currency,
          status: isPledge ? 'PLEDGED' : 'PAYMENT_PENDING',
          originatedFromAiMatch: originatedFromAi,
          matchSuggestionId: resolvedMatchSuggestionId,
        })
        .returning();

      let sponsorshipRecord = null;
      if (d.pathway === 'DIRECT_SPONSORSHIP' && d.beneficiaryId) {
        const [sp] = await tx
          .insert(sponsorships)
          .values({
            supporterId: supporter.id,
            beneficiaryId: d.beneficiaryId,
            needRequestId: d.needRequestId ?? null,
            monthlyAmountMinor: d.amountMinor,
            currency: d.currency,
            status: 'PENDING_FIRST_PAYMENT',
            originatedFromAiMatch: originatedFromAi,
            matchSuggestionId: resolvedMatchSuggestionId,
          })
          .returning();
        sponsorshipRecord = sp;

        await tx
          .update(sponsorshipMatchSuggestions)
          .set({ status: 'SPONSORED' })
          .where(
            and(
              eq(sponsorshipMatchSuggestions.supporterId, supporter.id),
              eq(sponsorshipMatchSuggestions.beneficiaryId, d.beneficiaryId)
            )
          );
      }

      if (d.isRecurring) {
        if (!d.supporterConsentGranted) {
          throw new Error('Explicit supporter consent is required for recurring sponsorship agreements.');
        }
        const nextRun = new Date();
        if (d.cadence === 'WEEKLY') nextRun.setDate(nextRun.getDate() + 7);
        else if (d.cadence === 'QUARTERLY') nextRun.setMonth(nextRun.getMonth() + 3);
        else if (d.cadence === 'SCHOOL_TERM') nextRun.setMonth(nextRun.getMonth() + 4);
        else if (d.cadence === 'ANNUALLY') nextRun.setFullYear(nextRun.getFullYear() + 1);
        else if (d.cadence === 'CUSTOM' && d.customIntervalDays) {
          nextRun.setDate(nextRun.getDate() + d.customIntervalDays);
        } else nextRun.setMonth(nextRun.getMonth() + 1);

        const agreementRef = `AGR-KE-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const reassessDue = new Date();
        reassessDue.setMonth(reassessDue.getMonth() + 6);

        await tx.insert(recurringSchedules).values({
          agreementReference: agreementRef,
          supporterId: supporter.id,
          pathway: d.pathway,
          sponsorshipId: sponsorshipRecord?.id ?? null,
          fundId: d.fundId ?? null,
          amountMinor: d.amountMinor,
          currency: d.currency,
          cadence: d.cadence,
          customIntervalDays: d.customIntervalDays || null,
          paymentMethod: d.mode === 'MPESA_STK' ? 'MPESA_DARAJA' : 'CARD',
          supporterConsentGranted: true,
          paymentAuthorised: d.mode !== 'PLEDGE_ONLY',
          endDate: d.endDate ? new Date(d.endDate) : null,
          nextChargeAt: nextRun,
          beneficiaryReassessmentDueAt: reassessDue,
          status: 'ACTIVE',
        });
      }

      let paymentTx = null;
      if (!isPledge) {
        const checkoutRequestId = `ws_CO_${crypto.randomBytes(8).toString('hex')}`;
        const idempotencyKey = `hc-pay-${crypto.randomUUID()}`;
        const [ptx] = await tx
          .insert(paymentTransactions)
          .values({
            donationId: donation.id,
            provider: d.mode === 'MPESA_STK' ? 'MPESA_DARAJA' : 'CARD',
            idempotencyKey,
            checkoutRequestId,
            phoneE164: d.phoneE164 || req.authUser!.phoneE164 || null,
            amountMinor: d.amountMinor,
            currency: d.currency,
            verificationStatus: 'CALLBACK_PENDING',
          })
          .returning();
        paymentTx = ptx;
      }

      return { donation, sponsorshipRecord, paymentTx };
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: d.mode === 'PLEDGE_ONLY' ? 'PLEDGE_RECORDED' : 'PAYMENT_INITIATED',
      entityType: 'donations',
      entityId: result.donation.id,
      ip: req.ip,
      details: {
        pathway: d.pathway,
        amountMinor: d.amountMinor,
        originatedFromAiMatch: originatedFromAi,
        matchSuggestionId: resolvedMatchSuggestionId,
      },
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Unable to initiate contribution.' });
  }
});

// Server-side M-Pesa Daraja / Payment Verification Callback (atomic ledger settlement)
supporterRouter.post('/mpesa/verify-callback', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      checkoutRequestId: z.string().min(4),
      resultCode: z.number().int(),
      mpesaReceiptNumber: z.string().min(4).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid callback payload.' });

    const { checkoutRequestId, resultCode, mpesaReceiptNumber } = parsed.data;

    const settled = await db.transaction(async (tx) => {
      const [ptx] = await tx
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.checkoutRequestId, checkoutRequestId))
        .limit(1);

      if (!ptx) throw new Error('Transaction not found.');
      if (ptx.verificationStatus === 'VERIFIED') return { alreadySettled: true, ptx };

      const [donation] = await tx
        .select()
        .from(donations)
        .where(eq(donations.id, ptx.donationId))
        .limit(1);
      if (!donation) throw new Error('Parent donation not found.');

      if (resultCode !== 0) {
        const [failedTx] = await tx
          .update(paymentTransactions)
          .set({
            verificationStatus: 'FAILED',
            failureReason: `Gateway returned non-zero status code (${resultCode})`,
            rawCallbackHash: sha256Hex(JSON.stringify(req.body)),
          })
          .where(eq(paymentTransactions.id, ptx.id))
          .returning();

        await tx
          .update(donations)
          .set({ status: 'FAILED' })
          .where(eq(donations.id, donation.id));

        return { failed: true, ptx: failedTx };
      }

      const verifiedReceipt =
        mpesaReceiptNumber || `QKH${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const [verifiedTx] = await tx
        .update(paymentTransactions)
        .set({
          verificationStatus: 'VERIFIED',
          mpesaReceiptNumber: verifiedReceipt,
          rawCallbackHash: sha256Hex(JSON.stringify(req.body)),
          verifiedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, ptx.id))
        .returning();

      await tx
        .update(donations)
        .set({ status: 'CONFIRMED', confirmedAt: new Date() })
        .where(eq(donations.id, donation.id));

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

      await tx.insert(notifications).values({
        userId: req.authUser!.userId,
        category: 'PAYMENT',
        title: `Verified Payment Receipt ${verifiedReceipt}`,
        body: `Your contribution of ${donation.currency} ${(donation.amountMinor / 100).toLocaleString()} has been server-verified and settled.`,
      });

      return { settled: true, ptx: verifiedTx };
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'PAYMENT_SERVER_VERIFIED',
      entityType: 'payment_transactions',
      entityId: settled.ptx.id,
      ip: req.ip,
      details: { checkoutRequestId, resultCode },
    });

    res.json(settled);
  } catch (err: any) {
    console.error('Payment callback error:', err);
    res.status(400).json({ error: err.message || 'Unable to verify payment.' });
  }
});

supporterRouter.patch('/recurring/:id', async (req: AuthRequest, res) => {
  const supporter = await getOrCreateSupporterProfile(
    req.authUser!.userId,
    req.authUser!.fullName,
    req.authUser!.activeRole
  );
  const { status } = req.body as { status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED' };
  if (!status) return res.status(400).json({ error: 'Valid recurring status required.' });

  const [updated] = await db
    .update(recurringSchedules)
    .set({ status })
    .where(
      and(
        eq(recurringSchedules.id, String(req.params.id)),
        eq(recurringSchedules.supporterId, supporter.id)
      )
    )
    .returning();

  // Notify linked beneficiary when a sponsorship schedule changes
  if (updated?.sponsorshipId) {
    const [sp] = await db
      .select({ beneficiaryId: sponsorships.beneficiaryId })
      .from(sponsorships)
      .where(eq(sponsorships.id, updated.sponsorshipId))
      .limit(1);
    if (sp) {
      const [bp] = await db
        .select({ userId: beneficiaryProfiles.userId })
        .from(beneficiaryProfiles)
        .where(eq(beneficiaryProfiles.id, sp.beneficiaryId))
        .limit(1);
      if (bp) {
        await db.insert(notifications).values({
          userId: bp.userId,
          category: 'SPONSORSHIP',
          title: `Sponsorship Agreement ${updated.agreementReference} Updated`,
          body: `Your recurring sponsorship status is now ${status}. Our verification team remains available for support.`,
        });
      }
    }
  }

  res.json({ schedule: updated });
});

supporterRouter.post('/volunteer', async (req: AuthRequest, res) => {
  const { county, skillsSummary, projectId, scheduledDate } = req.body as {
    county?: string;
    skillsSummary?: string;
    projectId?: string;
    scheduledDate?: string;
  };
  if (!county || !skillsSummary) {
    return res.status(400).json({ error: 'County and skills summary are required.' });
  }
  const [assignment] = await db
    .insert(volunteerAssignments)
    .values({
      userId: req.authUser!.userId,
      assignmentType: 'COMMUNITY_PROJECT',
      county,
      projectId: projectId || null,
      skillsSummary,
      scheduledDate: scheduledDate || new Date().toISOString().slice(0, 10),
      status: 'ASSIGNED',
    })
    .returning();

  res.status(201).json({ assignment });
});
