import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { textHash } from './finbert-import.mjs';
import { evaluateExperiments } from './run.mjs';

const fixturePath = resolve('server/fixtures/walk-forward-synthetic.json');
const fixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('isolated offline experiment runner', () => {
  it('separates correct sentiment from losing returns, reports attrition and never enables readiness', () => {
    const before = fixture();
    const report = evaluateExperiments(before);
    expect(report.readiness).toBe(false);
    expect(report.liveFeeds || report.alerts || report.trading).toBe(false);
    expect(report.folds[0].sentiment.accuracy).toBe(1);
    expect(report.folds[0].returns.strategy.net.compoundedReturn).toBeCloseTo(-0.1019);
    expect(report.folds[0].priceJoins).toMatchObject({ requested: 3, matched: 2, skipped: [{ id: 'missing-price', horizonMs: 3600000, reason: 'missing-entry' }] });
    expect(report.folds[1].returns.matchedMarket.gross.compoundedReturn).toBeNull();
    expect(before).toEqual(fixture());
  });

  it('has no network dependency and runs local JSON with hostile live configuration still inert', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Network forbidden'); });
    try {
      evaluateExperiments(fixture());
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
    const output = execFileSync(process.execPath, [resolve('server/experiments/run.mjs'), fixturePath], {
      encoding: 'utf8', env: { ...process.env, LIVE_ALERTS_READY: 'true', DRY_RUN: '0', NTFY_TOPIC: 'must-not-send', NTFY_SERVER: 'http://127.0.0.1:1' },
    });
    expect(JSON.parse(output).readiness).toBe(false);
    expect(output).not.toContain('must-not-send');
  });

  it('imports complete externally supplied scores and ignores untrusted event score fields', () => {
    const input = fixture();
    input.scoreSource = 'finbert-import';
    input.finbertBundle = { schemaVersion: 1, execution: 'external-local', provenance: {
      modelId: 'invented-contract-only', modelRevision: 'a'.repeat(40), tokenizerId: 'invented-tokenizer',
      tokenizerRevision: 'b'.repeat(40), weightsSha256: 'c'.repeat(64), license: 'synthetic-fixture-only',
      licenseUrl: 'https://example.invalid/license', sourceUrl: 'https://example.invalid/source',
      conversionProvenance: 'No weights or conversion; invented test contract.', producer: 'unit-test',
      generatedAt: '2025-01-30T00:00:00Z', labelMapping: ['positive', 'negative', 'neutral'],
      rights: { cleared: true, reviewedBy: 'fixture-author', reviewedAt: '2025-01-01T00:00:00Z',
        purpose: 'synthetic contract test only', decisionReference: 'test-fixture', inputDataPermission: 'independently authored' },
    }, predictions: input.events.map(event => ({ id: event.id, inputSha256: textHash(event.text), probabilities: [0.8, 0.1, 0.1] })) };
    const report = evaluateExperiments(input);
    expect(report.provenance.modelId).toBe('invented-contract-only');
    expect(report.folds[0].predictions.every(prediction => prediction.label === 'positive')).toBe(true);
    input.events.forEach(event => { event.score = -1; });
    expect(evaluateExperiments(input)).toEqual(report);
  });

  it('computes local VADER scores rather than trusting supplied synthetic features', () => {
    const input = fixture();
    input.scoreSource = 'vader';
    input.synthetic = false;
    const report = evaluateExperiments(input);
    input.events.forEach(event => { event.score = NaN; });
    expect(evaluateExperiments(input)).toEqual(report);
    expect(report.provenance).toBeNull();
    expect(report.readiness).toBe(false);
  });

  it('requires explicit timing, prevents synthetic score bypass, and respects latency and actual outcome bounds', () => {
    const input = fixture();
    input.synthetic = false;
    expect(() => evaluateExperiments(input)).toThrow('cleared external');
    input.scoreSource = 'finbert-import';
    expect(() => evaluateExperiments(input)).toThrow('contract');
    const late = fixture();
    late.priceOptions.latencyMs = 120000;
    expect(() => evaluateExperiments(late)).toThrow('does not cover');
    late.events = late.events.map(event => ({ ...event, outcomeEndAt: new Date(Date.parse(event.outcomeEndAt) + 300000).toISOString() }));
    expect(evaluateExperiments(late).folds[0].priceJoins.matched).toBe(0);
    const understated = fixture();
    understated.events[3].outcomeEndAt = '2025-01-11T15:00:00Z';
    expect(() => evaluateExperiments(understated)).toThrow('does not cover');
    understated.events[0].outcomeEndAt = '2025-01-02T15:00:00Z';
    expect(() => evaluateExperiments(understated)).toThrow('does not cover');
    const changedPrices = fixture();
    changedPrices.prices = changedPrices.prices.map(point => ({ ...point, price: point.price * 2 }));
    expect(evaluateExperiments(changedPrices).folds.map(fold => fold.fit)).toEqual(evaluateExperiments(fixture()).folds.map(fold => fold.fit));
    const invalid = fixture();
    delete invalid.priceOptions.latencyMs;
    expect(() => evaluateExperiments(invalid)).toThrow('timing');
  });
});