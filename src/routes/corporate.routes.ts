import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  organisations,
  supporterProfiles,
  humanitarianFunds,
  communityProjects,
  donations,
  paymentTransactions,
  sponsorships,
  beneficiaryProfiles,
  users,
} from '../db/schema.ts';
import { requireAuth, AuthRequest, writeAuditLog } from '../middleware/auth.ts';

export const corporateRouter = Router();
corporateRouter.use(requireAuth);

corporateRouter.get('/overview', async (req: AuthRequest, res) => {
  try {
    const [supporter] = await db
      .select()
      .from(supporterProfiles)
      .where(eq(supporterProfiles.userId, req.authUser!.userId))
      .limit(1);

    let organisation = null;
    let orgMembers: Array<{ id: string; fullName: string; email: string; supporterType: string }> = [];
    let orgFunds: Array<typeof humanitarianFunds.$inferSelect> = [];

    if (supporter?.organisationId) {
      const [org] = await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, supporter.organisationId))
        .limit(1);
      organisation = org || null;

      if (organisation) {
        const memberRows = await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            supporterType: supporterProfiles.supporterType,
          })
          .from(supporterProfiles)
          .innerJoin(users, eq(supporterProfiles.userId, users.id))
          .where(eq(supporterProfiles.organisationId, organisation.id));
        orgMembers = memberRows;

        orgFunds = await db
          .select()
          .from(humanitarianFunds)
          .where(eq(humanitarianFunds.organisationId, organisation.id))
          .orderBy(desc(humanitarianFunds.createdAt));
      }
    }

    const allSupporterIds = supporter ? [supporter.id] : [];
    const orgDonations =
      allSupporterIds.length > 0
        ? await db
            .select({
              id: donations.id,
              pathway: donations.pathway,
              amountMinor: donations.amountMinor,
              currency: donations.currency,
              isPledge: donations.isPledge,
              status: donations.status,
              confirmedAt: donations.confirmedAt,
              createdAt: donations.createdAt,
              mpesaReceipt: paymentTransactions.mpesaReceiptNumber,
              provider: paymentTransactions.provider,
            })
            .from(donations)
            .leftJoin(paymentTransactions, eq(paymentTransactions.donationId, donations.id))
            .where(inArray(donations.supporterId, allSupporterIds))
            .orderBy(desc(donations.createdAt))
        : [];

    const orgSponsorships =
      allSupporterIds.length > 0
        ? await db
            .select({
              id: sponsorships.id,
              beneficiaryId: sponsorships.beneficiaryId,
              beneficiaryAlias: beneficiaryProfiles.displayAlias,
              beneficiaryRef: beneficiaryProfiles.referenceCode,
              county: beneficiaryProfiles.county,
              monthlyAmountMinor: sponsorships.monthlyAmountMinor,
              currency: sponsorships.currency,
              status: sponsorships.status,
            })
            .from(sponsorships)
            .innerJoin(beneficiaryProfiles, eq(sponsorships.beneficiaryId, beneficiaryProfiles.id))
            .where(inArray(sponsorships.supporterId, allSupporterIds))
        : [];

    const campaigns = await db.select().from(communityProjects);
    const centralFunds = await db.select().from(humanitarianFunds);

    res.json({
      supporter: supporter || null,
      organisation,
      orgMembers,
      orgFunds,
      centralFunds,
      campaigns,
      donations: orgDonations,
      sponsorships: orgSponsorships,
    });
  } catch (err) {
    console.error('Corporate overview error:', err);
    res.status(500).json({ error: 'Unable to load corporate & well wisher overview.' });
  }
});

corporateRouter.post('/organisation/register', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(160),
      orgType: z.enum(['CORPORATE', 'CHARITY', 'HUMANITARIAN_NGO', 'FOUNDATION', 'RELIGIOUS_COMMUNITY', 'PHILANTHROPIST']),
      registrationNumber: z.string().max(80).optional(),
      countryCode: z.string().length(2).default('KE'),
      county: z.string().min(2).max(80).default('Nairobi'),
      contactEmail: z.string().email(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid organisation details required.' });

    const [org] = await db
      .insert(organisations)
      .values({
        name: parsed.data.name,
        orgType: parsed.data.orgType,
        registrationNumber: parsed.data.registrationNumber || null,
        countryCode: parsed.data.countryCode,
        county: parsed.data.county,
        contactEmail: parsed.data.contactEmail,
        verificationStatus: 'PENDING',
      })
      .returning();

    const [supporter] = await db
      .select()
      .from(supporterProfiles)
      .where(eq(supporterProfiles.userId, req.authUser!.userId))
      .limit(1);

    if (supporter) {
      await db
        .update(supporterProfiles)
        .set({ organisationId: org.id, supporterType: 'WELL_WISHER', displayName: org.name })
        .where(eq(supporterProfiles.id, supporter.id));
    } else {
      await db.insert(supporterProfiles).values({
        userId: req.authUser!.userId,
        organisationId: org.id,
        supporterType: 'WELL_WISHER',
        displayName: org.name,
        preferredCurrency: 'KES',
      });
    }

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'ORGANISATION_REGISTERED',
      entityType: 'organisations',
      entityId: org.id,
      ip: req.ip,
      details: { orgType: org.orgType },
    });

    res.status(201).json({ organisation: org });
  } catch (err) {
    console.error('Org registration error:', err);
    res.status(500).json({ error: 'Unable to register organisation.' });
  }
});

corporateRouter.post('/csr-program', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(4).max(160),
      fundType: z.enum(['CSR_POOL', 'EDUCATION', 'CENTRAL_RELIEF', 'EMPOWERMENT', 'MEDICAL']),
      description: z.string().min(10).max(800),
      currency: z.string().default('KES'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid CSR fund programme required.' });

    const [supporter] = await db
      .select()
      .from(supporterProfiles)
      .where(eq(supporterProfiles.userId, req.authUser!.userId))
      .limit(1);

    const code = `CSR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [fund] = await db
      .insert(humanitarianFunds)
      .values({
        code,
        name: parsed.data.name,
        fundType: parsed.data.fundType,
        organisationId: supporter?.organisationId || null,
        currency: parsed.data.currency,
        description: parsed.data.description,
      })
      .returning();

    res.status(201).json({ fund });
  } catch (err) {
    console.error('CSR fund error:', err);
    res.status(500).json({ error: 'Unable to create CSR programme.' });
  }
});

corporateRouter.post('/bulk-sponsor', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      beneficiaryIds: z.array(z.string().uuid()).min(1).max(20),
      monthlyAmountPerBeneficiaryMinor: z.number().int().positive(),
      currency: z.string().default('KES'),
      mode: z.enum(['PLEDGE_ONLY', 'MPESA_STK']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Select 1–20 verified beneficiaries and valid amount.' });

    const [supporter] = await db
      .select()
      .from(supporterProfiles)
      .where(eq(supporterProfiles.userId, req.authUser!.userId))
      .limit(1);
    if (!supporter) return res.status(400).json({ error: 'Supporter profile required.' });

    const created = await db.transaction(async (tx) => {
      const results = [];
      for (const bId of parsed.data.beneficiaryIds) {
        const [sp] = await tx
          .insert(sponsorships)
          .values({
            supporterId: supporter.id,
            beneficiaryId: bId,
            monthlyAmountMinor: parsed.data.monthlyAmountPerBeneficiaryMinor,
            currency: parsed.data.currency,
            status: 'PENDING_FIRST_PAYMENT',
          })
          .returning();

        const [don] = await tx
          .insert(donations)
          .values({
            supporterId: supporter.id,
            pathway: 'DIRECT_SPONSORSHIP',
            beneficiaryId: bId,
            isPledge: parsed.data.mode === 'PLEDGE_ONLY',
            sponsorshipCoverage: 'FULL',
            amountMinor: parsed.data.monthlyAmountPerBeneficiaryMinor,
            currency: parsed.data.currency,
            status: parsed.data.mode === 'PLEDGE_ONLY' ? 'PLEDGED' : 'PAYMENT_PENDING',
          })
          .returning();

        if (parsed.data.mode === 'MPESA_STK') {
          await tx.insert(paymentTransactions).values({
            donationId: don.id,
            provider: 'MPESA_DARAJA',
            idempotencyKey: `hc-bulk-${crypto.randomUUID()}`,
            checkoutRequestId: `ws_CO_${crypto.randomBytes(8).toString('hex')}`,
            amountMinor: parsed.data.monthlyAmountPerBeneficiaryMinor,
            currency: parsed.data.currency,
            verificationStatus: 'CALLBACK_PENDING',
          });
        }
        results.push({ sponsorship: sp, donation: don });
      }
      return results;
    });

    res.status(201).json({ count: created.length, records: created });
  } catch (err) {
    console.error('Bulk sponsor error:', err);
    res.status(500).json({ error: 'Unable to initiate multi-beneficiary sponsorship.' });
  }
});
