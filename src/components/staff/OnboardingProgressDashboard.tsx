import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck,
  GraduationCap,
  Search,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import {
  buildOnboardingDashboardMetrics,
  buildPendingMilestonesTimeline,
  isChecklistOverdue,
  type OnboardingCategory,
  type OnboardingDashboardChecklistInput,
  type OnboardingMilestone,
  type OnboardingMilestoneStatus,
} from '../../lib/onboardingTracker';
import { GlossyButton } from '../ui/DesignSystem';

interface OnboardingProgressDashboardProps {
  checklists: OnboardingDashboardChecklistInput[];
  selectedChecklistId?: string;
  onSelectHire: (checklistId: string) => void;
  onTriggerMilestoneAction: (
    checklist: OnboardingDashboardChecklistInput,
    milestone: OnboardingMilestone,
    presetStatus: 'SUBMITTED' | 'VERIFIED' | 'REJECTED'
  ) => void;
  isVerifier: boolean;
  isAuditor: boolean;
  currentUserId?: string | null;
}

const BLUEPRINT_PHASES = [
  {
    dayWindow: 'Days 1–3',
    phaseTitle: 'Phase 1 · Mandatory Document Intake',
    category: 'DOCUMENT_SUBMISSION' as OnboardingCategory,
    items: [
      'Signed Appointment Letter & Employment Contract',
      'National ID / Passport, KRA PIN & Statutory Compliance (NSSF / SHA)',
      'Emergency Contact & Remittance Banking Details',
      'Signed Safeguarding & Code of Conduct Charter',
    ],
  },
  {
    dayWindow: 'Days 4–7',
    phaseTitle: 'Phase 2 · Mandatory Induction & Compliance Training',
    category: 'TRAINING_COMPLETION' as OnboardingCategory,
    items: [
      'HUMANITY CONNECT Organisational Induction & Mission Orientation',
      'Safeguarding Children, Vulnerable Beneficiaries & Data Protection (ODPC) Training',
      'Departmental SOP, Reporting & Separation-of-Duties Briefing',
    ],
  },
  {
    dayWindow: 'Days 8–12',
    phaseTitle: 'Phase 3 · Credential & Independent Security Checks',
    category: 'CREDENTIAL_VERIFICATION' as OnboardingCategory,
    items: [
      'Verified Academic Certificates & Transcripts',
      'Professional Licensing & Good-Standing Clearance',
      'Independent Background, Reference & Police Clearance Check',
    ],
  },
  {
    dayWindow: 'Days 13–14',
    phaseTitle: 'Phase 4 · Final HR Clearance & Staff Profile Activation',
    category: 'CREDENTIAL_VERIFICATION' as OnboardingCategory,
    items: [
      'All 10 milestones verified or formally waived -> Activate Staff Profile & Stage 15 status',
    ],
  },
];

export const OnboardingProgressDashboard: React.FC<OnboardingProgressDashboardProps> = ({
  checklists,
  selectedChecklistId,
  onSelectHire,
  onTriggerMilestoneAction,
  isVerifier,
  isAuditor,
  currentUserId,
}) => {
  const [hireSearch, setHireSearch] = useState('');
  const [timelineTrackFilter, setTimelineTrackFilter] = useState<'ALL' | OnboardingCategory>('ALL');
  const [timelineHireId, setTimelineHireId] = useState<string>('ALL');

  const checklistById = useMemo(
    () => new Map(checklists.map((c) => [c.id, c])),
    [checklists]
  );

  const metrics = useMemo(() => buildOnboardingDashboardMetrics(checklists), [checklists]);

  const filteredHires = useMemo(() => {
    const q = hireSearch.trim().toLowerCase();
    if (!q) return checklists;
    return checklists.filter((c) =>
      `${c.onboardingRef} ${c.newHireName} ${c.jobId} ${c.jobTitle} ${c.department}`
        .toLowerCase()
        .includes(q)
    );
  }, [checklists, hireSearch]);

  const rawTimeline = useMemo(() => {
    const source =
      timelineHireId === 'ALL'
        ? checklists
        : checklists.filter((c) => c.id === timelineHireId);
    return buildPendingMilestonesTimeline(source);
  }, [checklists, timelineHireId]);

  const timelineItems = useMemo(() => {
    if (timelineTrackFilter === 'ALL') return rawTimeline;
    return rawTimeline.filter((item) => item.milestone.category === timelineTrackFilter);
  }, [rawTimeline, timelineTrackFilter]);

  const trackBars: {
    code: OnboardingCategory;
    label: string;
    barClass: string;
    icon: React.ReactNode;
    pendingCount: number;
  }[] = [
    {
      code: 'DOCUMENT_SUBMISSION',
      label: 'Document Submissions (Days 1–3)',
      barClass: 'bg-[#287A59]',
      icon: <FileCheck className="w-4 h-4 text-[#287A59]" />,
      pendingCount: metrics.pendingDocumentCount,
    },
    {
      code: 'TRAINING_COMPLETION',
      label: 'Mandatory Training Completion (Days 4–7)',
      barClass: 'bg-[#D9A84E]',
      icon: <GraduationCap className="w-4 h-4 text-[#B6721A]" />,
      pendingCount: metrics.pendingTrainingCount,
    },
    {
      code: 'CREDENTIAL_VERIFICATION',
      label: 'Credential & Background Checks (Days 8–12)',
      barClass: 'bg-[#102E36]',
      icon: <ShieldCheck className="w-4 h-4 text-[#102E36]" />,
      pendingCount: metrics.pendingCredentialCount,
    },
  ];

  const milestoneStatusColor = (status: OnboardingMilestoneStatus, isOverdue: boolean) => {
    if (status === 'REJECTED') return 'text-[#9F2D20]';
    if (status === 'SUBMITTED') return 'text-[#B6721A]';
    if (isOverdue) return 'text-[#9F2D20]';
    return 'text-[#4A636A]';
  };

  const timelineNodeColor = (status: OnboardingMilestoneStatus, isOverdue: boolean) => {
    if (status === 'REJECTED' || isOverdue) return 'bg-[#9F2D20] border-[#FAF9F6]';
    if (status === 'SUBMITTED') return 'bg-[#D9A84E] border-[#FAF9F6]';
    return 'bg-[#102E36] border-[#FAF9F6]';
  };

  const categoryIcon = (category: OnboardingCategory) => {
    if (category === 'DOCUMENT_SUBMISSION') return <FileCheck className="w-3.5 h-3.5 text-[#287A59]" />;
    if (category === 'TRAINING_COMPLETION') return <GraduationCap className="w-3.5 h-3.5 text-[#B6721A]" />;
    return <ShieldCheck className="w-3.5 h-3.5 text-[#102E36]" />;
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Aggregate Completion Progress Bars & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 hc-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-[#102E36]">
                Onboarding Track Completion Progress
              </h4>
              <p className="text-xs text-[#4A636A]">
                Aggregate completion rate across Document Submissions, Mandatory Training, and Credential Checks.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium text-[#4A636A]">Overall Average</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36]">
                {metrics.avgOverallPct}%
              </div>
            </div>
          </div>

          {/* Master Overall Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono-num">
              <span className="font-semibold text-[#102E36]">
                All Onboarding Milestones ({metrics.totalHires} Active New Hires)
              </span>
              <span className="font-bold text-[#287A59]">{metrics.avgOverallPct}%</span>
            </div>
            <div
              className="h-3 w-full rounded-full bg-[#EAE6DC] overflow-hidden"
              role="progressbar"
              aria-valuenow={metrics.avgOverallPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall onboarding completion percentage"
            >
              <div
                className="h-full rounded-full bg-[#287A59] transition-all duration-300"
                style={{ width: `${metrics.avgOverallPct}%` }}
              />
            </div>
          </div>

          {/* 3 Track Bars */}
          <div className="space-y-3 pt-1">
            {trackBars.map((trk) => {
              const totals = metrics.trackCompletedTotals[trk.code];
              const pct = metrics.trackCompletionPct[trk.code];
              return (
                <div key={trk.code} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-[#102E36]">
                      {trk.icon}
                      <span>{trk.label}</span>
                    </div>
                    <div className="font-mono-num text-[#4A636A]">
                      <span className="font-bold text-[#102E36]">
                        {totals.completed}/{totals.total}
                      </span>{' '}
                      verified · {pct}% ·{' '}
                      <span className="text-[#B6721A] font-semibold">
                        {trk.pendingCount} pending
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-2.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${trk.label} completion`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${trk.barClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottleneck Strip */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#102E36]/10 text-xs">
            <div>
              <div className="text-[11px] text-[#4A636A]">Awaiting HR Review</div>
              <div className="font-mono-num font-bold text-base text-[#B6721A]">
                {metrics.awaitingVerificationCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#4A636A]">Rejected / Action Needed</div>
              <div className="font-mono-num font-bold text-base text-[#9F2D20]">
                {metrics.rejectedBlockerCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#4A636A]">Overdue Hires</div>
              <div className="font-mono-num font-bold text-base text-[#9F2D20]">
                {metrics.overdueChecklistCount}
              </div>
            </div>
          </div>
        </div>

        {/* Departmental Readiness Progress Bars */}
        <div className="lg:col-span-5 hc-card p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-[#102E36]">
              Departmental Onboarding Readiness
            </h4>
            <p className="text-xs text-[#4A636A]">
              Real-time average completion percentage by organisational department.
            </p>
          </div>

          {metrics.departmentReadiness.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10 text-xs text-[#4A636A] space-y-1.5">
              <div className="font-semibold text-[#102E36]">0 Active Onboarding Cohorts</div>
              <p>
                Department progress bars populate automatically as new appointments enter Stage 13–14 or when HR initiates a tracker.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {metrics.departmentReadiness.map((dept) => (
                <div key={dept.departmentNumber} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#102E36] truncate">
                      Dept {dept.departmentNumber}: {dept.department}
                    </span>
                    <span className="font-mono-num shrink-0 font-bold text-[#102E36]">
                      {dept.avgCompletionPct}% ({dept.hireCount})
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        dept.blockedCount > 0 ? 'bg-[#D9A84E]' : 'bg-[#287A59]'
                      }`}
                      style={{ width: `${dept.avgCompletionPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: New Hire Completion Progress Bars */}
      <div className="hc-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-[#102E36]">
              New Hire Onboarding Completion Status
            </h4>
            <p className="text-xs text-[#4A636A]">
              Individual completion bars across Documents, Mandatory Training, and Credential Verification.
            </p>
          </div>
          <div className="relative w-full sm:w-72 text-xs">
            <Search className="w-3.5 h-3.5 text-[#4A636A] absolute left-3 top-2.5" />
            <input
              value={hireSearch}
              onChange={(e) => setHireSearch(e.target.value)}
              placeholder="Filter new hires by name, ref, dept..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
        </div>

        {filteredHires.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10 text-center text-xs text-[#4A636A]">
            {checklists.length === 0
              ? 'No new hires are currently in onboarding. Once appointed at Stage 13–14, each new hire’s progress bars appear here.'
              : 'No onboarding hires match your current search filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredHires.map((c) => {
              const overdue = isChecklistOverdue(c.dueDate, c.overallStatus);
              const isSelected = selectedChecklistId === c.id;
              const docsPct = c.tracks?.DOCUMENT_SUBMISSION?.pct ?? 0;
              const trainPct = c.tracks?.TRAINING_COMPLETION?.pct ?? 0;
              const credPct = c.tracks?.CREDENTIAL_VERIFICATION?.pct ?? 0;

              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl bg-white border transition-colors space-y-3 ${
                    isSelected
                      ? 'border-[#102E36] ring-1 ring-[#102E36]'
                      : 'border-[#102E36]/12 hover:border-[#102E36]/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <div>
                      <div className="font-mono-num font-bold text-[#287A59]">
                        {c.onboardingRef} · {c.jobId}
                      </div>
                      <div className="font-bold text-sm text-[#102E36] mt-0.5">{c.newHireName}</div>
                      <div className="text-[#4A636A]">
                        {c.jobTitle} · Dept {c.departmentNumber}: {c.department}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-bold ${
                          c.overallStatus === 'BLOCKED'
                            ? 'text-[#9F2D20]'
                            : c.overallStatus === 'COMPLETED' || c.overallStatus === 'READY_FOR_ACTIVATION'
                              ? 'text-[#287A59]'
                              : 'text-[#B6721A]'
                        }`}
                      >
                        {c.overallStatus.replace(/_/g, ' ')}
                      </div>
                      <div className="text-lg font-extrabold font-mono-num text-[#102E36]">
                        {c.completionPct}%
                      </div>
                    </div>
                  </div>

                  {/* Overall Progress Bar */}
                  <div className="h-2.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        c.overallStatus === 'BLOCKED'
                          ? 'bg-[#9F2D20]'
                          : c.completionPct === 100
                            ? 'bg-[#287A59]'
                            : 'bg-[#102E36]'
                      }`}
                      style={{ width: `${c.completionPct}%` }}
                    />
                  </div>

                  {/* Mini Track Progress Bars */}
                  <div className="grid grid-cols-3 gap-2.5 text-[11px]">
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono-num text-[#4A636A]">
                        <span>Docs</span>
                        <span className="font-bold text-[#102E36]">{docsPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                        <div className="h-full rounded-full bg-[#287A59]" style={{ width: `${docsPct}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono-num text-[#4A636A]">
                        <span>Training</span>
                        <span className="font-bold text-[#102E36]">{trainPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                        <div className="h-full rounded-full bg-[#D9A84E]" style={{ width: `${trainPct}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono-num text-[#4A636A]">
                        <span>Credentials</span>
                        <span className="font-bold text-[#102E36]">{credPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                        <div className="h-full rounded-full bg-[#102E36]" style={{ width: `${credPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Footer & Drill-down */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#102E36]/10 text-[11px]">
                    <div className={`font-mono-num ${overdue ? 'text-[#9F2D20] font-bold' : 'text-[#4A636A]'}`}>
                      {c.dueDate ? (
                        <>
                          Target Due: {c.dueDate}
                          {overdue ? ' · OVERDUE' : ''}
                        </>
                      ) : (
                        'No target date set'
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTimelineHireId(c.id)}
                        className="font-semibold text-[#287A59] hover:underline"
                      >
                        Filter Timeline
                      </button>
                      <span aria-hidden="true" className="text-[#4A636A]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectHire(c.id)}
                        className="font-semibold text-[#102E36] hover:underline inline-flex items-center gap-1"
                      >
                        Inspect Milestones <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Chronological Timeline View for Pending Documents, Training & Credentials */}
      <div className="hc-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#287A59]" />
              <h4 className="text-sm font-bold text-[#102E36]">
                Pending Documents &amp; Training Timeline
              </h4>
            </div>
            <p className="text-xs text-[#4A636A] mt-0.5">
              Chronological queue ordered by urgent blockers, overdue target dates, submitted reviews, and 14-day onboarding schedule.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Filter timeline by category"
              value={timelineTrackFilter}
              onChange={(e) => setTimelineTrackFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="ALL">All Tracks ({rawTimeline.length} Pending)</option>
              <option value="DOCUMENT_SUBMISSION">
                Pending Documents ({metrics.pendingDocumentCount})
              </option>
              <option value="TRAINING_COMPLETION">
                Pending Training ({metrics.pendingTrainingCount})
              </option>
              <option value="CREDENTIAL_VERIFICATION">
                Pending Credentials ({metrics.pendingCredentialCount})
              </option>
            </select>

            {checklists.length > 0 && (
              <select
                aria-label="Filter timeline by new hire"
                value={timelineHireId}
                onChange={(e) => setTimelineHireId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ALL">All New Hires ({checklists.length})</option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.newHireName} ({c.onboardingRef})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {checklists.length === 0 ? (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/12 text-xs text-[#4A636A] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D9A84E] shrink-0" />
              <span>
                <strong>0 active new hires</strong> in onboarding right now. Below is the standard{' '}
                <strong>HUMANITY CONNECT 14-Day Onboarding Timeline Blueprint</strong> automatically generated when an appointment is approved.
              </span>
            </div>

            <ol className="relative border-l-2 border-[#102E36]/20 ml-3 pl-6 space-y-5 py-1">
              {BLUEPRINT_PHASES.map((phase) => (
                <li key={phase.dayWindow} className="relative">
                  <span
                    className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-[#102E36] border-2 border-[#FAF9F6]"
                    aria-hidden="true"
                  />
                  <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-num font-bold text-[#287A59]">
                        {phase.dayWindow}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-[#102E36]">{phase.phaseTitle}</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[#4A636A]">
                      {phase.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-center space-y-1 text-xs">
            <CheckCircle2 className="w-6 h-6 text-[#287A59] mx-auto" />
            <div className="font-bold text-[#102E36]">
              No Pending Documents, Training, or Credentials in Current Filter
            </div>
            <p className="text-[#4A636A]">
              All milestones matching this filter are verified or formally waived.
            </p>
          </div>
        ) : (
          <ol className="relative border-l-2 border-[#102E36]/20 ml-3 pl-6 space-y-4 py-1">
            {timelineItems.map((item) => {
              const parentChecklist = checklistById.get(item.checklistId);
              const isSelf = Boolean(currentUserId && item.userId === currentUserId);
              const canSubmit = !isAuditor && (isSelf || isVerifier);
              const canVerify = !isAuditor && isVerifier && !isSelf;

              return (
                <li key={item.key} className="relative">
                  <span
                    className={`absolute -left-[31px] top-4 w-3.5 h-3.5 rounded-full border-2 ${timelineNodeColor(
                      item.milestone.status,
                      item.isOverdue
                    )}`}
                    aria-hidden="true"
                  />
                  <div className="p-4 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-start justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1 min-w-[230px]">
                      <div className="flex flex-wrap items-center gap-2">
                        {categoryIcon(item.milestone.category)}
                        <span className="font-mono-num font-bold text-[#287A59]">
                          {item.dayWindow}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#4A636A] font-medium">{item.phaseLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-bold ${milestoneStatusColor(
                            item.milestone.status,
                            item.isOverdue
                          )}`}
                        >
                          {item.milestone.status === 'REJECTED'
                            ? 'ACTION REQUIRED (REJECTED)'
                            : item.milestone.status === 'SUBMITTED'
                              ? 'AWAITING HR VERIFICATION'
                              : 'PENDING SUBMISSION'}
                        </span>
                        {item.isOverdue && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-[#9F2D20] inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              OVERDUE ({item.dueDate})
                            </span>
                          </>
                        )}
                      </div>

                      <div className="font-bold text-sm text-[#102E36]">
                        {item.milestone.title}
                      </div>

                      <div className="text-[#4A636A]">
                        <span className="font-semibold text-[#102E36]">{item.newHireName}</span> ·{' '}
                        {item.jobTitle} · {item.department} ·{' '}
                        <span className="font-mono-num">{item.onboardingRef}</span>
                        {item.dueDate ? ` · Due ${item.dueDate}` : ''}
                      </div>

                      <div className="text-[#4A636A]">{item.milestone.description}</div>

                      {item.milestone.evidenceRef && (
                        <div className="font-mono-num text-[11px] text-[#102E36]">
                          Submitted Ref: {item.milestone.evidenceRef}
                        </div>
                      )}
                      {item.milestone.notes && (
                        <div className="text-[11px] text-[#4A636A]">
                          Note: {item.milestone.notes}
                        </div>
                      )}
                    </div>

                    {parentChecklist && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {canSubmit && (
                          <GlossyButton
                            size="sm"
                            variant="ivory"
                            onClick={() =>
                              onTriggerMilestoneAction(
                                parentChecklist,
                                item.milestone,
                                'SUBMITTED'
                              )
                            }
                          >
                            {item.milestone.status === 'REJECTED' ? 'Resubmit' : 'Submit'}
                          </GlossyButton>
                        )}
                        {canVerify && (
                          <GlossyButton
                            size="sm"
                            variant="green"
                            onClick={() =>
                              onTriggerMilestoneAction(
                                parentChecklist,
                                item.milestone,
                                'VERIFIED'
                              )
                            }
                          >
                            Verify
                          </GlossyButton>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectHire(parentChecklist.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#102E36] hover:bg-[#FAF9F6] border border-[#102E36]/15 inline-flex items-center gap-1"
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          Full Checklist
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
