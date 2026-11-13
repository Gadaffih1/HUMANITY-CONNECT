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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  GlossyButton,
  ExportReportBar,
  formatMoney,
  priorityLabel,
  verificationLabel,
} from '../ui/DesignSystem';
import { AccountSecurityPanel } from '../auth/AuthScreens';
import {
  saveEncryptedOfflineRecord,
  listEncryptedOfflineRecords,
  securelyWipeOfflineRecord,
  type OfflineFieldRecord,
} from '../../lib/offlineVault';
import { AdminMatchingGovernancePanel } from '../matching/AdminMatchingGovernancePanel';

type AdminTab =
  | 'verification'
  | 'needs'
  | 'matching'
  | 'finance'
  | 'safeguarding'
  | 'empowerment'
  | 'field-ops'
  | 'governance';

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

  const loadOffline = async () => {
    const items = await listEncryptedOfflineRecords();
    setOfflineRecords(items);
  };

  const loadAll = async () => {
    setErrorMsg(null);
    try {
      const [ov, rep, guide, emp, proj, comm] = await Promise.all([
        apiFetch<any>('/api/admin/overview'),
        apiFetch<any>('/api/payments/reports/monthly'),
        apiFetch<any>('/api/payments/integration-guide'),
        apiFetch<any>('/api/operations/empowerment'),
        apiFetch<any>('/api/operations/projects'),
        apiFetch<any>('/api/communications/centre'),
      ]);
      setAdminData(ov);
      setMonthlyReport(rep);
      setDarajaGuide(guide);
      setEmpowerment(emp);
      setProjectsData(proj);
      setCommCentre(comm);

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

      try {
        const dpia = await apiFetch<any>('/api/operations/safeguarding/dpia-inventory');
        setDpiaData(dpia);
      } catch {
        // Privileged DPIA view requires verified MFA step-up
      }
    } catch (err: any) {
      setErrorMsg(err.message);
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
      const res = await fetch('/api/admin/export-pg-dump', { headers });
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

        <div className="flex flex-wrap items-center gap-2.5">
          {user?.roles.includes('SUPER_ADMIN') && (
            <GlossyButton
              size="sm"
              variant="gold"
              disabled={exportingDump}
              onClick={downloadPgDump}
            >
              <Download className="w-3.5 h-3.5" />
              {exportingDump ? 'Exporting SQL...' : 'Download PostgreSQL Dump (.sql)'}
            </GlossyButton>
          )}
          <ExportReportBar
            title="Humanity Connect Monthly Financial & Audit Report"
            rows={monthlyReport?.journalEntries || []}
            csvFilename="humanity-connect-monthly-ledger.csv"
          />
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
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[#EAE6DC]/70 overflow-x-auto">
        {[
          { id: 'verification', label: 'Verification Centre (V0–V4)' },
          { id: 'needs', label: 'Needs Engine (15 Cats)' },
          { id: 'matching', label: 'AI Matching Engine' },
          { id: 'finance', label: 'Finance & Daraja M-Pesa' },
          { id: 'safeguarding', label: 'Safeguarding & DPIA' },
          { id: 'empowerment', label: 'Empowerment & Projects' },
          { id: 'field-ops', label: 'Field Ops (Offline Vault)' },
          { id: 'governance', label: 'RBAC, Templates & Audits' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as AdminTab)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[40px] transition-colors ${
              tab === item.id ? 'bg-[#102E36] text-[#FAF9F6]' : 'text-[#102E36] hover:bg-[#FAF9F6]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#287A59]/10 border border-[#287A59]/25 text-sm text-[#287A59]">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-sm text-[#9F2D20]">
          {errorMsg}
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
            <div className="hc-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#287A59]" />
                <h3 className="text-base font-bold text-[#102E36]">
                  DPIA Data Processing Inventory & Retention Schedule ({dpiaData.complianceFramework})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {(dpiaData.retentionPolicies || []).map((rp: any) => (
                  <div key={rp.dataClass} className="p-4 rounded-xl bg-white border border-[#102E36]/10 space-y-1">
                    <div className="font-bold text-[#102E36]">{rp.dataClass}</div>
                    <div className="font-mono-num text-[#287A59]">Retention: {rp.retentionYears} Years</div>
                    <div className="text-[#4A636A]">{rp.storage}</div>
                    <div className="text-[#4A636A]">Disposal: {rp.disposal}</div>
                  </div>
                ))}
              </div>
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
                  Mobile Field Capture (AES-GCM Encrypted Offline Vault)
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#287A59] flex items-center gap-1">
                {isOnline ? <CheckCircle2 className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 text-[#B6721A]" />}
                {isOnline ? 'Online Ready' : 'Offline Mode'}
              </span>
            </div>
            <p className="text-xs text-[#4A636A]">
              Designed for National, County, Sub-County Coordinators, Ward Ambassadors, and Volunteers.
              Records captured offline are encrypted locally with WebCrypto AES-256-GCM and wiped
              securely once synchronised to PostgreSQL.
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
                await saveEncryptedOfflineRecord({
                  localId: `fld-${Date.now()}`,
                  recordType: fieldRecordType,
                  county: fieldCounty,
                  capturedAt: new Date().toISOString(),
                  payload: { summary: fieldSummary, caseId: selectedCaseId || null },
                });
                setFieldSummary('');
                await loadOffline();
                setFeedback('Field record encrypted in local WebCrypto vault.');
              }}
            >
              Save to Encrypted Local Vault
            </GlossyButton>
          </div>

          <div className="lg:col-span-6 hc-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#102E36]">
                Pending Encrypted Offline Queue ({offlineRecords.length})
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
                      securelyWipeOfflineRecord(rec.localId);
                    }
                    await loadOffline();
                    await loadAll();
                    setFeedback('All encrypted field records synced & wiped cleanly from local device storage.');
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync & Securely Wipe Local
              </GlossyButton>
            </div>
            {offlineRecords.length === 0 ? (
              <div className="text-xs text-[#4A636A] py-6 text-center">
                No encrypted offline drafts stored on this device.
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
                      onClick={() => {
                        securelyWipeOfflineRecord(rec.localId);
                        loadOffline();
                      }}
                      className="text-[#9F2D20] p-1"
                      aria-label="Wipe local draft"
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

      {/* 7. RBAC, Communication Templates & Audit Logs */}
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
                  Exports the full 35-table PostgreSQL DDL schema, foreign keys, indexes, and live data
                  into a downloadable <code>.sql</code> file for localhost restore via{' '}
                  <code>psql -d humanity_connect -f humanity-connect-postgres-*.sql</code>.
                </p>
              </div>
              <GlossyButton variant="gold" disabled={exportingDump} onClick={downloadPgDump}>
                <Download className="w-4 h-4" />
                {exportingDump ? 'Generating Dump...' : 'Download .sql Dump'}
              </GlossyButton>
            </div>
          )}

          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">User Governance & RBAC Role Assignment</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                  <tr>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Assigned Roles</th>
                    <th className="py-2 pr-4">MFA</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102E36]/10">
                  {(adminData?.users || []).map((u: any) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-4">
                        <div className="font-bold text-[#102E36]">{u.fullName}</div>
                        <div className="text-[#4A636A]">{u.email}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono-num">{(u.roles || []).join(', ')}</td>
                      <td className="py-3 pr-4">{u.mfaEnabled ? 'Enabled' : 'Off'}</td>
                      <td className="py-3 pr-4 font-semibold text-[#287A59]">{u.approvalStatus}</td>
                      <td className="py-3 flex flex-wrap gap-1.5">
                        <GlossyButton
                          size="sm"
                          variant="ivory"
                          onClick={async () => {
                            await apiFetch(`/api/admin/users/${u.id}/manage`, {
                              method: 'POST',
                              body: JSON.stringify({ assignRoleCode: 'FIELD_OFFICER' }),
                            });
                            await loadAll();
                          }}
                        >
                          + Field Officer
                        </GlossyButton>
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
              <h3 className="text-base font-bold text-[#102E36]">Immutable Security & Financial Audit Log</h3>
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
        </div>
      )}
    </div>
  );
};
