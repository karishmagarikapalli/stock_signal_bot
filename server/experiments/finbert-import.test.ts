import { describe, expect, it } from 'vitest';
import { importFinbertPredictions, textHash } from './finbert-import.mjs';

const events = [{ id: 'invented', text: 'Invented fixture, not model output.' }];
const bundle = () => ({ schemaVersion: 1, execution: 'external-local', provenance: {
  modelId: 'synthetic-contract-not-a-model', modelRevision: 'a'.repeat(40), tokenizerId: 'synthetic-tokenizer',
  tokenizerRevision: 'b'.repeat(40), weightsSha256: 'c'.repeat(64), license: 'synthetic-fixture-only',
  licenseUrl: 'https://example.invalid/license', sourceUrl: 'https://example.invalid/source',
  conversionProvenance: 'No conversion or weights; invented test contract.', producer: 'unit-test',
  generatedAt: '2025-01-01T00:00:00Z', labelMapping: ['neutral', 'negative', 'positive'],
  rights: { cleared: true, reviewedBy: 'fixture-author', reviewedAt: '2025-01-01T00:00:00Z',
    purpose: 'synthetic contract test only', decisionReference: 'test-fixture', inputDataPermission: 'independently authored' },
}, predictions: [{ id: 'invented', inputSha256: textHash(events[0].text), probabilities: [0.1, 0.2, 0.7] }] });

describe('external local FinBERT score contract, not inference', () => {
  it('uses explicit label ordering and preserves provenance without mutating inputs', () => {
    const input = bundle();
    const report = importFinbertPredictions(input, events);
    expect(report.predictions[0].score).toBeCloseTo(0.5);
    expect(report.predictions[0].label).toBe('positive');
    report.provenance.rights.cleared = false;
    expect(input.provenance.rights.cleared).toBe(true);
  });

  it('rejects missing provenance, moving revisions, unclear rights and mismatched input versions', () => {
    for (const key of ['license', 'conversionProvenance', 'tokenizerRevision', 'weightsSha256', 'producer']) {
      const input = bundle();
      delete input.provenance[key];
      expect(() => importFinbertPredictions(input, events)).toThrow();
    }
    const moving = bundle();
    moving.provenance.modelRevision = 'main';
    expect(() => importFinbertPredictions(moving, events)).toThrow('Pinned');
    const unclear = bundle();
    unclear.provenance.rights.cleared = false;
    expect(() => importFinbertPredictions(unclear, events)).toThrow('Uncleared');
    expect(() => importFinbertPredictions(bundle(), [{ ...events[0], text: 'different version' }])).toThrow('hash mismatch');
  });

  it('rejects partial, duplicate, nonfinite, unnormalized and unmapped scores', () => {
    const partial = bundle();
    partial.predictions = [];
    expect(() => importFinbertPredictions(partial, events)).toThrow('coverage');
    for (const values of [[1, 1, 0], [NaN, 0, 1], [-1, 1, 1], [1]]) {
      const input = bundle();
      input.predictions[0].probabilities = values;
      expect(() => importFinbertPredictions(input, events)).toThrow('probabilities');
    }
    const unmapped = bundle();
    unmapped.provenance.labelMapping = ['positive', 'positive', 'negative'];
    expect(() => importFinbertPredictions(unmapped, events)).toThrow('mapping');
    const duplicate = bundle();
    duplicate.predictions.push(duplicate.predictions[0]);
    expect(() => importFinbertPredictions(duplicate, [...events, { ...events[0], id: 'other' }])).toThrow('Duplicate prediction');
  });
});