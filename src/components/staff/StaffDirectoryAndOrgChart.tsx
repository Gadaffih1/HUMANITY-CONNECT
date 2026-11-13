import React, { useMemo, useState } from 'react';
import {
  FileText,
  Download,
  GitBranch,
  Search,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  UserCheck,
  Edit3,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ExportReportBar, GlossyButton, ModalDialog } from '../ui/DesignSystem';

interface StaffDirectoryAndOrgChartProps {
  activeSection: 'directory' | 'org-chart';
  directoryData: any;
  revisions: any[];
  mode: 'public' | 'admin';
  canManageHr: boolean;
  isAuditor: boolean;
  onRefresh: () => Promise<void>;
  onQuickPublishVacancy?: (jobId: string) => void;
}

const LEVEL_ORDER: Record<string, number> = {
  BOARD_CHAIR: 1,
  BOARD: 2,
  CEO: 3,
  DEPUTY_CEO: 4,
  NATIONAL_DIRECTOR: 5,
  DEPARTMENT_HEAD: 6,
  MANAGER: 7,
  COORDINATOR: 8,
  OFFICER: 9,
  ASSISTANT: 10,
  VOLUNTEER: 11,
};

export const StaffDirectoryAndOrgChart: React.FC<StaffDirectoryAndOrgChartProps> = ({
  activeSection,
  directoryData,
  revisions,
  mode,
  canManageHr,
  isAuditor,
  onRefresh,
  onQuickPublishVacancy,
}) => {
  const { apiFetch, user } = useAuth();
  const [searchQ, setSearchQ] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<'id_asc' | 'title_asc' | 'title_desc'>('id_asc');

  const [selectedPos, setSelectedPos] = useState<any | null>(null);
  const [revModalOpen, setRevModalOpen] = useState(false);
  const [revJobDesc, setRevJobDesc] = useState('');
  const [revQuals, setRevQuals] = useState('');
  const [revProfQuals, setRevProfQuals] = useState('');
  const [revNote, setRevNote] = useState('');

  const [leadModalPos, setLeadModalPos] = useState<any | null>(null);
  const [leadReportsTo, setLeadReportsTo] = useState('');
  const [leadJurisdiction, setLeadJurisdiction] = useState('');
  const [leadActingName, setLeadActingName] = useState('');
  const [leadVacancyStatus, setLeadVacancyStatus] = useState('VACANT');
  const [leadReason, setLeadReason] = useState('');

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'HC-IOG-161': true,
    'HC-NLA-001': true,
    'HC-NLA-002': true,
  });

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const positions: any[] = directoryData?.positions || [];
  const allHierarchyNodes: any[] = directoryData?.allHierarchyNodes || [];
  const departments: any[] = directoryData?.departments || [];
  const understaffedDepartments: any[] = directoryData?.understaffedDepartments || [];
  const stats = directoryData?.stats || {};

  const filteredPositions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return [...positions]
      .filter((p) => {
        if (deptFilter !== 'ALL' && p.departmentNumber !== Number(deptFilter)) return false;
        if (statusFilter !== 'ALL' && p.vacancyStatus !== statusFilter) return false;
        if (q) {
          const hay =
            `${p.jobId} ${p.jobTitle} ${p.department} ${p.geographicalJurisdiction} ${p.requiredQualifications} ${p.professionalQualifications}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'title_asc') return a.jobTitle.localeCompare(b.jobTitle);
        if (sortMode === 'title_desc') return b.jobTitle.localeCompare(a.jobTitle);
        return a.jobId.localeCompare(b.jobId);
      });
  }, [positions, deptFilter, statusFilter, searchQ, sortMode]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const node of allHierarchyNodes) {
      const parentKey = node.reportsToJobId || '__ROOT__';
      const arr = map.get(parentKey) || [];
      arr.push(node);
      map.set(parentKey, arr);
    }
    for (const [, arr] of map.entries()) {
      arr.sort((a, b) => (LEVEL_ORDER[a.hierarchyLevel] || 99) - (LEVEL_ORDER[b.hierarchyLevel] || 99));
    }
    return map;
  }, [allHierarchyNodes]);

  const rootNodes = useMemo(
    () => allHierarchyNodes.filter((n) => !n.reportsToJobId),
    [allHierarchyNodes]
  );

  const openJdModal = (pos: any) => {
    const full = positions.find((p) => p.jobId === pos.jobId) || pos;
    setSelectedPos(full);
  };

  const openProposeRevision = (pos: any) => {
    setRevJobDesc(pos.jobDescription || '');
    setRevQuals(pos.requiredQualifications || '');
    setRevProfQuals(pos.professionalQualifications || '');
    setRevNote('');
    setSelectedPos(pos);
    setRevModalOpen(true);
  };

  const openLeadershipModal = (pos: any) => {
    const full = positions.find((p) => p.jobId === pos.jobId) || pos;
    setLeadModalPos(full);
    setLeadReportsTo(full.reportsToJobId || '');
    setLeadJurisdiction(full.geographicalJurisdiction || '');
    setLeadActingName(full.actingOfficerName || '');
    setLeadVacancyStatus(full.vacancyStatus || 'VACANT');
    setLeadReason('');
  };

  const renderTreeBranch = (node: any, depth = 0): React.ReactNode => {
    const children = childrenMap.get(node.jobId) || [];
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedNodes[node.jobId]);

    return (
      <div key={node.jobId} className="space-y-1.5">
        <div
          className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border text-xs transition-colors ${
            node.independentOversight
              ? 'bg-[#D9A84E]/10 border-[#D9A84E]/50'
              : 'bg-white border-[#102E36]/12 hover:border-[#287A59]/40'
          }`}
          style={{ marginLeft: `${Math.min(depth, 5) * 20}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() =>
                  setExpandedNodes((prev) => ({ ...prev, [node.jobId]: !prev[node.jobId] }))
                }
                aria-label={`Toggle reports under ${node.jobId}`}
                className="w-6 h-6 rounded-lg bg-[#F4F2EC] border border-[#102E36]/15 flex items-center justify-center shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-6 h-6 inline-flex items-center justify-center text-[#4A636A] shrink-0">·</span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono-num font-bold text-[#102E36]">{node.jobId}</span>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-[#102E36]">{node.jobTitle}</span>
                {node.independentOversight && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[#9F2D20]">Independent Board Oversight</span>
                  </>
                )}
              </div>
              <div className="text-[#4A636A] mt-0.5">
                Dept {node.departmentNumber}: {node.department} · {node.hierarchyLevel.replace(/_/g, ' ')} ·{' '}
                {node.geographicalJurisdiction} · Status:{' '}
                <strong className={node.vacancyStatus === 'FILLED' ? 'text-[#287A59]' : 'text-[#B6721A]'}>
                  {node.vacancyStatus}
                </strong>
                {node.incumbentName ? ` (${node.incumbentName})` : ''}
                {node.actingOfficerName ? ` · Acting: ${node.actingOfficerName}` : ''}
                {hasChildren ? ` · ${children.length} direct report${children.length === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <GlossyButton size="sm" variant="ivory" onClick={() => openJdModal(node)}>
              View 20-Pt JD
            </GlossyButton>
            {mode === 'admin' && canManageHr && !isAuditor && (
              <GlossyButton size="sm" variant="teal" onClick={() => openLeadershipModal(node)}>
                Supervisor / Acting
              </GlossyButton>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1.5">
            {children.map((child) => renderTreeBranch(child, depth + 1))}
          </div>
        )}
      </div>
    );
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

      {/* Top Honest Establishment Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Approved Positions', value: stats.totalApproved ?? 0, tone: 'text-[#102E36]' },
          { label: 'Departments', value: stats.departmentsCount ?? 15, tone: 'text-[#102E36]' },
          { label: 'Filled Positions', value: stats.filledCount ?? 0, tone: 'text-[#287A59]' },
          { label: 'Acting Appointments', value: stats.actingCount ?? 0, tone: 'text-[#B6721A]' },
          { label: 'Actively Recruiting', value: stats.recruitingCount ?? 0, tone: 'text-[#102E36]' },
          { label: 'Vacant Positions', value: stats.vacantCount ?? 0, tone: 'text-[#9F2D20]' },
        ].map((kpi) => (
          <div key={kpi.label} className="hc-card p-4">
            <div className="text-[11px] font-medium text-[#4A636A]">{kpi.label}</div>
            <div className={`text-2xl font-extrabold font-mono-num mt-1 ${kpi.tone}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {activeSection === 'directory' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="hc-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#102E36]">
                  170-Position National & International Staff Establishment Directory
                </h3>
                <p className="text-xs text-[#4A636A]">
                  Every approved role carries distinct 20-point Job Descriptions, Kenyan statutory qualifications,
                  and downloadable official specifications (.html / .txt).
                </p>
              </div>
              <ExportReportBar
                title="Humanity Connect 170 Staff Positions Establishment"
                csvFilename="humanity-connect-170-positions.csv"
                rows={filteredPositions.map((p) => ({
                  jobId: p.jobId,
                  jobTitle: p.jobTitle,
                  departmentNumber: p.departmentNumber,
                  department: p.department,
                  hierarchyLevel: p.hierarchyLevel,
                  reportsToJobId: p.reportsToJobId || 'BOARD',
                  geographicalJurisdiction: p.geographicalJurisdiction,
                  vacancyStatus: p.vacancyStatus,
                  requiredQualifications: p.requiredQualifications,
                  professionalQualifications: p.professionalQualifications,
                }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#4A636A] absolute left-3 top-3" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search ID, title, degree, ICPAK, county..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-2.5 text-xs rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ALL">All 15 Departments ({positions.length} Positions)</option>
                {departments.map((d) => (
                  <option key={d.number} value={String(d.number)}>
                    Dept {d.number}: {d.name} ({d.approvedPositions})
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 text-xs rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ALL">All Establishment Statuses</option>
                <option value="VACANT">Vacant</option>
                <option value="RECRUITING">Recruiting</option>
                <option value="ACTING">Acting Covered</option>
                <option value="FILLED">Filled</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className="px-3 py-2.5 text-xs rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="id_asc">Sort by Job ID (A–Z)</option>
                <option value="title_asc">Sort by Job Title (A–Z)</option>
                <option value="title_desc">Sort by Job Title (Z–A)</option>
              </select>
            </div>
          </div>

          {/* HR Two-Person JD Revisions Queue */}
          {mode === 'admin' && revisions.length > 0 && (
            <div className="hc-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#287A59]" />
                <h4 className="text-sm font-bold text-[#102E36]">
                  Two-Person JD Revision Governance Queue ({revisions.length})
                </h4>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {revisions.map((rev) => {
                  const isSelf = rev.proposedBy === user?.id;
                  return (
                    <div
                      key={rev.id}
                      className="p-3 rounded-xl bg-white border border-[#102E36]/12 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-mono-num font-bold text-[#102E36]">{rev.jobId}</span> ·{' '}
                        <span className="font-semibold text-[#287A59]">{rev.status}</span> ·{' '}
                        <span className="text-[#4A636A]">{rev.revisionNote}</span>
                      </div>
                      {rev.status === 'PENDING_APPROVAL' && canManageHr && !isAuditor && (
                        <div className="flex items-center gap-2">
                          {isSelf ? (
                            <span className="text-[11px] font-semibold text-[#9F2D20]">
                              Awaiting Second Reviewer (You proposed this revision)
                            </span>
                          ) : (
                            <>
                              <GlossyButton
                                size="sm"
                                variant="green"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  setErrorMsg(null);
                                  try {
                                    await apiFetch(`/api/staff/revisions/${rev.id}/decide`, {
                                      method: 'POST',
                                      body: JSON.stringify({ decision: 'APPROVED' }),
                                    });
                                    await onRefresh();
                                    setFeedback(`Revision for ${rev.jobId} approved with independent sign-off.`);
                                  } catch (err: any) {
                                    setErrorMsg(err.message);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Approve Revision
                              </GlossyButton>
                              <GlossyButton
                                size="sm"
                                variant="ivory"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  setErrorMsg(null);
                                  try {
                                    await apiFetch(`/api/staff/revisions/${rev.id}/decide`, {
                                      method: 'POST',
                                      body: JSON.stringify({ decision: 'REJECTED' }),
                                    });
                                    await onRefresh();
                                    setFeedback(`Revision for ${rev.jobId} rejected.`);
                                  } catch (err: any) {
                                    setErrorMsg(err.message);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Reject
                              </GlossyButton>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Positions Table */}
          <div className="hc-card p-5 space-y-3">
            <div className="text-xs font-semibold text-[#4A636A]">
              Showing <span className="font-mono-num text-[#102E36]">{filteredPositions.length}</span> of{' '}
              <span className="font-mono-num text-[#102E36]">{positions.length}</span> approved positions
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                  <tr>
                    <th className="py-2.5 pr-3">Job ID</th>
                    <th className="py-2.5 pr-3">Position Title</th>
                    <th className="py-2.5 pr-3">Department</th>
                    <th className="py-2.5 pr-3">Reports To</th>
                    <th className="py-2.5 pr-3">Jurisdiction</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102E36]/10">
                  {filteredPositions.map((pos) => (
                    <tr key={pos.jobId} className="hover:bg-[#FAF9F6]">
                      <td className="py-3 pr-3 font-mono-num font-bold text-[#102E36] whitespace-nowrap">
                        {pos.jobId}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-bold text-[#102E36]">{pos.jobTitle}</div>
                        <div className="text-[11px] text-[#4A636A] line-clamp-1">{pos.requiredQualifications}</div>
                      </td>
                      <td className="py-3 pr-3 text-[#4A636A]">
                        Dept {pos.departmentNumber} · {pos.department}
                      </td>
                      <td className="py-3 pr-3 font-mono-num text-[#4A636A]">
                        {pos.reportsToJobId || 'Board Chair'}
                      </td>
                      <td className="py-3 pr-3 text-[#4A636A]">{pos.geographicalJurisdiction}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            pos.vacancyStatus === 'FILLED'
                              ? 'text-[#287A59]'
                              : pos.vacancyStatus === 'RECRUITING'
                                ? 'text-[#102E36]'
                                : 'text-[#B6721A]'
                          }`}
                        >
                          {pos.vacancyStatus}
                        </span>
                        {pos.incumbentName && (
                          <div className="text-[11px] text-[#4A636A]">{pos.incumbentName}</div>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <GlossyButton size="sm" variant="ivory" onClick={() => openJdModal(pos)}>
                            <FileText className="w-3.5 h-3.5" />
                            20-Pt JD
                          </GlossyButton>
                          <a
                            href={`/api/staff/positions/${pos.jobId}/download?format=html`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl border border-[#102E36]/15 bg-white text-[11px] font-semibold text-[#102E36] hover:bg-[#EAE6DC]/60"
                          >
                            <Download className="w-3.5 h-3.5" />
                            .HTML
                          </a>
                          {mode === 'admin' && canManageHr && !isAuditor && onQuickPublishVacancy && (
                            <GlossyButton
                              size="sm"
                              variant="gold"
                              onClick={() => onQuickPublishVacancy(pos.jobId)}
                            >
                              <Briefcase className="w-3.5 h-3.5" />
                              Vacancy
                            </GlossyButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Organisational Leadership & Expandable Hierarchy Centre */}
      {activeSection === 'org-chart' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 hc-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-[#287A59]" />
                  <div>
                    <h3 className="text-lg font-bold text-[#102E36]">
                      Expandable Organisational Reporting Hierarchy (All 170 Positions)
                    </h3>
                    <p className="text-xs text-[#4A636A]">
                      Includes highlighted Independent Safeguarding & Internal Audit lines reporting directly to the
                      Board of Trustees.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <GlossyButton
                    size="sm"
                    variant="ivory"
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      for (const n of allHierarchyNodes) all[n.jobId] = true;
                      setExpandedNodes(all);
                    }}
                  >
                    Expand All
                  </GlossyButton>
                  <GlossyButton
                    size="sm"
                    variant="ivory"
                    onClick={() => setExpandedNodes({ 'HC-IOG-161': true, 'HC-NLA-001': true })}
                  >
                    Collapse
                  </GlossyButton>
                </div>
              </div>

              <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {rootNodes.map((root) => renderTreeBranch(root, 0))}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              <div className="hc-card p-5 space-y-3 border-[#D9A84E]/60">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#9F2D20]" />
                  <h4 className="text-sm font-bold text-[#102E36]">Independent Oversight Partition</h4>
                </div>
                <p className="text-xs text-[#4A636A] leading-relaxed">
                  Internal Audit (Dept 14) and Safeguarding Protection (Dept 5) maintain direct escalation authority to
                  the Board Chair (`HC-IOG-161`) so executive or HR officers can never suppress investigations or erase
                  audit trails.
                </p>
              </div>

              <div className="hc-card p-5 space-y-3">
                <h4 className="text-sm font-bold text-[#102E36]">
                  Understaffed Departments ({understaffedDepartments.length})
                </h4>
                <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
                  {understaffedDepartments.map((d) => (
                    <div key={d.number} className="p-3 rounded-xl bg-white border border-[#102E36]/12">
                      <div className="font-bold text-[#102E36]">
                        Dept {d.number}: {d.name}
                      </div>
                      <div className="text-[#4A636A] font-mono-num mt-0.5">
                        {d.filledPositions} filled / {d.approvedPositions} approved ({d.fillRatePct}% fill ·{' '}
                        {d.vacantPositions} vacant)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 20-Point Job Description Detail Modal */}
      <ModalDialog
        open={Boolean(selectedPos && !revModalOpen)}
        title={selectedPos ? `${selectedPos.jobId} — ${selectedPos.jobTitle}` : ''}
        subtitle={
          selectedPos
            ? `Dept ${selectedPos.departmentNumber}: ${selectedPos.department} · Revision v${selectedPos.revisionVersion} (${selectedPos.revisionStatus})`
            : undefined
        }
        onClose={() => setSelectedPos(null)}
      >
        {selectedPos && (
          <div className="space-y-4 text-xs text-[#102E36]">
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/staff/positions/${selectedPos.jobId}/download?format=html`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#102E36] text-[#FAF9F6] font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Download Printable JD (.HTML)
              </a>
              <a
                href={`/api/staff/positions/${selectedPos.jobId}/download?format=txt`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#102E36]/20 bg-white text-[#102E36] font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Download Plain Text (.TXT)
              </a>
              {mode === 'admin' && canManageHr && !isAuditor && (
                <GlossyButton size="sm" variant="gold" onClick={() => openProposeRevision(selectedPos)}>
                  <Edit3 className="w-3.5 h-3.5" /> Propose JD Revision
                </GlossyButton>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12 space-y-1">
              <div className="font-bold text-[#287A59]">4. Official Job Description</div>
              <p className="text-[#4A636A] leading-relaxed">{selectedPos.jobDescription}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
                <div className="font-bold">16. Reporting Officer</div>
                <div className="text-[#4A636A] mt-0.5">{selectedPos.reportingOfficer}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
                <div className="font-bold">17. Supervisory Scope</div>
                <div className="text-[#4A636A] mt-0.5">{selectedPos.supervisoryResponsibilities}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
                <div className="font-bold">18. Geographical Jurisdiction</div>
                <div className="text-[#4A636A] mt-0.5">{selectedPos.geographicalJurisdiction}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12">
                <div className="font-bold">19. Employment Status</div>
                <div className="text-[#4A636A] mt-0.5">{selectedPos.employmentStatus}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12 space-y-2">
              <div className="font-bold">5. Main Responsibilities</div>
              <ul className="list-disc pl-5 text-[#4A636A] space-y-1">
                {(selectedPos.mainResponsibilities || []).map((item: string, idx: number) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#102E36]/10">
                <div>
                  <div className="font-bold">6. Daily Duties</div>
                  <ul className="list-disc pl-4 text-[#4A636A]">
                    {(selectedPos.dailyResponsibilities || []).map((d: string, i: number) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-bold">7. Weekly Duties</div>
                  <ul className="list-disc pl-4 text-[#4A636A]">
                    {(selectedPos.weeklyResponsibilities || []).map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-bold">8. Monthly Duties</div>
                  <ul className="list-disc pl-4 text-[#4A636A]">
                    {(selectedPos.monthlyResponsibilities || []).map((m: string, i: number) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/12 space-y-1.5">
              <div>
                <strong>9. Academic Qualifications:</strong> {selectedPos.requiredQualifications}
              </div>
              <div>
                <strong>10. Professional Licence / Membership:</strong> {selectedPos.professionalQualifications}
              </div>
              <div>
                <strong>11. Required Experience:</strong> {selectedPos.requiredExperience}
              </div>
              <div>
                <strong>12. Professional Skills:</strong> {(selectedPos.professionalSkills || []).join(' · ')}
              </div>
              <div>
                <strong>13. Communication Skills:</strong> {(selectedPos.communicationSkills || []).join(' · ')}
              </div>
              <div>
                <strong>14. Ethical Requirements:</strong> {selectedPos.ethicalRequirements}
              </div>
              <div>
                <strong>15. Safeguarding Responsibilities:</strong> {selectedPos.safeguardingResponsibilities}
              </div>
              <div>
                <strong>20a. Working Conditions:</strong> {selectedPos.workingConditions}
              </div>
              <div>
                <strong>20b. Continuing Professional Development:</strong> {selectedPos.professionalDevelopment}
              </div>
              <div>
                <strong>20c. Performance Expectations:</strong> {selectedPos.performanceExpectations}
              </div>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* HR Propose JD Revision Modal */}
      <ModalDialog
        open={revModalOpen && Boolean(selectedPos)}
        title={`Propose JD Revision — ${selectedPos?.jobId || ''}`}
        subtitle="Two-person control enforced: another authorised HR Officer or Super Admin must approve before taking effect."
        onClose={() => setRevModalOpen(false)}
      >
        <form
          className="space-y-3 text-xs"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedPos) return;
            setBusy(true);
            setErrorMsg(null);
            try {
              await apiFetch(`/api/staff/positions/${selectedPos.jobId}/revisions`, {
                method: 'POST',
                body: JSON.stringify({
                  jobDescription: revJobDesc,
                  requiredQualifications: revQuals,
                  professionalQualifications: revProfQuals,
                  revisionNote: revNote,
                }),
              });
              setRevModalOpen(false);
              setSelectedPos(null);
              await onRefresh();
              setFeedback(`JD revision for ${selectedPos.jobId} submitted for independent second-person approval.`);
            } catch (err: any) {
              setErrorMsg(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="block font-semibold mb-1">Proposed Job Description</label>
            <textarea
              rows={3}
              required
              value={revJobDesc}
              onChange={(e) => setRevJobDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Academic Qualifications</label>
            <input
              required
              value={revQuals}
              onChange={(e) => setRevQuals(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Professional Licence / Certifications</label>
            <input
              required
              value={revProfQuals}
              onChange={(e) => setRevProfQuals(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Mandatory Revision Rationale (min 5 chars)</label>
            <input
              required
              minLength={5}
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
              placeholder="Explain governance or operational reason for this update..."
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <GlossyButton type="button" variant="ivory" onClick={() => setRevModalOpen(false)}>
              Cancel
            </GlossyButton>
            <GlossyButton type="submit" variant="teal" disabled={busy}>
              Submit for Two-Person Sign-Off
            </GlossyButton>
          </div>
        </form>
      </ModalDialog>

      {/* Organisational Leadership Reassignment / Acting Officer Modal */}
      <ModalDialog
        open={Boolean(leadModalPos)}
        title={`Leadership & Reporting — ${leadModalPos?.jobId || ''}`}
        subtitle="Supervisor reassignment includes circular-hierarchy validation; self-appointment is blocked."
        onClose={() => setLeadModalPos(null)}
      >
        {leadModalPos && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErrorMsg(null);
              try {
                await apiFetch(`/api/staff/positions/${leadModalPos.jobId}/leadership`, {
                  method: 'POST',
                  body: JSON.stringify({
                    reportsToJobId: leadReportsTo || null,
                    geographicalJurisdiction: leadJurisdiction,
                    actingOfficerName: leadActingName.trim() ? leadActingName.trim() : null,
                    vacancyStatus: leadVacancyStatus,
                    reason: leadReason,
                  }),
                });
                setLeadModalPos(null);
                await onRefresh();
                setFeedback(`Updated reporting / acting assignment for ${leadModalPos.jobId}.`);
              } catch (err: any) {
                setErrorMsg(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label className="block font-semibold mb-1">Reports To Supervisor Job ID</label>
              <select
                value={leadReportsTo}
                onChange={(e) => setLeadReportsTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="">Top-Level Board Accountability (No Parent Job ID)</option>
                {allHierarchyNodes
                  .filter((n) => n.jobId !== leadModalPos.jobId)
                  .map((n) => (
                    <option key={n.jobId} value={n.jobId}>
                      {n.jobId} — {n.jobTitle} ({n.department})
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Geographical Jurisdiction</label>
                <input
                  required
                  value={leadJurisdiction}
                  onChange={(e) => setLeadJurisdiction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Position Status</label>
                <select
                  value={leadVacancyStatus}
                  onChange={(e) => setLeadVacancyStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="VACANT">VACANT</option>
                  <option value="RECRUITING">RECRUITING</option>
                  <option value="ACTING">ACTING</option>
                  <option value="FILLED">FILLED</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Acting Officer Full Name (if interim cover)</label>
              <input
                value={leadActingName}
                onChange={(e) => setLeadActingName(e.target.value)}
                placeholder="Leave blank if vacant or substantively filled"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Documented Governance Reason (min 5 chars)</label>
              <input
                required
                minLength={5}
                value={leadReason}
                onChange={(e) => setLeadReason(e.target.value)}
                placeholder="e.g. Board minute HC/BOD/2026-04 interim supervision assignment"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <GlossyButton type="button" variant="ivory" onClick={() => setLeadModalPos(null)}>
                Cancel
              </GlossyButton>
              <GlossyButton type="submit" variant="teal" disabled={busy}>
                <UserCheck className="w-3.5 h-3.5" />
                Save Leadership Update
              </GlossyButton>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
