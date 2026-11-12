import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  beneficiaryProfiles,
  beneficiaryStories,
  communityProjects,
  humanitarianFunds,
  needRequests,
  needsCategories,
  paymentTransactions,
  priorityAssessments,
} from '../db/schema.ts';

export const publicRouter = Router();

publicRouter.get('/overview', async (_req, res) => {
  try {
    const funds = await db
      .select()
      .from(humanitarianFunds)
      .where(eq(humanitarianFunds.isActive, true));

    const projects = await db.select().from(communityProjects);
    const categories = await db.select().from(needsCategories);

    const [{ verifiedCount }] = await db
      .select({ verifiedCount: sql<number>`count(*)::int` })
      .from(beneficiaryProfiles)
      .where(
        and(
          eq(beneficiaryProfiles.verificationStatus, 'VERIFIED'),
          eq(beneficiaryProfiles.safeguardingCleared, true),
          eq(beneficiaryProfiles.publicListingApproved, true)
        )
      );

    const [{ settledTotalMinor }] = await db
      .select({
        settledTotalMinor: sql<number>`coalesce(sum(${paymentTransactions.amountMinor}), 0)::int`,
      })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.verificationStatus, 'VERIFIED'));

    res.json({
      stats: {
        verifiedHouseholds: verifiedCount,
        activeCentralFunds: funds.length,
        activeCommunityProjects: projects.length,
        verifiedSettledKesMinor: settledTotalMinor,
        needsCategoriesCount: categories.length,
      },
      funds,
      projects,
      categories,
    });
  } catch (err) {
    console.error('Public overview error:', err);
    res.status(500).json({ error: 'Unable to load public overview.' });
  }
});

// Consent-gated, safeguarding-cleared, verified-only public beneficiary projection
// Strictly strips phone numbers, exact residential locations, and minor PII
publicRouter.get('/beneficiaries', async (req, res) => {
  try {
    const {
      category,
      needCategory,
      county,
      priority,
      verificationLevel,
      recurring,
      search,
    } = req.query as Record<string, string | undefined>;

    const rows = await db
      .select({
        id: beneficiaryProfiles.id,
        referenceCode: beneficiaryProfiles.referenceCode,
        classification: beneficiaryProfiles.classification,
        displayAlias: beneficiaryProfiles.displayAlias,
        countryCode: beneficiaryProfiles.countryCode,
        county: beneficiaryProfiles.county,
        isMinorCase: beneficiaryProfiles.isMinorCase,
        guardianOrgName: beneficiaryProfiles.guardianOrgName,
        vulnerabilitySummary: beneficiaryProfiles.vulnerabilitySummary,
        verificationLevel: beneficiaryProfiles.verificationLevel,
        verificationStatus: beneficiaryProfiles.verificationStatus,
        monthlyNeedTargetMinor: beneficiaryProfiles.monthlyNeedTargetMinor,
        currency: beneficiaryProfiles.currency,
        storyTitle: beneficiaryStories.title,
        storySummary: beneficiaryStories.summary,
        coverImagePath: beneficiaryStories.coverImagePath,
      })
      .from(beneficiaryProfiles)
      .leftJoin(
        beneficiaryStories,
        and(
          eq(beneficiaryStories.beneficiaryId, beneficiaryProfiles.id),
          eq(beneficiaryStories.isPublished, true),
          eq(beneficiaryStories.consentVerified, true)
        )
      )
      .where(
        and(
          eq(beneficiaryProfiles.verificationStatus, 'VERIFIED'),
          eq(beneficiaryProfiles.safeguardingCleared, true),
          eq(beneficiaryProfiles.publicListingApproved, true)
        )
      );

    const needs = await db
      .select({
        id: needRequests.id,
        referenceCode: needRequests.referenceCode,
        beneficiaryId: needRequests.beneficiaryId,
        categoryId: needRequests.categoryId,
        categoryCode: needsCategories.code,
        categoryName: needsCategories.name,
        title: needRequests.title,
        description: needRequests.description,
        targetAmountMinor: needRequests.targetAmountMinor,
        approvedAmountMinor: needRequests.approvedAmountMinor,
        fulfilledAmountMinor: needRequests.fulfilledAmountMinor,
        currency: needRequests.currency,
        deadlineAt: needRequests.deadlineAt,
        isRecurring: needRequests.isRecurring,
        frequency: needRequests.frequency,
        durationMonths: needRequests.durationMonths,
        priorityTier: needRequests.priorityTier,
        verificationStatus: needRequests.verificationStatus,
        status: needRequests.status,
        compositePriority: priorityAssessments.compositePriority,
      })
      .from(needRequests)
      .innerJoin(needsCategories, eq(needRequests.categoryId, needsCategories.id))
      .leftJoin(priorityAssessments, eq(priorityAssessments.needRequestId, needRequests.id))
      .where(eq(needRequests.verificationStatus, 'HUMAN_APPROVED'))
      .orderBy(desc(priorityAssessments.compositePriority));

    const enriched = rows
      .map((bp) => {
        const bpNeeds = needs.filter((n) => n.beneficiaryId === bp.id);
        return {
          ...bp,
          needs: bpNeeds,
        };
      })
      .filter((bp) => {
        if (category && category !== 'ALL' && bp.classification !== category) return false;
        if (county && county !== 'ALL' && bp.county.toLowerCase() !== county.toLowerCase()) return false;
        if (verificationLevel && verificationLevel !== 'ALL' && bp.verificationLevel !== verificationLevel) {
          return false;
        }
        if (needCategory && needCategory !== 'ALL') {
          if (!bp.needs.some((n) => n.categoryCode === needCategory)) return false;
        }
        if (priority && priority !== 'ALL') {
          if (!bp.needs.some((n) => n.priorityTier === priority)) return false;
        }
        if (recurring === 'RECURRING' && !bp.needs.some((n) => n.isRecurring)) return false;
        if (recurring === 'ONE_TIME' && !bp.needs.some((n) => !n.isRecurring)) return false;
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          const matchText = [
            bp.displayAlias,
            bp.referenceCode,
            bp.county,
            bp.vulnerabilitySummary,
            bp.storyTitle || '',
            ...bp.needs.map((n) => `${n.title} ${n.categoryName}`),
          ]
            .join(' ')
            .toLowerCase();
          if (!matchText.includes(q)) return false;
        }
        return true;
      });

    res.json({ beneficiaries: enriched });
  } catch (err) {
    console.error('Public beneficiaries error:', err);
    res.status(500).json({ error: 'Unable to fetch verified beneficiary listings.' });
  }
});

publicRouter.get('/docs', (_req, res) => {
  res.json({
    service: 'Humanity Connect API',
    version: '1.0.0',
    regionLaunch: 'KE (East Africa)',
    securityPrinciples: [
      'Bearer session or Firebase ID token authentication',
      'Configurable RBAC with multi-role switching',
      'Mandatory MFA step-up for Super Admin & Field Officer privileged routes',
      'Strict separation between Pledges and Server-Verified Payment Transactions',
      'Zero public exposure of unverified, non-consented, or minor PII records',
    ],
    endpoints: [
      { method: 'POST', path: '/api/auth/register', auth: 'Public', summary: 'Role-gated registration (never self-grants Super Admin)' },
      { method: 'POST', path: '/api/auth/login', auth: 'Public', summary: 'Password login with attempt lockout & device session creation' },
      { method: 'POST', path: '/api/auth/mfa/verify', auth: 'Bearer', summary: 'TOTP MFA verification for privileged sessions' },
      { method: 'POST', path: '/api/auth/provision-super-admin', auth: 'Provisioning Secret', summary: 'One-time secure server-side Super Admin provisioning' },
      { method: 'GET', path: '/api/public/beneficiaries', auth: 'Public', summary: 'Verified, safeguarding-cleared, consent-approved beneficiary & need catalog' },
      { method: 'GET', path: '/api/beneficiary/portal', auth: 'Beneficiary Role', summary: 'Load own 17-screen beneficiary workspace data' },
      { method: 'POST', path: '/api/beneficiary/needs', auth: 'Beneficiary Role', summary: 'Create new need request with unique reference' },
      { method: 'POST', path: '/api/supporter/checkout', auth: 'Supporter / Well Wisher', summary: 'Create Pledge or Payment Intent (M-Pesa STK / Card / Bank)' },
      { method: 'POST', path: '/api/supporter/mpesa/verify-callback', auth: 'Server / Webhook', summary: 'Atomic transactional payment settlement & receipt generation' },
      { method: 'POST', path: '/api/admin/verification/:caseId/action', auth: 'Officer / Admin + MFA', summary: 'V0–V4 verification decision, field visit, appeal, or suspension' },
      { method: 'POST', path: '/api/admin/needs/:needId/assess', auth: 'Officer / Admin + MFA', summary: '100-point assessment & mandatory human final approval' },
      { method: 'POST', path: '/api/ai/assist', auth: 'Authenticated', summary: 'Server-side Gemini translation, intake refinement & advisory triage' },
    ],
  });
});
