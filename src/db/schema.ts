import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// 1. Users
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    firebaseUid: text('firebase_uid').unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    phoneE164: text('phone_e164').unique(),
    passwordHash: text('password_hash'),
    countryCode: text('country_code').notNull().default('KE'),
    preferredLanguage: text('preferred_language').notNull().default('en'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretEnc: text('mfa_secret_enc'),
    approvalStatus: text('approval_status').notNull().default('ACTIVE'),
    suspensionReason: text('suspension_reason'),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_users_country_status').on(t.countryCode, t.approvalStatus),
  ]
);

// 2. Roles
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isBeneficiaryRole: boolean('is_beneficiary_role').notNull().default(false),
  isPrivileged: boolean('is_privileged').notNull().default(false),
  requiresMfa: boolean('requires_mfa').notNull().default(false),
  selfAssignable: boolean('self_assignable').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Permissions
export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  module: text('module').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Role Permissions
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uq_role_permission').on(t.roleId, t.permissionId)]
);

// 5. User Roles (supports multiple authorized roles per user)
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    status: text('status').notNull().default('ACTIVE'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_user_role').on(t.userId, t.roleId),
    index('idx_user_roles_user').on(t.userId),
  ]
);

// 6. User Sessions (device & session management + MFA tracking)
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceLabel: text('device_label').notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    activeRoleCode: text('active_role_code').notNull(),
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_user_sessions_user').on(t.userId, t.expiresAt)]
);

// 7. Verification Tokens (Phone OTP, Email Verification, Password Reset, MFA Challenge)
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // EMAIL_VERIFY | PHONE_OTP | PASSWORD_RESET | MFA_CHALLENGE
    target: text('target').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_verif_tokens_target').on(t.channel, t.target)]
);

// 8. Beneficiary Profiles
export const beneficiaryProfiles = pgTable(
  'beneficiary_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    referenceCode: text('reference_code').notNull().unique(),
    classification: text('classification').notNull(), // ORPHAN_GUARDIAN | DESTITUTE | NEEDY
    displayAlias: text('display_alias').notNull(),
    countryCode: text('country_code').notNull().default('KE'),
    county: text('county').notNull(),
    subCounty: text('sub_county'),
    ward: text('ward'),
    landmarkHintEnc: text('landmark_hint_enc'),
    guardianOrgName: text('guardian_org_name'),
    isMinorCase: boolean('is_minor_case').notNull().default(false),
    vulnerabilitySummary: text('vulnerability_summary').notNull(),
    nationalIdHash: text('national_id_hash'),
    verificationLevel: text('verification_level').notNull().default('V0'), // V0 | V1 | V2 | V3 | V4
    verificationStatus: text('verification_status').notNull().default('INTAKE_SUBMITTED'),
    safeguardingCleared: boolean('safeguarding_cleared').notNull().default(false),
    publicListingApproved: boolean('public_listing_approved').notNull().default(false),
    assignedOfficerId: uuid('assigned_officer_id').references(() => users.id),
    monthlyNeedTargetMinor: integer('monthly_need_target_minor').notNull().default(650000),
    currency: text('currency').notNull().default('KES'),
    photoLimitOverrideReason: text('photo_limit_override_reason'),
    audioNarrationObjectKey: text('audio_narration_object_key'),
    audioTranscript: text('audio_transcript'),
    audioLanguage: text('audio_language').default('sw'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_beneficiary_public_gate').on(
      t.verificationStatus,
      t.safeguardingCleared,
      t.publicListingApproved
    ),
    index('idx_beneficiary_county').on(t.countryCode, t.county),
  ]
);

// 9. Household Members
export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    memberAlias: text('member_alias').notNull(),
    fullNameEnc: text('full_name_enc').notNull(),
    relationship: text('relationship').notNull(),
    ageYears: integer('age_years').notNull(),
    isMinor: boolean('is_minor').notNull().default(false),
    schoolingStatus: text('schooling_status'),
    healthNotesEnc: text('health_notes_enc'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_household_beneficiary').on(t.beneficiaryId)]
);

// 10. Guardian Relationships
export const guardianRelationships = pgTable(
  'guardian_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relationshipType: text('relationship_type').notNull(),
    legalDocVerified: boolean('legal_doc_verified').notNull().default(false),
    consentAuthority: boolean('consent_authority').notNull().default(true),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_guardian_beneficiary').on(t.beneficiaryId)]
);

// 11. Organisations (Companies, Charitable Institutions, Humanitarian NGOs)
export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  orgType: text('org_type').notNull(), // CORPORATE | CHARITY | HUMANITARIAN_NGO | FOUNDATION
  registrationNumber: text('registration_number'),
  countryCode: text('country_code').notNull().default('KE'),
  county: text('county').notNull().default('Nairobi'),
  contactEmail: text('contact_email').notNull(),
  verificationStatus: text('verification_status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 12. Supporter Profiles (Supportive & Well Wisher / Corporate)
export const supporterProfiles = pgTable('supporter_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  organisationId: uuid('organisation_id').references(() => organisations.id),
  supporterType: text('supporter_type').notNull().default('SUPPORTIVE'), // SUPPORTIVE | WELL_WISHER | CORPORATE
  displayName: text('display_name').notNull(),
  preferredCurrency: text('preferred_currency').notNull().default('KES'),
  anonymousGiving: boolean('anonymous_giving').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 13. Beneficiary Stories (Consent & Verification Gated)
export const beneficiaryStories = pgTable(
  'beneficiary_stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    narrative: text('narrative').notNull(),
    language: text('language').notNull().default('en'),
    coverImagePath: text('cover_image_path'),
    consentVerified: boolean('consent_verified').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),
    approvedBy: uuid('approved_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_stories_published').on(t.isPublished, t.consentVerified)]
);

// 14. Media Records (Private Encrypted Cloud Object Storage Metadata)
export const mediaRecords = pgTable(
  'media_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    beneficiaryId: uuid('beneficiary_id').references(() => beneficiaryProfiles.id, {
      onDelete: 'cascade',
    }),
    docCategory: text('doc_category').notNull(), // NATIONAL_ID | GUARDIAN_LETTER | SCHOOL_FEE_SLIP | MEDICAL_BILL | PUBLIC_STORY_IMAGE
    storageBucket: text('storage_bucket').notNull().default('hc-private-vault-ke'),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    accessScope: text('access_scope').notNull().default('PRIVATE_ENCRYPTED'), // PRIVATE_ENCRYPTED | PUBLIC_CONSENTED
    encryptionKeyRef: text('encryption_key_ref').notNull(),
    reviewStatus: text('review_status').notNull().default('PENDING_REVIEW'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_media_beneficiary').on(t.beneficiaryId, t.accessScope)]
);

// 15. Needs Categories
export const needsCategories = pgTable('needs_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  defaultPriorityWeight: integer('default_priority_weight').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 16. Need Requests
export const needRequests = pgTable(
  'need_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referenceCode: text('reference_code').notNull().unique(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => needsCategories.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    supportingEvidenceNotes: text('supporting_evidence_notes'),
    supportingMediaId: uuid('supporting_media_id').references(() => mediaRecords.id),
    targetAmountMinor: integer('target_amount_minor').notNull(),
    approvedAmountMinor: integer('approved_amount_minor'),
    fulfilledAmountMinor: integer('fulfilled_amount_minor').notNull().default(0),
    currency: text('currency').notNull().default('KES'),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    isRecurring: boolean('is_recurring').notNull().default(false),
    frequency: text('frequency').notNull().default('ONE_TIME'), // ONE_TIME | MONTHLY | TERMLY | QUARTERLY
    durationMonths: integer('duration_months').notNull().default(1),
    priorityTier: text('priority_tier').notNull().default('P3_HIGH'), // P1_CRITICAL | P2_URGENT | P3_HIGH | P4_MODERATE | P5_DEVELOPMENTAL
    urgencyLevel: text('urgency_level').notNull().default('HIGH'),
    verificationStatus: text('verification_status').notNull().default('PENDING_REVIEW'), // PENDING_REVIEW | UNDER_ASSESSMENT | HUMAN_APPROVED | CHANGES_REQUESTED | REJECTED_BY_HUMAN
    status: text('status').notNull().default('SUBMITTED'), // DRAFT | SUBMITTED | VERIFIED | FUNDING | FULFILLED
    humanApprovedBy: uuid('human_approved_by').references(() => users.id),
    humanApprovedAt: timestamp('human_approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_needs_status').on(t.status, t.priorityTier),
    check('chk_need_target_positive', sql`${t.targetAmountMinor} > 0`),
    check('chk_need_fulfilled_non_negative', sql`${t.fulfilledAmountMinor} >= 0`),
  ]
);

// 17. Priority Assessments (Adjustable 100-point model + mandatory human final approval)
export const priorityAssessments = pgTable(
  'priority_assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    needRequestId: uuid('need_request_id')
      .notNull()
      .references(() => needRequests.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    assessedBy: uuid('assessed_by')
      .notNull()
      .references(() => users.id),
    vulnerabilityScore: integer('vulnerability_score').notNull(), // 0-30
    urgencyScore: integer('urgency_score').notNull(), // 0-25
    dependencyScore: integer('dependency_score').notNull(), // 0-20
    safeguardingRiskScore: integer('safeguarding_risk_score').notNull().default(10), // 0-15
    empowermentPotentialScore: integer('empowerment_potential_score').notNull().default(5), // 0-10
    compositePriority: integer('composite_priority').notNull(), // 0-100
    aiAdvisoryTier: text('ai_advisory_tier'), // Advisory only — never auto-rejects
    humanFinalTier: text('human_final_tier').notNull(), // P1_CRITICAL .. P5_DEVELOPMENTAL
    assessmentReasons: jsonb('assessment_reasons').$type<string[]>().notNull().default([]),
    rationale: text('rationale').notNull(),
    humanApproved: boolean('human_approved').notNull().default(false),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_priority_composite').on(t.compositePriority),
    check('chk_priority_100_range', sql`${t.compositePriority} >= 0 AND ${t.compositePriority} <= 100`),
  ]
);

// 18. Verification Cases (V0 - V4, Multi-Officer Workspaces, Deadlines, Appeals, Duplicate Alerts)
export const verificationCases = pgTable(
  'verification_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseNumber: text('case_number').notNull().unique(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    assignedOfficerId: uuid('assigned_officer_id').references(() => users.id),
    officerWorkspace: text('officer_workspace').notNull().default('VERIFICATION_OFFICER'), // VERIFICATION_OFFICER | SOCIAL_WELFARE_OFFICER | FIELD_OFFICER | SAFEGUARDING_OFFICER
    verificationLevel: text('verification_level').notNull().default('V0'), // V0 | V1 | V2 | V3 | V4
    stage: text('stage').notNull().default('DOCUMENT_REVIEW'), // DOCUMENT_REVIEW | FIELD_VISIT | SAFEGUARDING_CHECK | VERIFIED | REJECTED | SUSPENDED | APPEAL
    fieldCounty: text('field_county').notNull(),
    identityVerified: boolean('identity_verified').notNull().default(false),
    guardianVerified: boolean('guardian_verified').notNull().default(false),
    householdVerified: boolean('household_verified').notNull().default(false),
    needVerified: boolean('need_verified').notNull().default(false),
    documentChecklistOk: boolean('document_checklist_ok').notNull().default(false),
    fieldVisitVerified: boolean('field_visit_verified').notNull().default(false),
    fieldVisitDate: timestamp('field_visit_date', { withTimezone: true }),
    fieldVisitNotes: text('field_visit_notes'),
    institutionalConfirmationRef: text('institutional_confirmation_ref'),
    safeguardingCleared: boolean('safeguarding_cleared').notNull().default(false),
    duplicateAlertFlag: boolean('duplicate_alert_flag').notNull().default(false),
    duplicateAlertDetails: text('duplicate_alert_details'),
    caseDeadlineAt: timestamp('case_deadline_at', { withTimezone: true }),
    followUpReminderAt: timestamp('follow_up_reminder_at', { withTimezone: true }),
    appealStatus: text('appeal_status').notNull().default('NONE'), // NONE | APPEAL_SUBMITTED | REASSESSMENT | RESOLVED
    appealReason: text('appeal_reason'),
    decisionNotes: text('decision_notes'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_verif_cases_stage').on(t.stage, t.verificationLevel)]
);

// 18b. Verification Case History & Officer Notes
export const verificationCaseEvents = pgTable(
  'verification_case_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => verificationCases.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorWorkspace: text('actor_workspace').notNull(),
    eventType: text('event_type').notNull(), // NOTE | LEVEL_ADVANCE | REJECTION | SUSPENSION | REASSESSMENT | APPEAL | DUPLICATE_FLAG
    previousLevel: text('previous_level'),
    newLevel: text('new_level'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_case_events_case').on(t.caseId, t.createdAt)]
);

// 19. Humanitarian Funds (Central Humanitarian Funds & Corporate CSR Pools)
export const humanitarianFunds = pgTable(
  'humanitarian_funds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    fundType: text('fund_type').notNull(), // CENTRAL_RELIEF | EDUCATION | MEDICAL | EMPOWERMENT | CSR_POOL
    organisationId: uuid('organisation_id').references(() => organisations.id),
    countryCode: text('country_code').notNull().default('KE'),
    currency: text('currency').notNull().default('KES'),
    availableBalanceMinor: integer('available_balance_minor').notNull().default(0),
    totalReceivedMinor: integer('total_received_minor').notNull().default(0),
    totalDisbursedMinor: integer('total_disbursed_minor').notNull().default(0),
    description: text('description').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('chk_fund_bal_non_neg', sql`${t.availableBalanceMinor} >= 0`),
    check('chk_fund_rec_non_neg', sql`${t.totalReceivedMinor} >= 0`),
  ]
);

// 20. Donations (Strict separation between Pledges vs Verified Confirmed Money)
export const donations = pgTable(
  'donations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supporterId: uuid('supporter_id')
      .notNull()
      .references(() => supporterProfiles.id),
    pathway: text('pathway').notNull(), // DIRECT_SPONSORSHIP | CENTRAL_FUND
    beneficiaryId: uuid('beneficiary_id').references(() => beneficiaryProfiles.id),
    needRequestId: uuid('need_request_id').references(() => needRequests.id),
    fundId: uuid('fund_id').references(() => humanitarianFunds.id),
    isPledge: boolean('is_pledge').notNull().default(false),
    sponsorshipCoverage: text('sponsorship_coverage').notNull().default('PARTIAL'), // FULL | PARTIAL
    isGiftDonation: boolean('is_gift_donation').notNull().default(false),
    giftHonoreeName: text('gift_honoree_name'),
    giftMessage: text('gift_message'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    status: text('status').notNull().default('PLEDGED'), // PLEDGED | PAYMENT_PENDING | CONFIRMED | FAILED | CANCELLED
    notes: text('notes'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_donations_pathway_status').on(t.pathway, t.status),
    check('chk_donation_amount_pos', sql`${t.amountMinor} > 0`),
  ]
);

// 21. Payment Transactions (Append-only verified payment gateway ledger)
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    donationId: uuid('donation_id')
      .notNull()
      .references(() => donations.id),
    provider: text('provider').notNull(), // MPESA_DARAJA | CARD | BANK_EFT
    idempotencyKey: text('idempotency_key').notNull().unique(),
    checkoutRequestId: text('checkout_request_id').unique(),
    mpesaReceiptNumber: text('mpesa_receipt_number').unique(),
    phoneE164: text('phone_e164'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    verificationStatus: text('verification_status').notNull().default('INITIATED'), // INITIATED | CALLBACK_PENDING | VERIFIED | FAILED
    rawCallbackHash: text('raw_callback_hash'),
    failureReason: text('failure_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_payment_status').on(t.verificationStatus, t.provider),
    check('chk_tx_amount_pos', sql`${t.amountMinor} > 0`),
  ]
);

// 22. Fund Allocations
export const fundAllocations = pgTable(
  'fund_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => humanitarianFunds.id),
    needRequestId: uuid('need_request_id').references(() => needRequests.id),
    beneficiaryId: uuid('beneficiary_id').references(() => beneficiaryProfiles.id),
    projectTitle: text('project_title').notNull(),
    allocatedAmountMinor: integer('allocated_amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('APPROVED'), // APPROVED | DISBURSED | CANCELLED
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check('chk_alloc_pos', sql`${t.allocatedAmountMinor} > 0`)]
);

// 23. Disbursements
export const disbursements = pgTable(
  'disbursements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pathway: text('pathway').notNull(), // DIRECT_SPONSORSHIP | CENTRAL_FUND
    fundAllocationId: uuid('fund_allocation_id').references(() => fundAllocations.id),
    sponsorshipId: uuid('sponsorship_id'),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    channel: text('channel').notNull(), // MPESA_B2C | SCHOOL_PAYBILL | HOSPITAL_EFT | VENDOR_VOUCHER
    externalReference: text('external_reference'),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | PROCESSING | SETTLED | FAILED
    disbursedAt: timestamp('disbursed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_disbursements_beneficiary').on(t.beneficiaryId, t.status),
    check('chk_disb_pos', sql`${t.amountMinor} > 0`),
  ]
);

// 24. Sponsorships (Direct 1:1 Supporter -> Verified Beneficiary)
export const sponsorships = pgTable(
  'sponsorships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supporterId: uuid('supporter_id')
      .notNull()
      .references(() => supporterProfiles.id),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id),
    needRequestId: uuid('need_request_id').references(() => needRequests.id),
    monthlyAmountMinor: integer('monthly_amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    status: text('status').notNull().default('PENDING_FIRST_PAYMENT'), // PENDING_FIRST_PAYMENT | ACTIVE | PAUSED | COMPLETED
    startedAt: timestamp('started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_sponsorships_supporter').on(t.supporterId, t.status),
    check('chk_sponsor_amt_pos', sql`${t.monthlyAmountMinor} > 0`),
  ]
);

// 25. Recurring Schedules & Sponsorship Agreements
export const recurringSchedules = pgTable(
  'recurring_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agreementReference: text('agreement_reference').notNull().unique(),
    supporterId: uuid('supporter_id')
      .notNull()
      .references(() => supporterProfiles.id),
    pathway: text('pathway').notNull(), // DIRECT_SPONSORSHIP | CENTRAL_FUND
    sponsorshipId: uuid('sponsorship_id').references(() => sponsorships.id),
    fundId: uuid('fund_id').references(() => humanitarianFunds.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    cadence: text('cadence').notNull().default('MONTHLY'), // WEEKLY | MONTHLY | QUARTERLY | SCHOOL_TERM | ANNUALLY | CUSTOM
    customIntervalDays: integer('custom_interval_days'),
    paymentMethod: text('payment_method').notNull().default('MPESA_DARAJA'),
    supporterConsentGranted: boolean('supporter_consent_granted').notNull().default(true),
    supporterConsentAt: timestamp('supporter_consent_at', { withTimezone: true }).defaultNow().notNull(),
    paymentAuthorised: boolean('payment_authorised').notNull().default(false),
    startDate: timestamp('start_date', { withTimezone: true }).defaultNow().notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    nextChargeAt: timestamp('next_charge_at', { withTimezone: true }).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lastFailureReason: text('last_failure_reason'),
    renewalMode: text('renewal_mode').notNull().default('MANUAL_CONFIRM'), // AUTO_WITH_NOTICE | MANUAL_CONFIRM | FIXED_END
    beneficiaryReassessmentDueAt: timestamp('beneficiary_reassessment_due_at', { withTimezone: true }),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | PAUSED | CANCELLED | COMPLETED | PAYMENT_RETRY
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_recurring_due').on(t.status, t.nextChargeAt)]
);

// 26. Audit Logs (Append-only security & financial audit log)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    ipHash: text('ip_hash'),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audit_entity_time').on(t.entityType, t.createdAt)]
);

// 27. Consent Records
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    consentScope: text('consent_scope').notNull(), // DATA_PROCESSING | PUBLIC_STORY | MEDIA_PUBLISHING | AI_TRIAGE | GUARDIAN_PROXY
    granted: boolean('granted').notNull().default(false),
    policyVersion: text('policy_version').notNull().default('KE-DPA-2026.1'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('idx_consent_beneficiary_scope').on(t.beneficiaryId, t.consentScope)]
);

// 28. Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('IN_APP'), // IN_APP | EMAIL | SMS
    category: text('category').notNull(), // VERIFICATION | PAYMENT | SAFEGUARDING | EMPOWERMENT | SYSTEM
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_notifications_user').on(t.userId, t.readAt)]
);

// 29. Safeguarding Incidents
export const safeguardingIncidents = pgTable(
  'safeguarding_incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    beneficiaryId: uuid('beneficiary_id').references(() => beneficiaryProfiles.id),
    reportedByUserId: uuid('reported_by_user_id')
      .notNull()
      .references(() => users.id),
    assignedAdminId: uuid('assigned_admin_id').references(() => users.id),
    severity: text('severity').notNull().default('HIGH'), // LOW | MEDIUM | HIGH | CRITICAL
    category: text('category').notNull(), // CHILD_PROTECTION | CONSENT_CONCERN | FRAUD_ALERT | DATA_PRIVACY
    summaryEnc: text('summary_enc').notNull(),
    status: text('status').notNull().default('OPEN'), // OPEN | INVESTIGATING | ESCALATED | RESOLVED
    resolutionNotes: text('resolution_notes'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_safeguarding_status').on(t.status, t.severity)]
);

// 30. Community Projects (Kenyan county initiatives linked to Central Funds)
export const communityProjects = pgTable('community_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  fundId: uuid('fund_id')
    .notNull()
    .references(() => humanitarianFunds.id),
  title: text('title').notNull(),
  county: text('county').notNull(),
  countryCode: text('country_code').notNull().default('KE'),
  summary: text('summary').notNull(),
  coverImagePath: text('cover_image_path'),
  targetAmountMinor: integer('target_amount_minor').notNull(),
  raisedAmountMinor: integer('raised_amount_minor').notNull().default(0),
  currency: text('currency').notNull().default('KES'),
  beneficiariesImpacted: integer('beneficiaries_impacted').notNull().default(0),
  status: text('status').notNull().default('ACTIVE'),
  leadOfficerId: uuid('lead_officer_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 31. Volunteer & Field Operations Assignments
export const volunteerAssignments = pgTable('volunteer_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  assignmentType: text('assignment_type').notNull(), // FIELD_VERIFICATION | COMMUNITY_PROJECT | MENTORSHIP
  county: text('county').notNull(),
  projectId: uuid('project_id').references(() => communityProjects.id),
  beneficiaryId: uuid('beneficiary_id').references(() => beneficiaryProfiles.id),
  skillsSummary: text('skills_summary').notNull(),
  scheduledDate: text('scheduled_date').notNull(),
  status: text('status').notNull().default('ASSIGNED'), // ASSIGNED | IN_PROGRESS | COMPLETED
  fieldReportNotes: text('field_report_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 32. Empowerment Milestones (Empowerment Centre)
export const empowermentMilestones = pgTable('empowerment_milestones', {
  id: uuid('id').defaultRandom().primaryKey(),
  beneficiaryId: uuid('beneficiary_id')
    .notNull()
    .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
  pathwayName: text('pathway_name').notNull(),
  moduleTitle: text('module_title').notNull(),
  completionPct: integer('completion_pct').notNull().default(0),
  microGrantStatus: text('micro_grant_status').notNull().default('ELIGIBLE_IN_TRAINING'),
  mentorUserId: uuid('mentor_user_id').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 33. Saved Beneficiaries (Supporter Bookmarks)
export const savedBeneficiaries = pgTable(
  'saved_beneficiaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supporterId: uuid('supporter_id')
      .notNull()
      .references(() => supporterProfiles.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uq_saved_supporter_beneficiary').on(t.supporterId, t.beneficiaryId)]
);

// 34. Double-Entry Financial Ledger (Immutable accounting journal separating Direct Sponsorship, Central Funds, and Platform Revenue)
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    journalGroupId: uuid('journal_group_id').notNull(),
    pathway: text('pathway').notNull(), // DIRECT_SPONSORSHIP | CENTRAL_FUND | PLATFORM_REVENUE
    accountCode: text('account_code').notNull(), // 1010-CASH-MPESA | 2010-SPONSORSHIP-TRUST | 2020-CENTRAL-FUND | 4010-PLATFORM-OPS | 5010-DISBURSEMENT
    accountName: text('account_name').notNull(),
    debitMinor: integer('debit_minor').notNull().default(0),
    creditMinor: integer('credit_minor').notNull().default(0),
    currency: text('currency').notNull().default('KES'),
    referenceType: text('reference_type').notNull(), // PAYMENT | DISBURSEMENT | REFUND | REVERSAL
    referenceId: uuid('reference_id').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_ledger_journal').on(t.journalGroupId, t.pathway),
    check('chk_ledger_debit_non_neg', sql`${t.debitMinor} >= 0`),
    check('chk_ledger_credit_non_neg', sql`${t.creditMinor} >= 0`),
  ]
);

// 35. Maker-Checker Financial Approvals (Significant disbursements, refunds, and reversals)
export const financialApprovals = pgTable(
  'financial_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operationType: text('operation_type').notNull(), // DISBURSEMENT | REFUND | REVERSAL | FUND_ALLOCATION
    pathway: text('pathway').notNull(),
    targetEntityId: uuid('target_entity_id').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('KES'),
    makerUserId: uuid('maker_user_id')
      .notNull()
      .references(() => users.id),
    checkerUserId: uuid('checker_user_id').references(() => users.id),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('PENDING_CHECKER'), // PENDING_CHECKER | APPROVED | REJECTED | EXECUTED
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check('chk_fin_approval_pos', sql`${t.amountMinor} > 0`)]
);

// Drizzle Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  userRoles: many(userRoles),
  sessions: many(userSessions),
  beneficiaryProfile: one(beneficiaryProfiles, {
    fields: [users.id],
    references: [beneficiaryProfiles.userId],
  }),
  supporterProfile: one(supporterProfiles, {
    fields: [users.id],
    references: [supporterProfiles.userId],
  }),
  notifications: many(notifications),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const beneficiaryProfilesRelations = relations(beneficiaryProfiles, ({ one, many }) => ({
  user: one(users, { fields: [beneficiaryProfiles.userId], references: [users.id] }),
  householdMembers: many(householdMembers),
  guardianRelationships: many(guardianRelationships),
  stories: many(beneficiaryStories),
  needRequests: many(needRequests),
  consentRecords: many(consentRecords),
  verificationCases: many(verificationCases),
  empowermentMilestones: many(empowermentMilestones),
}));
