import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  empowermentMilestones,
  organisations,
  communityProjects,
  humanitarianFunds,
  beneficiaryProfiles,
  notifications,
  safeguardingIncidents,
  fieldDraftRecords,
} from '../db/schema.ts';
import { encryptSensitiveText, decryptSensitiveText } from '../lib/crypto.ts';
import {
  requireAuth,
  requireRole,
  requirePrivilegedMfa,
  AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

export const EMPOWERMENT_MODULES = [
  { code: 'SKILLS_ACADEMY', name: 'Skills Academy', countyFocus: 'All 47 Counties', durationWeeks: 8 },
  { code: 'VOCATIONAL_TRAINING', name: 'Vocational Training (NITA/TVET)', countyFocus: 'Kisumu, Nakuru, Mombasa', durationWeeks: 16 },
  { code: 'DIGITAL_LITERACY', name: 'Digital Literacy & Remote Work', countyFocus: 'Nairobi, Kiambu, Eldoret', durationWeeks: 10 },
  { code: 'EMPLOYMENT_CENTRE', name: 'Employment Centre & Placement', countyFocus: 'National', durationWeeks: 6 },
  { code: 'INTERNSHIPS', name: 'Internship Opportunities', countyFocus: 'Nairobi, Mombasa, Kisumu', durationWeeks: 12 },
  { code: 'BUSINESS_INCUBATION', name: 'Business Incubation & Micro-Grants', countyFocus: 'National', durationWeeks: 12 },
  { code: 'AGRICULTURE', name: 'Climate-Smart Agriculture', countyFocus: 'Kajiado, Kitui, Turkana, Meru', durationWeeks: 14 },
  { code: 'MENTORSHIP', name: 'Peer & Career Mentorship', countyFocus: 'National', durationWeeks: 24 },
  { code: 'SCHOLARSHIPS', name: 'TVET & University Scholarships', countyFocus: 'National', durationWeeks: 52 },
  { code: 'FINANCIAL_LITERACY', name: 'Financial Literacy & Chamas', countyFocus: 'National', durationWeeks: 6 },
  { code: 'GRADUATE_SUPPORT', name: 'Graduate Transition & Toolkits', countyFocus: 'National', durationWeeks: 12 },
  { code: 'SELF_RELIANCE', name: 'Self-Reliance Tracking (No Aid Auto-Cutoff)', countyFocus: 'National', durationWeeks: 24 },
];

// Empowerment Centre Overview & Safeguard Policy
operationsRouter.get('/empowerment', async (req: AuthRequest, res) => {
  try {
    const [milestones, partners, myProfile] = await Promise.all([
      db
        .select({
          id: empowermentMilestones.id,
          beneficiaryId: empowermentMilestones.beneficiaryId,
          beneficiaryAlias: beneficiaryProfiles.displayAlias,
          beneficiaryRef: beneficiaryProfiles.referenceCode,
          pathwayName: empowermentMilestones.pathwayName,
          moduleTitle: empowermentMilestones.moduleTitle,
          completionPct: empowermentMilestones.completionPct,
          microGrantStatus: empowermentMilestones.microGrantStatus,
          updatedAt: empowermentMilestones.updatedAt,
        })
        .from(empowermentMilestones)
        .innerJoin(beneficiaryProfiles, eq(empowermentMilestones.beneficiaryId, beneficiaryProfiles.id))
        .orderBy(desc(empowermentMilestones.updatedAt)),
      db.select().from(organisations),
      db
        .select()
        .from(beneficiaryProfiles)
        .where(eq(beneficiaryProfiles.userId, req.authUser!.userId))
        .limit(1),
    ]);

    res.json({
      modules: EMPOWERMENT_MODULES,
      milestones,
      partners,
      ownBeneficiaryId: myProfile[0]?.id || null,
      safeguardPolicy:
        'Joining an empowerment module never automatically reduces or terminates active humanitarian or direct sponsorship support.',
    });
  } catch (err) {
    console.error('Empowerment load error:', err);
    res.status(500).json({ error: 'Unable to load Empowerment Centre.' });
  }
});

// Enrol / Refer Beneficiary into Empowerment Programme
operationsRouter.post('/empowerment/enrol', async (req: AuthRequest, res) => {
  const schema = z.object({
    beneficiaryId: z.string().uuid().optional(),
    pathwayName: z.string().min(3),
    moduleTitle: z.string().min(3),
    completionPct: z.number().int().min(0).max(100).default(10),
    microGrantStatus: z.string().default('ENROLLED_ACTIVE'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid empowerment enrolment payload.' });

  let targetBeneficiaryId = parsed.data.beneficiaryId;
  if (!targetBeneficiaryId) {
    const [own] = await db
      .select()
      .from(beneficiaryProfiles)
      .where(eq(beneficiaryProfiles.userId, req.authUser!.userId))
      .limit(1);
    targetBeneficiaryId = own?.id;
  }
  if (!targetBeneficiaryId) {
    return res.status(400).json({ error: 'Beneficiary profile required for empowerment enrolment.' });
  }

  const [created] = await db
    .insert(empowermentMilestones)
    .values({
      beneficiaryId: targetBeneficiaryId,
      pathwayName: parsed.data.pathwayName,
      moduleTitle: parsed.data.moduleTitle,
      completionPct: parsed.data.completionPct,
      microGrantStatus: parsed.data.microGrantStatus,
      mentorUserId: req.authUser!.userId,
    })
    .returning();

  await writeAuditLog({
    actorUserId: req.authUser!.userId,
    actorRole: req.authUser!.activeRole,
    action: 'EMPOWERMENT_ENROLMENT_CREATED',
    entityType: 'empowerment_milestones',
    entityId: created.id,
    ip: req.ip,
    details: { aidAutoTerminationBlocked: true },
  });

  res.status(201).json({ milestone: created });
});

// Register Training Institution or Employer Partner
operationsRouter.post('/empowerment/partner', async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(3),
    orgType: z.enum(['TRAINING_INSTITUTION', 'EMPLOYER', 'CORPORATE', 'HUMANITARIAN_NGO']),
    county: z.string().min(2).default('Nairobi'),
    contactEmail: z.string().email(),
    registrationNumber: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid institution or employer details required.' });

  const [partner] = await db
    .insert(organisations)
    .values({
      name: parsed.data.name,
      orgType: parsed.data.orgType,
      county: parsed.data.county,
      contactEmail: parsed.data.contactEmail,
      registrationNumber: parsed.data.registrationNumber || null,
      verificationStatus: 'PENDING',
    })
    .returning();

  res.status(201).json({ partner });
});

// Community Projects & Emergency Response Centre
operationsRouter.get('/projects', async (_req: AuthRequest, res) => {
  const [projects, funds] = await Promise.all([
    db.select().from(communityProjects).orderBy(desc(communityProjects.createdAt)),
    db.select().from(humanitarianFunds),
  ]);
  res.json({ projects, funds });
});

operationsRouter.post(
  '/projects',
  requireRole('SUPER_ADMIN', 'FIELD_OFFICER', 'COUNTY_REPRESENTATIVE', 'WELL_WISHER'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      fundId: z.string().uuid(),
      title: z.string().min(4),
      county: z.string().min(2),
      summary: z.string().min(10),
      targetAmountMinor: z.number().int().positive(),
      beneficiariesImpacted: z.number().int().min(1).default(50),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid project details required.' });

    const [project] = await db
      .insert(communityProjects)
      .values({
        fundId: parsed.data.fundId,
        title: parsed.data.title,
        county: parsed.data.county,
        summary: parsed.data.summary,
        targetAmountMinor: parsed.data.targetAmountMinor,
        beneficiariesImpacted: parsed.data.beneficiariesImpacted,
        leadOfficerId: req.authUser!.userId,
        status: 'ACTIVE',
      })
      .returning();

    res.status(201).json({ project });
  }
);

// Safeguarding DPIA Inventory & Data Subject Privacy Requests (Kenya Data Protection Act 2019 aligned)
operationsRouter.get(
  '/safeguarding/dpia-inventory',
  requireRole('SUPER_ADMIN', 'SAFEGUARDING_OFFICER', 'WELFARE_OFFICER', 'DATA_MANAGEMENT_OFFICER', 'AUDITOR', 'FIELD_OFFICER'),
  requirePrivilegedMfa,
  async (_req: AuthRequest, res) => {
    const incidents = await db
      .select({
        id: safeguardingIncidents.id,
        category: safeguardingIncidents.category,
        severity: safeguardingIncidents.severity,
        status: safeguardingIncidents.status,
        createdAt: safeguardingIncidents.createdAt,
      })
      .from(safeguardingIncidents)
      .orderBy(desc(safeguardingIncidents.createdAt));

    res.json({
      complianceFramework: 'Kenya Data Protection Act (2019) & Child Safeguarding Standard',
      retentionPolicies: [
        { dataClass: 'Private Identity & Guardian Docs', retentionYears: 7, storage: 'AES-256-GCM Private Vault', disposal: 'Cryptographic erasure + audit certificate' },
        { dataClass: 'Financial Ledger & M-Pesa Receipts', retentionYears: 10, storage: 'Immutable PostgreSQL Ledger', disposal: 'Statutory archive lock (non-deletable)' },
        { dataClass: 'Safeguarding Incident Records', retentionYears: 25, storage: 'Restricted Officer Partition', disposal: 'Dual-admin MFA sign-off required' },
      ],
      dpiaProcessingInventory: [
        { purpose: 'Beneficiary V0-V4 Verification', lawfulBasis: 'Explicit Consent & Vital Interest', minAgeProtection: 'Guardian proxy + redacted public alias', encryption: 'AES-256-GCM' },
        { purpose: 'Direct Sponsorship & M-Pesa Settlement', lawfulBasis: 'Contractual / Donor Mandate', minAgeProtection: 'No adult-to-minor unsupervised messaging', encryption: 'TLS 1.3 + SHA-256 Webhook Integrity' },
        { purpose: 'Gemini AI Intake & Kiswahili Translation', lawfulBasis: 'Opt-in AI_TRIAGE Consent', minAgeProtection: 'Zero minor PII sent; never auto-rejects', encryption: 'Server-side only' },
      ],
      restrictedIncidentsCount: incidents.length,
    });
  }
);

operationsRouter.post('/privacy/dsar', async (req: AuthRequest, res) => {
  const schema = z.object({
    requestType: z.enum(['ACCESS_EXPORT', 'CORRECTION', 'OBJECTION', 'DELETION']),
    details: z.string().min(8).max(1000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid privacy request details required.' });

  const ref = `DSAR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  await db.insert(notifications).values({
    userId: req.authUser!.userId,
    category: 'SYSTEM',
    title: `Privacy Request ${ref} Logged`,
    body: `Your ${parsed.data.requestType.replace(/_/g, ' ')} request is queued for Data Protection Officer review (72h SLA). Financial statutory ledgers remain immutable.`,
  });

  await writeAuditLog({
    actorUserId: req.authUser!.userId,
    actorRole: req.authUser!.activeRole,
    action: `PRIVACY_DSAR_${parsed.data.requestType}`,
    entityType: 'users',
    entityId: req.authUser!.userId,
    ip: req.ip,
    details: { ref },
  });

  res.status(201).json({ reference: ref, status: 'QUEUED_FOR_DPO' });
});

// Persistent Encrypted Field Capture Drafts (Cloud SQL PostgreSQL across all browsers)
operationsRouter.get(
  '/field-drafts',
  requireRole(
    'SUPER_ADMIN',
    'FIELD_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'VERIFICATION_OFFICER',
    'WELFARE_OFFICER',
    'SAFEGUARDING_OFFICER',
    'AUDITOR'
  ),
  async (req: AuthRequest, res) => {
    try {
      const isGlobal =
        req.authUser!.roles.includes('SUPER_ADMIN') || req.authUser!.roles.includes('AUDITOR');
      const rows = isGlobal
        ? await db
            .select()
            .from(fieldDraftRecords)
            .where(eq(fieldDraftRecords.syncStatus, 'PENDING'))
            .orderBy(desc(fieldDraftRecords.capturedAt))
            .limit(100)
        : await db
            .select()
            .from(fieldDraftRecords)
            .where(
              and(
                eq(fieldDraftRecords.capturedByUserId, req.authUser!.userId),
                eq(fieldDraftRecords.syncStatus, 'PENDING')
              )
            )
            .orderBy(desc(fieldDraftRecords.capturedAt))
            .limit(100);

      const drafts = rows.map((r) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(decryptSensitiveText(r.payloadEnc)) as Record<string, unknown>;
        } catch {
          payload = {};
        }
        return {
          localId: r.id,
          id: r.id,
          recordType: r.recordType,
          county: r.county,
          caseId: r.caseId,
          syncStatus: r.syncStatus,
          capturedAt: r.capturedAt.toISOString(),
          payload,
        };
      });

      res.json({ drafts });
    } catch (err) {
      console.error('Field drafts list error:', err);
      res.status(500).json({ error: 'Unable to load saved field drafts from database.' });
    }
  }
);

operationsRouter.post(
  '/field-drafts',
  requireRole(
    'SUPER_ADMIN',
    'FIELD_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'VERIFICATION_OFFICER',
    'WELFARE_OFFICER',
    'SAFEGUARDING_OFFICER'
  ),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      recordType: z
        .enum(['FIELD_VISIT', 'BENEFICIARY_INTAKE', 'CONSENT_CAPTURE', 'EMERGENCY_REPORT'])
        .default('FIELD_VISIT'),
      county: z.string().min(2).max(100),
      caseId: z.string().uuid().nullable().optional(),
      payload: z.record(z.string(), z.unknown()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid field draft payload required.' });
    }

    const [created] = await db
      .insert(fieldDraftRecords)
      .values({
        capturedByUserId: req.authUser!.userId,
        caseId: parsed.data.caseId || null,
        recordType: parsed.data.recordType,
        county: parsed.data.county.trim(),
        payloadEnc: encryptSensitiveText(JSON.stringify(parsed.data.payload)),
        syncStatus: 'PENDING',
      })
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'FIELD_DRAFT_SAVED_DB',
      entityType: 'field_draft_records',
      entityId: created.id,
      ip: req.ip,
      details: { recordType: created.recordType, county: created.county },
    });

    res.status(201).json({
      draft: {
        localId: created.id,
        id: created.id,
        recordType: created.recordType,
        county: created.county,
        caseId: created.caseId,
        syncStatus: created.syncStatus,
        capturedAt: created.capturedAt.toISOString(),
        payload: parsed.data.payload,
      },
    });
  }
);

operationsRouter.post(
  '/field-drafts/:id/mark-synced',
  requireRole(
    'SUPER_ADMIN',
    'FIELD_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'VERIFICATION_OFFICER',
    'WELFARE_OFFICER',
    'SAFEGUARDING_OFFICER'
  ),
  async (req: AuthRequest, res) => {
    const [existing] = await db
      .select()
      .from(fieldDraftRecords)
      .where(eq(fieldDraftRecords.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Field draft not found.' });

    if (
      existing.capturedByUserId !== req.authUser!.userId &&
      !req.authUser!.roles.includes('SUPER_ADMIN')
    ) {
      return res.status(403).json({ error: 'Access denied for this field draft.' });
    }

    await db
      .update(fieldDraftRecords)
      .set({ syncStatus: 'SYNCED', syncedAt: new Date(), updatedAt: new Date() })
      .where(eq(fieldDraftRecords.id, existing.id));

    res.json({ ok: true });
  }
);

operationsRouter.delete(
  '/field-drafts/:id',
  requireRole(
    'SUPER_ADMIN',
    'FIELD_OFFICER',
    'COUNTY_REPRESENTATIVE',
    'VERIFICATION_OFFICER',
    'WELFARE_OFFICER',
    'SAFEGUARDING_OFFICER'
  ),
  async (req: AuthRequest, res) => {
    const [existing] = await db
      .select()
      .from(fieldDraftRecords)
      .where(eq(fieldDraftRecords.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Field draft not found.' });

    if (
      existing.capturedByUserId !== req.authUser!.userId &&
      !req.authUser!.roles.includes('SUPER_ADMIN')
    ) {
      return res.status(403).json({ error: 'Access denied for this field draft.' });
    }

    await db.delete(fieldDraftRecords).where(eq(fieldDraftRecords.id, existing.id));
    res.json({ ok: true });
  }
);
