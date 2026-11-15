export interface SupporterDonationInput {
  amountMinor: number;
  status: string;
  currency?: string;
  createdAt?: string | null;
  confirmedAt?: string | null;
  isPledge?: boolean;
}

export interface MonthlyDonationTrendPoint {
  month: string;
  label: string;
  settledKes: number;
  pledgedKes: number;
  totalKes: number;
  count: number;
}

export interface SupporterImpactMetrics {
  totalSettledKes: number;
  totalPledgedKes: number;
  totalDisbursedImpactKes: number;
  totalApprovedTargetKes: number;
  confirmedCount: number;
  pledgedCount: number;
  impactCoveragePct: number;
}

function formatMonthLabel(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const d = new Date(Date.UTC(year, monthIdx, 1));
  return d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function buildMonthlyDonationTrends(
  donations: SupporterDonationInput[]
): MonthlyDonationTrendPoint[] {
  const byMonth = new Map<
    string,
    { settledMinor: number; pledgedMinor: number; count: number }
  >();

  for (const d of donations) {
    if (!Number.isFinite(d.amountMinor) || d.amountMinor <= 0) continue;
    const isConfirmed = d.status === 'CONFIRMED';
    const isPledge = !isConfirmed && (d.status === 'PLEDGED' || Boolean(d.isPledge));
    if (!isConfirmed && !isPledge) continue;

    const rawDate = d.confirmedAt || d.createdAt;
    const parsed = rawDate ? new Date(rawDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) continue;
    const ym = parsed.toISOString().slice(0, 7);
    const current = byMonth.get(ym) ?? { settledMinor: 0, pledgedMinor: 0, count: 0 };
    if (isConfirmed) {
      current.settledMinor += d.amountMinor;
    } else {
      current.pledgedMinor += d.amountMinor;
    }
    current.count += 1;
    byMonth.set(ym, current);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, agg]) => {
      const settledKes = Math.round(agg.settledMinor / 100);
      const pledgedKes = Math.round(agg.pledgedMinor / 100);
      return {
        month,
        label: formatMonthLabel(month),
        settledKes,
        pledgedKes,
        totalKes: settledKes + pledgedKes,
        count: agg.count,
      };
    });
}

export function computeSupporterImpactMetrics(
  donations: SupporterDonationInput[],
  impactTimeline: Array<{ disbursedMinor: number; targetMinor: number }>
): SupporterImpactMetrics {
  let settledMinor = 0;
  let pledgedMinor = 0;
  let confirmedCount = 0;
  let pledgedCount = 0;

  for (const d of donations) {
    if (!Number.isFinite(d.amountMinor) || d.amountMinor <= 0) continue;
    if (d.status === 'CONFIRMED') {
      settledMinor += d.amountMinor;
      confirmedCount += 1;
    } else if (d.status === 'PLEDGED' || d.isPledge) {
      pledgedMinor += d.amountMinor;
      pledgedCount += 1;
    }
  }

  const latestPoint = impactTimeline.length > 0 ? impactTimeline[impactTimeline.length - 1] : null;
  const totalDisbursedImpactKes = latestPoint ? Math.round(latestPoint.disbursedMinor / 100) : 0;
  const totalApprovedTargetKes = latestPoint ? Math.round(latestPoint.targetMinor / 100) : 0;
  const impactCoveragePct =
    totalApprovedTargetKes > 0
      ? Math.min(100, Math.round((totalDisbursedImpactKes / totalApprovedTargetKes) * 100))
      : 0;

  return {
    totalSettledKes: Math.round(settledMinor / 100),
    totalPledgedKes: Math.round(pledgedMinor / 100),
    totalDisbursedImpactKes,
    totalApprovedTargetKes,
    confirmedCount,
    pledgedCount,
    impactCoveragePct,
  };
}
