import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Landmark,
  Users,
  Search,
  Sparkles,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import {
  GlossyButton,
  ResilientMedia,
  BeneficiaryProfileCard,
  formatMoney,
  type PublicBeneficiaryCardData,
  type PublicNeedItem,
} from '../ui/DesignSystem';

interface PublicOverviewData {
  stats: {
    verifiedHouseholds: number;
    activeCentralFunds: number;
    activeCommunityProjects: number;
    verifiedSettledKesMinor: number;
    needsCategoriesCount: number;
  };
  funds: Array<{
    id: string;
    code: string;
    name: string;
    fundType: string;
    currency: string;
    availableBalanceMinor: number;
    totalReceivedMinor: number;
    description: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    county: string;
    summary: string;
    coverImagePath?: string | null;
    targetAmountMinor: number;
    raisedAmountMinor: number;
    currency: string;
    beneficiariesImpacted: number;
  }>;
}

export const PublicLandingPage: React.FC<{
  onNavigateAuth: (mode: 'login' | 'register', presetRole?: string) => void;
  onStartSponsorship: (item: PublicBeneficiaryCardData, need?: PublicNeedItem) => void;
  onOpenFundContribution: (fundId: string, fundName: string) => void;
}> = ({ onNavigateAuth, onStartSponsorship, onOpenFundContribution }) => {
  const [overview, setOverview] = useState<PublicOverviewData | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<PublicBeneficiaryCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [ovRes, benRes] = await Promise.all([
          fetch('/api/public/overview').then((r) => r.json()),
          fetch('/api/public/beneficiaries').then((r) => r.json()),
        ]);
        if (!active) return;
        if (ovRes?.stats) setOverview(ovRes);
        if (benRes?.beneficiaries) setBeneficiaries(benRes.beneficiaries);
      } catch (err) {
        console.error('Public load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredBeneficiaries = beneficiaries.filter((b) => {
    if (categoryFilter !== 'ALL' && b.classification !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${b.displayAlias} ${b.county} ${b.referenceCode} ${b.storyTitle || ''} ${b.vulnerabilitySummary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-20 pb-20">
      {/* 1. Hero Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-8 py-2">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#287A59]">
                <span>Kenya Launch Network</span>
                <span aria-hidden="true">·</span>
                <span>V0–V4 Verified Pathways</span>
                <span aria-hidden="true">·</span>
                <span>M-Pesa & Institutional Rails</span>
              </div>

              <h1
                className="font-display font-extrabold text-[#102E36] tracking-tight leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', textWrap: 'balance' }}
              >
                Together We Can Change Lives Across Kenya
              </h1>

              <p className="text-base sm:text-lg text-[#4A636A] leading-relaxed max-w-xl">
                Humanity Connect bridges verified orphaned households, destitute families, and vulnerable
                individuals with direct sponsors, philanthropists, companies, and humanitarian funds—governed
                by strict safeguarding and transparent double-entry accountability.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <GlossyButton
                  variant="gold"
                  size="lg"
                  onClick={() => onNavigateAuth('register', 'SUPPORTIVE')}
                >
                  Sponsor or Contribute
                  <ArrowRight className="w-4 h-4" />
                </GlossyButton>
                <GlossyButton
                  variant="ivory"
                  size="lg"
                  onClick={() => onNavigateAuth('register', 'ORPHAN_GUARDIAN')}
                >
                  Request Verified Support
                </GlossyButton>
              </div>
            </div>

            <div className="pt-6 border-t border-[#102E36]/10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#4A636A]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#287A59]" />
                Minor identities protected via verified guardians
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#287A59]" />
                Pledges never counted as settled cash
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[440px] rounded-3xl overflow-hidden border border-[#102E36]/10 shadow-lg relative">
              <ResilientMedia
                src="/src/assets/images/hero_kenya_community_1794511019880.jpg"
                alt="Kenyan community empowerment courtyard with educators and household stewards collaborating"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1F25]/90 via-[#0A1F25]/45 to-transparent p-6 text-[#FAF9F6]">
                <p className="text-xs font-medium text-[#D9A84E]">
                  Safeguarding-First Humanitarian Architecture
                </p>
                <p className="text-sm sm:text-base font-semibold mt-1">
                  Every public profile requires V4 field verification, safeguarding clearance, and active consent.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column KPI Strip below hero split */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          <div className="hc-card p-5">
            <div className="text-xs text-[#4A636A]">Verified Public Cases</div>
            <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
              {overview?.stats.verifiedHouseholds ?? 3}
            </div>
            <div className="text-xs text-[#287A59] mt-1">V4 safeguarding cleared</div>
          </div>
          <div className="hc-card p-5">
            <div className="text-xs text-[#4A636A]">Central Humanitarian Funds</div>
            <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
              {overview?.stats.activeCentralFunds ?? 4}
            </div>
            <div className="text-xs text-[#4A636A] mt-1">Ring-fenced restricted pools</div>
          </div>
          <div className="hc-card p-5">
            <div className="text-xs text-[#4A636A]">County Community Projects</div>
            <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
              {overview?.stats.activeCommunityProjects ?? 3}
            </div>
            <div className="text-xs text-[#4A636A] mt-1">Kajiado · Kisumu · Nairobi</div>
          </div>
          <div className="hc-card p-5">
            <div className="text-xs text-[#4A636A]">Verified Settled Volume</div>
            <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
              {formatMoney(overview?.stats.verifiedSettledKesMinor ?? 0, 'KES')}
            </div>
            <div className="text-xs text-[#287A59] mt-1">Server-confirmed only</div>
          </div>
        </div>
      </section>

      {/* 2. Dual Accounting Pathways */}
      <section id="pathways" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-semibold text-[#287A59]">01. Dual Accounting Architecture</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#102E36]">
            Two Distinct Pathways for Verified Humanitarian Impact
          </h2>
          <p className="text-sm sm:text-base text-[#4A636A]">
            Supporters and institutions choose between direct 1:1 household sponsorships or centrally
            managed relief pools, with zero commingling of donor principal and platform operations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="hc-card p-7 space-y-4">
            <div className="w-11 h-11 rounded-2xl bg-[#102E36] text-[#D9A84E] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-[#102E36]">Pathway A: Direct Sponsorship</h3>
            <p className="text-sm text-[#4A636A] leading-relaxed">
              Match directly with a V4-verified orphan guardian household, destitute family, or needy
              learner. Fund full or partial needs—such as direct school paybill tuition, rent stability,
              or vocational equipment—with transparent milestone receipts.
            </p>
            <div className="pt-2">
              <GlossyButton variant="teal" size="sm" onClick={() => {
                const el = document.getElementById('verified-cases');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}>
                Browse Verified Cases
              </GlossyButton>
            </div>
          </div>

          <div className="hc-card p-7 space-y-4">
            <div className="w-11 h-11 rounded-2xl bg-[#287A59] text-[#FAF9F6] flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-[#102E36]">Pathway B: Central Humanitarian Funds</h3>
            <p className="text-sm text-[#4A636A] leading-relaxed">
              Pool contributions into audited national emergency relief, orphan education, medical care,
              or corporate CSR budgets. Disbursements require maker-checker dual authorisation and
              human social welfare verification.
            </p>
            <div className="pt-2">
              <GlossyButton variant="green" size="sm" onClick={() => {
                const el = document.getElementById('central-funds');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}>
                Explore Central Funds
              </GlossyButton>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Verified & Consented Beneficiary Cases */}
      <section id="verified-cases" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#287A59]">02. Verified Direct Sponsorships</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#102E36]">
              Safeguarded & Consented Household Cases
            </h2>
            <p className="text-sm text-[#4A636A]">
              Only V4-verified, safeguarding-cleared cases with active public consent appear here. Exact
              addresses and phone numbers are never disclosed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#4A636A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search county, reference, need..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-[#FAF9F6] border border-[#102E36]/15 text-[#102E36] focus:outline-none focus:border-[#102E36]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-[#EAE6DC]/70 w-fit">
          {[
            { code: 'ALL', label: 'All Verified' },
            { code: 'ORPHAN_GUARDIAN', label: 'Orphan / Guardian' },
            { code: 'DESTITUTE', label: 'Destitute' },
            { code: 'NEEDY', label: 'Needy' },
          ].map((tab) => (
            <button
              key={tab.code}
              type="button"
              onClick={() => setCategoryFilter(tab.code)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === tab.code
                  ? 'bg-[#102E36] text-[#FAF9F6] shadow-xs'
                  : 'text-[#102E36] hover:bg-[#FAF9F6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((k) => (
              <div key={k} className="hc-card h-96 animate-pulse bg-[#EAE6DC]/50" />
            ))}
          </div>
        ) : filteredBeneficiaries.length === 0 ? (
          <div className="hc-card p-10 text-center text-sm text-[#4A636A]">
            No verified public cases match the current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBeneficiaries.map((item) => (
              <BeneficiaryProfileCard
                key={item.id}
                item={item}
                onSponsor={onStartSponsorship}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Central Funds & County Community Projects */}
      <section id="central-funds" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-semibold text-[#287A59]">03. Central Funds & Community Projects</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#102E36]">
            Collective Relief Pools & Kenyan County Projects
          </h2>
          <p className="text-sm text-[#4A636A]">
            Institutional partners, Well Wishers, and individual supporters strengthen entire communities
            through verified water, education, and cooperative empowerment projects.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(overview?.funds || []).map((fund) => (
            <div key={fund.id} className="hc-card p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#4A636A]">
                  <span className="font-mono-num text-[#102E36] font-semibold">{fund.code}</span>
                  <span>{fund.fundType.replace(/_/g, ' ')}</span>
                </div>
                <h3 className="text-lg font-bold text-[#102E36]">{fund.name}</h3>
                <p className="text-sm text-[#4A636A]">{fund.description}</p>
              </div>
              <div className="pt-4 border-t border-[#102E36]/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-[#4A636A]">Available Verified Pool</div>
                  <div className="text-lg font-extrabold font-mono-num text-[#287A59]">
                    {formatMoney(fund.availableBalanceMinor, fund.currency)}
                  </div>
                </div>
                <GlossyButton
                  variant="teal"
                  size="sm"
                  onClick={() => onOpenFundContribution(fund.id, fund.name)}
                >
                  Contribute via M-Pesa
                </GlossyButton>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(overview?.projects || []).map((proj) => (
            <article key={proj.id} className="hc-card overflow-hidden flex flex-col justify-between">
              <div>
                <div className="aspect-[4/3] bg-[#EAE6DC]">
                  <ResilientMedia
                    src={proj.coverImagePath}
                    alt={proj.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#4A636A]">
                    <span className="inline-flex items-center gap-1 text-[#287A59] font-medium">
                      <MapPin className="w-3 h-3" /> {proj.county} County
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">{proj.beneficiariesImpacted} households</span>
                  </div>
                  <h4 className="text-base font-bold text-[#102E36]">{proj.title}</h4>
                  <p className="text-sm text-[#4A636A] leading-relaxed">{proj.summary}</p>
                </div>
              </div>
              <div className="px-5 pb-5 pt-2 flex items-center justify-between text-xs font-mono-num text-[#4A636A]">
                <span>Target: {formatMoney(proj.targetAmountMinor, proj.currency)}</span>
                <span className="text-[#287A59] font-semibold">Active Verification</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Safeguarding & Account Pathways CTA */}
      <section id="safeguarding" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-[#102E36] text-[#FAF9F6] p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#D9A84E]">
              <Sparkles className="w-4 h-4" />
              Dignity, Consent & Financial Integrity
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              Built for Kenya’s Communities, Ready for Global Humanitarian Partnerships
            </h2>
            <p className="text-sm sm:text-base text-[#FAF9F6]/80 leading-relaxed">
              Multi-role accounts allow individuals to contribute as Supportive members or Well Wishers,
              institutions to run CSR budgets, and vulnerable families to access verification, empowerment,
              and safeguarding protection under one secure roof.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-[#FAF9F6]/90">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D9A84E] shrink-0" />
                Zero unsupervised adult-to-minor messaging
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D9A84E] shrink-0" />
                Empowerment never auto-terminates aid
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D9A84E] shrink-0" />
                Human-approved P1–P5 priority scoring
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D9A84E] shrink-0" />
                Immutable double-entry M-Pesa ledger
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-3">
            <GlossyButton
              variant="gold"
              size="lg"
              className="w-full"
              onClick={() => onNavigateAuth('register', 'WELL_WISHER')}
            >
              Register Corporate / Well Wisher Account
            </GlossyButton>
            <GlossyButton
              variant="green"
              size="lg"
              className="w-full"
              onClick={() => onNavigateAuth('register', 'SUPPORTIVE')}
            >
              Join as Individual Supporter or Volunteer
            </GlossyButton>
            <GlossyButton
              variant="ivory"
              size="lg"
              className="w-full"
              onClick={() => onNavigateAuth('login')}
            >
              Sign In to Existing Account
            </GlossyButton>
          </div>
        </div>
      </section>
    </div>
  );
};
