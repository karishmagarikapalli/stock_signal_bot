import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse8KSubmission, parseForm4, parseSubmissions } from './sec-local.mjs';

const json = readFileSync(new URL('../fixtures/sec-submissions-synthetic.json', import.meta.url), 'utf8');
const xml = readFileSync(new URL('../fixtures/sec-form4-synthetic.xml', import.meta.url), 'utf8');
const observedAt = '2025-01-05T00:00:00Z';
const filings = () => parseSubmissions(json, { observedAt });

describe('local official-shaped SEC fixtures with no sentiment inference', () => {
  it('preserves accession, CIK, acceptance, observation and 8-K items/amendments', () => {
    const rows = filings();
    expect(rows[0].issuerCik).toBe('0000000001');
    expect(rows[0].acceptedAt).toBe('2025-01-02T18:00:00Z');
    expect(rows[0].observedAt).toBe(observedAt);
    expect(parse8KSubmission(rows[1]).items).toEqual(['2.02', '5.02', '9.01']);
    expect(parse8KSubmission(rows[2]).amendment).toBe(true);
    expect(parse8KSubmission(rows[1]).sentiment).toBeNull();
    expect(parse8KSubmission({ ...rows[1], reportDate: null, items: '' })).toMatchObject({ reportDate: null, items: [] });
    expect(() => parse8KSubmission(rows[0])).toThrow('8-K');
    expect(() => parse8KSubmission({ ...rows[1], items: 'positive' })).toThrow('item');
  });

  it('extracts ownership facts as decimal strings, preserves derivatives/footnotes, and never labels sales bearish', () => {
    const report = parseForm4(xml, filings()[0]);
    expect(report.reportingOwners[0]).toMatchObject({ cik: '0000000002', isOfficer: true, isDirector: false });
    expect(report.transactions[0]).toMatchObject({ code: 'S', shares: '10.5', price: '12.00', derivative: false, ownership: 'D', footnoteIds: ['F1'] });
    expect(report.transactions[1]).toMatchObject({ code: 'M', derivative: true, price: null, ownership: 'I' });
    expect(report.transactions[1].raw.conversionOrExercisePrice.value).toBe('5.00');
    expect(report.plan10b51).toBe(true);
    expect(report.sentiment).toBeNull();
    expect(parseForm4(xml.replace('<documentType>4<', '<documentType>4/A<'), { ...filings()[0], form: '4/A' }).amendment).toBe(true);
  });

  it('rejects DTD/entity expansion, malformed XML, unsafe names, size and depth attacks', () => {
    for (const bad of ['<!DOCTYPE ownershipDocument [<!ENTITY x SYSTEM "file:///secret">]>' + xml,
      '<!ENTITY x "boom">' + xml, '<ownershipDocument>', '<ownershipDocument><__proto__/></ownershipDocument>',
      'x'.repeat(1_048_577), '<deep>'.repeat(45) + '</deep>'.repeat(45)]) {
      expect(() => parseForm4(bad, filings()[0])).toThrow();
    }
  });

  it('rejects conflicting identities, time travel, invalid dates, dangling footnotes and malformed column arrays', () => {
    expect(() => parseForm4(xml, { ...filings()[0], issuerCik: '3' })).toThrow('CIK mismatch');
    expect(() => parseForm4(xml, { ...filings()[0], form: '8-K' })).toThrow('Form metadata mismatch');
    expect(() => parseForm4(xml, { ...filings()[0], observedAt: '2025-01-01T00:00:00Z' })).toThrow('precedes');
    expect(() => parseForm4(xml.replace('2025-01-01', '2025-02-30'), filings()[0])).toThrow('date');
    expect(() => parseForm4(xml.replace('footnote id="F1"', 'footnote id="F2"'), filings()[0])).toThrow('Unresolved');
    const input = JSON.parse(json);
    input.filings.recent.form.pop();
    expect(() => parseSubmissions(JSON.stringify(input), { observedAt })).toThrow('columns');
    expect(() => parseSubmissions(json, { observedAt: '2025-01-05' })).toThrow('timezone');
    const unsafe = JSON.parse(json);
    unsafe.filings.recent.primaryDocument[0] = '../secret';
    expect(() => parseSubmissions(JSON.stringify(unsafe), { observedAt })).toThrow('Unsafe');
    const empty = JSON.parse(json);
    empty.filings.recent.reportDate[1] = '';
    expect(parse8KSubmission(parseSubmissions(JSON.stringify(empty), { observedAt })[1]).reportDate).toBeNull();
  });
});