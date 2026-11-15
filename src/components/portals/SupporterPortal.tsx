import React, { useEffect, useState } from 'react';
import {
  Search,
  HeartHandshake,
  Smartphone,
  Repeat,
  Gift,
  Users,
  FileCheck2,
  Bookmark,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  HelpCircle,
  TrendingUp,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { MPESA_ACCOUNT, MPESA_PAYBILL } from '../../lib/mpesaDestination';
import { ConfettiBurst } from '../ui/ConfettiBurst';
import {
  buildMonthlyDonationTrends,
  computeSupporterImpactMetrics,
} from '../../lib/supporterAnalytics';
import {
  GlossyButton,
  BeneficiaryProfileCard,
  SponsorshipCard,
  NotificationList,
  ModalDialog,
  ExportReportBar,
  formatMoney,
  type PublicBeneficiaryCardData,
  type PublicNeedItem,
} from '../ui/DesignSystem';
import {
  SponsorshipMatchingPanel,
  type MatchRecommendationItem,
  type MatchingResponsePayload,
} from '../matching/SponsorshipMatchingPanel';
import { WhyMatchModal } from '../matching/WhyMatchModal';

interface ImpactTimelinePoint {
  month: string;
  disbursedMinor: number;
  targetMinor: number;
}

type SupporterTab =
  | 'dashboard'
  | 'matching'
  | 'browse'
  | 'saved'
  | 'contributions'
  | 'recurring'
  | 'volunteer'
  | 'messages'
  | 'impact';

export const SupporterPortal: React.FC<{
  initialCheckoutTarget?: {
    beneficiary?: PublicBeneficiaryCardData;
    need?: PublicNeedItem;
    fundId?: string;
    fundName?: string;
  } | null;
}> = ({ initialCheckoutTarget }) => {
  const { apiFetch, user } = useAuth();
  const [tab, setTab] = useState<SupporterTab>(initialCheckoutTarget ? 'browse' : 'dashboard');
  const [portal, setPortal] = useState<any>(null);
  const [publicCases, setPublicCases] = useState<PublicBeneficiaryCardData[]>([]);
  const [categories, setCategories] = useState<Array<{ code: string; name: string }>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 8 Required Supporter Filters
  const [search, setSearch] = useState('');
  const [beneficiaryCategory, setBeneficiaryCategory] = useState('ALL');
  const [needCategory, setNeedCategory] = useState('ALL');
  const [county, setCounty] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [verifLevel, setVerifLevel] = useState('ALL');
  const [recurringFilter, setRecurringFilter] = useState('ALL');
  const [fundingFilter, setFundingFilter] = useState('ALL');

  // Checkout & M-Pesa Modal State
  const [checkoutTarget, setCheckoutTarget] = useState<{
    pathway: 'DIRECT_SPONSORSHIP' | 'CENTRAL_FUND';
    beneficiary?: PublicBeneficiaryCardData;
    need?: PublicNeedItem;
    fundId?: string;
    fundName?: string;
    originatedFromAiMatch?: boolean;
    matchSuggestionId?: string;
  } | null>(
    initialCheckoutTarget
      ? initialCheckoutTarget.fundId
        ? {
            pathway: 'CENTRAL_FUND',
            fundId: initialCheckoutTarget.fundId,
            fundName: initialCheckoutTarget.fundName,
          }
        : {
            pathway: 'DIRECT_SPONSORSHIP',
            beneficiary: initialCheckoutTarget.beneficiary,
            need: initialCheckoutTarget.need,
          }
      : null
  );

  const [amountKes, setAmountKes] = useState('5000');
  const [coverage, setCoverage] = useState<'PARTIAL' | 'FULL'>('PARTIAL');
  const [payMode, setPayMode] = useState<'MPESA_STK' | 'PLEDGE_ONLY'>('MPESA_STK');
  const [mpesaPhone, setMpesaPhone] = useState(user?.phoneE164 || '+254712345678');
  const [isRecurring, setIsRecurring] = useState(false);
  const [cadence, setCadence] = useState<'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SCHOOL_TERM' | 'ANNUALLY' | 'CUSTOM'>('MONTHLY');
  const [consentSigned, setConsentSigned] = useState(true);
  const [isGift, setIsGift] = useState(false);
  const [giftHonoree, setGiftHonoree] = useState('');
  const [pendingStk, setPendingStk] = useState<{ checkoutRequestId: string; amountMinor: number } | null>(null);
  const [stkStatus, setStkStatus] = useState<{
    status: 'CALLBACK_PENDING' | 'VERIFIED' | 'FAILED';
    mpesaReceiptNumber?: string | null;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);

  // Volunteer & Safe Message state
  const [volCounty, setVolCounty] = useState('Nairobi');
  const [volSkills, setVolSkills] = useState('');
  const [msgTargetId, setMsgTargetId] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');

  // Case detail modal
  const [detailCase, setDetailCase] = useState<PublicBeneficiaryCardData | null>(null);
  const [proactiveMatches, setProactiveMatches] = useState<MatchRecommendationItem[]>([]);
  const [whyMatchTarget, setWhyMatchTarget] = useState<MatchRecommendationItem | null>(null);
  const [impactTimeline, setImpactTimeline] = useState<ImpactTimelinePoint[]>([]);

  const loadAll = async () => {
    try {
      const [pRes, bRes, ovRes] = await Promise.all([
        apiFetch<any>('/api/supporter/portal'),
        fetch('/api/public/beneficiaries').then((r) => r.json()),
        fetch('/api/public/overview').then((r) => r.json()),
      ]);
      setPortal(pRes);
      setPublicCases(bRes.beneficiaries || []);
      setCategories(ovRes.categories || []);
      try {
        const timelineRes = await apiFetch<{ currency: string; points: ImpactTimelinePoint[] }>(
          '/api/supporter/impact-timeline'
        );
        setImpactTimeline(timelineRes.points || []);
      } catch {
        // Non-blocking timeline load
      }
      try {
        const matchRes = await apiFetch<MatchingResponsePayload>(
          '/api/matching/suggested?refreshAi=false'
        );
        setProactiveMatches((matchRes.matches || []).slice(0, 3));
      } catch {
        // Non-blocking background proactive preview
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const checkPendingStkStatus = async (checkoutRequestId: string) => {
    try {
      const res = await apiFetch<{
        verificationStatus: string;
        mpesaReceiptNumber?: string | null;
      }>('/api/payments/mpesa/stk-query', {
        method: 'POST',
        body: JSON.stringify({ checkoutRequestId }),
      });
      if (res.verificationStatus === 'VERIFIED') {
        setStkStatus({
          status: 'VERIFIED',
          mpesaReceiptNumber: res.mpesaReceiptNumber ?? null,
        });
        setShowConfetti(true);
        setFeedback(
          res.mpesaReceiptNumber
            ? `M-Pesa payment confirmed (Receipt: ${res.mpesaReceiptNumber}). Thank you for supporting Humanity Connect!`
            : 'M-Pesa payment confirmed. Thank you for supporting Humanity Connect!'
        );
        await loadAll();
      } else if (res.verificationStatus === 'FAILED') {
        setStkStatus({ status: 'FAILED' });
      }
    } catch {
      // Transient polling ignore; manual button & next interval will retry
    }
  };

  useEffect(() => {
    if (!pendingStk || stkStatus?.status === 'VERIFIED' || stkStatus?.status === 'FAILED') {
      return;
    }
    const interval = window.setInterval(() => {
      checkPendingStkStatus(pendingStk.checkoutRequestId);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [pendingStk?.checkoutRequestId, stkStatus?.status]);

  const openCheckoutFromMatch = (match: MatchRecommendationItem, suggestedAmountKes: number) => {
    const publicBen = publicCases.find((c) => c.id === match.beneficiaryId);
    const matchedNeed =
      publicBen?.needs.find((n) => n.id === match.primaryNeed?.id) ||
      (match.primaryNeed
        ? ({
            id: match.primaryNeed.id,
            referenceCode: match.primaryNeed.referenceCode,
            title: match.primaryNeed.title,
            categoryCode: match.primaryNeed.categoryCode,
            categoryName: match.primaryNeed.categoryName,
            targetAmountMinor: match.primaryNeed.targetAmountMinor,
            fulfilledAmountMinor: match.primaryNeed.fulfilledAmountMinor,
            currency: match.primaryNeed.currency,
            priorityTier: match.primaryNeed.priorityTier,
            isRecurring: match.primaryNeed.isRecurring,
            frequency: match.primaryNeed.frequency,
          } as PublicNeedItem)
        : undefined);

    setAmountKes(String(suggestedAmountKes));
    setCheckoutTarget({
      pathway: 'DIRECT_SPONSORSHIP',
      originatedFromAiMatch: true,
      matchSuggestionId: match.suggestionId,
      beneficiary:
        publicBen ||
        ({
          id: match.beneficiaryId,
          referenceCode: match.referenceCode,
          classification: match.classification,
          displayAlias: match.displayAlias,
          countryCode: 'KE',
          county: match.county,
          isMinorCase: match.isMinorCase,
          guardianOrgName: null,
          vulnerabilitySummary: match.geminiRationale,
          verificationLevel: 'V4',
          verificationStatus: 'VERIFIED',
          monthlyNeedTargetMinor: suggestedAmountKes * 100,
          currency: 'KES',
          storyTitle: match.storyTitle,
          storySummary: match.storySummary,
          coverImagePath: match.coverImagePath,
          needs: matchedNeed ? [matchedNeed] : [],
        } as PublicBeneficiaryCardData),
      need: matchedNeed,
    });
  };

  const savedIds = new Set((portal?.savedBeneficiaries || []).map((s: any) => s.beneficiaryId));

  const filteredCases = publicCases.filter((bp) => {
    if (beneficiaryCategory !== 'ALL' && bp.classification !== beneficiaryCategory) return false;
    if (county !== 'ALL' && bp.county.toLowerCase() !== county.toLowerCase()) return false;
    if (verifLevel !== 'ALL' && bp.verificationLevel !== verifLevel) return false;
    if (needCategory !== 'ALL' && !bp.needs.some((n) => n.categoryCode === needCategory)) return false;
    if (priority !== 'ALL' && !bp.needs.some((n) => n.priorityTier === priority)) return false;
    if (recurringFilter === 'RECURRING' && !bp.needs.some((n) => n.isRecurring)) return false;
    if (recurringFilter === 'ONE_TIME' && !bp.needs.some((n) => !n.isRecurring)) return false;
    if (fundingFilter === 'UNDER_50') {
      const n = bp.needs[0];
      if (n && n.fulfilledAmountMinor / Math.max(1, n.targetAmountMinor) >= 0.5) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!`${bp.displayAlias} ${bp.referenceCode} ${bp.county} ${bp.storyTitle || ''}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const confirmedDonations = (portal?.donations || []).filter((d: any) => d.status === 'CONFIRMED');
  const pledgedDonations = (portal?.donations || []).filter((d: any) => d.status === 'PLEDGED');
  const monthlyDonationTrends = buildMonthlyDonationTrends(portal?.donations || []);
  const totalImpactMetrics = computeSupporterImpactMetrics(portal?.donations || [], impactTimeline);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ConfettiBurst active={showConfetti} onComplete={() => setShowConfetti(false)} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#287A59]">Supportive Portal</div>
          <h2 className="text-2xl font-extrabold text-[#102E36]">
            Direct Sponsorships, Central Funds & Verified Impact
          </h2>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#102E36] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(portal?.supporter?.anonymousGiving)}
            onChange={async (e) => {
              await apiFetch('/api/supporter/preferences', {
                method: 'PATCH',
                body: JSON.stringify({ anonymousGiving: e.target.checked }),
              });
              await loadAll();
            }}
          />
          Anonymous Public Attribution
        </label>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[#EAE6DC]/70">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'matching', label: 'AI Smart Matching' },
          { id: 'browse', label: 'Browse & Urgent Needs' },
          { id: 'saved', label: `Saved (${savedIds.size})` },
          { id: 'contributions', label: 'Contributions & Receipts' },
          { id: 'recurring', label: 'Recurring Giving' },
          { id: 'volunteer', label: 'Volunteer' },
          { id: 'messages', label: 'Safe Messages' },
          { id: 'impact', label: 'Impact Reports' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as SupporterTab)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Verified Contributions (Settled)</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
                {formatMoney(
                  confirmedDonations.reduce((acc: number, d: any) => acc + d.amountMinor, 0),
                  'KES'
                )}
              </div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Open Pledges (Unsettled)</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#B6721A] mt-1">
                {formatMoney(
                  pledgedDonations.reduce((acc: number, d: any) => acc + d.amountMinor, 0),
                  'KES'
                )}
              </div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Active Sponsorships</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {(portal?.sponsorships || []).filter((s: any) => s.status === 'ACTIVE').length}
              </div>
            </div>
            <div className="hc-card p-5">
              <div className="text-xs text-[#4A636A]">Recurring Plans</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {(portal?.recurringSchedules || []).filter((r: any) => r.status === 'ACTIVE').length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Impact Over Time (Recharts Cumulative Area Chart) */}
            <div className="hc-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#287A59] flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#D9A84E]" />
                    Verified Humanitarian Trajectory
                  </div>
                  <h3 className="text-lg font-bold text-[#102E36]">Impact Over Time</h3>
                </div>
                <span className="text-xs font-mono-num text-[#4A636A]">
                  Disbursed vs Approved Targets (KES)
                </span>
              </div>

              {impactTimeline.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10 text-xs text-[#4A636A] text-center">
                  No settled disbursements or human-approved funding targets recorded yet.
                </div>
              ) : (
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={impactTimeline.map((pt) => ({
                        month: pt.month,
                        disbursedKes: Math.round(pt.disbursedMinor / 100),
                        targetKes: Math.round(pt.targetMinor / 100),
                      }))}
                      margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="hcDisbursedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#287A59" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#287A59" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="hcTargetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D9A84E" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#D9A84E" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#102E36" strokeOpacity={0.1} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#4A636A' }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#4A636A' }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          `KES ${Number(val || 0).toLocaleString('en-KE')}`,
                          name === 'disbursedKes' ? 'Settled Disbursements' : 'Approved Need Targets',
                        ]}
                      />
                      <Legend
                        formatter={(value) =>
                          value === 'disbursedKes' ? 'Settled Disbursements (KES)' : 'Approved Need Targets (KES)'
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="targetKes"
                        stroke="#D9A84E"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#hcTargetGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="disbursedKes"
                        stroke="#287A59"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#hcDisbursedGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Monthly Donation Trends & Total Impact Metrics (Recharts BarChart) */}
            <div className="hc-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#287A59] flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#D9A84E]" />
                    Monthly Giving & Impact Metrics
                  </div>
                  <h3 className="text-lg font-bold text-[#102E36]">Monthly Donation Trends</h3>
                </div>
                <span className="text-xs font-mono-num text-[#4A636A]">
                  Coverage: {totalImpactMetrics.impactCoveragePct}%
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                  <div className="text-[11px] text-[#4A636A]">Settled Giving</div>
                  <div className="text-sm font-extrabold font-mono-num text-[#287A59]">
                    KES {totalImpactMetrics.totalSettledKes.toLocaleString('en-KE')}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                  <div className="text-[11px] text-[#4A636A]">Pledged</div>
                  <div className="text-sm font-extrabold font-mono-num text-[#B6721A]">
                    KES {totalImpactMetrics.totalPledgedKes.toLocaleString('en-KE')}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                  <div className="text-[11px] text-[#4A636A]">Network Disbursed</div>
                  <div className="text-sm font-extrabold font-mono-num text-[#102E36]">
                    KES {totalImpactMetrics.totalDisbursedImpactKes.toLocaleString('en-KE')}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                  <div className="text-[11px] text-[#4A636A]">Need Target Cap</div>
                  <div className="text-sm font-extrabold font-mono-num text-[#102E36]">
                    KES {totalImpactMetrics.totalApprovedTargetKes.toLocaleString('en-KE')}
                  </div>
                </div>
              </div>

              {monthlyDonationTrends.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10 text-xs text-[#4A636A] text-center">
                  Your monthly settled and pledged contribution bars will appear here once you make your first contribution or pledge.
                </div>
              ) : (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyDonationTrends}
                      margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#102E36" strokeOpacity={0.1} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4A636A' }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#4A636A' }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          `KES ${Number(val || 0).toLocaleString('en-KE')}`,
                          name === 'settledKes' ? 'Settled Contributions' : 'Open Pledges',
                        ]}
                      />
                      <Legend
                        formatter={(value) =>
                          value === 'settledKes' ? 'Settled (KES)' : 'Pledged (KES)'
                        }
                      />
                      <Bar dataKey="settledKes" fill="#287A59" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="pledgedKes" fill="#D9A84E" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Proactive AI Match Suggestions on Supporter Dashboard */}
          <div className="hc-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#287A59] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#D9A84E]" />
                  Proactive Sponsorship Suggestions
                </div>
                <h3 className="text-lg font-bold text-[#102E36]">
                  Verified Households Matched to Your Preferences
                </h3>
              </div>
              <GlossyButton size="sm" variant="teal" onClick={() => setTab('matching')}>
                Open AI Matching Engine
              </GlossyButton>
            </div>

            {proactiveMatches.length === 0 ? (
              <div className="text-xs text-[#4A636A]">
                Open the AI Smart Matching tab to set your target budget, counties, and interest categories.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {proactiveMatches.map((m) => (
                  <div
                    key={m.beneficiaryId}
                    className="p-4 rounded-xl bg-white border border-[#102E36]/12 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono-num text-[#4A636A]">{m.county} County</span>
                        <span className="font-mono-num font-extrabold text-[#287A59]">
                          {m.compositeScore}% Match
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-[#102E36]">{m.displayAlias}</div>
                        <button
                          type="button"
                          onClick={() => setWhyMatchTarget(m)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#287A59] hover:underline shrink-0"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          Why this match?
                        </button>
                      </div>
                      <div className="text-xs text-[#4A636A] line-clamp-2">{m.geminiRationale}</div>
                    </div>
                    <GlossyButton
                      size="sm"
                      variant="gold"
                      onClick={() => openCheckoutFromMatch(m, 5000)}
                    >
                      Sponsor Match
                    </GlossyButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold text-[#102E36]">Your Direct Sponsorships</h3>
            {(portal?.sponsorships || []).length === 0 ? (
              <div className="hc-card p-6 text-sm text-[#4A636A] flex flex-wrap items-center justify-between gap-4">
                <span>You have not started a direct household sponsorship yet.</span>
                <GlossyButton size="sm" variant="gold" onClick={() => setTab('browse')}>
                  Browse Verified Cases
                </GlossyButton>
              </div>
            ) : (
              portal.sponsorships.map((sp: any) => <SponsorshipCard key={sp.id} {...sp} />)
            )}
          </div>
        </div>
      )}

      {tab === 'matching' && (
        <SponsorshipMatchingPanel
          portalMode="SUPPORTIVE"
          categories={categories}
          onSponsorMatch={openCheckoutFromMatch}
          onDataChanged={loadAll}
        />
      )}

      {tab === 'browse' && (
        <div className="space-y-6">
          <div className="hc-card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#4A636A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search case, reference..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15"
              />
            </div>
            <select value={beneficiaryCategory} onChange={(e) => setBeneficiaryCategory(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">All Beneficiary Categories</option>
              <option value="ORPHAN_GUARDIAN">Orphan / Guardian</option>
              <option value="DESTITUTE">Destitute</option>
              <option value="NEEDY">Needy</option>
            </select>
            <select value={needCategory} onChange={(e) => setNeedCategory(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">All 15 Need Categories</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <select value={county} onChange={(e) => setCounty(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">All Counties</option>
              <option value="Nakuru">Nakuru</option>
              <option value="Kisumu">Kisumu</option>
              <option value="Kilifi">Kilifi</option>
              <option value="Nairobi">Nairobi</option>
              <option value="Kajiado">Kajiado</option>
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">All Priority Tiers</option>
              <option value="P1_CRITICAL">P1 Critical</option>
              <option value="P2_URGENT">P2 Urgent</option>
              <option value="P3_HIGH">P3 High</option>
              <option value="P4_MODERATE">P4 Moderate</option>
              <option value="P5_DEVELOPMENTAL">P5 Developmental</option>
            </select>
            <select value={verifLevel} onChange={(e) => setVerifLevel(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">All Verification Levels</option>
              <option value="V4">V4 Safeguarding Cleared</option>
            </select>
            <select value={recurringFilter} onChange={(e) => setRecurringFilter(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">One-Time & Recurring</option>
              <option value="ONE_TIME">One-Time Needs</option>
              <option value="RECURRING">Recurring Needs</option>
            </select>
            <select value={fundingFilter} onChange={(e) => setFundingFilter(e.target.value)} className="px-3 py-2 text-xs rounded-xl bg-white border border-[#102E36]/15">
              <option value="ALL">Any Funding Progress</option>
              <option value="UNDER_50">Under 50% Funded</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCases.map((item) => (
              <BeneficiaryProfileCard
                key={item.id}
                item={item}
                isSaved={savedIds.has(item.id)}
                onToggleSave={async (id) => {
                  await apiFetch(`/api/supporter/saved/${id}`, { method: 'POST' });
                  await loadAll();
                }}
                onSponsor={(ben, need) =>
                  setCheckoutTarget({ pathway: 'DIRECT_SPONSORSHIP', beneficiary: ben, need })
                }
                onViewDetails={(ben) => setDetailCase(ben)}
              />
            ))}
          </div>

          {/* Central Humanitarian Funds Quick Contribute */}
          <div className="pt-6 border-t border-[#102E36]/10 space-y-4">
            <h3 className="text-lg font-bold text-[#102E36]">Contribute to Central Humanitarian Funds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(portal?.funds || []).map((f: any) => (
                <div key={f.id} className="hc-card p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono-num text-[#4A636A]">{f.code}</div>
                    <div className="text-sm font-bold text-[#102E36]">{f.name}</div>
                    <div className="text-xs text-[#287A59] font-mono-num mt-1">
                      Verified Pool: {formatMoney(f.availableBalanceMinor, f.currency)}
                    </div>
                  </div>
                  <GlossyButton
                    size="sm"
                    variant="green"
                    onClick={() =>
                      setCheckoutTarget({ pathway: 'CENTRAL_FUND', fundId: f.id, fundName: f.name })
                    }
                  >
                    Fund Pool
                  </GlossyButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'saved' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(portal?.savedBeneficiaries || []).length === 0 ? (
            <div className="hc-card p-8 col-span-full text-center text-sm text-[#4A636A]">
              <Bookmark className="w-6 h-6 text-[#D9A84E] mx-auto mb-2" />
              No saved beneficiaries yet. Bookmark cases while browsing to track updates.
            </div>
          ) : (
            publicCases
              .filter((c) => savedIds.has(c.id))
              .map((item) => (
                <BeneficiaryProfileCard
                  key={item.id}
                  item={item}
                  isSaved
                  onToggleSave={async (id) => {
                    await apiFetch(`/api/supporter/saved/${id}`, { method: 'POST' });
                    await loadAll();
                  }}
                  onSponsor={(ben, need) =>
                    setCheckoutTarget({ pathway: 'DIRECT_SPONSORSHIP', beneficiary: ben, need })
                  }
                />
              ))
          )}
        </div>
      )}

      {tab === 'contributions' && (
        <div className="hc-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[#102E36]">Contributions, Pledges & Verified Receipts</h3>
            <ExportReportBar
              title="Humanity Connect Supporter Contributions"
              rows={portal?.donations || []}
              csvFilename="humanity-connect-contributions.csv"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
                <tr>
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 pr-4">Pathway</th>
                  <th className="py-2.5 pr-4">Origin</th>
                  <th className="py-2.5 pr-4">Type</th>
                  <th className="py-2.5 pr-4">M-Pesa Receipt</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#102E36]/10">
                {(portal?.donations || []).map((d: any) => (
                  <tr key={d.id}>
                    <td className="py-3 pr-4 font-mono-num">
                      {new Date(d.createdAt).toLocaleDateString('en-KE')}
                    </td>
                    <td className="py-3 pr-4">{d.pathway}</td>
                    <td className="py-3 pr-4 font-semibold text-[#102E36]">
                      {d.originatedFromAiMatch ? 'AI Match' : 'Direct'}
                    </td>
                    <td className="py-3 pr-4">{d.isPledge ? 'Pledge (Unsettled)' : d.sponsorshipCoverage}</td>
                    <td className="py-3 pr-4 font-mono-num">{d.mpesaReceiptNumber || '—'}</td>
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

      {tab === 'recurring' && (
        <div className="hc-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-[#287A59]" />
            <h3 className="text-lg font-bold text-[#102E36]">Recurring Sponsorship Agreements</h3>
          </div>
          <p className="text-sm text-[#4A636A]">
            Recurring agreements require explicit supporter consent and can be paused or cancelled at any
            time. Beneficiaries are automatically notified when schedules change.
          </p>
          {(portal?.recurringSchedules || []).length === 0 ? (
            <p className="text-sm text-[#4A636A]">No recurring sponsorship schedules configured yet.</p>
          ) : (
            <div className="space-y-3">
              {portal.recurringSchedules.map((r: any) => (
                <div key={r.id} className="p-4 rounded-xl bg-white border border-[#102E36]/10 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono-num text-xs font-bold text-[#102E36]">{r.agreementReference}</div>
                    <div className="text-sm font-semibold text-[#102E36]">
                      {formatMoney(r.amountMinor, r.currency)} · {r.cadence}
                    </div>
                    <div className="text-xs text-[#4A636A]">
                      Status: {r.status} · Next charge: {new Date(r.nextChargeAt).toLocaleDateString('en-KE')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <GlossyButton
                      size="sm"
                      variant="ivory"
                      onClick={async () => {
                        await apiFetch(`/api/supporter/recurring/${r.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: r.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' }),
                        });
                        await loadAll();
                      }}
                    >
                      {r.status === 'PAUSED' ? 'Resume' : 'Pause'}
                    </GlossyButton>
                    <GlossyButton
                      size="sm"
                      variant="teal"
                      onClick={async () => {
                        await apiFetch(`/api/supporter/recurring/${r.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'CANCELLED' }),
                        });
                        await loadAll();
                      }}
                    >
                      Stop Future Payments
                    </GlossyButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'volunteer' && (
        <div className="hc-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#287A59]" />
            <h3 className="text-lg font-bold text-[#102E36]">Volunteer & Community Project Participation</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={volCounty}
              onChange={(e) => setVolCounty(e.target.value)}
              placeholder="Preferred Kenyan County"
              className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <input
              value={volSkills}
              onChange={(e) => setVolSkills(e.target.value)}
              placeholder="Skills (e.g. Tailoring mentorship, Solar engineering, Teaching)"
              className="px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <GlossyButton
            variant="green"
            onClick={async () => {
              await apiFetch('/api/supporter/volunteer', {
                method: 'POST',
                body: JSON.stringify({ county: volCounty, skillsSummary: volSkills }),
              });
              setVolSkills('');
              await loadAll();
              setFeedback('Volunteer assignment registered.');
            }}
          >
            Register Volunteer Availability
          </GlossyButton>
          <div className="divide-y divide-[#102E36]/10 pt-2">
            {(portal?.volunteerAssignments || []).map((v: any) => (
              <div key={v.id} className="py-3 text-sm flex justify-between">
                <span>{v.county} · {v.skillsSummary}</span>
                <span className="font-semibold text-[#287A59]">{v.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'messages' && (
        <div className="space-y-5">
          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">Safeguarded In-App Messaging</h3>
            </div>
            <p className="text-xs text-[#4A636A]">
              Direct unsupervised messaging to minor/child cases is automatically blocked by safeguarding policy.
            </p>
            <select
              value={msgTargetId}
              onChange={(e) => setMsgTargetId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            >
              <option value="">Select Verified Case (or Officer Support Desk)</option>
              {publicCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayAlias} ({c.referenceCode}) {c.isMinorCase ? '— Minor Protected' : ''}
                </option>
              ))}
            </select>
            <input
              value={msgSubject}
              onChange={(e) => setMsgSubject(e.target.value)}
              placeholder="Message Subject"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <textarea
              rows={3}
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              placeholder="Encouragement or project coordination note..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
            <GlossyButton
              variant="teal"
              onClick={async () => {
                setErrorMsg(null);
                try {
                  await apiFetch('/api/communications/message', {
                    method: 'POST',
                    body: JSON.stringify({
                      recipientBeneficiaryId: msgTargetId || undefined,
                      subject: msgSubject,
                      body: msgBody,
                    }),
                  });
                  setMsgSubject('');
                  setMsgBody('');
                  await loadAll();
                  setFeedback('Message delivered via Communication Centre.');
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Send Safeguarded Message
            </GlossyButton>
          </div>
          <NotificationList items={portal?.notifications || []} />
        </div>
      )}

      {tab === 'impact' && (
        <div className="space-y-6">
          <div className="hc-card p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D9A84E]" />
                <h3 className="text-lg font-bold text-[#102E36]">
                  AI Matching Engine Effectiveness (Automated Attribution)
                </h3>
              </div>
              <span className="text-xs font-mono-num text-[#4A636A]">
                {portal?.aiEffectiveness?.aiDonationsCount ?? 0} of{' '}
                {portal?.aiEffectiveness?.totalDonationsCount ?? 0} contributions via AI Match
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                <div className="text-xs text-[#4A636A]">AI-Matched Sponsorships</div>
                <div className="text-xl font-extrabold font-mono-num text-[#102E36] mt-1">
                  {portal?.aiEffectiveness?.aiSponsorshipsCount ?? 0}{' '}
                  <span className="text-xs font-normal text-[#4A636A]">
                    / {portal?.aiEffectiveness?.totalSponsorshipsCount ?? 0} ({portal?.aiEffectiveness?.aiSponsorshipSharePct ?? 0}%)
                  </span>
                </div>
                <div className="text-xs text-[#287A59] mt-1">
                  {portal?.aiEffectiveness?.activeAiSponsorshipsCount ?? 0} active verified
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                <div className="text-xs text-[#4A636A]">AI-Matched Settled Funding</div>
                <div className="text-xl font-extrabold font-mono-num text-[#287A59] mt-1">
                  {formatMoney(portal?.aiEffectiveness?.aiConfirmedAmountMinor ?? 0, 'KES')}
                </div>
                <div className="text-xs text-[#4A636A] mt-1 font-mono-num">
                  {portal?.aiEffectiveness?.aiShareOfConfirmedPct ?? 0}% of settled total
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                <div className="text-xs text-[#4A636A]">AI-Matched Pledges</div>
                <div className="text-xl font-extrabold font-mono-num text-[#B6721A] mt-1">
                  {formatMoney(portal?.aiEffectiveness?.aiPledgedAmountMinor ?? 0, 'KES')}
                </div>
                <div className="text-xs text-[#4A636A] mt-1">Tracked separately until settled</div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
                <div className="text-xs text-[#4A636A]">Direct / Manual Settled</div>
                <div className="text-xl font-extrabold font-mono-num text-[#102E36] mt-1">
                  {formatMoney(
                    Math.max(
                      0,
                      (portal?.aiEffectiveness?.totalConfirmedAmountMinor ?? 0) -
                        (portal?.aiEffectiveness?.aiConfirmedAmountMinor ?? 0)
                    ),
                    'KES'
                  )}
                </div>
                <div className="text-xs text-[#4A636A] mt-1">Non-AI browse or central funds</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#4A636A]">
                <span>Settled Impact Capital Share Originating from AI Match Suggestions</span>
                <span className="font-mono-num font-bold text-[#102E36]">
                  {portal?.aiEffectiveness?.aiShareOfConfirmedPct ?? 0}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#287A59]"
                  style={{ width: `${Math.min(100, portal?.aiEffectiveness?.aiShareOfConfirmedPct ?? 0)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="hc-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#287A59]" />
              <h3 className="text-lg font-bold text-[#102E36]">Verified Impact & Accountability Summary</h3>
            </div>
            <p className="text-sm text-[#4A636A]">
              100% of verified contributions enter ring-fenced trust accounts separate from platform revenue.
              Download your verified CSV ledger (including AI Match origin flags) or printable PDF statement anytime.
            </p>
            <ExportReportBar
              title="Humanity Connect Supporter Impact Report"
              rows={confirmedDonations}
              csvFilename="humanity-connect-impact-statement.csv"
            />
          </div>
        </div>
      )}

      {/* Case Detail Modal */}
      <ModalDialog
        open={Boolean(detailCase)}
        title={detailCase?.storyTitle || detailCase?.displayAlias || ''}
        subtitle={`${detailCase?.referenceCode || ''} · ${detailCase?.county || ''} County · V4 Verified`}
        onClose={() => setDetailCase(null)}
      >
        {detailCase && (
          <div className="space-y-4 text-sm text-[#4A636A]">
            <p>{detailCase.storySummary || detailCase.vulnerabilitySummary}</p>
            <div className="p-3 rounded-xl bg-[#EAE6DC]/50 text-xs text-[#102E36] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#287A59]" />
              Phone numbers and exact residential coordinates are hidden to protect household privacy.
            </div>
            <div className="space-y-2">
              <div className="font-bold text-[#102E36]">Approved Household Needs</div>
              {detailCase.needs.map((n) => (
                <div key={n.id} className="p-3 rounded-xl border border-[#102E36]/15 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[#102E36]">{n.title}</div>
                    <div className="text-xs font-mono-num">
                      {formatMoney(n.fulfilledAmountMinor, n.currency)} / {formatMoney(n.targetAmountMinor, n.currency)}
                    </div>
                  </div>
                  <GlossyButton
                    size="sm"
                    variant="gold"
                    onClick={() => {
                      setDetailCase(null);
                      setCheckoutTarget({ pathway: 'DIRECT_SPONSORSHIP', beneficiary: detailCase, need: n });
                    }}
                  >
                    Sponsor
                  </GlossyButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Sponsorship & M-Pesa Daraja Checkout Modal */}
      <ModalDialog
        open={Boolean(checkoutTarget)}
        title={
          checkoutTarget?.pathway === 'DIRECT_SPONSORSHIP'
            ? `Sponsor ${checkoutTarget.beneficiary?.displayAlias}`
            : `Contribute to ${checkoutTarget?.fundName}`
        }
        subtitle="Strict Financial Rule: Pledges never count as received cash. M-Pesa requires server-verified Daraja confirmation."
        onClose={() => {
          setCheckoutTarget(null);
          setPendingStk(null);
          setStkStatus(null);
        }}
      >
        {checkoutTarget && !pendingStk && (
          <div className="space-y-4">
            {errorMsg && <p role="alert" className="text-sm text-red-700">{errorMsg}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Amount (KES)</label>
                <input
                  type="number"
                  min={100}
                  value={amountKes}
                  onChange={(e) => setAmountKes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">Coverage Type</label>
                <select
                  value={coverage}
                  onChange={(e) => setCoverage(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
                >
                  <option value="PARTIAL">Partial Sponsorship / Contribution</option>
                  <option value="FULL">Full Need Sponsorship</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPayMode('MPESA_STK')}
                className={`p-3 rounded-xl border text-left text-xs ${
                  payMode === 'MPESA_STK' ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]' : 'bg-white border-[#102E36]/15'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#D9A84E]" /> Safaricom M-Pesa STK Push
                </div>
                <div className="opacity-80 mt-0.5">Instant backend Daraja prompt</div>
              </button>
              <button
                type="button"
                onClick={() => setPayMode('PLEDGE_ONLY')}
                className={`p-3 rounded-xl border text-left text-xs ${
                  payMode === 'PLEDGE_ONLY' ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]' : 'bg-white border-[#102E36]/15'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4 text-[#D9A84E]" /> Record Commitment Pledge
                </div>
                <div className="opacity-80 mt-0.5">Recorded separately from settled cash</div>
              </button>
            </div>

            {payMode === 'MPESA_STK' && (
              <div>
                <p className="text-sm mb-2">M-Pesa Paybill: <strong>{MPESA_PAYBILL}</strong> · Account: <strong>{MPESA_ACCOUNT}</strong></p>
                <label className="block text-xs font-semibold text-[#102E36] mb-1">M-Pesa Phone Number</label>
                <input
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="+254712345678"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
                />
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#EAE6DC]/50 space-y-2 text-xs">
              <label className="flex items-center gap-2 font-semibold text-[#102E36]">
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                Make this a Recurring Sponsorship Agreement
              </label>
              {isRecurring && (
                <div className="space-y-2 pt-1">
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#102E36]/15"
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="SCHOOL_TERM">School Term (Every 4 Months)</option>
                    <option value="ANNUALLY">Annually</option>
                    <option value="CUSTOM">Custom Schedule</option>
                  </select>
                  <label className="flex items-center gap-2 text-[#287A59]">
                    <input type="checkbox" checked={consentSigned} onChange={(e) => setConsentSigned(e.target.checked)} />
                    I explicitly consent to this recurring schedule (cancellable anytime).
                  </label>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/10 space-y-2 text-xs">
              <label className="flex items-center gap-2 font-semibold text-[#102E36]">
                <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} />
                <Gift className="w-3.5 h-3.5 text-[#D9A84E]" /> Dedicate as a Gift Donation
              </label>
              {isGift && (
                <input
                  value={giftHonoree}
                  onChange={(e) => setGiftHonoree(e.target.value)}
                  placeholder="Honoree Name"
                  className="w-full px-3 py-2 rounded-lg border border-[#102E36]/15"
                />
              )}
            </div>

            <GlossyButton
              variant="gold"
              size="lg"
              className="w-full"
              disabled={paymentBusy}
              onClick={async () => {
                if (paymentBusy) return;
                setPaymentBusy(true);
                setErrorMsg(null);
                try {
                  const amountMinor = Math.round(Number(amountKes || 0) * 100);
                  const res = await apiFetch<any>('/api/supporter/checkout', {
                    method: 'POST',
                    body: JSON.stringify({
                      pathway: checkoutTarget.pathway,
                      beneficiaryId: checkoutTarget.beneficiary?.id,
                      needRequestId: checkoutTarget.need?.id,
                      fundId: checkoutTarget.fundId,
                      amountMinor,
                      currency: 'KES',
                      mode: payMode,
                      phoneE164: mpesaPhone,
                      sponsorshipCoverage: coverage,
                      isRecurring,
                      cadence,
                      supporterConsentGranted: consentSigned,
                      isGiftDonation: isGift,
                      giftHonoreeName: giftHonoree,
                      originatedFromAiMatch: checkoutTarget.originatedFromAiMatch ?? false,
                      matchSuggestionId: checkoutTarget.matchSuggestionId,
                    }),
                  });
                  if (payMode === 'MPESA_STK' && res.paymentTx?.checkoutRequestId) {
                    setStkStatus({ status: 'CALLBACK_PENDING' });
                    setPendingStk({
                      checkoutRequestId: res.paymentTx.checkoutRequestId,
                      amountMinor,
                    });
                  } else {
                    setCheckoutTarget(null);
                    await loadAll();
                    setFeedback('Pledge recorded separately from settled cash.');
                  }
                } catch (err: any) {
                  setErrorMsg(err.message);
                } finally {
                  setPaymentBusy(false);
                }
              }}
            >
              {paymentBusy ? 'Processing...' : payMode === 'MPESA_STK' ? 'Initiate M-Pesa STK Push' : 'Record Pledge Commitment'}
            </GlossyButton>
          </div>
        )}

        {pendingStk && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl text-sm space-y-2 border ${
                stkStatus?.status === 'VERIFIED'
                  ? 'bg-[#287A59]/10 border-[#287A59]/30'
                  : stkStatus?.status === 'FAILED'
                    ? 'bg-[#9F2D20]/10 border-[#9F2D20]/25'
                    : 'bg-[#EAE6DC]/60 border-[#102E36]/10'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-[#102E36]">
                {stkStatus?.status === 'VERIFIED' && (
                  <CheckCircle2 className="w-5 h-5 text-[#287A59] shrink-0" />
                )}
                <span>
                  {stkStatus?.status === 'VERIFIED'
                    ? 'M-Pesa Donation Verified & Settled!'
                    : stkStatus?.status === 'FAILED'
                      ? 'M-Pesa Payment Not Completed'
                      : 'Awaiting Server-Side Daraja Callback'}
                </span>
              </div>
              <div className="text-xs font-mono-num text-[#102E36] font-semibold">
                Paybill: {MPESA_PAYBILL} · Account: {MPESA_ACCOUNT} · Amount: {formatMoney(pendingStk.amountMinor, 'KES')}
              </div>
              <div className="text-xs font-mono-num text-[#4A636A]">
                CheckoutRequestID: {pendingStk.checkoutRequestId}
              </div>
              {stkStatus?.mpesaReceiptNumber && (
                <div className="text-xs font-mono-num font-bold text-[#287A59]">
                  M-Pesa Receipt: {stkStatus.mpesaReceiptNumber}
                </div>
              )}
              <p className="text-xs text-[#4A636A]">
                {stkStatus?.status === 'VERIFIED'
                  ? 'Your contribution has been credited to the ring-fenced trust ledger.'
                  : stkStatus?.status === 'FAILED'
                    ? 'The STK prompt was declined or expired. No funds were deducted.'
                    : 'Check your phone for the M-Pesa prompt. Your contribution remains pending until the provider confirms it.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stkStatus?.status !== 'VERIFIED' && (
                <GlossyButton
                  variant="teal"
                  onClick={() => checkPendingStkStatus(pendingStk.checkoutRequestId)}
                >
                  Check Payment Status
                </GlossyButton>
              )}
              <GlossyButton
                variant="ivory"
                onClick={async () => {
                  setPendingStk(null);
                  setStkStatus(null);
                  setCheckoutTarget(null);
                  await loadAll();
                }}
              >
                Close
              </GlossyButton>
            </div>
          </div>
        )}
      </ModalDialog>

      <WhyMatchModal
        open={Boolean(whyMatchTarget)}
        beneficiaryId={whyMatchTarget?.beneficiaryId || null}
        beneficiaryAlias={whyMatchTarget?.displayAlias}
        county={whyMatchTarget?.county}
        compositeScore={whyMatchTarget?.compositeScore}
        onClose={() => setWhyMatchTarget(null)}
        onSponsor={() => {
          if (whyMatchTarget) {
            openCheckoutFromMatch(whyMatchTarget, 5000);
          }
        }}
      />
    </div>
  );
};
