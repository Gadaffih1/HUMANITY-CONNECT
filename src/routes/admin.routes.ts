import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { db, pool } from '../db/index.ts';
import {
  users,
  roles,
  userRoles,
  beneficiaryProfiles,
  verificationCases,
  verificationCaseEvents,
  needRequests,
  needsCategories,
  priorityAssessments,
  humanitarianFunds,
  fundAllocations,
  disbursements,
  safeguardingIncidents,
  auditLogs,
  volunteerAssignments,
  beneficiaryStories,
} from '../db/schema.ts';
import {
  requireAuth,
  requireRole,
  requirePrivilegedMfa,
  AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';
import { decryptSensitiveText, encryptSensitiveText } from '../lib/crypto.ts';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireRole('SUPER_ADMIN', 'FIELD_OFFICER'));

adminRouter.get('/overview', async (_req: AuthRequest, res) => {
  try {
    const [
      cases,
      needs,
      funds,
      allocations,
      disbList,
      incidents,
      audits,
      userList,
      roleList,
      assignments,
    ] = await Promise.all([
      db
        .select({
          id: verificationCases.id,
          caseNumber: verificationCases.caseNumber,
          beneficiaryId: verificationCases.beneficiaryId,
          beneficiaryRef: beneficiaryProfiles.referenceCode,
          displayAlias: beneficiaryProfiles.displayAlias,
          classification: beneficiaryProfiles.classification,
          isMinorCase: beneficiaryProfiles.isMinorCase,
          officerWorkspace: verificationCases.officerWorkspace,
          verificationLevel: verificationCases.verificationLevel,
          stage: verificationCases.stage,
          fieldCounty: verificationCases.fieldCounty,
          identityVerified: verificationCases.identityVerified,
          guardianVerified: verificationCases.guardianVerified,
          householdVerified: verificationCases.householdVerified,
          needVerified: verificationCases.needVerified,
          documentChecklistOk: verificationCases.documentChecklistOk,
          fieldVisitVerified: verificationCases.fieldVisitVerified,
          fieldVisitNotes: verificationCases.fieldVisitNotes,
          institutionalConfirmationRef: verificationCases.institutionalConfirmationRef,
          safeguardingCleared: verificationCases.safeguardingCleared,
          duplicateAlertFlag: verificationCases.duplicateAlertFlag,
          duplicateAlertDetails: verificationCases.duplicateAlertDetails,
          caseDeadlineAt: verificationCases.caseDeadlineAt,
          followUpReminderAt: verificationCases.followUpReminderAt,
          appealStatus: verificationCases.appealStatus,
          appealReason: verificationCases.appealReason,
          decisionNotes: verificationCases.decisionNotes,
          updatedAt: verificationCases.updatedAt,
        })
        .from(verificationCases)
        .innerJoin(beneficiaryProfiles, eq(verificationCases.beneficiaryId, beneficiaryProfiles.id))
        .orderBy(desc(verificationCases.updatedAt)),
      db
        .select({
          id: needRequests.id,
          referenceCode: needRequests.referenceCode,
          beneficiaryId: needRequests.beneficiaryId,
          beneficiaryAlias: beneficiaryProfiles.displayAlias,
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
          compositePriority: priorityAssessments.compositePriority,
          assessmentReasons: priorityAssessments.assessmentReasons,
          rationale: priorityAssessments.rationale,
          humanApproved: priorityAssessments.humanApproved,
        })
        .from(needRequests)
        .innerJoin(beneficiaryProfiles, eq(needRequests.beneficiaryId, beneficiaryProfiles.id))
        .innerJoin(needsCategories, eq(needRequests.categoryId, needsCategories.id))
        .leftJoin(priorityAssessments, eq(priorityAssessments.needRequestId, needRequests.id))
        .orderBy(desc(needRequests.createdAt)),
      db.select().from(humanitarianFunds),
      db.select().from(fundAllocations).orderBy(desc(fundAllocations.createdAt)),
      db.select().from(disbursements).orderBy(desc(disbursements.createdAt)),
      db.select().from(safeguardingIncidents).orderBy(desc(safeguardingIncidents.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50),
      db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          countryCode: users.countryCode,
          mfaEnabled: users.mfaEnabled,
          approvalStatus: users.approvalStatus,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(40),
      db.select().from(roles),
      db.select().from(volunteerAssignments).orderBy(desc(volunteerAssignments.createdAt)),
    ]);

    const userRoleLinks = await db
      .select({
        userId: userRoles.userId,
        roleCode: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id));

    const caseEvents = await db
      .select()
      .from(verificationCaseEvents)
      .orderBy(desc(verificationCaseEvents.createdAt))
      .limit(100);

    res.json({
      verificationCases: cases,
      caseEvents,
      needs,
      funds,
      allocations,
      disbursements: disbList,
      safeguardingIncidents: incidents.map((inc) => ({
        ...inc,
        summary: decryptSensitiveText(inc.summaryEnc),
      })),
      auditLogs: audits,
      users: userList.map((u) => ({
        ...u,
        roles: userRoleLinks.filter((l) => l.userId === u.id).map((l) => l.roleCode),
      })),
      roles: roleList,
      volunteerAssignments: assignments,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Unable to load governance overview.' });
  }
});

// Verification Centre Multi-Officer Decision & Case History
adminRouter.post('/verification/:caseId/action', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      officerWorkspace: z.enum([
        'VERIFICATION_OFFICER',
        'SOCIAL_WELFARE_OFFICER',
        'FIELD_OFFICER',
        'SAFEGUARDING_OFFICER',
      ]),
      actionType: z.enum([
        'NOTE',
        'LEVEL_ADVANCE',
        'FIELD_VISIT',
        'APPROVE_V4',
        'REJECT',
        'SUSPEND',
        'REASSESSMENT',
        'APPEAL_RESOLVE',
        'DUPLICATE_FLAG',
      ]),
      verificationLevel: z.enum(['V0', 'V1', 'V2', 'V3', 'V4']).optional(),
      reason: z.string().min(5).max(1000),
      identityVerified: z.boolean().optional(),
      guardianVerified: z.boolean().optional(),
      householdVerified: z.boolean().optional(),
      needVerified: z.boolean().optional(),
      documentChecklistOk: z.boolean().optional(),
      fieldVisitVerified: z.boolean().optional(),
      fieldVisitNotes: z.string().optional(),
      institutionalConfirmationRef: z.string().optional(),
      safeguardingCleared: z.boolean().optional(),
      duplicateAlertFlag: z.boolean().optional(),
      duplicateAlertDetails: z.string().optional(),
      approvePublicListing: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Documented reason (min 5 chars) and valid action are required.' });
    }
    const d = parsed.data;
    const caseId = String(req.params.caseId);

    const [existing] = await db
      .select()
      .from(verificationCases)
      .where(eq(verificationCases.id, caseId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Verification case not found.' });

    const nextLevel =
      d.actionType === 'APPROVE_V4' ? 'V4' : d.verificationLevel || existing.verificationLevel;

    let nextStage = existing.stage;
    if (d.actionType === 'APPROVE_V4') nextStage = 'VERIFIED';
    if (d.actionType === 'REJECT') nextStage = 'REJECTED';
    if (d.actionType === 'SUSPEND') nextStage = 'SUSPENDED';
    if (d.actionType === 'REASSESSMENT') nextStage = 'DOCUMENT_REVIEW';
    if (d.actionType === 'FIELD_VISIT') nextStage = 'FIELD_VISIT';

    const updatedCase = await db.transaction(async (tx) => {
      const [vc] = await tx
        .update(verificationCases)
        .set({
          officerWorkspace: d.officerWorkspace,
          verificationLevel: nextLevel,
          stage: nextStage,
          assignedOfficerId: req.authUser!.userId,
          identityVerified: d.identityVerified ?? existing.identityVerified,
          guardianVerified: d.guardianVerified ?? existing.guardianVerified,
          householdVerified: d.householdVerified ?? existing.householdVerified,
          needVerified: d.needVerified ?? existing.needVerified,
          documentChecklistOk: d.documentChecklistOk ?? existing.documentChecklistOk,
          fieldVisitVerified: d.fieldVisitVerified ?? existing.fieldVisitVerified,
          fieldVisitDate: d.fieldVisitVerified ? new Date() : existing.fieldVisitDate,
          fieldVisitNotes: d.fieldVisitNotes ?? existing.fieldVisitNotes,
          institutionalConfirmationRef:
            d.institutionalConfirmationRef ?? existing.institutionalConfirmationRef,
          safeguardingCleared:
            d.actionType === 'APPROVE_V4'
              ? true
              : d.safeguardingCleared ?? existing.safeguardingCleared,
          duplicateAlertFlag: d.duplicateAlertFlag ?? existing.duplicateAlertFlag,
          duplicateAlertDetails: d.duplicateAlertDetails ?? existing.duplicateAlertDetails,
          decisionNotes: d.reason,
          decidedBy: req.authUser!.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(verificationCases.id, caseId))
        .returning();

      await tx.insert(verificationCaseEvents).values({
        caseId,
        actorUserId: req.authUser!.userId,
        actorWorkspace: d.officerWorkspace,
        eventType: d.actionType,
        previousLevel: existing.verificationLevel,
        newLevel: nextLevel,
        reason: d.reason,
      });

      const isVerified = nextStage === 'VERIFIED' && nextLevel === 'V4';
      await tx
        .update(beneficiaryProfiles)
        .set({
          verificationLevel: nextLevel,
          verificationStatus:
            nextStage === 'VERIFIED'
              ? 'VERIFIED'
              : nextStage === 'REJECTED'
                ? 'REJECTED'
                : nextStage === 'SUSPENDED'
                  ? 'SUSPENDED'
                  : 'UNDER_REVIEW',
          safeguardingCleared: vc.safeguardingCleared,
          publicListingApproved: isVerified && Boolean(d.approvePublicListing ?? true),
          updatedAt: new Date(),
        })
        .where(eq(beneficiaryProfiles.id, existing.beneficiaryId));

      if (isVerified) {
        await tx
          .update(beneficiaryStories)
          .set({
            consentVerified: true,
            isPublished: Boolean(d.approvePublicListing ?? true),
            approvedBy: req.authUser!.userId,
            publishedAt: new Date(),
          })
          .where(eq(beneficiaryStories.beneficiaryId, existing.beneficiaryId));
      }

      return vc;
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: `VERIFICATION_${d.actionType}`,
      entityType: 'verification_cases',
      entityId: caseId,
      ip: req.ip,
      details: { previousLevel: existing.verificationLevel, newLevel: nextLevel, reason: d.reason },
    });

    res.json({ verificationCase: updatedCase });
  } catch (err) {
    console.error('Verification action error:', err);
    res.status(500).json({ error: 'Unable to record verification action.' });
  }
});

// Needs Management Engine: Adjustable 100-point model + Mandatory Human Final Approval
adminRouter.post('/needs/:needId/assess', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      vulnerabilityScore: z.number().int().min(0).max(30),
      urgencyScore: z.number().int().min(0).max(25),
      dependencyScore: z.number().int().min(0).max(20),
      safeguardingRiskScore: z.number().int().min(0).max(15),
      empowermentPotentialScore: z.number().int().min(0).max(10),
      humanFinalTier: z.enum([
        'P1_CRITICAL',
        'P2_URGENT',
        'P3_HIGH',
        'P4_MODERATE',
        'P5_DEVELOPMENTAL',
      ]),
      approvedAmountMinor: z.number().int().positive(),
      decision: z.enum(['HUMAN_APPROVED', 'CHANGES_REQUESTED', 'REJECTED_BY_HUMAN']),
      assessmentReasons: z.array(z.string()).min(1),
      rationale: z.string().min(5),
      aiAdvisoryTier: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Complete 100-point assessment and human rationale required.' });
    }
    const d = parsed.data;
    const needId = String(req.params.needId);

    const [need] = await db.select().from(needRequests).where(eq(needRequests.id, needId)).limit(1);
    if (!need) return res.status(404).json({ error: 'Need request not found.' });

    const composite =
      d.vulnerabilityScore +
      d.urgencyScore +
      d.dependencyScore +
      d.safeguardingRiskScore +
      d.empowermentPotentialScore;

    await db.transaction(async (tx) => {
      await tx.insert(priorityAssessments).values({
        needRequestId: needId,
        beneficiaryId: need.beneficiaryId,
        assessedBy: req.authUser!.userId,
        vulnerabilityScore: d.vulnerabilityScore,
        urgencyScore: d.urgencyScore,
        dependencyScore: d.dependencyScore,
        safeguardingRiskScore: d.safeguardingRiskScore,
        empowermentPotentialScore: d.empowermentPotentialScore,
        compositePriority: Math.min(100, composite),
        aiAdvisoryTier: d.aiAdvisoryTier || null,
        humanFinalTier: d.humanFinalTier,
        assessmentReasons: d.assessmentReasons,
        rationale: d.rationale,
        humanApproved: d.decision === 'HUMAN_APPROVED',
      });

      await tx
        .update(needRequests)
        .set({
          priorityTier: d.humanFinalTier,
          approvedAmountMinor: d.approvedAmountMinor,
          verificationStatus: d.decision,
          status: d.decision === 'HUMAN_APPROVED' ? 'VERIFIED' : need.status,
          humanApprovedBy: req.authUser!.userId,
          humanApprovedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(needRequests.id, needId));
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'NEED_HUMAN_ASSESSED',
      entityType: 'need_requests',
      entityId: needId,
      ip: req.ip,
      details: { composite, humanFinalTier: d.humanFinalTier, decision: d.decision },
    });

    res.json({ assessed: true, compositePriority: composite });
  } catch (err) {
    console.error('Need assessment error:', err);
    res.status(500).json({ error: 'Unable to save human priority assessment.' });
  }
});

// Central Fund Allocation & Disbursement (Atomic DB transaction + MFA required)
adminRouter.post('/finance/disburse', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      fundId: z.string().uuid(),
      beneficiaryId: z.string().uuid(),
      needRequestId: z.string().uuid().optional(),
      projectTitle: z.string().min(3),
      amountMinor: z.number().int().positive(),
      channel: z.enum(['MPESA_B2C', 'SCHOOL_PAYBILL', 'HOSPITAL_EFT', 'VENDOR_VOUCHER']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid disbursement parameters.' });
    const d = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [fund] = await tx
        .select()
        .from(humanitarianFunds)
        .where(eq(humanitarianFunds.id, d.fundId))
        .limit(1);
      if (!fund) throw new Error('Humanitarian fund not found.');
      if (fund.availableBalanceMinor < d.amountMinor) {
        throw new Error(
          `Insufficient verified fund balance (${fund.currency} ${(fund.availableBalanceMinor / 100).toLocaleString()}). Pledges cannot be disbursed.`
        );
      }

      const [allocation] = await tx
        .insert(fundAllocations)
        .values({
          fundId: d.fundId,
          beneficiaryId: d.beneficiaryId,
          needRequestId: d.needRequestId || null,
          projectTitle: d.projectTitle,
          allocatedAmountMinor: d.amountMinor,
          currency: fund.currency,
          approvedBy: req.authUser!.userId,
          status: 'DISBURSED',
        })
        .returning();

      const [disb] = await tx
        .insert(disbursements)
        .values({
          pathway: 'CENTRAL_FUND',
          fundAllocationId: allocation.id,
          beneficiaryId: d.beneficiaryId,
          amountMinor: d.amountMinor,
          currency: fund.currency,
          channel: d.channel,
          externalReference: `DISB-${Date.now().toString(36).toUpperCase()}`,
          approvedBy: req.authUser!.userId,
          status: 'SETTLED',
          disbursedAt: new Date(),
        })
        .returning();

      await tx
        .update(humanitarianFunds)
        .set({
          availableBalanceMinor: sql`${humanitarianFunds.availableBalanceMinor} - ${d.amountMinor}`,
          totalDisbursedMinor: sql`${humanitarianFunds.totalDisbursedMinor} + ${d.amountMinor}`,
        })
        .where(eq(humanitarianFunds.id, d.fundId));

      return { allocation, disbursement: disb };
    });

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'CENTRAL_FUND_DISBURSED',
      entityType: 'disbursements',
      entityId: result.disbursement.id,
      ip: req.ip,
      details: { amountMinor: d.amountMinor, channel: d.channel },
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Disbursement failed.' });
  }
});

adminRouter.post('/safeguarding', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  const { incidentId, status, resolutionNotes, beneficiaryId, category, severity, summary } =
    req.body as {
      incidentId?: string;
      status?: string;
      resolutionNotes?: string;
      beneficiaryId?: string;
      category?: string;
      severity?: string;
      summary?: string;
    };

  if (incidentId && status) {
    const [updated] = await db
      .update(safeguardingIncidents)
      .set({
        status,
        resolutionNotes: resolutionNotes || null,
        assignedAdminId: req.authUser!.userId,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
      })
      .where(eq(safeguardingIncidents.id, incidentId))
      .returning();

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'SAFEGUARDING_INCIDENT_UPDATED',
      entityType: 'safeguarding_incidents',
      entityId: incidentId,
      ip: req.ip,
      details: { status },
    });

    return res.json({ incident: updated });
  }

  if (!summary) return res.status(400).json({ error: 'Incident summary required.' });
  const [created] = await db
    .insert(safeguardingIncidents)
    .values({
      beneficiaryId: beneficiaryId || null,
      reportedByUserId: req.authUser!.userId,
      assignedAdminId: req.authUser!.userId,
      severity: severity || 'HIGH',
      category: category || 'CHILD_PROTECTION',
      summaryEnc: encryptSensitiveText(summary),
      status: 'OPEN',
    })
    .returning();
  res.status(201).json({ incident: created });
});

adminRouter.post(
  '/users/:userId/manage',
  requireRole('SUPER_ADMIN'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    const userId = String(req.params.userId);
    const { approvalStatus, suspensionReason, assignRoleCode } = req.body as {
      approvalStatus?: string;
      suspensionReason?: string;
      assignRoleCode?: string;
    };

    if (approvalStatus) {
      await db
        .update(users)
        .set({
          approvalStatus,
          suspensionReason: approvalStatus === 'SUSPENDED' ? suspensionReason || 'Admin review' : null,
        })
        .where(eq(users.id, userId));
    }

    if (assignRoleCode) {
      const [roleRow] = await db.select().from(roles).where(eq(roles.code, assignRoleCode)).limit(1);
      if (roleRow) {
        await db
          .insert(userRoles)
          .values({
            userId,
            roleId: roleRow.id,
            assignedBy: req.authUser!.userId,
            status: 'ACTIVE',
          })
          .onConflictDoNothing();
      }
    }

    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'ADMIN_USER_GOVERNANCE_UPDATED',
      entityType: 'users',
      entityId: userId,
      ip: req.ip,
      details: { approvalStatus, assignRoleCode },
    });

    res.json({ updated: true });
  }
);

function sqlLiteral(value: unknown, udtName?: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Buffer.isBuffer(value)) return `E'\\\\x${value.toString('hex')}'::bytea`;

  const escapeStr = (s: string) => {
    if (/[\n\r\t\\]/.test(s)) {
      const escaped = s
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "''")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `E'${escaped}'`;
    }
    return `'${s.replace(/'/g, "''")}'`;
  };

  if (Array.isArray(value)) {
    if (value.length === 0) return `'{}'::text[]`;
    return `ARRAY[${value.map((v) => escapeStr(String(v))).join(', ')}]::text[]`;
  }

  if (typeof value === 'object' || udtName === 'jsonb' || udtName === 'json') {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
    return `${escapeStr(jsonStr)}::jsonb`;
  }

  return escapeStr(String(value));
}

// GET /api/admin/export-pg-dump — Downloadable PostgreSQL SQL dump for localhost restore
adminRouter.get(
  '/export-pg-dump',
  requireRole('SUPER_ADMIN'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      const tablesRes = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);
      const allTables = tablesRes.rows.map((r) => r.table_name);

      // Foreign key dependencies for topological ordering (parents before children)
      const fkRes = await pool.query<{ child_table: string; parent_table: string }>(`
        SELECT
          cl.relname AS child_table,
          ref.relname AS parent_table
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        JOIN pg_class ref ON ref.oid = c.confrelid
        WHERE n.nspname = 'public' AND c.contype = 'f';
      `);

      const parentsMap = new Map<string, Set<string>>();
      for (const t of allTables) parentsMap.set(t, new Set());
      for (const fk of fkRes.rows) {
        if (fk.child_table !== fk.parent_table) {
          parentsMap.get(fk.child_table)?.add(fk.parent_table);
        }
      }

      const orderedTables: string[] = [];
      const visited = new Set<string>();
      const visiting = new Set<string>();
      const visit = (t: string) => {
        if (visited.has(t) || visiting.has(t)) return;
        visiting.add(t);
        for (const p of parentsMap.get(t) || []) {
          visit(p);
        }
        visiting.delete(t);
        visited.add(t);
        orderedTables.push(t);
      };
      for (const t of allTables) visit(t);

      const lines: string[] = [
        '-- HUMANITY CONNECT — PostgreSQL Logical Dump',
        `-- Exported At: ${new Date().toISOString()}`,
        '-- Target: PostgreSQL 15+ (localhost restore: psql -d humanity_connect -f humanity-connect-postgres-dump.sql)',
        '',
        'BEGIN;',
        'SET statement_timeout = 0;',
        'SET client_encoding = \'UTF8\';',
        'SET standard_conforming_strings = on;',
        'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
        '',
      ];

      const fkStatements: string[] = [];
      const tableColumnsMap = new Map<string, Array<{ column_name: string; udt_name: string }>>();

      for (const tableName of orderedTables) {
        const colsRes = await pool.query<{
          column_name: string;
          data_type: string;
          udt_name: string;
          is_nullable: string;
          column_default: string | null;
        }>(
          `
          SELECT column_name, data_type, udt_name, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `,
          [tableName]
        );

        tableColumnsMap.set(
          tableName,
          colsRes.rows.map((c) => ({ column_name: c.column_name, udt_name: c.udt_name }))
        );

        const consRes = await pool.query<{
          conname: string;
          contype: string;
          condef: string;
        }>(
          `
          SELECT c.conname, c.contype, pg_get_constraintdef(c.oid, true) AS condef
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
          WHERE n.nspname = 'public'
            AND cl.relname = $1
            AND c.contype IN ('p', 'u', 'f', 'c')
          ORDER BY c.contype, c.conname;
        `,
          [tableName]
        );

        const colDefs = colsRes.rows.map((c) => {
          let pgType = c.data_type;
          if (c.data_type === 'ARRAY') {
            pgType = `${c.udt_name.replace(/^_/, '')}[]`;
          } else if (c.data_type === 'timestamp with time zone') {
            pgType = 'timestamptz';
          }
          const parts = [`  "${c.column_name}" ${pgType}`];
          if (c.column_default) parts.push(`DEFAULT ${c.column_default}`);
          if (c.is_nullable === 'NO') parts.push('NOT NULL');
          return parts.join(' ');
        });

        const inlineCons: string[] = [];
        for (const con of consRes.rows) {
          if (con.contype === 'f') {
            fkStatements.push(
              `ALTER TABLE "public"."${tableName}" DROP CONSTRAINT IF EXISTS "${con.conname}";\nALTER TABLE "public"."${tableName}" ADD CONSTRAINT "${con.conname}" ${con.condef};`
            );
          } else {
            inlineCons.push(`  CONSTRAINT "${con.conname}" ${con.condef}`);
          }
        }

        lines.push(`-- Table: public.${tableName}`);
        lines.push(`CREATE TABLE IF NOT EXISTS "public"."${tableName}" (`);
        lines.push([...colDefs, ...inlineCons].join(',\n'));
        lines.push(');');
        lines.push('');

        const idxRes = await pool.query<{ indexname: string; indexdef: string }>(
          `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = $1
            AND indexname NOT IN (
              SELECT c.conname FROM pg_constraint c
              JOIN pg_class cl ON cl.oid = c.conrelid
              WHERE cl.relname = $1
            )
          ORDER BY indexname;
        `,
          [tableName]
        );

        for (const idx of idxRes.rows) {
          lines.push(
            idx.indexdef
              .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
              .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ') + ';'
          );
        }
        if (idxRes.rows.length > 0) lines.push('');
      }

      if (fkStatements.length > 0) {
        lines.push('-- Foreign Key Constraints');
        lines.push(...fkStatements);
        lines.push('');
      }

      lines.push('-- Table Data');
      for (const tableName of orderedTables) {
        const cols = tableColumnsMap.get(tableName) || [];
        if (cols.length === 0) continue;
        const dataRes = await pool.query(`SELECT * FROM "public"."${tableName}"`);
        lines.push(`-- Data for ${tableName} (${dataRes.rows.length} rows)`);
        const colNamesSql = cols.map((c) => `"${c.column_name}"`).join(', ');
        for (const row of dataRes.rows) {
          const valsSql = cols
            .map((c) => sqlLiteral(row[c.column_name], c.udt_name))
            .join(', ');
          lines.push(
            `INSERT INTO "public"."${tableName}" (${colNamesSql}) VALUES (${valsSql}) ON CONFLICT DO NOTHING;`
          );
        }
        lines.push('');
      }

      lines.push('COMMIT;');

      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'POSTGRES_DUMP_EXPORTED',
        entityType: 'database',
        ip: req.ip,
        details: { tableCount: orderedTables.length },
      });

      const filename = `humanity-connect-postgres-${new Date().toISOString().slice(0, 10)}.sql`;
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(lines.join('\n'));
    } catch (err) {
      console.error('PostgreSQL dump export error:', err);
      res.status(500).json({ error: 'Unable to export PostgreSQL dump.' });
    }
  }
);
