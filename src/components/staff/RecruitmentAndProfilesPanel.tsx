import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  UserPlus,
  ShieldCheck,
  Lock,
  CheckCircle2,
  FileCheck2,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlossyButton, ModalDialog, ResilientMedia } from '../ui/DesignSystem';
import {
  APPLICATION_NEGATIVE_STATUSES,
  KENYAN_47_COUNTIES,
  RECRUITMENT_STAGES,
  STAFF_EMPLOYMENT_STATUSES,
} from '../../types/domain';

interface RecruitmentAndProfilesPanelProps {
  activeSection: 'recruitment' | 'profiles';
  mode: 'public' | 'admin';
  canManageHr: boolean;
  isAuditor: boolean;
  directoryPositions: any[];
  preselectJobId?: string;
  onRefreshDirectory: () => Promise<void>;
  onNavigateAuth?: (mode: 'login' | 'register', role?: string) => void;
}

export const RecruitmentAndProfilesPanel: React.FC<RecruitmentAndProfilesPanelProps> = ({
  activeSection,
  mode,
  canManageHr,
  isAuditor,
  directoryPositions,
  preselectJobId,
  onRefreshDirectory,
  onNavigateAuth,
}) => {
  const { apiFetch, user } = useAuth();
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [myApps, setMyApps] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Vacancy builder state (all 12 required fields)
  const [vacJobId, setVacJobId] = useState(preselectJobId || directoryPositions[0]?.jobId || 'HC-NLA-001');
  const [vacLocation, setVacLocation] = useState('Nairobi National Office, Kenya');
  const [vacEmpType, setVacEmpType] = useState<'FULL_TIME' | 'CONTRACT' | 'PART_TIME' | 'VOLUNTEER' | 'SECONDMENT'>('FULL_TIME');
  const [vacDesc, setVacDesc] = useState('');
  const [vacAcademic, setVacAcademic] = useState('');
  const [vacProf, setVacProf] = useState('');
  const [vacExp, setVacExp] = useState('');
  const [vacDeadline, setVacDeadline] = useState(new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10));
  const [vacDocs, setVacDocs] = useState('Updated CV, National ID / Passport Copy, Academic & Practising Certificates, Valid Certificate of Good Conduct');
  const [vacInstructions, setVacInstructions] = useState(
    'Submit through the encrypted Humanity Connect Recruitment Portal before 17:00 EAT on the closing date.'
  );
  const [vacInitialStage, setVacInitialStage] = useState<'VACANCY_DRAFT' | 'PUBLISHED'>('PUBLISHED');

  // Public apply modal state
  const [applyTarget, setApplyTarget] = useState<any | null>(null);
  const [appName, setAppName] = useState(user?.fullName || '');
  const [appEmail, setAppEmail] = useState(user?.email || '');
  const [appPhone, setAppPhone] = useState('');
  const [appNationalId, setAppNationalId] = useState('');
  const [appCounty, setAppCounty] = useState('Nairobi');
  const [appAcademic, setAppAcademic] = useState('');
  const [appProfCerts, setAppProfCerts] = useState('');
  const [appExpYears, setAppExpYears] = useState('4');
  const [appCoverNote, setAppCoverNote] = useState('');

  // Evaluation modal state
  const [evalApp, setEvalApp] = useState<any | null>(null);
  const [evalStage, setEvalStage] = useState('INITIAL_SCREENING');
  const [evalNotes, setEvalNotes] = useState('');
  const [evalInterviewAt, setEvalInterviewAt] = useState('');
  const [evalInterviewLink, setEvalInterviewLink] = useState('');
  const [evalInterviewScore, setEvalInterviewScore] = useState('');
  const [evalRefStatus, setEvalRefStatus] = useState<'PENDING' | 'VERIFIED' | 'FLAGGED'>('PENDING');
  const [evalBgStatus, setEvalBgStatus] = useState<'PENDING' | 'CLEARED' | 'FLAGGED'>('PENDING');
  const [evalOfferTerms, setEvalOfferTerms] = useState('');
  const [evalVerifyDocs, setEvalVerifyDocs] = useState(false);

  // Staff profile creation & management state
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [profJobId, setProfJobId] = useState(directoryPositions[0]?.jobId || 'HC-NLA-001');
  const [profName, setProfName] = useState('');
  const [profPhoto, setProfPhoto] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profCounty, setProfCounty] = useState('Nairobi');
  const [profSubCounty, setProfSubCounty] = useState('');
  const [profWard, setProfWard] = useState('');
  const [profCountry, setProfCountry] = useState('KE');
  const [profIntlRegion, setProfIntlRegion] = useState('');
  const [profCategory, setProfCategory] = useState<'PERMANENT' | 'FIXED_TERM' | 'CONTRACT' | 'CONSULTANT' | 'VOLUNTEER' | 'FELLOW'>('PERMANENT');
  const [profGender, setProfGender] = useState<'FEMALE' | 'MALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY'>('PREFER_NOT_TO_SAY');
  const [profAppDate, setProfAppDate] = useState(new Date().toISOString().slice(0, 10));
  const [profStatus, setProfStatus] = useState<string>('ACTIVE');
  const [profAcademic, setProfAcademic] = useState('');
  const [profCerts, setProfCerts] = useState('');
  const [profExp, setProfExp] = useState('');
  const [profEmgName, setProfEmgName] = useState('');
  const [profEmgPhone, setProfEmgPhone] = useState('');
  const [profEmgRel, setProfEmgRel] = useState('');

  // Selected profile & Disciplinary state
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [disciplinaryRecords, setDisciplinaryRecords] = useState<any[]>([]);
  const [disciplinaryError, setDisciplinaryError] = useState<string | null>(null);
  const [profActionType, setProfActionType] = useState<'TRANSFER' | 'PROMOTE' | 'RECORD_TRAINING' | 'RECORD_LEAVE' | 'EXIT'>('TRANSFER');
  const [actCounty, setActCounty] = useState('Mombasa');
  const [actNewJobId, setActNewJobId] = useState(directoryPositions[0]?.jobId || '');
  const [actReason, setActReason] = useState('');
  const [actTrainingCourse, setActTrainingCourse] = useState('');
  const [actLeaveType, setActLeaveType] = useState('Annual Leave');
  const [actLeaveStart, setActLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [actLeaveEnd, setActLeaveEnd] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [actExitStatus, setActExitStatus] = useState('RESIGNED');

  const [discCat, setDiscCat] = useState<'CONDUCT' | 'POLICY_BREACH' | 'ATTENDANCE' | 'SAFEGUARDING_REFERRAL'>('CONDUCT');
  const [discSev, setDiscSev] = useState<'MINOR' | 'MODERATE' | 'SERIOUS' | 'GROSS'>('MINOR');
  const [discSummary, setDiscSummary] = useState('');
  const [discActionTaken, setDiscActionTaken] = useState('');

  useEffect(() => {
    if (preselectJobId) {
      setVacJobId(preselectJobId);
      const pos = directoryPositions.find((p) => p.jobId === preselectJobId);
      if (pos) {
        setVacDesc(pos.jobDescription || '');
        setVacAcademic(pos.requiredQualifications || '');
        setVacProf(pos.professionalQualifications || '');
        setVacExp(pos.requiredExperience || '');
      }
    }
  }, [preselectJobId, directoryPositions]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const pub = await apiFetch<{ vacancies: any[] }>('/api/staff/public/vacancies');
      let mergedVacancies = pub.vacancies || [];

      if (user) {
        try {
          const mine = await apiFetch<{ applications: any[] }>('/api/staff/my-applications');
          setMyApps(mine.applications || []);
        } catch {
          // ignore
        }
      }

      if (mode === 'admin' && (canManageHr || isAuditor)) {
        try {
          const rec = await apiFetch<{ vacancies: any[]; applications: any[] }>('/api/staff/recruitment');
          mergedVacancies = rec.vacancies || [];
          setApplications(rec.applications || []);
        } catch (err: any) {
          setErrorMsg(err.message);
        }
      }
      setVacancies(mergedVacancies);

      if (mode === 'admin' && user) {
        try {
          const prof = await apiFetch<{ profiles: any[] }>('/api/staff/profiles');
          setProfiles(prof.profiles || []);
        } catch {
          setProfiles([]);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSection, mode, canManageHr, isAuditor, user?.id]);

  const openProfileInspector = async (profile: any) => {
    setSelectedProfile(profile);
    setDisciplinaryRecords([]);
    setDisciplinaryError(null);
    try {
      const res = await apiFetch<{ records: any[] }>(`/api/staff/profiles/${profile.id}/disciplinary`);
      setDisciplinaryRecords(res.records || []);
    } catch (err: any) {
      setDisciplinaryError(err.message);
    }
  };

  const prefillVacancyFromPosition = (jobId: string) => {
    setVacJobId(jobId);
    const pos = directoryPositions.find((p) => p.jobId === jobId);
    if (pos) {
      setVacDesc(pos.jobDescription || '');
      setVacAcademic(pos.requiredQualifications || '');
      setVacProf(pos.professionalQualifications || '');
      setVacExp(pos.requiredExperience || '');
      setVacLocation(pos.geographicalJurisdiction || 'Nairobi, Kenya');
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

      {/* RECRUITMENT, 15 STAGES & APPOINTMENTS */}
      {activeSection === 'recruitment' && (
        <div className="space-y-6">
          {/* Open Vacancies Grid */}
          <div className="hc-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#102E36]">
                  Official Recruitment & Staff Appointment Centre
                </h3>
                <p className="text-xs text-[#4A636A]">
                  15-Stage audited pipeline from Vacancy Draft to Active Employee Appointment. Applicant PII is
                  AES-256 encrypted and restricted to authorised HR personnel.
                </p>
              </div>
              {!user && onNavigateAuth && (
                <GlossyButton size="sm" variant="teal" onClick={() => onNavigateAuth('login', 'SUPPORTIVE')}>
                  Sign In to Track Applications
                </GlossyButton>
              )}
            </div>

            {loading ? (
              <div className="py-6 text-xs text-[#4A636A]">Loading recruitment pipeline...</div>
            ) : vacancies.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#FAF9F6] border border-[#102E36]/12 text-center text-xs text-[#4A636A]">
                No vacancies have been published yet. Authorised HR Officers may draft, approve, and publish positions
                from the 170 approved organisational roles below.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vacancies.map((vac) => (
                  <div key={vac.id} className="p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono-num text-[#287A59] font-bold">
                          {vac.vacancyCode} · {vac.jobId}
                        </div>
                        <h4 className="text-sm font-bold text-[#102E36] mt-0.5">{vac.jobTitle}</h4>
                        <div className="text-[#4A636A]">
                          Dept {vac.departmentNumber}: {vac.department} · {vac.jobLocation} ·{' '}
                          {vac.employmentType?.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <span className="font-semibold text-[#102E36]">{vac.stage?.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-[#4A636A] line-clamp-2">{vac.jobDescription}</p>
                    <div className="space-y-1 text-[11px] text-[#4A636A]">
                      <div>
                        <strong>Academic:</strong> {vac.academicQualifications}
                      </div>
                      <div>
                        <strong>Professional:</strong> {vac.professionalRequirements}
                      </div>
                      <div>
                        <strong>Experience:</strong> {vac.experienceRequirements}
                      </div>
                      <div>
                        <strong>Required Docs:</strong> {(vac.requiredDocuments || []).join(', ')}
                      </div>
                      <div>
                        <strong>Deadline:</strong>{' '}
                        <span className="font-mono-num text-[#9F2D20] font-semibold">
                          {new Date(vac.applicationDeadline).toLocaleDateString('en-KE')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {vac.stage === 'PUBLISHED' && (
                        <GlossyButton size="sm" variant="gold" onClick={() => setApplyTarget(vac)}>
                          Apply for Position
                        </GlossyButton>
                      )}
                      {mode === 'admin' && canManageHr && !isAuditor && vac.stage !== 'PUBLISHED' && (
                        <GlossyButton
                          size="sm"
                          variant="teal"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await apiFetch(`/api/staff/recruitment/vacancies/${vac.id}/stage`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  stage: vac.stage === 'VACANCY_DRAFT' ? 'VACANCY_APPROVED' : 'PUBLISHED',
                                }),
                              });
                              await loadData();
                              await onRefreshDirectory();
                            } catch (err: any) {
                              setErrorMsg(err.message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {vac.stage === 'VACANCY_DRAFT' ? 'Approve Vacancy (Stage 2)' : 'Publish Vacancy (Stage 3)'}
                        </GlossyButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signed-in Applicant Tracking */}
          {user && myApps.length > 0 && (
            <div className="hc-card p-5 space-y-3">
              <h4 className="text-sm font-bold text-[#102E36]">
                My Application Status & Notifications ({myApps.length})
              </h4>
              <div className="space-y-2">
                {myApps.map((app) => (
                  <div
                    key={app.id}
                    className="p-3 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono-num font-bold">{app.applicationRef}</span> ·{' '}
                      <span className="font-mono-num text-[#4A636A]">{app.jobId}</span>
                      <div className="text-[#4A636A] mt-0.5">{app.stageNotes}</div>
                      {app.interviewScheduledAt && (
                        <div className="text-[#287A59] font-semibold mt-0.5">
                          Interview: {new Date(app.interviewScheduledAt).toLocaleString('en-KE')} ·{' '}
                          {app.interviewLocationOrLink}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-[#287A59]">{app.stage.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HR Admin Publish Vacancy Form */}
          {mode === 'admin' && canManageHr && !isAuditor && (
            <form
              className="hc-card p-5 space-y-4 text-xs"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErrorMsg(null);
                try {
                  await apiFetch('/api/staff/recruitment/vacancies', {
                    method: 'POST',
                    body: JSON.stringify({
                      jobId: vacJobId,
                      jobLocation: vacLocation,
                      employmentType: vacEmpType,
                      jobDescription: vacDesc,
                      academicQualifications: vacAcademic,
                      professionalRequirements: vacProf,
                      experienceRequirements: vacExp,
                      applicationDeadline: vacDeadline,
                      requiredDocuments: vacDocs
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      applicationInstructions: vacInstructions,
                      initialStage: vacInitialStage,
                    }),
                  });
                  await loadData();
                  await onRefreshDirectory();
                  setFeedback(`Vacancy created and moved to ${vacInitialStage} stage.`);
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#287A59]" />
                <h4 className="text-base font-bold text-[#102E36]">
                  HR Department: Create & Publish Organisational Vacancy (All 12 Fields)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Approved Position (Title · Dept · Job ID)</label>
                  <select
                    value={vacJobId}
                    onChange={(e) => prefillVacancyFromPosition(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  >
                    {directoryPositions.map((p) => (
                      <option key={p.jobId} value={p.jobId}>
                        {p.jobId} · {p.jobTitle} (Dept {p.departmentNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Job Location</label>
                  <input
                    required
                    value={vacLocation}
                    onChange={(e) => setVacLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Employment Type</label>
                  <select
                    value={vacEmpType}
                    onChange={(e) => setVacEmpType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  >
                    <option value="FULL_TIME">Full Time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="VOLUNTEER">Volunteer</option>
                    <option value="SECONDMENT">Secondment</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Application Deadline</label>
                  <input
                    type="date"
                    required
                    value={vacDeadline}
                    onChange={(e) => setVacDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Initial Pipeline Stage</label>
                  <select
                    value={vacInitialStage}
                    onChange={(e) => setVacInitialStage(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  >
                    <option value="VACANCY_DRAFT">1. Vacancy Draft</option>
                    <option value="PUBLISHED">3. Publish Immediately</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Experience Requirements</label>
                  <input
                    required
                    value={vacExp}
                    onChange={(e) => setVacExp(e.target.value)}
                    placeholder="e.g. Minimum 5 years humanitarian finance"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Academic Qualifications</label>
                  <input
                    required
                    value={vacAcademic}
                    onChange={(e) => setVacAcademic(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Professional Requirements</label>
                  <input
                    required
                    value={vacProf}
                    onChange={(e) => setVacProf(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Job Description</label>
                <textarea
                  rows={2}
                  required
                  minLength={20}
                  value={vacDesc}
                  onChange={(e) => setVacDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Required Supporting Documents (comma-separated)</label>
                  <input
                    required
                    value={vacDocs}
                    onChange={(e) => setVacDocs(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Application Instructions</label>
                  <input
                    required
                    value={vacInstructions}
                    onChange={(e) => setVacInstructions(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                </div>
              </div>
              <GlossyButton type="submit" variant="teal" disabled={busy}>
                Save Organisational Vacancy
              </GlossyButton>
            </form>
          )}

          {/* HR / Auditor 15-Stage Applications Dossier */}
          {mode === 'admin' && (canManageHr || isAuditor) && (
            <div className="hc-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#287A59]" />
                <h4 className="text-base font-bold text-[#102E36]">
                  15-Stage Recruitment Applications Dossier ({applications.length})
                </h4>
              </div>
              {applications.length === 0 ? (
                <div className="text-xs text-[#4A636A] py-4">
                  No applications received yet. Submitted applications appear here encrypted for authorised HR review.
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className="p-4 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-start justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-mono-num font-bold text-[#102E36]">
                          {app.applicationRef} · {app.jobId}
                        </div>
                        <div className="font-bold text-sm text-[#102E36]">{app.applicantName}</div>
                        <div className="text-[#4A636A]">
                          {app.applicantEmail} · {app.applicantPhone} · {app.county} County · {app.experienceYears} yrs
                          exp
                        </div>
                        <div className="text-[#4A636A]">
                          <strong>Academic:</strong> {app.academicSummary} · <strong>Stage:</strong>{' '}
                          <span className="font-bold text-[#287A59]">{app.stage}</span>
                        </div>
                        {app.interviewScore !== null && app.interviewScore !== undefined && (
                          <div className="font-mono-num text-[#102E36]">
                            Interview Score: {app.interviewScore}/100 · Ref Check: {app.referenceCheckStatus} · Bg
                            Check: {app.backgroundCheckStatus}
                          </div>
                        )}
                      </div>
                      {canManageHr && !isAuditor && (
                        <GlossyButton
                          size="sm"
                          variant="teal"
                          onClick={() => {
                            setEvalApp(app);
                            setEvalStage(app.stage);
                            setEvalNotes(app.stageNotes || '');
                            setEvalInterviewLink(app.interviewLocationOrLink || '');
                            setEvalInterviewScore(
                              app.interviewScore !== null && app.interviewScore !== undefined
                                ? String(app.interviewScore)
                                : ''
                            );
                            setEvalRefStatus(app.referenceCheckStatus || 'PENDING');
                            setEvalBgStatus(app.backgroundCheckStatus || 'PENDING');
                            setEvalOfferTerms(app.offerTermsSummary || '');
                            setEvalVerifyDocs(false);
                          }}
                        >
                          Assess / Advance Stage
                        </GlossyButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STAFF PROFILES & RESTRICTED DISCIPLINARY MANAGEMENT */}
      {activeSection === 'profiles' && (
        <div className="space-y-6">
          <div className="hc-card p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[#102E36]">
                Staff Profile & Employee Management Centre ({profiles.length})
              </h3>
              <p className="text-xs text-[#4A636A]">
                Authorised HR lifecycle management: 9 employment statuses, transfers, promotions, training, leave, exits,
                and encrypted self-excluded disciplinary records. Zero synthetic or dummy staff.
              </p>
            </div>
            {canManageHr && !isAuditor && (
              <GlossyButton size="sm" variant="gold" onClick={() => setCreateProfileOpen(true)}>
                <UserPlus className="w-3.5 h-3.5" />
                Appoint Official Staff Profile
              </GlossyButton>
            )}
          </div>

          {profiles.length === 0 ? (
            <div className="hc-card p-8 text-center text-xs text-[#4A636A]">
              No staff members have been appointed into active employee profiles yet. Appoint real staff via Stage 15
              of Recruitment or the button above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((p) => (
                <div key={p.id} className="hc-card p-4 space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <ResilientMedia
                      src={p.officialPhotoUrl}
                      alt={p.fullLegalName}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-mono-num text-[#287A59] font-bold">
                        {p.staffNumber} · {p.jobId}
                      </div>
                      <div className="font-bold text-sm text-[#102E36] truncate">{p.fullLegalName}</div>
                      <div className="text-[#4A636A]">{p.jobTitle}</div>
                    </div>
                  </div>
                  <div className="text-[#4A636A] space-y-0.5">
                    <div>
                      Dept {p.departmentNumber}: {p.department} · {p.countyAssignment} County
                    </div>
                    <div>
                      Status: <strong className="text-[#102E36]">{p.employmentStatus}</strong> ·{' '}
                      {p.employmentCategory}
                    </div>
                    <div>Supervisor: {p.supervisorName}</div>
                  </div>
                  <GlossyButton size="sm" variant="ivory" className="w-full" onClick={() => openProfileInspector(p)}>
                    <UserCog className="w-3.5 h-3.5" />
                    Inspect Full Profile & History
                  </GlossyButton>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Public Apply Modal */}
      <ModalDialog
        open={Boolean(applyTarget)}
        title={applyTarget ? `Apply: ${applyTarget.jobTitle}` : ''}
        subtitle={applyTarget ? `${applyTarget.vacancyCode} · Personal data is encrypted and restricted to HR.` : undefined}
        onClose={() => setApplyTarget(null)}
      >
        {applyTarget && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                const res = await apiFetch<{ application: any }>('/api/staff/public/apply', {
                  method: 'POST',
                  body: JSON.stringify({
                    vacancyId: applyTarget.id,
                    fullName: appName,
                    email: appEmail,
                    phone: appPhone,
                    nationalId: appNationalId || undefined,
                    county: appCounty,
                    academicSummary: appAcademic,
                    professionalCertsSummary: appProfCerts,
                    experienceYears: Number(appExpYears) || 0,
                    coverNote: appCoverNote,
                    documentNames: applyTarget.requiredDocuments || ['CV', 'Academic & Professional Certificates'],
                  }),
                });
                setApplyTarget(null);
                await loadData();
                setFeedback(
                  `Application ${res.application.applicationRef} received securely (Stage 4: Applications Received).`
                );
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Full Legal Name</label>
                <input
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={appEmail}
                  onChange={(e) => setAppEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Phone Number</label>
                <input
                  required
                  value={appPhone}
                  onChange={(e) => setAppPhone(e.target.value)}
                  placeholder="+2547..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">County of Residence / Application</label>
                <select
                  value={appCounty}
                  onChange={(e) => setAppCounty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  {KENYAN_47_COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c} County
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">National ID / Passport (Optional)</label>
                <input
                  value={appNationalId}
                  onChange={(e) => setAppNationalId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Years of Relevant Experience</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  required
                  value={appExpYears}
                  onChange={(e) => setAppExpYears(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Academic Qualifications Summary</label>
              <input
                required
                minLength={6}
                value={appAcademic}
                onChange={(e) => setAppAcademic(e.target.value)}
                placeholder="e.g. Bachelor of Arts in Social Work, University of Nairobi"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Professional Certifications / Statutory Licence</label>
              <input
                required
                minLength={3}
                value={appProfCerts}
                onChange={(e) => setAppProfCerts(e.target.value)}
                placeholder="e.g. KNBS / IHRM / ICPAK Practising Member / Safeguarding L2"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Suitability Statement / Cover Note (min 20 chars)</label>
              <textarea
                rows={3}
                required
                minLength={20}
                value={appCoverNote}
                onChange={(e) => setAppCoverNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div className="flex justify-end gap-2">
              <GlossyButton type="button" variant="ivory" onClick={() => setApplyTarget(null)}>
                Cancel
              </GlossyButton>
              <GlossyButton type="submit" variant="gold" disabled={busy}>
                <Lock className="w-3.5 h-3.5" />
                Submit Encrypted Application
              </GlossyButton>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* HR Evaluate / Advance Recruitment Application Modal */}
      <ModalDialog
        open={Boolean(evalApp)}
        title={evalApp ? `Evaluate ${evalApp.applicationRef} (${evalApp.jobId})` : ''}
        subtitle="Two-person control prevents proposers from unilaterally signing Stage 13 Appointment Approved."
        onClose={() => setEvalApp(null)}
      >
        {evalApp && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/staff/recruitment/applications/${evalApp.id}/stage`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    stage: evalStage,
                    stageNotes: evalNotes,
                    interviewScheduledAt: evalInterviewAt || undefined,
                    interviewLocationOrLink: evalInterviewLink || undefined,
                    interviewScore: evalInterviewScore ? Number(evalInterviewScore) : undefined,
                    referenceCheckStatus: evalRefStatus,
                    backgroundCheckStatus: evalBgStatus,
                    offerTermsSummary: evalOfferTerms || undefined,
                    verifyAllDocuments: evalVerifyDocs,
                  }),
                });
                setEvalApp(null);
                await loadData();
                await onRefreshDirectory();
                setFeedback(`Updated application ${evalApp.applicationRef} to stage ${evalStage}.`);
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label className="block font-semibold mb-1">Target Recruitment Stage / Outcome</label>
              <select
                value={evalStage}
                onChange={(e) => setEvalStage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {RECRUITMENT_STAGES.filter((s) => s.scope === 'APPLICATION').map((s) => (
                  <option key={s.code} value={s.code}>
                    Stage {s.step}: {s.label}
                  </option>
                ))}
                {APPLICATION_NEGATIVE_STATUSES.map((s) => (
                  <option key={s.code} value={s.code}>
                    Outcome: {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">Interview Date & Time</label>
                <input
                  type="datetime-local"
                  value={evalInterviewAt}
                  onChange={(e) => setEvalInterviewAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Interview Score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={evalInterviewScore}
                  onChange={(e) => setEvalInterviewScore(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Venue / Panel Link</label>
                <input
                  value={evalInterviewLink}
                  onChange={(e) => setEvalInterviewLink(e.target.value)}
                  placeholder="Boardroom / Meet link"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Reference Checks</label>
                <select
                  value={evalRefStatus}
                  onChange={(e) => setEvalRefStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="FLAGGED">Flagged</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Background & Suitability Check</label>
                <select
                  value={evalBgStatus}
                  onChange={(e) => setEvalBgStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="PENDING">Pending</option>
                  <option value="CLEARED">Cleared</option>
                  <option value="FLAGGED">Flagged</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Offer Terms Summary (Stage 11–12)</label>
              <input
                value={evalOfferTerms}
                onChange={(e) => setEvalOfferTerms(e.target.value)}
                placeholder="Start date, grade, probation & safeguarding code..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Assessment Notes (sent to applicant notifications)</label>
              <textarea
                rows={2}
                value={evalNotes}
                onChange={(e) => setEvalNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={evalVerifyDocs}
                onChange={(e) => setEvalVerifyDocs(e.target.checked)}
              />
              Mark submitted supporting documents as HR Verified
            </label>
            <div className="flex justify-end gap-2">
              <GlossyButton type="button" variant="ivory" onClick={() => setEvalApp(null)}>
                Cancel
              </GlossyButton>
              <GlossyButton type="submit" variant="green" disabled={busy}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Update Stage
              </GlossyButton>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Appoint New Staff Profile Modal */}
      <ModalDialog
        open={createProfileOpen}
        title="Appoint Official Staff Profile"
        subtitle="Self-appointment is blocked. Appointment is immediately reflected in the 170-position establishment."
        onClose={() => setCreateProfileOpen(false)}
      >
        <form
          className="space-y-3 text-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErrorMsg(null);
            try {
              await apiFetch('/api/staff/profiles', {
                method: 'POST',
                body: JSON.stringify({
                  jobId: profJobId,
                  fullLegalName: profName,
                  officialPhotoUrl: profPhoto || null,
                  contactEmail: profEmail,
                  contactPhone: profPhone,
                  countyAssignment: profCounty,
                  subCountyAssignment: profSubCounty || undefined,
                  wardAssignment: profWard || undefined,
                  countryCode: profCountry,
                  internationalRegion: profIntlRegion || undefined,
                  employmentCategory: profCategory,
                  genderMarker: profGender,
                  appointmentDate: profAppDate,
                  employmentStatus: profStatus,
                  academicQualifications: profAcademic,
                  professionalCertifications: profCerts,
                  workExperienceSummary: profExp,
                  emergencyContactName: profEmgName,
                  emergencyContactPhone: profEmgPhone,
                  emergencyContactRelation: profEmgRel,
                }),
              });
              setCreateProfileOpen(false);
              await loadData();
              await onRefreshDirectory();
              setFeedback(`Created official staff profile for ${profName} under position ${profJobId}.`);
            } catch (err: any) {
              setErrorMsg(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Approved Position</label>
              <select
                value={profJobId}
                onChange={(e) => setProfJobId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {directoryPositions.map((p) => (
                  <option key={p.jobId} value={p.jobId}>
                    {p.jobId} · {p.jobTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Full Legal Name</label>
              <input
                required
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Official Email</label>
              <input
                type="email"
                required
                value={profEmail}
                onChange={(e) => setProfEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Contact Phone</label>
              <input
                required
                value={profPhone}
                onChange={(e) => setProfPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">County Assignment</label>
              <select
                value={profCounty}
                onChange={(e) => setProfCounty(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {KENYAN_47_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Employment Status</label>
              <select
                value={profStatus}
                onChange={(e) => setProfStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                {STAFF_EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Employment Category</label>
              <select
                value={profCategory}
                onChange={(e) => setProfCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="PERMANENT">Permanent</option>
                <option value="FIXED_TERM">Fixed Term</option>
                <option value="CONTRACT">Contract</option>
                <option value="CONSULTANT">Consultant</option>
                <option value="VOLUNTEER">Volunteer</option>
                <option value="FELLOW">Fellow</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Gender Marker (Lawful Aggregation)</label>
              <select
                value={profGender}
                onChange={(e) => setProfGender(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="NON_BINARY">Non-Binary</option>
                <option value="PREFER_NOT_TO_SAY">Prefer Not To Say</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Appointment Date</label>
              <input
                type="date"
                required
                value={profAppDate}
                onChange={(e) => setProfAppDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Official Photo URL (Optional)</label>
              <input
                value={profPhoto}
                onChange={(e) => setProfPhoto(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Sub-County / Ward (Optional)</label>
              <input
                value={profSubCounty}
                onChange={(e) => setProfSubCounty(e.target.value)}
                placeholder="Sub-county"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Country / Intl Region (Optional)</label>
              <input
                value={profIntlRegion}
                onChange={(e) => setProfIntlRegion(e.target.value)}
                placeholder="e.g. East Africa / Country Code KE"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Academic Qualifications</label>
              <input
                required
                minLength={5}
                value={profAcademic}
                onChange={(e) => setProfAcademic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Professional Certifications</label>
              <input
                required
                minLength={3}
                value={profCerts}
                onChange={(e) => setProfCerts(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Work Experience Summary</label>
            <input
              required
              minLength={5}
              value={profExp}
              onChange={(e) => setProfExp(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold mb-1">Emergency Contact Name</label>
              <input
                required
                value={profEmgName}
                onChange={(e) => setProfEmgName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Emergency Phone</label>
              <input
                required
                value={profEmgPhone}
                onChange={(e) => setProfEmgPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Relationship</label>
              <input
                required
                value={profEmgRel}
                onChange={(e) => setProfEmgRel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <GlossyButton type="button" variant="ivory" onClick={() => setCreateProfileOpen(false)}>
              Cancel
            </GlossyButton>
            <GlossyButton type="submit" variant="gold" disabled={busy}>
              Save Official Staff Profile
            </GlossyButton>
          </div>
        </form>
      </ModalDialog>

      {/* Profile Inspector, Lifecycle Actions & Restricted Disciplinary Drawer */}
      <ModalDialog
        open={Boolean(selectedProfile)}
        title={selectedProfile ? `${selectedProfile.staffNumber} — ${selectedProfile.fullLegalName}` : ''}
        subtitle={selectedProfile ? `${selectedProfile.jobTitle} (${selectedProfile.jobId})` : undefined}
        onClose={() => setSelectedProfile(null)}
      >
        {selectedProfile && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-white border border-[#102E36]/12">
              <div>
                <strong>Department:</strong> Dept {selectedProfile.departmentNumber} — {selectedProfile.department}
              </div>
              <div>
                <strong>Location:</strong> {selectedProfile.countyAssignment} County ({selectedProfile.employmentStatus})
              </div>
              {selectedProfile.contactEmail && (
                <div>
                  <strong>Contact:</strong> {selectedProfile.contactEmail} · {selectedProfile.contactPhone}
                </div>
              )}
              {selectedProfile.academicQualifications && (
                <div>
                  <strong>Academic & Certs:</strong> {selectedProfile.academicQualifications} ·{' '}
                  {selectedProfile.professionalCertifications}
                </div>
              )}
            </div>

            {/* HR Lifecycle Actions */}
            {canManageHr && !isAuditor && (
              <form
                className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/15 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setErrorMsg(null);
                  try {
                    const body: Record<string, any> = { actionType: profActionType };
                    if (profActionType === 'TRANSFER') {
                      body.countyAssignment = actCounty;
                      body.exitOrTransferReason = actReason;
                    } else if (profActionType === 'PROMOTE') {
                      body.newJobId = actNewJobId;
                    } else if (profActionType === 'RECORD_TRAINING') {
                      body.trainingCourse = actTrainingCourse;
                    } else if (profActionType === 'RECORD_LEAVE') {
                      body.leaveType = actLeaveType;
                      body.leaveStart = actLeaveStart;
                      body.leaveEnd = actLeaveEnd;
                    } else if (profActionType === 'EXIT') {
                      body.employmentStatus = actExitStatus;
                      body.exitOrTransferReason = actReason;
                    }
                    await apiFetch(`/api/staff/profiles/${selectedProfile.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify(body),
                    });
                    await loadData();
                    await onRefreshDirectory();
                    setSelectedProfile(null);
                    setFeedback(`Recorded ${profActionType} for ${selectedProfile.fullLegalName}.`);
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="font-bold text-[#102E36]">HR Lifecycle Management (Audited)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={profActionType}
                    onChange={(e) => setProfActionType(e.target.value as any)}
                    className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  >
                    <option value="TRANSFER">Transfer County / Duty Station</option>
                    <option value="PROMOTE">Record Promotion</option>
                    <option value="RECORD_TRAINING">Record Training Course</option>
                    <option value="RECORD_LEAVE">Approve Leave Record</option>
                    <option value="EXIT">Manage Staff Exit (Resign/Retire/Terminate)</option>
                  </select>
                  {profActionType === 'TRANSFER' && (
                    <select
                      value={actCounty}
                      onChange={(e) => setActCounty(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      {KENYAN_47_COUNTIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                  {profActionType === 'PROMOTE' && (
                    <select
                      value={actNewJobId}
                      onChange={(e) => setActNewJobId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      {directoryPositions.map((p) => (
                        <option key={p.jobId} value={p.jobId}>
                          {p.jobId} · {p.jobTitle}
                        </option>
                      ))}
                    </select>
                  )}
                  {profActionType === 'RECORD_TRAINING' && (
                    <input
                      required
                      value={actTrainingCourse}
                      onChange={(e) => setActTrainingCourse(e.target.value)}
                      placeholder="Course name"
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                  )}
                  {profActionType === 'EXIT' && (
                    <select
                      value={actExitStatus}
                      onChange={(e) => setActExitStatus(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    >
                      <option value="RESIGNED">Resigned</option>
                      <option value="RETIRED">Retired</option>
                      <option value="TERMINATED">Terminated</option>
                    </select>
                  )}
                </div>
                {profActionType === 'RECORD_LEAVE' && (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={actLeaveType}
                      onChange={(e) => setActLeaveType(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      type="date"
                      value={actLeaveStart}
                      onChange={(e) => setActLeaveStart(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      type="date"
                      value={actLeaveEnd}
                      onChange={(e) => setActLeaveEnd(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                  </div>
                )}
                {(profActionType === 'TRANSFER' || profActionType === 'EXIT') && (
                  <input
                    value={actReason}
                    onChange={(e) => setActReason(e.target.value)}
                    placeholder="Official documented reason..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                )}
                <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
                  Apply Lifecycle Record
                </GlossyButton>
              </form>
            )}

            {/* Restricted Disciplinary Partition */}
            <div className="p-4 rounded-xl bg-white border border-[#9F2D20]/30 space-y-3">
              <div className="flex items-center gap-2 font-bold text-[#9F2D20]">
                <ShieldCheck className="w-4 h-4" />
                Restricted Disciplinary Partition (Encrypted · Self-Excluded)
              </div>
              {disciplinaryError ? (
                <div className="p-2.5 rounded-lg bg-[#9F2D20]/10 text-[#9F2D20]">{disciplinaryError}</div>
              ) : (
                <>
                  {disciplinaryRecords.length === 0 ? (
                    <div className="text-[#4A636A]">No disciplinary records on file for this profile.</div>
                  ) : (
                    <div className="space-y-2">
                      {disciplinaryRecords.map((rec) => (
                        <div key={rec.id} className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#102E36]/10">
                          <div className="font-mono-num font-bold">
                            {rec.incidentRef} · {rec.category} · {rec.severity} ({rec.status})
                          </div>
                          <div className="text-[#4A636A]">{rec.summary}</div>
                          <div className="text-[#287A59]">Action: {rec.actionTaken}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {canManageHr && !isAuditor && (
                    <form
                      className="space-y-2 pt-2 border-t border-[#102E36]/10"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        try {
                          await apiFetch(`/api/staff/profiles/${selectedProfile.id}/disciplinary`, {
                            method: 'POST',
                            body: JSON.stringify({
                              category: discCat,
                              severity: discSev,
                              summary: discSummary,
                              actionTaken: discActionTaken,
                            }),
                          });
                          setDiscSummary('');
                          setDiscActionTaken('');
                          await openProfileInspector(selectedProfile);
                        } catch (err: any) {
                          setDisciplinaryError(err.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={discCat}
                          onChange={(e) => setDiscCat(e.target.value as any)}
                          className="px-2.5 py-2 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15"
                        >
                          <option value="CONDUCT">Conduct</option>
                          <option value="POLICY_BREACH">Policy Breach</option>
                          <option value="ATTENDANCE">Attendance</option>
                          <option value="SAFEGUARDING_REFERRAL">Safeguarding Referral</option>
                        </select>
                        <select
                          value={discSev}
                          onChange={(e) => setDiscSev(e.target.value as any)}
                          className="px-2.5 py-2 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15"
                        >
                          <option value="MINOR">Minor</option>
                          <option value="MODERATE">Moderate</option>
                          <option value="SERIOUS">Serious</option>
                          <option value="GROSS">Gross</option>
                        </select>
                      </div>
                      <input
                        required
                        minLength={10}
                        value={discSummary}
                        onChange={(e) => setDiscSummary(e.target.value)}
                        placeholder="Restricted incident summary (min 10 chars)..."
                        className="w-full px-2.5 py-2 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15"
                      />
                      <input
                        required
                        minLength={5}
                        value={discActionTaken}
                        onChange={(e) => setDiscActionTaken(e.target.value)}
                        placeholder="Action taken / panel directive..."
                        className="w-full px-2.5 py-2 rounded-lg bg-[#FAF9F6] border border-[#102E36]/15"
                      />
                      <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
                        Log Encrypted Disciplinary Entry
                      </GlossyButton>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
