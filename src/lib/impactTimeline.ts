export interface MonthlyImpactAmount {
  month: string;
  amountMinor: string;
}

export interface ImpactPoint {
  month: string;
  disbursedMinor: number;
  targetMinor: number;
}

export function buildImpactTimeline(
  disbursements: MonthlyImpactAmount[],
  targets: MonthlyImpactAmount[],
  currentMonth: string
): ImpactPoint[] {
  const amounts = new Map<string, { disbursed: number; target: number }>();
  const add = (rows: MonthlyImpactAmount[], key: 'disbursed' | 'target') => {
    for (const row of rows) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || row.month > currentMonth) {
        throw new Error('Invalid impact month');
      }
      const amount = Number(row.amountMinor);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid impact amount');
      const value = amounts.get(row.month) || { disbursed: 0, target: 0 };
      value[key] += amount;
      if (!Number.isSafeInteger(value[key])) throw new Error('Impact amount exceeds safe range');
      amounts.set(row.month, value);
    }
  };
  add(disbursements, 'disbursed');
  add(targets, 'target');
  if (amounts.size === 0) return [];

  const start = [...amounts.keys()].sort()[0];
  const [year, month] = start.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  const result: ImpactPoint[] = [];
  let disbursedMinor = 0;
  let targetMinor = 0;
  while (date.toISOString().slice(0, 7) <= currentMonth) {
    const key = date.toISOString().slice(0, 7);
    const value = amounts.get(key);
    disbursedMinor += value?.disbursed || 0;
    targetMinor += value?.target || 0;
    if (!Number.isSafeInteger(disbursedMinor) || !Number.isSafeInteger(targetMinor)) {
      throw new Error('Impact total exceeds safe range');
    }
    result.push({ month: key, disbursedMinor, targetMinor });
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return result;
}
