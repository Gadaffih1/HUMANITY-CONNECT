export type RoleCode =
  | 'ORPHAN_GUARDIAN'
  | 'DESTITUTE'
  | 'NEEDY'
  | 'SUPPORTIVE'
  | 'WELL_WISHER'
  | 'SUPER_ADMIN'
  | 'FIELD_OFFICER'
  | 'VERIFICATION_OFFICER'
  | 'WELFARE_OFFICER'
  | 'COUNTY_REPRESENTATIVE'
  | 'DATA_MANAGEMENT_OFFICER'
  | 'FINANCE_OFFICER'
  | 'HR_OFFICER'
  | 'SAFEGUARDING_OFFICER'
  | 'AUDITOR';

export const SUB_ADMIN_ROLE_CODES: RoleCode[] = [
  'VERIFICATION_OFFICER',
  'FIELD_OFFICER',
  'WELFARE_OFFICER',
  'COUNTY_REPRESENTATIVE',
  'DATA_MANAGEMENT_OFFICER',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'SAFEGUARDING_OFFICER',
  'AUDITOR',
];

export const CRITICAL_ROLE_CODES: RoleCode[] = [
  'SUPER_ADMIN',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'SAFEGUARDING_OFFICER',
  'AUDITOR',
];

export const ADMIN_ACCESS_ROLE_CODES: RoleCode[] = ['SUPER_ADMIN', ...SUB_ADMIN_ROLE_CODES];

export type SubAdminPermissionFlag =
  | 'canVerifyNeed'
  | 'canVerifyUsers'
  | 'canDisburseFunds'
  | 'canManageFinanceAccounts'
  | 'canManageSafeguarding'
  | 'canManageCountyOps'
  | 'canManageData'
  | 'canManageHR';

export type PermissionActionVerb =
  | 'View'
  | 'Create'
  | 'Edit'
  | 'Submit'
  | 'Verify'
  | 'Recommend'
  | 'Approve'
  | 'Assign'
  | 'Publish'
  | 'Export'
  | 'Manage'
  | 'Audit';

export const PERMISSION_ACTION_VERBS: PermissionActionVerb[] = [
  'View',
  'Create',
  'Edit',
  'Submit',
  'Verify',
  'Recommend',
  'Approve',
  'Assign',
  'Publish',
  'Export',
  'Manage',
  'Audit',
];

export const SUB_ADMIN_PERMISSION_FLAGS: Array<{
  code: SubAdminPermissionFlag;
  label: string;
  description: string;
  category: string;
  critical?: boolean;
}> = [
  {
    code: 'canVerifyNeed',
    label: 'Can Verify & Approve Needs (canVerifyNeed)',
    description: 'Assess 100-point priority models, verify/recommend P1–P5 needs, and validate supporting bills.',
    category: 'Needs Engine',
  },
  {
    code: 'canVerifyUsers',
    label: 'Can Verify User Accounts (canVerifyUsers)',
    description: 'Perform V0–V4 identity, guardian, household, and institutional verification reviews.',
    category: 'Verification',
  },
  {
    code: 'canDisburseFunds',
    label: 'Can Disburse Funds (canDisburseFunds)',
    description: 'Initiate verified central fund disbursements (cannot self-approve maker-checker items).',
    category: 'Finance',
    critical: true,
  },
  {
    code: 'canManageFinanceAccounts',
    label: 'Can Manage Financial Accounts (canManageFinanceAccounts)',
    description: 'Administer trust fund pools, corporate CSR accounts, and Daraja reconciliation ledgers.',
    category: 'Finance',
    critical: true,
  },
  {
    code: 'canManageSafeguarding',
    label: 'Can Manage Safeguarding (canManageSafeguarding)',
    description: 'Protected access to encrypted safeguarding incidents, child protection escalations, and DPIA oversight.',
    category: 'Safeguarding',
    critical: true,
  },
  {
    code: 'canManageCountyOps',
    label: 'Can Manage County Operations (canManageCountyOps)',
    description: 'Coordinate assigned county/sub-county/ward field officers and community operations.',
    category: 'Field Ops',
  },
  {
    code: 'canManageData',
    label: 'Can Manage Data & Audits (canManageData)',
    description: 'Perform data quality checks, duplicate resolution, and M&E accountability exports.',
    category: 'Data Governance',
  },
  {
    code: 'canManageHR',
    label: 'Can Manage Staff, JDs, Recruitment & Profiles (canManageHR)',
    description: 'Publish vacancies, manage recruitment, edit JDs, and maintain staff profiles (excludes unrelated safeguarding cases).',
    category: 'Human Resources',
    critical: true,
  },
];

export const KENYAN_47_COUNTIES: string[] = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo-Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  "Murang'a",
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita-Taveta',
  'Tana River',
  'Tharaka-Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
];

export const RECRUITMENT_STAGES = [
  { code: 'VACANCY_DRAFT', step: 1, label: 'Vacancy Draft', scope: 'VACANCY' },
  { code: 'VACANCY_APPROVED', step: 2, label: 'Vacancy Approved', scope: 'VACANCY' },
  { code: 'PUBLISHED', step: 3, label: 'Published', scope: 'VACANCY' },
  { code: 'APPLICATIONS_RECEIVED', step: 4, label: 'Applications Received', scope: 'APPLICATION' },
  { code: 'INITIAL_SCREENING', step: 5, label: 'Initial Screening', scope: 'APPLICATION' },
  { code: 'SHORTLISTED', step: 6, label: 'Shortlisted', scope: 'APPLICATION' },
  { code: 'INTERVIEW', step: 7, label: 'Interview', scope: 'APPLICATION' },
  { code: 'REFERENCE_CHECKS', step: 8, label: 'Reference Checks', scope: 'APPLICATION' },
  { code: 'BACKGROUND_SUITABILITY', step: 9, label: 'Background and Suitability Checks', scope: 'APPLICATION' },
  { code: 'SELECTION', step: 10, label: 'Selection', scope: 'APPLICATION' },
  { code: 'OFFER_ISSUED', step: 11, label: 'Offer Issued', scope: 'APPLICATION' },
  { code: 'OFFER_ACCEPTED', step: 12, label: 'Offer Accepted', scope: 'APPLICATION' },
  { code: 'APPOINTMENT_APPROVED', step: 13, label: 'Appointment Approved', scope: 'APPLICATION' },
  { code: 'ONBOARDING', step: 14, label: 'Onboarding', scope: 'APPLICATION' },
  { code: 'ACTIVE_EMPLOYEE', step: 15, label: 'Active Employee', scope: 'APPLICATION' },
] as const;

export const APPLICATION_NEGATIVE_STATUSES = [
  { code: 'UNSUCCESSFUL', label: 'Unsuccessful' },
  { code: 'WITHDRAWN', label: 'Withdrawn' },
  { code: 'REJECTED', label: 'Rejected' },
] as const;

export const STAFF_EMPLOYMENT_STATUSES = [
  'APPLICANT',
  'PENDING_APPOINTMENT',
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'TRANSFERRED',
  'RESIGNED',
  'RETIRED',
  'TERMINATED',
] as const;

export type StaffEmploymentStatus = (typeof STAFF_EMPLOYMENT_STATUSES)[number];

export type BeneficiaryClassification = 'ORPHAN_GUARDIAN' | 'DESTITUTE' | 'NEEDY';

export type ApprovalStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export type VerificationStage =
  | 'INTAKE_SUBMITTED'
  | 'DOCUMENT_REVIEW'
  | 'FIELD_VISIT'
  | 'SAFEGUARDING_CHECK'
  | 'VERIFIED'
  | 'REJECTED';

export type FundingPathway = 'DIRECT_SPONSORSHIP' | 'CENTRAL_FUND';

export type PaymentVerificationStatus =
  | 'INITIATED'
  | 'CALLBACK_PENDING'
  | 'VERIFIED'
  | 'FAILED';

export interface RoleDefinitionMeta {
  code: RoleCode;
  label: string;
  shortLabel: string;
  category: 'BENEFICIARY' | 'SUPPORTER' | 'ADMIN';
  description: string;
  requiresMfa: boolean;
}

export const ROLE_DEFINITIONS: Record<RoleCode, RoleDefinitionMeta> = {
  ORPHAN_GUARDIAN: {
    code: 'ORPHAN_GUARDIAN',
    label: 'Orphan / Guardian',
    shortLabel: 'Orphan & Guardian',
    category: 'BENEFICIARY',
    description:
      'Verified guardian or child-headed household steward requesting education, nutrition, and protection support.',
    requiresMfa: false,
  },
  DESTITUTE: {
    code: 'DESTITUTE',
    label: 'Destitute',
    shortLabel: 'Destitute Relief',
    category: 'BENEFICIARY',
    description:
      'Individuals or households experiencing acute displacement or extreme deprivation requiring immediate shelter and essentials.',
    requiresMfa: false,
  },
  NEEDY: {
    code: 'NEEDY',
    label: 'Needy',
    shortLabel: 'Needy Support',
    category: 'BENEFICIARY',
    description:
      'Vulnerable households seeking medical assistance, livelihoods empowerment, or targeted economic resilience.',
    requiresMfa: false,
  },
  SUPPORTIVE: {
    code: 'SUPPORTIVE',
    label: 'Supportive',
    shortLabel: 'Supportive Member',
    category: 'SUPPORTER',
    description:
      'Individual sponsors, donors, and community volunteers funding direct sponsorships or central relief programmes.',
    requiresMfa: false,
  },
  WELL_WISHER: {
    code: 'WELL_WISHER',
    label: 'Well Wisher',
    shortLabel: 'Well Wisher & CSR',
    category: 'SUPPORTER',
    description:
      'Philanthropists, corporate partners, foundations, and NGOs pooling CSR grants and institutional funds.',
    requiresMfa: false,
  },
  FIELD_OFFICER: {
    code: 'FIELD_OFFICER',
    label: 'Field Officer',
    shortLabel: 'Field Officer',
    category: 'ADMIN',
    description:
      'Sub-admin regional verification and field specialist conducting assigned county field visits.',
    requiresMfa: true,
  },
  VERIFICATION_OFFICER: {
    code: 'VERIFICATION_OFFICER',
    label: 'Verification Officer',
    shortLabel: 'Verification Officer',
    category: 'ADMIN',
    description:
      'Sub-admin officer verifying beneficiary accounts and recommending need approvals (cannot release funds).',
    requiresMfa: true,
  },
  WELFARE_OFFICER: {
    code: 'WELFARE_OFFICER',
    label: 'Social Welfare Officer',
    shortLabel: 'Welfare Officer',
    category: 'ADMIN',
    description:
      'Sub-admin welfare and child protection officer overseeing safeguarding and guardian assessments.',
    requiresMfa: true,
  },
  COUNTY_REPRESENTATIVE: {
    code: 'COUNTY_REPRESENTATIVE',
    label: 'County Representative',
    shortLabel: 'County Rep',
    category: 'ADMIN',
    description:
      'Regional sub-admin coordinating assigned county beneficiaries, field officers, and community operations.',
    requiresMfa: true,
  },
  DATA_MANAGEMENT_OFFICER: {
    code: 'DATA_MANAGEMENT_OFFICER',
    label: 'Data Management Officer',
    shortLabel: 'Data Officer',
    category: 'ADMIN',
    description:
      'Sub-admin managing beneficiary data quality, duplicate screening, and accountability analytics.',
    requiresMfa: true,
  },
  FINANCE_OFFICER: {
    code: 'FINANCE_OFFICER',
    label: 'Finance & Accounts Officer',
    shortLabel: 'Finance Officer',
    category: 'ADMIN',
    description:
      'Sub-admin managing financial accounts, reconciliations, and authorised payment processing (no self-approval).',
    requiresMfa: true,
  },
  HR_OFFICER: {
    code: 'HR_OFFICER',
    label: 'HR Officer',
    shortLabel: 'HR Officer',
    category: 'ADMIN',
    description:
      'Sub-admin administering the 170 staff establishment positions, recruitment, JDs, and employee profiles.',
    requiresMfa: true,
  },
  SAFEGUARDING_OFFICER: {
    code: 'SAFEGUARDING_OFFICER',
    label: 'Safeguarding Officer',
    shortLabel: 'Safeguarding Officer',
    category: 'ADMIN',
    description:
      'Independent protection specialist with restricted access to encrypted safeguarding and child safety cases.',
    requiresMfa: true,
  },
  AUDITOR: {
    code: 'AUDITOR',
    label: 'Independent Auditor',
    shortLabel: 'Auditor',
    category: 'ADMIN',
    description:
      'Independent governance reviewer with read-only audit, ledger, and compliance export authority.',
    requiresMfa: true,
  },
  SUPER_ADMIN: {
    code: 'SUPER_ADMIN',
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    category: 'ADMIN',
    description:
      'Platform governance, RBAC authority, and national oversight (subject to immutable audit trails & dual approvals).',
    requiresMfa: true,
  },
};

export interface AuthUserSummary {
  id: string;
  email: string;
  fullName: string;
  phoneE164: string | null;
  countryCode: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  mfaVerifiedInSession: boolean;
  approvalStatus: ApprovalStatus;
  roles: RoleCode[];
  activeRole: RoleCode;
  permissions: string[];
}
