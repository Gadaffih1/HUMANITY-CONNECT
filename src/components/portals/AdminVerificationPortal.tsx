import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Sliders,
  Landmark,
  Lock,
  Sparkles,
  MapPin,
  Briefcase,
  Users,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Download,
  Database,
  UserPlus,
  KeyRound,
  MessageSquare,
  Send,
  Search,
  Phone,
  Mail,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  GlossyButton,
  ExportReportBar,
  ModalDialog,
  formatMoney,
  priorityLabel,
  verificationLabel,
} from '../ui/DesignSystem';
import { AccountSecurityPanel } from '../auth/AuthScreens';
import {
  saveEncryptedOfflineRecord,
  listEncryptedOfflineRecords,
  markOfflineRecordSynced,
  securelyWipeOfflineRecord,
  type OfflineFieldRecord,
} from '../../lib/offlineVault';
import { AdminMatchingGovernancePanel } from '../matching/AdminMatchingGovernancePanel';
import { StaffManagementCentre } from '../staff/StaffManagementCentre';
import {
  ROLE_DEFINITIONS,
  SUB_ADMIN_PERMISSION_FLAGS,
  SUB_ADMIN_ROLE_CODES,
  type RoleCode,
} from '../../types/domain';

type AdminTab =
  | 'verification'
  | 'needs'
  | 'matching'
  | 'finance'
  | 'safeguarding'
  | 'empowerment'
  | 'field-ops'
  | 'staff-centre'
  | 'governance'
  | 'accounts';

export const AdminVerificationPortal: React.FC = () => {
  const { apiFetch, user, token } = useAuth();
  const [tab, setTab] = useState<AdminTab>('verification');
  const [adminData, setAdminData] = useState<any>(null);
  const [monthlyReport, setMonthlyReport] = useState<any>(null);
  const [darajaGuide, setDarajaGuide] = useState<any>(null);
  const [empowerment, setEmpowerment] = useState<any>(null);
  const [projectsData, setProjectsData] = useState<any>(null);
  const [dpiaData, setDpiaData] = useState<any>(null);
  const [commCentre, setCommCentre] = useState<any>(null);
  const [talksasaData, setTalksasaData] = useState<any>(null);
  const [smsPhone, setSmsPhone] = useState('+2547');
  const [smsTemplate, setSmsTemplate] = useState<'VERIFICATION' | 'PAYMENT' | 'ONBOARDING' | 'GENERAL'>('GENERAL');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Verification Centre State
  const [workspace, setWorkspace] = useState<
    'VERIFICATION_OFFICER' | 'SOCIAL_WELFARE_OFFICER' | 'FIELD_OFFICER' | 'SAFEGUARDING_OFFICER'
  >('VERIFICATION_OFFICER');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [verifReason, setVerifReason] = useState('');
  const [verifNotes, setVerifNotes] = useState('');
  const [instRef, setInstRef] = useState('');

  // Needs Assessment 100-point Model State
  const [selectedNeedId, setSelectedNeedId] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [vulnScore, setVulnScore] = useState(24);
  const [urgencyScore, setUrgencyScore] = useState(20);
  const [depScore, setDepScore] = useState(16);
  const [sgScore, setSgScore] = useState(12);
  const [empScore, setEmpScore] = useState(8);
  const [humanTier, setHumanTier] = useState<
    'P1_CRITICAL' | 'P2_URGENT' | 'P3_HIGH' | 'P4_MODERATE' | 'P5_DEVELOPMENTAL'
  >('P2_URGENT');
  const [approvedKes, setApprovedKes] = useState('25000');
  const [assessRationale, setAssessRationale] = useState('');
  const [aiAdvisoryText, setAiAdvisoryText] = useState<string | null>(null);
  const [aiAdvisoryTier, setAiAdvisoryTier] = useState<string | undefined>(undefined);

  // Finance Disbursement & Maker-Checker State
  const [disbFundId, setDisbFundId] = useState('');
  const [disbBenId, setDisbBenId] = useState('');
  const [disbTitle, setDisbTitle] = useState('');
  const [disbAmountKes, setDisbAmountKes] = useState('10000');
  const [disbChannel, setDisbChannel] = useState<
    'MPESA_B2C' | 'SCHOOL_PAYBILL' | 'HOSPITAL_EFT' | 'VENDOR_VOUCHER'
  >('SCHOOL_PAYBILL');
  const [mcType, setMcType] = useState<'DISBURSEMENT' | 'REFUND' | 'REVERSAL' | 'FUND_ALLOCATION'>('DISBURSEMENT');
  const [mcPathway, setMcPathway] = useState<'DIRECT_SPONSORSHIP' | 'CENTRAL_FUND'>('CENTRAL_FUND');
  const [mcReason, setMcReason] = useState('');

  // Safeguarding Incident State
  const [sgCategory, setSgCategory] = useState('CHILD_PROTECTION');
  const [sgSeverity, setSgSeverity] = useState('HIGH');
  const [sgSummary, setSgSummary] = useState('');

  // Database-Backed Data Retention & Cross-Browser Governance State
  const [retentionYearsDraft, setRetentionYearsDraft] = useState<Record<string, string>>({});
  const [retentionBusyId, setRetentionBusyId] = useState<string | null>(null);
  const [sessionTtlDraft, setSessionTtlDraft] = useState('24');
  const [settingsBusy, setSettingsBusy] = useState(false);

  // Empowerment Partner State
  const [partnerName, setPartnerName] = useState('');
  const [partnerType, setPartnerType] = useState<'TRAINING_INSTITUTION' | 'EMPLOYER'>('TRAINING_INSTITUTION');
  const [partnerCounty, setPartnerCounty] = useState('Nairobi');
  const [partnerEmail, setPartnerEmail] = useState('');

  // Offline Mobile-First Field Operations State
  const [offlineRecords, setOfflineRecords] = useState<OfflineFieldRecord[]>([]);
  const [fieldRecordType, setFieldRecordType] = useState<OfflineFieldRecord['recordType']>('FIELD_VISIT');
  const [fieldCounty, setFieldCounty] = useState('Nakuru');
  const [fieldSummary, setFieldSummary] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Sub-Admin Creation & Granular RBAC Permission Mapping Modal State
  const [userFilter, setUserFilter] = useState<'ALL' | 'SUB_ADMINS' | 'NON_ADMIN'>('ALL');
  const [createSubAdminOpen, setCreateSubAdminOpen] = useState(false);
  const [saFullName, setSaFullName] = useState('');
  const [saEmail, setSaEmail] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [saRoleCode, setSaRoleCode] = useState<RoleCode>('VERIFICATION_OFFICER');
  const [saFlags, setSaFlags] = useState<string[]>(['canVerifyUsers', 'canVerifyNeed']);
  const [saReason, setSaReason] = useState('');

  const [permModalUser, setPermModalUser] = useState<any | null>(null);
  const [permTargetRole, setPermTargetRole] = useState<RoleCode>('VERIFICATION_OFFICER');
  const [permFlags, setPermFlags] = useState<string[]>([]);
  const [permPreview, setPermPreview] = useState<any>(null);
  const [permAuthReason, setPermAuthReason] = useState('');
  const [permBusy, setPermBusy] = useState(false);

  // Super Admin Registered Accounts Directory State
  const [usersDirectory, setUsersDirectory] = useState<{
    totalCount: number;
    users: Array<{
      id: string;
      fullName: string;
      email: string;
      phoneE164?: string | null;
      countryCode: string;
      county?: string | null;
      subCounty?: string | null;
      ward?: string | null;
      approvalStatus: string;
      emailVerified: boolean;
      phoneVerified: boolean;
      mfaEnabled: boolean;
      lastLoginAt?: string | null;
      createdAt: string;
      roles: string[];
      beneficiaryClassification?: string | null;
      beneficiaryRef?: string | null;
    }>;
  } | null>(null);
  const [dirSearch, setDirSearch] = useState('');
  const [dirCountyFilter, setDirCountyFilter] = useState('ALL');
  const [dirRoleFilter, setDirRoleFilter] = useState('ALL');
  const [dirRefreshing, setDirRefreshing] = useState(false);

  const loadOffline = async () => {
    const items = await listEncryptedOfflineRecords(token);
    setOfflineRecords(items);
  };

  const loadAll = async () => {
    setErrorMsg(null);
    try {
      const isSuperAdmin = Boolean(user?.roles.includes('SUPER_ADMIN'));
      const ov = await apiFetch<any>('/api/admin/overview');
      setAdminData(ov);

      if (ov.verificationCases?.[0] && !selectedCaseId) {
        setSelectedCaseId(ov.verificationCases[0].id);
        setDisbBenId(ov.verificationCases[0].beneficiaryId);
      }
      if (ov.needs?.[0] && !selectedNeedId) {
        setSelectedNeedId(ov.needs[0].id);
      }
      if (ov.funds?.[0] && !disbFundId) {
        setDisbFundId(ov.funds[0].id);
      }

      const [rep, guide, emp, proj, comm, ts, dir] = await Promise.all([
        apiFetch<any>('/api/payments/reports/monthly').catch(() => null),
        apiFetch<any>('/api/payments/integration-guide').catch(() => null),
        apiFetch<any>('/api/operations/empowerment').catch(() => null),
        apiFetch<any>('/api/operations/projects').catch(() => null),
        apiFetch<any>('/api/communications/centre').catch(() => null),
        apiFetch<any>('/api/communications/talksasa/logs').catch(() => null),
        isSuperAdmin ? apiFetch<any>('/api/admin/users-directory').catch(() => null) : Promise.resolve(null),
      ]);
      if (rep) setMonthlyReport(rep);
      if (guide) setDarajaGuide(guide);
      if (emp) setEmpowerment(emp);
      if (proj) setProjectsData(proj);
      if (comm) setCommCentre(comm);
      if (ts) setTalksasaData(ts);
      if (dir) setUsersDirectory(dir);

      try {
        const dpia = await apiFetch<any>('/api/operations/safeguarding/dpia-inventory');
        setDpiaData(dpia);
        const yearMap: Record<string, string> = {};
        for (const rp of dpia?.retentionPolicies || []) {
          if (rp?.id) yearMap[rp.id] = String(rp.retentionYears ?? 0);
        }
        setRetentionYearsDraft(yearMap);
        const strictSetting = (dpia?.platformSettings || []).find(
          (s: any) => s.settingKey === 'STRICT_DB_ONLY_CROSS_BROWSER_RETENTION'
        );
        if (strictSetting?.valueJson?.sessionTtlHours !== undefined) {
          setSessionTtlDraft(String(strictSetting.valueJson.sessionTtlHours));
        }
      } catch {
        // Privileged DPIA view requires verified MFA step-up
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load governance overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    loadOffline();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const [exportingDump, setExportingDump] = useState(false);

  const downloadPgDump = async () => {
    setErrorMsg(null);
    setFeedback(null);
    setExportingDump(true);
    try {
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (user?.activeRole) headers.set('X-Active-Role', user.activeRole);
      const res = await fetch('/api/admin/export-pg-dump', { headers, credentials: 'include' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `humanity-connect-postgres-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback('PostgreSQL dump (.sql) downloaded to your computer for localhost restore.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to export PostgreSQL dump.');
    } finally {
      setExportingDump(false);
    }
  };

  const needsMfaStepUp = Boolean(user?.mfaEnabled && !user?.mfaVerifiedInSession);
  const activeCase = (adminData?.verificationCases || []).find((c: any) => c.id === selectedCaseId);
  const activeNeed = (adminData?.needs || []).find((n: any) => n.id === selectedNeedId);
  const total100Score = vulnScore + urgencyScore + depScore + sgScore + empScore;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="hc-card p-10 text-center text-sm text-[#4A636A]">
          Loading Governance, Verification & Operations Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#287A59]">
            Humanity Connect Governance · {user?.activeRole}
          </div>
          <h2 className="text-2xl font-extrabold text-[#102E36]">
            Verification, Needs Triage, Finance & Safeguarding Command
          </h2>
        </div>
      </div>

      {needsMfaStepUp && (
        <div className="hc-card p-5 bg-[#FAF9F6] border-[#D9A84E] space-y-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[#B6721A] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#102E36]">
                TOTP Multi-Factor Authentication Step-Up Required for Privileged Actions
              </h3>
              <p className="text-xs text-[#4A636A]">
                Read-only oversight is active, while verification approvals, need priority sign-off,
                disbursements, and safeguarding records enforce active TOTP MFA verification.
              </p>
            </div>
          </div>
          <AccountSecurityPanel />
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 auto-rows-fr gap-2.5 p-3 rounded-2xl bg-[#EAE6DC]/75 border border-[#102E36]/10">
        {[
          { id: 'verification', label: 'Verification Centre (V0–V4)', tone: 'hc-btn-teal' },
          { id: 'needs', label: 'Needs Engine (15 Cats)', tone: 'hc-btn-green' },
          { id: 'matching', label: 'AI Matching Engine', tone: 'hc-btn-indigo' },
          { id: 'finance', label: 'Finance & Daraja M-Pesa', tone: 'hc-btn-gold' },
          { id: 'safeguarding', label: 'Safeguarding & DPIA', tone: 'hc-btn-crimson' },
          { id: 'empowerment', label: 'Empowerment & Projects', tone: 'hc-btn-amber' },
          { id: 'field-ops', label: 'Field Ops (Offline Vault)', tone: 'hc-btn-moss' },
          { id: 'staff-centre', label: 'Staff, Org & HR Centre', tone: 'hc-btn-plum' },
          { id: 'governance', label: 'RBAC, Templates & Audits', tone: 'hc-btn-slate' },
        ].map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as AdminTab)}
              aria-pressed={isActive}
              className={`hc-btn ${item.tone} w-full h-full min-h-[48px] !rounded-2xl !whitespace-normal text-center leading-snug px-3.5 py-2.5 text-xs font-semibold ${
                isActive
                  ? 'ring-2 ring-[#D9A84E] ring-offset-2 ring-offset-[#F4F2EC] -translate-y-0.5 brightness-105'
                  : 'opacity-95 hover:opacity-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-sm text-[#287A59]">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-sm text-[#9F2D20] flex flex-wrap items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <GlossyButton
            size="sm"
            variant="ivory"
            onClick={() => {
              setLoading(true);
              loadAll();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </GlossyButton>
        </div>
      )}

      {/* 1. Verification Centre */}
      {tab === 'verification' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="hc-card p-5 space-y-3">
              <label className="block text-xs font-semibold text-[#102E36]">
                Active Officer Workspace
              </label>
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="VERIFICATION_OFFICER">1. Verification Officer</option>
                <option value="SOCIAL_WELFARE_OFFICER">2. Social Welfare Officer</option>
                <option value="FIELD_OFFICER">3. County Field Officer</option>
                <option value="SAFEGUARDING_OFFICER">4. Safeguarding Officer</option>
              </select>
            </div>

            <div className="hc-card p-4 space-y-2 max-h-[540px] overflow-y-auto">
              <div className="text-xs font-semibold text-[#4A636A] px-1">
                Verification Queue ({(adminData?.verificationCases || []).length})
              </div>
              {(adminData?.verificationCases || []).map((vc: any) => (
                <button
                  key={vc.id}
                  type="button"
                  onClick={() => setSelectedCaseId(vc.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    selectedCaseId === vc.id
                      ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]'
                      : 'bg-white text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono-num">
                    <span>{vc.caseNumber}</span>
                    <span>{vc.verificationLevel}</span>
                  </div>
                  <div className="text-sm font-bold mt-1">{vc.displayAlias}</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {vc.fieldCounty} County · {vc.stage}
                    {vc.duplicateAlertFlag ? ' · Duplicate Flagged' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {activeCase ? (
              <div className="hc-card p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono-num text-[#4A636A]">
                      {activeCase.caseNumber} · Ref: {activeCase.beneficiaryRef}
                    </div>
                    <h3 className="text-xl font-bold text-[#102E36]">{activeCase.displayAlias}</h3>
                    <div className="text-xs text-[#287A59] font-semibold mt-0.5">
                      {verificationLabel(activeCase.verificationLevel)} · Stage: {activeCase.stage}
                    </div>
                  </div>
                  {activeCase.isMinorCase && (
                    <span className="text-xs font-bold text-[#9F2D20]">
                      Minor Protection Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { label: 'Identity Checked', ok: activeCase.identityVerified },
                    { label: 'Guardian Verified', ok: activeCase.guardianVerified },
                    { label: 'Household Verified', ok: activeCase.householdVerified },
                    { label: 'Need Verified', ok: activeCase.needVerified },
                    { label: 'Field Visit Done', ok: activeCase.fieldVisitVerified },
                    { label: 'Safeguarding Cleared', ok: activeCase.safeguardingCleared },
                  ].map((chk) => (
                    <div
                      key={chk.label}
                      className={`p-2.5 rounded-xl border ${
                        chk.ok
                          ? 'bg-[#287A59]/10 border-[#287A59]/30 text-[#287A59]'
                          : 'bg-white border-[#102E36]/10 text-[#4A636A]'
                      }`}
                    >
                      {chk.ok ? '✓ ' : '○ '}
                      {chk.label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={instRef}
                    onChange={(e) => setInstRef(e.target.value)}
                    placeholder="Institutional Confirmation Ref (School / Chief / Hospital)"
                    className="px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                  <input
                    value={verifNotes}
                    onChange={(e) => setVerifNotes(e.target.value)}
                    placeholder="Field Visit Summary Notes"
                    className="px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>

                <textarea
                  rows={2}
                  value={verifReason}
                  onChange={(e) => setVerifReason(e.target.value)}
                  placeholder="Documented Officer Reason (Mandatory, min 5 characters)..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />

                <div className="flex flex-wrap gap-2">
                  {[
                    { action: 'FIELD_VISIT', label: 'Record Field Visit (V3)', variant: 'ivory' as const, level: 'V3' },
                    { action: 'APPROVE_V4', label: 'Approve V4 & Publish', variant: 'green' as const, level: 'V4' },
                    { action: 'DUPLICATE_FLAG', label: 'Flag Potential Duplicate', variant: 'gold' as const, level: activeCase.verificationLevel },
                    { action: 'REASSESSMENT', label: 'Request Reassessment', variant: 'ivory' as const, level: activeCase.verificationLevel },
                    { action: 'SUSPEND', label: 'Suspend Case', variant: 'teal' as const, level: activeCase.verificationLevel },
                  ].map((btn) => (
                    <GlossyButton
                      key={btn.action}
                      size="sm"
                      variant={btn.variant}
                      onClick={async () => {
                        setErrorMsg(null);
                        try {
                          await apiFetch(`/api/admin/verification/${activeCase.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({
                              officerWorkspace: workspace,
                              actionType: btn.action,
                              verificationLevel: btn.level,
                              reason: verifReason,
                              fieldVisitVerified: btn.action === 'FIELD_VISIT' || btn.action === 'APPROVE_V4',
                              fieldVisitNotes: verifNotes || undefined,
                              institutionalConfirmationRef: instRef || undefined,
                              duplicateAlertFlag: btn.action === 'DUPLICATE_FLAG',
                              identityVerified: true,
                              householdVerified: true,
                              needVerified: true,
                              guardianVerified: true,
                            }),
                          });
                          setVerifReason('');
                          await loadAll();
                          setFeedback(`Verification action ${btn.action} logged with documented reason.`);
                        } catch (err: any) {
                          setErrorMsg(err.message);
                        }
                      }}
                    >
                      {btn.label}
                    </GlossyButton>
                  ))}
                </div>

                <div className="pt-4 border-t border-[#102E36]/10 space-y-2">
                  <div className="text-xs font-bold text-[#102E36]">Audit Case History</div>
                  {(adminData?.caseEvents || [])
                    .filter((ev: any) => ev.caseId === activeCase.id)
                    .slice(0, 6)
                    .map((ev: any) => (
                      <div key={ev.id} className="text-xs text-[#4A636A] flex justify-between gap-2">
                        <span>
                          <strong className="text-[#102E36]">{ev.eventType}</strong> ({ev.actorWorkspace}) — {ev.reason}
                        </span>
                        <span className="font-mono-num shrink-0">
                          {ev.previousLevel} → {ev.newLevel}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="hc-card p-6 text-sm text-[#4A636A]">Select a case from the queue.</div>
            )}
          </div>
        </div>
      )}

      {/* 2. Needs Management Engine */}
      {tab === 'needs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 hc-card p-4 space-y-3 max-h-[600px] overflow-y-auto">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="ALL">All Priority Tiers (P1–P5)</option>
              <option value="P1_CRITICAL">P1 Critical</option>
              <option value="P2_URGENT">P2 Urgent</option>
              <option value="P3_HIGH">P3 High</option>
              <option value="P4_MODERATE">P4 Moderate</option>
              <option value="P5_DEVELOPMENTAL">P5 Developmental</option>
            </select>
            {(adminData?.needs || [])
              .filter((n: any) => priorityFilter === 'ALL' || n.priorityTier === priorityFilter)
              .map((n: any) => {
                const p = priorityLabel(n.priorityTier);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setSelectedNeedId(n.id);
                      setApprovedKes(String(Math.round((n.approvedAmountMinor || n.targetAmountMinor) / 100)));
                      setHumanTier(n.priorityTier);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border ${
                      selectedNeedId === n.id
                        ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]'
                        : 'bg-white text-[#102E36] border-[#102E36]/15'
                    }`}
                  >
                    <div className="flex justify-between text-xs font-mono-num">
                      <span>{n.referenceCode}</span>
                      <span className={selectedNeedId === n.id ? 'text-[#D9A84E]' : p.toneClass}>
                        {p.label}
                      </span>
                    </div>
                    <div className="text-sm font-bold mt-1">{n.title}</div>
                    <div className="text-xs opacity-80">
                      {n.beneficiaryAlias} · {n.categoryName} · {formatMoney(n.targetAmountMinor, n.currency)}
                    </div>
                  </button>
                );
              })}
          </div>

          <div className="lg:col-span-7 hc-card p-6 space-y-5">
            {activeNeed ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono-num text-[#4A636A]">
                      {activeNeed.referenceCode} · {activeNeed.categoryName}
                    </div>
                    <h3 className="text-xl font-bold text-[#102E36]">{activeNeed.title}</h3>
                    <p className="text-sm text-[#4A636A] mt-1">{activeNeed.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#4A636A]">100-Point Score</div>
                    <div className="text-2xl font-extrabold font-mono-num text-[#102E36]">
                      {total100Score} / 100
                    </div>
                  </div>
                </div>

                {/* Gemini AI Advisory Assist (Never Auto-Rejects) */}
                <div className="p-4 rounded-xl bg-[#EAE6DC]/60 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#102E36]">
                      Advisory AI Priority Support (Human Final Approval Mandatory)
                    </span>
                    <GlossyButton
                      size="sm"
                      variant="gold"
                      onClick={async () => {
                        setErrorMsg(null);
                        try {
                          const res = await apiFetch<{ output: string; advisoryPriority?: string }>('/api/ai/assist', {
                            method: 'POST',
                            body: JSON.stringify({
                              mode: 'NEED_TRIAGE_ADVISORY',
                              text: `${activeNeed.categoryName}: ${activeNeed.title}. ${activeNeed.description}`,
                              language: 'en',
                            }),
                          });
                          setAiAdvisoryText(res.output);
                          setAiAdvisoryTier(res.advisoryPriority);
                        } catch (err: any) {
                          setErrorMsg(err.message);
                        }
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Get Gemini Advisory
                    </GlossyButton>
                  </div>
                  {aiAdvisoryText && (
                    <div className="text-xs text-[#102E36] whitespace-pre-wrap pt-1">{aiAdvisoryText}</div>
                  )}
                </div>

                {/* Adjustable 100-point assessment sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <label className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Household Vulnerability (0–30)</span>
                      <span className="font-mono-num">{vulnScore}</span>
                    </div>
                    <input type="range" min={0} max={30} value={vulnScore} onChange={(e) => setVulnScore(Number(e.target.value))} className="w-full" />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Medical / Shelter Urgency (0–25)</span>
                      <span className="font-mono-num">{urgencyScore}</span>
                    </div>
                    <input type="range" min={0} max={25} value={urgencyScore} onChange={(e) => setUrgencyScore(Number(e.target.value))} className="w-full" />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Child / Dependent Ratio (0–20)</span>
                      <span className="font-mono-num">{depScore}</span>
                    </div>
                    <input type="range" min={0} max={20} value={depScore} onChange={(e) => setDepScore(Number(e.target.value))} className="w-full" />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Safeguarding Risk Factor (0–15)</span>
                      <span className="font-mono-num">{sgScore}</span>
                    </div>
                    <input type="range" min={0} max={15} value={sgScore} onChange={(e) => setSgScore(Number(e.target.value))} className="w-full" />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <div className="flex justify-between font-semibold">
                      <span>Empowerment Sustainability Potential (0–10)</span>
                      <span className="font-mono-num">{empScore}</span>
                    </div>
                    <input type="range" min={0} max={10} value={empScore} onChange={(e) => setEmpScore(Number(e.target.value))} className="w-full" />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#102E36] mb-1">Human Final Priority Tier</label>
                    <select
                      value={humanTier}
                      onChange={(e) => setHumanTier(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                    >
                      <option value="P1_CRITICAL">P1 Critical</option>
                      <option value="P2_URGENT">P2 Urgent</option>
                      <option value="P3_HIGH">P3 High</option>
                      <option value="P4_MODERATE">P4 Moderate</option>
                      <option value="P5_DEVELOPMENTAL">P5 Developmental</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#102E36] mb-1">Approved Need Cap (KES)</label>
                    <input
                      type="number"
                      value={approvedKes}
                      onChange={(e) => setApprovedKes(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
                    />
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={assessRationale}
                  onChange={(e) => setAssessRationale(e.target.value)}
                  placeholder="Documented human rationale & transparent criteria..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />

                <div className="flex flex-wrap gap-3">
                  <GlossyButton
                    variant="green"
                    onClick={async () => {
                      setErrorMsg(null);
                      try {
                        await apiFetch(`/api/admin/needs/${activeNeed.id}/assess`, {
                          method: 'POST',
                          body: JSON.stringify({
                            vulnerabilityScore: vulnScore,
                            urgencyScore,
                            dependencyScore: depScore,
                            safeguardingRiskScore: sgScore,
                            empowermentPotentialScore: empScore,
                            humanFinalTier: humanTier,
                            approvedAmountMinor: Math.round(Number(approvedKes || 0) * 100),
                            decision: 'HUMAN_APPROVED',
                            assessmentReasons: ['Verified household evidence', 'Human welfare officer sign-off'],
                            rationale: assessRationale,
                            aiAdvisoryTier,
                          }),
                        });
                        setAssessRationale('');
                        await loadAll();
                        setFeedback('Human priority assessment saved and need approved.');
                      } catch (err: any) {
                        setErrorMsg(err.message);
                      }
                    }}
                  >
                    Approve Need (Human Sign-Off)
                  </GlossyButton>
                  <GlossyButton
                    variant="ivory"
                    onClick={async () => {
                      setErrorMsg(null);
                      try {
                        await apiFetch(`/api/admin/needs/${activeNeed.id}/assess`, {
                          method: 'POST',
                          body: JSON.stringify({
                            vulnerabilityScore: vulnScore,
                            urgencyScore,
                            dependencyScore: depScore,
                            safeguardingRiskScore: sgScore,
                            empowermentPotentialScore: empScore,
                            humanFinalTier: humanTier,
                            approvedAmountMinor: Math.round(Number(approvedKes || 0) * 100),
                            decision: 'CHANGES_REQUESTED',
                            assessmentReasons: ['Supporting bill or verification clarification required'],
                            rationale: assessRationale,
                            aiAdvisoryTier,
                          }),
                        });
                        await loadAll();
                        setFeedback('Clarification requested from beneficiary.');
                      } catch (err: any) {
                        setErrorMsg(err.message);
                      }
                    }}
                  >
                    Request Changes
                  </GlossyButton>
                </div>
              </>
            ) : (
              <div className="text-sm text-[#4A636A]">Select a need request on the left.</div>
            )}
          </div>
        </div>
      )}

      {/* 3. Finance & Safaricom Daraja M-Pesa */}
      {tab === 'finance' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[#287A59]">Double-Entry Financial Control</div>
              <h3 className="text-lg font-bold text-[#102E36]">Monthly Ledger & Safaricom Daraja Settlement</h3>
            </div>
            <ExportReportBar
              title="Humanity Connect Monthly Financial & Audit Report"
              rows={monthlyReport?.journalEntries || []}
              csvFilename="humanity-connect-monthly-ledger.csv"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Verified Received Money</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
                {formatMoney(monthlyReport?.verifiedReceivedMinor ?? 0, 'KES')}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">100% Daraja callback confirmed</div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Unfulfilled Pledges (Excluded)</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#B6721A] mt-1">
                {formatMoney(monthlyReport?.pledgedNotReceivedMinor ?? 0, 'KES')}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Never counted in disbursable cash</div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Double-Entry Journal Rows</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {(monthlyReport?.journalEntries || []).length}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Donor principal isolated from revenue</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="hc-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-lg font-bold text-[#102E36]">Central Fund Disbursement</h3>
              </div>
              <select
                value={disbFundId}
                onChange={(e) => setDisbFundId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                {(adminData?.funds || []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — Avail: {formatMoney(f.availableBalanceMinor, f.currency)}
                  </option>
                ))}
              </select>
              <select
                value={disbBenId}
                onChange={(e) => setDisbBenId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                {(adminData?.verificationCases || []).map((vc: any) => (
                  <option key={vc.beneficiaryId} value={vc.beneficiaryId}>
                    {vc.displayAlias} ({vc.beneficiaryRef})
                  </option>
                ))}
              </select>
              <input
                value={disbTitle}
                onChange={(e) => setDisbTitle(e.target.value)}
                placeholder="Disbursement / School Paybill Reference"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={disbAmountKes}
                  onChange={(e) => setDisbAmountKes(e.target.value)}
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
                />
                <select
                  value={disbChannel}
                  onChange={(e) => setDisbChannel(e.target.value as any)}
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="SCHOOL_PAYBILL">School Paybill</option>
                  <option value="HOSPITAL_EFT">Hospital EFT</option>
                  <option value="VENDOR_VOUCHER">Vendor Food Voucher</option>
                  <option value="MPESA_B2C">M-Pesa B2C (Eligible Only)</option>
                </select>
              </div>
              <GlossyButton
                variant="gold"
                onClick={async () => {
                  setErrorMsg(null);
                  try {
                    await apiFetch('/api/admin/finance/disburse', {
                      method: 'POST',
                      body: JSON.stringify({
                        fundId: disbFundId,
                        beneficiaryId: disbBenId,
                        projectTitle: disbTitle,
                        amountMinor: Math.round(Number(disbAmountKes || 0) * 100),
                        channel: disbChannel,
                      }),
                    });
                    setDisbTitle('');
                    await loadAll();
                    setFeedback('Central fund disbursement settled atomically.');
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                Authorise Verified Disbursement
              </GlossyButton>
            </div>

            <div className="hc-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-lg font-bold text-[#102E36]">Maker-Checker Two-Person Approvals</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={mcType}
                  onChange={(e) => setMcType(e.target.value as any)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="DISBURSEMENT">Disbursement</option>
                  <option value="FUND_ALLOCATION">Fund Allocation</option>
                  <option value="REFUND">Refund</option>
                  <option value="REVERSAL">Reversal</option>
                </select>
                <select
                  value={mcPathway}
                  onChange={(e) => setMcPathway(e.target.value as any)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="CENTRAL_FUND">Central Fund</option>
                  <option value="DIRECT_SPONSORSHIP">Direct Sponsorship</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={mcReason}
                  onChange={(e) => setMcReason(e.target.value)}
                  placeholder="Maker justification (e.g. Duplicate STK refund verification)..."
                  className="flex-1 px-3.5 py-2 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
                <GlossyButton
                  size="sm"
                  variant="teal"
                  onClick={async () => {
                    if (!disbFundId) return;
                    setErrorMsg(null);
                    try {
                      await apiFetch('/api/payments/approvals/request', {
                        method: 'POST',
                        body: JSON.stringify({
                          operationType: mcType,
                          pathway: mcPathway,
                          targetEntityId: disbFundId,
                          amountMinor: Math.round(Number(disbAmountKes || 1000) * 100),
                          reason: mcReason,
                        }),
                      });
                      setMcReason('');
                      await loadAll();
                      setFeedback('Maker request queued for independent Checker officer.');
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    }
                  }}
                >
                  Queue Request
                </GlossyButton>
              </div>

              <div className="divide-y divide-[#102E36]/10 max-h-48 overflow-y-auto">
                {(monthlyReport?.makerCheckerApprovals || []).map((ap: any) => (
                  <div key={ap.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-[#102E36]">
                        {ap.operationType} · {formatMoney(ap.amountMinor)}
                      </div>
                      <div className="text-[#4A636A]">{ap.reason} · Status: {ap.status}</div>
                    </div>
                    {ap.status === 'PENDING_CHECKER' && (
                      <GlossyButton
                        size="sm"
                        variant="green"
                        onClick={async () => {
                          setErrorMsg(null);
                          try {
                            await apiFetch(`/api/payments/approvals/${ap.id}/decide`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'APPROVED' }),
                            });
                            await loadAll();
                          } catch (err: any) {
                            setErrorMsg(err.message);
                          }
                        }}
                      >
                        Checker Approve
                      </GlossyButton>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {darajaGuide && (
            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                Safaricom Daraja Integration & Security Architecture ({darajaGuide.provider})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#4A636A]">
                <div>
                  <div className="font-bold text-[#102E36] mb-1">Backend Endpoints</div>
                  <ul className="space-y-1 font-mono-num">
                    {(darajaGuide.endpoints || []).map((ep: string) => (
                      <li key={ep}>{ep}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-bold text-[#102E36] mb-1">Security Guarantees</div>
                  <ul className="space-y-1 list-disc pl-4">
                    {(darajaGuide.securityGuarantees || []).map((g: string) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Safeguarding & DPIA */}
      {tab === 'safeguarding' && (
        <div className="space-y-6">
          {adminData?.safeguardingRestricted && (
            <div className="hc-card p-6 border-[#9F2D20]/40 bg-[#9F2D20]/5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-[#9F2D20]">
                <Lock className="w-4 h-4" />
                Confidential Safeguarding Cases Restricted (Separation-of-Duties Active)
              </div>
              <p className="text-xs text-[#4A636A]">
                Unrelated HR and non-safeguarding roles cannot view encrypted beneficiary safeguarding investigations or
                child protection incidents. Authorised Safeguarding Officers and Super Admin hold exclusive case-file
                access.
              </p>
            </div>
          )}
          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#9F2D20]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                Restricted Safeguarding Incident Management (Officer Access Only)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={sgCategory}
                onChange={(e) => setSgCategory(e.target.value)}
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="CHILD_PROTECTION">Child Protection Concern</option>
                <option value="GUARDIAN_DISPUTE">Guardian Authority Dispute</option>
                <option value="PII_EXPOSURE">Privacy / Location Exposure Check</option>
                <option value="FINANCIAL_COERCION">Beneficiary Coercion / Fraud</option>
              </select>
              <select
                value={sgSeverity}
                onChange={(e) => setSgSeverity(e.target.value)}
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="CRITICAL">Critical (Immediate Escalation)</option>
                <option value="HIGH">High Risk</option>
                <option value="MEDIUM">Medium Risk</option>
              </select>
            </div>
            <textarea
              rows={2}
              value={sgSummary}
              onChange={(e) => setSgSummary(e.target.value)}
              placeholder="Encrypted incident report summary (stored encrypted in restricted officer partition)..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              variant="teal"
              onClick={async () => {
                setErrorMsg(null);
                try {
                  await apiFetch('/api/admin/safeguarding', {
                    method: 'POST',
                    body: JSON.stringify({
                      category: sgCategory,
                      severity: sgSeverity,
                      summary: sgSummary,
                    }),
                  });
                  setSgSummary('');
                  await loadAll();
                  setFeedback('Encrypted safeguarding incident logged in restricted officer queue.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Log Restricted Safeguarding Incident
            </GlossyButton>

            <div className="divide-y divide-[#102E36]/10 pt-2">
              {(adminData?.safeguardingIncidents || []).map((inc: any) => (
                <div key={inc.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-[#102E36]">
                      {inc.severity} · {inc.category} ({inc.status})
                    </div>
                    <div className="text-[#4A636A]">{inc.summary}</div>
                  </div>
                  {inc.status !== 'RESOLVED' && (
                    <GlossyButton
                      size="sm"
                      variant="green"
                      onClick={async () => {
                        await apiFetch('/api/admin/safeguarding', {
                          method: 'POST',
                          body: JSON.stringify({
                            incidentId: inc.id,
                            status: 'RESOLVED',
                            resolutionNotes: 'Safeguarding officer follow-up complete.',
                          }),
                        });
                        await loadAll();
                      }}
                    >
                      Mark Resolved
                    </GlossyButton>
                  )}
                </div>
              ))}
            </div>
          </div>

          {dpiaData && (
            <div className="space-y-6">
              <div className="hc-card p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#287A59]" />
                    <h3 className="text-base font-bold text-[#102E36]">
                      Database-Backed DPIA Retention Policies ({dpiaData.complianceFramework})
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-[#287A59]">
                    Persisted in Cloud SQL · Zero Browser Cache Allowed
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {(dpiaData.retentionPolicies || []).map((rp: any) => {
                    const canEditRetention = Boolean(
                      user &&
                        (user.roles.includes('SUPER_ADMIN') ||
                          user.roles.includes('SAFEGUARDING_OFFICER') ||
                          user.roles.includes('DATA_MANAGEMENT_OFFICER'))
                    );
                    const draftVal = retentionYearsDraft[rp.id] ?? String(rp.retentionYears ?? 0);
                    return (
                      <div key={rp.id || rp.dataClass} className="p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-[#102E36]">{rp.dataClass}</div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              rp.statutoryLock
                                ? 'bg-[#9F2D20]/10 text-[#9F2D20]'
                                : 'bg-[#287A59]/10 text-[#287A59]'
                            }`}
                          >
                            {rp.statutoryLock ? 'STATUTORY LOCKED' : 'CONFIGURABLE DB POLICY'}
                          </span>
                        </div>
                        <div className="font-mono-num text-[#287A59] font-semibold">
                          Current Retention: {rp.retentionYears} Years (Min: {rp.minimumRetentionYears ?? 0} yrs)
                        </div>
                        <div className="text-[#4A636A]">Storage: {rp.storage}</div>
                        <div className="text-[#4A636A]">Disposal: {rp.disposal}</div>
                        <div className="text-[11px] font-semibold text-[#102E36]">
                          Cross-Browser Cache Restriction:{' '}
                          <span className="text-[#287A59]">
                            {rp.restrictCrossBrowserCache ? 'Enforced (PostgreSQL Only)' : 'Restricted'}
                          </span>
                        </div>
                        {canEditRetention && rp.id && (
                          <div className="pt-2 border-t border-[#102E36]/10 flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={rp.minimumRetentionYears ?? 0}
                              max={100}
                              value={draftVal}
                              onChange={(e) =>
                                setRetentionYearsDraft((prev) => ({
                                  ...prev,
                                  [rp.id]: e.target.value,
                                }))
                              }
                              className="w-24 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15 font-mono-num"
                            />
                            <GlossyButton
                              size="sm"
                              variant="teal"
                              disabled={retentionBusyId === rp.id}
                              onClick={async () => {
                                setErrorMsg(null);
                                setFeedback(null);
                                setRetentionBusyId(rp.id);
                                try {
                                  await apiFetch(`/api/operations/safeguarding/retention-policies/${rp.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                      retentionYears: Number(draftVal),
                                      restrictCrossBrowserCache: true,
                                    }),
                                  });
                                  await loadAll();
                                  setFeedback(
                                    `Saved "${rp.dataClass}" retention (${draftVal} yrs) to PostgreSQL across all browsers.`
                                  );
                                } catch (err: any) {
                                  setErrorMsg(err.message);
                                } finally {
                                  setRetentionBusyId(null);
                                }
                              }}
                            >
                              {retentionBusyId === rp.id ? 'Saving...' : 'Save to DB'}
                            </GlossyButton>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {(dpiaData.platformSettings || []).length > 0 && (
                <div className="hc-card p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-[#287A59]" />
                      <h3 className="text-base font-bold text-[#102E36]">
                        Restricted Cross-Browser Settings &amp; Sample Catalog Retention (PostgreSQL Only)
                      </h3>
                    </div>
                    <span className="text-[11px] font-semibold text-[#9F2D20]">
                      Zero localStorage / sessionStorage / IndexedDB
                    </span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                    {(dpiaData.platformSettings || []).map((st: any) => (
                      <div key={st.settingKey} className="p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-2">
                        <div className="font-bold text-[#102E36]">{st.label}</div>
                        <div className="text-[#4A636A]">{st.description}</div>
                        <div className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#102E36]/10 font-mono-num text-[11px] text-[#102E36] space-y-1">
                          {Object.entries(st.valueJson || {}).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <span className="text-[#4A636A]">{k}:</span>
                              <span className="font-semibold text-[#287A59]">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                        {st.settingKey === 'STRICT_DB_ONLY_CROSS_BROWSER_RETENTION' &&
                          (user?.roles.includes('SUPER_ADMIN') || user?.roles.includes('DATA_MANAGEMENT_OFFICER')) && (
                            <div className="pt-2 border-t border-[#102E36]/10 flex flex-wrap items-center gap-2">
                              <label className="font-semibold text-[#102E36]">DB Session TTL (Hours):</label>
                              <input
                                type="number"
                                min={1}
                                max={168}
                                value={sessionTtlDraft}
                                onChange={(e) => setSessionTtlDraft(e.target.value)}
                                className="w-20 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15 font-mono-num"
                              />
                              <GlossyButton
                                size="sm"
                                variant="gold"
                                disabled={settingsBusy}
                                onClick={async () => {
                                  setErrorMsg(null);
                                  setFeedback(null);
                                  setSettingsBusy(true);
                                  try {
                                    await apiFetch(`/api/operations/settings/${st.settingKey}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({
                                        valueJson: {
                                          sessionTtlHours: Number(sessionTtlDraft),
                                        },
                                      }),
                                    });
                                    await loadAll();
                                    setFeedback('Cross-browser PostgreSQL session setting saved and active everywhere.');
                                  } catch (err: any) {
                                    setErrorMsg(err.message);
                                  } finally {
                                    setSettingsBusy(false);
                                  }
                                }}
                              >
                                {settingsBusy ? 'Updating...' : 'Update Restricted Setting'}
                              </GlossyButton>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Empowerment & Community Projects */}
      {tab === 'empowerment' && (
        <div className="space-y-6">
          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                HUMANITY CONNECT Empowerment Centre (12 Modules)
              </h3>
            </div>
            <p className="text-xs text-[#287A59] font-semibold">
              {empowerment?.safeguardPolicy}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {(empowerment?.modules || []).map((m: any) => (
                <div key={m.code} className="p-3.5 rounded-xl bg-white border border-[#102E36]/10">
                  <div className="font-bold text-[#102E36]">{m.name}</div>
                  <div className="text-[#4A636A] mt-0.5">
                    {m.countyFocus} · {m.durationWeeks} weeks
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="hc-card p-6 space-y-4">
              <h3 className="text-base font-bold text-[#102E36]">
                Register Training Institution or Employer Partner
              </h3>
              <input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Institution / Employer Name (e.g. Nakuru TVET Polytechnic)"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value as any)}
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="TRAINING_INSTITUTION">Training Institution</option>
                  <option value="EMPLOYER">Employer Partner</option>
                </select>
                <input
                  value={partnerCounty}
                  onChange={(e) => setPartnerCounty(e.target.value)}
                  className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="admissions@partner.ac.ke"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton
                variant="teal"
                onClick={async () => {
                  setErrorMsg(null);
                  try {
                    await apiFetch('/api/operations/empowerment/partner', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: partnerName,
                        orgType: partnerType,
                        county: partnerCounty,
                        contactEmail: partnerEmail,
                      }),
                    });
                    setPartnerName('');
                    setPartnerEmail('');
                    await loadAll();
                    setFeedback('Training / Employer partner registered.');
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                Register Partner Institution
              </GlossyButton>
            </div>

            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                Active Community Projects ({(projectsData?.projects || []).length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(projectsData?.projects || []).map((p: any) => (
                  <div key={p.id} className="p-3 rounded-xl bg-white border border-[#102E36]/10 text-xs">
                    <div className="font-bold text-[#102E36]">{p.title}</div>
                    <div className="text-[#4A636A]">
                      {p.county} County · {p.beneficiariesImpacted} households · Target{' '}
                      {formatMoney(p.targetAmountMinor, p.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Mobile-First Field Operations Portal with Encrypted Offline Vault */}
      {tab === 'field-ops' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 hc-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-lg font-bold text-[#102E36]">
                  Field Operations Capture (Cloud SQL Encrypted Database Vault)
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#287A59] flex items-center gap-1">
                {isOnline ? <CheckCircle2 className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 text-[#B6721A]" />}
                {isOnline ? 'PostgreSQL Live' : 'Offline Mode'}
              </span>
            </div>
            <p className="text-xs text-[#4A636A]">
              Designed for National, County, Sub-County Coordinators, Ward Ambassadors, and Volunteers.
              Records are encrypted with server-side AES-256-GCM and stored strictly in PostgreSQL so drafts
              remain accessible across all browsers and devices.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={fieldRecordType}
                onChange={(e) => setFieldRecordType(e.target.value as any)}
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="FIELD_VISIT">Field Verification Visit</option>
                <option value="BENEFICIARY_INTAKE">Household Intake Note</option>
                <option value="CONSENT_CAPTURE">Signed Consent Capture</option>
                <option value="EMERGENCY_REPORT">Emergency Rapid Assessment</option>
              </select>
              <input
                value={fieldCounty}
                onChange={(e) => setFieldCounty(e.target.value)}
                placeholder="County / Ward"
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <textarea
              rows={3}
              value={fieldSummary}
              onChange={(e) => setFieldSummary(e.target.value)}
              placeholder="Field observations, consent verification & verification recommendation (never publish exact GPS publicly)..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              variant="teal"
              onClick={async () => {
                if (!fieldSummary.trim()) return;
                setErrorMsg(null);
                try {
                  await saveEncryptedOfflineRecord(
                    {
                      localId: `fld-${Date.now()}`,
                      recordType: fieldRecordType,
                      county: fieldCounty,
                      capturedAt: new Date().toISOString(),
                      payload: { summary: fieldSummary, caseId: selectedCaseId || null },
                    },
                    token
                  );
                  setFieldSummary('');
                  await loadOffline();
                  setFeedback('Field record encrypted and saved permanently to Cloud SQL PostgreSQL.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Save to Encrypted Database Vault
            </GlossyButton>
          </div>

          <div className="lg:col-span-6 hc-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#102E36]">
                Pending Encrypted Field Queue ({offlineRecords.length})
              </h3>
              <GlossyButton
                size="sm"
                variant="green"
                disabled={offlineRecords.length === 0 || !selectedCaseId}
                onClick={async () => {
                  setErrorMsg(null);
                  try {
                    for (const rec of offlineRecords) {
                      await apiFetch(`/api/admin/verification/${selectedCaseId}/action`, {
                        method: 'POST',
                        body: JSON.stringify({
                          officerWorkspace: 'FIELD_OFFICER',
                          actionType: 'FIELD_VISIT',
                          reason: `[Synced ${rec.recordType} - ${rec.county}] ${String(rec.payload.summary || '')}`,
                          fieldVisitVerified: true,
                          fieldVisitNotes: String(rec.payload.summary || ''),
                        }),
                      });
                      await markOfflineRecordSynced(rec.localId, token);
                    }
                    await loadOffline();
                    await loadAll();
                    setFeedback('All encrypted field records synced into case verification logs in PostgreSQL.');
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync to Verification Case
              </GlossyButton>
            </div>
            {offlineRecords.length === 0 ? (
              <div className="text-xs text-[#4A636A] py-6 text-center">
                No pending encrypted field drafts in PostgreSQL.
              </div>
            ) : (
              <div className="space-y-2.5">
                {offlineRecords.map((rec) => (
                  <div key={rec.localId} className="p-3 rounded-xl bg-white border border-[#102E36]/15 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-[#102E36]">
                        {rec.recordType} · {rec.county}
                      </div>
                      <div className="text-[#4A636A] mt-0.5">{String(rec.payload.summary || '')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await securelyWipeOfflineRecord(rec.localId, token);
                          await loadOffline();
                        } catch (err: any) {
                          setErrorMsg(err.message);
                        }
                      }}
                      className="text-[#9F2D20] p-1"
                      aria-label="Delete database draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2b. Dynamic Sponsorship Matching Engine Governance */}
      {tab === 'matching' && <AdminMatchingGovernancePanel />}

      {/* 6b. Integrated Staff, Organisational, Recruitment, 47-County & HR Reporting Centre */}
      {tab === 'staff-centre' && <StaffManagementCentre mode="admin" />}

      {/* 7. RBAC, Sub-Admin Permissions Preview, Communication Templates & Audit Logs */}
      {tab === 'governance' && (
        <div className="space-y-6">
          {user?.roles.includes('SUPER_ADMIN') && (
            <div className="hc-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#287A59]" />
                  <h3 className="text-lg font-bold text-[#102E36]">
                    Localhost PostgreSQL Database Backup (.sql Dump)
                  </h3>
                </div>
                <p className="text-xs text-[#4A636A]">
                  Exports the full 50-table PostgreSQL DDL schema, foreign keys, indexes, and live data
                  into a downloadable <code>.sql</code> file for localhost restore via{' '}
                  <code>psql -v ON_ERROR_STOP=1 -d humanity_connect -f humanity-connect-postgres-YYYY-MM-DD.sql</code>.
                  If an older dump failed on a JSON column, download a new dump after updating the server.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <GlossyButton variant="green" onClick={() => setTab('accounts')}>
                  <Users className="w-4 h-4" />
                  Registered Accounts ({usersDirectory?.totalCount ?? adminData?.users?.length ?? 0})
                </GlossyButton>
                <GlossyButton variant="teal" onClick={() => setCreateSubAdminOpen((v) => !v)}>
                  <UserPlus className="w-4 h-4" />
                  {createSubAdminOpen ? 'Hide Sub-Admin Form' : 'Create Sub-Admin'}
                </GlossyButton>
                <GlossyButton variant="gold" disabled={exportingDump} onClick={downloadPgDump}>
                  <Download className="w-4 h-4" />
                  {exportingDump ? 'Generating Dump...' : 'Download .sql Dump'}
                </GlossyButton>
              </div>
            </div>
          )}

          {/* Create Sub-Admin Account Card (Super Admin Only) */}
          {user?.roles.includes('SUPER_ADMIN') && createSubAdminOpen && (
            <form
              className="hc-card p-6 space-y-4 text-xs"
              onSubmit={async (e) => {
                e.preventDefault();
                setPermBusy(true);
                setErrorMsg(null);
                try {
                  await apiFetch('/api/admin/subadmins', {
                    method: 'POST',
                    body: JSON.stringify({
                      fullName: saFullName,
                      email: saEmail,
                      password: saPassword,
                      roleCode: saRoleCode,
                      permissionFlags: saFlags,
                      additionalAuthorizationReason: saReason || undefined,
                    }),
                  });
                  setSaFullName('');
                  setSaEmail('');
                  setSaPassword('');
                  setSaReason('');
                  setCreateSubAdminOpen(false);
                  await loadAll();
                  setFeedback(`Sub-Admin account created with ${saRoleCode} and least-privilege flags.`);
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setPermBusy(false);
                }
              }}
            >
              <div className="flex items-center gap-2 font-bold text-base text-[#102E36]">
                <UserPlus className="w-5 h-5 text-[#287A59]" />
                Create Authorised Sub-Admin Account (MFA Enforced)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  value={saFullName}
                  onChange={(e) => setSaFullName(e.target.value)}
                  placeholder="Officer Full Name"
                  className="px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  type="email"
                  required
                  value={saEmail}
                  onChange={(e) => setSaEmail(e.target.value)}
                  placeholder="officer@humanityconnect.org"
                  className="px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  type="password"
                  required
                  minLength={10}
                  value={saPassword}
                  onChange={(e) => setSaPassword(e.target.value)}
                  placeholder="Temporary Strong Password (10+ chars)"
                  className="px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
                />
                <select
                  value={saRoleCode}
                  onChange={(e) => setSaRoleCode(e.target.value as RoleCode)}
                  className="px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
                >
                  {SUB_ADMIN_ROLE_CODES.map((rc) => (
                    <option key={rc} value={rc}>
                      {ROLE_DEFINITIONS[rc]?.label || rc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {SUB_ADMIN_PERMISSION_FLAGS.map((flag) => {
                  const checked = saFlags.includes(flag.code);
                  return (
                    <label
                      key={flag.code}
                      className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                        checked ? 'bg-[#287A59]/10 border-[#287A59]/40' : 'bg-white border-[#102E36]/12'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSaFlags((prev) =>
                            prev.includes(flag.code) ? prev.filter((f) => f !== flag.code) : [...prev, flag.code]
                          )
                        }
                      />
                      <div>
                        <div className="font-semibold text-[#102E36]">{flag.category}</div>
                        <div className="text-[11px] text-[#4A636A]">{flag.code}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <input
                value={saReason}
                onChange={(e) => setSaReason(e.target.value)}
                placeholder="Additional authorisation justification (min 10 chars for Finance, HR, Safeguarding, Auditor)..."
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton type="submit" size="sm" variant="teal" disabled={permBusy}>
                Provision Sub-Admin Account
              </GlossyButton>
            </form>
          )}

          <div className="hc-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-lg font-bold text-[#102E36]">
                  User Governance & Least-Privilege Permission Mapping
                </h3>
              </div>
              <div className="flex gap-1.5 text-xs">
                {[
                  { id: 'ALL', label: 'All Accounts' },
                  { id: 'SUB_ADMINS', label: 'Sub-Admins & Officers' },
                  { id: 'NON_ADMIN', label: 'Members & Supporters' },
                ].map((flt) => (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => setUserFilter(flt.id as any)}
                    className={`px-3 py-1.5 rounded-lg font-semibold ${
                      userFilter === flt.id
                        ? 'bg-[#102E36] text-[#FAF9F6]'
                        : 'bg-white border border-[#102E36]/15 text-[#102E36]'
                    }`}
                  >
                    {flt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                  <tr>
                    <th className="py-2 pr-4">User & Contact</th>
                    <th className="py-2 pr-4">County / Sub-County</th>
                    <th className="py-2 pr-4">Assigned Roles & Granular Flags</th>
                    <th className="py-2 pr-4">MFA</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102E36]/10">
                  {(adminData?.users || [])
                    .filter((u: any) => {
                      const hasAdminRole = (u.roles || []).some(
                        (r: string) => r === 'SUPER_ADMIN' || SUB_ADMIN_ROLE_CODES.includes(r as RoleCode)
                      );
                      if (userFilter === 'SUB_ADMINS') return hasAdminRole;
                      if (userFilter === 'NON_ADMIN') return !hasAdminRole;
                      return true;
                    })
                    .map((u: any) => (
                      <tr key={u.id}>
                        <td className="py-3 pr-4">
                          <div className="font-bold text-[#102E36]">{u.fullName}</div>
                          <div className="text-[#4A636A]">{u.email}</div>
                          {u.phoneE164 && (
                            <div className="font-mono-num text-[11px] text-[#287A59]">{u.phoneE164}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-[#102E36]">{u.county || '—'}</div>
                          <div className="text-[11px] text-[#4A636A]">{u.subCounty || '—'}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-mono-num font-semibold text-[#102E36]">
                            {(u.roles || []).join(', ')}
                          </div>
                          {(u.permissions || []).length > 0 && (
                            <div className="text-[11px] font-mono-num text-[#287A59] mt-0.5">
                              Flags: {(u.permissions || []).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4">{u.mfaEnabled ? 'Enabled' : 'Off'}</td>
                        <td className="py-3 pr-4 font-semibold text-[#287A59]">{u.approvalStatus}</td>
                        <td className="py-3 flex flex-wrap gap-1.5">
                          {user?.roles.includes('SUPER_ADMIN') && (
                            <GlossyButton
                              size="sm"
                              variant="gold"
                              onClick={async () => {
                                const firstSubRole =
                                  (u.roles || []).find((r: string) =>
                                    SUB_ADMIN_ROLE_CODES.includes(r as RoleCode)
                                  ) || 'VERIFICATION_OFFICER';
                                const initFlags = u.permissions || [];
                                setPermModalUser(u);
                                setPermTargetRole(firstSubRole as RoleCode);
                                setPermFlags(initFlags);
                                setPermAuthReason('');
                                try {
                                  const res = await apiFetch<{ preview: any }>('/api/admin/permissions/preview', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      targetRoleCode: firstSubRole,
                                      permissionFlags: initFlags,
                                    }),
                                  });
                                  setPermPreview(res.preview);
                                } catch {
                                  setPermPreview(null);
                                }
                              }}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              Map & Preview Permissions
                            </GlossyButton>
                          )}
                          <GlossyButton
                            size="sm"
                            variant="teal"
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}/manage`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  approvalStatus: u.approvalStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                                }),
                              });
                              await loadAll();
                            }}
                          >
                            {u.approvalStatus === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </GlossyButton>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 12-Verb Least-Privilege Role Matrix & Access Audit Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                12-Verb Separation-of-Duties Role Matrix
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {Object.entries(adminData?.rolePermissionMatrix || {}).map(
                  ([roleCode, rawEntry]: [string, any]) => {
                    const verbs = Array.isArray(rawEntry)
                      ? rawEntry
                      : Array.from(
                          new Set(
                            (Array.isArray(rawEntry?.allowedModules) ? rawEntry.allowedModules : []).flatMap(
                              (m: any) => (Array.isArray(m?.actions) ? m.actions : [])
                            )
                          )
                        );
                    const roleLabel =
                      !Array.isArray(rawEntry) && rawEntry?.roleLabel
                        ? `${rawEntry.roleLabel} (${roleCode})`
                        : roleCode;
                    const isCritical = Boolean(!Array.isArray(rawEntry) && rawEntry?.isCriticalRole);
                    const boundary =
                      !Array.isArray(rawEntry) && Array.isArray(rawEntry?.deniedBoundaries)
                        ? rawEntry.deniedBoundaries[0]
                        : null;

                    return (
                      <div key={roleCode} className="p-3 rounded-xl bg-white border border-[#102E36]/12 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-num font-bold text-[#102E36]">{roleLabel}</span>
                          {isCritical && (
                            <span className="text-[11px] font-semibold text-[#9F2D20]">
                              Critical Dual-Approval
                            </span>
                          )}
                        </div>
                        <div className="text-[#287A59] font-medium">
                          {verbs.length > 0 ? verbs.join(' · ') : 'View only'}
                        </div>
                        {boundary && (
                          <div className="text-[11px] text-[#4A636A]">{boundary}</div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                Sensitive Access & Permission Change Audit Log ({(adminData?.accessAuditLogs || []).length})
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {(adminData?.accessAuditLogs || []).length === 0 ? (
                  <div className="text-[#4A636A]">No permission reassignment audit logs recorded yet.</div>
                ) : (
                  (adminData?.accessAuditLogs || []).map((log: any) => (
                    <div key={log.id} className="p-2.5 rounded-xl bg-white border border-[#102E36]/10 space-y-0.5">
                      <div className="flex justify-between gap-2">
                        <strong className="text-[#102E36]">{log.action}</strong>
                        <span className="font-mono-num text-[#4A636A]">
                          {new Date(log.createdAt).toLocaleString('en-KE')}
                        </span>
                      </div>
                      <div className="text-[#4A636A] truncate">{JSON.stringify(log.details || {})}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                Communication Centre Templates (13 Regulated Templates)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
                {(commCentre?.templates || []).map((tpl: any) => (
                  <div key={tpl.code} className="p-2.5 rounded-xl bg-white border border-[#102E36]/10 flex justify-between">
                    <span className="font-semibold text-[#102E36]">{tpl.title}</span>
                    <span className="font-mono-num text-[#287A59]">{tpl.channel}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hc-card p-6 space-y-3">
              <h3 className="text-base font-bold text-[#102E36]">
                Immutable Security & Financial Audit Log (Append-Only)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
                {(adminData?.auditLogs || []).map((log: any) => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-white border border-[#102E36]/10 flex justify-between gap-2">
                    <span>
                      <strong className="text-[#102E36]">{log.action}</strong> · {log.actorRole}
                    </span>
                    <span className="font-mono-num text-[#4A636A]">
                      {new Date(log.createdAt).toLocaleString('en-KE')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TalkSasa SMS Gateway & Cloud SQL Delivery Tracker */}
          {talksasaData && (
            <div className="hc-card p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#287A59]" />
                    <h3 className="text-base font-bold text-[#102E36]">
                      TalkSasa SMS Gateway &amp; Cloud SQL Delivery Ledger
                    </h3>
                  </div>
                  <p className="text-xs text-[#4A636A] mt-0.5">
                    Kenyan MSISDN normalisation (2547 / 2541), idempotent OTP persistence, redacted message audit logs, and carrier DLR webhook tracking stored in PostgreSQL across all browsers.
                  </p>
                </div>
                <div className="text-xs font-mono-num">
                  <span className="font-semibold text-[#102E36]">
                    Sender ID: {talksasaData.gateway?.senderId || 'HUMANITY'}
                  </span>{' '}
                  ·{' '}
                  <span
                    className={`font-bold ${
                      talksasaData.gateway?.configured ? 'text-[#287A59]' : 'text-[#B6721A]'
                    }`}
                  >
                    {talksasaData.gateway?.configured
                      ? 'Live TalkSasa API Connected'
                      : 'Sandbox Persistence Mode (Set TALKSASA_API_TOKEN)'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {[
                  { label: 'Total SMS Logged', val: talksasaData.counts?.total ?? 0, tone: 'text-[#102E36]' },
                  { label: 'Delivered (DLR)', val: talksasaData.counts?.delivered ?? 0, tone: 'text-[#287A59]' },
                  { label: 'Sent to Carrier', val: talksasaData.counts?.sent ?? 0, tone: 'text-[#102E36]' },
                  { label: 'Failed / Rejected', val: talksasaData.counts?.failed ?? 0, tone: 'text-[#9F2D20]' },
                  { label: 'Sandbox Queued', val: talksasaData.counts?.sandboxQueued ?? 0, tone: 'text-[#B6721A]' },
                ].map((k) => (
                  <div key={k.label} className="p-3 rounded-xl bg-white border border-[#102E36]/12">
                    <div className="text-[11px] text-[#4A636A]">{k.label}</div>
                    <div className={`text-lg font-extrabold font-mono-num mt-0.5 ${k.tone}`}>{k.val}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <form
                  className="lg:col-span-5 p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-3 text-xs"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSmsBusy(true);
                    setErrorMsg(null);
                    setFeedback(null);
                    try {
                      const res = await apiFetch<{ result: any }>('/api/communications/talksasa/send', {
                        method: 'POST',
                        body: JSON.stringify({
                          recipientPhone: smsPhone,
                          templateCode: smsTemplate,
                          message: smsMessage,
                        }),
                      });
                      setSmsMessage('');
                      await loadAll();
                      setFeedback(
                        `TalkSasa SMS ${res.result.dispatchRef} recorded (${res.result.deliveryStatus}) for ${res.result.recipientMasked}.`
                      );
                    } catch (err: any) {
                      setErrorMsg(err.message);
                    } finally {
                      setSmsBusy(false);
                    }
                  }}
                >
                  <div className="font-bold text-sm text-[#102E36]">Send Operational TalkSasa SMS</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1">Kenyan Phone (07/01/+254)</label>
                      <input
                        required
                        value={smsPhone}
                        onChange={(e) => setSmsPhone(e.target.value)}
                        placeholder="+254712345678"
                        className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] border border-[#102E36]/15"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Template Category</label>
                      <select
                        value={smsTemplate}
                        onChange={(e) => setSmsTemplate(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] border border-[#102E36]/15"
                      >
                        <option value="GENERAL">General Notice</option>
                        <option value="VERIFICATION">Verification Update</option>
                        <option value="PAYMENT">M-Pesa Confirmation</option>
                        <option value="ONBOARDING">Staff Onboarding</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">SMS Message (PII-Screened)</label>
                    <textarea
                      required
                      rows={2}
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      placeholder="Concise operational SMS update (never include confidential safeguarding or minor PII)..."
                      className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] border border-[#102E36]/15"
                    />
                  </div>
                  <GlossyButton type="submit" size="sm" variant="teal" disabled={smsBusy}>
                    <Send className="w-3.5 h-3.5" />
                    {smsBusy ? 'Dispatching...' : 'Dispatch & Log in PostgreSQL'}
                  </GlossyButton>
                </form>

                <div className="lg:col-span-7 space-y-2 max-h-64 overflow-y-auto text-xs">
                  {(talksasaData.logs || []).length === 0 ? (
                    <div className="p-6 rounded-xl bg-white border border-[#102E36]/12 text-center text-[#4A636A]">
                      No TalkSasa SMS dispatches logged in PostgreSQL yet.
                    </div>
                  ) : (
                    (talksasaData.logs || []).map((log: any) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5 flex-1 min-w-[220px]">
                          <div className="flex flex-wrap items-center gap-2 font-mono-num">
                            <strong className="text-[#102E36]">{log.dispatchRef}</strong>
                            <span>·</span>
                            <span className="text-[#4A636A]">{log.recipientMasked}</span>
                            <span>·</span>
                            <span
                              className={`font-bold ${
                                log.deliveryStatus === 'DELIVERED' || log.deliveryStatus === 'SENT'
                                  ? 'text-[#287A59]'
                                  : log.deliveryStatus === 'FAILED' || log.deliveryStatus === 'REJECTED'
                                    ? 'text-[#9F2D20]'
                                    : 'text-[#B6721A]'
                              }`}
                            >
                              {log.deliveryStatus}
                            </span>
                          </div>
                          <div className="text-[#4A636A]">{log.messagePreview}</div>
                          {log.errorReason && (
                            <div className="text-[11px] text-[#9F2D20]">Error: {log.errorReason}</div>
                          )}
                        </div>
                        {(log.deliveryStatus === 'FAILED' || log.deliveryStatus === 'SANDBOX_QUEUED') &&
                          log.templateCode !== 'OTP' && (
                            <GlossyButton
                              size="sm"
                              variant="ivory"
                              onClick={async () => {
                                setErrorMsg(null);
                                try {
                                  const res = await apiFetch<{ result: any }>(
                                    `/api/communications/talksasa/retry/${log.id}`,
                                    { method: 'POST' }
                                  );
                                  await loadAll();
                                  setFeedback(
                                    `Retried ${res.result.dispatchRef}: status ${res.result.deliveryStatus}.`
                                  );
                                } catch (err: any) {
                                  setErrorMsg(err.message);
                                }
                              }}
                            >
                              Retry
                            </GlossyButton>
                          )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Super Admin Only: Registered User Accounts Directory (Name, Contact, County & Sub-County) */}
      {tab === 'accounts' && user?.roles.includes('SUPER_ADMIN') && (() => {
        const allUsers = usersDirectory?.users || [];
        const distinctCounties = Array.from(
          new Set(allUsers.map((u) => (u.county || '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        const distinctRoles = Array.from(
          new Set(allUsers.flatMap((u) => u.roles || []).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));

        const queryLower = dirSearch.trim().toLowerCase();
        const filteredUsers = allUsers.filter((u) => {
          if (dirCountyFilter !== 'ALL') {
            if (dirCountyFilter === '__UNSPECIFIED__') {
              if (u.county && u.county.trim() !== '') return false;
            } else if ((u.county || '').trim() !== dirCountyFilter) {
              return false;
            }
          }
          if (dirRoleFilter !== 'ALL' && !(u.roles || []).includes(dirRoleFilter)) {
            return false;
          }
          if (!queryLower) return true;
          const haystack = [
            u.fullName,
            u.email,
            u.phoneE164 || '',
            u.county || '',
            u.subCounty || '',
            u.ward || '',
            u.beneficiaryRef || '',
            ...(u.roles || []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(queryLower);
        });

        const exportRows = filteredUsers.map((u, idx) => ({
          No: idx + 1,
          Name: u.fullName,
          Phone: u.phoneE164 || '',
          Email: u.email,
          County: u.county || '',
          SubCounty: u.subCounty || '',
          Ward: u.ward || '',
          Roles: (u.roles || []).join('; '),
          Status: u.approvalStatus,
          EmailVerified: u.emailVerified ? 'Yes' : 'No',
          PhoneVerified: u.phoneVerified ? 'Yes' : 'No',
          RegisteredAt: new Date(u.createdAt).toLocaleString('en-KE'),
        }));

        const phoneCount = allUsers.filter((u) => Boolean(u.phoneE164)).length;
        const activeCount = allUsers.filter((u) => u.approvalStatus === 'ACTIVE').length;

        return (
          <div className="space-y-6">
            <div className="hc-card p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#287A59]">
                    <ShieldCheck className="w-4 h-4" />
                    Super Admin Exclusively Authorised Directory
                  </div>
                  <h3 className="text-xl font-extrabold text-[#102E36]">
                    All Registered User Accounts — Name, Contact, County &amp; Sub-County
                  </h3>
                  <p className="text-xs text-[#4A636A]">
                    Live PostgreSQL registry of every individual, beneficiary, guardian, supporter, well-wisher,
                    and officer account created on the platform across all browsers.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GlossyButton
                    size="sm"
                    variant="ivory"
                    disabled={dirRefreshing}
                    onClick={async () => {
                      setDirRefreshing(true);
                      setErrorMsg(null);
                      try {
                        const fresh = await apiFetch<any>('/api/admin/users-directory');
                        setUsersDirectory(fresh);
                        setFeedback(`Refreshed directory: ${fresh.totalCount} registered accounts loaded from PostgreSQL.`);
                      } catch (err: any) {
                        setErrorMsg(err.message || 'Unable to refresh registered accounts directory.');
                      } finally {
                        setDirRefreshing(false);
                      }
                    }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${dirRefreshing ? 'animate-spin' : ''}`} />
                    {dirRefreshing ? 'Refreshing...' : 'Refresh Directory'}
                  </GlossyButton>
                  <GlossyButton size="sm" variant="teal" onClick={() => setTab('governance')}>
                    Open RBAC &amp; Governance
                  </GlossyButton>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Registered Accounts', val: allUsers.length, tone: 'text-[#102E36]' },
                  { label: 'With Phone Contact', val: phoneCount, tone: 'text-[#287A59]' },
                  { label: 'Counties Represented', val: distinctCounties.length, tone: 'text-[#102E36]' },
                  { label: 'Active Accounts', val: activeCount, tone: 'text-[#287A59]' },
                ].map((kpi) => (
                  <div key={kpi.label} className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
                    <div className="text-[11px] text-[#4A636A]">{kpi.label}</div>
                    <div className={`text-2xl font-extrabold font-mono-num mt-0.5 ${kpi.tone}`}>
                      {kpi.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hc-card p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
                <div className="md:col-span-5">
                  <label className="block font-semibold text-[#102E36] mb-1">
                    Search Name, Contact, County, or Sub-County
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#4A636A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={dirSearch}
                      onChange={(e) => setDirSearch(e.target.value)}
                      placeholder="e.g. Jane, +2547, Nairobi, Westlands..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15 text-sm"
                    />
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="block font-semibold text-[#102E36] mb-1">Filter by County</label>
                  <select
                    value={dirCountyFilter}
                    onChange={(e) => setDirCountyFilter(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15 text-sm"
                  >
                    <option value="ALL">All Counties ({allUsers.length})</option>
                    {distinctCounties.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__UNSPECIFIED__">County Not Specified</option>
                  </select>
                </div>
                <div className="md:col-span-4">
                  <label className="block font-semibold text-[#102E36] mb-1">Filter by Account Role</label>
                  <select
                    value={dirRoleFilter}
                    onChange={(e) => setDirRoleFilter(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#102E36]/15 text-sm"
                  >
                    <option value="ALL">All Account Categories</option>
                    {distinctRoles.map((rc) => (
                      <option key={rc} value={rc}>
                        {ROLE_DEFINITIONS[rc as RoleCode]?.label || rc} ({rc})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs text-[#4A636A]">
                  Showing <strong className="text-[#102E36] font-mono-num">{filteredUsers.length}</strong> of{' '}
                  <strong className="text-[#102E36] font-mono-num">{allUsers.length}</strong> registered accounts
                  {(dirSearch || dirCountyFilter !== 'ALL' || dirRoleFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setDirSearch('');
                        setDirCountyFilter('ALL');
                        setDirRoleFilter('ALL');
                      }}
                      className="ml-3 text-[#287A59] font-semibold underline"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
                <ExportReportBar
                  title="Humanity Connect Registered User Accounts Directory"
                  rows={exportRows}
                  csvFilename={`humanity-connect-registered-users-${new Date().toISOString().slice(0, 10)}.csv`}
                />
              </div>

              <div className="overflow-x-auto border border-[#102E36]/12 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#EAE6DC]/60 border-b border-[#102E36]/15 text-[#102E36]">
                    <tr>
                      <th className="py-3 px-3.5 font-bold">#</th>
                      <th className="py-3 px-3.5 font-bold">Name &amp; Category</th>
                      <th className="py-3 px-3.5 font-bold">Contact (Phone &amp; Email)</th>
                      <th className="py-3 px-3.5 font-bold">County</th>
                      <th className="py-3 px-3.5 font-bold">Sub-County</th>
                      <th className="py-3 px-3.5 font-bold">Status &amp; Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102E36]/10">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 px-4 text-center text-sm text-[#4A636A]">
                          No registered accounts match your current search or filters.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u, idx) => (
                        <tr key={u.id} className="hover:bg-[#FAF9F6]/80 transition-colors">
                          <td className="py-3.5 px-3.5 font-mono-num text-[#4A636A] align-top">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-3.5 align-top">
                            <div className="font-bold text-sm text-[#102E36]">{u.fullName}</div>
                            <div className="text-[11px] font-mono-num text-[#287A59] mt-0.5">
                              {(u.roles || []).length > 0
                                ? u.roles
                                    .map((r) => ROLE_DEFINITIONS[r as RoleCode]?.label || r)
                                    .join(' · ')
                                : 'Standard Account'}
                            </div>
                            {u.beneficiaryRef && (
                              <div className="text-[11px] font-mono-num text-[#4A636A] mt-0.5">
                                Case Ref: {u.beneficiaryRef}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 align-top space-y-1">
                            <div className="flex items-center gap-1.5 font-mono-num font-semibold text-[#102E36]">
                              <Phone className="w-3.5 h-3.5 text-[#287A59] shrink-0" />
                              <span>{u.phoneE164 || 'No phone recorded'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#4A636A]">
                              <Mail className="w-3.5 h-3.5 text-[#4A636A] shrink-0" />
                              <span className="break-all">{u.email}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 align-top">
                            <div className="inline-flex items-center gap-1 font-semibold text-[#102E36]">
                              <MapPin className="w-3.5 h-3.5 text-[#287A59] shrink-0" />
                              <span>{u.county || 'Not specified'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 align-top">
                            <div className="font-medium text-[#102E36]">
                              {u.subCounty || 'Not specified'}
                            </div>
                            {u.ward && (
                              <div className="text-[11px] text-[#4A636A]">Ward: {u.ward}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5 align-top space-y-0.5">
                            <div
                              className={`font-bold ${
                                u.approvalStatus === 'ACTIVE'
                                  ? 'text-[#287A59]'
                                  : u.approvalStatus === 'SUSPENDED'
                                    ? 'text-[#9F2D20]'
                                    : 'text-[#B6721A]'
                              }`}
                            >
                              {u.approvalStatus}
                            </div>
                            <div className="text-[11px] text-[#4A636A]">
                              {u.emailVerified ? 'Email verified' : 'Email unverified'} ·{' '}
                              {u.phoneVerified ? 'Phone verified' : 'Phone unverified'}
                            </div>
                            <div className="text-[11px] font-mono-num text-[#4A636A]">
                              {new Date(u.createdAt).toLocaleDateString('en-KE')}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive Permission Mapping & Live 12-Verb Preview Modal */}
      <ModalDialog
        open={Boolean(permModalUser)}
        title={permModalUser ? `Permission Preview & Mapping — ${permModalUser.fullName}` : ''}
        subtitle="Preview all 12 granted action verbs and separation-of-duties conflicts before committing."
        onClose={() => setPermModalUser(null)}
      >
        {permModalUser && (
          <form
            className="space-y-4 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setPermBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/admin/users/${permModalUser.id}/permissions`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    roleCode: permTargetRole,
                    permissionFlags: permFlags,
                    additionalAuthorizationReason: permAuthReason || undefined,
                  }),
                });
                setPermModalUser(null);
                await loadAll();
                setFeedback(`Permissions updated and audited for ${permModalUser.fullName}.`);
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setPermBusy(false);
              }
            }}
          >
            <div>
              <label className="block font-semibold mb-1">Primary Sub-Admin Role Classification</label>
              <select
                value={permTargetRole}
                onChange={async (e) => {
                  const nextRole = e.target.value as RoleCode;
                  setPermTargetRole(nextRole);
                  try {
                    const res = await apiFetch<{ preview: any }>('/api/admin/permissions/preview', {
                      method: 'POST',
                      body: JSON.stringify({ targetRoleCode: nextRole, permissionFlags: permFlags }),
                    });
                    setPermPreview(res.preview);
                  } catch {
                    // ignore
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {SUB_ADMIN_ROLE_CODES.map((rc) => (
                  <option key={rc} value={rc}>
                    {ROLE_DEFINITIONS[rc]?.label || rc} ({rc})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUB_ADMIN_PERMISSION_FLAGS.map((flag) => {
                const checked = permFlags.includes(flag.code);
                return (
                  <label
                    key={flag.code}
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                      checked ? 'bg-[#287A59]/10 border-[#287A59]/40' : 'bg-white border-[#102E36]/12'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={async () => {
                        const nextFlags = checked
                          ? permFlags.filter((f) => f !== flag.code)
                          : [...permFlags, flag.code];
                        setPermFlags(nextFlags);
                        try {
                          const res = await apiFetch<{ preview: any }>('/api/admin/permissions/preview', {
                            method: 'POST',
                            body: JSON.stringify({
                              targetRoleCode: permTargetRole,
                              permissionFlags: nextFlags,
                            }),
                          });
                          setPermPreview(res.preview);
                        } catch {
                          // ignore
                        }
                      }}
                    />
                    <div>
                      <div className="font-semibold text-[#102E36]">{flag.label}</div>
                      <div className="text-[11px] text-[#4A636A]">{flag.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {permPreview && (
              <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/15 space-y-2">
                <div className="font-bold text-[#102E36]">Live Permission Preview (12 Standard Action Verbs)</div>
                <div className="text-[#287A59] font-semibold">
                  Granted Verbs: {(permPreview.grantedVerbs || []).join(' · ') || 'View only'}
                </div>
                {(permPreview.enforcedSafeguards || []).length > 0 && (
                  <ul className="list-disc pl-4 text-[#4A636A]">
                    {permPreview.enforcedSafeguards.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                {(permPreview.conflicts || []).length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#9F2D20]/10 border border-[#9F2D20]/30 text-[#9F2D20] font-semibold">
                    Separation-of-Duties Conflicts Blocked: {permPreview.conflicts.join(' | ')}
                  </div>
                )}
                {permPreview.requiresAdditionalAuthorization && (
                  <div>
                    <label className="block font-bold text-[#9F2D20] mb-1">
                      Additional Authorisation Justification Required (Critical Role / Privileged Flag)
                    </label>
                    <input
                      required
                      minLength={10}
                      value={permAuthReason}
                      onChange={(e) => setPermAuthReason(e.target.value)}
                      placeholder="Document Super Admin / Board authorisation rationale (min 10 chars)..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#9F2D20]/40"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <GlossyButton type="button" variant="ivory" onClick={() => setPermModalUser(null)}>
                Cancel
              </GlossyButton>
              <GlossyButton
                type="submit"
                variant="teal"
                disabled={permBusy || (permPreview?.conflicts || []).length > 0}
              >
                Commit Audited Role Assignment
              </GlossyButton>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
