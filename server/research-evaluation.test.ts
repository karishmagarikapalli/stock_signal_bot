import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classificationMetrics, classifyHeadline, evaluateResearch, joinPriceOutcomes } from './research-evaluation.mjs';

const fixturePath = resolve('server/fixtures/research-synthetic.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('offline research evaluation', () => {
  it('compares VADER with an always-neutral baseline against supplied labels', () => {
    const report = evaluateResearch(fixture);
    expect(report.synthetic).toBe(true);
    expect(report.baseline.accuracy).toBeCloseTo(1 / 3);
    expect(report.vader.count).toBe(3);
    expect(report.vader.perClass.map(item => item.support)).toEqual([1, 1, 1]);
    expect(classifyHeadline('Excellent success')).toBe('positive');
    const changed = structuredClone(fixture);
    changed.events[0].label = 'negative';
    expect(evaluateResearch(changed).vader.confusion).not.toEqual(report.vader.confusion);
  });

  it('computes a known confusion matrix and rejects invalid or absent labels', () => {
    const report = classificationMetrics(['positive', 'negative', 'neutral'], ['positive', 'positive', 'neutral']);
    expect(report.confusion).toEqual([[0, 0, 1], [0, 1, 0], [0, 0, 1]]);
    expect(report.macroF1).toBeCloseTo(5 / 9);
    expect(classificationMetrics([], []).accuracy).toBeNull();
    expect(() => classificationMetrics(['positive'], [])).toThrow();
    const changed = structuredClone(fixture);
    delete changed.events[0].label;
    expect(() => evaluateResearch(changed)).toThrow('Independent label');
  });

  it('joins after availability, sorts inputs, measures horizons from entry, and adjusts for market', () => {
    const report = joinPriceOutcomes([...fixture.events].reverse(), [...fixture.prices].reverse(), fixture.options);
    expect(report.outcomes.map(item => item.id)).toEqual(['gain', 'loss']);
    expect(report.outcomes[0].entryAt).toBe('2025-01-02T14:31:00Z');
    expect(report.outcomes[0].rawReturn).toBeCloseTo(0.1);
    expect(report.outcomes[0].excessReturn).toBeCloseTo(0.08);
    expect(report.skipped).toHaveLength(4);
  });

  it('never backfills missing prices, coerces nulls, or silently slides the exit horizon', () => {
    for (const price of [null, 0, -1, '100', NaN]) {
      const points = structuredClone(fixture.prices);
      points[1].price = price;
      const report = joinPriceOutcomes([fixture.events[0]], points, fixture.options);
      expect(report.outcomes).toEqual([]);
      expect(report.skipped[0].reason).toBe('missing-entry');
    }
    const points = fixture.prices.filter((point: { at: string }) => point.at !== '2025-01-02T15:31:00Z');
    expect(joinPriceOutcomes([fixture.events[0]], points, fixture.options).outcomes).toEqual([]);
    expect(joinPriceOutcomes([fixture.events[0]], fixture.prices, { ...fixture.options, maxEntryDelayMs: 1 }).outcomes).toEqual([]);
  });

  it('keeps missing benchmark returns unknown and rejects ambiguous timestamps and duplicates', () => {
    const points = fixture.prices.filter((point: { symbol: string }) => point.symbol !== 'MARKET');
    expect(joinPriceOutcomes(fixture.events, points, fixture.options).outcomes[0].excessReturn).toBeNull();
    expect(() => joinPriceOutcomes([{ ...fixture.events[0], availableAt: '2025-01-02' }], [], fixture.options)).toThrow('timezone');
    expect(() => joinPriceOutcomes([], [...fixture.prices, fixture.prices[0]])).toThrow('Duplicate');
    expect(() => joinPriceOutcomes([], [], { horizonsMs: [0] })).toThrow('Invalid');
  });

  it('runs the local-file CLI without importing ingestion or loading local configuration', () => {
    const output = execFileSync(process.execPath, [resolve('server/research-evaluation.mjs'), fixturePath], {
      encoding: 'utf8', env: { ...process.env, DRY_RUN: '0', NTFY_SERVER: 'http://127.0.0.1:1', NTFY_TOPIC: 'offline-only' },
    });
    expect(JSON.parse(output).prices.outcomes).toHaveLength(2);
    expect(output).not.toContain('offline-only');
  });
});