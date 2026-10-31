import { classificationMetrics } from '../research-evaluation.mjs';

export function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('Expected timestamp with timezone');
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10) ||
      Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new Error('Invalid calendar timestamp');
  }
  return Date.parse(value);
}

export function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error(`Required ${name}`);
  return value;
}

const labels = ['negative', 'neutral', 'positive'];

export function thresholdLabel(score, threshold) {
  if (!Number.isFinite(score) || Math.abs(score) > 1 || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error('Invalid score or threshold');
  }
  return score >= threshold ? 'positive' : score <= -threshold ? 'negative' : 'neutral';
}

export function fitThreshold(training, candidates) {
  if (!training.length || !Array.isArray(candidates) || !candidates.length) throw new Error('Training and candidates required');
  const fits = [...new Set(candidates)].sort((left, right) => left - right).map(threshold => ({
    threshold,
    macroF1: classificationMetrics(training.map(row => row.label), training.map(row => thresholdLabel(row.score, threshold))).macroF1,
  }));
  return fits.reduce((best, fit) => fit.macroF1 > best.macroF1 ? fit : best);
}

export function walkForward(events, windows, { thresholds = [0.05, 0.25, 0.5], embargoMs = 0 } = {}) {
  if (!Number.isSafeInteger(embargoMs) || embargoMs < 0 || !Array.isArray(events) || !Array.isArray(windows) || !windows.length) throw new Error('Invalid windows or embargo');
  const ids = new Set();
  const groups = new Map();
  for (const event of events) {
    requiredText(event.id, 'id');
    requiredText(event.eventId, 'eventId');
    if (ids.has(event.id)) throw new Error('Duplicate id');
    ids.add(event.id);
    if (!labels.includes(event.label)) throw new Error('Independent sentiment label required');
    thresholdLabel(event.score, 0.5);
    const row = { ...event, start: time(event.availableAt), end: time(event.outcomeEndAt) };
    if (row.end <= row.start) throw new Error('Outcome must end after availability');
    groups.set(event.eventId, [...(groups.get(event.eventId) ?? []), row]);
  }
  const bounds = windows.map(window => ({ start: time(window.testStart), end: time(window.testEnd) }));
  bounds.forEach((window, index) => {
    if (window.end <= window.start || (index && window.start < bounds[index - 1].end)) throw new Error('Windows must be chronological and disjoint');
  });
  return bounds.map(window => {
    const training = [];
    const test = [];
    const excluded = [];
    for (const [eventId, rows] of groups) {
      const ordered = [...rows].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
      const first = ordered[0];
      if (rows.every(row => row.start < window.start - embargoMs && row.end < window.start - embargoMs)) {
        training.push(first);
      } else if (rows.every(row => row.start >= window.start && row.start < window.end && row.end < window.end)) {
        test.push(first);
      } else {
        excluded.push(eventId);
      }
    }
    training.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    test.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    const fit = fitThreshold(training, thresholds);
    const majority = labels.reduce((best, label) => training.filter(row => row.label === label).length >
      training.filter(row => row.label === best).length ? label : best, labels[0]);
    const expected = test.map(row => row.label);
    return { testStart: new Date(window.start).toISOString(), testEnd: new Date(window.end).toISOString(),
      fit, trainingIds: training.map(row => row.id), testIds: test.map(row => row.id), excludedEventIds: excluded.sort(),
      duplicateRowsCollapsed: events.length - groups.size,
      predictions: test.map(row => ({ id: row.id, eventId: row.eventId, label: thresholdLabel(row.score, fit.threshold) })),
      sentiment: classificationMetrics(expected, test.map(row => thresholdLabel(row.score, fit.threshold))),
      alwaysNeutral: classificationMetrics(expected, test.map(() => 'neutral')),
      trainingMajority: { label: majority, ...classificationMetrics(expected, test.map(() => majority)) } };
  });
}