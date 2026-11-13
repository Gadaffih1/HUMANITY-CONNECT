import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  SlidersHorizontal,
  HeartHandshake,
  Bookmark,
  X,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlossyButton, formatMoney, priorityLabel } from '../ui/DesignSystem';

export interface MatchBreakdown {
  needScore: number;
  locationScore: number;
  budgetScore: number;
  urgencyScore: number;
  ageScore: number;
  geminiDelta: number;
  weights: {
    need: number;
    location: number;
    budget: number;
    urgency: number;
    age: number;
  };
  factorNotes: string[];
}

export interface MatchRecommendationItem {
  suggestionId?: string;
  beneficiaryId: string;
  referenceCode: string;
  displayAlias: string;
  county: string;
  classification: string;
  ageGroup: string;
  isMinorCase: boolean;
  specificChallenges: string[];
  storyTitle: string | null;
  storySummary: string | null;
  coverImagePath: string | null;
  primaryNeed: {
    id: string;
    referenceCode: string;
    title: string;
    categoryCode: string;
    categoryName: string;
    priorityTier: string;
    targetAmountMinor: number;
    fulfilledAmountMinor: number;
    remainingGapMinor: number;
    currency: string;
    isRecurring: boolean;
    frequency: string;
  } | null;
  allNeedCategories: string[];
  compositeScore: number;
  breakdown: MatchBreakdown;
  geminiRationale: string;
  geminiImpactProjection: string;
  recommendedApproach: string;
  usedModel: string;
  status: string;
}

export interface MatchingResponsePayload {
  config: {
    algorithmName: string;
    normalizedWeights: {
      need: number;
      location: number;
      budget: number;
      urgency: number;
      age: number;
    };
    prioritiseUnderfundedPct: number;
    minThresholdScore: number;
    enableGeminiAnalysis: boolean;
    requireHumanSafeguardGate: boolean;
    transparencyNotes: string;
  };
  preferences: {
    sponsorEntityType: 'INDIVIDUAL' | 'COMPANY' | 'INSTITUTION';
    budgetMinor: number;
    currency: string;
    preferredCadence: 'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'TERMLY' | 'QUARTERLY' | 'ANNUALLY';
    interestCategories: string[];
    locationFocus: string[];
    preferredAgeGroups: string[];
    preferredClassifications: string[];
    impactGoal: string;
    proactiveOptIn: boolean;
  };
  matches: MatchRecommendationItem[];
  aiUsed: boolean;
  aiStatusNote: string;
}

const AGE_GROUP_OPTIONS = [
  { code: 'ALL', label: 'All Age Groups' },
  { code: 'CHILDREN_5_17', label: 'Children & Youth (5–17)' },
  { code: 'YOUNG_ADULT_18_25', label: 'Young Adults (18–25)' },
  { code: 'ADULT_26_59', label: 'Adult Households (26–59)' },
  { code: 'ELDERLY_60_PLUS', label: 'Elderly Stewards (60+)' },
  { code: 'MULTI_GENERATIONAL', label: 'Multi-Generational' },
];

const COUNTY_OPTIONS = ['ALL', 'Nakuru', 'Kisumu', 'Kilifi', 'Nairobi', 'Kajiado', 'Mombasa', 'Eldoret'];

export function formatAgeGroupLabel(code: string): string {
  const hit = AGE_GROUP_OPTIONS.find((a) => a.code === code);
  return hit ? hit.label : code.replace(/_/g, ' ');
}

export const SponsorshipMatchingPanel: React.FC<{
  portalMode: 'SUPPORTIVE' | 'CORPORATE';
  categories: Array<{ code: string; name: string }>;
  onSponsorMatch: (match: MatchRecommendationItem, suggestedAmountKes: number) => void;
  onAddToBatch?: (beneficiaryId: string) => void;
  batchSelectedIds?: string[];
  onDataChanged?: () => void;
}> = ({
  portalMode,
  categories,
  onSponsorMatch,
  onAddToBatch,
  batchSelectedIds = [],
  onDataChanged,
}) => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<MatchingResponsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable preferences state
  const [entityType, setEntityType] = useState<'INDIVIDUAL' | 'COMPANY' | 'INSTITUTION'>(
    portalMode === 'CORPORATE' ? 'COMPANY' : 'INDIVIDUAL'
  );
  const [budgetKes, setBudgetKes] = useState(portalMode === 'CORPORATE' ? '25000' : '6000');
  const [cadence, setCadence] = useState<
    'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'TERMLY' | 'QUARTERLY' | 'ANNUALLY'
  >('MONTHLY');
  const [interestCategories, setInterestCategories] = useState<string[]>([
    'EDUCATION',
    'FOOD',
    'MEDICAL',
  ]);
  const [locationFocus, setLocationFocus] = useState<string[]>(['ALL']);
  const [preferredAgeGroups, setPreferredAgeGroups] = useState<string[]>(['ALL']);
  const [impactGoal, setImpactGoal] = useState('');
  const [proactiveOptIn, setProactiveOptIn] = useState(true);

  const hydrateFromPayload = (res: MatchingResponsePayload) => {
    setData(res);
    setEntityType(res.preferences.sponsorEntityType);
    setBudgetKes(String(Math.round(res.preferences.budgetMinor / 100)));
    setCadence(res.preferences.preferredCadence);
    setInterestCategories(res.preferences.interestCategories || ['EDUCATION']);
    setLocationFocus(res.preferences.locationFocus || ['ALL']);
    setPreferredAgeGroups(res.preferences.preferredAgeGroups || ['ALL']);
    setImpactGoal(res.preferences.impactGoal || '');
    setProactiveOptIn(res.preferences.proactiveOptIn);
  };

  const loadRecommendations = async (refreshAi = true) => {
    setErrorMsg(null);
    if (!data) setLoading(true);
    else setRunning(true);
    try {
      const res = await apiFetch<MatchingResponsePayload>(
        `/api/matching/recommendations?refreshAi=${refreshAi ? 'true' : 'false'}`
      );
      hydrateFromPayload(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to compute sponsorship matches.');
    } finally {
      setLoading(false);
      setRunning(false);
    }
  };

  useEffect(() => {
    loadRecommendations(true);
  }, []);

  const toggleItem = (
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
    allowAllReset = false
  ) => {
    if (allowAllReset && value === 'ALL') {
      setter(['ALL']);
      return;
    }
    const filtered = allowAllReset ? list.filter((i) => i !== 'ALL') : [...list];
    if (filtered.includes(value)) {
      const next = filtered.filter((i) => i !== value);
      setter(next.length > 0 ? next : allowAllReset ? ['ALL'] : [value]);
    } else {
      setter([...filtered, value]);
    }
  };

  const handleSaveAndMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);
    setRunning(true);
    try {
      const budgetMinor = Math.max(10000, Math.round(Number(budgetKes || 0) * 100));
      const res = await apiFetch<MatchingResponsePayload>('/api/matching/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          sponsorEntityType: entityType,
          budgetMinor,
          currency: 'KES',
          preferredCadence: cadence,
          interestCategories,
          locationFocus,
          preferredAgeGroups,
          impactGoal:
            impactGoal.trim() ||
            'Support high-urgency verified households and sustainable empowerment.',
          proactiveOptIn,
        }),
      });
      hydrateFromPayload(res);
      setShowPrefs(false);
      setFeedback(
        `Preferences saved and ${res.matches.length} verified match(es) ranked (${res.aiUsed ? 'Gemini AI + Weighted Engine' : 'Weighted Engine'}).`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save matching preferences.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="hc-card p-8 text-center text-sm text-[#4A636A]">
        Analyzing V4-verified beneficiary profiles and sponsor preferences...
      </div>
    );
  }

  const weights = data?.config.normalizedWeights;

  return (
    <div className="space-y-6">
      {/* Header & Transparency Bar */}
      <div className="hc-card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="text-xs font-semibold text-[#287A59]">
              Dynamic Sponsorship Matching Engine · {data?.config.algorithmName}
            </div>
            <h3 className="text-xl font-extrabold text-[#102E36]">
              {portalMode === 'CORPORATE'
                ? 'Institutional & CSR Beneficiary Match Recommendations'
                : 'Proactive Household & Need Match Recommendations'}
            </h3>
            <p className="text-xs text-[#4A636A] leading-relaxed">
              {data?.aiStatusNote} Only V4-verified, safeguarding-cleared, and consent-approved profiles
              are evaluated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <GlossyButton
              size="sm"
              variant="ivory"
              onClick={() => setShowPrefs((p) => !p)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showPrefs ? 'Hide Preferences' : 'Configure Preferences'}
            </GlossyButton>
            <GlossyButton
              size="sm"
              variant="teal"
              disabled={running}
              onClick={() => loadRecommendations(true)}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Matching...' : 'Refresh AI Matches'}
            </GlossyButton>
          </div>
        </div>

        {/* Active Weight Transparency Strip */}
        {weights && (
          <div className="pt-3 border-t border-[#102E36]/10 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A636A]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num">
              <span className="font-semibold text-[#102E36]">Active Admin Weights:</span>
              <span>Need {weights.need}%</span>
              <span aria-hidden="true">·</span>
              <span>Location {weights.location}%</span>
              <span aria-hidden="true">·</span>
              <span>Budget {weights.budget}%</span>
              <span aria-hidden="true">·</span>
              <span>Urgency & Gap {weights.urgency}%</span>
              <span aria-hidden="true">·</span>
              <span>Age & Challenges {weights.age}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#287A59] font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Safeguarding & Privacy Gate Active</span>
            </div>
          </div>
        )}
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

      {/* Sponsor Preference Configurator */}
      {showPrefs && (
        <form onSubmit={handleSaveAndMatch} className="hc-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-bold text-[#102E36]">
                Sponsor Matching Profile & Criteria
              </h4>
              <p className="text-xs text-[#4A636A]">
                Customise your donation capacity, interest categories, Kenyan county focus, and target age groups.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#102E36] cursor-pointer">
              <input
                type="checkbox"
                checked={proactiveOptIn}
                onChange={(e) => setProactiveOptIn(e.target.checked)}
              />
              Proactive Dashboard Suggestions
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">
                Sponsor Classification
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="INDIVIDUAL">Individual Sponsor</option>
                <option value="COMPANY">Company / Corporate CSR</option>
                <option value="INSTITUTION">Institution / Foundation / NGO</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">
                Target Contribution Budget (KES)
              </label>
              <input
                type="number"
                min={100}
                value={budgetKes}
                onChange={(e) => setBudgetKes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15 font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102E36] mb-1">
                Preferred Cadence
              </label>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
              >
                <option value="ONE_TIME">One-Time Intervention</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="TERMLY">School Termly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#102E36]">
              Interest Areas (Select one or more verified need categories)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(categories.length > 0
                ? categories
                : [
                    { code: 'FOOD', name: 'Food' },
                    { code: 'SHELTER', name: 'Shelter' },
                    { code: 'EDUCATION', name: 'Education' },
                    { code: 'MEDICAL', name: 'Medical' },
                    { code: 'BUSINESS_EMPOWERMENT', name: 'Business empowerment' },
                    { code: 'AGRICULTURE', name: 'Agriculture' },
                  ]
              ).map((c) => {
                const active = interestCategories.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleItem(interestCategories, setInterestCategories, c.code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                      active
                        ? 'bg-[#102E36] text-[#FAF9F6] border-[#102E36]'
                        : 'bg-white text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]/60'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#102E36]">
                Geographic Location Focus (Kenyan Counties)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COUNTY_OPTIONS.map((countyName) => {
                  const active = locationFocus.includes(countyName);
                  return (
                    <button
                      key={countyName}
                      type="button"
                      onClick={() => toggleItem(locationFocus, setLocationFocus, countyName, true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                        active
                          ? 'bg-[#287A59] text-[#FAF9F6] border-[#287A59]'
                          : 'bg-white text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]/60'
                      }`}
                    >
                      {countyName === 'ALL' ? 'All Kenya Counties' : countyName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#102E36]">
                Beneficiary Age Group Focus
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AGE_GROUP_OPTIONS.map((ag) => {
                  const active = preferredAgeGroups.includes(ag.code);
                  return (
                    <button
                      key={ag.code}
                      type="button"
                      onClick={() => toggleItem(preferredAgeGroups, setPreferredAgeGroups, ag.code, true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                        active
                          ? 'bg-[#287A59] text-[#FAF9F6] border-[#287A59]'
                          : 'bg-white text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]/60'
                      }`}
                    >
                      {ag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#102E36] mb-1">
              Philanthropic / CSR Impact Objective
            </label>
            <textarea
              rows={2}
              value={impactGoal}
              onChange={(e) => setImpactGoal(e.target.value)}
              placeholder="Describe the outcomes you want to prioritise (e.g. girls' secondary schooling, flood recovery, women cooperative equipment)..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-white border border-[#102E36]/15"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <GlossyButton type="button" variant="ivory" size="sm" onClick={() => setShowPrefs(false)}>
              Cancel
            </GlossyButton>
            <GlossyButton type="submit" variant="gold" disabled={running}>
              <Sparkles className="w-4 h-4" />
              {running ? 'Running Gemini Match...' : 'Save Preferences & Generate Matches'}
            </GlossyButton>
          </div>
        </form>
      )}

      {/* Ranked Proactive Matches */}
      {(data?.matches || []).length === 0 ? (
        <div className="hc-card p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-[#102E36]">
            No verified beneficiary matches currently exceed the minimum threshold ({data?.config.minThresholdScore}%).
          </div>
          <p className="text-xs text-[#4A636A]">
            Broaden your county or category filters, or restore any previously dismissed recommendations.
          </p>
          <div className="flex justify-center gap-3 pt-1">
            <GlossyButton size="sm" variant="ivory" onClick={() => setShowPrefs(true)}>
              Adjust Preferences
            </GlossyButton>
            <GlossyButton
              size="sm"
              variant="teal"
              onClick={async () => {
                setRunning(true);
                try {
                  const res = await apiFetch<MatchingResponsePayload>(
                    '/api/matching/suggestions/reset-dismissed',
                    { method: 'POST' }
                  );
                  hydrateFromPayload(res);
                  setFeedback('Restored dismissed recommendations.');
                } finally {
                  setRunning(false);
                }
              }}
            >
              Restore Dismissed Matches
            </GlossyButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data!.matches.map((match) => {
            const isExpanded = expandedBreakdownId === match.beneficiaryId;
            const inBatch = batchSelectedIds.includes(match.beneficiaryId);
            const gapKes = Math.round((match.primaryNeed?.remainingGapMinor || 0) / 100);
            const budgetKesNum = Math.max(500, Math.round(Number(budgetKes || 5000)));
            const suggestedAmountKes = gapKes > 0 ? Math.min(budgetKesNum, gapKes) : budgetKesNum;

            return (
              <div key={match.beneficiaryId} className="hc-card p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  {/* Top Summary Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A636A]">
                        <span className="font-mono-num font-semibold text-[#102E36]">
                          {match.referenceCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{match.county} County</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatAgeGroupLabel(match.ageGroup)}</span>
                      </div>
                      <h4 className="text-lg font-extrabold text-[#102E36]">
                        {match.displayAlias}
                      </h4>
                      <div className="text-xs font-semibold text-[#287A59]">
                        {match.primaryNeed
                          ? `${match.primaryNeed.categoryName} · ${priorityLabel(match.primaryNeed.priorityTier)}`
                          : match.classification.replace(/_/g, ' ')}
                        {match.status === 'SPONSORED' ? ' · Actively Sponsored' : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-2xl font-extrabold font-mono-num text-[#102E36]">
                        {match.compositeScore}%
                      </div>
                      <div className="text-xs text-[#4A636A]">Match Score</div>
                    </div>
                  </div>

                  {/* Primary Need & Funding Gap */}
                  {match.primaryNeed && (
                    <div className="p-3.5 rounded-xl bg-white border border-[#102E36]/10 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[#102E36]">{match.primaryNeed.title}</span>
                        <span className="font-mono-num text-[#287A59] shrink-0">
                          Gap: {formatMoney(match.primaryNeed.remainingGapMinor, match.primaryNeed.currency)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#102E36]/10 overflow-hidden">
                        <div
                          className="h-full bg-[#287A59]"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (match.primaryNeed.fulfilledAmountMinor /
                                  Math.max(1, match.primaryNeed.targetAmountMinor)) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Analyzed Specific Challenges */}
                  {match.specificChallenges.length > 0 && (
                    <div className="text-xs text-[#4A636A]">
                      <span className="font-semibold text-[#102E36]">Specific Challenges: </span>
                      {match.specificChallenges.join(' · ')}
                    </div>
                  )}

                  {/* AI Rationale & Expected Impact */}
                  <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#102E36]/10 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#102E36] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#D9A84E]" />
                        Connection & Impact Analysis
                      </span>
                      <span className="font-mono-num text-[#4A636A]">{match.usedModel}</span>
                    </div>
                    <p className="text-[#102E36] leading-relaxed">{match.geminiRationale}</p>
                    <p className="text-[#287A59] font-medium">
                      Expected Impact: {match.geminiImpactProjection}
                    </p>
                    <div className="text-[#4A636A]">
                      Suggested Structure: <strong className="text-[#102E36]">{match.recommendedApproach}</strong>
                    </div>
                  </div>

                  {/* Expandable Transparent Algorithm Breakdown */}
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBreakdownId(isExpanded ? null : match.beneficiaryId)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#102E36] hover:underline"
                    >
                      <Info className="w-3.5 h-3.5 text-[#287A59]" />
                      {isExpanded ? 'Hide Score Transparency Breakdown' : 'Inspect Score Transparency Breakdown'}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[#102E36]/10 space-y-2 text-xs">
                        {[
                          {
                            label: 'Need & Category Alignment',
                            score: match.breakdown.needScore,
                            max: match.breakdown.weights.need,
                          },
                          {
                            label: 'County Location Focus',
                            score: match.breakdown.locationScore,
                            max: match.breakdown.weights.location,
                          },
                          {
                            label: 'Budget & Coverage Fit',
                            score: match.breakdown.budgetScore,
                            max: match.breakdown.weights.budget,
                          },
                          {
                            label: 'Urgency & Underfunded Impact',
                            score: match.breakdown.urgencyScore,
                            max: match.breakdown.weights.urgency,
                          },
                          {
                            label: 'Age Group & Challenges',
                            score: match.breakdown.ageScore,
                            max: match.breakdown.weights.age,
                          },
                        ].map((row) => (
                          <div key={row.label} className="space-y-1">
                            <div className="flex justify-between font-mono-num">
                              <span className="text-[#4A636A]">{row.label}</span>
                              <span className="font-semibold text-[#102E36]">
                                {row.score} / {row.max} pts
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[#102E36]/10 overflow-hidden">
                              <div
                                className="h-full bg-[#102E36]"
                                style={{
                                  width: `${Math.min(100, Math.round((row.score / Math.max(1, row.max)) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between font-mono-num pt-1 text-[#287A59]">
                          <span>Gemini Contextual Compatibility Delta</span>
                          <span>
                            {match.breakdown.geminiDelta >= 0
                              ? `+${match.breakdown.geminiDelta}`
                              : match.breakdown.geminiDelta}{' '}
                            pts
                          </span>
                        </div>
                        <ul className="pt-1 space-y-0.5 text-[#4A636A] list-disc list-inside">
                          {match.breakdown.factorNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-[#102E36]/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GlossyButton
                      size="sm"
                      variant="gold"
                      onClick={() => onSponsorMatch(match, suggestedAmountKes)}
                    >
                      <HeartHandshake className="w-3.5 h-3.5" />
                      Sponsor ({formatMoney(suggestedAmountKes * 100, 'KES')})
                    </GlossyButton>

                    {portalMode === 'CORPORATE' && onAddToBatch && (
                      <GlossyButton
                        size="sm"
                        variant={inBatch ? 'green' : 'ivory'}
                        onClick={() => onAddToBatch(match.beneficiaryId)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {inBatch ? 'Added to Batch' : 'Add to Batch'}
                      </GlossyButton>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Save Match"
                      onClick={async () => {
                        await apiFetch(`/api/supporter/saved/${match.beneficiaryId}`, {
                          method: 'POST',
                        });
                        await apiFetch(`/api/matching/suggestions/${match.beneficiaryId}/status`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'SAVED' }),
                        });
                        setFeedback(`Saved ${match.displayAlias} to your shortlist.`);
                        onDataChanged?.();
                        loadRecommendations(false);
                      }}
                      className="p-2 rounded-lg border border-[#102E36]/15 text-[#102E36] hover:bg-[#EAE6DC]/60"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Dismiss Suggestion"
                      onClick={async () => {
                        await apiFetch(`/api/matching/suggestions/${match.beneficiaryId}/status`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'DISMISSED' }),
                        });
                        setFeedback(`Dismissed ${match.displayAlias} from suggestions.`);
                        loadRecommendations(false);
                      }}
                      className="p-2 rounded-lg border border-[#102E36]/15 text-[#4A636A] hover:text-[#9F2D20]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
