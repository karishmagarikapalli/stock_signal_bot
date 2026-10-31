import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vader from 'vader-sentiment';

const labels = ['negative', 'neutral', 'positive'];

function timestamp(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('Expected timestamp with timezone');
  return Date.parse(value);
}

export function classifyHeadline(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Headline text is required');
  const compound = vader.SentimentIntensityAnalyzer.polarity_scores(text).compound;
  return compound >= 0.05 ? 'positive' : compound <= -0.05 ? 'negative' : 'neutral';
}

export function classificationMetrics(expected, predicted) {
  if (expected.length !== predicted.length) throw new Error('Label counts differ');
  const confusion = labels.map(() => labels.map(() => 0));
  expected.forEach((label, index) => {
    if (!labels.includes(label) || !labels.includes(predicted[index])) throw new Error('Invalid label');
    confusion[labels.indexOf(label)][labels.indexOf(predicted[index])] += 1;
  });
  const perClass = labels.map((label, index) => {
    const truePositive = confusion[index][index];
    const support = confusion[index].reduce((total, count) => total + count, 0);
    const predictedCount = confusion.reduce((total, row) => total + row[index], 0);
    return { label, support, precision: predictedCount ? truePositive / predictedCount : 0,
      recall: support ? truePositive / support : 0,
      f1: support + predictedCount ? 2 * truePositive / (support + predictedCount) : 0 };
  });
  return { count: expected.length, labels, confusion, perClass,
    accuracy: expected.length ? confusion.reduce((total, row, index) => total + row[index], 0) / expected.length : null,
    macroF1: expected.length ? perClass.reduce((total, item) => total + item.f1, 0) / labels.length : null };
}

export function joinPriceOutcomes(events, prices, {
  horizonsMs = [3_600_000, 86_400_000], maxEntryDelayMs = 60_000,
  maxExitDelayMs = 0, benchmarkSymbol = 'MARKET',
} = {}) {
  if (!horizonsMs.length || horizonsMs.some(value => !Number.isSafeInteger(value) || value <= 0) ||
      !Number.isSafeInteger(maxEntryDelayMs) || maxEntryDelayMs < 0 ||
      !Number.isSafeInteger(maxExitDelayMs) || maxExitDelayMs < 0) throw new Error('Invalid horizon or tolerance');
  const series = new Map();
  for (const point of prices) {
    const time = timestamp(point.at);
    if (typeof point.symbol !== 'string' || !point.symbol) throw new Error('Price symbol required');
    const points = series.get(point.symbol) ?? [];
    points.push({ ...point, time });
    series.set(point.symbol, points);
  }
  for (const points of series.values()) {
    points.sort((left, right) => left.time - right.time);
    if (points.some((point, index) => index > 0 && point.time === points[index - 1].time)) {
      throw new Error('Duplicate symbol timestamp');
    }
  }
  const validPrice = point => point && typeof point.price === 'number' &&
    Number.isFinite(point.price) && point.price > 0;
  const outcomes = [];
  const skipped = [];
  const ordered = events.map(event => ({ ...event, time: timestamp(event.availableAt) }))
    .sort((left, right) => left.time - right.time);
  for (const event of ordered) {
    const points = series.get(event.symbol) ?? [];
    const entry = points.find(point => point.time > event.time);
    for (const horizonMs of horizonsMs) {
      const skip = reason => skipped.push({ id: event.id, horizonMs, reason });
      if (!validPrice(entry) || entry.time - event.time > maxEntryDelayMs) {
        skip('missing-entry');
        continue;
      }
      const target = entry.time + horizonMs;
      const exit = points.find(point => point.time >= target);
      if (!validPrice(exit) || exit.time - target > maxExitDelayMs) {
        skip('missing-exit');
        continue;
      }
      const benchmark = series.get(benchmarkSymbol) ?? [];
      const marketEntry = benchmark.find(point => point.time === entry.time);
      const marketExit = benchmark.find(point => point.time === exit.time);
      const rawReturn = exit.price / entry.price - 1;
      const marketReturn = validPrice(marketEntry) && validPrice(marketExit)
        ? marketExit.price / marketEntry.price - 1 : null;
      outcomes.push({ id: event.id, horizonMs, entryAt: entry.at, exitAt: exit.at,
        rawReturn, marketReturn, excessReturn: marketReturn === null ? null : rawReturn - marketReturn });
    }
  }
  return { outcomes, skipped };
}

export function evaluateResearch(dataset) {
  const ids = new Set();
  for (const event of dataset.events) {
    if (typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new Error('Unique event IDs required');
    ids.add(event.id);
    if (!labels.includes(event.label)) throw new Error('Independent label required');
    if (typeof event.symbol !== 'string' || !event.symbol) throw new Error('Event symbol required');
  }
  const expected = dataset.events.map(event => event.label);
  const predicted = dataset.events.map(event => classifyHeadline(event.text));
  return { notice: 'Offline evaluation plumbing only; not strategy or profitability validation.',
    synthetic: dataset.synthetic === true,
    baseline: classificationMetrics(expected, expected.map(() => 'neutral')),
    vader: classificationMetrics(expected, predicted),
    prices: joinPriceOutcomes(dataset.events, dataset.prices, dataset.options) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node server/research-evaluation.mjs <local-json>');
  console.log(JSON.stringify(evaluateResearch(JSON.parse(readFileSync(input, 'utf8'))), null, 2));
}