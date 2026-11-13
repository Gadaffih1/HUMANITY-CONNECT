import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  GraduationCap,
  ShieldCheck,
  Search,
  UserPlus,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ExportReportBar, GlossyButton, ModalDialog } from '../ui/DesignSystem';

interface OnboardingProgressTrackerPanelProps {
  canManageHr: boolean;
  isAuditor: boolean;
  onRefreshDirectory?: () => Promise<void>;
}

const STATUS_FILTERS = [
  { code: 'ALL', label: 'All Trackers' },
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'BLOCKED', label: 'Blocked / Action Required' },
  { code: 'READY_FOR_ACTIVATION', label: 'Ready to Activate' },
  { code: 'COMPLETED', label: 'Completed' },
];

const TRACK_META = [
  {
    code: 'DOCUMENT_SUBMISSION',
    label: '1. Document Submissions',
    icon: <FileCheck className="w-4 h-4 text-[#287A59]" />,
  },
  {
    code: 'TRAINING_COMPLETION',
    label: '2. Training Completion',
    icon: <GraduationCap className="w-4 h-4 text-[#D9A84E]" />,
  },
  {
    code: 'CREDENTIAL_VERIFICATION',
    label: '3. Credential Verification',
    icon: <ShieldCheck className="w-4 h-4 text-[#102E36]" />,
  },
] as const;

export const OnboardingProgressTrackerPanel: React.FC<OnboardingProgressTrackerPanelProps> = ({
  canManageHr,
  isAuditor,
  onRefreshDirectory,
}) => {
  const { apiFetch, user } = useAuth();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQ, setSearchQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual Initiate Onboarding modal state
  const [initModalOpen, setInitModalOpen] = useState(false);
  const [eligibleProfiles, setEligibleProfiles] = useState<any[]>([]);
  const [eligibleApps, setEligibleApps] = useState<any[]>([]);
  const [initSourceType, setInitSourceType] = useState<'PROFILE' | 'APPLICATION'>('PROFILE');
  const [initSourceId, setInitSourceId] = useState('');
  const [initDueDate, setInitDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );

  // Milestone evidence / verification modal state
  const [actionMilestone, setActionMilestone] = useState<any | null>(null);
  const [msNextStatus, setMsNextStatus] = useState<'SUBMITTED' | 'VERIFIED' | 'WAIVED' | 'REJECTED' | 'PENDING'>(
    'VERIFIED'
  );
  const [msEvidenceRef, setMsEvidenceRef] = useState('');
  const [msNotes, setMsNotes] = useState('');

  const loadOnboarding = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<{ checklists: any[]; summary: any }>('/api/staff/onboarding');
      const items = data.checklists || [];
      setChecklists(items);
      setSummary(data.summary || {});
      if (items.length > 0 && (!selectedId || !items.some((x) => x.id === selectedId))) {
        setSelectedId(items[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load onboarding progress tracker.');
    } finally {
      setLoading(false);
    }
  };

  const openInitiateModal = async () => {
    setInitModalOpen(true);
    setErrorMsg(null);
    try {
      const [profRes, recRes] = await Promise.all([
        apiFetch<{ profiles: any[] }>('/api/staff/profiles'),
        apiFetch<{ applications: any[] }>('/api/staff/recruitment'),
      ]);
      const linkedProfileIds = new Set(checklists.map((c) => c.staffProfileId).filter(Boolean));
      const linkedAppIds = new Set(checklists.map((c) => c.applicationId).filter(Boolean));

      const profs = (profRes.profiles || []).filter((p) => !linkedProfileIds.has(p.id));
      const apps = (recRes.applications || []).filter(
        (a) =>
          !linkedAppIds.has(a.id) &&
          ['SELECTION', 'OFFER_ISSUED', 'OFFER_ACCEPTED', 'APPOINTMENT_APPROVED', 'ONBOARDING'].includes(a.stage)
      );
      setEligibleProfiles(profs);
      setEligibleApps(apps);
      if (profs[0]) {
        setInitSourceType('PROFILE');
        setInitSourceId(profs[0].id);
      } else if (apps[0]) {
        setInitSourceType('APPLICATION');
        setInitSourceId(apps[0].id);
      } else {
        setInitSourceId('');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadOnboarding();
  }, [user?.id]);

  const filteredChecklists = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return checklists.filter((c) => {
      if (statusFilter !== 'ALL' && c.overallStatus !== statusFilter) return false;
      if (q) {
        const hay = `${c.onboardingRef} ${c.newHireName} ${c.jobId} ${c.jobTitle} ${c.department}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [checklists, statusFilter, searchQ]);

  const activeChecklist = useMemo(
    () =>
      filteredChecklists.find((c) => c.id === selectedId) ||
      checklists.find((c) => c.id === selectedId) ||
      filteredChecklists[0] ||
      null,
    [filteredChecklists, checklists, selectedId]
  );

  const isVerifier = Boolean(
    user &&
      (canManageHr ||
        user.roles.includes('COUNTY_REPRESENTATIVE') ||
        user.permissions.includes('canVerifyUsers')) &&
      !isAuditor
  );

  const openMilestoneModal = (
    ms: any,
    presetStatus: 'SUBMITTED' | 'VERIFIED' | 'WAIVED' | 'REJECTED' | 'PENDING'
  ) => {
    setActionMilestone(ms);
    setMsNextStatus(presetStatus);
    setMsEvidenceRef(ms.evidenceRef || '');
    setMsNotes(ms.notes || '');
  };

  const statusTone = (status: string) => {
    switch (status) {
      case 'VERIFIED':
      case 'COMPLETED':
      case 'WAIVED':
        return 'text-[#287A59]';
      case 'READY_FOR_ACTIVATION':
        return 'text-[#287A59] font-extrabold';
      case 'REJECTED':
      case 'BLOCKED':
        return 'text-[#9F2D20]';
      case 'SUBMITTED':
      case 'IN_PROGRESS':
        return 'text-[#B6721A]';
      default:
        return 'text-[#4A636A]';
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-xs text-[#287A59]">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-xs text-[#9F2D20]">
          {errorMsg}
        </div>
      )}

      {/* Header & Automation Banner */}
      <div className="hc-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                Automated Staff Onboarding Progress Tracker
              </h3>
            </div>
            <p className="text-xs text-[#4A636A] mt-0.5">
              Automatically provisioned upon Stage 13–14 appointment approval or new staff profile creation. Tracks{' '}
              <strong>Document Submissions</strong>, <strong>Training Completion</strong> (synced automatically to HR
              training logs), and <strong>Credential Verification</strong> milestones before Staff Activation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageHr && !isAuditor && (
              <GlossyButton size="sm" variant="gold" onClick={openInitiateModal}>
                <UserPlus className="w-3.5 h-3.5" />
                Initiate Onboarding Tracker
              </GlossyButton>
            )}
            <ExportReportBar
              title="Humanity Connect Automated Onboarding Tracker Report"
              csvFilename="humanity-connect-onboarding-progress.csv"
              rows={filteredChecklists.map((c) => ({
                onboardingRef: c.onboardingRef,
                jobId: c.jobId,
                jobTitle: c.jobTitle,
                department: c.department,
                newHireName: c.newHireName,
                overallStatus: c.overallStatus,
                completionPct: `${c.completionPct}%`,
                documentsProgress: `${c.tracks?.DOCUMENT_SUBMISSION?.completedCount ?? 0}/${c.tracks?.DOCUMENT_SUBMISSION?.totalCount ?? 4}`,
                trainingProgress: `${c.tracks?.TRAINING_COMPLETION?.completedCount ?? 0}/${c.tracks?.TRAINING_COMPLETION?.totalCount ?? 3}`,
                credentialsProgress: `${c.tracks?.CREDENTIAL_VERIFICATION?.completedCount ?? 0}/${c.tracks?.CREDENTIAL_VERIFICATION?.totalCount ?? 3}`,
                dueDate: c.dueDate || '',
              }))}
            />
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Active Trackers', val: summary.total ?? 0, tone: 'text-[#102E36]' },
            { label: 'Not Started', val: summary.notStarted ?? 0, tone: 'text-[#4A636A]' },
            { label: 'In Progress', val: summary.inProgress ?? 0, tone: 'text-[#B6721A]' },
            { label: 'Blocked', val: summary.blocked ?? 0, tone: 'text-[#9F2D20]' },
            { label: 'Ready to Activate', val: summary.readyForActivation ?? 0, tone: 'text-[#287A59]' },
            { label: 'Avg Completion', val: `${summary.avgCompletionPct ?? 0}%`, tone: 'text-[#102E36]' },
          ].map((kpi) => (
            <div key={kpi.label} className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
              <div className="text-[11px] font-medium text-[#4A636A]">{kpi.label}</div>
              <div className={`text-xl font-extrabold font-mono-num mt-0.5 ${kpi.tone}`}>{kpi.val}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-[#4A636A] absolute left-3 top-2.5" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search onboarding ref, new hire name, job ID, or department..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.code} value={s.code}>
                Status: {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="hc-card p-8 text-center text-xs text-[#4A636A]">
          Loading Automated Onboarding Checklists...
        </div>
      ) : checklists.length === 0 ? (
        <div className="hc-card p-8 text-center space-y-2 text-xs text-[#4A636A]">
          <Clock className="w-7 h-7 text-[#D9A84E] mx-auto" />
          <div className="font-bold text-sm text-[#102E36]">No Staff Onboarding Trackers Created Yet</div>
          <p className="max-w-lg mx-auto">
            Trackers automatically spin up as soon as a candidate reaches Stage 13–14 (Appointment Approved /
            Onboarding) in Recruitment or when HR creates a new Staff Profile. HR can also initiate a tracker manually
            above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Queue */}
          <div className="lg:col-span-5 space-y-3">
            {filteredChecklists.map((c) => {
              const selected = activeChecklist?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left hc-card p-4 space-y-2.5 transition-colors ${
                    selected ? 'border-[#102E36] bg-white ring-1 ring-[#102E36]' : 'hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono-num font-bold text-[#102E36]">
                      {c.onboardingRef} · {c.jobId}
                    </span>
                    <span className={`font-semibold ${statusTone(c.overallStatus)}`}>
                      {c.overallStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#102E36]">{c.newHireName}</div>
                    <div className="text-xs text-[#4A636A]">
                      {c.jobTitle} · Dept {c.departmentNumber}: {c.department}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono-num text-[#4A636A]">
                      <span>
                        {c.completedRequiredCount}/{c.requiredMilestones} Milestones Verified
                      </span>
                      <span className="font-bold text-[#102E36]">{c.completionPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          c.overallStatus === 'BLOCKED' ? 'bg-[#9F2D20]' : 'bg-[#287A59]'
                        }`}
                        style={{ width: `${Math.max(4, c.completionPct)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono-num text-[#4A636A]">
                    <div>
                      Docs: {c.tracks?.DOCUMENT_SUBMISSION?.completedCount ?? 0}/
                      {c.tracks?.DOCUMENT_SUBMISSION?.totalCount ?? 4}
                    </div>
                    <div>
                      Train: {c.tracks?.TRAINING_COMPLETION?.completedCount ?? 0}/
                      {c.tracks?.TRAINING_COMPLETION?.totalCount ?? 3}
                    </div>
                    <div>
                      Creds: {c.tracks?.CREDENTIAL_VERIFICATION?.completedCount ?? 0}/
                      {c.tracks?.CREDENTIAL_VERIFICATION?.totalCount ?? 3}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Detailed Milestone Inspector */}
          <div className="lg:col-span-7 space-y-4">
            {activeChecklist && (
              <div className="hc-card p-5 space-y-5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#102E36]/10">
                  <div>
                    <div className="font-mono-num text-[#287A59] font-bold">
                      {activeChecklist.onboardingRef} · {activeChecklist.jobId}
                      {activeChecklist.dueDate ? ` · Target Due: ${activeChecklist.dueDate}` : ''}
                    </div>
                    <h4 className="text-lg font-extrabold text-[#102E36] mt-0.5">
                      {activeChecklist.newHireName} — {activeChecklist.jobTitle}
                    </h4>
                    <div className="text-[#4A636A]">
                      {activeChecklist.newHireEmail} · Dept {activeChecklist.departmentNumber}:{' '}
                      {activeChecklist.department}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${statusTone(activeChecklist.overallStatus)}`}>
                      {activeChecklist.overallStatus.replace(/_/g, ' ')}
                    </div>
                    <div className="text-2xl font-extrabold font-mono-num text-[#102E36]">
                      {activeChecklist.completionPct}%
                    </div>
                  </div>
                </div>

                {/* Activation Callout */}
                {canManageHr &&
                  !isAuditor &&
                  activeChecklist.overallStatus === 'READY_FOR_ACTIVATION' && (
                    <div className="p-4 rounded-xl bg-[#287A59]/10 border border-[#287A59]/30 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-[#287A59] flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          All 3 Onboarding Tracks Verified — Ready for Staff Activation
                        </div>
                        <div className="text-[#4A636A]">
                          Completing onboarding activates the employee profile, moves any linked candidate to Stage 15
                          (Active Employee), and notifies the new hire.
                        </div>
                      </div>
                      <GlossyButton
                        size="sm"
                        variant="green"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setErrorMsg(null);
                          try {
                            await apiFetch(`/api/staff/onboarding/${activeChecklist.id}/complete`, {
                              method: 'POST',
                            });
                            await loadOnboarding();
                            if (onRefreshDirectory) await onRefreshDirectory();
                            setFeedback(
                              `Onboarding ${activeChecklist.onboardingRef} completed and staff profile activated.`
                            );
                          } catch (err: any) {
                            setErrorMsg(err.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Activate Staff & Complete Onboarding
                      </GlossyButton>
                    </div>
                  )}

                {activeChecklist.overallStatus === 'BLOCKED' && (
                  <div className="p-3 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-[#9F2D20] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    One or more required onboarding items were rejected or flagged. Resubmit or verify to unblock
                    activation.
                  </div>
                )}

                {/* 3 Pillar Sections */}
                {TRACK_META.map((track) => {
                  const items = (activeChecklist.milestones || []).filter(
                    (m: any) => m.category === track.code
                  );
                  const trk = activeChecklist.tracks?.[track.code] || {
                    completedCount: 0,
                    totalCount: items.length,
                    pct: 0,
                  };
                  return (
                    <div key={track.code} className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm text-[#102E36]">
                          {track.icon}
                          {track.label}
                        </div>
                        <span className="font-mono-num font-bold text-[#287A59]">
                          {trk.completedCount}/{trk.totalCount} ({trk.pct}%)
                        </span>
                      </div>

                      <div className="space-y-2">
                        {items.map((ms: any) => (
                          <div
                            key={ms.code}
                            className="p-3 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-start justify-between gap-3"
                          >
                            <div className="space-y-1 flex-1 min-w-[220px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-[#102E36]">{ms.title}</span>
                                <span aria-hidden="true">·</span>
                                <span className={`font-semibold ${statusTone(ms.status)}`}>{ms.status}</span>
                              </div>
                              <div className="text-[#4A636A]">{ms.description}</div>
                              {ms.evidenceRef && (
                                <div className="text-[11px] font-mono-num text-[#102E36]">
                                  Evidence Ref: {ms.evidenceRef}
                                </div>
                              )}
                              {ms.notes && <div className="text-[11px] text-[#4A636A]">Note: {ms.notes}</div>}
                              {ms.verifiedByName && (
                                <div className="text-[11px] text-[#287A59]">
                                  Verified by {ms.verifiedByName}
                                  {ms.verifiedAt
                                    ? ` on ${new Date(ms.verifiedAt).toLocaleDateString('en-KE')}`
                                    : ''}
                                </div>
                              )}
                            </div>

                            {!isAuditor && activeChecklist.overallStatus !== 'COMPLETED' && (
                              <div className="flex flex-wrap gap-1.5 shrink-0">
                                {(activeChecklist.userId === user?.id || isVerifier) &&
                                  ms.status !== 'VERIFIED' && (
                                    <GlossyButton
                                      size="sm"
                                      variant="ivory"
                                      onClick={() => openMilestoneModal(ms, 'SUBMITTED')}
                                    >
                                      Submit Evidence
                                    </GlossyButton>
                                  )}
                                {isVerifier && activeChecklist.userId !== user?.id && (
                                  <>
                                    <GlossyButton
                                      size="sm"
                                      variant="green"
                                      onClick={() => openMilestoneModal(ms, 'VERIFIED')}
                                    >
                                      Verify
                                    </GlossyButton>
                                    <GlossyButton
                                      size="sm"
                                      variant="ivory"
                                      onClick={() => openMilestoneModal(ms, 'REJECTED')}
                                    >
                                      Reject
                                    </GlossyButton>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Initiate Onboarding Modal */}
      <ModalDialog
        open={initModalOpen}
        title="Initiate Automated Onboarding Progress Tracker"
        subtitle="Attach a structured 10-milestone Document, Training, and Credential Verification tracker to an existing staff profile or approved recruitment candidate."
        onClose={() => setInitModalOpen(false)}
      >
        <form
          className="space-y-3 text-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!initSourceId) return;
            setBusy(true);
            setErrorMsg(null);
            try {
              const body =
                initSourceType === 'PROFILE'
                  ? { staffProfileId: initSourceId, dueDate: initDueDate }
                  : { applicationId: initSourceId, dueDate: initDueDate };
              const res = await apiFetch<{ onboardingRef: string }>('/api/staff/onboarding', {
                method: 'POST',
                body: JSON.stringify(body),
              });
              setInitModalOpen(false);
              await loadOnboarding();
              setFeedback(`Onboarding Progress Tracker ${res.onboardingRef} initiated.`);
            } catch (err: any) {
              setErrorMsg(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setInitSourceType('PROFILE');
                setInitSourceId(eligibleProfiles[0]?.id || '');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                initSourceType === 'PROFILE'
                  ? 'bg-[#102E36] text-[#FAF9F6]'
                  : 'bg-white border border-[#102E36]/15'
              }`}
            >
              From Staff Profile ({eligibleProfiles.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setInitSourceType('APPLICATION');
                setInitSourceId(eligibleApps[0]?.id || '');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                initSourceType === 'APPLICATION'
                  ? 'bg-[#102E36] text-[#FAF9F6]'
                  : 'bg-white border border-[#102E36]/15'
              }`}
            >
              From Approved Candidate ({eligibleApps.length})
            </button>
          </div>

          {initSourceType === 'PROFILE' ? (
            eligibleProfiles.length === 0 ? (
              <div className="p-3 rounded-xl bg-[#FAF9F6] text-[#4A636A]">
                All current staff profiles already have onboarding trackers assigned. Appoint a new staff profile first.
              </div>
            ) : (
              <select
                required
                value={initSourceId}
                onChange={(e) => setInitSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {eligibleProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.staffNumber} · {p.fullLegalName} ({p.jobId})
                  </option>
                ))}
              </select>
            )
          ) : eligibleApps.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#FAF9F6] text-[#4A636A]">
              No unlinked approved recruitment candidates found in Selection–Onboarding stages.
            </div>
          ) : (
            <select
              required
              value={initSourceId}
              onChange={(e) => setInitSourceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            >
              {eligibleApps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.applicationRef} · {a.applicantName} ({a.jobId} · {a.stage})
                </option>
              ))}
            </select>
          )}

          <div>
            <label className="block font-semibold mb-1">Target Completion Date</label>
            <input
              type="date"
              required
              value={initDueDate}
              onChange={(e) => setInitDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>

          <div className="flex justify-end gap-2">
            <GlossyButton type="button" variant="ivory" onClick={() => setInitModalOpen(false)}>
              Cancel
            </GlossyButton>
            <GlossyButton type="submit" variant="teal" disabled={busy || !initSourceId}>
              Create Onboarding Tracker
            </GlossyButton>
          </div>
        </form>
      </ModalDialog>

      {/* Update Milestone Status / Evidence Modal */}
      <ModalDialog
        open={Boolean(actionMilestone)}
        title={actionMilestone ? `${actionMilestone.title}` : ''}
        subtitle="Milestones recalculate track & overall progress automatically. Training completions sync to staff profiles."
        onClose={() => setActionMilestone(null)}
      >
        {actionMilestone && activeChecklist && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/staff/onboarding/${activeChecklist.id}/milestones`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    milestoneCode: actionMilestone.code,
                    status: msNextStatus,
                    evidenceRef: msEvidenceRef || undefined,
                    notes: msNotes || undefined,
                  }),
                });
                setActionMilestone(null);
                await loadOnboarding();
                setFeedback(`Updated milestone "${actionMilestone.title}" to ${msNextStatus}.`);
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label className="block font-semibold mb-1">Milestone Decision / Status</label>
              <select
                value={msNextStatus}
                onChange={(e) => setMsNextStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="SUBMITTED">Submitted by Candidate / Staff</option>
                {isVerifier && activeChecklist.userId !== user?.id && (
                  <>
                    <option value="VERIFIED">Verified & Cleared by HR / Supervisor</option>
                    <option value="WAIVED">Formally Waived (Alternative Proof)</option>
                    <option value="REJECTED">Rejected / Corrections Required</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Document / Certificate / Training Reference Number</label>
              <input
                value={msEvidenceRef}
                onChange={(e) => setMsEvidenceRef(e.target.value)}
                placeholder="e.g. KRA-A0012345X / ICPAK-MEM-9821 / LMS-CERT-2026"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Verification / Submission Notes</label>
              <textarea
                rows={2}
                value={msNotes}
                onChange={(e) => setMsNotes(e.target.value)}
                placeholder="Record visual verification notes, expiry dates, or clarification needed..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div className="flex justify-end gap-2">
              <GlossyButton type="button" variant="ivory" onClick={() => setActionMilestone(null)}>
                Cancel
              </GlossyButton>
              <GlossyButton type="submit" variant="teal" disabled={busy}>
                Save Milestone Update
              </GlossyButton>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
