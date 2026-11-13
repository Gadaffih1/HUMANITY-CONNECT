import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildImpactTimeline } from './impactTimeline.ts';

test('accumulates both series across missing months with an initial baseline', () => {
  assert.deepEqual(buildImpactTimeline(
    [{ month: '2025-03', amountMinor: '250' }, { month: '2025-03', amountMinor: '50' }],
    [{ month: '2025-01', amountMinor: '1000' }, { month: '2025-04', amountMinor: '500' }],
    '2025-04'
  ), [
    { month: '2024-12', disbursedMinor: 0, targetMinor: 0 },
    { month: '2025-01', disbursedMinor: 0, targetMinor: 1000 },
    { month: '2025-02', disbursedMinor: 0, targetMinor: 1000 },
    { month: '2025-03', disbursedMinor: 300, targetMinor: 1000 },
    { month: '2025-04', disbursedMinor: 300, targetMinor: 1500 },
  ]);
});

test('returns no points for an empty dataset and rejects unsafe amounts', () => {
  assert.deepEqual(buildImpactTimeline([], [], '2025-01'), []);
  assert.throws(() => buildImpactTimeline([{ month: '2025-01', amountMinor: '9007199254740992' }], [], '2025-01'));
});
