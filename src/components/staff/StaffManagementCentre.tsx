import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  GitBranch,
  Building2,
  MapPin,
  Users,
  Award,
  MessageSquare,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StaffDirectoryAndOrgChart } from './StaffDirectoryAndOrgChart';
import { RecruitmentAndProfilesPanel } from './RecruitmentAndProfilesPanel';
import { FieldAndDeptWorkspacesPanel } from './FieldAndDeptWorkspacesPanel';
import { PerformanceCommsReportsPanel } from './PerformanceCommsReportsPanel';

type StaffCentreTab =
  | 'directory'
  | 'org-chart'
  | 'recruitment'
  | 'profiles'
  | 'field-ops'
  | 'departments'
  | 'performance'
  | 'comms-tasks'
  | 'hr-reports';

interface StaffManagementCentreProps {
  mode: 'public' | 'admin';
  onNavigateAuth?: (mode: 'login' | 'register', role?: string) => void;
}

export const StaffManagementCentre: React.FC<StaffManagementCentreProps> = ({
  mode,
  onNavigateAuth,
}) => {
  const { apiFetch, user } = useAuth();
  const [activeTab, setActiveTab] = useState<StaffCentreTab>('directory');
  const [directoryData, setDirectoryData] = useState<any>(null);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [preselectVacancyJobId, setPreselectVacancyJobId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canManageHr = Boolean(
    user &&
      (user.roles.includes('SUPER_ADMIN') ||
        user.roles.includes('HR_OFFICER') ||
        user.permissions.includes('canManageHR'))
  );
  const isAuditor = Boolean(
    user &&
      (user.activeRole === 'AUDITOR' || user.roles.includes('AUDITOR')) &&
      !user.roles.includes('SUPER_ADMIN')
  );

  const loadDirectoryAndRevisions = async () => {
    setErrorMsg(null);
    try {
      const dir = await apiFetch<any>('/api/staff/public/directory');
      setDirectoryData(dir);

      if (mode === 'admin' && user) {
        try {
          const rev = await apiFetch<{ revisions: any[] }>('/api/staff/revisions');
          setRevisions(rev.revisions || []);
        } catch {
          setRevisions([]);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load staff establishment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectoryAndRevisions();
  }, [mode, user?.id]);

  const tabs: Array<{ id: StaffCentreTab; label: string; icon: React.ReactNode }> = [
    { id: 'directory', label: '170 Positions & JDs', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'org-chart', label: 'Org Leadership & Tree', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'recruitment', label: 'Recruitment & Appointments', icon: <Briefcase className="w-3.5 h-3.5" /> },
  ];

  if (mode === 'admin' && user) {
    tabs.push(
      { id: 'profiles', label: 'Staff Profiles & Discipline', icon: <Users className="w-3.5 h-3.5" /> },
      { id: 'departments', label: '15 Dept Workspaces', icon: <Building2 className="w-3.5 h-3.5" /> },
      { id: 'field-ops', label: '47 Counties & Intl Ops', icon: <MapPin className="w-3.5 h-3.5" /> },
      { id: 'performance', label: 'Performance & Reviews', icon: <Award className="w-3.5 h-3.5" /> },
      { id: 'comms-tasks', label: 'Comms & Tasks', icon: <MessageSquare className="w-3.5 h-3.5" /> },
      { id: 'hr-reports', label: '17 HR Reports', icon: <BarChart3 className="w-3.5 h-3.5" /> }
    );
  }

  return (
    <div className={mode === 'public' ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6' : 'space-y-6'}>
      {mode === 'public' && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#287A59]">
            HUMANITY CONNECT · National & International Organisational Establishment
          </div>
          <h2 className="text-2xl font-extrabold text-[#102E36]">
            Staff Establishment (170 Positions), Leadership Tree & Recruitment Portal
          </h2>
          <p className="text-xs text-[#4A636A]">
            Inspect all 170 approved positions across 15 departments, download official 20-point Job Descriptions,
            review organisational reporting lines, and apply securely to open vacancies.
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-[#EAE6DC]/70 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[40px] transition-colors ${
              activeTab === t.id ? 'bg-[#102E36] text-[#FAF9F6]' : 'text-[#102E36] hover:bg-[#FAF9F6]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-xs text-[#9F2D20]">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="hc-card p-8 text-center text-xs text-[#4A636A]">
          Loading Humanity Connect Organisational Establishment...
        </div>
      ) : (
        <>
          {(activeTab === 'directory' || activeTab === 'org-chart') && (
            <StaffDirectoryAndOrgChart
              activeSection={activeTab}
              directoryData={directoryData}
              revisions={revisions}
              mode={mode}
              canManageHr={canManageHr}
              isAuditor={isAuditor}
              onRefresh={loadDirectoryAndRevisions}
              onQuickPublishVacancy={(jobId) => {
                setPreselectVacancyJobId(jobId);
                setActiveTab('recruitment');
              }}
            />
          )}

          {(activeTab === 'recruitment' || activeTab === 'profiles') && (
            <RecruitmentAndProfilesPanel
              activeSection={activeTab}
              mode={mode}
              canManageHr={canManageHr}
              isAuditor={isAuditor}
              directoryPositions={directoryData?.positions || []}
              preselectJobId={preselectVacancyJobId}
              onRefreshDirectory={loadDirectoryAndRevisions}
              onNavigateAuth={onNavigateAuth}
            />
          )}

          {(activeTab === 'field-ops' || activeTab === 'departments') && mode === 'admin' && (
            <FieldAndDeptWorkspacesPanel
              activeSection={activeTab}
              canManageHr={canManageHr}
              isAuditor={isAuditor}
            />
          )}

          {(activeTab === 'performance' || activeTab === 'comms-tasks' || activeTab === 'hr-reports') &&
            mode === 'admin' && (
              <PerformanceCommsReportsPanel
                activeSection={activeTab}
                canManageHr={canManageHr}
                isAuditor={isAuditor}
              />
            )}
        </>
      )}
    </div>
  );
};
