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

export interface OnboardingDashboardChecklistInput {
  id: string;
  onboardingRef: string;
  userId?: string | null;
  jobId: string;
  departmentNumber: number;
  department: string;
  jobTitle: string;
  newHireName: string;
  newHireEmail: string;
  overallStatus: string;
  completionPct: number;
  tracks?: Record<OnboardingCategory, OnboardingTrackSummary>;
  completedRequiredCount?: number;
  requiredMilestones?: number;
  submittedCount?: number;
  rejectedCount?: number;
  dueDate?: string | null;
  milestones: OnboardingMilestone[];
}

export interface DepartmentOnboardingReadiness {
  departmentNumber: number;
  department: string;
  hireCount: number;
  avgCompletionPct: number;
  readyOrCompletedCount: number;
  blockedCount: number;
}

export interface OnboardingDashboardMetrics {
  totalHires: number;
  avgOverallPct: number;
  trackCompletionPct: Record<OnboardingCategory, number>;
  trackCompletedTotals: Record<OnboardingCategory, { completed: number; total: number }>;
  pendingDocumentCount: number;
  pendingTrainingCount: number;
  pendingCredentialCount: number;
  awaitingVerificationCount: number;
  rejectedBlockerCount: number;
  overdueChecklistCount: number;
  departmentReadiness: DepartmentOnboardingReadiness[];
}

export interface OnboardingPendingTimelineItem {
  key: string;
  checklistId: string;
  onboardingRef: string;
  userId?: string | null;
  newHireName: string;
  jobId: string;
  jobTitle: string;
  department: string;
  dueDate: string | null;
  isOverdue: boolean;
  phaseOrder: number;
  phaseLabel: string;
  dayWindow: string;
  milestone: OnboardingMilestone;
}

export function getOnboardingMilestoneScheduleMeta(category: OnboardingCategory): {
  phaseOrder: number;
  phaseLabel: string;
  dayWindow: string;
  shortLabel: string;
} {
  switch (category) {
    case 'DOCUMENT_SUBMISSION':
      return {
        phaseOrder: 1,
        phaseLabel: 'Phase 1 · Document Intake',
        dayWindow: 'Days 1–3',
        shortLabel: 'Document',
      };
    case 'TRAINING_COMPLETION':
      return {
        phaseOrder: 2,
        phaseLabel: 'Phase 2 · Mandatory Training',
        dayWindow: 'Days 4–7',
        shortLabel: 'Training',
      };
    case 'CREDENTIAL_VERIFICATION':
    default:
      return {
        phaseOrder: 3,
        phaseLabel: 'Phase 3 · Credential & Security Checks',
        dayWindow: 'Days 8–12',
        shortLabel: 'Credential',
      };
  }
}

export function isChecklistOverdue(
  dueDate?: string | null,
  overallStatus?: string,
  referenceDateIso?: string
): boolean {
  if (!dueDate || overallStatus === 'COMPLETED') return false;
  const refDay = (referenceDateIso || new Date().toISOString()).slice(0, 10);
  return dueDate < refDay;
}

export function buildOnboardingDashboardMetrics(
  checklists: OnboardingDashboardChecklistInput[],
  referenceDateIso?: string
): OnboardingDashboardMetrics {
  const categories: OnboardingCategory[] = [
    'DOCUMENT_SUBMISSION',
    'TRAINING_COMPLETION',
    'CREDENTIAL_VERIFICATION',
  ];

  const trackCompletedTotals: Record<OnboardingCategory, { completed: number; total: number }> = {
    DOCUMENT_SUBMISSION: { completed: 0, total: 0 },
    TRAINING_COMPLETION: { completed: 0, total: 0 },
    CREDENTIAL_VERIFICATION: { completed: 0, total: 0 },
  };

  let pendingDocumentCount = 0;
  let pendingTrainingCount = 0;
  let pendingCredentialCount = 0;
  let awaitingVerificationCount = 0;
  let rejectedBlockerCount = 0;
  let overdueChecklistCount = 0;

  const deptMap = new Map<
    number,
    {
      departmentNumber: number;
      department: string;
      hireCount: number;
      pctSum: number;
      readyOrCompletedCount: number;
      blockedCount: number;
    }
  >();

  for (const c of checklists) {
    if (isChecklistOverdue(c.dueDate, c.overallStatus, referenceDateIso)) {
      overdueChecklistCount += 1;
    }

    const existingDept = deptMap.get(c.departmentNumber) || {
      departmentNumber: c.departmentNumber,
      department: c.department,
      hireCount: 0,
      pctSum: 0,
      readyOrCompletedCount: 0,
      blockedCount: 0,
    };
    existingDept.hireCount += 1;
    existingDept.pctSum += c.completionPct || 0;
    if (c.overallStatus === 'COMPLETED' || c.overallStatus === 'READY_FOR_ACTIVATION') {
      existingDept.readyOrCompletedCount += 1;
    }
    if (c.overallStatus === 'BLOCKED') {
      existingDept.blockedCount += 1;
    }
    deptMap.set(c.departmentNumber, existingDept);

    for (const ms of c.milestones || []) {
      const done = ms.status === 'VERIFIED' || ms.status === 'WAIVED';
      if (trackCompletedTotals[ms.category]) {
        trackCompletedTotals[ms.category].total += 1;
        if (done) trackCompletedTotals[ms.category].completed += 1;
      }
      if (!done) {
        if (ms.category === 'DOCUMENT_SUBMISSION') pendingDocumentCount += 1;
        else if (ms.category === 'TRAINING_COMPLETION') pendingTrainingCount += 1;
        else if (ms.category === 'CREDENTIAL_VERIFICATION') pendingCredentialCount += 1;
      }
      if (ms.status === 'SUBMITTED') awaitingVerificationCount += 1;
      if (ms.status === 'REJECTED') rejectedBlockerCount += 1;
    }
  }

  const totalHires = checklists.length;
  const avgOverallPct =
    totalHires > 0
      ? Math.round(checklists.reduce((sum, c) => sum + (c.completionPct || 0), 0) / totalHires)
      : 0;

  const trackCompletionPct = {} as Record<OnboardingCategory, number>;
  for (const cat of categories) {
    const t = trackCompletedTotals[cat];
    trackCompletionPct[cat] = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
  }

  const departmentReadiness: DepartmentOnboardingReadiness[] = Array.from(deptMap.values())
    .map((d) => ({
      departmentNumber: d.departmentNumber,
      department: d.department,
      hireCount: d.hireCount,
      avgCompletionPct: d.hireCount > 0 ? Math.round(d.pctSum / d.hireCount) : 0,
      readyOrCompletedCount: d.readyOrCompletedCount,
      blockedCount: d.blockedCount,
    }))
    .sort((a, b) => a.departmentNumber - b.departmentNumber);

  return {
    totalHires,
    avgOverallPct,
    trackCompletionPct,
    trackCompletedTotals,
    pendingDocumentCount,
    pendingTrainingCount,
    pendingCredentialCount,
    awaitingVerificationCount,
    rejectedBlockerCount,
    overdueChecklistCount,
    departmentReadiness,
  };
}

export function buildPendingMilestonesTimeline(
  checklists: OnboardingDashboardChecklistInput[],
  referenceDateIso?: string
): OnboardingPendingTimelineItem[] {
  const items: OnboardingPendingTimelineItem[] = [];

  for (const c of checklists) {
    const overdue = isChecklistOverdue(c.dueDate, c.overallStatus, referenceDateIso);
    for (const ms of c.milestones || []) {
      if (ms.status === 'VERIFIED' || ms.status === 'WAIVED') continue;
      const meta = getOnboardingMilestoneScheduleMeta(ms.category);
      items.push({
        key: `${c.id}:${ms.code}`,
        checklistId: c.id,
        onboardingRef: c.onboardingRef,
        userId: c.userId,
        newHireName: c.newHireName,
        jobId: c.jobId,
        jobTitle: c.jobTitle,
        department: c.department,
        dueDate: c.dueDate || null,
        isOverdue: overdue,
        phaseOrder: meta.phaseOrder,
        phaseLabel: meta.phaseLabel,
        dayWindow: meta.dayWindow,
        milestone: ms,
      });
    }
  }

  const statusRank = (status: OnboardingMilestoneStatus): number => {
    switch (status) {
      case 'REJECTED':
        return 0; // Immediate attention blocker
      case 'SUBMITTED':
        return 1; // Ready for HR / supervisor verification
      case 'PENDING':
      default:
        return 2; // Awaiting new hire submission or completion
    }
  };

  return items.sort((a, b) => {
    const rankDiff = statusRank(a.milestone.status) - statusRank(b.milestone.status);
    if (rankDiff !== 0) return rankDiff;

    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;

    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);

    if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;

    return a.onboardingRef.localeCompare(b.onboardingRef);
  });
}

