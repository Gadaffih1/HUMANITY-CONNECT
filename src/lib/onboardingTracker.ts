export type OnboardingCategory =
  | 'DOCUMENT_SUBMISSION'
  | 'TRAINING_COMPLETION'
  | 'CREDENTIAL_VERIFICATION';

export type OnboardingMilestoneStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'WAIVED'
  | 'REJECTED';

export type OnboardingOverallStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_FOR_ACTIVATION'
  | 'COMPLETED';

export interface OnboardingMilestone {
  code: string;
  category: OnboardingCategory;
  title: string;
  description: string;
  required: boolean;
  status: OnboardingMilestoneStatus;
  evidenceRef?: string;
  notes?: string;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedByName?: string;
  verifiedByUserId?: string;
}

export interface OnboardingTrackSummary {
  completedCount: number;
  totalCount: number;
  pct: number;
}

export interface OnboardingProgressSummary {
  totalMilestones: number;
  requiredMilestones: number;
  completedRequiredCount: number;
  submittedCount: number;
  rejectedCount: number;
  completionPct: number;
  overallStatus: OnboardingOverallStatus;
  tracks: Record<OnboardingCategory, OnboardingTrackSummary>;
}

export function buildDefaultOnboardingMilestones(params: {
  jobId: string;
  jobTitle: string;
  department: string;
  requiredQualifications: string;
  professionalQualifications: string;
  safeguardingResponsibilities: string;
  applicationDocsVerified?: boolean;
  backgroundCleared?: boolean;
  alreadyActivated?: boolean;
}): OnboardingMilestone[] {
  const nowIso = new Date().toISOString();

  return [
    // 1. Document Submissions (4 milestones)
    {
      code: 'DOC_CONTRACT',
      category: 'DOCUMENT_SUBMISSION',
      title: 'Signed Appointment Letter & NDA / Oath of Confidentiality',
      description: `Executed contract for ${params.jobTitle} (${params.jobId}) and signed Humanitarian Code of Conduct.`,
      required: true,
      status: 'PENDING',
    },
    {
      code: 'DOC_STATUTORY_ID',
      category: 'DOCUMENT_SUBMISSION',
      title: 'National ID / Passport, KRA PIN, SHA & NSSF Statutory Dossier',
      description: 'Certified identity document and statutory payroll/compliance registrations uploaded.',
      required: true,
      status: params.applicationDocsVerified ? 'SUBMITTED' : 'PENDING',
      ...(params.applicationDocsVerified
        ? { submittedAt: nowIso, notes: 'Carried forward from Recruitment Document Check.' }
        : {}),
    },
    {
      code: 'DOC_EMERGENCY_REMITTANCE',
      category: 'DOCUMENT_SUBMISSION',
      title: 'Next-of-Kin Emergency Contact & Official Remittance Form',
      description: 'Verified emergency responder contact card and banking/remittance authorisation.',
      required: true,
      status: 'PENDING',
    },
    {
      code: 'DOC_SAFEGUARDING_CHARTER',
      category: 'DOCUMENT_SUBMISSION',
      title: 'Signed Child Safeguarding & PSEA Zero-Tolerance Declaration',
      description: params.safeguardingResponsibilities,
      required: true,
      status: 'PENDING',
    },

    // 2. Training Completion (3 milestones)
    {
      code: 'TRN_INDUCTION',
      category: 'TRAINING_COMPLETION',
      title: 'HUMANITY CONNECT Mission & Ethics Orientation',
      description: 'Core humanitarian principles, accountability charter, and separation-of-duties briefing.',
      required: true,
      status: 'PENDING',
    },
    {
      code: 'TRN_SAFEGUARDING_ODPC',
      category: 'TRAINING_COMPLETION',
      title: 'Child Safeguarding, PSEA & Kenya ODPC Data Protection Course',
      description: 'Mandatory protection protocols and encrypted beneficiary privacy handling.',
      required: true,
      status: 'PENDING',
    },
    {
      code: 'TRN_DEPT_SOP',
      category: 'TRAINING_COMPLETION',
      title: `${params.department} Operational & Reporting SOP Workshop`,
      description: `Departmental induction covering workflows, reporting cadences, and supervision for ${params.jobId}.`,
      required: true,
      status: 'PENDING',
    },

    // 3. Credential Verification (3 milestones)
    {
      code: 'CRED_ACADEMIC',
      category: 'CREDENTIAL_VERIFICATION',
      title: 'Academic Qualifications Authentication',
      description: `Primary source verification against requirement: ${params.requiredQualifications}`,
      required: true,
      status: params.applicationDocsVerified ? 'SUBMITTED' : 'PENDING',
      ...(params.applicationDocsVerified
        ? { submittedAt: nowIso, notes: 'Submitted transcripts queued for HR authentication.' }
        : {}),
    },
    {
      code: 'CRED_STATUTORY_LICENCE',
      category: 'CREDENTIAL_VERIFICATION',
      title: 'Professional Membership / Statutory Practising Certificate',
      description: `Independent verification against requirement: ${params.professionalQualifications}`,
      required: true,
      status: 'PENDING',
    },
    {
      code: 'CRED_BACKGROUND_SECURITY',
      category: 'CREDENTIAL_VERIFICATION',
      title: 'Police Clearance (Certificate of Good Conduct) & Reference Checks',
      description: 'Verified criminal background clearance and at least two satisfactory referee checks.',
      required: true,
      status: params.backgroundCleared ? 'VERIFIED' : 'PENDING',
      ...(params.backgroundCleared
        ? {
            verifiedAt: nowIso,
            verifiedByName: 'Recruitment Vetting Pipeline',
            notes: 'Background & suitability clearance carried forward from Stage 9.',
          }
        : {}),
    },
  ];
}

export function computeOnboardingProgress(
  milestones: OnboardingMilestone[],
  alreadyCompleted = false
): OnboardingProgressSummary {
  const categories: OnboardingCategory[] = [
    'DOCUMENT_SUBMISSION',
    'TRAINING_COMPLETION',
    'CREDENTIAL_VERIFICATION',
  ];

  const tracks = {} as Record<OnboardingCategory, OnboardingTrackSummary>;
  for (const cat of categories) {
    const items = milestones.filter((m) => m.category === cat);
    const done = items.filter((m) => m.status === 'VERIFIED' || m.status === 'WAIVED').length;
    tracks[cat] = {
      completedCount: done,
      totalCount: items.length,
      pct: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
    };
  }

  const required = milestones.filter((m) => m.required);
  const completedRequiredCount = required.filter(
    (m) => m.status === 'VERIFIED' || m.status === 'WAIVED'
  ).length;
  const submittedCount = milestones.filter((m) => m.status === 'SUBMITTED').length;
  const rejectedCount = milestones.filter((m) => m.status === 'REJECTED').length;
  const totalMilestones = milestones.length;

  const completionPct =
    required.length > 0 ? Math.round((completedRequiredCount / required.length) * 100) : 0;

  let overallStatus: OnboardingOverallStatus;
  if (alreadyCompleted && rejectedCount === 0 && completionPct === 100) {
    overallStatus = 'COMPLETED';
  } else if (rejectedCount > 0) {
    overallStatus = 'BLOCKED';
  } else if (required.length > 0 && completedRequiredCount === required.length) {
    overallStatus = 'READY_FOR_ACTIVATION';
  } else if (completedRequiredCount === 0 && submittedCount === 0) {
    overallStatus = 'NOT_STARTED';
  } else {
    overallStatus = 'IN_PROGRESS';
  }

  return {
    totalMilestones,
    requiredMilestones: required.length,
    completedRequiredCount,
    submittedCount,
    rejectedCount,
    completionPct,
    overallStatus,
    tracks,
  };
}

export function canVerifyOnboardingMilestone(
  actorUserId: string,
  subjectUserId?: string | null
): { allowed: boolean; reason?: string } {
  if (subjectUserId && actorUserId === subjectUserId) {
    return {
      allowed: false,
      reason:
        'Separation of duties enforced: a staff member may submit evidence for their own onboarding milestones, but cannot self-verify or waive credentials.',
    };
  }
  return { allowed: true };
}

export function isOnboardingReadyForActivation(milestones: OnboardingMilestone[]): {
  ready: boolean;
  missingTitles: string[];
} {
  const missing = milestones
    .filter((m) => m.required && m.status !== 'VERIFIED' && m.status !== 'WAIVED')
    .map((m) => m.title);
  return { ready: missing.length === 0, missingTitles: missing };
}
