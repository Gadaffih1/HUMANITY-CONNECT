import React, { useEffect, useState } from 'react';
import {
  MapPin,
  Globe,
  Building2,
  Lock,
  PlusCircle,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ExportReportBar, GlossyButton, ModalDialog } from '../ui/DesignSystem';
import { KENYAN_47_COUNTIES } from '../../types/domain';
import { ORGANISATIONAL_DEPARTMENTS } from '../../data/staffEstablishment';

interface FieldAndDeptWorkspacesPanelProps {
  activeSection: 'field-ops' | 'departments';
  canManageHr: boolean;
  isAuditor: boolean;
}

const FIELD_ROLES = [
  { code: 'COUNTY_COORDINATOR', label: 'County Coordinator' },
  { code: 'DEPUTY_COUNTY_COORDINATOR', label: 'Deputy County Coordinator' },
  { code: 'SUB_COUNTY_COORDINATOR', label: 'Sub-County Coordinator' },
  { code: 'WARD_FIELD_OFFICER', label: 'Ward Field Officer' },
  { code: 'COMMUNITY_OUTREACH_OFFICER', label: 'Community Outreach Officer' },
  { code: 'COMMUNITY_AMBASSADOR', label: 'Community Ambassador' },
  { code: 'VOLUNTEER_COORDINATOR', label: 'Volunteer Coordinator' },
  { code: 'FIELD_ASSESSMENT_OFFICER', label: 'Field Assessment Officer' },
];

const ADMIN_LEVELS = ['NATIONAL', 'COUNTY', 'SUB_COUNTY', 'WARD', 'COMMUNITY', 'INTERNATIONAL'] as const;

export const FieldAndDeptWorkspacesPanel: React.FC<FieldAndDeptWorkspacesPanelProps> = ({
  activeSection,
  canManageHr,
  isAuditor,
}) => {
  const { apiFetch, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Field Geography state
  const [fieldData, setFieldData] = useState<any>(null);
  const [selectedCounty, setSelectedCounty] = useState('Nairobi');
  const [countryMode, setCountryMode] = useState<'KE' | 'INTERNATIONAL'>('KE');
  const [intlCountryCode, setIntlCountryCode] = useState('UG');
  const [intlRegionName, setIntlRegionName] = useState('');
  const [offName, setOffName] = useState('');
  const [offRole, setOffRole] = useState('COUNTY_COORDINATOR');
  const [offLevel, setOffLevel] = useState<string>('COUNTY');
  const [offSubCounty, setOffSubCounty] = useState('');
  const [offWard, setOffWard] = useState('');
  const [offCommunity, setOffCommunity] = useState('');
  const [offSupervisor, setOffSupervisor] = useState('National Field & Operations Director (HC-FOP-037)');
  const [offDuties, setOffDuties] = useState('County coordination, household verification follow-ups, field reports');

  // Field activity log modal
  const [actTarget, setActTarget] = useState<any | null>(null);
  const [actTitle, setActTitle] = useState('');
  const [actLoc, setActLoc] = useState('');
  const [actOutcome, setActOutcome] = useState('');
  const [actReportSummary, setActReportSummary] = useState('');
  const [actFollowUpDelta, setActFollowUpDelta] = useState('1');

  // Departmental Workspace state
  const [selectedDept, setSelectedDept] = useState(2); // Default Dept 2 Verification
  const [deptWorkspace, setDeptWorkspace] = useState<any>(null);
  const [deptBlockedError, setDeptBlockedError] = useState<string | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemType, setItemType] = useState('DAILY_ACTIVITY');
  const [itemTitle, setItemTitle] = useState('');
  const [itemSummary, setItemSummary] = useState('');
  const [itemPriority, setItemPriority] = useState<'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [itemMetricVal, setItemMetricVal] = useState('');
  const [itemMetricTarget, setItemMetricTarget] = useState('');
  const [itemDueDate, setItemDueDate] = useState('');

  const loadFieldData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<any>('/api/staff/field-personnel');
      setFieldData(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDeptWorkspace = async (deptNum: number) => {
    setLoading(true);
    setDeptBlockedError(null);
    setErrorMsg(null);
    try {
      const ws = await apiFetch<any>(`/api/staff/departments/${deptNum}/workspace`);
      setDeptWorkspace(ws);
    } catch (err: any) {
      setDeptWorkspace(null);
      setDeptBlockedError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'field-ops') {
      loadFieldData();
    } else {
      loadDeptWorkspace(selectedDept);
    }
  }, [activeSection, selectedDept]);

  const canAppointField =
    canManageHr ||
    user?.roles.includes('COUNTY_REPRESENTATIVE') ||
    user?.permissions.includes('canManageCountyOps');

  const countyDash = (fieldData?.countyDashboards || []).find((d: any) => d.county === selectedCounty);

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

      {/* 1. NATIONAL, 47 COUNTIES & INTERNATIONAL FIELD MANAGEMENT */}
      {activeSection === 'field-ops' && (
        <div className="space-y-6">
          <div className="hc-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#102E36]">
                  National, 47-County, Sub-County, Ward & International Field Personnel Centre
                </h3>
                <p className="text-xs text-[#4A636A]">
                  Kenya Administrative Geography: National · County (All 47 Counties) · Sub-County · Ward · Community
                  + International Regional Expansion.
                </p>
              </div>
              <ExportReportBar
                title="Humanity Connect 47-County Field Dashboard"
                csvFilename="humanity-connect-47-county-dashboards.csv"
                rows={fieldData?.countyDashboards || []}
              />
            </div>

            {fieldData?.jurisdictionRestrictedTo && (
              <div className="p-3 rounded-xl bg-[#D9A84E]/15 border border-[#D9A84E]/40 text-xs text-[#102E36]">
                <Lock className="w-3.5 h-3.5 inline mr-1.5" />
                Jurisdiction Lock Active: Your view and field writes are scoped to{' '}
                <strong>{fieldData.jurisdictionRestrictedTo.join(', ')}</strong>.
              </div>
            )}

            {/* County Selector & Live County Dashboard Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-4 space-y-2 text-xs">
                <label className="block font-semibold text-[#102E36]">
                  Inspect Any of the 47 Kenyan Counties
                </label>
                <select
                  value={selectedCounty}
                  onChange={(e) => setSelectedCounty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#102E36]/15"
                >
                  {KENYAN_47_COUNTIES.map((c, idx) => (
                    <option key={c} value={c}>
                      {String(idx + 1).padStart(2, '0')}. {c} County
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {[
                  { label: 'Field & Staff', val: countyDash?.staffingCount ?? 0 },
                  { label: 'Activities Logged', val: countyDash?.activitiesCount ?? 0 },
                  { label: 'Verified (V4)', val: countyDash?.verifiedCasesCount ?? 0 },
                  { label: 'Total Cases', val: countyDash?.totalCasesCount ?? 0 },
                  { label: 'Volunteers', val: countyDash?.outreachVolunteersCount ?? 0 },
                  { label: 'Projects', val: countyDash?.communityProjectsCount ?? 0 },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-xl bg-white border border-[#102E36]/12">
                    <div className="text-[11px] text-[#4A636A]">{m.label}</div>
                    <div className="text-lg font-extrabold font-mono-num text-[#102E36]">{m.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Appoint Officer Form */}
          {canAppointField && !isAuditor && (
            <form
              className="hc-card p-5 space-y-3 text-xs"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErrorMsg(null);
                try {
                  await apiFetch('/api/staff/field-personnel', {
                    method: 'POST',
                    body: JSON.stringify({
                      fullName: offName,
                      fieldRole: offRole,
                      adminLevel: countryMode === 'INTERNATIONAL' ? 'INTERNATIONAL' : offLevel,
                      countryCode: countryMode === 'INTERNATIONAL' ? intlCountryCode : 'KE',
                      county: countryMode === 'INTERNATIONAL' ? intlRegionName : selectedCounty,
                      subCounty: offSubCounty || undefined,
                      ward: offWard || undefined,
                      communityUnit: offCommunity || undefined,
                      supervisorName: offSupervisor,
                      assignedDuties: offDuties
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }),
                  });
                  setOffName('');
                  await loadFieldData();
                  setFeedback('Field geography officer appointed with official ID and jurisdiction lock.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-[#102E36]">
                  <MapPin className="w-4 h-4 text-[#287A59]" />
                  Appoint Field Officer (8 Operational Roles)
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCountryMode('KE')}
                    className={`px-3 py-1.5 rounded-lg font-semibold ${
                      countryMode === 'KE' ? 'bg-[#102E36] text-[#FAF9F6]' : 'bg-white border border-[#102E36]/15'
                    }`}
                  >
                    Kenya (47 Counties)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountryMode('INTERNATIONAL')}
                    className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                      countryMode === 'INTERNATIONAL'
                        ? 'bg-[#102E36] text-[#FAF9F6]'
                        : 'bg-white border border-[#102E36]/15'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    International Expansion
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  value={offName}
                  onChange={(e) => setOffName(e.target.value)}
                  placeholder="Officer Full Name"
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
                <select
                  value={offRole}
                  onChange={(e) => setOffRole(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  {FIELD_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <select
                  value={offLevel}
                  onChange={(e) => setOffLevel(e.target.value)}
                  disabled={countryMode === 'INTERNATIONAL'}
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  {ADMIN_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      Level: {l.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                {countryMode === 'INTERNATIONAL' ? (
                  <div className="flex gap-2">
                    <input
                      value={intlCountryCode}
                      onChange={(e) => setIntlCountryCode(e.target.value.toUpperCase())}
                      placeholder="ISO (UG)"
                      className="w-20 px-2 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                    <input
                      required
                      value={intlRegionName}
                      onChange={(e) => setIntlRegionName(e.target.value)}
                      placeholder="International Region"
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                    />
                  </div>
                ) : (
                  <input
                    value={offSubCounty}
                    onChange={(e) => setOffSubCounty(e.target.value)}
                    placeholder={`Sub-County in ${selectedCounty}`}
                    className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={offWard}
                  onChange={(e) => setOffWard(e.target.value)}
                  placeholder="Ward Assignment"
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  value={offCommunity}
                  onChange={(e) => setOffCommunity(e.target.value)}
                  placeholder="Community / Village Unit"
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
                <input
                  required
                  value={offSupervisor}
                  onChange={(e) => setOffSupervisor(e.target.value)}
                  placeholder="Reporting Supervisor"
                  className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>

              <input
                required
                value={offDuties}
                onChange={(e) => setOffDuties(e.target.value)}
                placeholder="Assigned duties (comma-separated)..."
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
              <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
                Appoint Field Geography Officer
              </GlossyButton>
            </form>
          )}

          {/* Officers List + All 47 Counties Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 hc-card p-5 space-y-3">
              <h4 className="text-sm font-bold text-[#102E36]">
                Appointed Field Officers ({(fieldData?.officers || []).length})
              </h4>
              {(fieldData?.officers || []).length === 0 ? (
                <div className="text-xs text-[#4A636A] py-4">
                  No field geography officers appointed yet.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto text-xs">
                  {(fieldData?.officers || []).map((o: any) => (
                    <div key={o.id} className="p-3 rounded-xl bg-white border border-[#102E36]/12 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-num font-bold text-[#287A59]">{o.officialIdNumber}</span>
                        <span className="font-semibold text-[#102E36]">{o.adminLevel}</span>
                      </div>
                      <div className="font-bold text-sm text-[#102E36]">
                        {o.fullName} — {o.fieldRole.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[#4A636A]">
                        Jurisdiction: {o.countryCode} · {o.county}
                        {o.subCounty ? ` / ${o.subCounty}` : ''}
                        {o.ward ? ` / ${o.ward}` : ''} · Supervisor: {o.supervisorName}
                      </div>
                      <div className="text-[#4A636A] font-mono-num">
                        Follow-ups: {o.beneficiaryFollowUpCount} · Activities: {(o.activitiesJson || []).length} ·
                        Reports: {(o.fieldReportsJson || []).length}
                      </div>
                      {!isAuditor && (
                        <GlossyButton size="sm" variant="ivory" onClick={() => setActTarget(o)}>
                          Log Activity / Field Report
                        </GlossyButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 hc-card p-5 space-y-3">
              <h4 className="text-sm font-bold text-[#102E36]">
                All 47 Kenyan Counties Live Operational Matrix
              </h4>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#102E36]/15 text-[#4A636A] sticky top-0 bg-[#FAF9F6]">
                    <tr>
                      <th className="py-2 pr-2">County</th>
                      <th className="py-2 pr-2">Staff</th>
                      <th className="py-2 pr-2">Cases</th>
                      <th className="py-2 pr-2">Verified</th>
                      <th className="py-2">Volunteers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102E36]/10">
                    {(fieldData?.countyDashboards || []).map((row: any) => (
                      <tr
                        key={row.county}
                        onClick={() => setSelectedCounty(row.county)}
                        className={`cursor-pointer hover:bg-white ${
                          selectedCounty === row.county ? 'bg-[#287A59]/10 font-bold' : ''
                        }`}
                      >
                        <td className="py-2 pr-2 text-[#102E36]">{row.county}</td>
                        <td className="py-2 pr-2 font-mono-num">{row.staffingCount}</td>
                        <td className="py-2 pr-2 font-mono-num">{row.totalCasesCount}</td>
                        <td className="py-2 pr-2 font-mono-num text-[#287A59]">{row.verifiedCasesCount}</td>
                        <td className="py-2 font-mono-num">{row.outreachVolunteersCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. INDIVIDUAL DEPARTMENTAL WORKSPACES (ALL 15 DEPARTMENTS · ALL 14 PANELS) */}
      {activeSection === 'departments' && (
        <div className="space-y-6">
          <div className="hc-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#287A59]" />
                <div>
                  <h3 className="text-lg font-bold text-[#102E36]">
                    Departmental Workspaces (All 15 Departments · 14 Standard Sections)
                  </h3>
                  <p className="text-xs text-[#4A636A]">
                    Role-isolated departmental portals reflecting Verification, Social Welfare, County Operations,
                    Safeguarding, Finance, Empowerment, and 9 supporting departments.
                  </p>
                </div>
              </div>
              {deptWorkspace && !isAuditor && (
                <GlossyButton size="sm" variant="teal" onClick={() => setItemModalOpen(true)}>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Workspace Item
                </GlossyButton>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ORGANISATIONAL_DEPARTMENTS.map((d) => (
                <button
                  key={d.number}
                  type="button"
                  onClick={() => setSelectedDept(d.number)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selectedDept === d.number
                      ? 'bg-[#102E36] text-[#FAF9F6]'
                      : 'bg-white border border-[#102E36]/15 text-[#102E36] hover:bg-[#EAE6DC]/50'
                  }`}
                >
                  {d.number}. {d.name}
                </button>
              ))}
            </div>
          </div>

          {deptBlockedError ? (
            <div className="hc-card p-8 text-center space-y-2 border-[#9F2D20]/30">
              <Lock className="w-7 h-7 text-[#9F2D20] mx-auto" />
              <h4 className="text-base font-bold text-[#102E36]">Restricted Departmental Boundary</h4>
              <p className="text-xs text-[#4A636A] max-w-lg mx-auto">{deptBlockedError}</p>
            </div>
          ) : loading || !deptWorkspace ? (
            <div className="hc-card p-8 text-center text-xs text-[#4A636A]">Loading departmental workspace...</div>
          ) : (
            <div className="space-y-5 text-xs">
              {/* 1. Department Dashboard + Domain Focus */}
              <div className="hc-card p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-[#102E36]">
                    1. Department Dashboard — Dept {deptWorkspace.department.number}:{' '}
                    {deptWorkspace.department.name}
                  </h4>
                  <span className="font-semibold text-[#287A59]">
                    {deptWorkspace.domainOperationalSummary?.domainFocus}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { k: 'Approved Roles', v: deptWorkspace.dashboard.approvedPositions },
                    { k: 'Filled Roles', v: deptWorkspace.dashboard.filledPositions },
                    { k: 'Vacant Roles', v: deptWorkspace.dashboard.vacantPositions },
                    { k: 'Pending Tasks', v: deptWorkspace.dashboard.pendingTasksCount },
                    { k: 'Completed Tasks', v: deptWorkspace.dashboard.completedTasksCount },
                    { k: 'National Escalations', v: deptWorkspace.dashboard.nationalIssuesCount },
                  ].map((s) => (
                    <div key={s.k} className="p-3 rounded-xl bg-white border border-[#102E36]/12">
                      <div className="text-[#4A636A]">{s.k}</div>
                      <div className="text-lg font-extrabold font-mono-num text-[#102E36]">{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sections 2, 3, 4 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="hc-card p-4 space-y-2">
                  <h5 className="font-bold text-[#102E36]">2. Department Head Profile</h5>
                  {deptWorkspace.departmentHeadProfile ? (
                    <div className="text-[#4A636A] space-y-1">
                      <div className="font-bold text-[#102E36]">
                        {deptWorkspace.departmentHeadProfile.jobTitle} ({deptWorkspace.departmentHeadProfile.jobId})
                      </div>
                      <div>{deptWorkspace.departmentHeadProfile.jobDescription}</div>
                      <div>
                        Incumbent: {deptWorkspace.departmentHeadProfile.incumbentName || 'Position Currently Vacant'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#4A636A]">Not assigned.</div>
                  )}
                </div>

                <div className="hc-card p-4 space-y-2">
                  <h5 className="font-bold text-[#102E36]">
                    3. Departmental Staff Directory ({(deptWorkspace.staffDirectory || []).length} active profiles)
                  </h5>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {(deptWorkspace.staffDirectory || []).length === 0 ? (
                      <div className="text-[#4A636A]">
                        No staff appointed yet ({(deptWorkspace.departmentPositions || []).length} approved positions).
                      </div>
                    ) : (
                      deptWorkspace.staffDirectory.map((s: any) => (
                        <div key={s.id} className="p-2 rounded-lg bg-white border border-[#102E36]/10">
                          <strong>{s.fullLegalName}</strong> · {s.jobTitle} ({s.countyAssignment})
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="hc-card p-4 space-y-2">
                  <h5 className="font-bold text-[#102E36]">
                    4. Assigned Responsibilities ({(deptWorkspace.assignedResponsibilities || []).length})
                  </h5>
                  <div className="space-y-1 max-h-40 overflow-y-auto text-[#4A636A]">
                    {(deptWorkspace.assignedResponsibilities || []).slice(0, 12).map((r: any, i: number) => (
                      <div key={i}>
                        <strong className="font-mono-num text-[#102E36]">{r.jobId}:</strong> {r.responsibility}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sections 5 to 14 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { title: '5. Daily Activities', items: deptWorkspace.dailyActivities },
                  { title: '6. Pending Assignments', items: deptWorkspace.pendingAssignments },
                  { title: '7. Completed Assignments', items: deptWorkspace.completedAssignments },
                  { title: '8. Performance Reports', items: deptWorkspace.performanceReports },
                  { title: '9. Department Documents', items: deptWorkspace.departmentDocuments },
                  { title: '10. Internal Communications', items: deptWorkspace.internalCommunications },
                  { title: '11. Meetings & Schedules', items: deptWorkspace.meetingsAndSchedules },
                  { title: '12. Departmental Targets', items: deptWorkspace.departmentalTargets },
                  { title: '13. Monthly Reports', items: deptWorkspace.monthlyReports },
                  {
                    title: '14. Issues Requiring National Attention',
                    items: deptWorkspace.issuesRequiringNationalAttention,
                  },
                ].map((sec) => (
                  <div key={sec.title} className="hc-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-[#102E36]">{sec.title}</h5>
                      <span className="font-mono-num text-[#287A59] font-bold">
                        {(sec.items || []).length}
                      </span>
                    </div>
                    {(sec.items || []).length === 0 ? (
                      <div className="text-[#4A636A]">No records logged yet.</div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {sec.items.map((it: any) => (
                          <div key={it.id} className="p-2 rounded-lg bg-white border border-[#102E36]/10">
                            <div className="font-semibold text-[#102E36]">{it.title || it.reviewRef}</div>
                            <div className="text-[#4A636A] line-clamp-2">
                              {it.summary || it.body || it.description || it.objectivesSummary}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Field Officer Log Activity Modal */}
      <ModalDialog
        open={Boolean(actTarget)}
        title={actTarget ? `Field Activity & Report — ${actTarget.officialIdNumber}` : ''}
        onClose={() => setActTarget(null)}
      >
        {actTarget && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/staff/field-personnel/${actTarget.id}/activity`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    activityTitle: actTitle,
                    activityLocation: actLoc || actTarget.county,
                    activityOutcome: actOutcome,
                    reportSummary: actReportSummary || undefined,
                    followUpDelta: Number(actFollowUpDelta) || 0,
                  }),
                });
                setActTarget(null);
                setActTitle('');
                setActOutcome('');
                setActReportSummary('');
                await loadFieldData();
                setFeedback('Field activity and report saved under jurisdiction control.');
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              required
              value={actTitle}
              onChange={(e) => setActTitle(e.target.value)}
              placeholder="Field activity title"
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={actLoc}
                onChange={(e) => setActLoc(e.target.value)}
                placeholder={`Location in ${actTarget.county}`}
                className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
              <input
                type="number"
                min={0}
                value={actFollowUpDelta}
                onChange={(e) => setActFollowUpDelta(e.target.value)}
                placeholder="Beneficiary follow-ups"
                className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <input
              required
              value={actOutcome}
              onChange={(e) => setActOutcome(e.target.value)}
              placeholder="Verified activity outcome"
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            <textarea
              rows={2}
              value={actReportSummary}
              onChange={(e) => setActReportSummary(e.target.value)}
              placeholder="Field report summary (optional)..."
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton type="submit" size="sm" variant="teal" disabled={busy}>
              Save Field Record
            </GlossyButton>
          </form>
        )}
      </ModalDialog>

      {/* Add Departmental Workspace Item Modal */}
      <ModalDialog
        open={itemModalOpen}
        title={`Add Item — Dept ${selectedDept}`}
        subtitle="Departmental communications are automatically screened to block beneficiary PII or safeguarding leaks."
        onClose={() => setItemModalOpen(false)}
      >
        <form
          className="space-y-3 text-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErrorMsg(null);
            try {
              await apiFetch(`/api/staff/departments/${selectedDept}/workspace/items`, {
                method: 'POST',
                body: JSON.stringify({
                  itemType,
                  title: itemTitle,
                  summary: itemSummary,
                  priority: itemPriority,
                  metricValue: itemMetricVal || undefined,
                  metricTarget: itemMetricTarget || undefined,
                  dueDate: itemDueDate || undefined,
                }),
              });
              setItemModalOpen(false);
              setItemTitle('');
              setItemSummary('');
              await loadDeptWorkspace(selectedDept);
              setFeedback('Departmental workspace item added.');
            } catch (err: any) {
              setErrorMsg(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="DAILY_ACTIVITY">Daily Activity</option>
              <option value="ASSIGNMENT">Assignment</option>
              <option value="PERFORMANCE_REPORT">Performance Report</option>
              <option value="DOCUMENT">Department Document</option>
              <option value="COMMUNICATION">Internal Communication</option>
              <option value="MEETING">Meeting & Schedule</option>
              <option value="TARGET">Departmental Target</option>
              <option value="MONTHLY_REPORT">Monthly Report</option>
              <option value="NATIONAL_ISSUE">Issue Requiring National Attention</option>
            </select>
            <select
              value={itemPriority}
              onChange={(e) => setItemPriority(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="NORMAL">Normal Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="CRITICAL">Critical Priority</option>
            </select>
          </div>
          <input
            required
            minLength={3}
            value={itemTitle}
            onChange={(e) => setItemTitle(e.target.value)}
            placeholder="Item title..."
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
          />
          <textarea
            required
            minLength={5}
            rows={3}
            value={itemSummary}
            onChange={(e) => setItemSummary(e.target.value)}
            placeholder="Operational details / summary..."
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={itemMetricVal}
              onChange={(e) => setItemMetricVal(e.target.value)}
              placeholder="Metric Value"
              className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            <input
              value={itemMetricTarget}
              onChange={(e) => setItemMetricTarget(e.target.value)}
              placeholder="Target"
              className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
            <input
              type="date"
              value={itemDueDate}
              onChange={(e) => setItemDueDate(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div className="flex justify-end gap-2">
            <GlossyButton type="button" variant="ivory" onClick={() => setItemModalOpen(false)}>
              Cancel
            </GlossyButton>
            <GlossyButton type="submit" variant="teal" disabled={busy}>
              <ClipboardList className="w-3.5 h-3.5" />
              Save to Workspace
            </GlossyButton>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
