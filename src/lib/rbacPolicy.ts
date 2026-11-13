import {
  ADMIN_ACCESS_ROLE_CODES,
  CRITICAL_ROLE_CODES,
  PERMISSION_ACTION_VERBS,
  ROLE_DEFINITIONS,
  SUB_ADMIN_PERMISSION_FLAGS,
  type PermissionActionVerb,
  type RoleCode,
  type SubAdminPermissionFlag,
} from '../types/domain.ts';

export interface RolePermissionMatrixEntry {
  roleCode: RoleCode;
  roleLabel: string;
  isCriticalRole: boolean;
  allowedModules: Array<{
    module: string;
    actions: PermissionActionVerb[];
    scopeNote: string;
  }>;
  deniedBoundaries: string[];
}

export const ROLE_PERMISSION_MATRIX: Record<RoleCode, RolePermissionMatrixEntry> = {
  SUPER_ADMIN: {
    roleCode: 'SUPER_ADMIN',
    roleLabel: 'Super Admin',
    isCriticalRole: true,
    allowedModules: [
      {
        module: 'RBAC & Governance',
        actions: ['View', 'Create', 'Edit', 'Assign', 'Approve', 'Manage', 'Export', 'Audit'],
        scopeNote: 'Cannot delete or edit immutable audit logs; cannot self-approve critical financial or disciplinary actions.',
      },
      {
        module: 'Verification & Needs',
        actions: ['View', 'Verify', 'Recommend', 'Approve', 'Publish', 'Export'],
        scopeNote: 'Subject to mandatory human rationale & safeguarding separation.',
      },
      {
        module: 'HR, Recruitment & Org Leadership',
        actions: ['View', 'Create', 'Edit', 'Approve', 'Assign', 'Publish', 'Manage', 'Export'],
        scopeNote: 'Two-person approval enforced on JD revisions and appointments.',
      },
      {
        module: 'Finance & Central Funds',
        actions: ['View', 'Create', 'Approve', 'Manage', 'Export'],
        scopeNote: 'Maker-checker enforcement prevents approving own financial transactions.',
      },
    ],
    deniedBoundaries: [
      'Super Admin CANNOT erase, modify, or truncate audit_logs (append-only enforced).',
      'Super Admin CANNOT bypass mandatory maker-checker financial approvals or self-approve own appointments/revisions.',
      'Super Admin CANNOT self-resolve safeguarding or disciplinary investigations involving themselves.',
    ],
  },
  VERIFICATION_OFFICER: {
    roleCode: 'VERIFICATION_OFFICER',
    roleLabel: 'Verification Officer',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Verification Centre (V0–V4)',
        actions: ['View', 'Edit', 'Submit', 'Verify', 'Recommend', 'Export'],
        scopeNote: 'Reviews IDs, guardian documents, field visit notes, and recommends V4 status.',
      },
      {
        module: 'Needs Engine (15 Categories)',
        actions: ['View', 'Verify', 'Recommend'],
        scopeNote: 'Assesses 100-point priority models and recommends priority tiers.',
      },
    ],
    deniedBoundaries: [
      'Verification officers MAY verify and recommend cases but CANNOT independently release or disburse funds.',
      'Cannot modify RBAC roles or delete audit trails.',
    ],
  },
  FINANCE_OFFICER: {
    roleCode: 'FINANCE_OFFICER',
    roleLabel: 'Finance & Accounts Officer',
    isCriticalRole: true,
    allowedModules: [
      {
        module: 'Finance, Daraja & Double-Entry Ledger',
        actions: ['View', 'Create', 'Submit', 'Manage', 'Export'],
        scopeNote: 'Processes authorised payments, reconciliations, and prepares maker-checker requests.',
      },
      {
        module: 'Departmental Finance Workspace',
        actions: ['View', 'Create', 'Edit', 'Submit', 'Export'],
        scopeNote: 'Restricted to Finance, Donations & Sponsorship department operations.',
      },
    ],
    deniedBoundaries: [
      'Finance officers MAY process authorised payments but CANNOT approve their own maker-checker transactions.',
      'Cannot access unrelated Safeguarding or HR disciplinary narratives.',
    ],
  },
  COUNTY_REPRESENTATIVE: {
    roleCode: 'COUNTY_REPRESENTATIVE',
    roleLabel: 'County Representative',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Assigned County Operations & Field Personnel',
        actions: ['View', 'Create', 'Edit', 'Submit', 'Assign', 'Manage', 'Export'],
        scopeNote: 'Strictly scoped to assigned Kenyan county/sub-county jurisdiction unless cross-county clearance is granted.',
      },
      {
        module: 'County Beneficiary Follow-Up & Verification',
        actions: ['View', 'Verify', 'Recommend', 'Submit'],
        scopeNote: 'Scoped to assigned county verification queue.',
      },
    ],
    deniedBoundaries: [
      'County officers MAY manage assigned county activities ONLY unless formally authorised for additional counties.',
      'Cannot release central funds or view other counties confidential safeguarding records.',
    ],
  },
  FIELD_OFFICER: {
    roleCode: 'FIELD_OFFICER',
    roleLabel: 'Field Officer',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Assigned County Field Visits & Offline Vault',
        actions: ['View', 'Create', 'Edit', 'Submit', 'Verify', 'Recommend'],
        scopeNote: 'Conducts physical household verifications within assigned county/ward.',
      },
    ],
    deniedBoundaries: [
      'Restricted to assigned county/ward geography unless formally authorised.',
      'Cannot disburse funds or alter HR employee disciplinary files.',
    ],
  },
  WELFARE_OFFICER: {
    roleCode: 'WELFARE_OFFICER',
    roleLabel: 'Social Welfare Officer',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Social Welfare & Beneficiary Support Workspace',
        actions: ['View', 'Create', 'Edit', 'Submit', 'Recommend'],
        scopeNote: 'Manages household follow-ups, family welfare plans, referrals, and empowerment milestones.',
      },
    ],
    deniedBoundaries: [
      'Cannot independently disburse funds or alter RBAC roles.',
      'Protected child-safeguarding disclosures require dedicated safeguarding officer clearance.',
    ],
  },
  SAFEGUARDING_OFFICER: {
    roleCode: 'SAFEGUARDING_OFFICER',
    roleLabel: 'Safeguarding Officer',
    isCriticalRole: true,
    allowedModules: [
      {
        module: 'Safeguarding & Protection Partition',
        actions: ['View', 'Create', 'Edit', 'Verify', 'Recommend', 'Approve', 'Assign', 'Manage', 'Audit'],
        scopeNote: 'Independent encrypted access to child protection, DPIA retention, and protection concerns.',
      },
    ],
    deniedBoundaries: [
      'Independent oversight — cannot approve their own safeguarding investigation or financial disbursements.',
      'Confidential safeguarding facts may never be broadcast to general staff communication channels.',
    ],
  },
  HR_OFFICER: {
    roleCode: 'HR_OFFICER',
    roleLabel: 'HR Officer',
    isCriticalRole: true,
    allowedModules: [
      {
        module: 'Staff Establishment, JDs, Recruitment & Profiles',
        actions: ['View', 'Create', 'Edit', 'Submit', 'Recommend', 'Publish', 'Manage', 'Export'],
        scopeNote: 'Proposes JD revisions (requires independent approver), runs 15-stage recruitment, updates staff records.',
      },
      {
        module: 'Performance & HR Reporting Centre',
        actions: ['View', 'Create', 'Edit', 'Verify', 'Export'],
        scopeNote: 'Compiles organisational staffing & capacity reports excluding public employee PII.',
      },
    ],
    deniedBoundaries: [
      'HR officers MAY manage staff records but MUST NOT access unrelated safeguarding investigations.',
      'HR officers CANNOT approve their own JD revisions or their own appointment/promotion.',
    ],
  },
  DATA_MANAGEMENT_OFFICER: {
    roleCode: 'DATA_MANAGEMENT_OFFICER',
    roleLabel: 'Data Management Officer',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'M&E, Accountability & Data Quality',
        actions: ['View', 'Edit', 'Verify', 'Recommend', 'Export'],
        scopeNote: 'Manages duplicate detection, anonymised DPIA retention checks, and M&E indicator reports.',
      },
    ],
    deniedBoundaries: [
      'Cannot release financial disbursements or resolve safeguarding investigations.',
    ],
  },
  AUDITOR: {
    roleCode: 'AUDITOR',
    roleLabel: 'Independent Auditor',
    isCriticalRole: true,
    allowedModules: [
      {
        module: 'Independent Oversight & Governance Audit',
        actions: ['View', 'Export', 'Audit'],
        scopeNote: 'Independent read-only access to audit trails, access logs, ledgers, and compliance reports.',
      },
    ],
    deniedBoundaries: [
      'Auditors have independent review access ONLY — strictly read-only on operational ledgers and verification approvals.',
    ],
  },
  SUPPORTIVE: {
    roleCode: 'SUPPORTIVE',
    roleLabel: 'Supportive Member (Donor)',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Public Verified Cases & Personal Giving',
        actions: ['View', 'Create', 'Export'],
        scopeNote: 'Public V4 consented profiles & own donation receipts only.',
      },
    ],
    deniedBoundaries: [
      'Donors MUST NOT access private beneficiary records, unredacted contact info, or internal staff workspaces.',
      'Volunteers without privileged clearance cannot access confidential beneficiary data beyond approved tasks.',
    ],
  },
  WELL_WISHER: {
    roleCode: 'WELL_WISHER',
    roleLabel: 'Well Wisher / Corporate Partner',
    isCriticalRole: false,
    allowedModules: [
      {
        module: 'Corporate CSR Pools & Impact Statements',
        actions: ['View', 'Create', 'Export'],
        scopeNote: 'Consented public stories, CSR fund balances, and personal giving statements.',
      },
    ],
    deniedBoundaries: [
      'Donors & Corporate Partners MUST NOT access private beneficiary records.',
    ],
  },
  ORPHAN_GUARDIAN: {
    roleCode: 'ORPHAN_GUARDIAN',
    roleLabel: 'Orphan / Guardian Beneficiary',
    isCriticalRole: false,
    allowedModules: [{ module: 'Own Household & Need Requests', actions: ['View', 'Create', 'Edit', 'Submit'], scopeNote: 'Own records & consent controls only.' }],
    deniedBoundaries: ['No access to other beneficiaries or admin workspaces.'],
  },
  DESTITUTE: {
    roleCode: 'DESTITUTE',
    roleLabel: 'Destitute Beneficiary',
    isCriticalRole: false,
    allowedModules: [{ module: 'Own Household & Need Requests', actions: ['View', 'Create', 'Edit', 'Submit'], scopeNote: 'Own records & consent controls only.' }],
    deniedBoundaries: ['No access to other beneficiaries or admin workspaces.'],
  },
  NEEDY: {
    roleCode: 'NEEDY',
    roleLabel: 'Needy Beneficiary',
    isCriticalRole: false,
    allowedModules: [{ module: 'Own Household & Need Requests', actions: ['View', 'Create', 'Edit', 'Submit'], scopeNote: 'Own records & consent controls only.' }],
    deniedBoundaries: ['No access to other beneficiaries or admin workspaces.'],
  },
};

export interface PermissionPreviewResult {
  targetRoleCode: RoleCode | null;
  targetRoleMeta: RolePermissionMatrixEntry | null;
  selectedFlags: SubAdminPermissionFlag[];
  grantedVerbs: PermissionActionVerb[];
  isCriticalChange: boolean;
  requiresAdditionalAuthorization: boolean;
  conflicts: string[];
  enforcedSafeguards: string[];
}

export function buildPermissionPreview(params: {
  existingRoles: RoleCode[];
  newRoleCode?: RoleCode | null;
  selectedFlags: SubAdminPermissionFlag[];
}): PermissionPreviewResult {
  const effectiveRole = params.newRoleCode || params.existingRoles.find((r) => ADMIN_ACCESS_ROLE_CODES.includes(r)) || null;
  const entry = effectiveRole ? ROLE_PERMISSION_MATRIX[effectiveRole] : null;
  const verbs = new Set<PermissionActionVerb>();

  if (entry) {
    for (const m of entry.allowedModules) {
      m.actions.forEach((a) => verbs.add(a));
    }
  }
  for (const f of params.selectedFlags) {
    if (f === 'canVerifyNeed' || f === 'canVerifyUsers') {
      verbs.add('View');
      verbs.add('Verify');
      verbs.add('Recommend');
    }
    if (f === 'canDisburseFunds' || f === 'canManageFinanceAccounts') {
      verbs.add('View');
      verbs.add('Create');
      verbs.add('Manage');
      verbs.add('Export');
    }
    if (f === 'canManageSafeguarding') {
      verbs.add('View');
      verbs.add('Verify');
      verbs.add('Recommend');
      verbs.add('Manage');
      verbs.add('Audit');
    }
    if (f === 'canManageCountyOps') {
      verbs.add('View');
      verbs.add('Create');
      verbs.add('Edit');
      verbs.add('Assign');
      verbs.add('Manage');
    }
    if (f === 'canManageData') {
      verbs.add('View');
      verbs.add('Verify');
      verbs.add('Export');
      verbs.add('Audit');
    }
    if (f === 'canManageHR') {
      verbs.add('View');
      verbs.add('Create');
      verbs.add('Edit');
      verbs.add('Submit');
      verbs.add('Publish');
      verbs.add('Manage');
      verbs.add('Export');
    }
  }

  const conflicts: string[] = [];
  // Enforce Verification Officers cannot disburse funds
  if (
    effectiveRole === 'VERIFICATION_OFFICER' &&
    (params.selectedFlags.includes('canDisburseFunds') ||
      params.selectedFlags.includes('canManageFinanceAccounts'))
  ) {
    conflicts.push(
      'Rule #1 Separation Conflict: Verification Officers verify/recommend cases and CANNOT hold canDisburseFunds or canManageFinanceAccounts.'
    );
  }
  // Enforce HR Officers cannot hold safeguarding investigation rights
  if (effectiveRole === 'HR_OFFICER' && params.selectedFlags.includes('canManageSafeguarding')) {
    conflicts.push(
      'Rule #7 Separation Conflict: HR Officers manage staff records and MUST NOT hold unrelated Safeguarding investigation rights.'
    );
  }
  // Enforce Auditors remain read-only
  if (
    effectiveRole === 'AUDITOR' &&
    (params.selectedFlags.includes('canDisburseFunds') ||
      params.selectedFlags.includes('canVerifyUsers') ||
      params.selectedFlags.includes('canManageHR'))
  ) {
    conflicts.push(
      'Rule #8 Auditor Independence Conflict: Independent Auditors must remain read-only/audit-only without operational write flags.'
    );
  }

  const hasCriticalFlag = params.selectedFlags.some(
    (code) => SUB_ADMIN_PERMISSION_FLAGS.find((f) => f.code === code)?.critical
  );
  const isCriticalChange = Boolean(
    (effectiveRole && CRITICAL_ROLE_CODES.includes(effectiveRole)) || hasCriticalFlag
  );

  const enforcedSafeguards: string[] = [
    ...(entry?.deniedBoundaries || []),
    'All role assignments, permission flag changes, and sensitive accesses are permanently written to the immutable access audit log.',
    'All 12 permission action verbs follow strict least-privilege defaults.',
  ];

  return {
    targetRoleCode: effectiveRole,
    targetRoleMeta: entry,
    selectedFlags: params.selectedFlags,
    grantedVerbs: PERMISSION_ACTION_VERBS.filter((v) => verbs.has(v)),
    isCriticalChange,
    requiresAdditionalAuthorization: isCriticalChange,
    conflicts,
    enforcedSafeguards,
  };
}

/**
 * Screens general staff communication channels to keep confidential
 * safeguarding, minor identities, and beneficiary private details out of open feeds.
 */
export function screenGeneralCommunicationForConfidentiality(inputText: string): {
  allowed: boolean;
  reason?: string;
} {
  const normalized = inputText.toLowerCase();
  const forbiddenPatterns: Array<{ regex: RegExp; msg: string }> = [
    {
      regex: /\b(hc-ke-\d{4}-\d{3,6}|national id[:\s]*\d{6,10})\b/i,
      msg: 'Contains identifiable beneficiary case ID or National ID number. Use encrypted Verification/Safeguarding case notes instead.',
    },
    {
      regex: /\b(hiv status|sexual abuse|rape|defilement|suicide attempt|child abuse victim)\b/i,
      msg: 'Contains sensitive safeguarding or clinical disclosure. Escalate strictly inside the protected Safeguarding & Protection partition.',
    },
    {
      regex: /\b\+?2547\d{8}\b/,
      msg: 'Contains an unredacted personal Kenyan phone number (MSISDN). Protect beneficiary & staff contact PII.',
    },
  ];
  for (const rule of forbiddenPatterns) {
    if (rule.regex.test(normalized)) {
      return { allowed: false, reason: rule.msg };
    }
  }
  return { allowed: true };
}

export function userCanViewRestrictedHrDisciplinary(roles: string[], permissions: string[]): boolean {
  return roles.includes('SUPER_ADMIN') || roles.includes('HR_OFFICER') || roles.includes('AUDITOR') || permissions.includes('canManageHR');
}

export function userCanViewSafeguardingCases(roles: string[], permissions: string[]): boolean {
  // Rule 7: HR officers must NOT access unrelated safeguarding investigations unless also SAFEGUARDING_OFFICER/SUPER_ADMIN
  if (roles.includes('SUPER_ADMIN') || roles.includes('SAFEGUARDING_OFFICER') || roles.includes('WELFARE_OFFICER')) {
    return true;
  }
  if (roles.includes('HR_OFFICER') && !roles.includes('SAFEGUARDING_OFFICER')) {
    return false;
  }
  return permissions.includes('canManageSafeguarding');
}

export function getAuthorizedRoleMetadata(roleCode: RoleCode) {
  return ROLE_DEFINITIONS[roleCode];
}
