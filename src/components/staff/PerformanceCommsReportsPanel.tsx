import React, { useEffect, useState } from 'react';
import {
  Award,
  MessageSquare,
  CheckSquare,
  BarChart3,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ExportReportBar, GlossyButton, ModalDialog } from '../ui/DesignSystem';
import { KENYAN_47_COUNTIES, STAFF_EMPLOYMENT_STATUSES } from '../../types/domain';
import { ORGANISATIONAL_DEPARTMENTS } from '../../data/staffEstablishment';

interface PerformanceCommsReportsPanelProps {
  activeSection: 'performance' | 'comms-tasks' | 'hr-reports';
  canManageHr: boolean;
  isAuditor: boolean;
}

const TASK_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'AWAITING_REVIEW',
  'COMPLETED',
  'REJECTED',
  'OVERDUE',
  'CANCELLED',
];

const CHANNELS = [
  { code: 'ANNOUNCEMENT', label: 'Official Announcement' },
  { code: 'DEPARTMENT_MESSAGE', label: 'Departmental Message' },
  { code: 'MEETING_SCHEDULE', label: 'Meeting Schedule' },
  { code: 'MEETING_MINUTES', label: 'Meeting Minutes' },
  { code: 'OPERATIONAL_INSTRUCTION', label: 'Operational Instruction' },
  { code: 'ESCALATION_REQUEST', label: 'Escalation Request' },
  { code: 'DOCUMENT_SHARE', label: 'Document Share' },
];

export const PerformanceCommsReportsPanel: React.FC<PerformanceCommsReportsPanelProps> = ({
  activeSection,
  canManageHr,
  isAuditor,
}) => {
  const { apiFetch } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Performance state
  const [reviews, setReviews] = useState<any[]>([]);
  const [safeguardNotice, setSafeguardNotice] = useState('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [perfProfileId, setPerfProfileId] = useState('');
  const [perfCadence, setPerfCadence] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('MONTHLY');
  const [perfPeriod, setPerfPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [perfObj, setPerfObj] = useState('');
  const [perfTargetRef, setPerfTargetRef] = useState('KPI-01');
  const [perfAssigned, setPerfAssigned] = useState('10');
  const [perfCompleted, setPerfCompleted] = useState('9');
  const [perfRating, setPerfRating] = useState<'EXCEEDS' | 'MEETS_EXPECTATIONS' | 'NEEDS_IMPROVEMENT' | 'PIP_ACTIVE'>('MEETS_EXPECTATIONS');
  const [perfReviewModal, setPerfReviewModal] = useState<any | null>(null);
  const [revAction, setRevAction] = useState<'SUPERVISOR_ASSESS' | 'DEPT_HEAD_REVIEW' | 'HR_REVIEW' | 'CHALLENGE'>('SUPERVISOR_ASSESS');
  const [revComment, setRevComment] = useState('');
  const [revPip, setRevPip] = useState('');
  const [revRecognition, setRevRecognition] = useState('');
  const [revTrainingRec, setRevTrainingRec] = useState('');

  // Tasks & Communications state
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [taskScope, setTaskScope] = useState<'INDIVIDUAL' | 'TEAM' | 'DEPARTMENT'>('INDIVIDUAL');
  const [taskOfficer, setTaskOfficer] = useState('');
  const [taskDept, setTaskDept] = useState(2);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('HIGH');
  const [taskDeadline, setTaskDeadline] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));

  const [msgChannel, setMsgChannel] = useState('ANNOUNCEMENT');
  const [msgDept, setMsgDept] = useState<string>('');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgMeetTime, setMsgMeetTime] = useState('');
  const [msgDocTitle, setMsgDocTitle] = useState('');

  // HR Reports state (17 Reports + Filters)
  const [hrReport, setHrReport] = useState<any>(null);
  const [fltDept, setFltDept] = useState('');
  const [fltTitle, setFltTitle] = useState('');
  const [fltCounty, setFltCounty] = useState('ALL');
  const [fltStatus, setFltStatus] = useState('ALL');
  const [fltFrom, setFltFrom] = useState('');
  const [fltTo, setFltTo] = useState('');

  const loadPerformance = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [pRes, profRes] = await Promise.all([
        apiFetch<{ reviews: any[]; safeguardNotice: string }>('/api/staff/performance'),
        apiFetch<{ profiles: any[] }>('/api/staff/profiles'),
      ]);
      setReviews(pRes.reviews || []);
      setSafeguardNotice(pRes.safeguardNotice || '');
      setProfiles(profRes.profiles || []);
      if (profRes.profiles?.[0] && !perfProfileId) {
        setPerfProfileId(profRes.profiles[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCommsAndTasks = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [tRes, mRes] = await Promise.all([
        apiFetch<{ tasks: any[] }>('/api/staff/tasks'),
        apiFetch<{ messages: any[] }>('/api/staff/messages'),
      ]);
      setTasks(tRes.tasks || []);
      setMessages(mRes.messages || []);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHrReports = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (fltDept) params.set('departmentNumber', fltDept);
      if (fltTitle) params.set('jobTitle', fltTitle);
      if (fltCounty !== 'ALL') params.set('county', fltCounty);
      if (fltStatus !== 'ALL') params.set('employmentStatus', fltStatus);
      if (fltFrom) params.set('fromDate', fltFrom);
      if (fltTo) params.set('toDate', fltTo);
      const rep = await apiFetch<any>(`/api/staff/reports/hr-summary?${params.toString()}`);
      setHrReport(rep);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'performance') loadPerformance();
    else if (activeSection === 'comms-tasks') loadCommsAndTasks();
    else if (activeSection === 'hr-reports') loadHrReports();
  }, [activeSection]);

  const rep = hrReport?.reports;

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

      {/* 1. STAFF PERFORMANCE & ACCOUNTABILITY CENTRE */}
      {activeSection === 'performance' && (
        <div className="space-y-6">
          <div className="hc-card p-5 space-y-2 border-[#287A59]/40">
            <div className="flex items-center gap-2 font-bold text-sm text-[#102E36]">
              <Award className="w-4 h-4 text-[#287A59]" />
              Staff Performance & Accountability Centre (12 Measurable Criteria · Human-Governed)
            </div>
            <p className="text-xs text-[#287A59] font-semibold">{safeguardNotice}</p>
          </div>

          {!isAuditor && (
            <form
              className="hc-card p-5 space-y-3 text-xs"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!perfProfileId) return;
                setBusy(true);
                setErrorMsg(null);
                try {
                  await apiFetch('/api/staff/performance', {
                    method: 'POST',
                    body: JSON.stringify({
                      staffProfileId: perfProfileId,
                      cadence: perfCadence,
                      reviewPeriod: perfPeriod,
                      objectivesSummary: perfObj,
                      departmentalTargetRef: perfTargetRef,
                      assignedTasksCount: Number(perfAssigned) || 0,
                      completedActivitiesCount: Number(perfCompleted) || 0,
                      overallRating: perfRating,
                    }),
                  });
                  setPerfObj('');
                  await loadPerformance();
                  setFeedback('Performance assessment logged.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h4 className="font-bold text-sm text-[#102E36]">Initiate Performance Evaluation / Self-Assessment</h4>
              {profiles.length === 0 ? (
                <div className="text-[#4A636A]">
                  No staff profiles appointed yet. Performance evaluations activate once real staff profiles exist.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <select
                      value={perfProfileId}
                      onChange={(e) => setPerfProfileId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.staffNumber} · {p.fullLegalName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={perfCadence}
                      onChange={(e) => setPerfCadence(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      <option value="DAILY">Daily Check-In</option>
                      <option value="WEEKLY">Weekly Review</option>
                      <option value="MONTHLY">Monthly Review</option>
                      <option value="QUARTERLY">Quarterly Review</option>
                      <option value="ANNUAL">Annual Appraisal</option>
                    </select>
                    <input
                      required
                      value={perfPeriod}
                      onChange={(e) => setPerfPeriod(e.target.value)}
                      placeholder="Review Period (e.g. 2026-Q2)"
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <select
                      value={perfRating}
                      onChange={(e) => setPerfRating(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      <option value="EXCEEDS">Exceeds Expectations</option>
                      <option value="MEETS_EXPECTATIONS">Meets Expectations</option>
                      <option value="NEEDS_IMPROVEMENT">Needs Improvement</option>
                      <option value="PIP_ACTIVE">PIP Support Active</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      required
                      value={perfTargetRef}
                      onChange={(e) => setPerfTargetRef(e.target.value)}
                      placeholder="Departmental Target Ref"
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      type="number"
                      min={0}
                      value={perfAssigned}
                      onChange={(e) => setPerfAssigned(e.target.value)}
                      placeholder="Assigned Tasks"
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      type="number"
                      min={0}
                      value={perfCompleted}
                      onChange={(e) => setPerfCompleted(e.target.value)}
                      placeholder="Completed Activities"
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                  </div>
                  <input
                    required
                    minLength={5}
                    value={perfObj}
                    onChange={(e) => setPerfObj(e.target.value)}
                    placeholder="Objectives summary & role-specific service indicator notes..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
                    Save Performance Record
                  </GlossyButton>
                </>
              )}
            </form>
          )}

          <div className="hc-card p-5 space-y-3 text-xs">
            <h4 className="font-bold text-sm text-[#102E36]">Recorded Evaluations ({reviews.length})</h4>
            {reviews.length === 0 ? (
              <div className="text-[#4A636A]">No performance evaluations recorded yet.</div>
            ) : (
              <div className="space-y-2.5">
                {reviews.map((rv) => (
                  <div
                    key={rv.id}
                    className="p-3.5 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-mono-num font-bold text-[#102E36]">
                        {rv.reviewRef} · {rv.cadence} ({rv.reviewPeriod}) · {rv.reviewStage}
                      </div>
                      <div className="font-bold text-[#287A59]">
                        {rv.staffName} ({rv.department}) — {rv.overallRating}
                      </div>
                      <div className="text-[#4A636A]">{rv.objectivesSummary}</div>
                      {rv.challengeStatus === 'CHALLENGED' && (
                        <div className="text-[#9F2D20] font-semibold">
                          Staff Challenged Record: {rv.staffResponseText}
                        </div>
                      )}
                    </div>
                    {!isAuditor && (
                      <GlossyButton size="sm" variant="ivory" onClick={() => setPerfReviewModal(rv)}>
                        Supervisor / HR / Challenge
                      </GlossyButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. INTERNAL COMMUNICATION & TASK MANAGEMENT CENTRE */}
      {activeSection === 'comms-tasks' && (
        <div className="space-y-6 text-xs">
          <div className="p-3.5 rounded-xl bg-[#D9A84E]/15 border border-[#D9A84E]/40 text-[#102E36] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#9F2D20] shrink-0" />
            <span>
              <strong>Confidentiality Guardrail Active:</strong> Confidential safeguarding case details, child minor
              identities, and private beneficiary PII are blocked from general staff announcements and tasks.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tasks Column */}
            <div className="hc-card p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-sm text-[#102E36]">
                <CheckSquare className="w-4 h-4 text-[#287A59]" />
                Task Assignment & Tracking ({tasks.length})
              </div>
              {!isAuditor && (
                <form
                  className="space-y-2.5 p-3.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/12"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setErrorMsg(null);
                    try {
                      await apiFetch('/api/staff/tasks', {
                        method: 'POST',
                        body: JSON.stringify({
                          targetScope: taskScope,
                          responsibleOfficerName: taskOfficer,
                          departmentNumber: taskDept,
                          title: taskTitle,
                          description: taskDesc,
                          priority: taskPriority,
                          deadline: taskDeadline,
                        }),
                      });
                      setTaskOfficer('');
                      setTaskTitle('');
                      setTaskDesc('');
                      await loadCommsAndTasks();
                      setFeedback('Task assigned and tracked.');
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={taskScope}
                      onChange={(e) => setTaskScope(e.target.value as any)}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    >
                      <option value="INDIVIDUAL">Individual Officer</option>
                      <option value="TEAM">Team</option>
                      <option value="DEPARTMENT">Department</option>
                    </select>
                    <select
                      value={taskDept}
                      onChange={(e) => setTaskDept(Number(e.target.value))}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    >
                      {ORGANISATIONAL_DEPARTMENTS.map((d) => (
                        <option key={d.number} value={d.number}>
                          Dept {d.number}: {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      required
                      value={taskOfficer}
                      onChange={(e) => setTaskOfficer(e.target.value)}
                      placeholder="Responsible officer / team"
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    />
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as any)}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    >
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <input
                      type="date"
                      required
                      value={taskDeadline}
                      onChange={(e) => setTaskDeadline(e.target.value)}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    />
                  </div>
                  <input
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                  />
                  <textarea
                    required
                    rows={2}
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    placeholder="Operational description (no beneficiary/safeguarding PII)..."
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                  />
                  <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
                    Assign Task
                  </GlossyButton>
                </form>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tasks.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl bg-white border border-[#102E36]/12 space-y-1.5">
                    <div className="flex items-center justify-between font-mono-num">
                      <strong className="text-[#102E36]">{t.taskReference}</strong>
                      <span className="font-semibold text-[#287A59]">{t.status}</span>
                    </div>
                    <div className="font-bold text-[#102E36]">{t.title}</div>
                    <div className="text-[#4A636A]">
                      {t.responsibleOfficerName} ({t.department}) · Due {t.deadline} · Supervisor: {t.supervisorName}
                    </div>
                    {!isAuditor && (
                      <select
                        value={t.status}
                        onChange={async (e) => {
                          await apiFetch(`/api/staff/tasks/${t.id}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: e.target.value }),
                          });
                          await loadCommsAndTasks();
                        }}
                        className="px-2 py-1 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15"
                      >
                        {TASK_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            Status: {st}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Internal Communications Column */}
            <div className="hc-card p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-sm text-[#102E36]">
                <MessageSquare className="w-4 h-4 text-[#287A59]" />
                Internal Announcements, Meetings & Escalations ({messages.length})
              </div>
              {!isAuditor && (
                <form
                  className="space-y-2.5 p-3.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/12"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setErrorMsg(null);
                    try {
                      await apiFetch('/api/staff/messages', {
                        method: 'POST',
                        body: JSON.stringify({
                          channelType: msgChannel,
                          departmentNumber: msgDept ? Number(msgDept) : null,
                          title: msgTitle,
                          body: msgBody,
                          meetingDateTime: msgMeetTime || undefined,
                          attachmentDocTitle: msgDocTitle || undefined,
                        }),
                      });
                      setMsgTitle('');
                      setMsgBody('');
                      await loadCommsAndTasks();
                      setFeedback('Internal communication published after confidentiality check.');
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={msgChannel}
                      onChange={(e) => setMsgChannel(e.target.value)}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    >
                      {CHANNELS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={msgDept}
                      onChange={(e) => setMsgDept(e.target.value)}
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    >
                      <option value="">All Departments</option>
                      {ORGANISATIONAL_DEPARTMENTS.map((d) => (
                        <option key={d.number} value={String(d.number)}>
                          Dept {d.number}: {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    required
                    value={msgTitle}
                    onChange={(e) => setMsgTitle(e.target.value)}
                    placeholder="Notice / Meeting / Escalation Title"
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                  />
                  <textarea
                    required
                    rows={2}
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="Operational content (confidential safeguarding & beneficiary info automatically blocked)..."
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={msgMeetTime}
                      onChange={(e) => setMsgMeetTime(e.target.value)}
                      placeholder="Meeting time (optional)"
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    />
                    <input
                      value={msgDocTitle}
                      onChange={(e) => setMsgDocTitle(e.target.value)}
                      placeholder="Attachment ref (optional)"
                      className="px-2.5 py-2 rounded-lg bg-white border border-[#102E36]/15"
                    />
                  </div>
                  <GlossyButton type="submit" size="sm" variant="gold" disabled={busy}>
                    Publish Communication
                  </GlossyButton>
                </form>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className="p-3 rounded-xl bg-white border border-[#102E36]/12 space-y-1">
                    <div className="flex justify-between text-[11px] font-mono-num text-[#287A59]">
                      <span>
                        {m.messageRef} · {m.channelType.replace(/_/g, ' ')}
                      </span>
                      <span>{m.department}</span>
                    </div>
                    <div className="font-bold text-[#102E36]">{m.title}</div>
                    <div className="text-[#4A636A]">{m.body}</div>
                    <div className="text-[11px] text-[#4A636A]">Sent by {m.senderName}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. HR & ORGANISATIONAL REPORTING CENTRE (ALL 17 LIVE REPORTS) */}
      {activeSection === 'hr-reports' && (
        <div className="space-y-6 text-xs">
          <div className="hc-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#287A59]" />
                <div>
                  <h3 className="text-lg font-bold text-[#102E36]">
                    HR & Organisational Reporting Centre (All 17 Live Reports)
                  </h3>
                  <p className="text-[#4A636A]">
                    Public-safe aggregate reporting with confidential employee PII strictly excluded and zero fabricated
                    counts.
                  </p>
                </div>
              </div>
              <ExportReportBar
                title="Humanity Connect 17 HR Organisational Reports"
                csvFilename="humanity-connect-hr-17-reports.csv"
                rows={rep?.departmentalStaffingNeeds || []}
              />
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <select
                value={fltDept}
                onChange={(e) => setFltDept(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="">All Departments</option>
                {ORGANISATIONAL_DEPARTMENTS.map((d) => (
                  <option key={d.number} value={String(d.number)}>
                    Dept {d.number}: {d.name}
                  </option>
                ))}
              </select>
              <input
                value={fltTitle}
                onChange={(e) => setFltTitle(e.target.value)}
                placeholder="Job Title filter..."
                className="px-2.5 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
              <select
                value={fltCounty}
                onChange={(e) => setFltCounty(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ALL">All 47 Counties</option>
                {KENYAN_47_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={fltStatus}
                onChange={(e) => setFltStatus(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ALL">All Employment Statuses</option>
                {STAFF_EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={fltFrom}
                onChange={(e) => setFltFrom(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton size="sm" variant="teal" onClick={loadHrReports}>
                Apply Filters
              </GlossyButton>
            </div>
          </div>

          {rep && (
            <>
              {/* Reports 1–3, 8–14, 16–17 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: '1. Total Approved', val: rep.totalApprovedPositions },
                  { label: '2. Filled Positions', val: rep.filledPositions },
                  { label: '3. Vacant Positions', val: rep.vacantPositions },
                  { label: '8. Recruitment Apps', val: rep.recruitmentStatistics?.totalApplications ?? 0 },
                  { label: '9. Training Sessions', val: rep.staffTraining?.completedTrainingSessions ?? 0 },
                  { label: '10. Promotions', val: rep.staffPromotions?.totalPromotionsRecorded ?? 0 },
                  { label: '11. Transfers', val: rep.transfers?.transferredStaffCount ?? 0 },
                  { label: '12. On Leave', val: rep.leaveRecords?.currentlyOnLeave ?? 0 },
                  { label: '13. Perf. Reviews', val: rep.staffPerformance?.totalReviews ?? 0 },
                  { label: '14. Active Volunteers', val: rep.volunteerNumbers?.activeCommunityVolunteers ?? 0 },
                  {
                    label: '16. Total Staff Exits',
                    val:
                      (rep.staffExits?.resigned ?? 0) +
                      (rep.staffExits?.retired ?? 0) +
                      (rep.staffExits?.terminated ?? 0),
                  },
                  {
                    label: '17. Capacity Fill %',
                    val: `${rep.organisationalCapacity?.establishmentFillRatePct ?? 0}%`,
                  },
                ].map((c) => (
                  <div key={c.label} className="hc-card p-3.5">
                    <div className="text-[11px] text-[#4A636A]">{c.label}</div>
                    <div className="text-xl font-extrabold font-mono-num text-[#102E36] mt-0.5">{c.val}</div>
                  </div>
                ))}
              </div>

              {/* Reports 4, 15, 5, 6, 7 Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 hc-card p-5 space-y-3">
                  <h4 className="font-bold text-sm text-[#102E36]">
                    4 & 15. Staff by Department & Staffing Shortfall Needs
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                        <tr>
                          <th className="py-2 pr-2">Department</th>
                          <th className="py-2 pr-2">Approved</th>
                          <th className="py-2 pr-2">Filled</th>
                          <th className="py-2 pr-2">Shortfall</th>
                          <th className="py-2">Priority Need</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#102E36]/10">
                        {(rep.departmentalStaffingNeeds || []).map((d: any) => (
                          <tr key={d.departmentNumber}>
                            <td className="py-2 pr-2 font-semibold">
                              Dept {d.departmentNumber}: {d.department}
                            </td>
                            <td className="py-2 pr-2 font-mono-num">{d.approved}</td>
                            <td className="py-2 pr-2 font-mono-num text-[#287A59]">{d.filled}</td>
                            <td className="py-2 pr-2 font-mono-num text-[#9F2D20]">{d.shortfallPositions}</td>
                            <td className="py-2 font-semibold">{d.urgency.replace(/_/g, ' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="hc-card p-4 space-y-2">
                    <h5 className="font-bold text-[#102E36]">5–7. County, Category & Lawful Gender Breakdown</h5>
                    <div className="space-y-1 text-[#4A636A]">
                      <div>
                        <strong>By County:</strong>{' '}
                        {(rep.staffByCounty || []).length === 0
                          ? '0 active profiles assigned yet'
                          : rep.staffByCounty.map((x: any) => `${x.county}: ${x.count}`).join(' · ')}
                      </div>
                      <div>
                        <strong>By Employment Category:</strong>{' '}
                        {(rep.staffByEmploymentCategory || []).length === 0
                          ? '0 active categories'
                          : rep.staffByEmploymentCategory.map((x: any) => `${x.category}: ${x.count}`).join(' · ')}
                      </div>
                      <div>
                        <strong>By Gender (Lawful Aggregate):</strong>{' '}
                        {(rep.staffByGender || []).length === 0
                          ? '0 markers recorded'
                          : rep.staffByGender.map((x: any) => `${x.gender}: ${x.count}`).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div className="hc-card p-4 space-y-1.5">
                    <h5 className="font-bold text-[#102E36]">17. Organisational Capacity & Volunteer Footprint</h5>
                    <div>
                      County Field Coverage: {rep.organisationalCapacity?.kenyaCountyCoverageCount ?? 0} / 47 Counties (
                      {rep.organisationalCapacity?.kenyaCountyCoveragePct ?? 0}%)
                    </div>
                    <div>
                      Task Completion Rate: {rep.organisationalCapacity?.taskCompletionRatePct ?? 0}% · International
                      Officers: {rep.organisationalCapacity?.internationalOfficersCount ?? 0}
                    </div>
                    <div>
                      Establishment Volunteer Roles: {rep.volunteerNumbers?.establishmentVolunteerRoles ?? 0} ·
                      Coordinators: {rep.volunteerNumbers?.volunteerCoordinatorsAppointed ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Performance Supervisor / Dept Head / HR / Staff Challenge Modal */}
      <ModalDialog
        open={Boolean(perfReviewModal)}
        title={perfReviewModal ? `Review Action — ${perfReviewModal.reviewRef}` : ''}
        onClose={() => setPerfReviewModal(null)}
      >
        {perfReviewModal && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/staff/performance/${perfReviewModal.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    actionType: revAction,
                    supervisorAssessmentText: revAction === 'SUPERVISOR_ASSESS' ? revComment : undefined,
                    departmentHeadReviewText: revAction === 'DEPT_HEAD_REVIEW' ? revComment : undefined,
                    hrReviewText: revAction === 'HR_REVIEW' ? revComment : undefined,
                    staffResponseText: revAction === 'CHALLENGE' ? revComment : undefined,
                    challengeReason: revAction === 'CHALLENGE' ? revComment : undefined,
                    improvementPlan: revPip || undefined,
                    recognitionCommendation: revRecognition || undefined,
                    trainingRecommendation: revTrainingRec || undefined,
                  }),
                });
                setPerfReviewModal(null);
                setRevComment('');
                await loadPerformance();
                setFeedback('Performance assessment workflow updated.');
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <select
              value={revAction}
              onChange={(e) => setRevAction(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="SUPERVISOR_ASSESS">Supervisor Assessment</option>
              <option value="DEPT_HEAD_REVIEW">Department Head Review</option>
              {canManageHr && <option value="HR_REVIEW">HR Finalisation Review</option>}
              <option value="CHALLENGE">Staff Response / Challenge Inaccurate Record</option>
            </select>
            <textarea
              required
              rows={3}
              value={revComment}
              onChange={(e) => setRevComment(e.target.value)}
              placeholder="Assessment comment, PIP recommendation, or staff right-of-response..."
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            {revAction === 'SUPERVISOR_ASSESS' && (
              <div className="space-y-2">
                <input
                  value={revPip}
                  onChange={(e) => setRevPip(e.target.value)}
                  placeholder="Performance Improvement Plan (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  value={revRecognition}
                  onChange={(e) => setRevRecognition(e.target.value)}
                  placeholder="Recognition / Commendation (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  value={revTrainingRec}
                  onChange={(e) => setRevTrainingRec(e.target.value)}
                  placeholder="Training Recommendation (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
            )}
            <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
              Save Workflow Stage
            </GlossyButton>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
