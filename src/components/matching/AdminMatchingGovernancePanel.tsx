import React, { useEffect, useState } from 'react';
import { Sliders, Sparkles, ShieldCheck, Save, RefreshCw, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlossyButton, ExportReportBar, formatMoney } from '../ui/DesignSystem';

interface AdminMatchingOverview {
  config: {
    id: string;
    algorithmName: string;
    weightNeedAlignment: number;
    weightLocationFocus: number;
    weightBudgetFit: number;
    weightUrgencyImpact: number;
    weightAgeDemographics: number;
    prioritiseUnderfundedPct: number;
    minThresholdScore: number;
    enableGeminiAnalysis: boolean;
    requireHumanSafeguardGate: boolean;
    transparencyNotes: string;
    normalizedWeights: {
      need: number;
      location: number;
      budget: number;
      urgency: number;
      age: number;
    };
    updatedAt: string;
  };
  recentSuggestions: Array<{
    id: string;
    supporterName: string;
    supporterType: string;
    orgName: string | null;
    beneficiaryAlias: string;
    beneficiaryRef: string;
    county: string;
    compositeScore: number;
    breakdownJson: {
      needScore: number;
      locationScore: number;
      budgetScore: number;
      urgencyScore: number;
      ageScore: number;
      geminiDelta: number;
    };
    geminiRationale: string | null;
    recommendedApproach: string | null;
    usedModel: string | null;
    status: string;
    createdAt: string;
  }>;
  stats: {
    totalSuggestions: number;
    avgScore: number;
    sponsoredCount: number;
    savedCount: number;
  };
  effectiveness: {
    totalDonationsCount: number;
    aiDonationsCount: number;
    aiDonationSharePct: number;
    totalConfirmedAmountMinor: number;
    aiConfirmedAmountMinor: number;
    aiPledgedAmountMinor: number;
    aiShareOfConfirmedPct: number;
    totalSponsorshipsCount: number;
    aiSponsorshipsCount: number;
    activeAiSponsorshipsCount: number;
    aiSponsorshipSharePct: number;
    suggestionConversionRatePct: number;
    avgConvertedScore: number;
  };
}

export const AdminMatchingGovernancePanel: React.FC = () => {
  const { apiFetch } = useAuth();
  const [overview, setOverview] = useState<AdminMatchingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable config fields
  const [algorithmName, setAlgorithmName] = useState('Humanity Connect Dynamic Impact Matcher');
  const [wNeed, setWNeed] = useState(30);
  const [wLocation, setWLocation] = useState(20);
  const [wBudget, setWBudget] = useState(20);
  const [wUrgency, setWUrgency] = useState(20);
  const [wAge, setWAge] = useState(10);
  const [underfundedPct, setUnderfundedPct] = useState(60);
  const [minThreshold, setMinThreshold] = useState(35);
  const [enableGemini, setEnableGemini] = useState(true);
  const [requireSafeguard, setRequireSafeguard] = useState(true);
  const [transparencyNotes, setTransparencyNotes] = useState('');

  const loadOverview = async () => {
    setErrorMsg(null);
    try {
      const res = await apiFetch<AdminMatchingOverview>('/api/matching/admin/overview');
      setOverview(res);
      const c = res.config;
      setAlgorithmName(c.algorithmName);
      setWNeed(c.weightNeedAlignment);
      setWLocation(c.weightLocationFocus);
      setWBudget(c.weightBudgetFit);
      setWUrgency(c.weightUrgencyImpact);
      setWAge(c.weightAgeDemographics);
      setUnderfundedPct(c.prioritiseUnderfundedPct);
      setMinThreshold(c.minThresholdScore);
      setEnableGemini(c.enableGeminiAnalysis);
      setRequireSafeguard(c.requireHumanSafeguardGate);
      setTransparencyNotes(c.transparencyNotes);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load matching governance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const totalRaw = Math.max(1, wNeed + wLocation + wBudget + wUrgency + wAge);
  const norm = {
    need: Math.round((wNeed / totalRaw) * 100),
    location: Math.round((wLocation / totalRaw) * 100),
    budget: Math.round((wBudget / totalRaw) * 100),
    urgency: Math.round((wUrgency / totalRaw) * 100),
  };
  const normAge = Math.max(0, 100 - (norm.need + norm.location + norm.budget + norm.urgency));

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await apiFetch('/api/matching/admin/config', {
        method: 'PUT',
        body: JSON.stringify({
          algorithmName,
          weightNeedAlignment: wNeed,
          weightLocationFocus: wLocation,
          weightBudgetFit: wBudget,
          weightUrgencyImpact: wUrgency,
          weightAgeDemographics: wAge,
          prioritiseUnderfundedPct: underfundedPct,
          minThresholdScore: minThreshold,
          enableGeminiAnalysis: enableGemini,
          requireHumanSafeguardGate: requireSafeguard,
          transparencyNotes,
        }),
      });
      await loadOverview();
      setFeedback('Matching algorithm weights and transparency rules saved to database and audited.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save matching algorithm configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="hc-card p-8 text-center text-sm text-[#4A636A]">
        Loading Dynamic Sponsorship Matching Engine Governance...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hc-card p-5">
          <div className="text-xs text-[#4A636A]">Proactive Match Suggestions</div>
          <div className="text-2xl font-extrabold font-mono-num text-[#102E36] mt-1">
            {overview?.stats.totalSuggestions ?? 0}
          </div>
          <div className="text-xs text-[#4A636A] mt-1">Logged for transparency</div>
        </div>
        <div className="hc-card p-5">
          <div className="text-xs text-[#4A636A]">Average Match Score</div>
          <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
            {overview?.stats.avgScore ?? 0}%
          </div>
          <div className="text-xs text-[#4A636A] mt-1">Across verified cases</div>
        </div>
        <div className="hc-card p-5">
          <div className="text-xs text-[#4A636A]">Converted to Sponsorship</div>
          <div className="text-2xl font-extrabold font-mono-num text-[#287A59] mt-1">
            {overview?.stats.sponsoredCount ?? 0}
          </div>
          <div className="text-xs text-[#4A636A] mt-1">Direct or batch commitments</div>
        </div>
        <div className="hc-card p-5">
          <div className="text-xs text-[#4A636A]">Saved Shortlists</div>
          <div className="text-2xl font-extrabold font-mono-num text-[#B6721A] mt-1">
            {overview?.stats.savedCount ?? 0}
          </div>
          <div className="text-xs text-[#4A636A] mt-1">Active sponsor bookmarks</div>
        </div>
      </div>

      {/* Automated AI Matching Effectiveness & Impact Report */}
      {overview?.effectiveness && (
        <div className="hc-card p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#287A59] flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Automated Impact Dashboard Attribution
              </div>
              <h3 className="text-lg font-bold text-[#102E36]">
                AI Matching Engine Effectiveness & Conversion Report
              </h3>
              <p className="text-xs text-[#4A636A]">
                Automatically computed from <code>donations.originated_from_ai_match</code> and{' '}
                <code>sponsorships.originated_from_ai_match</code> ledger records.
              </p>
            </div>
            <ExportReportBar
              title="Humanity Connect AI Matching Effectiveness Report"
              rows={[
                {
                  metric_period: 'All-Time Platform Ledger',
                  total_suggestions: overview.stats.totalSuggestions,
                  suggestion_conversion_rate_pct: overview.effectiveness.suggestionConversionRatePct,
                  avg_suggestion_score_pct: overview.stats.avgScore,
                  avg_converted_score_pct: overview.effectiveness.avgConvertedScore,
                  ai_sponsorships: overview.effectiveness.aiSponsorshipsCount,
                  active_ai_sponsorships: overview.effectiveness.activeAiSponsorshipsCount,
                  total_sponsorships: overview.effectiveness.totalSponsorshipsCount,
                  ai_sponsorship_share_pct: overview.effectiveness.aiSponsorshipSharePct,
                  ai_donations_count: overview.effectiveness.aiDonationsCount,
                  total_donations_count: overview.effectiveness.totalDonationsCount,
                  ai_confirmed_kes: Math.round(overview.effectiveness.aiConfirmedAmountMinor / 100),
                  total_confirmed_kes: Math.round(overview.effectiveness.totalConfirmedAmountMinor / 100),
                  ai_confirmed_capital_share_pct: overview.effectiveness.aiShareOfConfirmedPct,
                  ai_pledged_kes: Math.round(overview.effectiveness.aiPledgedAmountMinor / 100),
                },
              ]}
              csvFilename="ai-matching-effectiveness-report.csv"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
              <div className="text-xs text-[#4A636A]">AI-Originated Sponsorship Share</div>
              <div className="text-xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {overview.effectiveness.aiSponsorshipsCount}{' '}
                <span className="text-xs font-normal text-[#4A636A]">
                  / {overview.effectiveness.totalSponsorshipsCount} ({overview.effectiveness.aiSponsorshipSharePct}%)
                </span>
              </div>
              <div className="text-xs text-[#287A59] mt-1">
                {overview.effectiveness.activeAiSponsorshipsCount} active AI-matched commitments
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
              <div className="text-xs text-[#4A636A]">Settled Capital via AI Matches</div>
              <div className="text-xl font-extrabold font-mono-num text-[#287A59] mt-1">
                {formatMoney(overview.effectiveness.aiConfirmedAmountMinor, 'KES')}
              </div>
              <div className="text-xs text-[#4A636A] mt-1 font-mono-num">
                {overview.effectiveness.aiShareOfConfirmedPct}% of{' '}
                {formatMoney(overview.effectiveness.totalConfirmedAmountMinor, 'KES')} total settled
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
              <div className="text-xs text-[#4A636A]">Suggestion-to-Sponsorship Rate</div>
              <div className="text-xl font-extrabold font-mono-num text-[#102E36] mt-1">
                {overview.effectiveness.suggestionConversionRatePct}%
              </div>
              <div className="text-xs text-[#4A636A] mt-1 font-mono-num">
                Avg converted score: {overview.effectiveness.avgConvertedScore}% vs {overview.stats.avgScore}% overall
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10">
              <div className="text-xs text-[#4A636A]">AI-Matched Donations & Pledges</div>
              <div className="text-xl font-extrabold font-mono-num text-[#B6721A] mt-1">
                {overview.effectiveness.aiDonationsCount}{' '}
                <span className="text-xs font-normal text-[#4A636A]">
                  / {overview.effectiveness.totalDonationsCount} ({overview.effectiveness.aiDonationSharePct}%)
                </span>
              </div>
              <div className="text-xs text-[#4A636A] mt-1 font-mono-num">
                Open pledges: {formatMoney(overview.effectiveness.aiPledgedAmountMinor, 'KES')}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#4A636A]">
              <span>Platform Settled Capital Originating from AI Match Engine vs Direct / Manual Giving</span>
              <span className="font-mono-num font-bold text-[#102E36]">
                {overview.effectiveness.aiShareOfConfirmedPct}% AI-Matched
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#287A59]"
                style={{ width: `${Math.min(100, overview.effectiveness.aiShareOfConfirmedPct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

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

      {/* Configurable Algorithm Weights & Policy Panel */}
      <form onSubmit={saveConfig} className="hc-card p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#287A59] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Transparent & Configurable Matching Algorithm
            </div>
            <h3 className="text-lg font-bold text-[#102E36]">
              Scoring Weights, Thresholds & Gemini Contextual Controls
            </h3>
          </div>

          <GlossyButton type="button" size="sm" variant="ivory" onClick={loadOverview}>
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Live Stats
          </GlossyButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Algorithm Label (Shown to Sponsors)
            </label>
            <input
              value={algorithmName}
              onChange={(e) => setAlgorithmName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Underfunded Priority Boost Threshold ({underfundedPct}%)
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={underfundedPct}
              onChange={(e) => setUnderfundedPct(Number(e.target.value))}
              className="w-full accent-[#287A59]"
            />
            <div className="text-xs text-[#4A636A]">
              Needs below {underfundedPct}% funded receive urgency impact priority.
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Minimum Surface Score ({minThreshold}%)
            </label>
            <input
              type="range"
              min={0}
              max={85}
              value={minThreshold}
              onChange={(e) => setMinThreshold(Number(e.target.value))}
              className="w-full accent-[#102E36]"
            />
            <div className="text-xs text-[#4A636A]">
              Suggestions below {minThreshold}% are filtered out automatically.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
          {[
            {
              label: 'Need & Interest Alignment',
              raw: wNeed,
              pct: norm.need,
              setter: setWNeed,
            },
            {
              label: 'Location / County Focus',
              raw: wLocation,
              pct: norm.location,
              setter: setWLocation,
            },
            {
              label: 'Donation Budget Fit',
              raw: wBudget,
              pct: norm.budget,
              setter: setWBudget,
            },
            {
              label: 'Urgency & Gap Impact',
              raw: wUrgency,
              pct: norm.urgency,
              setter: setWUrgency,
            },
            {
              label: 'Age Group & Challenges',
              raw: wAge,
              pct: normAge,
              setter: setWAge,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-2"
            >
              <div className="text-xs font-semibold text-[#102E36]">{item.label}</div>
              <div className="flex items-baseline justify-between font-mono-num">
                <span className="text-xl font-extrabold text-[#287A59]">{item.pct}%</span>
                <span className="text-xs text-[#4A636A]">raw: {item.raw}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={item.raw}
                onChange={(e) => item.setter(Number(e.target.value))}
                className="w-full accent-[#287A59]"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="p-4 rounded-xl bg-white border border-[#102E36]/12 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableGemini}
              onChange={(e) => setEnableGemini(e.target.checked)}
              className="mt-1"
            />
            <div className="text-xs space-y-1">
              <div className="font-bold text-[#102E36] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D9A84E]" />
                Enable Gemini AI Contextual Profile Analysis (gemini-4-hydrogen)
              </div>
              <p className="text-[#4A636A]">
                Evaluates beneficiary age groups, specific household challenges, and sponsor impact
                goals with bounded (-5 to +10 pt) advisory calibration.
              </p>
            </div>
          </label>

          <label className="p-4 rounded-xl bg-white border border-[#102E36]/12 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requireSafeguard}
              onChange={(e) => setRequireSafeguard(e.target.checked)}
              className="mt-1"
            />
            <div className="text-xs space-y-1">
              <div className="font-bold text-[#102E36] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#287A59]" />
                Enforce V4 Verification & Safeguarding Gate
              </div>
              <p className="text-[#4A636A]">
                Ensures only V4-verified, safeguarding-cleared, consent-approved profiles can ever be
                recommended to sponsors. Never exposes private PII.
              </p>
            </div>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#102E36] mb-1">
            Public Transparency Statement
          </label>
          <textarea
            rows={2}
            value={transparencyNotes}
            onChange={(e) => setTransparencyNotes(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono-num text-[#4A636A]">
            Normalized Total: {norm.need + norm.location + norm.budget + norm.urgency + normAge}%
          </div>
          <GlossyButton type="submit" variant="gold" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving Configuration...' : 'Save Matching Configuration'}
          </GlossyButton>
        </div>
      </form>

      {/* Transparent Match Audit Ledger */}
      <div className="hc-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#102E36]">
            Recent AI Sponsorship Match Recommendations & Outcomes
          </h3>
          <p className="text-xs text-[#4A636A]">
            Full auditability of every score breakdown, Gemini model used, and sponsor conversion status.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#102E36]/15 text-[#4A636A]">
              <tr>
                <th className="py-2.5 pr-4">Sponsor / Institution</th>
                <th className="py-2.5 pr-4">Matched Beneficiary</th>
                <th className="py-2.5 pr-4 text-right">Score</th>
                <th className="py-2.5 pr-4">Breakdown (N/L/B/U/A/AI)</th>
                <th className="py-2.5 pr-4">Model</th>
                <th className="py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#102E36]/10">
              {(overview?.recentSuggestions || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#4A636A]">
                    No match suggestions logged yet. Matches populate automatically when sponsors open their portals.
                  </td>
                </tr>
              ) : (
                overview!.recentSuggestions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4">
                      <div className="font-bold text-[#102E36]">
                        {s.orgName || s.supporterName}
                      </div>
                      <div className="text-[#4A636A]">{s.supporterType}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-[#102E36]">{s.beneficiaryAlias}</div>
                      <div className="font-mono-num text-[#4A636A]">
                        {s.beneficiaryRef} · {s.county}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono-num font-extrabold text-[#102E36]">
                      {s.compositeScore}%
                    </td>
                    <td className="py-3 pr-4 font-mono-num text-[#4A636A]">
                      {s.breakdownJson.needScore}/{s.breakdownJson.locationScore}/
                      {s.breakdownJson.budgetScore}/{s.breakdownJson.urgencyScore}/
                      {s.breakdownJson.ageScore} (
                      {s.breakdownJson.geminiDelta >= 0
                        ? `+${s.breakdownJson.geminiDelta}`
                        : s.breakdownJson.geminiDelta}
                      )
                    </td>
                    <td className="py-3 pr-4 font-mono-num">{s.usedModel || '—'}</td>
                    <td className="py-3 font-semibold text-[#287A59]">{s.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
