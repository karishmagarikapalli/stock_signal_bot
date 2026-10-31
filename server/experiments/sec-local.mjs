import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { requiredText, time } from './walk-forward.mjs';

const maxBytes = 1_048_576;
const maxRows = 5000;

function boundedText(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes) throw new Error('Local document exceeds byte bound');
  return value;
}

function cik(value) {
  const text = String(value ?? '');
  if (!/^\d{1,10}$/.test(text) || /^0+$/.test(text)) throw new Error('Invalid CIK');
  return text.padStart(10, '0');
}

function date(value, optional = false) {
  if (optional && (value === '' || value === undefined || value === null)) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Invalid filing date');
  return value;
}

function identity(value) {
  if (!/^\d{10}-\d{2}-\d{6}$/.test(value?.accessionNumber)) throw new Error('Invalid accession identity');
  const accepted = time(value.acceptedAt);
  if (time(value.observedAt) < accepted) throw new Error('Observed time precedes acceptance');
  return { accessionNumber: value.accessionNumber, acceptedAt: value.acceptedAt, observedAt: value.observedAt };
}

export function parseSubmissions(json, { observedAt }) {
  const data = JSON.parse(boundedText(json));
  const issuerCik = cik(data.cik);
  requiredText(data.name, 'entity name');
  time(observedAt);
  const recent = data.filings?.recent;
  const columns = ['accessionNumber', 'filingDate', 'reportDate', 'acceptanceDateTime', 'form', 'primaryDocument'];
  const count = recent?.accessionNumber?.length;
  if (!Number.isSafeInteger(count) || count > maxRows || columns.some(key => !Array.isArray(recent[key]) || recent[key].length !== count) ||
      (recent.items !== undefined && (!Array.isArray(recent.items) || recent.items.length !== count))) throw new Error('Invalid submissions columns or row bound');
  const ids = new Set();
  return recent.accessionNumber.map((accessionNumber, index) => {
    const meta = identity({ accessionNumber, acceptedAt: recent.acceptanceDateTime[index], observedAt });
    if (ids.has(accessionNumber)) throw new Error('Duplicate accession');
    ids.add(accessionNumber);
    const primaryDocument = requiredText(recent.primaryDocument[index], 'primary document');
    if (!/^[A-Za-z0-9_.-]+$/.test(primaryDocument) || primaryDocument.includes('..')) throw new Error('Unsafe primary document');
    return { ...meta, issuerCik, entityName: data.name, form: requiredText(recent.form[index], 'form'),
      filingDate: date(recent.filingDate[index]), reportDate: date(recent.reportDate[index], true), primaryDocument,
      items: recent.items?.[index] ?? '', sentiment: null };
  });
}

export function parse8KSubmission(filing) {
  const meta = identity(filing);
  if (!['8-K', '8-K/A'].includes(filing.form)) throw new Error('Expected 8-K form');
  const value = filing.items;
  if (typeof value !== 'string' || value.length > 1000 || (value.trim() && !/^\d\.\d{2}(\s*,\s*\d\.\d{2})*$/.test(value.trim()))) {
    throw new Error('Invalid 8-K item codes');
  }
  return { ...meta, issuerCik: cik(filing.issuerCik), form: filing.form, amendment: filing.form === '8-K/A',
    filingDate: date(filing.filingDate), reportDate: date(filing.reportDate, true),
    primaryDocument: requiredText(filing.primaryDocument, 'primary document'),
    items: value.trim() ? [...new Set(value.split(',').map(item => item.trim()))] : [],
    sentiment: null, scope: 'Submissions metadata only; no filing body or exhibit interpretation.' };
}

function flag(value) {
  if (value === undefined || value === '') return null;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error('Invalid ownership flag');
}

function decimal(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid ownership decimal');
  return value;
}

export function parseForm4(xml, metadata) {
  const meta = identity(metadata);
  boundedText(xml);
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD and entity declarations forbidden');
  if (XMLValidator.validate(xml) !== true) throw new Error('Malformed ownership XML');
  let nodeCount = 0;
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    processEntities: false, maxNestedTags: 40,
    isArray: name => ['reportingOwner', 'nonDerivativeTransaction', 'derivativeTransaction', 'footnote', 'footnoteId'].includes(name),
    updateTag: name => {
      nodeCount += 1;
      if (nodeCount > 20000 || ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('XML node bound or unsafe name');
      return name;
    } });
  const document = parser.parse(xml).ownershipDocument;
  if (!document || !['4', '4/A'].includes(document.documentType)) throw new Error('Expected Form 4 ownership document');
  if (metadata.form !== undefined && metadata.form !== document.documentType) throw new Error('Form metadata mismatch');
  const issuerCik = cik(document.issuer?.issuerCik);
  if (issuerCik !== cik(metadata.issuerCik)) throw new Error('Issuer CIK mismatch');
  const owners = document.reportingOwner ?? [];
  if (!owners.length || owners.length > maxRows) throw new Error('Reporting owners required');
  const reportingOwners = owners.map(owner => ({ cik: cik(owner.reportingOwnerId?.rptOwnerCik),
    name: requiredText(owner.reportingOwnerId?.rptOwnerName, 'owner name'),
    isDirector: flag(owner.reportingOwnerRelationship?.isDirector), isOfficer: flag(owner.reportingOwnerRelationship?.isOfficer),
    isTenPercentOwner: flag(owner.reportingOwnerRelationship?.isTenPercentOwner),
    isOther: flag(owner.reportingOwnerRelationship?.isOther), officerTitle: owner.reportingOwnerRelationship?.officerTitle ?? null }));
  const transactions = [
    ...(document.nonDerivativeTable?.nonDerivativeTransaction ?? []).map(transaction => ({ transaction, derivative: false })),
    ...(document.derivativeTable?.derivativeTransaction ?? []).map(transaction => ({ transaction, derivative: true })),
  ];
  if (transactions.length > maxRows) throw new Error('Transaction row bound');
  const footnotes = document.footnotes?.footnote ?? [];
  if (footnotes.length > maxRows) throw new Error('Footnote row bound');
  const footnoteIds = new Set();
  for (const note of footnotes) {
    requiredText(note['@_id'], 'footnote id');
    if (footnoteIds.has(note['@_id'])) throw new Error('Duplicate footnote id');
    footnoteIds.add(note['@_id']);
  }
  const normalized = transactions.map(({ transaction, derivative }) => {
    const code = transaction.transactionCoding?.transactionCode;
    const ownership = transaction.ownershipNature?.directOrIndirectOwnership?.value;
    const acquiredDisposed = transaction.transactionAmounts?.transactionAcquiredDisposedCode?.value;
    if (!/^[A-Z]$/.test(code) || !['D', 'I'].includes(ownership) || !['A', 'D'].includes(acquiredDisposed)) throw new Error('Invalid transaction codes');
    const refs = [];
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        if (key === 'footnoteId') refs.push(...nested.map(note => note['@_id']));
        else visit(nested);
      }
    };
    visit(transaction);
    if (refs.some(ref => !footnoteIds.has(ref))) throw new Error('Unresolved footnote');
    return { derivative, securityTitle: requiredText(transaction.securityTitle?.value, 'security title'),
      transactionDate: date(transaction.transactionDate?.value), code, acquiredDisposed, ownership,
      shares: decimal(transaction.transactionAmounts?.transactionShares?.value),
      price: decimal(transaction.transactionAmounts?.transactionPricePerShare?.value),
      sharesFollowing: decimal(transaction.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value),
      footnoteIds: [...new Set(refs)], raw: transaction };
  });
  return { ...meta, issuerCik, issuerName: requiredText(document.issuer?.issuerName, 'issuer name'),
    issuerSymbol: document.issuer?.issuerTradingSymbol ?? null, form: document.documentType,
    amendment: document.documentType === '4/A', periodOfReport: date(document.periodOfReport),
    reportingOwners, transactions: normalized, footnotes, plan10b51: flag(document.aff10b5One),
    sentiment: null, raw: document };
}