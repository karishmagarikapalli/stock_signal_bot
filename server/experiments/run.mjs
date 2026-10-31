import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vader from 'vader-sentiment';
import { joinPriceOutcomes } from '../research-evaluation.mjs';
import { importFinbertPredictions } from './finbert-import.mjs';
import { returnMetrics } from './return-metrics.mjs';
import { requiredText, time, walkForward } from './walk-forward.mjs';

export function evaluateExperiments(dataset) {
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.events) || !Array.isArray(dataset.prices)) throw new Error('Experiment schema v1 required');
  const { horizonMs, latencyMs, maxEntryDelayMs, maxExitDelayMs, benchmarkSymbol } = dataset.priceOptions ?? {};
  if (![horizonMs, latencyMs, maxEntryDelayMs, maxExitDelayMs].every(Number.isSafeInteger) ||
      horizonMs <= 0 || latencyMs < 0 || maxEntryDelayMs < 0 || maxExitDelayMs < 0) throw new Error('Explicit price timing assumptions required');
  requiredText(benchmarkSymbol, 'benchmark symbol');
  let imported = null;
  let events = dataset.events.map(event => {
    requiredText(event.symbol, 'event symbol');
    requiredText(event.text, 'headline');
    if (time(event.outcomeEndAt) <= time(event.availableAt) + latencyMs + horizonMs) {
      throw new Error('Declared outcome window does not cover minimum price exit');
    }
    return { ...event };
  });
  if (dataset.scoreSource === 'finbert-import') {
    imported = importFinbertPredictions(dataset.finbertBundle, events);
    const scores = new Map(imported.predictions.map(prediction => [prediction.id, prediction.score]));
    events = events.map(event => ({ ...event, score: scores.get(event.id) }));
  } else if (dataset.scoreSource === 'vader') {
    events = events.map(event => ({ ...event, score: vader.SentimentIntensityAnalyzer.polarity_scores(event.text).compound }));
  } else if (dataset.scoreSource !== 'synthetic' || dataset.synthetic !== true) {
    throw new Error('Use VADER, a cleared external import, or explicitly synthetic scores');
  }
  const folds = walkForward(events, dataset.windows, dataset.fitOptions);
  return { notice: 'Offline synthetic plumbing or user-supplied research only; no profitability evidence or readiness certification.',
    readiness: false, liveFeeds: false, alerts: false, trading: false, synthetic: dataset.synthetic === true,
    scoreSource: dataset.scoreSource, provenance: imported?.provenance ?? null,
    assumptions: { priceOptions: { ...dataset.priceOptions }, fitOptions: dataset.fitOptions ?? {},
      positionRule: 'Long only for positive fitted sentiment; otherwise cash. Not a validated return signal.' },
    folds: folds.map(fold => {
      const selected = new Set(fold.testIds);
      const testEvents = events.filter(event => selected.has(event.id));
      const available = testEvents.map(event => ({ ...event, availableAt: new Date(time(event.availableAt) + latencyMs).toISOString() }));
      const prices = joinPriceOutcomes(available, dataset.prices, { horizonsMs: [horizonMs], maxEntryDelayMs, maxExitDelayMs, benchmarkSymbol });
      const byId = new Map(testEvents.map(event => [event.id, event]));
      const predictions = new Map(fold.predictions.map(prediction => [prediction.id, prediction.label]));
      for (const outcome of prices.outcomes) {
        if (time(outcome.exitAt) > time(byId.get(outcome.id).outcomeEndAt)) throw new Error('Declared outcome window does not cover price exit');
      }
      const returns = returnMetrics(prices.outcomes.map(outcome => ({ ...outcome,
        eventId: byId.get(outcome.id).eventId, position: predictions.get(outcome.id) === 'positive' ? 1 : 0 })), dataset.costs);
      return { ...fold, priceJoins: { requested: testEvents.length, matched: prices.outcomes.length, skipped: prices.skipped }, returns };
    }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node server/experiments/run.mjs <local-json>');
  if (!statSync(input).isFile() || statSync(input).size > 10_485_760) throw new Error('Local JSON file must be at most 10 MiB');
  console.log(JSON.stringify(evaluateExperiments(JSON.parse(readFileSync(input, 'utf8'))), null, 2));
}