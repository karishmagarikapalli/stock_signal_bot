import { describe, expect, it } from 'vitest';
import { fitThreshold, walkForward } from './walk-forward.mjs';

const stamp = (day: number) => `2025-01-${String(day).padStart(2, '0')}T00:00:00Z`;
const row = (id: string, day: number, score = 0.2, label = 'neutral') => ({
  id, eventId: id, availableAt: stamp(day), outcomeEndAt: stamp(day + 1), score, label,
});
const windows = [{ testStart: stamp(10), testEnd: stamp(20) }, { testStart: stamp(20), testEnd: stamp(30) }];

describe('offline chronological fitting', () => {
  it('fits only on training, remains invariant to held-out labels/scores and input order', () => {
    const events = [row('train', 2), row('test', 11, 0.9, 'positive'), row('later', 21)];
    const report = walkForward(events, windows);
    expect(report[0].fit.threshold).toBe(0.25);
    const changed = events.map(event => event.id === 'train' ? event : { ...event, label: 'negative', score: -0.8 });
    expect(walkForward(changed, windows)[0].fit).toEqual(report[0].fit);
    expect(walkForward([...events].reverse(), windows)).toEqual(report);
    expect(report[1].trainingIds).toEqual(['train', 'test']);
    expect(report[0].alwaysNeutral.count).toBe(1);
    expect(report[0].trainingMajority.label).toBe('neutral');
  });

  it('purges outcome overlap, applies a time embargo and excludes entire boundary-spanning families', () => {
    const events = [row('safe', 2), row('embargo', 8), { ...row('overlap', 7), outcomeEndAt: stamp(11) },
      row('copy-before', 4), { ...row('copy-after', 12), eventId: 'copy-before' },
      row('test', 11), { ...row('duplicate', 12), eventId: 'test' }, row('right-boundary', 19)];
    const fold = walkForward(events, windows.slice(0, 1), { embargoMs: 86400000 })[0];
    expect(fold.trainingIds).toEqual(['safe']);
    expect(fold.testIds).toEqual(['test']);
    expect(fold.excludedEventIds).toEqual(['copy-before', 'embargo', 'overlap', 'right-boundary']);
    expect(fold.duplicateRowsCollapsed).toBe(2);
    expect(walkForward([...events].reverse(), windows.slice(0, 1), { embargoMs: 86400000 })[0]).toEqual(fold);
  });

  it('rejects empty training, ambiguous timestamps, duplicate ids, bad scores and overlapping windows', () => {
    expect(() => fitThreshold([], [0.5])).toThrow('Training');
    expect(() => fitThreshold([row('train', 2)], [0])).toThrow('threshold');
    expect(() => walkForward([row('test', 11)], windows)).toThrow('Training');
    expect(() => walkForward([row('train', 2), row('train', 3)], windows)).toThrow('Duplicate');
    expect(() => walkForward([{ ...row('train', 2), availableAt: '2025-01-02' }], windows)).toThrow('timezone');
    expect(() => walkForward([{ ...row('train', 2), availableAt: '2025-02-30T00:00:00Z' }], windows)).toThrow('calendar');
    expect(() => walkForward([row('train', 2, NaN)], windows)).toThrow('score');
    expect(() => walkForward([row('train', 2)], [windows[0], windows[0]])).toThrow('chronological');
  });
});