import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  supporterProfiles,
  organisations,
  matchingEngineConfig,
  sponsorMatchingPreferences,
  sponsorshipMatchSuggestions,
  beneficiaryProfiles,
} from '../db/schema.ts';
import {
  requireAuth,
  requireRole,
  requirePrivilegedMfa,
  AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';
import {
  getOrCreateMatchingConfig,
  getOrCreateSponsorPreferences,
  normalizeWeights,
  runDynamicSponsorshipMatching,
} from '../lib/matchingEngine.ts';

export const matchingRouter = Router();
matchingRouter.use(requireAuth);

async function ensureSupporterForUser(userId: string, fullName: string, activeRole: string) {
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

// GET /api/matching/recommendations — Proactive AI-powered sponsorship matches for Supportive & Corporate portals
matchingRouter.get('/recommendations', async (req: AuthRequest, res) => {
  try {
    const supporter = await ensureSupporterForUser(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );
    const refreshAi = req.query.refreshAi !== 'false';
    const result = await runDynamicSponsorshipMatching({
      supporterId: supporter.id,
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      ip: req.ip,
      refreshAi,
    });
    res.json(result);
  } catch (err: any) {
    console.error('Matching recommendations error:', err);
    res.status(500).json({ error: err.message || 'Unable to generate sponsorship recommendations.' });
  }
});

// PUT /api/matching/preferences — Save sponsor preferences and immediately re-score matches
matchingRouter.put('/preferences', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      sponsorEntityType: z.enum(['INDIVIDUAL', 'COMPANY', 'INSTITUTION']).optional(),
      budgetMinor: z.number().int().min(10000).max(500000000),
      currency: z.string().default('KES'),
      preferredCadence: z.enum(['ONE_TIME', 'WEEKLY', 'MONTHLY', 'TERMLY', 'QUARTERLY', 'ANNUALLY']),
      interestCategories: z.array(z.string()).min(1).max(15),
      locationFocus: z.array(z.string()).min(1).max(20),
      preferredAgeGroups: z.array(z.string()).min(1).max(10),
      preferredClassifications: z.array(z.string()).min(1).max(5).optional(),
      impactGoal: z.string().min(5).max(500),
      proactiveOptIn: z.boolean().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please complete valid sponsor matching preferences.' });
    }

    const supporter = await ensureSupporterForUser(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );

    const existingPref = await getOrCreateSponsorPreferences(
      supporter.id,
      supporter.supporterType,
      Boolean(supporter.organisationId)
    );

    const d = parsed.data;
    await db
      .update(sponsorMatchingPreferences)
      .set({
        sponsorEntityType: d.sponsorEntityType || existingPref.sponsorEntityType,
        budgetMinor: d.budgetMinor,
        currency: d.currency,
        preferredCadence: d.preferredCadence,
        interestCategories: d.interestCategories,
        locationFocus: d.locationFocus,
        preferredAgeGroups: d.preferredAgeGroups,
        preferredClassifications: d.preferredClassifications || existingPref.preferredClassifications,
        impactGoal: d.impactGoal,
        proactiveOptIn: d.proactiveOptIn,
        updatedAt: new Date(),
      })
      .where(eq(sponsorMatchingPreferences.supporterId, supporter.id));

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'SPONSOR_MATCH_PREFERENCES_UPDATED',
      entityType: 'sponsor_matching_preferences',
      entityId: supporter.id,
      ip: req.ip,
      details: {
        sponsorEntityType: d.sponsorEntityType || existingPref.sponsorEntityType,
        budgetMinor: d.budgetMinor,
        interestCategories: d.interestCategories,
        locationFocus: d.locationFocus,
      },
    });

    const refreshed = await runDynamicSponsorshipMatching({
      supporterId: supporter.id,
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      ip: req.ip,
      refreshAi: true,
    });

    res.json(refreshed);
  } catch (err: any) {
    console.error('Update matching preferences error:', err);
    res.status(500).json({ error: err.message || 'Unable to save sponsor preferences.' });
  }
});

// PATCH /api/matching/suggestions/:beneficiaryId/status
matchingRouter.patch('/suggestions/:beneficiaryId/status', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      status: z.enum(['SUGGESTED', 'SAVED', 'SPONSORED', 'DISMISSED']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid suggestion status.' });

    const supporter = await ensureSupporterForUser(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );
    const beneficiaryId = String(req.params.beneficiaryId);

    const updated = await db
      .update(sponsorshipMatchSuggestions)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(sponsorshipMatchSuggestions.supporterId, supporter.id),
          eq(sponsorshipMatchSuggestions.beneficiaryId, beneficiaryId)
        )
      )
      .returning();

    res.json({ updatedCount: updated.length, status: parsed.data.status });
  } catch (err) {
    console.error('Suggestion status update error:', err);
    res.status(500).json({ error: 'Unable to update match suggestion status.' });
  }
});

// POST /api/matching/suggestions/reset-dismissed
matchingRouter.post('/suggestions/reset-dismissed', async (req: AuthRequest, res) => {
  try {
    const supporter = await ensureSupporterForUser(
      req.authUser!.userId,
      req.authUser!.fullName,
      req.authUser!.activeRole
    );
    await db
      .update(sponsorshipMatchSuggestions)
      .set({ status: 'SUGGESTED' })
      .where(
        and(
          eq(sponsorshipMatchSuggestions.supporterId, supporter.id),
          eq(sponsorshipMatchSuggestions.status, 'DISMISSED')
        )
      );

    const refreshed = await runDynamicSponsorshipMatching({
      supporterId: supporter.id,
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      ip: req.ip,
      refreshAi: true,
    });
    res.json(refreshed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to restore dismissed matches.' });
  }
});

// GET /api/matching/admin/overview — Administrator transparency & audit view
matchingRouter.get(
  '/admin/overview',
  requireRole('SUPER_ADMIN', 'FIELD_OFFICER'),
  async (_req: AuthRequest, res) => {
    try {
      const config = await getOrCreateMatchingConfig();

      const recentSuggestions = await db
        .select({
          id: sponsorshipMatchSuggestions.id,
          supporterName: supporterProfiles.displayName,
          supporterType: supporterProfiles.supporterType,
          orgName: organisations.name,
          beneficiaryAlias: beneficiaryProfiles.displayAlias,
          beneficiaryRef: beneficiaryProfiles.referenceCode,
          county: beneficiaryProfiles.county,
          compositeScore: sponsorshipMatchSuggestions.compositeScore,
          breakdownJson: sponsorshipMatchSuggestions.breakdownJson,
          beneficiarySignalsJson: sponsorshipMatchSuggestions.beneficiarySignalsJson,
          geminiRationale: sponsorshipMatchSuggestions.geminiRationale,
          recommendedApproach: sponsorshipMatchSuggestions.recommendedApproach,
          usedModel: sponsorshipMatchSuggestions.usedModel,
          status: sponsorshipMatchSuggestions.status,
          createdAt: sponsorshipMatchSuggestions.createdAt,
        })
        .from(sponsorshipMatchSuggestions)
        .innerJoin(supporterProfiles, eq(sponsorshipMatchSuggestions.supporterId, supporterProfiles.id))
        .leftJoin(organisations, eq(supporterProfiles.organisationId, organisations.id))
        .innerJoin(beneficiaryProfiles, eq(sponsorshipMatchSuggestions.beneficiaryId, beneficiaryProfiles.id))
        .orderBy(desc(sponsorshipMatchSuggestions.createdAt))
        .limit(40);

      const [{ totalSuggestions, avgScore, sponsoredCount, savedCount }] = await db
        .select({
          totalSuggestions: sql<number>`count(*)::int`,
          avgScore: sql<number>`coalesce(round(avg(${sponsorshipMatchSuggestions.compositeScore})), 0)::int`,
          sponsoredCount: sql<number>`count(*) filter (where ${sponsorshipMatchSuggestions.status} = 'SPONSORED')::int`,
          savedCount: sql<number>`count(*) filter (where ${sponsorshipMatchSuggestions.status} = 'SAVED')::int`,
        })
        .from(sponsorshipMatchSuggestions);

      res.json({
        config,
        recentSuggestions,
        stats: {
          totalSuggestions,
          avgScore,
          sponsoredCount,
          savedCount,
        },
      });
    } catch (err) {
      console.error('Admin matching overview error:', err);
      res.status(500).json({ error: 'Unable to load matching engine governance overview.' });
    }
  }
);

// PUT /api/matching/admin/config — Administrator configuration of matching algorithm weights & rules
matchingRouter.put(
  '/admin/config',
  requireRole('SUPER_ADMIN', 'FIELD_OFFICER'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        algorithmName: z.string().min(4).max(120),
        weightNeedAlignment: z.number().int().min(0).max(100),
        weightLocationFocus: z.number().int().min(0).max(100),
        weightBudgetFit: z.number().int().min(0).max(100),
        weightUrgencyImpact: z.number().int().min(0).max(100),
        weightAgeDemographics: z.number().int().min(0).max(100),
        prioritiseUnderfundedPct: z.number().int().min(10).max(100),
        minThresholdScore: z.number().int().min(0).max(90),
        enableGeminiAnalysis: z.boolean(),
        requireHumanSafeguardGate: z.boolean(),
        transparencyNotes: z.string().min(10).max(600),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid matching configuration parameters.' });
      }
      const d = parsed.data;
      const weightSum =
        d.weightNeedAlignment +
        d.weightLocationFocus +
        d.weightBudgetFit +
        d.weightUrgencyImpact +
        d.weightAgeDemographics;
      if (weightSum <= 0) {
        return res.status(400).json({ error: 'At least one matching criterion weight must be greater than 0.' });
      }

      const [updated] = await db
        .update(matchingEngineConfig)
        .set({
          algorithmName: d.algorithmName,
          weightNeedAlignment: d.weightNeedAlignment,
          weightLocationFocus: d.weightLocationFocus,
          weightBudgetFit: d.weightBudgetFit,
          weightUrgencyImpact: d.weightUrgencyImpact,
          weightAgeDemographics: d.weightAgeDemographics,
          prioritiseUnderfundedPct: d.prioritiseUnderfundedPct,
          minThresholdScore: d.minThresholdScore,
          enableGeminiAnalysis: d.enableGeminiAnalysis,
          requireHumanSafeguardGate: d.requireHumanSafeguardGate,
          transparencyNotes: d.transparencyNotes,
          updatedBy: req.authUser!.userId,
          updatedAt: new Date(),
        })
        .where(eq(matchingEngineConfig.configKey, 'DEFAULT'))
        .returning();

      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'MATCHING_ALGORITHM_CONFIG_UPDATED',
        entityType: 'matching_engine_config',
        entityId: updated.id,
        ip: req.ip,
        details: {
          normalizedWeights: normalizeWeights(updated),
          enableGeminiAnalysis: updated.enableGeminiAnalysis,
          minThresholdScore: updated.minThresholdScore,
        },
      });

      res.json({
        config: {
          ...updated,
          normalizedWeights: normalizeWeights(updated),
        },
      });
    } catch (err) {
      console.error('Update matching config error:', err);
      res.status(500).json({ error: 'Unable to update matching engine configuration.' });
    }
  }
);
