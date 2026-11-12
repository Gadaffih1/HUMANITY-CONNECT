import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  beneficiaryProfiles,
  householdMembers,
  guardianRelationships,
  beneficiaryStories,
  mediaRecords,
  needRequests,
  needsCategories,
  sponsorships,
  disbursements,
  consentRecords,
  notifications,
  empowermentMilestones,
  verificationCases,
  safeguardingIncidents,
} from '../db/schema.ts';
import { requireAuth, AuthRequest, writeAuditLog } from '../middleware/auth.ts';
import { encryptSensitiveText, decryptSensitiveText } from '../lib/crypto.ts';
import { storeEncryptedPrivateObject, readEncryptedPrivateObject } from '../lib/storage.ts';

export const beneficiaryRouter = Router();
beneficiaryRouter.use(requireAuth);

async function getOrCreateOwnBeneficiaryProfile(userId: string, fullName: string) {
  const [existing] = await db
    .select()
    .from(beneficiaryProfiles)
    .where(eq(beneficiaryProfiles.userId, userId))
    .limit(1);
  if (existing) return existing;

  const refCode = `HC-KE-2026-${crypto.randomInt(1000, 9999)}${crypto
    .randomBytes(1)
    .toString('hex')
    .toUpperCase()}`;

  const [created] = await db
    .insert(beneficiaryProfiles)
    .values({
      userId,
      referenceCode: refCode,
      classification: 'NEEDY',
      displayAlias: `${fullName.split(' ')[0]} Household #${refCode.slice(-4)}`,
      county: 'Nairobi',
      vulnerabilitySummary: 'Draft intake created — please complete personal & household details.',
      verificationLevel: 'V0',
      verificationStatus: 'INTAKE_SUBMITTED',
    })
    .returning();

  await db.insert(verificationCases).values({
    caseNumber: `VC-${refCode}`,
    beneficiaryId: created.id,
    officerWorkspace: 'VERIFICATION_OFFICER',
    verificationLevel: 'V0',
    stage: 'DOCUMENT_REVIEW',
    fieldCounty: created.county,
    caseDeadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return created;
}

beneficiaryRouter.get('/portal', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );

    const [
      members,
      guardians,
      stories,
      media,
      needs,
      mySponsorships,
      myDisbursements,
      consents,
      myNotifications,
      milestones,
      verifCases,
      categories,
    ] = await Promise.all([
      db.select().from(householdMembers).where(eq(householdMembers.beneficiaryId, profile.id)),
      db.select().from(guardianRelationships).where(eq(guardianRelationships.beneficiaryId, profile.id)),
      db.select().from(beneficiaryStories).where(eq(beneficiaryStories.beneficiaryId, profile.id)),
      db.select().from(mediaRecords).where(eq(mediaRecords.beneficiaryId, profile.id)),
      db
        .select({
          id: needRequests.id,
          referenceCode: needRequests.referenceCode,
          categoryId: needRequests.categoryId,
          categoryName: needsCategories.name,
          categoryCode: needsCategories.code,
          title: needRequests.title,
          description: needRequests.description,
          supportingEvidenceNotes: needRequests.supportingEvidenceNotes,
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
          createdAt: needRequests.createdAt,
        })
        .from(needRequests)
        .innerJoin(needsCategories, eq(needRequests.categoryId, needsCategories.id))
        .where(eq(needRequests.beneficiaryId, profile.id))
        .orderBy(desc(needRequests.createdAt)),
      db.select().from(sponsorships).where(eq(sponsorships.beneficiaryId, profile.id)),
      db.select().from(disbursements).where(eq(disbursements.beneficiaryId, profile.id)),
      db.select().from(consentRecords).where(eq(consentRecords.beneficiaryId, profile.id)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.authUser!.userId))
        .orderBy(desc(notifications.createdAt)),
      db.select().from(empowermentMilestones).where(eq(empowermentMilestones.beneficiaryId, profile.id)),
      db.select().from(verificationCases).where(eq(verificationCases.beneficiaryId, profile.id)),
      db.select().from(needsCategories),
    ]);

    res.json({
      profile: {
        ...profile,
        landmarkHint: profile.landmarkHintEnc
          ? decryptSensitiveText(profile.landmarkHintEnc)
          : '',
      },
      householdMembers: members.map((m) => ({
        ...m,
        fullName: decryptSensitiveText(m.fullNameEnc),
        healthNotes: m.healthNotesEnc ? decryptSensitiveText(m.healthNotesEnc) : '',
      })),
      guardianRelationships: guardians,
      stories,
      mediaRecords: media,
      needs,
      sponsorships: mySponsorships,
      disbursements: myDisbursements,
      consents,
      notifications: myNotifications,
      empowermentMilestones: milestones,
      verificationCase: verifCases[0] || null,
      categories,
    });
  } catch (err) {
    console.error('Beneficiary portal fetch error:', err);
    res.status(500).json({ error: 'Unable to load beneficiary workspace.' });
  }
});

beneficiaryRouter.put('/profile', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const body = req.body as {
      displayAlias?: string;
      classification?: string;
      county?: string;
      subCounty?: string;
      ward?: string;
      landmarkHint?: string;
      guardianOrgName?: string;
      vulnerabilitySummary?: string;
      monthlyNeedTargetMinor?: number;
      photoLimitOverrideReason?: string;
      audioTranscript?: string;
      audioLanguage?: string;
      storyTitle?: string;
      storySummary?: string;
      storyNarrative?: string;
      storyLanguage?: string;
    };

    const [updated] = await db
      .update(beneficiaryProfiles)
      .set({
        displayAlias: body.displayAlias ?? profile.displayAlias,
        classification: body.classification ?? profile.classification,
        county: body.county ?? profile.county,
        subCounty: body.subCounty ?? profile.subCounty,
        ward: body.ward ?? profile.ward,
        landmarkHintEnc:
          body.landmarkHint !== undefined
            ? encryptSensitiveText(body.landmarkHint)
            : profile.landmarkHintEnc,
        guardianOrgName: body.guardianOrgName ?? profile.guardianOrgName,
        vulnerabilitySummary: body.vulnerabilitySummary ?? profile.vulnerabilitySummary,
        monthlyNeedTargetMinor: body.monthlyNeedTargetMinor ?? profile.monthlyNeedTargetMinor,
        photoLimitOverrideReason:
          body.photoLimitOverrideReason ?? profile.photoLimitOverrideReason,
        audioTranscript: body.audioTranscript ?? profile.audioTranscript,
        audioLanguage: body.audioLanguage ?? profile.audioLanguage,
        updatedAt: new Date(),
      })
      .where(and(eq(beneficiaryProfiles.id, profile.id), eq(beneficiaryProfiles.userId, req.authUser!.userId)))
      .returning();

    if (body.storyTitle && body.storyNarrative) {
      const existingStories = await db
        .select()
        .from(beneficiaryStories)
        .where(eq(beneficiaryStories.beneficiaryId, profile.id))
        .limit(1);
      if (existingStories.length > 0) {
        await db
          .update(beneficiaryStories)
          .set({
            title: body.storyTitle,
            summary: body.storySummary || body.storyNarrative.slice(0, 180),
            narrative: body.storyNarrative,
            language: body.storyLanguage || 'en',
          })
          .where(eq(beneficiaryStories.id, existingStories[0].id));
      } else {
        await db.insert(beneficiaryStories).values({
          beneficiaryId: profile.id,
          title: body.storyTitle,
          summary: body.storySummary || body.storyNarrative.slice(0, 180),
          narrative: body.storyNarrative,
          language: body.storyLanguage || 'en',
          consentVerified: false,
          isPublished: false,
        });
      }
    }

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'BENEFICIARY_PROFILE_UPDATED',
      entityType: 'beneficiary_profiles',
      entityId: profile.id,
      ip: req.ip,
    });

    res.json({ profile: updated });
  } catch (err) {
    console.error('Update beneficiary error:', err);
    res.status(500).json({ error: 'Unable to update beneficiary profile.' });
  }
});

beneficiaryRouter.post('/household', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const schema = z.object({
      fullName: z.string().min(2),
      relationship: z.string().min(2),
      ageYears: z.number().int().min(0).max(120),
      schoolingStatus: z.string().optional(),
      healthNotes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid household member details.' });

    const isMinor = parsed.data.ageYears < 18;
    const [member] = await db
      .insert(householdMembers)
      .values({
        beneficiaryId: profile.id,
        memberAlias: isMinor
          ? `Dependent (${parsed.data.relationship}, age ${parsed.data.ageYears})`
          : parsed.data.fullName.split(' ')[0],
        fullNameEnc: encryptSensitiveText(parsed.data.fullName),
        relationship: parsed.data.relationship,
        ageYears: parsed.data.ageYears,
        isMinor,
        schoolingStatus: parsed.data.schoolingStatus || null,
        healthNotesEnc: parsed.data.healthNotes
          ? encryptSensitiveText(parsed.data.healthNotes)
          : null,
      })
      .returning();

    if (isMinor && !profile.isMinorCase) {
      await db
        .update(beneficiaryProfiles)
        .set({ isMinorCase: true })
        .where(eq(beneficiaryProfiles.id, profile.id));
    }

    res.status(201).json({
      member: {
        ...member,
        fullName: parsed.data.fullName,
        healthNotes: parsed.data.healthNotes || '',
      },
    });
  } catch (err) {
    console.error('Add household member error:', err);
    res.status(500).json({ error: 'Unable to add household member.' });
  }
});

beneficiaryRouter.post('/guardian', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const { relationshipType, guardianOrgName } = req.body as {
      relationshipType?: string;
      guardianOrgName?: string;
    };
    if (!relationshipType) {
      return res.status(400).json({ error: 'Guardian relationship type is required.' });
    }
    const [rel] = await db
      .insert(guardianRelationships)
      .values({
        beneficiaryId: profile.id,
        guardianUserId: req.authUser!.userId,
        relationshipType,
        legalDocVerified: false,
        consentAuthority: true,
      })
      .returning();

    if (guardianOrgName) {
      await db
        .update(beneficiaryProfiles)
        .set({ guardianOrgName })
        .where(eq(beneficiaryProfiles.id, profile.id));
    }
    res.status(201).json({ guardian: rel });
  } catch (err) {
    console.error('Guardian add error:', err);
    res.status(500).json({ error: 'Unable to save guardian relationship.' });
  }
});

beneficiaryRouter.post('/media', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const schema = z.object({
      docCategory: z.enum([
        'NATIONAL_ID',
        'GUARDIAN_LETTER',
        'BIRTH_CERTIFICATE',
        'SCHOOL_FEE_SLIP',
        'MEDICAL_BILL',
        'CHIEF_LETTER',
        'CASE_PHOTOGRAPH',
        'AUDIO_NARRATION',
      ]),
      filename: z.string().min(1).max(160),
      mimeType: z.string().min(3).max(100),
      base64Content: z.string().min(4),
      exceptionReason: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid document or media payload.' });

    // Enforce max 3 recommended photographs unless documented safe exception provided
    if (parsed.data.docCategory === 'CASE_PHOTOGRAPH') {
      const existingPhotos = await db
        .select()
        .from(mediaRecords)
        .where(
          and(
            eq(mediaRecords.beneficiaryId, profile.id),
            eq(mediaRecords.docCategory, 'CASE_PHOTOGRAPH')
          )
        );
      if (existingPhotos.length >= 3 && !parsed.data.exceptionReason?.trim()) {
        return res.status(400).json({
          error:
            'Up to 3 photographs are recommended per case. Provide a documented safe exception reason to upload additional evidence.',
          code: 'PHOTO_LIMIT_EXCEPTION_REQUIRED',
        });
      }
      if (existingPhotos.length >= 3 && parsed.data.exceptionReason?.trim()) {
        await db
          .update(beneficiaryProfiles)
          .set({ photoLimitOverrideReason: parsed.data.exceptionReason.trim() })
          .where(eq(beneficiaryProfiles.id, profile.id));
      }
    }

    const stored = await storeEncryptedPrivateObject({
      ownerUserId: req.authUser!.userId,
      category: parsed.data.docCategory,
      filename: parsed.data.filename,
      base64Content: parsed.data.base64Content,
    });

    const [record] = await db
      .insert(mediaRecords)
      .values({
        ownerUserId: req.authUser!.userId,
        beneficiaryId: profile.id,
        docCategory: parsed.data.docCategory,
        storageBucket: stored.storageBucket,
        objectKey: stored.objectKey,
        mimeType: parsed.data.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        accessScope: 'PRIVATE_ENCRYPTED',
        encryptionKeyRef: stored.encryptionKeyRef,
        reviewStatus: 'PENDING_REVIEW',
      })
      .returning();

    if (parsed.data.docCategory === 'AUDIO_NARRATION') {
      await db
        .update(beneficiaryProfiles)
        .set({ audioNarrationObjectKey: stored.objectKey })
        .where(eq(beneficiaryProfiles.id, profile.id));
    }

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'PRIVATE_MEDIA_UPLOADED',
      entityType: 'media_records',
      entityId: record.id,
      ip: req.ip,
      details: { docCategory: parsed.data.docCategory },
    });

    res.status(201).json({ record });
  } catch (err) {
    console.error('Media upload error:', err);
    res.status(500).json({ error: 'Unable to store encrypted file.' });
  }
});

beneficiaryRouter.get('/media/:mediaId/download', async (req: AuthRequest, res) => {
  try {
    const [record] = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.id, String(req.params.mediaId)))
      .limit(1);
    if (!record) return res.status(404).json({ error: 'Document not found.' });

    const isOwner = record.ownerUserId === req.authUser!.userId;
    const isReviewer =
      req.authUser!.roles.includes('SUPER_ADMIN') || req.authUser!.roles.includes('FIELD_OFFICER');
    if (!isOwner && !isReviewer) {
      return res.status(403).json({ error: 'Private encrypted documents are restricted.' });
    }

    const base64Content = await readEncryptedPrivateObject(record.objectKey);
    if (!base64Content) return res.status(404).json({ error: 'Encrypted object unavailable.' });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'PRIVATE_DOCUMENT_ACCESSED',
      entityType: 'media_records',
      entityId: record.id,
      ip: req.ip,
    });

    res.json({
      id: record.id,
      mimeType: record.mimeType,
      docCategory: record.docCategory,
      base64Content,
    });
  } catch (err) {
    console.error('Private download error:', err);
    res.status(500).json({ error: 'Unable to retrieve encrypted document.' });
  }
});

beneficiaryRouter.post('/needs', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const schema = z.object({
      categoryId: z.string().uuid(),
      title: z.string().min(4).max(160),
      description: z.string().min(10).max(2000),
      supportingEvidenceNotes: z.string().max(1000).optional(),
      targetAmountMinor: z.number().int().positive(),
      currency: z.string().default('KES'),
      deadlineAt: z.string().optional(),
      isRecurring: z.boolean().default(false),
      frequency: z.enum(['ONE_TIME', 'MONTHLY', 'TERMLY', 'QUARTERLY']).default('ONE_TIME'),
      durationMonths: z.number().int().min(1).max(60).default(1),
      priorityTier: z
        .enum(['P1_CRITICAL', 'P2_URGENT', 'P3_HIGH', 'P4_MODERATE', 'P5_DEVELOPMENTAL'])
        .default('P3_HIGH'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid need request details.' });
    }

    const needRef = `HC-NEED-2026-${crypto.randomInt(1000, 9999)}`;
    const [created] = await db
      .insert(needRequests)
      .values({
        referenceCode: needRef,
        beneficiaryId: profile.id,
        categoryId: parsed.data.categoryId,
        title: parsed.data.title,
        description: parsed.data.description,
        supportingEvidenceNotes: parsed.data.supportingEvidenceNotes || null,
        targetAmountMinor: parsed.data.targetAmountMinor,
        currency: parsed.data.currency,
        deadlineAt: parsed.data.deadlineAt ? new Date(parsed.data.deadlineAt) : null,
        isRecurring: parsed.data.isRecurring,
        frequency: parsed.data.frequency,
        durationMonths: parsed.data.durationMonths,
        priorityTier: parsed.data.priorityTier,
        urgencyLevel: parsed.data.priorityTier.startsWith('P1') ? 'CRITICAL' : 'HIGH',
        verificationStatus: 'PENDING_REVIEW',
        status: 'SUBMITTED',
      })
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'NEED_REQUEST_SUBMITTED',
      entityType: 'need_requests',
      entityId: created.id,
      ip: req.ip,
      details: { referenceCode: needRef },
    });

    res.status(201).json({ need: created });
  } catch (err) {
    console.error('Create need error:', err);
    res.status(500).json({ error: 'Unable to submit need request.' });
  }
});

beneficiaryRouter.put('/consent', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const { consentScope, granted } = req.body as { consentScope?: string; granted?: boolean };
    if (!consentScope || typeof granted !== 'boolean') {
      return res.status(400).json({ error: 'consentScope and boolean granted are required.' });
    }

    // Minor protection: cannot auto-publish minor profiles without verified safeguarding clearance
    if (consentScope === 'PUBLIC_STORY' && granted && profile.isMinorCase && !profile.safeguardingCleared) {
      return res.status(403).json({
        error:
          'Public listing for minor/orphan cases requires verified guardian authority and V4 safeguarding clearance.',
      });
    }

    const [record] = await db
      .insert(consentRecords)
      .values({
        beneficiaryId: profile.id,
        grantedByUserId: req.authUser!.userId,
        consentScope,
        granted,
        revokedAt: granted ? null : new Date(),
      })
      .returning();

    if (consentScope === 'PUBLIC_STORY' && !granted) {
      await db
        .update(beneficiaryProfiles)
        .set({ publicListingApproved: false })
        .where(eq(beneficiaryProfiles.id, profile.id));
    }

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
      entityType: 'consent_records',
      entityId: record.id,
      ip: req.ip,
      details: { consentScope },
    });

    res.json({ consent: record });
  } catch (err) {
    console.error('Consent update error:', err);
    res.status(500).json({ error: 'Unable to update consent record.' });
  }
});

beneficiaryRouter.post('/support-alert', async (req: AuthRequest, res) => {
  try {
    const profile = await getOrCreateOwnBeneficiaryProfile(
      req.authUser!.userId,
      req.authUser!.fullName
    );
    const { category, summary } = req.body as { category?: string; summary?: string };
    if (!summary || summary.trim().length < 8) {
      return res.status(400).json({ error: 'Please describe your concern or help request.' });
    }
    const [incident] = await db
      .insert(safeguardingIncidents)
      .values({
        beneficiaryId: profile.id,
        reportedByUserId: req.authUser!.userId,
        severity: category === 'CHILD_PROTECTION' ? 'CRITICAL' : 'MEDIUM',
        category: category || 'SAFEGUARDING_HELP',
        summaryEnc: encryptSensitiveText(summary.trim()),
        status: 'OPEN',
      })
      .returning();

    await db.insert(notifications).values({
      userId: req.authUser!.userId,
      category: 'SAFEGUARDING',
      title: 'Safeguarding & Support Request Logged',
      body: `Case alert #${incident.id.slice(0, 8)} has been routed confidentially to the Safeguarding Desk.`,
    });

    res.status(201).json({ ticketId: incident.id, status: incident.status });
  } catch (err) {
    console.error('Support alert error:', err);
    res.status(500).json({ error: 'Unable to submit support alert.' });
  }
});
