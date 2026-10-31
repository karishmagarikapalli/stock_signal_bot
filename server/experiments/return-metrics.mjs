import { requiredText, time } from './walk-forward.mjs';

const costNames = ['commissionBps', 'feesBps', 'halfSpreadBps', 'slippageBps'];

function equitySummary(returns) {
  if (returns.some(value => value === null)) return { compoundedReturn: null, maxDrawdown: null };
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, 1 - equity / peak);
  }
  return { compoundedReturn: equity - 1, maxDrawdown };
}

export function returnMetrics(records, costs) {
  if (!costs || costNames.some(name => !Number.isFinite(costs[name]) || costs[name] < 0)) {
    throw new Error('All per-side cost assumptions required');
  }
  const rate = costNames.reduce((total, name) => total + costs[name], 0) / 10000;
  const ordered = records.map(record => {
    requiredText(record.id, 'id');
    requiredText(record.eventId, 'eventId');
    const start = time(record.entryAt);
    const end = time(record.exitAt);
    if (end <= start || ![0, 1].includes(record.position) || !Number.isFinite(record.rawReturn) || record.rawReturn <= -1 ||
        (record.marketReturn !== null && (!Number.isFinite(record.marketReturn) || record.marketReturn <= -1))) {
      throw new Error('Invalid long/cash outcome');
    }
    return { ...record, start, end };
  }).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const selected = [];
  const skipped = [];
  const families = new Set();
  let lastExit = -Infinity;
  for (const record of ordered) {
    const reason = families.has(record.eventId) ? 'duplicate-event' : record.start < lastExit ? 'overlapping-window' : null;
    if (reason) {
      skipped.push({ id: record.id, reason });
      continue;
    }
    families.add(record.eventId);
    lastExit = record.end;
    selected.push(record);
  }
  const costFor = value => (2 + value) * rate;
  const netFor = value => {
    if (value === null) return null;
    const net = value - costFor(value);
    if (net <= -1) throw new Error('Costs exhaust capital; unsupported bankruptcy');
    return net;
  };
  const trades = selected.map(record => ({ id: record.id, eventId: record.eventId,
    entryAt: record.entryAt, exitAt: record.exitAt, position: record.position,
    grossReturn: record.position * record.rawReturn,
    costFraction: record.position ? costFor(record.rawReturn) : 0,
    netReturn: record.position ? netFor(record.rawReturn) : 0,
    marketReturn: record.marketReturn,
    rawExcessReturn: record.marketReturn === null ? null : record.rawReturn - record.marketReturn }));
  const duration = selected.length ? selected.at(-1).end - selected[0].start : 0;
  return { count: selected.length, skipped, costs: { ...costs }, trades,
    strategy: { gross: equitySummary(trades.map(trade => trade.grossReturn)),
      net: equitySummary(trades.map(trade => trade.netReturn)),
      tradeCount: trades.filter(trade => trade.position).length,
      turnoverNotional: selected.reduce((total, record) => total + record.position * (2 + record.rawReturn), 0),
      timeExposure: duration ? selected.reduce((total, record) => total + record.position * (record.end - record.start), 0) / duration : null },
    noTrade: equitySummary(selected.map(() => 0)),
    alwaysLong: { gross: equitySummary(selected.map(record => record.rawReturn)), net: equitySummary(selected.map(record => netFor(record.rawReturn))) },
    matchedMarket: { missing: selected.filter(record => record.marketReturn === null).length,
      gross: equitySummary(selected.map(record => record.marketReturn)),
      net: equitySummary(selected.map(record => netFor(record.marketReturn))) } };
}