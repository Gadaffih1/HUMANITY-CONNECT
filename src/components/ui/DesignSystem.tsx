import React from 'react';
import {
  ShieldCheck,
  MapPin,
  HeartHandshake,
  Bookmark,
  CheckCircle2,
  X,
  Bell,
  Lock,
  Download,
} from 'lucide-react';

export function formatMoney(minor: number, currency = 'KES'): string {
  const major = Math.round(minor / 100);
  return `${currency} ${major.toLocaleString('en-KE')}`;
}

export function priorityLabel(tier: string): { label: string; toneClass: string } {
  switch (tier) {
    case 'P1_CRITICAL':
      return { label: 'P1 Critical', toneClass: 'text-[#9F2D20]' };
    case 'P2_URGENT':
      return { label: 'P2 Urgent', toneClass: 'text-[#B6721A]' };
    case 'P3_HIGH':
      return { label: 'P3 High', toneClass: 'text-[#102E36]' };
    case 'P4_MODERATE':
      return { label: 'P4 Moderate', toneClass: 'text-[#287A59]' };
    default:
      return { label: 'P5 Developmental', toneClass: 'text-[#4A636A]' };
  }
}

export function verificationLabel(level: string): string {
  const map: Record<string, string> = {
    V0: 'V0 Intake Logged',
    V1: 'V1 Identity Checked',
    V2: 'V2 Documents Reviewed',
    V3: 'V3 Field Visit Done',
    V4: 'V4 Safeguarding Cleared',
  };
  return map[level] || level;
}

export const GlossyButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'teal' | 'gold' | 'green' | 'ivory';
    size?: 'sm' | 'md' | 'lg';
  }
> = ({ variant = 'teal', size = 'md', className = '', children, ...props }) => {
  const sizeClass =
    size === 'sm'
      ? 'px-3.5 py-2 text-xs min-h-[40px]'
      : size === 'lg'
        ? 'px-6 py-3.5 text-sm min-h-[48px]'
        : 'px-5 py-2.5 text-sm min-h-[44px]';

  return (
    <button
      {...props}
      className={`hc-btn hc-btn-${variant} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
};

export const ResilientMedia: React.FC<{
  src?: string | null;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-full h-48 object-cover' }) => {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#102E36] via-[#194450] to-[#287A59] text-[#FAF9F6] p-6 text-center ${className}`}
      >
        <HeartHandshake className="w-8 h-8 text-[#D9A84E] mb-2" />
        <span className="text-xs font-medium text-[#FAF9F6]/90 max-w-[200px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export interface PublicNeedItem {
  id: string;
  referenceCode: string;
  categoryCode: string;
  categoryName: string;
  title: string;
  description: string;
  targetAmountMinor: number;
  approvedAmountMinor?: number | null;
  fulfilledAmountMinor: number;
  currency: string;
  deadlineAt?: string | null;
  isRecurring: boolean;
  frequency: string;
  durationMonths: number;
  priorityTier: string;
  verificationStatus: string;
  status: string;
  compositePriority?: number | null;
}

export interface PublicBeneficiaryCardData {
  id: string;
  referenceCode: string;
  classification: string;
  displayAlias: string;
  countryCode: string;
  county: string;
  isMinorCase: boolean;
  guardianOrgName?: string | null;
  vulnerabilitySummary: string;
  verificationLevel: string;
  verificationStatus: string;
  monthlyNeedTargetMinor: number;
  currency: string;
  storyTitle?: string | null;
  storySummary?: string | null;
  coverImagePath?: string | null;
  needs: PublicNeedItem[];
}

export const BeneficiaryProfileCard: React.FC<{
  item: PublicBeneficiaryCardData;
  isSaved?: boolean;
  onToggleSave?: (id: string) => void;
  onSponsor: (item: PublicBeneficiaryCardData, need?: PublicNeedItem) => void;
  onViewDetails?: (item: PublicBeneficiaryCardData) => void;
}> = ({ item, isSaved, onToggleSave, onSponsor, onViewDetails }) => {
  const primaryNeed = item.needs[0];
  const priorityInfo = priorityLabel(primaryNeed?.priorityTier || 'P3_HIGH');
  const target = primaryNeed?.approvedAmountMinor || primaryNeed?.targetAmountMinor || item.monthlyNeedTargetMinor;
  const fulfilled = primaryNeed?.fulfilledAmountMinor || 0;
  const pct = Math.min(100, Math.round((fulfilled / Math.max(1, target)) * 100));

  const classDisplay =
    item.classification === 'ORPHAN_GUARDIAN'
      ? 'Orphan / Verified Guardian'
      : item.classification === 'DESTITUTE'
        ? 'Destitute Household'
        : 'Needy Household';

  return (
    <article className="hc-card overflow-hidden flex flex-col justify-between transition-shadow duration-200 hover:shadow-md">
      <div>
        <div className="relative aspect-[4/3] overflow-hidden bg-[#EAE6DC]">
          <ResilientMedia
            src={item.coverImagePath}
            alt={item.storyTitle || item.displayAlias}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1F25]/90 via-[#0A1F25]/50 to-transparent p-4 text-[#FAF9F6]">
            <div className="flex items-center justify-between gap-2 text-xs text-[#FAF9F6]/90">
              <span className="font-mono-num">{item.referenceCode}</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D9A84E]" />
                {verificationLabel(item.verificationLevel)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {/* Clean unboxed metadata with typographic separators */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#4A636A]">
            <span className="font-medium text-[#102E36]">{classDisplay}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#287A59]" />
              {item.county} County
            </span>
            {item.isMinorCase && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#287A59] font-medium">
                  <Lock className="w-3 h-3" /> Minor Protected
                </span>
              </>
            )}
          </div>

          <h3 className="text-lg font-bold text-[#102E36] leading-snug">
            {item.storyTitle || item.displayAlias}
          </h3>

          <p className="text-sm text-[#4A636A] leading-relaxed line-clamp-3">
            {item.storySummary || item.vulnerabilitySummary}
          </p>

          {primaryNeed && (
            <div className="pt-3 border-t border-[#102E36]/10 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={`font-semibold ${priorityInfo.toneClass}`}>
                  {priorityInfo.label} · {primaryNeed.categoryName}
                </span>
                <span className="font-mono-num text-[#4A636A]">{pct}% funded</span>
              </div>
              <p className="text-sm font-medium text-[#102E36] line-clamp-1">
                {primaryNeed.title}
              </p>
              <div className="h-2 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#287A59]"
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#4A636A] font-mono-num">
                <span>Raised: {formatMoney(fulfilled, primaryNeed.currency)}</span>
                <span>Target: {formatMoney(target, primaryNeed.currency)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-2 flex flex-wrap items-center gap-2.5">
        <GlossyButton
          variant="gold"
          size="sm"
          className="flex-1"
          onClick={() => onSponsor(item, primaryNeed)}
        >
          Sponsor Directly
        </GlossyButton>
        {onViewDetails && (
          <GlossyButton
            variant="ivory"
            size="sm"
            onClick={() => onViewDetails(item)}
          >
            Case Details
          </GlossyButton>
        )}
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(item.id)}
            aria-label={isSaved ? 'Remove from saved beneficiaries' : 'Save beneficiary'}
            className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border transition-colors ${
              isSaved
                ? 'bg-[#102E36] text-[#D9A84E] border-[#102E36]'
                : 'bg-[#FAF9F6] text-[#102E36] border-[#102E36]/15 hover:bg-[#EAE6DC]'
            }`}
          >
            <Bookmark className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
};

export const NeedCard: React.FC<{
  need: PublicNeedItem;
  beneficiaryAlias?: string;
  onAction?: () => void;
  actionLabel?: string;
}> = ({ need, beneficiaryAlias, onAction, actionLabel = 'Fund Need' }) => {
  const p = priorityLabel(need.priorityTier);
  const target = need.approvedAmountMinor || need.targetAmountMinor;
  const pct = Math.min(100, Math.round((need.fulfilledAmountMinor / Math.max(1, target)) * 100));

  return (
    <div className="hc-card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4A636A]">
        <span className="font-mono-num text-[#102E36] font-medium">{need.referenceCode}</span>
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${p.toneClass}`}>{p.label}</span>
          <span aria-hidden="true">·</span>
          <span>{need.categoryName}</span>
          <span aria-hidden="true">·</span>
          <span>{need.isRecurring ? need.frequency : 'One-Time'}</span>
        </div>
      </div>

      <div>
        <h4 className="text-base font-bold text-[#102E36]">{need.title}</h4>
        {beneficiaryAlias && (
          <p className="text-xs text-[#4A636A] mt-0.5">{beneficiaryAlias}</p>
        )}
      </div>

      <p className="text-sm text-[#4A636A] leading-relaxed">{need.description}</p>

      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-[#EAE6DC] overflow-hidden">
          <div className="h-full bg-[#287A59] rounded-full" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num text-[#4A636A]">
          <span>
            {formatMoney(need.fulfilledAmountMinor, need.currency)} of {formatMoney(target, need.currency)}
          </span>
          <span>
            Status: {need.verificationStatus.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {onAction && (
        <div className="pt-1">
          <GlossyButton variant="teal" size="sm" onClick={onAction}>
            {actionLabel}
          </GlossyButton>
        </div>
      )}
    </div>
  );
};

export const SponsorshipCard: React.FC<{
  beneficiaryAlias: string;
  beneficiaryRef: string;
  county: string;
  monthlyAmountMinor: number;
  currency: string;
  status: string;
  originatedFromAiMatch?: boolean;
  startedAt?: string | null;
}> = ({
  beneficiaryAlias,
  beneficiaryRef,
  county,
  monthlyAmountMinor,
  currency,
  status,
  originatedFromAiMatch,
  startedAt,
}) => {
  const active = status === 'ACTIVE';
  return (
    <div className="hc-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A636A]">
          <span className="font-mono-num text-[#102E36]">{beneficiaryRef}</span>
          <span aria-hidden="true">·</span>
          <span>{county} County</span>
          <span aria-hidden="true">·</span>
          <span className={`font-semibold ${active ? 'text-[#287A59]' : 'text-[#B6721A]'}`}>
            {active ? 'Verified Active Sponsorship' : 'Awaiting Verified First Payment'}
          </span>
          {originatedFromAiMatch && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#102E36]">AI Matched</span>
            </>
          )}
        </div>
        <h4 className="text-base font-bold text-[#102E36]">{beneficiaryAlias}</h4>
        {startedAt && (
          <p className="text-xs text-[#4A636A]">
            Active since {new Date(startedAt).toLocaleDateString('en-KE')}
          </p>
        )}
      </div>
      <div className="text-left sm:text-right">
        <div className="text-lg font-bold font-mono-num text-[#102E36]">
          {formatMoney(monthlyAmountMinor, currency)}
        </div>
        <div className="text-xs text-[#4A636A]">Direct Household Commitment</div>
      </div>
    </div>
  );
};

export const ModalDialog: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A1F25]/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#FAF9F6] border border-[#102E36]/15 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#102E36]/10">
          <div>
            <h3 className="text-xl font-bold text-[#102E36]">{title}</h3>
            {subtitle && <p className="text-sm text-[#4A636A] mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-[#102E36]/15 text-[#102E36] hover:bg-[#EAE6DC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const NotificationList: React.FC<{
  items: Array<{
    id: string;
    category: string;
    title: string;
    body: string;
    createdAt: string;
    readAt?: string | null;
  }>;
}> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="hc-card p-6 text-center text-sm text-[#4A636A]">
        <Bell className="w-6 h-6 text-[#D9A84E] mx-auto mb-2" />
        No alerts or messages yet. Important verification, payment, and safeguarding updates appear here.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((n) => (
        <div key={n.id} className="hc-card p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#4A636A]">
              <span className="font-semibold text-[#287A59]">{n.category}</span>
              <span aria-hidden="true">·</span>
              <span>{new Date(n.createdAt).toLocaleString('en-KE')}</span>
            </div>
            <h4 className="text-sm font-bold text-[#102E36]">{n.title}</h4>
            <p className="text-sm text-[#4A636A]">{n.body}</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-[#287A59] shrink-0 mt-1" />
        </div>
      ))}
    </div>
  );
};

export function downloadCsvFile(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const raw = String(row[h] ?? '');
          return `"${raw.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const ExportReportBar: React.FC<{
  title: string;
  rows: Array<Record<string, unknown>>;
  csvFilename: string;
}> = ({ title, rows, csvFilename }) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <GlossyButton
      variant="ivory"
      size="sm"
      disabled={rows.length === 0}
      onClick={() => downloadCsvFile(csvFilename, rows)}
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV Spreadsheet
    </GlossyButton>
    <GlossyButton
      variant="teal"
      size="sm"
      onClick={() => {
        document.title = title;
        window.print();
      }}
    >
      <Download className="w-3.5 h-3.5" />
      Print / Save PDF Report
    </GlossyButton>
  </div>
);
