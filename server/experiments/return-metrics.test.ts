import { describe, expect, it } from 'vitest';
import { returnMetrics } from './return-metrics.mjs';

const costs = { commissionBps: 10, feesBps: 0, halfSpreadBps: 0, slippageBps: 0 };
const trade = (id: string, day: number, rawReturn: number, position = 1, marketReturn: number | null = 0.02) => ({
  id, eventId: id, entryAt: `2025-01-0${day}T01:00:00Z`, exitAt: `2025-01-0${day}T02:00:00Z`, rawReturn, position, marketReturn,
});

describe('return observations, not sentiment accuracy', () => {
  it('charges both entry and exit notionals and computes compound equity and peak drawdown', () => {
    const report = returnMetrics([trade('gain', 1, 0.1), trade('loss', 2, -0.2)], costs);
    expect(report.trades[0].costFraction).toBeCloseTo(0.0021);
    expect(report.trades[1].netReturn).toBeCloseTo(-0.2018);
    expect(report.strategy.gross.compoundedReturn).toBeCloseTo(-0.12);
    expect(report.strategy.net.compoundedReturn).toBeCloseTo(1.0979 * 0.7982 - 1);
    expect(report.strategy.net.maxDrawdown).toBeCloseTo(0.2018);
    expect(report.strategy.turnoverNotional).toBeCloseTo(3.9);
    expect(report.noTrade.compoundedReturn).toBe(0);
    expect(report.matchedMarket.gross.compoundedReturn).toBeCloseTo(1.02 ** 2 - 1);
  });

  it('cash has no costs, losses remain losses, and missing market data stays unknown', () => {
    const report = returnMetrics([trade('cash', 1, 0.1, 0, null), trade('loss', 2, -0.2)], costs);
    expect(report.trades[0].netReturn).toBe(0);
    expect(report.strategy.tradeCount).toBe(1);
    expect(report.matchedMarket.missing).toBe(1);
    expect(report.matchedMarket.net.compoundedReturn).toBeNull();
    expect(report.trades[0].rawExcessReturn).toBeNull();
    expect(report.alwaysLong.gross.compoundedReturn).toBeCloseTo(-0.12);
    expect(returnMetrics([], costs).strategy.timeExposure).toBeNull();
  });

  it('deterministically excludes overlapping windows and repeated event families', () => {
    const first = trade('first', 1, 0.1);
    const copy = { ...trade('copy', 2, 0.1), eventId: 'first' };
    const overlap = { ...trade('overlap', 1, 0.1), entryAt: '2025-01-01T01:30:00Z' };
    const report = returnMetrics([copy, overlap, first], costs);
    expect(report.count).toBe(1);
    expect(report.skipped).toEqual([{ id: 'overlap', reason: 'overlapping-window' }, { id: 'copy', reason: 'duplicate-event' }]);
    expect(returnMetrics([first], costs).strategy.timeExposure).toBe(1);
  });

  it('rejects unknown prices/returns, short positions, missing costs and capital exhaustion', () => {
    expect(() => returnMetrics([trade('short', 1, 0.1, -1)], costs)).toThrow('long/cash');
    expect(() => returnMetrics([trade('invalid', 1, NaN)], costs)).toThrow('long/cash');
    expect(() => returnMetrics([], {})).toThrow('cost');
    expect(() => returnMetrics([trade('loss', 1, -0.99)], { ...costs, commissionBps: 10000 })).toThrow('capital');
  });
});