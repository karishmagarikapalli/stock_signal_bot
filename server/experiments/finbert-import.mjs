import { createHash } from 'node:crypto';
import { requiredText, time } from './walk-forward.mjs';

const labels = ['positive', 'negative', 'neutral'];
const revisionPattern = /^[a-f0-9]{40}$/;

export function textHash(text) {
  return createHash('sha256').update(requiredText(text, 'input text'), 'utf8').digest('hex');
}

export function importFinbertPredictions(bundle, events) {
  if (bundle?.schemaVersion !== 1 || bundle.execution !== 'external-local') throw new Error('External-local contract v1 required');
  const provenance = bundle.provenance;
  for (const name of ['modelId', 'modelRevision', 'tokenizerId', 'tokenizerRevision', 'weightsSha256',
    'license', 'licenseUrl', 'sourceUrl', 'conversionProvenance', 'producer', 'generatedAt']) {
    requiredText(provenance?.[name], name);
  }
  if (!revisionPattern.test(provenance.modelRevision) || !revisionPattern.test(provenance.tokenizerRevision) ||
      !/^[a-f0-9]{64}$/.test(provenance.weightsSha256)) throw new Error('Pinned revisions and weights digest required');
  for (const name of ['licenseUrl', 'sourceUrl']) {
    if (new URL(provenance[name]).protocol !== 'https:') throw new Error('HTTPS provenance URL required');
  }
  time(provenance.generatedAt);
  const rights = provenance.rights;
  if (rights?.cleared !== true) throw new Error('Uncleared rights');
  for (const name of ['reviewedBy', 'reviewedAt', 'purpose', 'decisionReference', 'inputDataPermission']) requiredText(rights[name], name);
  time(rights.reviewedAt);
  if (!Array.isArray(provenance.labelMapping) || provenance.labelMapping.length !== 3 ||
      new Set(provenance.labelMapping).size !== 3 || provenance.labelMapping.some(label => !labels.includes(label))) {
    throw new Error('Explicit three-class label mapping required');
  }
  if (!Array.isArray(bundle.predictions) || bundle.predictions.length !== events.length) throw new Error('Prediction coverage mismatch');
  const byId = new Map();
  for (const prediction of bundle.predictions) {
    requiredText(prediction.id, 'prediction id');
    if (byId.has(prediction.id)) throw new Error('Duplicate prediction id');
    if (!Array.isArray(prediction.probabilities) || prediction.probabilities.length !== 3 ||
        prediction.probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 1) ||
        Math.abs(prediction.probabilities.reduce((total, value) => total + value, 0) - 1) > 1e-6) {
      throw new Error('Three normalized probabilities required');
    }
    byId.set(prediction.id, prediction);
  }
  const ids = new Set();
  const predictions = events.map(event => {
    requiredText(event.id, 'event id');
    if (ids.has(event.id)) throw new Error('Duplicate event id');
    ids.add(event.id);
    const prediction = byId.get(event.id);
    if (!prediction || prediction.inputSha256 !== textHash(event.text)) throw new Error('Missing prediction or input hash mismatch');
    const scores = Object.fromEntries(provenance.labelMapping.map((label, index) => [label, prediction.probabilities[index]]));
    const label = labels.reduce((best, candidate) => scores[candidate] > scores[best] ? candidate : best, labels[0]);
    return { id: event.id, score: scores.positive - scores.negative, label, probabilities: scores };
  });
  return { provenance: structuredClone(provenance), predictions,
    notice: 'Externally supplied scores only; no weights, tokenizer, inference, or legal clearance implemented.' };
}