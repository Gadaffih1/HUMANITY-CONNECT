import { ThinkingLevel, Type } from '@google/genai';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  matchingEngineConfig,
  sponsorMatchingPreferences,
  sponsorshipMatchSuggestions,
  supporterProfiles,
  organisations,
  beneficiaryProfiles,
  beneficiaryStories,
  needRequests,
  needsCategories,
  priorityAssessments,
  householdMembers,
  sponsorships,
} from '../db/schema.ts';
import { getAiClient } from './gemini.ts';
import { writeAuditLog } from '../middleware/auth.ts';

export interface NormalizedWeights {
  need: number;
  location: number;
  budget: number;
  urgency: number;
  age: number;
}

export function normalizeWeights(cfg: {
  weightNeedAlignment: number;
  weightLocationFocus: number;
  weightBudgetFit: number;
  weightUrgencyImpact: number;
  weightAgeDemographics: number;
}): NormalizedWeights {
  const raw = {
    need: Math.max(0, cfg.weightNeedAlignment),
    location: Math.max(0, cfg.weightLocationFocus),
    budget: Math.max(0, cfg.weightBudgetFit),
    urgency: Math.max(0, cfg.weightUrgencyImpact),
    age: Math.max(0, cfg.weightAgeDemographics),
  };
  const total = raw.need + raw.location + raw.budget + raw.urgency + raw.age || 100;
  const need = Math.round((raw.need / total) * 100);
  const location = Math.round((raw.location / total) * 100);
  const budget = Math.round((raw.budget / total) * 100);
  const urgency = Math.round((raw.urgency / total) * 100);
  const age = Math.max(0, 100 - (need + location + budget + urgency));
  return { need, location, budget, urgency, age };
}

export async function getOrCreateMatchingConfig() {
  const [existing] = await db
    .select()
    .from(matchingEngineConfig)
    .where(eq(matchingEngineConfig.configKey, 'DEFAULT'))
    .limit(1);

  if (existing) {
    return {
      ...existing,
      normalizedWeights: normalizeWeights(existing),
    };
  }

  const [created] = await db
    .insert(matchingEngineConfig)
    .values({ configKey: 'DEFAULT' })
    .onConflictDoNothing({ target: matchingEngineConfig.configKey })
    .returning();

  const row =
    created ||
    (
      await db
        .select()
        .from(matchingEngineConfig)
        .where(eq(matchingEngineConfig.configKey, 'DEFAULT'))
        .limit(1)
    )[0];

  return {
    ...row,
    normalizedWeights: normalizeWeights(row),
  };
}

export async function getOrCreateSponsorPreferences(supporterId: string, supporterType: string, hasOrg: boolean) {
  const [existing] = await db
    .select()
    .from(sponsorMatchingPreferences)
    .where(eq(sponsorMatchingPreferences.supporterId, supporterId))
    .limit(1);
  if (existing) return existing;

  const entityType =
    supporterType === 'CORPORATE' || hasOrg
      ? 'COMPANY'
      : supporterType === 'WELL_WISHER'
        ? 'INSTITUTION'
        : 'INDIVIDUAL';

  const defaultBudgetMinor = entityType === 'INDIVIDUAL' ? 600000 : 2500000;

  const [created] = await db
    .insert(sponsorMatchingPreferences)
    .values({
      supporterId,
      sponsorEntityType: entityType,
      budgetMinor: defaultBudgetMinor,
      currency: 'KES',
      preferredCadence: 'MONTHLY',
      interestCategories: ['EDUCATION', 'FOOD', 'MEDICAL', 'BUSINESS_EMPOWERMENT', 'SHELTER'],
      locationFocus: ['ALL'],
      preferredAgeGroups: ['ALL'],
      preferredClassifications: ['ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY'],
      impactGoal:
        entityType === 'INDIVIDUAL'
          ? 'Support verified vulnerable Kenyan households with urgent education, food, and livelihood stability.'
          : 'Maximise measurable institutional & CSR impact across underfunded verified households.',
      proactiveOptIn: true,
    })
    .returning();
  return created;
}

const PRIORITY_FACTOR: Record<string, number> = {
  P1_CRITICAL: 1.0,
  P2_URGENT: 0.88,
  P3_HIGH: 0.74,
  P4_MODERATE: 0.56,
  P5_DEVELOPMENTAL: 0.42,
};

export interface EvaluatedMatchItem {
  suggestionId?: string;
  beneficiaryId: string;
  referenceCode: string;
  displayAlias: string;
  county: string;
  classification: string;
  ageGroup: string;
  isMinorCase: boolean;
  specificChallenges: string[];
  storyTitle: string | null;
  storySummary: string | null;
  coverImagePath: string | null;
  primaryNeed: {
    id: string;
    referenceCode: string;
    title: string;
    categoryCode: string;
    categoryName: string;
    priorityTier: string;
    targetAmountMinor: number;
    fulfilledAmountMinor: number;
    remainingGapMinor: number;
    currency: string;
    isRecurring: boolean;
    frequency: string;
  } | null;
  allNeedCategories: string[];
  compositeScore: number;
  breakdown: {
    needScore: number;
    locationScore: number;
    budgetScore: number;
    urgencyScore: number;
    ageScore: number;
    geminiDelta: number;
    weights: NormalizedWeights;
    factorNotes: string[];
  };
  geminiRationale: string;
  geminiImpactProjection: string;
  recommendedApproach: string;
  usedModel: string;
  status: string;
}

export async function runDynamicSponsorshipMatching(params: {
  supporterId: string;
  actorUserId: string;
  actorRole: string;
  ip?: string;
  refreshAi?: boolean;
}): Promise<{
  config: Awaited<ReturnType<typeof getOrCreateMatchingConfig>>;
  preferences: typeof sponsorMatchingPreferences.$inferSelect;
  matches: EvaluatedMatchItem[];
  aiUsed: boolean;
  aiStatusNote: string;
}> {
  const config = await getOrCreateMatchingConfig();

  const [supporter] = await db
    .select()
    .from(supporterProfiles)
    .where(eq(supporterProfiles.id, params.supporterId))
    .limit(1);

  if (!supporter) {
    throw new Error('Supporter profile not found.');
  }

  let orgDetails: typeof organisations.$inferSelect | null = null;
  if (supporter.organisationId) {
    const [org] = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, supporter.organisationId))
      .limit(1);
    orgDetails = org || null;
  }

  const preferences = await getOrCreateSponsorPreferences(
    supporter.id,
    supporter.supporterType,
    Boolean(orgDetails)
  );

  // Strict safeguarding gate: only verified, safeguarding-cleared, consent-approved profiles
  const whereClause = config.requireHumanSafeguardGate
    ? and(
        eq(beneficiaryProfiles.verificationStatus, 'VERIFIED'),
        eq(beneficiaryProfiles.safeguardingCleared, true),
        eq(beneficiaryProfiles.publicListingApproved, true)
      )
    : eq(beneficiaryProfiles.publicListingApproved, true);

  const candidates = await db
    .select({
      id: beneficiaryProfiles.id,
      referenceCode: beneficiaryProfiles.referenceCode,
      classification: beneficiaryProfiles.classification,
      displayAlias: beneficiaryProfiles.displayAlias,
      county: beneficiaryProfiles.county,
      isMinorCase: beneficiaryProfiles.isMinorCase,
      vulnerabilitySummary: beneficiaryProfiles.vulnerabilitySummary,
      monthlyNeedTargetMinor: beneficiaryProfiles.monthlyNeedTargetMinor,
      currency: beneficiaryProfiles.currency,
      ageGroup: beneficiaryProfiles.ageGroup,
      specificChallenges: beneficiaryProfiles.specificChallenges,
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
    .where(whereClause);

  if (candidates.length === 0) {
    return {
      config,
      preferences,
      matches: [],
      aiUsed: false,
      aiStatusNote: 'No verified, safeguarding-cleared beneficiary profiles currently open for matching.',
    };
  }

  const candidateIds = candidates.map((c) => c.id);

  const [approvedNeeds, hhMembers, existingActiveSponsorships, existingSuggestions] = await Promise.all([
    db
      .select({
        id: needRequests.id,
        referenceCode: needRequests.referenceCode,
        beneficiaryId: needRequests.beneficiaryId,
        categoryCode: needsCategories.code,
        categoryName: needsCategories.name,
        title: needRequests.title,
        description: needRequests.description,
        targetAmountMinor: needRequests.targetAmountMinor,
        fulfilledAmountMinor: needRequests.fulfilledAmountMinor,
        currency: needRequests.currency,
        priorityTier: needRequests.priorityTier,
        isRecurring: needRequests.isRecurring,
        frequency: needRequests.frequency,
        compositePriority: priorityAssessments.compositePriority,
      })
      .from(needRequests)
      .innerJoin(needsCategories, eq(needRequests.categoryId, needsCategories.id))
      .leftJoin(priorityAssessments, eq(priorityAssessments.needRequestId, needRequests.id))
      .where(
        and(
          inArray(needRequests.beneficiaryId, candidateIds),
          eq(needRequests.verificationStatus, 'HUMAN_APPROVED')
        )
      )
      .orderBy(desc(priorityAssessments.compositePriority)),
    db
      .select({
        beneficiaryId: householdMembers.beneficiaryId,
        ageYears: householdMembers.ageYears,
        isMinor: householdMembers.isMinor,
      })
      .from(householdMembers)
      .where(inArray(householdMembers.beneficiaryId, candidateIds)),
    db
      .select({ beneficiaryId: sponsorships.beneficiaryId, status: sponsorships.status })
      .from(sponsorships)
      .where(eq(sponsorships.supporterId, supporter.id)),
    db
      .select()
      .from(sponsorshipMatchSuggestions)
      .where(eq(sponsorshipMatchSuggestions.supporterId, supporter.id)),
  ]);

  const dismissedSet = new Set(
    existingSuggestions.filter((s) => s.status === 'DISMISSED').map((s) => s.beneficiaryId)
  );
  const savedSet = new Set(
    existingSuggestions.filter((s) => s.status === 'SAVED').map((s) => s.beneficiaryId)
  );
  const alreadySponsoredSet = new Set(
    existingActiveSponsorships
      .filter((s) => s.status === 'ACTIVE' || s.status === 'PENDING_FIRST_PAYMENT')
      .map((s) => s.beneficiaryId)
  );

  const weights = config.normalizedWeights;
  const interests = new Set((preferences.interestCategories || []).map((c) => c.toUpperCase()));
  const locFocus = (preferences.locationFocus || ['ALL']).map((l) => l.toLowerCase());
  const ageFocus = preferences.preferredAgeGroups || ['ALL'];
  const classFocus = new Set(preferences.preferredClassifications || []);

  const evaluated: EvaluatedMatchItem[] = [];

  for (const bp of candidates) {
    if (dismissedSet.has(bp.id)) continue;

    const bpNeeds = approvedNeeds.filter((n) => n.beneficiaryId === bp.id);
    const primaryNeed = bpNeeds[0] || null;
    const needCats = Array.from(new Set(bpNeeds.map((n) => n.categoryCode)));
    const factorNotes: string[] = [];

    // 1. Need & Challenge Alignment
    let needRatio = 0.25;
    if (interests.size === 0 || interests.has('ALL')) {
      needRatio = 0.85;
      factorNotes.push('Broad multi-category interest focus matches verified need.');
    } else if (needCats.some((c) => interests.has(c.toUpperCase()))) {
      needRatio = 1.0;
      const matched = needCats.filter((c) => interests.has(c.toUpperCase())).join(', ');
      factorNotes.push(`Direct need category alignment (${matched}).`);
    } else {
      const challengeBlob = `${bp.specificChallenges.join(' ')} ${bp.vulnerabilitySummary}`.toLowerCase();
      const partialHit = Array.from(interests).some((i) =>
        challengeBlob.includes(i.toLowerCase().replace(/_/g, ' '))
      );
      if (partialHit) {
        needRatio = 0.65;
        factorNotes.push('Secondary challenge alignment with sponsor interest areas.');
      } else {
        factorNotes.push('Verified household need outside primary category filter.');
      }
    }
    const needScore = Math.round(weights.need * needRatio);

    // 2. Location Focus
    let locationRatio = 0.25;
    if (locFocus.includes('all')) {
      locationRatio = 0.85;
      factorNotes.push(`Nationwide Kenyan focus covers ${bp.county} County.`);
    } else if (locFocus.includes(bp.county.toLowerCase())) {
      locationRatio = 1.0;
      factorNotes.push(`Exact county focus match (${bp.county} County).`);
    } else {
      factorNotes.push(`${bp.county} County outside preferred county list.`);
    }
    const locationScore = Math.round(weights.location * locationRatio);

    // 3. Budget Fit
    const remainingGapMinor = primaryNeed
      ? Math.max(0, primaryNeed.targetAmountMinor - primaryNeed.fulfilledAmountMinor)
      : bp.monthlyNeedTargetMinor;
    const budget = Math.max(10000, preferences.budgetMinor);
    let budgetRatio = 0.35;
    if (remainingGapMinor > 0 && budget >= remainingGapMinor) {
      budgetRatio = 1.0;
      factorNotes.push('Sponsor budget can fully cover remaining verified need gap.');
    } else if (budget >= bp.monthlyNeedTargetMinor * 0.75 || (remainingGapMinor > 0 && budget / remainingGapMinor >= 0.25)) {
      budgetRatio = 0.88;
      factorNotes.push('Budget provides high-impact monthly or milestone coverage (>=25% of need).');
    } else if (remainingGapMinor > 0 && budget / remainingGapMinor >= 0.1) {
      budgetRatio = 0.62;
      factorNotes.push('Budget supports meaningful co-sponsorship contribution.');
    } else {
      factorNotes.push('Budget suitable for partial co-funding alongside pool supporters.');
    }
    const budgetScore = Math.round(weights.budget * budgetRatio);

    // 4. Urgency & Underfunded Impact
    const tier = primaryNeed?.priorityTier || 'P3_HIGH';
    const baseUrgency = PRIORITY_FACTOR[tier] ?? 0.65;
    const fundedPct =
      primaryNeed && primaryNeed.targetAmountMinor > 0
        ? (primaryNeed.fulfilledAmountMinor / primaryNeed.targetAmountMinor) * 100
        : 0;
    const underfundedBonus = fundedPct <= config.prioritiseUnderfundedPct ? 0.15 : 0;
    const urgencyRatio = Math.min(1.0, baseUrgency * 0.88 + underfundedBonus);
    const urgencyScore = Math.round(weights.urgency * urgencyRatio);
    factorNotes.push(
      `${tier.replace('_', ' ')} urgency with ${Math.round(fundedPct)}% currently funded.`
    );

    // 5. Age Group & Household Demographics
    const bpMembers = hhMembers.filter((m) => m.beneficiaryId === bp.id);
    const derivedAgeGroup =
      bp.ageGroup ||
      (bp.isMinorCase || bpMembers.some((m) => m.isMinor)
        ? 'CHILDREN_5_17'
        : 'MULTI_GENERATIONAL');

    let ageRatio = 0.35;
    const ageMatched = ageFocus.includes('ALL') || ageFocus.includes(derivedAgeGroup);
    const classMatched = classFocus.size === 0 || classFocus.has(bp.classification);
    if (ageMatched && classMatched) {
      ageRatio = 1.0;
      factorNotes.push(`Matches target age group (${derivedAgeGroup.replace(/_/g, ' ')}) & vulnerability profile.`);
    } else if (ageMatched || classMatched) {
      ageRatio = 0.7;
    }
    const ageScore = Math.round(weights.age * ageRatio);

    const deterministicScore = Math.min(
      100,
      needScore + locationScore + budgetScore + urgencyScore + ageScore
    );

    if (deterministicScore < config.minThresholdScore) continue;

    const defaultStatus = alreadySponsoredSet.has(bp.id)
      ? 'SPONSORED'
      : savedSet.has(bp.id)
        ? 'SAVED'
        : 'SUGGESTED';

    evaluated.push({
      beneficiaryId: bp.id,
      referenceCode: bp.referenceCode,
      displayAlias: bp.displayAlias,
      county: bp.county,
      classification: bp.classification,
      ageGroup: derivedAgeGroup,
      isMinorCase: bp.isMinorCase,
      specificChallenges: bp.specificChallenges || [],
      storyTitle: bp.storyTitle,
      storySummary: bp.storySummary,
      coverImagePath: bp.coverImagePath,
      primaryNeed: primaryNeed
        ? {
            id: primaryNeed.id,
            referenceCode: primaryNeed.referenceCode,
            title: primaryNeed.title,
            categoryCode: primaryNeed.categoryCode,
            categoryName: primaryNeed.categoryName,
            priorityTier: primaryNeed.priorityTier,
            targetAmountMinor: primaryNeed.targetAmountMinor,
            fulfilledAmountMinor: primaryNeed.fulfilledAmountMinor,
            remainingGapMinor,
            currency: primaryNeed.currency,
            isRecurring: primaryNeed.isRecurring,
            frequency: primaryNeed.frequency,
          }
        : null,
      allNeedCategories: needCats,
      compositeScore: deterministicScore,
      breakdown: {
        needScore,
        locationScore,
        budgetScore,
        urgencyScore,
        ageScore,
        geminiDelta: 0,
        weights,
        factorNotes,
      },
      geminiRationale: `${bp.displayAlias} in ${bp.county} County aligns with your ${Array.from(interests).slice(0, 2).join(' & ') || 'humanitarian'} priorities (${tier.replace('_', ' ')}) with a remaining verified need of KES ${(remainingGapMinor / 100).toLocaleString()}.`,
      geminiImpactProjection: `Supports ${bp.specificChallenges[0] || 'immediate household stability'} under V4-verified governance.`,
      recommendedApproach:
        preferences.sponsorEntityType === 'INDIVIDUAL'
          ? primaryNeed?.isRecurring
            ? 'Termly / Monthly Direct Sponsorship'
            : 'Targeted Direct Need Contribution'
          : 'Institutional CSR Co-Sponsorship / Multi-Household Cohort',
      usedModel: 'deterministic-weighted-v1',
      status: defaultStatus,
    });
  }

  evaluated.sort((a, b) => b.compositeScore - a.compositeScore);
  const topCandidates = evaluated.slice(0, 6);

  // 6. Gemini AI Contextual Profile & Preference Analysis
  let aiUsed = false;
  let aiStatusNote = 'Deterministic weighted scoring active.';

  if (config.enableGeminiAnalysis && topCandidates.length > 0 && params.refreshAi !== false) {
    const ai = getAiClient();
    if (!ai) {
      aiStatusNote = 'Gemini AI key not configured — transparent deterministic scoring applied.';
    } else {
      try {
        const promptPayload = {
          sponsor: {
            entityType: preferences.sponsorEntityType,
            organisationType: orgDetails?.orgType || null,
            budgetKes: Math.round(preferences.budgetMinor / 100),
            cadence: preferences.preferredCadence,
            interestCategories: preferences.interestCategories,
            locationFocus: preferences.locationFocus,
            preferredAgeGroups: preferences.preferredAgeGroups,
            impactGoal: preferences.impactGoal,
          },
          candidates: topCandidates.map((c) => ({
            beneficiaryId: c.beneficiaryId,
            referenceCode: c.referenceCode,
            displayAlias: c.displayAlias,
            county: c.county,
            classification: c.classification,
            ageGroup: c.ageGroup,
            specificChallenges: c.specificChallenges,
            primaryNeedTitle: c.primaryNeed?.title || 'Verified Household Need',
            primaryNeedCategory: c.primaryNeed?.categoryName || 'General',
            priorityTier: c.primaryNeed?.priorityTier || 'P3_HIGH',
            remainingGapKes: Math.round((c.primaryNeed?.remainingGapMinor || 0) / 100),
            deterministicScore: c.compositeScore,
          })),
        };

        const aiResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are the Humanity Connect Dynamic Sponsorship Matching Advisor.
Analyze the sponsor preferences and V4-verified, PII-minimised Kenyan beneficiary profiles below.
SAFEGUARD RULES:
- Never expose or invent personal identifiers or exact street coordinates.
- Respect minor safeguarding (guardian proxy only).
- Provide transparent, grounded reasoning linking beneficiary needs, county, age group, and specific challenges with the sponsor's donation budget, interest areas, and entity type (Individual vs Company vs Institution).
- qualitativeDelta must be an integer between -5 and 10 reflecting genuine contextual synergy beyond keyword matching.

Input JSON:
${JSON.stringify(promptPayload)}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      beneficiaryId: { type: Type.STRING },
                      qualitativeDelta: { type: Type.INTEGER },
                      rationale: { type: Type.STRING },
                      impactProjection: { type: Type.STRING },
                      recommendedApproach: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = JSON.parse((aiResp.text ?? '{}').trim()) as {
          recommendations?: Array<{
            beneficiaryId?: string;
            qualitativeDelta?: number;
            rationale?: string;
            impactProjection?: string;
            recommendedApproach?: string;
          }>;
        };

        const recMap = new Map(
          (parsed.recommendations || []).map((r) => [r.beneficiaryId, r])
        );

        for (const item of topCandidates) {
          const rec = recMap.get(item.beneficiaryId);
          if (rec) {
            const delta = Math.max(-5, Math.min(10, Math.round(Number(rec.qualitativeDelta || 0))));
            item.breakdown.geminiDelta = delta;
            item.compositeScore = Math.max(0, Math.min(100, item.compositeScore + delta));
            if (rec.rationale) item.geminiRationale = rec.rationale;
            if (rec.impactProjection) item.geminiImpactProjection = rec.impactProjection;
            if (rec.recommendedApproach) item.recommendedApproach = rec.recommendedApproach;
            item.usedModel = 'gemini-4-hydrogen';
          }
        }

        topCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
        aiUsed = true;
        aiStatusNote = 'Gemini AI contextual analysis (gemini-4-hydrogen) applied to verified profiles.';

        await writeAuditLog({
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          action: 'AI_SPONSORSHIP_MATCH_ANALYSED',
          entityType: 'sponsorship_match_suggestions',
          entityId: supporter.id,
          ip: params.ip,
          details: {
            model: 'gemini-4-hydrogen',
            candidateCount: topCandidates.length,
            sponsorEntityType: preferences.sponsorEntityType,
          },
        });
      } catch (err: any) {
        console.warn('Gemini matching fallback:', err?.message || err);
        aiStatusNote = `Gemini contextual boost temporarily unavailable (${err?.message || 'fallback active'}) — transparent weighted scoring used.`;
      }
    }
  } else if (!config.enableGeminiAnalysis) {
    aiStatusNote = 'Gemini AI analysis disabled by administrator — transparent weighted scoring active.';
  }

  // Persist fresh non-dismissed suggestions cleanly for transparency & auditability
  await db
    .delete(sponsorshipMatchSuggestions)
    .where(
      and(
        eq(sponsorshipMatchSuggestions.supporterId, supporter.id),
        eq(sponsorshipMatchSuggestions.status, 'SUGGESTED')
      )
    );

  for (const m of topCandidates) {
    if (m.status === 'SUGGESTED') {
      const [inserted] = await db
        .insert(sponsorshipMatchSuggestions)
        .values({
          supporterId: supporter.id,
          beneficiaryId: m.beneficiaryId,
          needRequestId: m.primaryNeed?.id || null,
          compositeScore: m.compositeScore,
          breakdownJson: m.breakdown,
          beneficiarySignalsJson: {
            ageGroup: m.ageGroup,
            challenges: m.specificChallenges,
            needCategories: m.allNeedCategories,
            county: m.county,
            remainingGapMinor: m.primaryNeed?.remainingGapMinor || 0,
            priorityTier: m.primaryNeed?.priorityTier || 'P3_HIGH',
          },
          geminiRationale: m.geminiRationale,
          geminiImpactProjection: m.geminiImpactProjection,
          recommendedApproach: m.recommendedApproach,
          usedModel: m.usedModel,
          status: m.status,
        })
        .returning();
      m.suggestionId = inserted.id;
    } else {
      const existing = existingSuggestions.find((s) => s.beneficiaryId === m.beneficiaryId);
      m.suggestionId = existing?.id;
    }
  }

  return {
    config,
    preferences,
    matches: topCandidates,
    aiUsed,
    aiStatusNote,
  };
}
