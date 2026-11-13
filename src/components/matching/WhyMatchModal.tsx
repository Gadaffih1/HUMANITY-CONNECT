import React, { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, HeartHandshake, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ModalDialog, GlossyButton } from '../ui/DesignSystem';

export interface WhyMatchExplanation {
  beneficiaryId: string;
  beneficiaryAlias: string;
  referenceCode: string;
  county: string;
  algorithmName: string;
  compositeScore: number;
  summary: string;
  keyReasons: string[];
  usedModel: string;
  aiGenerated: boolean;
  breakdown: {
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
  };
  transparencyNotes: string;
}

export const WhyMatchModal: React.FC<{
  open: boolean;
  beneficiaryId: string | null;
  beneficiaryAlias?: string;
  county?: string;
  compositeScore?: number;
  onClose: () => void;
  onSponsor?: () => void;
}> = ({
  open,
  beneficiaryId,
  beneficiaryAlias,
  county,
  compositeScore,
  onClose,
  onSponsor,
}) => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<WhyMatchExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !beneficiaryId) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setData(null);

    apiFetch<WhyMatchExplanation>(`/api/matching/suggested/${beneficiaryId}/why`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: any) => {
        if (!cancelled) setErrorMsg(err?.message || 'Unable to load match explanation.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, beneficiaryId]);

  const titleAlias = data?.beneficiaryAlias || beneficiaryAlias || 'Suggested Beneficiary';
  const subtitleText = [
    data?.referenceCode,
    (data?.county || county) ? `${data?.county || county} County` : null,
    `${data?.compositeScore ?? compositeScore ?? 0}% Match Score`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ModalDialog
      open={open}
      title={`Why this match? — ${titleAlias}`}
      subtitle={subtitleText}
      onClose={onClose}
    >
      {loading && (
        <div className="p-6 rounded-xl bg-white border border-[#102E36]/10 text-sm text-[#4A636A] flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-[#D9A84E] shrink-0" />
          Generating concise Gemini matching logic summary...
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#9F2D20]/10 border border-[#9F2D20]/25 text-sm text-[#9F2D20]">
          {errorMsg}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Brief Gemini-Generated Summary */}
          <div className="p-4 rounded-xl bg-white border border-[#102E36]/12 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#102E36] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D9A84E]" />
                Gemini Matching Logic Summary
              </span>
              <span className="font-mono-num text-[#4A636A]">{data.usedModel}</span>
            </div>
            <p className="text-sm text-[#102E36] leading-relaxed">{data.summary}</p>
            {data.keyReasons.length > 0 && (
              <ul className="pt-1 space-y-1.5 text-xs text-[#4A636A]">
                {data.keyReasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#287A59] shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Weighted Scoring Breakdown */}
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-bold text-[#102E36]">
              <span>Weighted Algorithm Breakdown ({data.algorithmName})</span>
              <span className="font-mono-num text-[#287A59]">{data.compositeScore}% Total</span>
            </div>
            {[
              {
                label: 'Need & Category Alignment',
                score: data.breakdown.needScore,
                max: data.breakdown.weights.need,
              },
              {
                label: 'County Location Focus',
                score: data.breakdown.locationScore,
                max: data.breakdown.weights.location,
              },
              {
                label: 'Donation Budget Fit',
                score: data.breakdown.budgetScore,
                max: data.breakdown.weights.budget,
              },
              {
                label: 'Urgency & Underfunded Impact',
                score: data.breakdown.urgencyScore,
                max: data.breakdown.weights.urgency,
              },
              {
                label: 'Age Group & Challenges',
                score: data.breakdown.ageScore,
                max: data.breakdown.weights.age,
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
                    className="h-full bg-[#287A59]"
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
                {data.breakdown.geminiDelta >= 0
                  ? `+${data.breakdown.geminiDelta}`
                  : data.breakdown.geminiDelta}{' '}
                pts
              </span>
            </div>
          </div>

          {/* Safeguarding & Transparency Notice */}
          <div className="p-3.5 rounded-xl bg-[#EAE6DC]/50 flex items-start gap-2.5 text-xs text-[#102E36]">
            <ShieldCheck className="w-4 h-4 text-[#287A59] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold">V4 Safeguarded & Advisory Only</div>
              <div className="text-[#4A636A]">{data.transparencyNotes}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#102E36]/10">
            <GlossyButton type="button" size="sm" variant="ivory" onClick={onClose}>
              Close
            </GlossyButton>
            {onSponsor && (
              <GlossyButton
                type="button"
                size="sm"
                variant="gold"
                onClick={() => {
                  onClose();
                  onSponsor();
                }}
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                Sponsor This Household
              </GlossyButton>
            )}
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
