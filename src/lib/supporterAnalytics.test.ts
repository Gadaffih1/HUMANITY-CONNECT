import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildMonthlyDonationTrends, computeSupporterImpactMetrics } from './supporterAnalytics.ts';

test('buildMonthlyDonationTrends aggregates settled and pledged donations chronologically', () => {
  const points = buildMonthlyDonationTrends([
    { amountMinor: 500000, status: 'CONFIRMED', confirmedAt: '2026-11-05T10:00:00Z' },
    { amountMinor: 250000, status: 'PLEDGED', createdAt: '2026-11-10T10:00:00Z', isPledge: true },
    { amountMinor: 1000000, status: 'CONFIRMED', createdAt: '2026-09-12T08:00:00Z' },
    { amountMinor: 150000, status: 'FAILED', createdAt: '2026-10-01T08:00:00Z' },
  ]);

  assert.equal(points.length, 2);
  assert.equal(points[0].month, '2026-09');
  assert.equal(points[0].settledKes, 10000);
  assert.equal(points[0].pledgedKes, 0);
  assert.equal(points[1].month, '2026-11');
  assert.equal(points[1].settledKes, 5000);
  assert.equal(points[1].pledgedKes, 2500);
  assert.equal(points[1].totalKes, 7500);
  assert.equal(points[1].count, 2);
});

test('computeSupporterImpactMetrics calculates totals and coverage safely', () => {
  const metrics = computeSupporterImpactMetrics(
    [
      { amountMinor: 500000, status: 'CONFIRMED' },
      { amountMinor: 300000, status: 'PLEDGED', isPledge: true },
    ],
    [
      { disbursedMinor: 1000000, targetMinor: 4000000 },
      { disbursedMinor: 2500000, targetMinor: 5000000 },
    ]
  );

  assert.equal(metrics.totalSettledKes, 5000);
  assert.equal(metrics.totalPledgedKes, 3000);
  assert.equal(metrics.totalDisbursedImpactKes, 25000);
  assert.equal(metrics.totalApprovedTargetKes, 50000);
  assert.equal(metrics.impactCoveragePct, 50);
  assert.equal(metrics.confirmedCount, 1);
  assert.equal(metrics.pledgedCount, 1);
});
