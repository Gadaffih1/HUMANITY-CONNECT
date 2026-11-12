export type RoleCode =
  | 'ORPHAN_GUARDIAN'
  | 'DESTITUTE'
  | 'NEEDY'
  | 'SUPPORTIVE'
  | 'WELL_WISHER'
  | 'SUPER_ADMIN'
  | 'FIELD_OFFICER';

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
    shortLabel: 'Field Ops',
    category: 'ADMIN',
    description:
      'Authorised regional verification and safeguarding specialist conducting county field visits.',
    requiresMfa: true,
  },
  SUPER_ADMIN: {
    code: 'SUPER_ADMIN',
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    category: 'ADMIN',
    description:
      'Governance, verification approval, safeguarding oversight, and dual-ledger disbursement authority (MFA mandatory).',
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
