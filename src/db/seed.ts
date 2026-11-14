import { eq, sql } from 'drizzle-orm';
import { db, pool, withDbRetry } from './index.ts';
import {
  roles,
  permissions,
  rolePermissions,
  needsCategories,
  humanitarianFunds,
  communityProjects,
  users,
  userRoles,
  beneficiaryProfiles,
  beneficiaryStories,
  needRequests,
  priorityAssessments,
  verificationCases,
  consentRecords,
  organisations,
  empowermentMilestones,
  matchingEngineConfig,
  staffPositions,
} from './schema.ts';
import { encryptSensitiveText, hashPassword, verifyPassword } from '../lib/crypto.ts';
import { STAFF_ESTABLISHMENT_170 } from '../data/staffEstablishment.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureReferenceDataSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function ensureCoreAuthSchema(): Promise<void> {
  await withDbRetry(() =>
    pool.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS "public"."users" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "firebase_uid" text UNIQUE,
        "email" text NOT NULL UNIQUE,
        "full_name" text NOT NULL,
        "phone_e164" text UNIQUE,
        "password_hash" text,
        "country_code" text DEFAULT 'KE' NOT NULL,
        "preferred_language" text DEFAULT 'en' NOT NULL,
        "email_verified_at" timestamptz,
        "phone_verified_at" timestamptz,
        "mfa_enabled" boolean DEFAULT false NOT NULL,
        "mfa_secret_enc" text,
        "approval_status" text DEFAULT 'ACTIVE' NOT NULL,
        "suspension_reason" text,
        "failed_login_attempts" integer DEFAULT 0 NOT NULL,
        "locked_until" timestamptz,
        "last_login_at" timestamptz,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      );
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "locked_until" timestamptz;
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamptz;
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "mfa_secret_enc" text;
      ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "suspension_reason" text;

      CREATE TABLE IF NOT EXISTS "public"."roles" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "code" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "is_beneficiary_role" boolean DEFAULT false NOT NULL,
        "is_privileged" boolean DEFAULT false NOT NULL,
        "requires_mfa" boolean DEFAULT false NOT NULL,
        "self_assignable" boolean DEFAULT true NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "public"."permissions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "code" text NOT NULL UNIQUE,
        "module" text NOT NULL,
        "description" text NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "role_id" uuid NOT NULL REFERENCES "public"."roles"("id") ON DELETE CASCADE,
        "permission_id" uuid NOT NULL REFERENCES "public"."permissions"("id") ON DELETE CASCADE,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_role_permission ON public.role_permissions USING btree (role_id, permission_id);

      CREATE TABLE IF NOT EXISTS "public"."user_roles" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
        "role_id" uuid NOT NULL REFERENCES "public"."roles"("id") ON DELETE CASCADE,
        "assigned_by" uuid REFERENCES "public"."users"("id"),
        "status" text DEFAULT 'ACTIVE' NOT NULL,
        "assigned_at" timestamptz DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role ON public.user_roles USING btree (user_id, role_id);

      CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
        "permission_code" text NOT NULL,
        "granted_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permission_flag ON public.user_permissions USING btree (user_id, permission_code);

      CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
        "token_hash" text NOT NULL UNIQUE,
        "device_label" text NOT NULL,
        "user_agent" text,
        "ip_hash" text,
        "active_role_code" text NOT NULL,
        "mfa_verified_at" timestamptz,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "last_seen_at" timestamptz DEFAULT now() NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions USING btree (user_id, expires_at);

      CREATE TABLE IF NOT EXISTS "public"."verification_tokens" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "user_id" uuid REFERENCES "public"."users"("id") ON DELETE CASCADE,
        "channel" text NOT NULL,
        "target" text NOT NULL,
        "code_hash" text NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        "actor_user_id" uuid REFERENCES "public"."users"("id"),
        "actor_role" text NOT NULL,
        "action" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" text,
        "ip_hash" text,
        "details_json" jsonb,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );
    `)
  );
}

export async function ensureSeededSuperAdmin(): Promise<void> {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'gadmoz@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Jayden@Arabella123';

  let [superAdminRole] = await withDbRetry(() =>
    db
      .select()
      .from(roles)
      .where(eq(roles.code, 'SUPER_ADMIN'))
      .limit(1)
  );
  if (!superAdminRole) {
    const [insertedRole] = await withDbRetry(() =>
      db
        .insert(roles)
        .values({
          code: 'SUPER_ADMIN',
          name: 'Super Admin',
          description: 'Platform governance, verification approval, safeguarding oversight, and financial authority.',
          isBeneficiaryRole: false,
          isPrivileged: true,
          requiresMfa: true,
          selfAssignable: false,
        })
        .onConflictDoNothing({ target: roles.code })
        .returning()
    );
    superAdminRole =
      insertedRole ||
      (await withDbRetry(() =>
        db.select().from(roles).where(eq(roles.code, 'SUPER_ADMIN')).limit(1)
      ))[0];
  }
  if (!superAdminRole) return;

  const [existing] = await withDbRetry(() =>
    db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1)
  );

  let adminUserId: string;
  if (!existing) {
    const passwordHash = await hashPassword(adminPassword);
    const [created] = await withDbRetry(() =>
      db
        .insert(users)
        .values({
          email: adminEmail,
          fullName: 'Super Admin',
          passwordHash,
          countryCode: 'KE',
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          approvalStatus: 'ACTIVE',
        })
        .returning()
    );
    adminUserId = created.id;
  } else {
    adminUserId = existing.id;
    const passwordMatches = existing.passwordHash
      ? await verifyPassword(adminPassword, existing.passwordHash).catch(() => false)
      : false;
    if (!passwordMatches || existing.approvalStatus !== 'ACTIVE' || existing.failedLoginAttempts > 0 || existing.lockedUntil) {
      const nextHash = passwordMatches && existing.passwordHash
        ? existing.passwordHash
        : await hashPassword(adminPassword);
      await withDbRetry(() =>
        db
          .update(users)
          .set({
            passwordHash: nextHash,
            approvalStatus: 'ACTIVE',
            failedLoginAttempts: 0,
            lockedUntil: null,
            emailVerifiedAt: existing.emailVerifiedAt || new Date(),
            phoneVerifiedAt: existing.phoneVerifiedAt || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
      );
    }
  }

  await withDbRetry(() =>
    db
      .insert(userRoles)
      .values({
        userId: adminUserId,
        roleId: superAdminRole.id,
        assignedBy: adminUserId,
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: [userRoles.userId, userRoles.roleId],
        set: { status: 'ACTIVE' },
      })
  );
}

async function runSeed(): Promise<void> {
  // Fast-path check: skip 180+ redundant seed round-trips when reference data is already seeded
  const fastCheck = await withDbRetry(
    () =>
      pool.query<{
        roles_count: number;
        perms_count: number;
        cats_count: number;
        staff_count: number;
        has_sessions: boolean;
        has_user_perms: boolean;
      }>(`
        SELECT
          (SELECT count(*)::int FROM roles) AS roles_count,
          (SELECT count(*)::int FROM permissions) AS perms_count,
          (SELECT count(*)::int FROM needs_categories) AS cats_count,
          (SELECT count(*)::int FROM staff_positions) AS staff_count,
          (to_regclass('public.user_sessions') IS NOT NULL) AS has_sessions,
          (to_regclass('public.user_permissions') IS NOT NULL) AS has_user_perms
      `),
    2
  ).catch(() => null);

  if (!fastCheck?.rows?.[0] || !fastCheck.rows[0].has_sessions || !fastCheck.rows[0].has_user_perms) {
    await ensureCoreAuthSchema().catch((schemaErr) => {
      console.warn('Core auth schema check warning:', schemaErr);
    });
  }

  if (
    fastCheck?.rows?.[0] &&
    fastCheck.rows[0].roles_count >= 15 &&
    fastCheck.rows[0].perms_count >= 22 &&
    fastCheck.rows[0].cats_count >= 15 &&
    fastCheck.rows[0].staff_count >= STAFF_ESTABLISHMENT_170.length
  ) {
    await ensureSeededSuperAdmin();
    return;
  }

  // 1. Roles
  const roleSeeds = [
    {
      code: 'ORPHAN_GUARDIAN',
      name: 'Orphan / Guardian',
      description: 'Guardian or organisation representing an orphaned child or child-headed household.',
      isBeneficiaryRole: true,
      isPrivileged: false,
      requiresMfa: false,
      selfAssignable: true,
    },
    {
      code: 'DESTITUTE',
      name: 'Destitute',
      description: 'Individual or household facing acute displacement or severe deprivation.',
      isBeneficiaryRole: true,
      isPrivileged: false,
      requiresMfa: false,
      selfAssignable: true,
    },
    {
      code: 'NEEDY',
      name: 'Needy',
      description: 'Vulnerable household seeking medical, rent, education, or livelihood empowerment support.',
      isBeneficiaryRole: true,
      isPrivileged: false,
      requiresMfa: false,
      selfAssignable: true,
    },
    {
      code: 'SUPPORTIVE',
      name: 'Supportive',
      description: 'Individual sponsor, donor, or community volunteer supporting verified needs.',
      isBeneficiaryRole: false,
      isPrivileged: false,
      requiresMfa: false,
      selfAssignable: true,
    },
    {
      code: 'WELL_WISHER',
      name: 'Well Wisher',
      description: 'Philanthropist, corporate partner, foundation, or humanitarian institution.',
      isBeneficiaryRole: false,
      isPrivileged: false,
      requiresMfa: false,
      selfAssignable: true,
    },
    {
      code: 'FIELD_OFFICER',
      name: 'Field Officer',
      description: 'Authorised regional verification and community field visit specialist.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'VERIFICATION_OFFICER',
      name: 'Verification Officer',
      description: 'Authorised to verify accounts and recommend need approvals (cannot release funds).',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'WELFARE_OFFICER',
      name: 'Social Welfare Officer',
      description: 'Authorised welfare officer managing household follow-ups and family support.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'COUNTY_REPRESENTATIVE',
      name: 'County Representative',
      description: 'Authorised county coordinator restricted to assigned county geography.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'DATA_MANAGEMENT_OFFICER',
      name: 'Data Management Officer',
      description: 'Authorised M&E and data quality officer managing integrity & audit exports.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'FINANCE_OFFICER',
      name: 'Finance & Accounts Officer',
      description: 'Authorised to process verified payments (cannot self-approve own transactions).',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'HR_OFFICER',
      name: 'HR Officer',
      description: 'Authorised to manage staff records, JDs, and recruitment (excluded from unrelated safeguarding).',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'SAFEGUARDING_OFFICER',
      name: 'Safeguarding Officer',
      description: 'Protected independent access to sensitive safeguarding & child protection cases.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'AUDITOR',
      name: 'Independent Auditor',
      description: 'Independent read-only audit & compliance review access across ledgers and logs.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
    {
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Platform governance, verification approval, safeguarding oversight, and financial authority.',
      isBeneficiaryRole: false,
      isPrivileged: true,
      requiresMfa: true,
      selfAssignable: false,
    },
  ];

  for (const r of roleSeeds) {
    await db.insert(roles).values(r).onConflictDoNothing({ target: roles.code });
  }

  // 2. Permissions
  const permSeeds = [
    { code: 'beneficiary:own_read', module: 'beneficiary', description: 'Read own beneficiary profile and needs' },
    { code: 'beneficiary:own_write', module: 'beneficiary', description: 'Update own profile, needs, consent, and documents' },
    { code: 'supporter:browse_public', module: 'supporter', description: 'Browse verified public beneficiary cases' },
    { code: 'supporter:donate', module: 'supporter', description: 'Initiate sponsorships, donations, and recurring plans' },
    { code: 'corporate:csr_manage', module: 'corporate', description: 'Manage Well Wisher CSR pools and impact reports' },
    { code: 'verification:review', module: 'verification', description: 'Review verification cases and record field visits' },
    { code: 'verification:decide', module: 'verification', description: 'Approve, reassess, reject, or suspend verification cases' },
    { code: 'needs:human_approve', module: 'needs', description: 'Assign final human-approved P1-P5 tier and approved amount' },
    { code: 'safeguarding:manage', module: 'safeguarding', description: 'Review and resolve safeguarding incidents' },
    { code: 'finance:disburse', module: 'finance', description: 'Approve fund allocations and verified disbursements' },
    { code: 'admin:rbac_manage', module: 'admin', description: 'Assign roles, manage permissions, and suspend accounts' },
    { code: 'hr:manage', module: 'hr', description: 'Manage staff establishment, JDs, recruitment, and profiles' },
    { code: 'audit:read', module: 'audit', description: 'Independent read-only audit and compliance inspection' },
    { code: 'ai:assist', module: 'ai', description: 'Use server-side Gemini humanitarian assistance tools' },
    { code: 'canVerifyNeed', module: 'rbac', description: 'Granular flag: Assess and recommend beneficiary needs' },
    { code: 'canVerifyUsers', module: 'rbac', description: 'Granular flag: Verify beneficiary & user accounts' },
    { code: 'canDisburseFunds', module: 'rbac', description: 'Granular flag: Process authorised fund disbursements' },
    { code: 'canManageFinanceAccounts', module: 'rbac', description: 'Granular flag: Manage trust fund pools and reconciliations' },
    { code: 'canManageSafeguarding', module: 'rbac', description: 'Granular flag: Manage protected safeguarding cases' },
    { code: 'canManageCountyOps', module: 'rbac', description: 'Granular flag: Coordinate assigned county field operations' },
    { code: 'canManageData', module: 'rbac', description: 'Granular flag: Manage data quality, M&E, and analytics' },
    { code: 'canManageHR', module: 'rbac', description: 'Granular flag: Manage HR staff records, JDs, and recruitment' },
  ];

  for (const p of permSeeds) {
    await db.insert(permissions).values(p).onConflictDoNothing({ target: permissions.code });
  }

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  const roleMap = new Map(allRoles.map((r) => [r.code, r.id]));
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]));

  const grantMatrix: Record<string, string[]> = {
    ORPHAN_GUARDIAN: ['beneficiary:own_read', 'beneficiary:own_write', 'ai:assist'],
    DESTITUTE: ['beneficiary:own_read', 'beneficiary:own_write', 'ai:assist'],
    NEEDY: ['beneficiary:own_read', 'beneficiary:own_write', 'ai:assist'],
    SUPPORTIVE: ['supporter:browse_public', 'supporter:donate', 'ai:assist'],
    WELL_WISHER: ['supporter:browse_public', 'supporter:donate', 'corporate:csr_manage', 'ai:assist'],
    FIELD_OFFICER: ['verification:review', 'canManageCountyOps', 'ai:assist'],
    VERIFICATION_OFFICER: ['verification:review', 'verification:decide', 'needs:human_approve', 'canVerifyUsers', 'canVerifyNeed', 'ai:assist'],
    WELFARE_OFFICER: ['verification:review', 'needs:human_approve', 'safeguarding:manage', 'canVerifyNeed', 'ai:assist'],
    COUNTY_REPRESENTATIVE: ['verification:review', 'canManageCountyOps', 'canVerifyUsers', 'ai:assist'],
    DATA_MANAGEMENT_OFFICER: ['audit:read', 'canManageData', 'ai:assist'],
    FINANCE_OFFICER: ['finance:disburse', 'canDisburseFunds', 'canManageFinanceAccounts', 'ai:assist'],
    HR_OFFICER: ['hr:manage', 'canManageHR', 'ai:assist'],
    SAFEGUARDING_OFFICER: ['safeguarding:manage', 'canManageSafeguarding', 'audit:read', 'ai:assist'],
    AUDITOR: ['audit:read', 'canManageData'],
    SUPER_ADMIN: allPerms.map((p) => p.code),
  };

  for (const [roleCode, permCodes] of Object.entries(grantMatrix)) {
    const rId = roleMap.get(roleCode);
    if (!rId) continue;
    for (const pCode of permCodes) {
      const pId = permMap.get(pCode);
      if (!pId) continue;
      await db
        .insert(rolePermissions)
        .values({ roleId: rId, permissionId: pId })
        .onConflictDoNothing();
    }
  }

  // Ensure configured Super Admin account is seeded with active SUPER_ADMIN role
  await ensureSeededSuperAdmin();

  // 3. 15 Needs Categories
  const categorySeeds = [
    { code: 'FOOD', name: 'Food', description: 'Emergency food rations, nutrition packs, and school feeding.', defaultPriorityWeight: 25 },
    { code: 'SHELTER', name: 'Shelter', description: 'Safe housing repairs, transitional shelter, and bedding.', defaultPriorityWeight: 24 },
    { code: 'RENT', name: 'Rent', description: 'Urgent household rent arrears prevention and tenancy stability.', defaultPriorityWeight: 20 },
    { code: 'EDUCATION', name: 'Education', description: 'School fees, uniforms, exam levies, and learning textbooks.', defaultPriorityWeight: 18 },
    { code: 'MEDICAL', name: 'Medical', description: 'Hospital bills, NHIF/SHA coverage, chronic medication, and diagnostics.', defaultPriorityWeight: 26 },
    { code: 'FAMILY_WELFARE', name: 'Family welfare', description: 'Essential childcare, guardian stipends, and household protection.', defaultPriorityWeight: 21 },
    { code: 'DISABILITY', name: 'Disability', description: 'Assistive devices, mobility aids, therapy, and accessible adaptations.', defaultPriorityWeight: 23 },
    { code: 'EMPLOYMENT', name: 'Employment', description: 'Vocational certification, tools of trade, and job placement.', defaultPriorityWeight: 14 },
    { code: 'BUSINESS_EMPOWERMENT', name: 'Business empowerment', description: 'Micro-enterprise seed stock, sewing machines, and market kiosks.', defaultPriorityWeight: 14 },
    { code: 'AGRICULTURE', name: 'Agriculture', description: 'Drought-resilient seeds, drip irrigation kits, and poultry starter sets.', defaultPriorityWeight: 15 },
    { code: 'EMERGENCY', name: 'Emergency', description: 'Flood, fire, drought, or sudden household crisis response.', defaultPriorityWeight: 28 },
    { code: 'BEREAVEMENT', name: 'Bereavement', description: 'Dignified funeral assistance and immediate widow/orphan transition.', defaultPriorityWeight: 22 },
    { code: 'DIGITAL_INCLUSION', name: 'Digital inclusion', description: 'Refurbished laptops, connectivity bundles, and youth digital literacy.', defaultPriorityWeight: 12 },
    { code: 'LEGAL_ASSISTANCE', name: 'Legal assistance', description: 'Birth registration, succession documentation, and child protection legal aid.', defaultPriorityWeight: 19 },
    { code: 'COMMUNITY_DEVELOPMENT', name: 'Community development', description: 'Clean water kiosks, solar micro-grids, and shared learning centres.', defaultPriorityWeight: 16 },
  ];

  for (const c of categorySeeds) {
    await db.insert(needsCategories).values(c).onConflictDoNothing({ target: needsCategories.code });
  }

  // 3b. Default Transparent Matching Engine Configuration
  await db
    .insert(matchingEngineConfig)
    .values({
      configKey: 'DEFAULT',
      algorithmName: 'Humanity Connect Dynamic Impact Matcher',
      weightNeedAlignment: 30,
      weightLocationFocus: 20,
      weightBudgetFit: 20,
      weightUrgencyImpact: 20,
      weightAgeDemographics: 10,
      prioritiseUnderfundedPct: 60,
      minThresholdScore: 35,
      enableGeminiAnalysis: true,
      requireHumanSafeguardGate: true,
      transparencyNotes:
        'Scores combine deterministic weighted criteria (Need 30%, Location 20%, Budget 20%, Urgency & Gap 20%, Age & Challenges 10%) with bounded Gemini AI contextual analysis. Only V4-verified, safeguarding-cleared cases are eligible.',
    })
    .onConflictDoNothing({ target: matchingEngineConfig.configKey });

  // 4. Organisations, Central Humanitarian Funds & Community Projects
  const existingFunds = await db.select().from(humanitarianFunds).limit(1);
  if (existingFunds.length === 0) {
    const [partnerOrg] = await db
      .insert(organisations)
      .values({
        name: 'Rift Valley & Lake Basin Humanitarian Alliance',
        orgType: 'HUMANITARIAN_NGO',
        registrationNumber: 'NGO-KE-2021-88412',
        countryCode: 'KE',
        county: 'Nakuru',
        contactEmail: 'partnerships@rvlha.or.ke',
        verificationStatus: 'VERIFIED',
      })
      .returning();

    const [reliefFund] = await db
      .insert(humanitarianFunds)
      .values({
        code: 'HF-KE-RELIEF',
        name: 'Kenya Central Emergency & Food Relief Fund',
        fundType: 'CENTRAL_RELIEF',
        organisationId: partnerOrg.id,
        countryCode: 'KE',
        currency: 'KES',
        availableBalanceMinor: 0,
        totalReceivedMinor: 0,
        totalDisbursedMinor: 0,
        description:
          'Centrally governed relief pool addressing P1 Critical food, shelter, and flood/drought emergencies across Kenyan counties.',
      })
      .returning();

    const [eduFund] = await db
      .insert(humanitarianFunds)
      .values({
        code: 'HF-KE-EDU',
        name: 'Orphan Education & School Continuity Fund',
        fundType: 'EDUCATION',
        organisationId: partnerOrg.id,
        countryCode: 'KE',
        currency: 'KES',
        availableBalanceMinor: 0,
        totalReceivedMinor: 0,
        totalDisbursedMinor: 0,
        description:
          'Direct school fee paybill disbursements for verified orphaned learners and child-headed households.',
      })
      .returning();

    const [empFund] = await db
      .insert(humanitarianFunds)
      .values({
        code: 'HF-KE-EMP',
        name: 'Household Self-Reliance & Empowerment Pool',
        fundType: 'EMPOWERMENT',
        organisationId: partnerOrg.id,
        countryCode: 'KE',
        currency: 'KES',
        availableBalanceMinor: 0,
        totalReceivedMinor: 0,
        totalDisbursedMinor: 0,
        description:
          'Vocational tools, women cooperative equipment, and micro-enterprise starter grants moving families from aid to resilience.',
      })
      .returning();

    await db.insert(humanitarianFunds).values({
      code: 'HF-KE-MED',
      name: 'Urgent Medical & Disability Care Fund',
      fundType: 'MEDICAL',
      organisationId: partnerOrg.id,
      countryCode: 'KE',
      currency: 'KES',
      availableBalanceMinor: 0,
      totalReceivedMinor: 0,
      totalDisbursedMinor: 0,
      description:
        'Verified hospital bill settlements, assistive mobility devices, and maternal/paediatric specialist care.',
    });

    await db.insert(communityProjects).values([
      {
        fundId: reliefFund.id,
        title: 'Namelok Solar Clean Water Kiosk — Kajiado South',
        county: 'Kajiado',
        countryCode: 'KE',
        summary:
          'Solar-powered borehole pump and 4-tap community water kiosk serving 420 pastoralist and smallholder households.',
        coverImagePath: '/src/assets/images/project_water_borehole_1794511020591.jpg',
        targetAmountMinor: 185000000,
        raisedAmountMinor: 0,
        currency: 'KES',
        beneficiariesImpacted: 420,
        status: 'ACTIVE',
      },
      {
        fundId: empFund.id,
        title: 'Kisumu Women Tailoring & Agribusiness Cooperative',
        county: 'Kisumu',
        countryCode: 'KE',
        summary:
          'Equipping 35 single mothers and needy household heads with industrial sewing machines and market linkages.',
        coverImagePath: '/src/assets/images/project_women_enterprise_1794511021044.jpg',
        targetAmountMinor: 120000000,
        raisedAmountMinor: 0,
        currency: 'KES',
        beneficiariesImpacted: 145,
        status: 'ACTIVE',
      },
      {
        fundId: eduFund.id,
        title: 'Nairobi Youth Digital & Bookkeeping Empowerment Hub',
        county: 'Nairobi',
        countryCode: 'KE',
        summary:
          'Workstations, digital literacy training, and financial bookkeeping mentorship for urban vulnerable youth.',
        coverImagePath: '/src/assets/images/empowerment_digital_hub_1794511021778.jpg',
        targetAmountMinor: 95000000,
        raisedAmountMinor: 0,
        currency: 'KES',
        beneficiariesImpacted: 180,
        status: 'ACTIVE',
      },
    ]);
  }

  // 5. Verified Public Beneficiary Showcase Profiles (Strict verification + safeguarding + consent)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(beneficiaryProfiles);

  if (count === 0) {
    const allCategories = await db.select().from(needsCategories);
    const catMap = new Map(allCategories.map((c) => [c.code, c.id]));

    const showcaseUsers = [
      {
        email: 'guardian.nakuru.showcase@humanityconnect.org',
        fullName: 'Grace W. (Verified Aunt & Guardian)',
        countryCode: 'KE',
        referenceCode: 'HC-KE-2026-0104',
        classification: 'ORPHAN_GUARDIAN',
        displayAlias: 'Nakuru Guardian Household #0104',
        county: 'Nakuru',
        subCounty: 'Naivasha',
        ward: 'Viwandani',
        isMinorCase: true,
        guardianOrgName: 'Naivasha Child Welfare Office',
        ageGroup: 'CHILDREN_5_17',
        specificChallenges: [
          'Double bereavement / orphaned siblings',
          'Secondary & primary tuition continuity',
          'School lunch nutrition support',
        ],
        vulnerabilitySummary:
          'Verified grandmother and aunt caring for three orphaned school-going children following bereavement. Minor identities protected via guardian proxy.',
        monthlyNeedTargetMinor: 850000,
        storyTitle: 'Keeping Three Siblings in Secondary & Primary School in Nakuru',
        storySummary:
          'After losing both parents in 2024, Aunt Grace stepped in as verified legal guardian. Verified school continuity support keeps all three learners enrolled.',
        storyImage: '/src/assets/images/story_education_scholarship_1794511021357.jpg',
        needCategory: 'EDUCATION',
        needRef: 'HC-NEED-2026-4011',
        needTitle: 'Annual Secondary & Primary School Fees and Learning Pack',
        needDesc:
          'Covers Term 1–3 tuition balance paid directly to the school paybill, textbooks, and nutritious school lunches for three dependents.',
        needAmount: 4200000,
        priorityTier: 'P2_URGENT',
        score: 84,
      },
      {
        email: 'household.kisumu.showcase@humanityconnect.org',
        fullName: 'Beatrice O. (Artisan Household Head)',
        countryCode: 'KE',
        referenceCode: 'HC-KE-2026-0112',
        classification: 'NEEDY',
        displayAlias: 'Kisumu Tailoring Household #0112',
        county: 'Kisumu',
        subCounty: 'Kisumu Central',
        ward: 'Kondele',
        isMinorCase: false,
        guardianOrgName: null,
        ageGroup: 'ADULT_26_59',
        specificChallenges: [
          'Single-parent flood displacement recovery',
          'Micro-enterprise equipment gap',
          'Transitional household rent stability',
        ],
        vulnerabilitySummary:
          'Single mother of two recovering from flood displacement; enrolled in the Kisumu Women Tailoring Cooperative empowerment pathway.',
        monthlyNeedTargetMinor: 650000,
        storyTitle: 'Rebuilding Livelihood Through Tailoring & Rent Stability in Kisumu',
        storySummary:
          'With verified empowerment equipment and two months of transitional rent cover, Beatrice is scaling orders for local school uniforms.',
        storyImage: '/src/assets/images/project_women_enterprise_1794511021044.jpg',
        needCategory: 'BUSINESS_EMPOWERMENT',
        needRef: 'HC-NEED-2026-4018',
        needTitle: 'Overlock Sewing Machine & Fabric Starter Stock',
        needDesc:
          'Enables full cooperative participation to generate sustainable household income for food and rent independence.',
        needAmount: 3500000,
        priorityTier: 'P3_HIGH',
        score: 72,
      },
      {
        email: 'relief.kilifi.showcase@humanityconnect.org',
        fullName: 'Mzee Juma K. (Elderly Household Steward)',
        countryCode: 'KE',
        referenceCode: 'HC-KE-2026-0119',
        classification: 'DESTITUTE',
        displayAlias: 'Kilifi Coastal Household #0119',
        county: 'Kilifi',
        subCounty: 'Malindi',
        ward: 'Ganda',
        isMinorCase: false,
        guardianOrgName: null,
        ageGroup: 'ELDERLY_60_PLUS',
        specificChallenges: [
          'Elderly caregiver household with 2 dependents',
          'Coastal flood structural roof damage',
          'Clean drinking water & dry ration shortage',
        ],
        vulnerabilitySummary:
          'Elderly household recovering after severe coastal flooding damaged mud-walled shelter and clean water storage.',
        monthlyNeedTargetMinor: 750000,
        storyTitle: 'Safe Weather-Resilient Shelter & Clean Water Access in Kilifi',
        storySummary:
          'Field officers verified urgent roof rehabilitation and solar clean water access for an elderly couple caring for two dependents.',
        storyImage: '/src/assets/images/project_water_borehole_1794511020591.jpg',
        needCategory: 'SHELTER',
        needRef: 'HC-NEED-2026-4025',
        needTitle: 'Weather-Resilient Iron Sheet Roofing & Emergency Food Pack',
        needDesc:
          'Urgent structural roofing materials, treated timber, and 60-day dry food nutrition allocation.',
        needAmount: 5800000,
        priorityTier: 'P1_CRITICAL',
        score: 92,
      },
    ];

    for (const item of showcaseUsers) {
      const [u] = await db
        .insert(users)
        .values({
          email: item.email,
          fullName: item.fullName,
          countryCode: item.countryCode,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          approvalStatus: 'ACTIVE',
        })
        .onConflictDoNothing()
        .returning();
      if (!u) continue;

      const roleId = roleMap.get(item.classification);
      if (roleId) {
        await db.insert(userRoles).values({ userId: u.id, roleId, status: 'ACTIVE' }).onConflictDoNothing();
      }

      const [bp] = await db
        .insert(beneficiaryProfiles)
        .values({
          userId: u.id,
          referenceCode: item.referenceCode,
          classification: item.classification,
          displayAlias: item.displayAlias,
          countryCode: item.countryCode,
          county: item.county,
          subCounty: item.subCounty,
          ward: item.ward,
          landmarkHintEnc: encryptSensitiveText('Protected field GPS verified by county officer'),
          guardianOrgName: item.guardianOrgName,
          isMinorCase: item.isMinorCase,
          vulnerabilitySummary: item.vulnerabilitySummary,
          verificationLevel: 'V4',
          verificationStatus: 'VERIFIED',
          safeguardingCleared: true,
          publicListingApproved: true,
          monthlyNeedTargetMinor: item.monthlyNeedTargetMinor,
          currency: 'KES',
          ageGroup: item.ageGroup,
          specificChallenges: item.specificChallenges,
        })
        .returning();

      await db.insert(consentRecords).values([
        {
          beneficiaryId: bp.id,
          grantedByUserId: u.id,
          consentScope: 'DATA_PROCESSING',
          granted: true,
        },
        {
          beneficiaryId: bp.id,
          grantedByUserId: u.id,
          consentScope: 'PUBLIC_STORY',
          granted: true,
        },
      ]);

      await db.insert(beneficiaryStories).values({
        beneficiaryId: bp.id,
        title: item.storyTitle,
        summary: item.storySummary,
        narrative: item.storySummary,
        language: 'en',
        coverImagePath: item.storyImage,
        consentVerified: true,
        isPublished: true,
        publishedAt: new Date(),
      });

      const catId = catMap.get(item.needCategory) || allCategories[0].id;
      const [nr] = await db
        .insert(needRequests)
        .values({
          referenceCode: item.needRef,
          beneficiaryId: bp.id,
          categoryId: catId,
          title: item.needTitle,
          description: item.needDesc,
          supportingEvidenceNotes: 'Verified by county field officer with physical inspection.',
          targetAmountMinor: item.needAmount,
          approvedAmountMinor: item.needAmount,
          fulfilledAmountMinor: 0,
          currency: 'KES',
          deadlineAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
          isRecurring: item.classification === 'ORPHAN_GUARDIAN',
          frequency: item.classification === 'ORPHAN_GUARDIAN' ? 'TERMLY' : 'ONE_TIME',
          durationMonths: item.classification === 'ORPHAN_GUARDIAN' ? 12 : 1,
          priorityTier: item.priorityTier,
          urgencyLevel: item.priorityTier === 'P1_CRITICAL' ? 'CRITICAL' : 'HIGH',
          verificationStatus: 'HUMAN_APPROVED',
          status: 'VERIFIED',
          humanApprovedAt: new Date(),
        })
        .returning();

      await db.insert(priorityAssessments).values({
        needRequestId: nr.id,
        beneficiaryId: bp.id,
        assessedBy: u.id,
        vulnerabilityScore: Math.min(30, Math.round(item.score * 0.3)),
        urgencyScore: Math.min(25, Math.round(item.score * 0.25)),
        dependencyScore: Math.min(20, Math.round(item.score * 0.2)),
        safeguardingRiskScore: item.isMinorCase ? 14 : 11,
        empowermentPotentialScore: 8,
        compositePriority: item.score,
        aiAdvisoryTier: item.priorityTier,
        humanFinalTier: item.priorityTier,
        assessmentReasons: [
          'Physical county field verification completed (V4)',
          item.isMinorCase ? 'Minor case protected via verified guardian authority' : 'Household dependency verified',
        ],
        rationale: 'Human social welfare panel confirmed priority tier and approved funding pathway.',
        humanApproved: true,
      });

      await db.insert(verificationCases).values({
        caseNumber: `VC-${item.referenceCode}`,
        beneficiaryId: bp.id,
        officerWorkspace: 'VERIFICATION_OFFICER',
        verificationLevel: 'V4',
        stage: 'VERIFIED',
        fieldCounty: item.county,
        identityVerified: true,
        guardianVerified: true,
        householdVerified: true,
        needVerified: true,
        documentChecklistOk: true,
        fieldVisitVerified: true,
        fieldVisitDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        fieldVisitNotes: 'County social welfare visit confirmed household circumstances and safeguarding compliance.',
        safeguardingCleared: true,
        decisionNotes: 'V4 clearance granted by verification review panel.',
        decidedAt: new Date(),
      });

      await db.insert(empowermentMilestones).values({
        beneficiaryId: bp.id,
        pathwayName: 'Household Financial & Vocational Resilience',
        moduleTitle: 'Budgeting, M-Pesa Bookkeeping & Cooperative Readiness',
        completionPct: item.classification === 'NEEDY' ? 65 : 40,
        microGrantStatus: item.classification === 'NEEDY' ? 'APPROVED_PHASE_1' : 'ELIGIBLE_IN_TRAINING',
      });
    }
  } else {
    // Ensure existing showcase beneficiaries retain ageGroup and specificChallenges metadata
    const metadataPatches: Array<{
      ref: string;
      ageGroup: string;
      challenges: string[];
    }> = [
      {
        ref: 'HC-KE-2026-0104',
        ageGroup: 'CHILDREN_5_17',
        challenges: [
          'Double bereavement / orphaned siblings',
          'Secondary & primary tuition continuity',
          'School lunch nutrition support',
        ],
      },
      {
        ref: 'HC-KE-2026-0112',
        ageGroup: 'ADULT_26_59',
        challenges: [
          'Single-parent flood displacement recovery',
          'Micro-enterprise equipment gap',
          'Transitional household rent stability',
        ],
      },
      {
        ref: 'HC-KE-2026-0119',
        ageGroup: 'ELDERLY_60_PLUS',
        challenges: [
          'Elderly caregiver household with 2 dependents',
          'Coastal flood structural roof damage',
          'Clean drinking water & dry ration shortage',
        ],
      },
    ];
    for (const patch of metadataPatches) {
      try {
        await db
          .update(beneficiaryProfiles)
          .set({
            ageGroup: patch.ageGroup,
            specificChallenges: patch.challenges,
          })
          .where(eq(beneficiaryProfiles.referenceCode, patch.ref));
      } catch (patchErr) {
        console.warn('Non-fatal showcase metadata patch skipped:', patchErr);
      }
    }
  }

  // 6. Seed all 170 Approved Establishment Positions (zero fake employees or appointments)
  try {
    const [{ staffCount }] = await db
      .select({ staffCount: sql<number>`count(*)::int` })
      .from(staffPositions);
    if (staffCount < STAFF_ESTABLISHMENT_170.length) {
      for (const pos of STAFF_ESTABLISHMENT_170) {
        await db
          .insert(staffPositions)
          .values(pos)
          .onConflictDoNothing({ target: staffPositions.jobId });
      }
    }
  } catch (staffSeedErr) {
    console.warn('Non-fatal staff establishment seed skipped:', staffSeedErr);
  }
}
