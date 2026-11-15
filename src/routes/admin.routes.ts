import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db, isTransientDbError, pool, toSafeClientErrorMessage, withDbRetry } from '../db/index.ts';
import {
  users,
  roles,
  userRoles,
  userPermissions,
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
  requireAnyAdminOrPermission,
  requirePrivilegedMfa,
  type AuthRequest,
  writeAuditLog,
} from '../middleware/auth.ts';
import { decryptSensitiveText, encryptSensitiveText, hashPassword } from '../lib/crypto.ts';
import {
  ADMIN_ACCESS_ROLE_CODES,
  PERMISSION_ACTION_VERBS,
  SUB_ADMIN_PERMISSION_FLAGS,
  SUB_ADMIN_ROLE_CODES,
  type RoleCode,
  type SubAdminPermissionFlag,
} from '../types/domain.ts';
import {
  ROLE_PERMISSION_MATRIX,
  buildPermissionPreview,
  userCanViewSafeguardingCases,
} from '../lib/rbacPolicy.ts';
import { dumpDataSelect, sqlLiteral } from '../lib/postgresDump.ts';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAnyAdminOrPermission());

function isReadOnlyAuditor(req: AuthRequest): boolean {
  const rolesList = req.authUser?.roles || [];
  return (
    (req.authUser?.activeRole === 'AUDITOR' || rolesList.includes('AUDITOR')) &&
    !rolesList.includes('SUPER_ADMIN')
  );
}

adminRouter.get('/overview', async (req: AuthRequest, res) => {
  try {
    const canSeeSafeguarding = userCanViewSafeguardingCases(
      req.authUser!.roles,
      req.authUser!.permissions
    );

    const schemaProbe = await withDbRetry(() =>
      pool.query<{
        has_sep: boolean;
        has_fgo: boolean;
        has_up: boolean;
        has_vce: boolean;
        has_va: boolean;
      }>(`
        SELECT
          (to_regclass('public.staff_employee_profiles') IS NOT NULL) AS has_sep,
          (to_regclass('public.field_geography_officers') IS NOT NULL) AS has_fgo,
          (to_regclass('public.user_permissions') IS NOT NULL) AS has_up,
          (to_regclass('public.verification_case_events') IS NOT NULL) AS has_vce,
          (to_regclass('public.volunteer_assignments') IS NOT NULL) AS has_va
      `)
    ).catch(() => ({
      rows: [{ has_sep: false, has_fgo: false, has_up: false, has_vce: false, has_va: false }],
    }));
    const flags = schemaProbe.rows[0] || {
      has_sep: false,
      has_fgo: false,
      has_up: false,
      has_vce: false,
      has_va: false,
    };

    const countySqlExpr = sql<string | null>`COALESCE(
      NULLIF(${users.county}, ''),
      (SELECT county FROM public.beneficiary_profiles WHERE user_id = ${users.id} LIMIT 1)
      ${flags.has_sep ? sql`, (SELECT county_assignment FROM public.staff_employee_profiles WHERE user_id = ${users.id} LIMIT 1)` : sql``}
      ${flags.has_fgo ? sql`, (SELECT county FROM public.field_geography_officers WHERE user_id = ${users.id} LIMIT 1)` : sql``}
    )`;

    const subCountySqlExpr = sql<string | null>`COALESCE(
      NULLIF(${users.subCounty}, ''),
      (SELECT sub_county FROM public.beneficiary_profiles WHERE user_id = ${users.id} LIMIT 1)
      ${flags.has_sep ? sql`, (SELECT sub_county_assignment FROM public.staff_employee_profiles WHERE user_id = ${users.id} LIMIT 1)` : sql``}
      ${flags.has_fgo ? sql`, (SELECT sub_county FROM public.field_geography_officers WHERE user_id = ${users.id} LIMIT 1)` : sql``}
    )`;

    // Batch 1: Core verification queue, needs, funds, and allocations
    const [cases, needs, funds, allocations, disbList, incidents] = await withDbRetry(() =>
      Promise.all([
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
        canSeeSafeguarding
          ? db.select().from(safeguardingIncidents).orderBy(desc(safeguardingIncidents.createdAt))
          : Promise.resolve([]),
      ])
    );

    // Batch 2: Audit logs, users/roles/permissions, volunteer assignments, case events
    const [audits, userList, roleList, assignments, directPermRows, userRoleLinks, caseEvents] =
      await withDbRetry(() =>
        Promise.all([
          db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(80),
          db
            .select({
              id: users.id,
              email: users.email,
              fullName: users.fullName,
              phoneE164: users.phoneE164,
              countryCode: users.countryCode,
              county: countySqlExpr,
              subCounty: subCountySqlExpr,
              mfaEnabled: users.mfaEnabled,
              approvalStatus: users.approvalStatus,
              createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(100),
          db.select().from(roles),
          flags.has_va
            ? db.select().from(volunteerAssignments).orderBy(desc(volunteerAssignments.createdAt))
            : Promise.resolve([]),
          flags.has_up ? db.select().from(userPermissions) : Promise.resolve([]),
          db
            .select({
              userId: userRoles.userId,
              roleCode: roles.code,
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id)),
          flags.has_vce
            ? db
                .select()
                .from(verificationCaseEvents)
                .orderBy(desc(verificationCaseEvents.createdAt))
                .limit(100)
            : Promise.resolve([]),
        ])
      );

    const userLookup = new Map(userList.map((u) => [u.id, { fullName: u.fullName, email: u.email }]));
    const accessAuditActions = new Set([
      'SUBADMIN_CREATED',
      'USER_PERMISSIONS_UPDATED',
      'ADMIN_USER_GOVERNANCE_UPDATED',
      'ORG_LEADERSHIP_UPDATED',
      'STAFF_APPOINTMENT_APPROVED',
      'DISCIPLINARY_RECORD_ACCESSED',
      'STAFF_PROFILE_UPDATED',
      'FIELD_OFFICER_APPOINTED',
    ]);

    const accessAuditLogs = audits
      .filter((a) => accessAuditActions.has(a.action) || a.action.includes('PERMISSION') || a.action.includes('ROLE'))
      .map((a) => ({
        id: a.id,
        action: a.action,
        actorRole: a.actorRole,
        actorName: a.actorUserId ? userLookup.get(a.actorUserId)?.fullName || 'Administrator' : 'System',
        actorEmail: a.actorUserId ? userLookup.get(a.actorUserId)?.email || '—' : '—',
        targetUserId: a.entityId,
        targetUserName: a.entityId ? userLookup.get(a.entityId)?.fullName || a.entityId : '—',
        targetUserEmail: a.entityId ? userLookup.get(a.entityId)?.email || '—' : '—',
        detailsJson: a.detailsJson,
        createdAt: a.createdAt,
      }));

    res.json({
      verificationCases: cases,
      caseEvents,
      needs,
      funds,
      allocations,
      disbursements: disbList,
      safeguardingRestricted: !canSeeSafeguarding,
      safeguardingIncidents: incidents.map((inc) => ({
        ...inc,
        summary: decryptSensitiveText(inc.summaryEnc),
      })),
      auditLogs: audits,
      accessAuditLogs,
      users: userList.map((u) => ({
        ...u,
        roles: userRoleLinks.filter((l) => l.userId === u.id).map((l) => l.roleCode),
        permissions: directPermRows
          .filter((p) => p.userId === u.id)
          .map((p) => p.permissionCode),
      })),
      roles: roleList,
      volunteerAssignments: assignments,
      subAdminRoleCodes: SUB_ADMIN_ROLE_CODES,
      subAdminPermissionFlags: SUB_ADMIN_PERMISSION_FLAGS,
      permissionActionVerbs: PERMISSION_ACTION_VERBS,
      rolePermissionMatrix: ROLE_PERMISSION_MATRIX,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(isTransientDbError(err) ? 503 : 500).json({
      error: 'Unable to load governance overview. Please retry shortly.',
    });
  }
});

// Super Admin Registered User Accounts Directory (all accounts & all registered details)
adminRouter.get(
  '/users-directory',
  requireRole('SUPER_ADMIN'),
  async (_req: AuthRequest, res) => {
    try {
      const regProbe = await withDbRetry(() =>
        pool.query<{
          has_bp: boolean;
          has_gr: boolean;
          has_sp: boolean;
          has_org: boolean;
          has_vc: boolean;
          has_sep: boolean;
          has_fgo: boolean;
        }>(`
          SELECT
            (to_regclass('public.beneficiary_profiles') IS NOT NULL) AS has_bp,
            (to_regclass('public.guardian_relationships') IS NOT NULL) AS has_gr,
            (to_regclass('public.supporter_profiles') IS NOT NULL) AS has_sp,
            (to_regclass('public.organisations') IS NOT NULL) AS has_org,
            (to_regclass('public.verification_cases') IS NOT NULL) AS has_vc,
            (to_regclass('public.staff_employee_profiles') IS NOT NULL) AS has_sep,
            (to_regclass('public.field_geography_officers') IS NOT NULL) AS has_fgo
        `)
      ).catch(() => ({
        rows: [
          {
            has_bp: false,
            has_gr: false,
            has_sp: false,
            has_org: false,
            has_vc: false,
            has_sep: false,
            has_fgo: false,
          },
        ],
      }));
      const flags = regProbe.rows[0] || {
        has_bp: false,
        has_gr: false,
        has_sp: false,
        has_org: false,
        has_vc: false,
        has_sep: false,
        has_fgo: false,
      };

      const countyParts = ['NULLIF(u.county, \'\')'];
      const subCountyParts = ['NULLIF(u.sub_county, \'\')'];
      const wardParts: string[] = [];
      if (flags.has_bp) {
        countyParts.push('bp.county');
        subCountyParts.push('bp.sub_county');
        wardParts.push('bp.ward');
      }
      if (flags.has_sep) {
        countyParts.push('sep.county_assignment');
        subCountyParts.push('sep.sub_county_assignment');
      }
      if (flags.has_fgo) {
        countyParts.push('fgo.county');
        subCountyParts.push('fgo.sub_county');
        wardParts.push('fgo.ward');
      }

      const countyExpr = `COALESCE(${countyParts.join(', ')})`;
      const subCountyExpr = `COALESCE(${subCountyParts.join(', ')})`;
      const wardExpr = wardParts.length > 0 ? `COALESCE(${wardParts.join(', ')})` : 'NULL::text';

      const extraSelects = [
        flags.has_bp ? 'bp.classification AS beneficiary_classification' : 'NULL::text AS beneficiary_classification',
        flags.has_bp ? 'bp.reference_code AS beneficiary_ref' : 'NULL::text AS beneficiary_ref',
        flags.has_bp ? 'bp.display_alias AS display_alias' : 'NULL::text AS display_alias',
        flags.has_bp ? 'bp.vulnerability_summary AS vulnerability_summary' : 'NULL::text AS vulnerability_summary',
        flags.has_bp ? 'bp.guardian_org_name AS guardian_org_name' : 'NULL::text AS guardian_org_name',
        flags.has_bp ? 'bp.is_minor_case AS is_minor_case' : 'false AS is_minor_case',
        flags.has_bp ? 'bp.verification_level AS verification_level' : 'NULL::text AS verification_level',
        flags.has_bp ? 'bp.verification_status AS verification_status' : 'NULL::text AS verification_status',
        flags.has_bp ? 'bp.safeguarding_cleared AS safeguarding_cleared' : 'false AS safeguarding_cleared',
        flags.has_bp ? 'bp.public_listing_approved AS public_listing_approved' : 'false AS public_listing_approved',
        flags.has_bp ? 'bp.monthly_need_target_minor AS monthly_need_target_minor' : 'NULL::integer AS monthly_need_target_minor',
        flags.has_bp ? 'bp.age_group AS age_group' : 'NULL::text AS age_group',
        flags.has_bp && flags.has_gr ? 'gr.relationship_type AS guardian_relationship' : 'NULL::text AS guardian_relationship',
        flags.has_bp && flags.has_vc ? 'vc.case_number AS case_number' : 'NULL::text AS case_number',
        flags.has_bp && flags.has_vc ? 'vc.stage AS case_stage' : 'NULL::text AS case_stage',
        flags.has_sp ? 'sp.supporter_type AS supporter_type' : 'NULL::text AS supporter_type',
        flags.has_sp ? 'sp.display_name AS supporter_display_name' : 'NULL::text AS supporter_display_name',
        flags.has_sp ? 'sp.preferred_currency AS preferred_currency' : 'NULL::text AS preferred_currency',
        flags.has_sp ? 'sp.anonymous_giving AS anonymous_giving' : 'false AS anonymous_giving',
        flags.has_sp && flags.has_org ? 'org.name AS organisation_name' : 'NULL::text AS organisation_name',
        flags.has_sp && flags.has_org ? 'org.org_type AS organisation_type' : 'NULL::text AS organisation_type',
        flags.has_sp && flags.has_org ? 'org.verification_status AS organisation_status' : 'NULL::text AS organisation_status',
      ];

      const lateralJoins: string[] = [];
      const groupByCols: string[] = [
        'u.id',
        'u.full_name',
        'u.email',
        'u.phone_e164',
        'u.country_code',
        'u.county',
        'u.sub_county',
        'u.preferred_language',
        'u.approval_status',
        'u.suspension_reason',
        'u.email_verified_at',
        'u.phone_verified_at',
        'u.mfa_enabled',
        'u.last_login_at',
        'u.created_at',
      ];

      if (flags.has_bp) {
        lateralJoins.push(`
          LEFT JOIN LATERAL (
            SELECT id, county, sub_county, ward, classification, reference_code,
                   display_alias, vulnerability_summary, guardian_org_name,
                   is_minor_case, verification_level, verification_status,
                   safeguarding_cleared, public_listing_approved,
                   monthly_need_target_minor, age_group
            FROM public.beneficiary_profiles
            WHERE user_id = u.id
            LIMIT 1
          ) bp ON TRUE
        `);
        groupByCols.push(
          'bp.county',
          'bp.sub_county',
          'bp.ward',
          'bp.classification',
          'bp.reference_code',
          'bp.display_alias',
          'bp.vulnerability_summary',
          'bp.guardian_org_name',
          'bp.is_minor_case',
          'bp.verification_level',
          'bp.verification_status',
          'bp.safeguarding_cleared',
          'bp.public_listing_approved',
          'bp.monthly_need_target_minor',
          'bp.age_group'
        );
        if (flags.has_gr) {
          lateralJoins.push(`
            LEFT JOIN LATERAL (
              SELECT relationship_type
              FROM public.guardian_relationships
              WHERE beneficiary_id = bp.id AND guardian_user_id = u.id
              LIMIT 1
            ) gr ON TRUE
          `);
          groupByCols.push('gr.relationship_type');
        }
        if (flags.has_vc) {
          lateralJoins.push(`
            LEFT JOIN LATERAL (
              SELECT case_number, stage
              FROM public.verification_cases
              WHERE beneficiary_id = bp.id
              ORDER BY created_at DESC
              LIMIT 1
            ) vc ON TRUE
          `);
          groupByCols.push('vc.case_number', 'vc.stage');
        }
      }

      if (flags.has_sp) {
        lateralJoins.push(`
          LEFT JOIN LATERAL (
            SELECT organisation_id, supporter_type, display_name, preferred_currency, anonymous_giving
            FROM public.supporter_profiles
            WHERE user_id = u.id
            LIMIT 1
          ) sp ON TRUE
        `);
        groupByCols.push(
          'sp.supporter_type',
          'sp.display_name',
          'sp.preferred_currency',
          'sp.anonymous_giving'
        );
        if (flags.has_org) {
          lateralJoins.push(`
            LEFT JOIN LATERAL (
              SELECT name, org_type, verification_status
              FROM public.organisations
              WHERE id = sp.organisation_id
              LIMIT 1
            ) org ON TRUE
          `);
          groupByCols.push('org.name', 'org.org_type', 'org.verification_status');
        }
      }

      if (flags.has_sep) {
        lateralJoins.push(`
          LEFT JOIN LATERAL (
            SELECT county_assignment, sub_county_assignment
            FROM public.staff_employee_profiles
            WHERE user_id = u.id
            LIMIT 1
          ) sep ON TRUE
        `);
        groupByCols.push('sep.county_assignment', 'sep.sub_county_assignment');
      }

      if (flags.has_fgo) {
        lateralJoins.push(`
          LEFT JOIN LATERAL (
            SELECT county, sub_county, ward
            FROM public.field_geography_officers
            WHERE user_id = u.id
            LIMIT 1
          ) fgo ON TRUE
        `);
        groupByCols.push('fgo.county', 'fgo.sub_county', 'fgo.ward');
      }

      const directoryRes = await withDbRetry(() =>
        pool.query<{
          id: string;
          full_name: string;
          email: string;
          phone_e164: string | null;
          country_code: string;
          county: string | null;
          sub_county: string | null;
          ward: string | null;
          preferred_language: string;
          approval_status: string;
          suspension_reason: string | null;
          email_verified: boolean;
          phone_verified: boolean;
          mfa_enabled: boolean;
          last_login_at: string | null;
          created_at: string;
          roles: string[] | null;
          beneficiary_classification: string | null;
          beneficiary_ref: string | null;
          display_alias: string | null;
          vulnerability_summary: string | null;
          guardian_org_name: string | null;
          is_minor_case: boolean;
          verification_level: string | null;
          verification_status: string | null;
          safeguarding_cleared: boolean;
          public_listing_approved: boolean;
          monthly_need_target_minor: number | null;
          age_group: string | null;
          guardian_relationship: string | null;
          case_number: string | null;
          case_stage: string | null;
          supporter_type: string | null;
          supporter_display_name: string | null;
          preferred_currency: string | null;
          anonymous_giving: boolean;
          organisation_name: string | null;
          organisation_type: string | null;
          organisation_status: string | null;
        }>(`
          SELECT
            u.id,
            u.full_name,
            u.email,
            u.phone_e164,
            u.country_code,
            ${countyExpr} AS county,
            ${subCountyExpr} AS sub_county,
            ${wardExpr} AS ward,
            u.preferred_language,
            u.approval_status,
            u.suspension_reason,
            (u.email_verified_at IS NOT NULL) AS email_verified,
            (u.phone_verified_at IS NOT NULL) AS phone_verified,
            u.mfa_enabled,
            u.last_login_at,
            u.created_at,
            COALESCE(
              ARRAY_AGG(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL),
              ARRAY[]::text[]
            ) AS roles,
            ${extraSelects.join(',\n            ')}
          FROM public.users u
          LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.status = 'ACTIVE'
          LEFT JOIN public.roles r ON r.id = ur.role_id
          ${lateralJoins.join('\n          ')}
          GROUP BY
            ${groupByCols.join(',\n            ')}
          ORDER BY u.created_at DESC;
        `)
      );

      const directoryUsers = directoryRes.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phoneE164: row.phone_e164,
        countryCode: row.country_code,
        county: row.county,
        subCounty: row.sub_county,
        ward: row.ward,
        preferredLanguage: row.preferred_language,
        approvalStatus: row.approval_status,
        suspensionReason: row.suspension_reason,
        emailVerified: Boolean(row.email_verified),
        phoneVerified: Boolean(row.phone_verified),
        mfaEnabled: Boolean(row.mfa_enabled),
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
        roles: Array.isArray(row.roles) ? row.roles : [],
        beneficiaryClassification: row.beneficiary_classification,
        beneficiaryRef: row.beneficiary_ref,
        displayAlias: row.display_alias,
        vulnerabilitySummary: row.vulnerability_summary,
        guardianOrgName: row.guardian_org_name,
        guardianRelationship: row.guardian_relationship,
        isMinorCase: Boolean(row.is_minor_case),
        verificationLevel: row.verification_level,
        verificationStatus: row.verification_status,
        safeguardingCleared: Boolean(row.safeguarding_cleared),
        publicListingApproved: Boolean(row.public_listing_approved),
        monthlyNeedTargetMinor: row.monthly_need_target_minor,
        ageGroup: row.age_group,
        caseNumber: row.case_number,
        caseStage: row.case_stage,
        supporterType: row.supporter_type,
        supporterDisplayName: row.supporter_display_name,
        preferredCurrency: row.preferred_currency,
        anonymousGiving: Boolean(row.anonymous_giving),
        organisationName: row.organisation_name,
        organisationType: row.organisation_type,
        organisationStatus: row.organisation_status,
      }));

      res.json({
        totalCount: directoryUsers.length,
        users: directoryUsers,
      });
    } catch (err) {
      console.error('Super Admin users directory error:', err);
      res.status(isTransientDbError(err) ? 503 : 500).json({ error: 'Unable to load registered users directory.' });
    }
  }
);

// Verification Centre Multi-Officer Decision & Case History
adminRouter.post(
  '/verification/:caseId/action',
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      if (isReadOnlyAuditor(req)) {
        return res.status(403).json({
          error: 'Auditor independence enforced: Auditors hold read-only audit access and cannot alter verification decisions.',
        });
      }
      const allowedVerification =
        req.authUser!.roles.some((r) =>
          ['SUPER_ADMIN', 'VERIFICATION_OFFICER', 'FIELD_OFFICER', 'WELFARE_OFFICER', 'COUNTY_REPRESENTATIVE', 'SAFEGUARDING_OFFICER'].includes(r)
        ) || req.authUser!.permissions.includes('canVerifyUsers');
      if (!allowedVerification) {
        return res.status(403).json({ error: 'Missing verification officer privileges or canVerifyUsers flag.' });
      }

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
  }
);

// Needs Management Engine: Adjustable 100-point model + Mandatory Human Final Approval
adminRouter.post('/needs/:needId/assess', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isReadOnlyAuditor(req)) {
      return res.status(403).json({
        error: 'Auditor independence enforced: Auditors cannot modify need assessments.',
      });
    }
    const allowedNeeds =
      req.authUser!.roles.some((r) =>
        ['SUPER_ADMIN', 'VERIFICATION_OFFICER', 'WELFARE_OFFICER', 'FIELD_OFFICER', 'COUNTY_REPRESENTATIVE'].includes(r)
      ) || req.authUser!.permissions.includes('canVerifyNeed');
    if (!allowedNeeds) {
      return res.status(403).json({ error: 'Missing need verification privileges (canVerifyNeed).' });
    }

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

// Central Fund Allocation & Disbursement (Atomic DB transaction + MFA + Separation of Duties)
adminRouter.post('/finance/disburse', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isReadOnlyAuditor(req)) {
      return res.status(403).json({
        error: 'Auditor independence enforced: Auditors cannot execute financial disbursements.',
      });
    }
    if (req.authUser!.activeRole === 'VERIFICATION_OFFICER') {
      return res.status(403).json({
        error: 'Rule #1 Separation of Duties: Verification officers may verify and recommend cases but cannot release funds.',
      });
    }
    const canDisburse =
      req.authUser!.roles.includes('SUPER_ADMIN') ||
      req.authUser!.roles.includes('FINANCE_OFFICER') ||
      req.authUser!.permissions.includes('canDisburseFunds');
    if (!canDisburse) {
      return res.status(403).json({
        error: 'Missing financial disbursement privilege (FINANCE_OFFICER or canDisburseFunds required).',
      });
    }

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
  } catch (err: unknown) {
    console.error('Admin central fund disbursement error:', err);
    res.status(isTransientDbError(err) ? 503 : 400).json({
      error: toSafeClientErrorMessage(err, 'Disbursement failed.'),
    });
  }
});

adminRouter.post('/safeguarding', requirePrivilegedMfa, async (req: AuthRequest, res) => {
  try {
    if (isReadOnlyAuditor(req)) {
      return res.status(403).json({
        error: 'Auditor independence enforced: Auditors cannot alter safeguarding incident statuses.',
      });
    }
    if (!userCanViewSafeguardingCases(req.authUser!.roles, req.authUser!.permissions)) {
      return res.status(403).json({
        error: 'Rule #7 Safeguarding Confidentiality: HR and non-safeguarding roles cannot access or modify protected safeguarding investigations.',
      });
    }

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
      const [existing] = await withDbRetry(() =>
        db
          .select()
          .from(safeguardingIncidents)
          .where(eq(safeguardingIncidents.id, incidentId))
          .limit(1)
      );
      if (!existing) return res.status(404).json({ error: 'Safeguarding incident not found.' });

      // Anti-self-approval: reporting officer cannot unilaterally close/resolve own case
      if (status === 'RESOLVED' && existing.reportedByUserId === req.authUser!.userId) {
        return res.status(403).json({
          error: 'Independent safeguarding oversight enforced: you cannot unilaterally resolve a safeguarding incident you reported.',
        });
      }

      const [updated] = await withDbRetry(() =>
        db
          .update(safeguardingIncidents)
          .set({
            status,
            resolutionNotes: resolutionNotes || null,
            assignedAdminId: req.authUser!.userId,
            resolvedAt: status === 'RESOLVED' ? new Date() : null,
          })
          .where(eq(safeguardingIncidents.id, incidentId))
          .returning()
      );

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
    const [created] = await withDbRetry(() =>
      db
        .insert(safeguardingIncidents)
        .values({
          beneficiaryId: beneficiaryId || null,
          reportedByUserId: req.authUser!.userId,
          assignedAdminId: null,
          severity: severity || 'HIGH',
          category: category || 'CHILD_PROTECTION',
          summaryEnc: encryptSensitiveText(summary),
          status: 'OPEN',
        })
        .returning()
    );
    res.status(201).json({ incident: created });
  } catch (err) {
    console.error('Safeguarding action error:', err);
    res.status(isTransientDbError(err) ? 503 : 500).json({ error: 'Unable to process safeguarding incident.' });
  }
});

// Permission Mapping Preview (Before any role or permission change is committed)
adminRouter.post(
  '/permissions/preview',
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        targetUserId: z.string().uuid().optional(),
        newRoleCode: z.string().optional().nullable(),
        selectedFlags: z.array(z.string()).default([]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid preview payload.' });

      let existingRoles: RoleCode[] = [];
      if (parsed.data.targetUserId) {
        const links = await db
          .select({ roleCode: roles.code })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, parsed.data.targetUserId));
        existingRoles = links.map((l) => l.roleCode as RoleCode);
      }

      const validFlags = parsed.data.selectedFlags.filter((f): f is SubAdminPermissionFlag =>
        SUB_ADMIN_PERMISSION_FLAGS.some((sf) => sf.code === f)
      );

      const preview = buildPermissionPreview({
        existingRoles,
        newRoleCode: (parsed.data.newRoleCode || null) as RoleCode | null,
        selectedFlags: validFlags,
      });

      res.json({ preview });
    } catch (err) {
      console.error('Permission preview error:', err);
      res.status(500).json({ error: 'Unable to compute permission preview.' });
    }
  }
);

// Create Sub-Admin Account with Initial Role & Granular Permissions
adminRouter.post(
  '/subadmins',
  requireRole('SUPER_ADMIN'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        fullName: z.string().min(3).max(120),
        email: z.string().email(),
        password: z.string().min(10, 'Password must be at least 10 characters.'),
        phoneE164: z.string().optional(),
        county: z.string().trim().max(80).optional(),
        subCounty: z.string().trim().max(80).optional(),
        roleCode: z.enum(SUB_ADMIN_ROLE_CODES as [RoleCode, ...RoleCode[]]),
        permissionFlags: z.array(z.string()).default([]),
        additionalAuthorizationReason: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid sub-admin details.' });
      }
      const d = parsed.data;
      const emailNorm = d.email.trim().toLowerCase();

      const validFlags = d.permissionFlags.filter((f): f is SubAdminPermissionFlag =>
        SUB_ADMIN_PERMISSION_FLAGS.some((sf) => sf.code === f)
      );
      const preview = buildPermissionPreview({
        existingRoles: [],
        newRoleCode: d.roleCode,
        selectedFlags: validFlags,
      });

      if (preview.conflicts.length > 0) {
        return res.status(400).json({ error: preview.conflicts.join(' ') });
      }
      if (
        preview.requiresAdditionalAuthorization &&
        (!d.additionalAuthorizationReason || d.additionalAuthorizationReason.trim().length < 10)
      ) {
        return res.status(400).json({
          error: 'Critical role or sensitive permission flag requires an additional authorisation justification (min 10 chars).',
        });
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, emailNorm))
        .limit(1);
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email already exists. Use Permission Mapping instead.' });
      }

      const [roleRow] = await db.select().from(roles).where(eq(roles.code, d.roleCode)).limit(1);
      if (!roleRow) {
        return res.status(400).json({ error: `Role ${d.roleCode} is not configured.` });
      }

      const passwordHash = await hashPassword(d.password);
      const createdUser = await db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({
            email: emailNorm,
            fullName: d.fullName.trim(),
            phoneE164: d.phoneE164?.trim() || null,
            passwordHash,
            countryCode: 'KE',
            county: d.county?.trim() || null,
            subCounty: d.subCounty?.trim() || null,
            approvalStatus: 'ACTIVE',
            emailVerifiedAt: new Date(),
          })
          .returning({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            approvalStatus: users.approvalStatus,
          });

        await tx.insert(userRoles).values({
          userId: u.id,
          roleId: roleRow.id,
          assignedBy: req.authUser!.userId,
          status: 'ACTIVE',
        });

        for (const flag of validFlags) {
          await tx
            .insert(userPermissions)
            .values({
              userId: u.id,
              permissionCode: flag,
              grantedBy: req.authUser!.userId,
            })
            .onConflictDoNothing();
        }
        return u;
      });

      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'SUBADMIN_CREATED',
        entityType: 'users',
        entityId: createdUser.id,
        ip: req.ip,
        details: {
          roleCode: d.roleCode,
          permissionFlags: validFlags,
          additionalAuthorizationReason: d.additionalAuthorizationReason || null,
        },
      });

      res.status(201).json({ user: createdUser, roleCode: d.roleCode, permissions: validFlags });
    } catch (err) {
      console.error('Create sub-admin error:', err);
      res.status(500).json({ error: 'Unable to create sub-admin account.' });
    }
  }
);

// Update User Role & Granular Permission Mapping (with Permission Preview enforcement)
adminRouter.put(
  '/users/:userId/permissions',
  requireRole('SUPER_ADMIN'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      const targetUserId = String(req.params.userId);
      const schema = z.object({
        assignRoleCode: z.string().optional().nullable(),
        removeAdminRoles: z.boolean().optional(),
        permissionFlags: z.array(z.string()).default([]),
        additionalAuthorizationReason: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid permission mapping payload.' });
      }
      const d = parsed.data;

      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser) return res.status(404).json({ error: 'Target user not found.' });

      const currentRoleLinks = await db
        .select({ roleId: roles.id, roleCode: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, targetUserId));
      const existingRoles = currentRoleLinks.map((l) => l.roleCode as RoleCode);

      if (targetUserId === req.authUser!.userId && d.removeAdminRoles) {
        return res.status(403).json({
          error: 'Safety guard: you cannot strip your own active Super Admin governance role.',
        });
      }

      const validFlags = d.permissionFlags.filter((f): f is SubAdminPermissionFlag =>
        SUB_ADMIN_PERMISSION_FLAGS.some((sf) => sf.code === f)
      );

      const preview = buildPermissionPreview({
        existingRoles,
        newRoleCode: (d.assignRoleCode || null) as RoleCode | null,
        selectedFlags: validFlags,
      });

      if (preview.conflicts.length > 0) {
        return res.status(400).json({ error: preview.conflicts.join(' ') });
      }
      if (
        preview.requiresAdditionalAuthorization &&
        (!d.additionalAuthorizationReason || d.additionalAuthorizationReason.trim().length < 10)
      ) {
        return res.status(400).json({
          error: 'Rule #10 Additional Authorisation Required: Critical role or financial/safeguarding/HR permission changes require a documented justification (min 10 chars).',
        });
      }

      await db.transaction(async (tx) => {
        if (d.removeAdminRoles) {
          const adminRoleIds = currentRoleLinks
            .filter((l) => ADMIN_ACCESS_ROLE_CODES.includes(l.roleCode as RoleCode) && l.roleCode !== 'SUPER_ADMIN')
            .map((l) => l.roleId);
          if (adminRoleIds.length > 0) {
            await tx.delete(userRoles).where(inArray(userRoles.roleId, adminRoleIds));
          }
        }

        if (d.assignRoleCode) {
          const [rRow] = await tx.select().from(roles).where(eq(roles.code, d.assignRoleCode)).limit(1);
          if (rRow) {
            await tx
              .insert(userRoles)
              .values({
                userId: targetUserId,
                roleId: rRow.id,
                assignedBy: req.authUser!.userId,
                status: 'ACTIVE',
              })
              .onConflictDoNothing();
          }
        }

        await tx.delete(userPermissions).where(eq(userPermissions.userId, targetUserId));
        for (const flag of validFlags) {
          await tx.insert(userPermissions).values({
            userId: targetUserId,
            permissionCode: flag,
            grantedBy: req.authUser!.userId,
          });
        }
      });

      await writeAuditLog({
        actorUserId: req.authUser!.userId,
        actorRole: req.authUser!.activeRole,
        action: 'USER_PERMISSIONS_UPDATED',
        entityType: 'users',
        entityId: targetUserId,
        ip: req.ip,
        details: {
          assignRoleCode: d.assignRoleCode || null,
          permissionFlags: validFlags,
          isCriticalChange: preview.isCriticalChange,
          additionalAuthorizationReason: d.additionalAuthorizationReason || null,
        },
      });

      res.json({ updated: true, permissions: validFlags, preview });
    } catch (err) {
      console.error('Update permissions error:', err);
      res.status(500).json({ error: 'Unable to update user permissions.' });
    }
  }
);

adminRouter.post(
  '/users/:userId/manage',
  requireRole('SUPER_ADMIN'),
  requirePrivilegedMfa,
  async (req: AuthRequest, res) => {
    try {
      const userId = String(req.params.userId);
      const { approvalStatus, suspensionReason, assignRoleCode } = req.body as {
        approvalStatus?: string;
        suspensionReason?: string;
        assignRoleCode?: string;
      };

      if (userId === req.authUser!.userId && approvalStatus === 'SUSPENDED') {
        return res.status(403).json({ error: 'Safety guard: an administrator cannot suspend their own account.' });
      }

      if (assignRoleCode && ADMIN_ACCESS_ROLE_CODES.includes(assignRoleCode as RoleCode)) {
        // Check Rule #10: Critical role assignments require permission mapping endpoint or justification
        const preview = buildPermissionPreview({
          existingRoles: [],
          newRoleCode: assignRoleCode as RoleCode,
          selectedFlags: [],
        });
        if (preview.conflicts.length > 0) {
          return res.status(400).json({ error: preview.conflicts.join(' ') });
        }
      }

      if (approvalStatus) {
        await withDbRetry(() =>
          db
            .update(users)
            .set({
              approvalStatus,
              suspensionReason: approvalStatus === 'SUSPENDED' ? suspensionReason || 'Admin review' : null,
            })
            .where(eq(users.id, userId))
        );
      }

      if (assignRoleCode) {
        const [roleRow] = await withDbRetry(() =>
          db.select().from(roles).where(eq(roles.code, assignRoleCode)).limit(1)
        );
        if (roleRow) {
          await withDbRetry(() =>
            db
              .insert(userRoles)
              .values({
                userId,
                roleId: roleRow.id,
                assignedBy: req.authUser!.userId,
                status: 'ACTIVE',
              })
              .onConflictDoNothing()
          );
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
    } catch (err) {
      console.error('Admin user manage error:', err);
      res.status(isTransientDbError(err) ? 503 : 500).json({ error: 'Unable to update user account.' });
    }
  }
);

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
        '-- Target: PostgreSQL 15+ (localhost restore: psql -v ON_ERROR_STOP=1 -d humanity_connect -f humanity-connect-postgres-dump.sql)',
        '',
        'BEGIN;',
        'SET statement_timeout = 0;',
        "SET client_encoding = 'UTF8';",
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
        const dataRes = await pool.query(dumpDataSelect(tableName, cols));
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
