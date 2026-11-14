import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORGANISATIONAL_DEPARTMENTS,
  STAFF_ESTABLISHMENT_170,
} from '../data/staffEstablishment.ts';
import {
  buildPermissionPreview,
  screenGeneralCommunicationForConfidentiality,
  userCanViewSafeguardingCases,
} from './rbacPolicy.ts';
import {
  KENYAN_47_COUNTIES,
  RECRUITMENT_STAGES,
  STAFF_EMPLOYMENT_STATUSES,
} from '../types/domain.ts';
import {
  calculateSmsUnits,
  mapTalkSasaDlrStatus,
  maskSensitiveSmsText,
  normalizeKenyanMsisdn,
} from './talksasaUtils.ts';
import {
  buildDefaultOnboardingMilestones,
  buildOnboardingDashboardMetrics,
  buildPendingMilestonesTimeline,
  canVerifyOnboardingMilestone,
  computeOnboardingProgress,
  isOnboardingReadyForActivation,
} from './onboardingTracker.ts';

test('Establishment contains all 170 unique positions across 15 departments with zero fake incumbents', () => {
  assert.equal(ORGANISATIONAL_DEPARTMENTS.length, 15);
  assert.equal(STAFF_ESTABLISHMENT_170.length, 170);

  const plannedSum = ORGANISATIONAL_DEPARTMENTS.reduce((sum, d) => sum + d.plannedCount, 0);
  assert.equal(plannedSum, 170);

  const seenIds = new Set<string>();
  const deptCounts = new Map<number, number>();
  for (const pos of STAFF_ESTABLISHMENT_170) {
    assert.ok(!seenIds.has(pos.jobId), `Duplicate jobId detected: ${pos.jobId}`);
    seenIds.add(pos.jobId);
    deptCounts.set(pos.departmentNumber, (deptCounts.get(pos.departmentNumber) || 0) + 1);
    assert.equal(pos.incumbentName, null, `Position ${pos.jobId} must not ship with fake incumbent`);
    assert.equal(pos.vacancyStatus, 'VACANT');
    assert.ok(pos.mainResponsibilities.length > 0);
    assert.ok(pos.dailyResponsibilities.length > 0);
    assert.ok(pos.weeklyResponsibilities.length > 0);
    assert.ok(pos.monthlyResponsibilities.length > 0);
    assert.ok(pos.requiredQualifications.length > 5);
    assert.ok(pos.professionalQualifications.length > 3);
  }

  for (const dept of ORGANISATIONAL_DEPARTMENTS) {
    assert.equal(
      deptCounts.get(dept.number),
      dept.plannedCount,
      `Department ${dept.number} (${dept.name}) count mismatch`
    );
  }
});

test('Organisational reporting hierarchy is a valid acyclic DAG referencing existing supervisors', () => {
  const map = new Map(STAFF_ESTABLISHMENT_170.map((p) => [p.jobId, p.reportsToJobId]));
  for (const pos of STAFF_ESTABLISHMENT_170) {
    if (pos.reportsToJobId) {
      assert.ok(
        map.has(pos.reportsToJobId),
        `Position ${pos.jobId} references missing supervisor ${pos.reportsToJobId}`
      );
    }
    const visited = new Set<string>([pos.jobId]);
    let cursor = pos.reportsToJobId;
    while (cursor) {
      assert.ok(!visited.has(cursor), `Cycle detected at ${pos.jobId} -> ${cursor}`);
      visited.add(cursor);
      cursor = map.get(cursor) || null;
    }
  }
});

test('Kenya geography includes all 47 counties, 15 recruitment stages, and 9 staff statuses', () => {
  assert.equal(KENYAN_47_COUNTIES.length, 47);
  assert.equal(new Set(KENYAN_47_COUNTIES).size, 47);
  assert.equal(RECRUITMENT_STAGES.length, 15);
  assert.equal(STAFF_EMPLOYMENT_STATUSES.length, 9);
});

test('RBAC permission preview enforces separation-of-duties rules #1, #7, #8 and confidentiality screen', () => {
  // Rule #1: Verification Officer cannot hold canDisburseFunds
  const verifConflict = buildPermissionPreview({
    existingRoles: ['VERIFICATION_OFFICER'],
    newRoleCode: 'VERIFICATION_OFFICER',
    selectedFlags: ['canVerifyUsers', 'canDisburseFunds'],
  });
  assert.ok(verifConflict.conflicts.length > 0);

  // Rule #7: HR Officer cannot access Safeguarding investigations
  const hrConflict = buildPermissionPreview({
    existingRoles: ['HR_OFFICER'],
    newRoleCode: 'HR_OFFICER',
    selectedFlags: ['canManageHR', 'canManageSafeguarding'],
  });
  assert.ok(hrConflict.conflicts.length > 0);
  assert.equal(userCanViewSafeguardingCases(['HR_OFFICER'], ['canManageHR']), false);
  assert.equal(userCanViewSafeguardingCases(['SAFEGUARDING_OFFICER'], ['canManageSafeguarding']), true);

  // Rule #8: Auditor read-only oversight cannot mutate finance or verification
  const audConflict = buildPermissionPreview({
    existingRoles: ['AUDITOR'],
    newRoleCode: 'AUDITOR',
    selectedFlags: ['canManageData', 'canDisburseFunds'],
  });
  assert.ok(audConflict.conflicts.length > 0);

  // Confidentiality screen blocks beneficiary PII & safeguarding disclosures in general comms
  const blocked = screenGeneralCommunicationForConfidentiality(
    'Please update beneficiary child abuse report with National ID 12345678'
  );
  assert.equal(blocked.allowed, false);

  const safeMsg = screenGeneralCommunicationForConfidentiality(
    'Monthly staff coordination meeting scheduled for Friday 10:00 EAT.'
  );
  assert.equal(safeMsg.allowed, true);
});

test('Automated Onboarding Tracker generates 3-track milestones, computes progress, and blocks self-verification', () => {
  const milestones = buildDefaultOnboardingMilestones({
    jobId: 'HC-FAP-045',
    jobTitle: 'Senior Finance & Compliance Accountant',
    department: 'Finance, Accounting & Resource Stewardship',
    requiredQualifications: 'BCom Accounting / CPA(K)',
    professionalQualifications: 'ICPAK Practising Member in Good Standing',
    safeguardingResponsibilities: 'Financial integrity and zero-tolerance safeguarding charter.',
    applicationDocsVerified: true,
    backgroundCleared: true,
  });

  assert.equal(milestones.length, 10);
  const initial = computeOnboardingProgress(milestones, false);
  // 1 of 10 (CRED_BACKGROUND_SECURITY) carried forward as VERIFIED -> 10% IN_PROGRESS
  assert.equal(initial.completionPct, 10);
  assert.equal(initial.overallStatus, 'IN_PROGRESS');
  assert.equal(initial.tracks.DOCUMENT_SUBMISSION.totalCount, 4);
  assert.equal(initial.tracks.TRAINING_COMPLETION.totalCount, 3);
  assert.equal(initial.tracks.CREDENTIAL_VERIFICATION.completedCount, 1);

  // Self-verification blocked; independent verifier permitted
  assert.equal(canVerifyOnboardingMilestone('user-1', 'user-1').allowed, false);
  assert.equal(canVerifyOnboardingMilestone('hr-admin-2', 'user-1').allowed, true);

  // Rejecting one item automatically sets BLOCKED
  const withReject = milestones.map((m, idx) =>
    idx === 0 ? { ...m, status: 'REJECTED' as const } : m
  );
  assert.equal(computeOnboardingProgress(withReject, false).overallStatus, 'BLOCKED');

  // Verifying all required milestones marks READY_FOR_ACTIVATION & 100%
  const allVerified = milestones.map((m) => ({ ...m, status: 'VERIFIED' as const }));
  const doneProgress = computeOnboardingProgress(allVerified, false);
  assert.equal(doneProgress.completionPct, 100);
  assert.equal(doneProgress.overallStatus, 'READY_FOR_ACTIVATION');
  assert.equal(isOnboardingReadyForActivation(allVerified).ready, true);
});

test('Onboarding Progress Dashboard metrics and pending timeline sort blockers & overdue milestones first without fake data', () => {
  // Empty input yields honest zeros
  const emptyMetrics = buildOnboardingDashboardMetrics([], '2026-05-01');
  assert.equal(emptyMetrics.totalHires, 0);
  assert.equal(emptyMetrics.avgOverallPct, 0);
  assert.equal(emptyMetrics.pendingDocumentCount, 0);
  assert.equal(emptyMetrics.pendingTrainingCount, 0);
  assert.equal(emptyMetrics.pendingCredentialCount, 0);
  assert.equal(emptyMetrics.departmentReadiness.length, 0);
  assert.equal(buildPendingMilestonesTimeline([], '2026-05-01').length, 0);

  const msA = buildDefaultOnboardingMilestones({
    jobId: 'HC-VER-001',
    jobTitle: 'Verification Officer',
    department: 'Verification & Eligibility Assessment',
    requiredQualifications: 'BA Social Work',
    professionalQualifications: 'Registered Social Worker',
    safeguardingResponsibilities: 'Zero-tolerance safeguarding compliance',
  });
  // Mark 1 document REJECTED, 1 training SUBMITTED, others PENDING
  msA[0] = { ...msA[0], status: 'REJECTED' };
  msA[4] = { ...msA[4], status: 'SUBMITTED' };
  const progA = computeOnboardingProgress(msA, false);

  const msB = buildDefaultOnboardingMilestones({
    jobId: 'HC-FAP-001',
    jobTitle: 'Finance Officer',
    department: 'Finance, Accounting & Resource Stewardship',
    requiredQualifications: 'BCom',
    professionalQualifications: 'CPA(K)',
    safeguardingResponsibilities: 'Financial integrity charter',
    applicationDocsVerified: true,
    backgroundCleared: true,
  });
  // Mark all DOCUMENT_SUBMISSION verified on B
  for (let i = 0; i < 4; i++) {
    msB[i] = { ...msB[i], status: 'VERIFIED' };
  }
  const progB = computeOnboardingProgress(msB, false);

  const sampleChecklists = [
    {
      id: 'chk-a',
      onboardingRef: 'ONB-2026-001',
      userId: 'u-a',
      jobId: 'HC-VER-001',
      departmentNumber: 4,
      department: 'Verification & Eligibility Assessment',
      jobTitle: 'Verification Officer',
      newHireName: 'Applicant Alpha',
      newHireEmail: 'alpha@example.org',
      overallStatus: progA.overallStatus,
      completionPct: progA.completionPct,
      tracks: progA.tracks,
      dueDate: '2026-04-20', // Overdue relative to 2026-05-01
      milestones: msA,
    },
    {
      id: 'chk-b',
      onboardingRef: 'ONB-2026-002',
      userId: 'u-b',
      jobId: 'HC-FAP-001',
      departmentNumber: 8,
      department: 'Finance, Accounting & Resource Stewardship',
      jobTitle: 'Finance Officer',
      newHireName: 'Applicant Beta',
      newHireEmail: 'beta@example.org',
      overallStatus: progB.overallStatus,
      completionPct: progB.completionPct,
      tracks: progB.tracks,
      dueDate: '2026-05-15',
      milestones: msB,
    },
  ];

  const metrics = buildOnboardingDashboardMetrics(sampleChecklists, '2026-05-01');
  assert.equal(metrics.totalHires, 2);
  assert.equal(metrics.overdueChecklistCount, 1);
  assert.equal(metrics.rejectedBlockerCount, 1);
  assert.equal(metrics.awaitingVerificationCount, 2);
  assert.equal(metrics.trackCompletedTotals.DOCUMENT_SUBMISSION.completed, 4);
  assert.equal(metrics.trackCompletedTotals.DOCUMENT_SUBMISSION.total, 8);
  assert.equal(metrics.trackCompletionPct.DOCUMENT_SUBMISSION, 50);
  assert.equal(metrics.pendingDocumentCount, 4);
  assert.equal(metrics.pendingTrainingCount, 6);
  assert.equal(metrics.pendingCredentialCount, 5);
  assert.equal(metrics.departmentReadiness.length, 2);

  const timeline = buildPendingMilestonesTimeline(sampleChecklists, '2026-05-01');
  assert.equal(timeline.length, 15);
  // First item must be REJECTED urgent blocker, next two must be SUBMITTED (overdue chk-a before chk-b)
  assert.equal(timeline[0].milestone.status, 'REJECTED');
  assert.equal(timeline[0].isOverdue, true);
  assert.equal(timeline[1].milestone.status, 'SUBMITTED');
  assert.equal(timeline[1].checklistId, 'chk-a');
  assert.equal(timeline[2].milestone.status, 'SUBMITTED');
  assert.equal(timeline[2].checklistId, 'chk-b');
  // Remaining PENDING items come ordered with overdue checklist before future due dates, phase 1 before 2 before 3
  assert.equal(timeline[3].milestone.status, 'PENDING');
  assert.equal(timeline[3].checklistId, 'chk-a');
  assert.equal(timeline[3].phaseOrder, 1);
});

test('TalkSasa MSISDN normalization solves +254, 07, 01, 25407, spaces, and invalid prefixes', () => {
  const plus254 = normalizeKenyanMsisdn('+254 712-345-678');
  assert.equal(plus254.ok, true);
  assert.equal(plus254.msisdn, '254712345678');
  assert.equal(plus254.e164, '+254712345678');
  assert.equal(plus254.masked, '254712****78');

  const local07 = normalizeKenyanMsisdn('0729620384');
  assert.equal(local07.ok, true);
  assert.equal(local07.msisdn, '254729620384');
  assert.equal(local07.e164, '+254729620384');

  const local01 = normalizeKenyanMsisdn('0110445566');
  assert.equal(local01.ok, true);
  assert.equal(local01.msisdn, '254110445566');

  const typo25407 = normalizeKenyanMsisdn('+2540712345678');
  assert.equal(typo25407.ok, true);
  assert.equal(typo25407.msisdn, '254712345678');

  const invalid254 = normalizeKenyanMsisdn('254512345678');
  assert.equal(invalid254.ok, false);

  const empty = normalizeKenyanMsisdn('');
  assert.equal(empty.ok, false);
});

test('TalkSasa helper redacts OTP digits, counts GSM vs Unicode SMS units, and maps DLR statuses', () => {
  const redacted = maskSensitiveSmsText('Your verification code is 482910. Expires in 10 minutes.', 'OTP');
  assert.equal(redacted.includes('482910'), false);
  assert.equal(redacted.includes('******'), true);

  const generalMsg = maskSensitiveSmsText('Disbursement KES 5000 approved for case 2026.', 'CASE_STATUS');
  assert.equal(generalMsg.includes('5000'), true);

  assert.equal(calculateSmsUnits('Short GSM text message'), 1);
  assert.equal(calculateSmsUnits('A'.repeat(161)), 2);
  assert.equal(calculateSmsUnits('Hello 🌍'), 1);
  assert.equal(calculateSmsUnits('🌍'.repeat(40)), 2);

  assert.equal(mapTalkSasaDlrStatus('DELIVRD'), 'DELIVERED');
  assert.equal(mapTalkSasaDlrStatus('UNDELIV'), 'REJECTED');
  assert.equal(mapTalkSasaDlrStatus('ERROR'), 'FAILED');
  assert.equal(mapTalkSasaDlrStatus('DISPATCHED'), 'SENT');
  assert.equal(mapTalkSasaDlrStatus('UNKNOWN'), 'QUEUED');
});


