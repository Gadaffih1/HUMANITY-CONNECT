import React, { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  Landmark,
  HeartHandshake,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  GlossyButton,
  SponsorshipCard,
  ExportReportBar,
  ModalDialog,
  formatMoney,
  type PublicBeneficiaryCardData,
} from '../ui/DesignSystem';

type CorporateTab =
  | 'dashboard'
  | 'organisation'
  | 'csr-programmes'
  | 'bulk-sponsor'
  | 'statements'
  | 'impact';

export const CorporatePortal: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [tab, setTab] = useState<CorporateTab>('dashboard');
  const [overview, setOverview] = useState<any>(null);
  const [publicCases, setPublicCases] = useState<PublicBeneficiaryCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Organisation registration form
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<
    'CORPORATE' | 'CHARITY' | 'HUMANITARIAN_NGO' | 'FOUNDATION' | 'RELIGIOUS_COMMUNITY' | 'PHILANTHROPIST'
  >('CORPORATE');
  const [regNumber, setRegNumber] = useState('');
  const [orgCounty, setOrgCounty] = useState('Nairobi');
  const [orgEmail, setOrgEmail] = useState(user?.email || '');

  // CSR Budget / Fund Programme form
  const [fundName, setFundName] = useState('');
  const [fundType, setFundType] = useState<'CSR_POOL' | 'EDUCATION' | 'CENTRAL_RELIEF' | 'EMPOWERMENT' | 'MEDICAL'>('CSR_POOL');
  const [fundDesc, setFundDesc] = useState('');

  // Community Campaign creation form
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignCounty, setCampaignCounty] = useState('Nairobi');
  const [campaignFundId, setCampaignFundId] = useState('');
  const [campaignTargetKes, setCampaignTargetKes] = useState('250000');
  const [campaignBeneficiaries, setCampaignBeneficiaries] = useState('45');
  const [campaignSummary, setCampaignSummary] = useState('');

  // Bulk multi-beneficiary sponsorship state
  const [selectedBeneficiaryIds, setSelectedBeneficiaryIds] = useState<string[]>([]);
  const [bulkMonthlyKes, setBulkMonthlyKes] = useState('6000');
  const [bulkMode, setBulkMode] = useState<'MPESA_STK' | 'PLEDGE_ONLY'>('PLEDGE_ONLY');

  // Direct Fund M-Pesa / Pledge modal
  const [fundCheckout, setFundCheckout] = useState<{ id: string; name: string } | null>(null);
  const [fundAmountKes, setFundAmountKes] = useState('50000');
  const [fundPayMode, setFundPayMode] = useState<'MPESA_STK' | 'PLEDGE_ONLY'>('MPESA_STK');
  const [fundPhone, setFundPhone] = useState(user?.phoneE164 || '+254712345678');
  const [pendingStk, setPendingStk] = useState<{ checkoutRequestId: string; amountMinor: number } | null>(null);

  // AI Impact brief
  const [impactBrief, setImpactBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [ov, ben] = await Promise.all([
        apiFetch<any>('/api/corporate/overview'),
        fetch('/api/public/beneficiaries').then((r) => r.json()),
      ]);
      setOverview(ov);
      setPublicCases(ben.beneficiaries || []);
      if (ov?.centralFunds?.[0] && !campaignFundId) {
        setCampaignFundId(ov.centralFunds[0].id);
      }
      if (ov?.organisation) {
        setOrgName(ov.organisation.name);
        setOrgType(ov.organisation.orgType);
        setOrgCounty(ov.organisation.county);
        setOrgEmail(ov.organisation.contactEmail);
        setRegNumber(ov.organisation.registrationNumber || '');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const donations = overview?.donations || [];
  const confirmedDonations = donations.filter((d: any) => d.status === 'CONFIRMED');
  const pledgedDonations = donations.filter((d: any) => d.status === 'PLEDGED');

  const settledTotalMinor = confirmedDonations.reduce((acc: number, d: any) => acc + d.amountMinor, 0);
  const pledgedTotalMinor = pledgedDonations.reduce((acc: number, d: any) => acc + d.amountMinor, 0);

  const toggleBeneficiarySelection = (id: string) => {
    setSelectedBeneficiaryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="hc-card p-10 text-center text-sm text-[#4A636A]">
          Loading Well Wisher & Corporate Giving Portal...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#287A59]">
            Well Wisher & Corporate Giving Portal · Private Organisational Accounting
          </div>
          <h2 className="text-2xl font-extrabold text-[#102E36]">
            {overview?.organisation?.name || overview?.supporter?.displayName || user?.fullName}
          </h2>
          <p className="text-xs text-[#4A636A] mt-0.5">
            {overview?.organisation
              ? `${overview.organisation.orgType.replace(/_/g, ' ')} · ${overview.organisation.county} County · Verification: ${overview.organisation.verificationStatus}`
              : 'Individual Philanthropist / Unlinked Institution — register an organisation to manage CSR budgets & teams'}
          </p>
        </div>

        <ExportReportBar
          title="Humanity Connect Corporate Giving Statement"
          rows={donations}
          csvFilename="humanity-connect-corporate-statement.csv"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[#EAE6DC]/70 overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Corporate Dashboard' },
          { id: 'organisation', label: 'Organisation & Team' },
          { id: 'csr-programmes', label: 'CSR Budgets & Campaigns' },
          { id: 'bulk-sponsor', label: 'Multi-Beneficiary Sponsorship' },
          { id: 'statements', label: 'Donation & Financial Reports' },
          { id: 'impact', label: 'Impact Reports' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as CorporateTab)}
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

      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Verified CSR & Direct Settled</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
                {formatMoney(settledTotalMinor, 'KES')}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Private to authorised team</div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Active Commitments / Pledges</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#B6721A] mt-1">
                {formatMoney(pledgedTotalMinor, 'KES')}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Excluded from settled funds</div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Sponsored Households</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {(overview?.sponsorships || []).length}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Direct institutional commitments</div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">CSR & Scholarship Funds</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {(overview?.orgFunds || []).length}
              </div>
              <div className="text-xs text-[#4A636A] mt-1">Ring-fenced corporate budgets</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#102E36]">Active Multi-Beneficiary Sponsorships</h3>
                <GlossyButton size="sm" variant="gold" onClick={() => setTab('bulk-sponsor')}>
                  Sponsor Beneficiaries
                </GlossyButton>
              </div>
              {(overview?.sponsorships || []).length === 0 ? (
                <div className="hc-card p-6 text-sm text-[#4A636A]">
                  No organisational direct sponsorships started yet. Use Multi-Beneficiary Sponsorship to
                  support multiple V4-verified Kenyan households under one CSR approval flow.
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.sponsorships.map((sp: any) => (
                    <SponsorshipCard key={sp.id} {...sp} />
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-lg font-bold text-[#102E36]">Central & Institutional Funds</h3>
              <div className="space-y-3">
                {(overview?.centralFunds || []).map((f: any) => (
                  <div key={f.id} className="hc-card p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono-num text-[#4A636A]">{f.code}</div>
                      <div className="text-sm font-bold text-[#102E36]">{f.name}</div>
                      <div className="text-xs font-mono-num text-[#287A59]">
                        Balance: {formatMoney(f.availableBalanceMinor, f.currency)}
                      </div>
                    </div>
                    <GlossyButton
                      size="sm"
                      variant="teal"
                      onClick={() => setFundCheckout({ id: f.id, name: f.name })}
                    >
                      Fund
                    </GlossyButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'organisation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                Organisation Registration & Verification Profile
              </h3>
            </div>
            <p className="text-xs text-[#4A636A]">
              Supports individual philanthropists, companies, foundations, NGOs, and religious or community
              institutions. Organisational financial balances remain private to authorised team members.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Organisation / Entity Name</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Rift Valley Builders CSR Trust"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Institution Category</label>
                <select
                  value={orgType}
                  onChange={(e) => setOrgType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="PHILANTHROPIST">Individual Philanthropist</option>
                  <option value="CORPORATE">Company / Corporate CSR</option>
                  <option value="FOUNDATION">Foundation / Endowment</option>
                  <option value="HUMANITARIAN_NGO">NGO / Relief Agency</option>
                  <option value="CHARITY">Registered Charity</option>
                  <option value="RELIGIOUS_COMMUNITY">Religious / Community Institution</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Registration / NGO Board Ref</label>
                <input
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g. CPR/2026/004812"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Headquarters County</label>
                <input
                  value={orgCounty}
                  onChange={(e) => setOrgCounty(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">Official Contact Email</label>
              <input
                type="email"
                value={orgEmail}
                onChange={(e) => setOrgEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <GlossyButton
              variant="teal"
              onClick={async () => {
                setErrorMsg(null);
                try {
                  await apiFetch('/api/corporate/organisation/register', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: orgName,
                      orgType,
                      registrationNumber: regNumber,
                      countryCode: 'KE',
                      county: orgCounty,
                      contactEmail: orgEmail,
                    }),
                  });
                  await loadAll();
                  setFeedback('Organisation registered and linked to your Well Wisher account.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Register & Submit for Corporate Verification
            </GlossyButton>
          </div>

          <div className="lg:col-span-5 hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">Authorised Organisational Users</h3>
            </div>
            <p className="text-xs text-[#4A636A]">
              Permission-based company accounts isolate corporate ledger access from public users.
            </p>
            <div className="divide-y divide-[#102E36]/10">
              {(overview?.orgMembers || []).length === 0 ? (
                <div className="py-4 text-xs text-[#4A636A]">
                  Register your organisation first to view linked corporate approvers.
                </div>
              ) : (
                overview.orgMembers.map((m: any) => (
                  <div key={m.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[#102E36]">{m.fullName}</div>
                      <div className="text-[#4A636A]">{m.email}</div>
                    </div>
                    <span className="font-semibold text-[#287A59]">{m.supporterType}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'csr-programmes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                Create CSR Budget, Scholarship or Emergency Pool
              </h3>
            </div>
            <input
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
              placeholder="Programme Title (e.g. Rift Valley Girls STEM Scholarship Pool)"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <select
              value={fundType}
              onChange={(e) => setFundType(e.target.value as any)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="CSR_POOL">Corporate CSR Budget Pool</option>
              <option value="EDUCATION">Scholarship Programme</option>
              <option value="CENTRAL_RELIEF">Emergency Relief Fund</option>
              <option value="MEDICAL">Medical Intervention Fund</option>
              <option value="EMPOWERMENT">Youth & Women Empowerment Fund</option>
            </select>
            <textarea
              rows={3}
              value={fundDesc}
              onChange={(e) => setFundDesc(e.target.value)}
              placeholder="Eligibility scope, Kenyan county focus, and corporate approval guidelines..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              variant="gold"
              onClick={async () => {
                setErrorMsg(null);
                try {
                  await apiFetch('/api/corporate/csr-program', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: fundName,
                      fundType,
                      description: fundDesc,
                      currency: 'KES',
                    }),
                  });
                  setFundName('');
                  setFundDesc('');
                  await loadAll();
                  setFeedback('CSR ring-fenced programme created.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Create CSR Fund Programme
            </GlossyButton>
          </div>

          <div className="hc-card p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#102E36]">Launch Community Campaign</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="Campaign Title"
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <input
                value={campaignCounty}
                onChange={(e) => setCampaignCounty(e.target.value)}
                placeholder="Kenyan County"
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              />
              <select
                value={campaignFundId}
                onChange={(e) => setCampaignFundId(e.target.value)}
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                {(overview?.centralFunds || []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={campaignTargetKes}
                onChange={(e) => setCampaignTargetKes(e.target.value)}
                placeholder="Target KES"
                className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
              />
            </div>
            <input
              type="number"
              value={campaignBeneficiaries}
              onChange={(e) => setCampaignBeneficiaries(e.target.value)}
              placeholder="Estimated Households Impacted"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
            />
            <textarea
              rows={2}
              value={campaignSummary}
              onChange={(e) => setCampaignSummary(e.target.value)}
              placeholder="Campaign objective, milestones, and reporting cadence..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              variant="green"
              onClick={async () => {
                setErrorMsg(null);
                try {
                  await apiFetch('/api/operations/projects', {
                    method: 'POST',
                    body: JSON.stringify({
                      fundId: campaignFundId,
                      title: campaignTitle,
                      county: campaignCounty,
                      summary: campaignSummary,
                      targetAmountMinor: Math.round(Number(campaignTargetKes || 0) * 100),
                      beneficiariesImpacted: Number(campaignBeneficiaries) || 25,
                    }),
                  });
                  setCampaignTitle('');
                  setCampaignSummary('');
                  await loadAll();
                  setFeedback('Community campaign launched under restricted fund accounting.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Launch Community Campaign
            </GlossyButton>
          </div>
        </div>
      )}

      {tab === 'bulk-sponsor' && (
        <div className="hc-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#102E36]">
                Multi-Beneficiary Corporate Sponsorship Batch
              </h3>
              <p className="text-xs text-[#4A636A]">
                Select multiple V4-verified households below to commit monthly sponsorships together.
              </p>
            </div>
            <div className="text-sm font-mono-num font-bold text-[#287A59]">
              Selected: {selectedBeneficiaryIds.length} households
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {publicCases.map((bp) => {
              const checked = selectedBeneficiaryIds.includes(bp.id);
              return (
                <label
                  key={bp.id}
                  className={`p-4 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                    checked
                      ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]'
                      : 'bg-white text-[#102E36] border-[#102E36]/15'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBeneficiarySelection(bp.id)}
                    className="mt-1"
                  />
                  <div className="space-y-1 text-xs">
                    <div className="font-mono-num opacity-80">{bp.referenceCode}</div>
                    <div className="text-sm font-bold">{bp.displayAlias}</div>
                    <div className="opacity-85">
                      {bp.county} County · {bp.classification.replace(/_/g, ' ')}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[#102E36]/10 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">
                Monthly Amount per Household (KES)
              </label>
              <input
                type="number"
                min={500}
                value={bulkMonthlyKes}
                onChange={(e) => setBulkMonthlyKes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">Approval Mode</label>
              <select
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="PLEDGE_ONLY">Corporate Pledge / Board Approval</option>
                <option value="MPESA_STK">Initiate M-Pesa STK Batch</option>
              </select>
            </div>
            <GlossyButton
              variant="gold"
              disabled={selectedBeneficiaryIds.length === 0}
              onClick={async () => {
                setErrorMsg(null);
                try {
                  const res = await apiFetch<{ count: number }>('/api/corporate/bulk-sponsor', {
                    method: 'POST',
                    body: JSON.stringify({
                      beneficiaryIds: selectedBeneficiaryIds,
                      monthlyAmountPerBeneficiaryMinor: Math.round(Number(bulkMonthlyKes || 0) * 100),
                      currency: 'KES',
                      mode: bulkMode,
                    }),
                  });
                  setSelectedBeneficiaryIds([]);
                  await loadAll();
                  setFeedback(`Initiated ${res.count} institutional sponsorship commitment(s).`);
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              <HeartHandshake className="w-4 h-4" />
              Commit Batch Sponsorship
            </GlossyButton>
          </div>
        </div>
      )}

      {tab === 'statements' && (
        <div className="hc-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">
                Private Organisational Donation Statements & Financial Ledger
              </h3>
            </div>
            <ExportReportBar
              title="Humanity Connect Institutional Financial Report"
              rows={donations}
              csvFilename="corporate-financial-statements.csv"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                <tr>
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 pr-4">Pathway</th>
                  <th className="py-2.5 pr-4">Type</th>
                  <th className="py-2.5 pr-4">Provider / Receipt</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#102E36]/10">
                {donations.map((d: any) => (
                  <tr key={d.id}>
                    <td className="py-3 pr-4 font-mono-num">
                      {new Date(d.createdAt).toLocaleDateString('en-KE')}
                    </td>
                    <td className="py-3 pr-4">{d.pathway}</td>
                    <td className="py-3 pr-4">{d.isPledge ? 'Corporate Pledge' : 'Settled Contribution'}</td>
                    <td className="py-3 pr-4 font-mono-num">{d.mpesaReceipt || d.provider || '—'}</td>
                    <td className="py-3 pr-4 text-right font-mono-num font-bold">
                      {formatMoney(d.amountMinor, d.currency)}
                    </td>
                    <td className="py-3 font-semibold text-[#287A59]">{d.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'impact' && (
        <div className="hc-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#102E36]">
                Corporate Impact Report & Gemini Executive Brief
              </h3>
              <p className="text-xs text-[#4A636A]">
                AI-drafted briefs summarise verified totals and require human compliance sign-off before external release.
              </p>
            </div>
            <GlossyButton
              size="sm"
              variant="gold"
              disabled={aiBusy}
              onClick={async () => {
                setAiBusy(true);
                try {
                  const res = await apiFetch<{ output: string }>('/api/ai/assist', {
                    method: 'POST',
                    body: JSON.stringify({
                      mode: 'IMPACT_BRIEF',
                      text: `Organisation: ${overview?.organisation?.name || user?.fullName}. Verified settled: KES ${(settledTotalMinor / 100).toLocaleString()}. Active sponsorships: ${(overview?.sponsorships || []).length}. Open pledges: KES ${(pledgedTotalMinor / 100).toLocaleString()}.`,
                      language: 'en',
                    }),
                  });
                  setImpactBrief(res.output);
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              <Sparkles className="w-4 h-4" />
              {aiBusy ? 'Drafting...' : 'Draft Board Impact Brief'}
            </GlossyButton>
          </div>
          {impactBrief && (
            <div className="p-4 rounded-xl bg-white border border-[#102E36]/15 text-sm text-[#102E36] whitespace-pre-wrap leading-relaxed">
              {impactBrief}
            </div>
          )}
          <div className="p-4 rounded-xl bg-[#EAE6DC]/50 flex items-center gap-3 text-xs text-[#102E36]">
            <ShieldCheck className="w-4 h-4 text-[#287A59] shrink-0" />
            <span>
              Financial privacy guard active: only your organisation’s authorised officers can export
              corporate contribution statements.
            </span>
          </div>
        </div>
      )}

      {/* Fund Contribution Modal */}
      <ModalDialog
        open={Boolean(fundCheckout)}
        title={`Contribute to ${fundCheckout?.name || ''}`}
        subtitle="Restricted Central / CSR Fund Pathway"
        onClose={() => {
          setFundCheckout(null);
          setPendingStk(null);
        }}
      >
        {fundCheckout && !pendingStk && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Amount (KES)</label>
                <input
                  type="number"
                  min={500}
                  value={fundAmountKes}
                  onChange={(e) => setFundAmountKes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Method</label>
                <select
                  value={fundPayMode}
                  onChange={(e) => setFundPayMode(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="MPESA_STK">Safaricom M-Pesa STK Push</option>
                  <option value="PLEDGE_ONLY">Corporate Pledge Commitment</option>
                </select>
              </div>
            </div>
            {fundPayMode === 'MPESA_STK' && (
              <input
                value={fundPhone}
                onChange={(e) => setFundPhone(e.target.value)}
                placeholder="+254712345678"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
              />
            )}
            <GlossyButton
              variant="gold"
              className="w-full"
              onClick={async () => {
                const amountMinor = Math.round(Number(fundAmountKes || 0) * 100);
                const res = await apiFetch<any>('/api/supporter/checkout', {
                  method: 'POST',
                  body: JSON.stringify({
                    pathway: 'CENTRAL_FUND',
                    fundId: fundCheckout.id,
                    amountMinor,
                    currency: 'KES',
                    mode: fundPayMode,
                    phoneE164: fundPhone,
                  }),
                });
                if (fundPayMode === 'MPESA_STK' && res.paymentTx?.checkoutRequestId) {
                  setPendingStk({ checkoutRequestId: res.paymentTx.checkoutRequestId, amountMinor });
                } else {
                  setFundCheckout(null);
                  await loadAll();
                  setFeedback('Corporate pledge recorded separately from verified settled balances.');
                }
              }}
            >
              <Smartphone className="w-4 h-4" />
              {fundPayMode === 'MPESA_STK' ? 'Initiate M-Pesa STK Push' : 'Record Corporate Pledge'}
            </GlossyButton>
          </div>
        )}

        {pendingStk && (
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-xl bg-[#EAE6DC]/60 space-y-1">
              <div className="font-bold text-[#102E36]">Daraja Callback Pending</div>
              <div className="font-mono-num text-xs text-[#4A636A]">
                CheckoutRequestID: {pendingStk.checkoutRequestId}
              </div>
            </div>
            <GlossyButton
              variant="green"
              onClick={async () => {
                await apiFetch('/api/payments/mpesa/callback', {
                  method: 'POST',
                  body: JSON.stringify({
                    checkoutRequestId: pendingStk.checkoutRequestId,
                    resultCode: 0,
                    amountKes: Math.round(pendingStk.amountMinor / 100),
                  }),
                });
                setPendingStk(null);
                setFundCheckout(null);
                await loadAll();
                setFeedback('Daraja callback verified and fund balance updated.');
              }}
            >
              <CheckCircle2 className="w-4 h-4" />
              Verify Sandbox Callback (ResultCode 0)
            </GlossyButton>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
