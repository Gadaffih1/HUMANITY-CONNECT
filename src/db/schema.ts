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
  type AnyPgColumn,
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
    ageGroup: text('age_group').notNull().default('MULTI_GENERATIONAL'), // CHILDREN_5_17 | YOUNG_ADULT_18_25 | ADULT_26_59 | ELDERLY_60_PLUS | MULTI_GENERATIONAL
    specificChallenges: jsonb('specific_challenges').$type<string[]>().notNull().default([]),
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
    originatedFromAiMatch: boolean('originated_from_ai_match').notNull().default(false),
    matchSuggestionId: uuid('match_suggestion_id').references(
      (): AnyPgColumn => sponsorshipMatchSuggestions.id,
      { onDelete: 'set null' }
    ),
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
    originatedFromAiMatch: boolean('originated_from_ai_match').notNull().default(false),
    matchSuggestionId: uuid('match_suggestion_id').references(
      (): AnyPgColumn => sponsorshipMatchSuggestions.id,
      { onDelete: 'set null' }
    ),
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

// 36. Matching Engine Configuration (Transparent, Administrator-Configurable Algorithm Weights)
export const matchingEngineConfig = pgTable('matching_engine_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  configKey: text('config_key').notNull().unique().default('DEFAULT'),
  algorithmName: text('algorithm_name')
    .notNull()
    .default('Humanity Connect Dynamic Impact Matcher'),
  weightNeedAlignment: integer('weight_need_alignment').notNull().default(30),
  weightLocationFocus: integer('weight_location_focus').notNull().default(20),
  weightBudgetFit: integer('weight_budget_fit').notNull().default(20),
  weightUrgencyImpact: integer('weight_urgency_impact').notNull().default(20),
  weightAgeDemographics: integer('weight_age_demographics').notNull().default(10),
  prioritiseUnderfundedPct: integer('prioritise_underfunded_pct').notNull().default(60),
  minThresholdScore: integer('min_threshold_score').notNull().default(35),
  enableGeminiAnalysis: boolean('enable_gemini_analysis').notNull().default(true),
  requireHumanSafeguardGate: boolean('require_human_safeguard_gate').notNull().default(true),
  transparencyNotes: text('transparency_notes')
    .notNull()
    .default(
      'Scores combine deterministic weighted criteria (Need, Location, Budget, Urgency/Underfunded Gap, Age/Challenges) with bounded Gemini AI contextual analysis. Only V4-verified, safeguarding-cleared cases are eligible.'
    ),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 37. Sponsor Matching Preferences (Individuals, Companies, Charities, Foundations, NGOs)
export const sponsorMatchingPreferences = pgTable('sponsor_matching_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  supporterId: uuid('supporter_id')
    .notNull()
    .unique()
    .references(() => supporterProfiles.id, { onDelete: 'cascade' }),
  sponsorEntityType: text('sponsor_entity_type').notNull().default('INDIVIDUAL'), // INDIVIDUAL | COMPANY | INSTITUTION
  budgetMinor: integer('budget_minor').notNull().default(600000),
  currency: text('currency').notNull().default('KES'),
  preferredCadence: text('preferred_cadence').notNull().default('MONTHLY'), // ONE_TIME | WEEKLY | MONTHLY | TERMLY | QUARTERLY | ANNUALLY
  interestCategories: jsonb('interest_categories')
    .$type<string[]>()
    .notNull()
    .default(['EDUCATION', 'FOOD', 'MEDICAL']),
  locationFocus: jsonb('location_focus').$type<string[]>().notNull().default(['ALL']),
  preferredAgeGroups: jsonb('preferred_age_groups').$type<string[]>().notNull().default(['ALL']),
  preferredClassifications: jsonb('preferred_classifications')
    .$type<string[]>()
    .notNull()
    .default(['ORPHAN_GUARDIAN', 'DESTITUTE', 'NEEDY']),
  impactGoal: text('impact_goal')
    .notNull()
    .default('Prioritise high-urgency household stability, schooling continuity, and sustainable livelihoods.'),
  proactiveOptIn: boolean('proactive_opt_in').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 38. Sponsorship Match Suggestions (Proactive Transparent AI-Assisted Match Records)
export const sponsorshipMatchSuggestions = pgTable(
  'sponsorship_match_suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supporterId: uuid('supporter_id')
      .notNull()
      .references(() => supporterProfiles.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaryProfiles.id, { onDelete: 'cascade' }),
    needRequestId: uuid('need_request_id').references(() => needRequests.id),
    compositeScore: integer('composite_score').notNull(),
    breakdownJson: jsonb('breakdown_json')
      .$type<{
        needScore: number;
        locationScore: number;
        budgetScore: number;
        urgencyScore: number;
        ageScore: number;
        geminiDelta: number;
        weights: {
          need: number;
          location: number;
          budget: number;
          urgency: number;
          age: number;
        };
        factorNotes: string[];
      }>()
      .notNull(),
    beneficiarySignalsJson: jsonb('beneficiary_signals_json')
      .$type<{
        ageGroup: string;
        challenges: string[];
        needCategories: string[];
        county: string;
        remainingGapMinor: number;
        priorityTier: string;
      }>()
      .notNull(),
    geminiRationale: text('gemini_rationale'),
    geminiImpactProjection: text('gemini_impact_projection'),
    recommendedApproach: text('recommended_approach'),
    usedModel: text('used_model'),
    status: text('status').notNull().default('SUGGESTED'), // SUGGESTED | SAVED | SPONSORED | DISMISSED
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_match_suggestions_supporter').on(t.supporterId, t.compositeScore),
    check('chk_match_score_range', sql`${t.compositeScore} >= 0 AND ${t.compositeScore} <= 100`),
  ]
);

// 39. Granular User Permission Flags (Sub-Admin Action Flags)
export const userPermissions = pgTable(
  'user_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionCode: text('permission_code').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_user_permission_flag').on(t.userId, t.permissionCode),
    index('idx_user_permissions_user').on(t.userId),
  ]
);

// 40. National & International Staff Management Centre (170 Approved Establishment Positions)
export const staffPositions = pgTable(
  'staff_positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: text('job_id').notNull().unique(),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    jobTitle: text('job_title').notNull(),
    hierarchyLevel: text('hierarchy_level').notNull().default('FIELD_OFFICER'),
    reportsToJobId: text('reports_to_job_id'),
    independentOversight: boolean('independent_oversight').notNull().default(false),
    jobDescription: text('job_description').notNull(),
    mainResponsibilities: jsonb('main_responsibilities').$type<string[]>().notNull(),
    dailyResponsibilities: jsonb('daily_responsibilities').$type<string[]>().notNull(),
    weeklyResponsibilities: jsonb('weekly_responsibilities').$type<string[]>().notNull(),
    monthlyResponsibilities: jsonb('monthly_responsibilities').$type<string[]>().notNull(),
    requiredQualifications: text('required_qualifications').notNull(),
    professionalQualifications: text('professional_qualifications').notNull(),
    requiredExperience: text('required_experience').notNull(),
    professionalSkills: jsonb('professional_skills').$type<string[]>().notNull(),
    communicationSkills: jsonb('communication_skills').$type<string[]>().notNull(),
    ethicalRequirements: text('ethical_requirements').notNull(),
    safeguardingResponsibilities: text('safeguarding_responsibilities').notNull(),
    reportingOfficer: text('reporting_officer').notNull(),
    supervisoryResponsibilities: text('supervisory_responsibilities').notNull(),
    geographicalJurisdiction: text('geographical_jurisdiction').notNull(),
    employmentStatus: text('employment_status').notNull(),
    workingConditions: text('working_conditions').notNull(),
    professionalDevelopment: text('professional_development').notNull(),
    performanceExpectations: text('performance_expectations').notNull(),
    incumbentName: text('incumbent_name'),
    incumbentUserId: uuid('incumbent_user_id').references(() => users.id, { onDelete: 'set null' }),
    actingOfficerName: text('acting_officer_name'),
    actingOfficerUserId: uuid('acting_officer_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    vacancyStatus: text('vacancy_status').notNull().default('VACANT'), // FILLED | VACANT | ACTING | RECRUITING
    isVacancyPublished: boolean('is_vacancy_published').notNull().default(false),
    vacancyPublishedAt: timestamp('vacancy_published_at', { withTimezone: true }),
    revisionStatus: text('revision_status').notNull().default('APPROVED'), // APPROVED | PENDING_APPROVAL
    revisionVersion: integer('revision_version').notNull().default(1),
    lastRevisedBy: uuid('last_revised_by').references(() => users.id, { onDelete: 'set null' }),
    lastApprovedBy: uuid('last_approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_staff_positions_dept').on(t.departmentNumber, t.jobTitle),
    index('idx_staff_positions_reports').on(t.reportsToJobId),
  ]
);

// 41. Staff Job Description Revision Workflow (HR Edit & Two-Person Approval)
export const staffPositionRevisions = pgTable(
  'staff_position_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => staffPositions.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    proposedChangesJson: jsonb('proposed_changes_json')
      .$type<Record<string, unknown>>()
      .notNull(),
    revisionNote: text('revision_note').notNull(),
    status: text('status').notNull().default('PENDING_APPROVAL'), // PENDING_APPROVAL | APPROVED | REJECTED
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_staff_revisions_pos').on(t.positionId, t.status)]
);

// 42. Recruitment Vacancies (Staff Vacancies for Approved Positions)
export const staffVacancies = pgTable(
  'staff_vacancies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vacancyCode: text('vacancy_code').notNull().unique(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => staffPositions.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    jobTitle: text('job_title').notNull(),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    jobLocation: text('job_location').notNull(),
    employmentType: text('employment_type').notNull().default('FULL_TIME'), // FULL_TIME | CONTRACT | PART_TIME | VOLUNTEER | SECONDMENT
    jobDescription: text('job_description').notNull(),
    academicQualifications: text('academic_qualifications').notNull(),
    professionalRequirements: text('professional_requirements').notNull(),
    experienceRequirements: text('experience_requirements').notNull(),
    applicationDeadline: timestamp('application_deadline', { withTimezone: true }).notNull(),
    requiredDocuments: jsonb('required_documents').$type<string[]>().notNull(),
    applicationInstructions: text('application_instructions').notNull(),
    stage: text('stage').notNull().default('VACANCY_DRAFT'), // VACANCY_DRAFT | VACANCY_APPROVED | PUBLISHED | CLOSED
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_staff_vacancies_stage').on(t.stage, t.departmentNumber)]
);

// 43. Recruitment Applications (15-Stage Pipeline + Encrypted Applicant PII + Outcomes)
export const recruitmentApplications = pgTable(
  'recruitment_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationRef: text('application_ref').notNull().unique(),
    vacancyId: uuid('vacancy_id')
      .notNull()
      .references(() => staffVacancies.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    applicantUserId: uuid('applicant_user_id').references(() => users.id, { onDelete: 'set null' }),
    applicantNameEnc: text('applicant_name_enc').notNull(),
    applicantEmailEnc: text('applicant_email_enc').notNull(),
    applicantPhoneEnc: text('applicant_phone_enc').notNull(),
    nationalIdEnc: text('national_id_enc'),
    county: text('county').notNull().default('Nairobi'),
    academicSummary: text('academic_summary').notNull(),
    professionalCertsSummary: text('professional_certs_summary').notNull(),
    experienceYears: integer('experience_years').notNull().default(0),
    coverNote: text('cover_note').notNull(),
    documentsJson: jsonb('documents_json')
      .$type<Array<{ name: string; docType: string; verified: boolean; reviewNotes?: string }>>()
      .notNull()
      .default([]),
    stage: text('stage').notNull().default('APPLICATIONS_RECEIVED'),
    // APPLICATIONS_RECEIVED | INITIAL_SCREENING | SHORTLISTED | INTERVIEW | REFERENCE_CHECKS |
    // BACKGROUND_SUITABILITY | SELECTION | OFFER_ISSUED | OFFER_ACCEPTED | APPOINTMENT_APPROVED |
    // ONBOARDING | ACTIVE_EMPLOYEE | UNSUCCESSFUL | WITHDRAWN | REJECTED
    interviewScheduledAt: timestamp('interview_scheduled_at', { withTimezone: true }),
    interviewLocationOrLink: text('interview_location_or_link'),
    interviewScore: integer('interview_score'),
    interviewAssessmentNotes: text('interview_assessment_notes'),
    referenceCheckStatus: text('reference_check_status').notNull().default('PENDING'), // PENDING | VERIFIED | FLAGGED
    referenceCheckNotes: text('reference_check_notes'),
    backgroundCheckStatus: text('background_check_status').notNull().default('PENDING'), // PENDING | CLEARED | FLAGGED
    backgroundCheckNotes: text('background_check_notes'),
    offerTermsSummary: text('offer_terms_summary'),
    offerIssuedAt: timestamp('offer_issued_at', { withTimezone: true }),
    offerAcceptedAt: timestamp('offer_accepted_at', { withTimezone: true }),
    proposedAppointmentBy: uuid('proposed_appointment_by').references(() => users.id, { onDelete: 'set null' }),
    appointmentApprovedBy: uuid('appointment_approved_by').references(() => users.id, { onDelete: 'set null' }),
    appointmentApprovedAt: timestamp('appointment_approved_at', { withTimezone: true }),
    stageNotes: text('stage_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_recruit_apps_vacancy_stage').on(t.vacancyId, t.stage)]
);

// 44. Staff Employee Profiles (Employee Management Centre)
export const staffEmployeeProfiles = pgTable(
  'staff_employee_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffNumber: text('staff_number').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    positionId: uuid('position_id').references(() => staffPositions.id, { onDelete: 'set null' }),
    jobId: text('job_id').notNull(),
    fullLegalName: text('full_legal_name').notNull(),
    officialPhotoUrl: text('official_photo_url'),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    jobTitle: text('job_title').notNull(),
    countyAssignment: text('county_assignment').notNull().default('Nairobi'),
    subCountyAssignment: text('sub_county_assignment'),
    wardAssignment: text('ward_assignment'),
    countryCode: text('country_code').notNull().default('KE'),
    internationalRegion: text('international_region'),
    employmentCategory: text('employment_category').notNull().default('PERMANENT'), // PERMANENT | FIXED_TERM | CONTRACT | CONSULTANT | VOLUNTEER | FELLOW
    genderMarker: text('gender_marker'), // Lawfully collected EE marker: FEMALE | MALE | NON_BINARY | PREFER_NOT_TO_SAY
    appointmentDate: text('appointment_date').notNull(),
    employmentStatus: text('employment_status').notNull().default('ACTIVE'),
    // APPLICANT | PENDING_APPOINTMENT | ACTIVE | ON_LEAVE | SUSPENDED | TRANSFERRED | RESIGNED | RETIRED | TERMINATED
    academicQualifications: text('academic_qualifications').notNull(),
    professionalCertifications: text('professional_certifications').notNull(),
    workExperienceSummary: text('work_experience_summary').notNull(),
    supervisorStaffId: text('supervisor_staff_id'),
    supervisorName: text('supervisor_name').notNull(),
    assignedResponsibilities: jsonb('assigned_responsibilities').$type<string[]>().notNull().default([]),
    emergencyContactName: text('emergency_contact_name').notNull(),
    emergencyContactPhone: text('emergency_contact_phone').notNull(),
    emergencyContactRelation: text('emergency_contact_relation').notNull(),
    trainingHistory: jsonb('training_history')
      .$type<Array<{ date: string; course: string; provider: string; status: string }>>()
      .notNull()
      .default([]),
    promotionHistory: jsonb('promotion_history')
      .$type<Array<{ date: string; fromTitle: string; toTitle: string; approvedBy: string }>>()
      .notNull()
      .default([]),
    performanceHistory: jsonb('performance_history')
      .$type<Array<{ period: string; rating: string; reviewer: string; notes: string }>>()
      .notNull()
      .default([]),
    leaveRecords: jsonb('leave_records')
      .$type<Array<{ id: string; leaveType: string; startDate: string; endDate: string; status: string }>>()
      .notNull()
      .default([]),
    appointmentDocuments: jsonb('appointment_documents')
      .$type<Array<{ title: string; issuedAt: string; refNo: string }>>()
      .notNull()
      .default([]),
    exitOrTransferReason: text('exit_or_transfer_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_staff_emp_dept_status').on(t.departmentNumber, t.employmentStatus),
    index('idx_staff_emp_county').on(t.countryCode, t.countyAssignment),
  ]
);

// 45. Restricted Disciplinary Records (Encrypted, Strict Access Control)
export const staffDisciplinaryRecords = pgTable(
  'staff_disciplinary_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffProfileId: uuid('staff_profile_id')
      .notNull()
      .references(() => staffEmployeeProfiles.id, { onDelete: 'cascade' }),
    incidentRef: text('incident_ref').notNull().unique(),
    category: text('category').notNull(), // CONDUCT | POLICY_BREACH | ATTENDANCE | SAFEGUARDING_REFERRAL
    severity: text('severity').notNull().default('MODERATE'), // MINOR | MODERATE | SERIOUS | GROSS
    summaryEnc: text('summary_enc').notNull(),
    actionTaken: text('action_taken').notNull(),
    status: text('status').notNull().default('OPEN'), // OPEN | UNDER_INVESTIGATION | RESOLVED
    loggedByUserId: uuid('logged_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('idx_staff_disc_profile').on(t.staffProfileId, t.status)]
);

// 46. National, County (47), Sub-County, Ward, Community & International Field Personnel
export const fieldGeographyOfficers = pgTable(
  'field_geography_officers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialIdNumber: text('official_id_number').notNull().unique(),
    staffProfileId: uuid('staff_profile_id').references(() => staffEmployeeProfiles.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    fullName: text('full_name').notNull(),
    fieldRole: text('field_role').notNull(),
    // COUNTY_COORDINATOR | DEPUTY_COUNTY_COORDINATOR | SUB_COUNTY_COORDINATOR | WARD_FIELD_OFFICER |
    // COMMUNITY_OUTREACH_OFFICER | COMMUNITY_AMBASSADOR | VOLUNTEER_COORDINATOR | FIELD_ASSESSMENT_OFFICER
    adminLevel: text('admin_level').notNull(), // NATIONAL | COUNTY | SUB_COUNTY | WARD | COMMUNITY | INTERNATIONAL
    countryCode: text('country_code').notNull().default('KE'),
    county: text('county').notNull(),
    subCounty: text('sub_county'),
    ward: text('ward'),
    communityUnit: text('community_unit'),
    supervisorName: text('supervisor_name').notNull(),
    supervisorUserId: uuid('supervisor_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedDuties: jsonb('assigned_duties').$type<string[]>().notNull().default([]),
    beneficiaryFollowUpCount: integer('beneficiary_follow_up_count').notNull().default(0),
    activitiesJson: jsonb('activities_json')
      .$type<Array<{ date: string; title: string; location: string; outcome: string }>>()
      .notNull()
      .default([]),
    fieldReportsJson: jsonb('field_reports_json')
      .$type<Array<{ date: string; ref: string; summary: string; verifiedCases: number }>>()
      .notNull()
      .default([]),
    performanceAssessment: text('performance_assessment')
      .notNull()
      .default('Meets National Field Operations Standards'),
    additionalAuthorizedAreas: jsonb('additional_authorized_areas').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | ON_LEAVE | TRANSFERRED | ACTING
    appointedByUserId: uuid('appointed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_field_geo_county').on(t.countryCode, t.county, t.adminLevel),
    index('idx_field_geo_user').on(t.userId),
  ]
);

// 47. Individual Departmental Workspace Records (15 Departments)
export const departmentalWorkspaceItems = pgTable(
  'departmental_workspace_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    itemType: text('item_type').notNull(),
    // DAILY_ACTIVITY | ASSIGNMENT | PERFORMANCE_REPORT | DOCUMENT | COMMUNICATION |
    // MEETING | TARGET | MONTHLY_REPORT | NATIONAL_ISSUE
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | IN_PROGRESS | COMPLETED | ESCALATED | ACTIVE
    assignedToName: text('assigned_to_name').notNull(),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: text('due_date'),
    metricValue: text('metric_value'),
    metricTarget: text('metric_target'),
    priority: text('priority').notNull().default('NORMAL'), // NORMAL | HIGH | CRITICAL
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_dept_ws_dept_type').on(t.departmentNumber, t.itemType, t.status)]
);

// 48. Staff Performance & Accountability Centre (Daily/Weekly/Monthly/Quarterly/Annual + Self/Supervisor/DeptHead/HR + Challenge)
export const staffPerformanceReviews = pgTable(
  'staff_performance_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reviewRef: text('review_ref').notNull().unique(),
    staffProfileId: uuid('staff_profile_id')
      .notNull()
      .references(() => staffEmployeeProfiles.id, { onDelete: 'cascade' }),
    staffNumber: text('staff_number').notNull(),
    staffName: text('staff_name').notNull(),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    cadence: text('cadence').notNull().default('MONTHLY'), // DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL
    reviewPeriod: text('review_period').notNull(),
    objectivesSummary: text('objectives_summary').notNull(),
    departmentalTargetRef: text('departmental_target_ref').notNull(),
    assignedTasksCount: integer('assigned_tasks_count').notNull().default(0),
    completedActivitiesCount: integer('completed_activities_count').notNull().default(0),
    metricsJson: jsonb('metrics_json')
      .$type<{
        timelinessScore: number;
        qualityOfWorkScore: number;
        beneficiaryServiceScore: number;
        professionalConductScore: number;
        teamworkScore: number;
        reportingAccuracyScore: number;
        trainingParticipationScore: number;
        safeguardingComplianceOk: boolean;
      }>()
      .notNull(),
    selfAssessmentText: text('self_assessment_text'),
    supervisorAssessmentText: text('supervisor_assessment_text'),
    departmentHeadReviewText: text('department_head_review_text'),
    hrReviewText: text('hr_review_text'),
    improvementPlan: text('improvement_plan'),
    recognitionCommendation: text('recognition_commendation'),
    trainingRecommendation: text('training_recommendation'),
    overallRating: text('overall_rating').notNull().default('MEETS_EXPECTATIONS'), // EXCEEDS | MEETS_EXPECTATIONS | NEEDS_IMPROVEMENT | PIP_ACTIVE
    reviewStage: text('review_stage').notNull().default('SELF_ASSESSMENT'), // SELF_ASSESSMENT | SUPERVISOR_REVIEW | DEPT_HEAD_REVIEW | HR_REVIEW | FINALISED
    staffResponseText: text('staff_response_text'),
    challengeStatus: text('challenge_status').notNull().default('NONE'), // NONE | CHALLENGED | RESOLVED
    challengeReason: text('challenge_reason'),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    deptHeadUserId: uuid('dept_head_user_id').references(() => users.id, { onDelete: 'set null' }),
    hrReviewerUserId: uuid('hr_reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_staff_perf_dept_cadence').on(t.departmentNumber, t.cadence, t.reviewStage)]
);

// 49. Internal Staff Tasks (Task Management Centre with 8 Required Statuses)
export const internalStaffTasks = pgTable(
  'internal_staff_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskReference: text('task_reference').notNull().unique(),
    targetScope: text('target_scope').notNull().default('INDIVIDUAL'), // INDIVIDUAL | TEAM | DEPARTMENT
    responsibleOfficerName: text('responsible_officer_name').notNull(),
    responsibleOfficerUserId: uuid('responsible_officer_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    departmentNumber: integer('department_number').notNull(),
    department: text('department').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: text('priority').notNull().default('HIGH'), // LOW | NORMAL | HIGH | URGENT
    deadline: text('deadline').notNull(),
    supportingDocuments: jsonb('supporting_documents').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('PENDING'),
    // PENDING | ACCEPTED | IN_PROGRESS | AWAITING_REVIEW | COMPLETED | REJECTED | OVERDUE | CANCELLED
    supervisorName: text('supervisor_name').notNull(),
    supervisorUserId: uuid('supervisor_user_id').references(() => users.id, { onDelete: 'set null' }),
    completionEvidence: text('completion_evidence'),
    reviewComments: text('review_comments'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_internal_tasks_dept_status').on(t.departmentNumber, t.status)]
);

// 50. Internal Staff Communication Centre (Announcements, Messages, Meetings, Minutes, Instructions, Escalations)
export const internalStaffMessages = pgTable(
  'internal_staff_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageRef: text('message_ref').notNull().unique(),
    channelType: text('channel_type').notNull().default('ANNOUNCEMENT'),
    // ANNOUNCEMENT | DEPARTMENT_MESSAGE | MEETING_SCHEDULE | MEETING_MINUTES | OPERATIONAL_INSTRUCTION | ESCALATION_REQUEST | DOCUMENT_SHARE
    departmentNumber: integer('department_number'),
    department: text('department'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    meetingDateTime: text('meeting_date_time'),
    meetingLocationOrLink: text('meeting_location_or_link'),
    attachmentDocTitle: text('attachment_doc_title'),
    senderName: text('sender_name').notNull(),
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    confidentialityScreened: boolean('confidentiality_screened').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_internal_msgs_type_dept').on(t.channelType, t.departmentNumber)]
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
