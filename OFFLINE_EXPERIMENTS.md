# Offline Stock Experiments

Scope review: 2026-10-30. These are isolated plain-JavaScript research functions,
not an ingestion service, model inference implementation, or trading system.
Only invented fixtures were evaluated. No performance or profitability claim
follows. Existing runtime code, Actions readiness, local configuration, feeds,
alerts, and trading are unchanged. Reports hard-code readiness/live feeds/alerts/
trading to false; no environment variable can enable them in this runner.

## Commands

From the stock repository, using Node.js 20.19+ and the existing dependencies:

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm research:test
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm research:walk-forward server/fixtures/walk-forward-synthetic.json
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm check
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm test
```

The CLI reads one local JSON file (maximum 10 MiB) and writes JSON to stdout.
It does not load dotenv, ingest RSS, import the scheduler, read secrets, fetch
SEC data, download weights, or send notifications. No install or lockfile change
is required. `research:test` includes local SEC and score-import tests.
Default `check` syntax-checks the new JavaScript; the existing standalone
TypeScript configuration is unchanged and does not typecheck the new tests.

## Evaluation Input

[The synthetic dataset](server/fixtures/walk-forward-synthetic.json) is a complete
executable schema-v1 example. Its headline labels, scores, events and prices are
independently invented, not predictions from FinBERT or real market observations.
Positive sentiment deliberately precedes losses in the fixture.

Each event requires a unique `id`, family `eventId`, `symbol`, exact `text`, an
independent sentiment `label` (`negative`, `neutral`, `positive`), timezone-aware
`availableAt` and `outcomeEndAt`. `score` is in [-1, 1]. Availability must represent
the first usable content version, not merely a historical publication time.
Outcome end must conservatively cover the entire contemplated return window.
The runner rejects ends at/before availability + latency + horizon, and actual
joined exits later than the declared end. Training labels/features are assumed
available by that end; verify this assumption for any supplied real data.

`scoreSource` is one of:

- `synthetic`: caller-supplied scores, allowed only with `synthetic: true`.
- `vader`: locally computed compound score from the installed VADER package;
  event score fields are ignored.
- `finbert-import`: scores from the validated, embedded `finbertBundle` contract
  below; event score fields are ignored. No automatic fallback on rejection.

`windows` declares chronological disjoint `testStart`/`testEnd` boundaries.
`fitOptions` accepts predeclared `thresholds` (default 0.05, 0.25, 0.5) and
`embargoMs` (default zero). Prices have the existing evaluator's `symbol`,
timezone-aware `at`, positive numeric `price` contract. `priceOptions` requires
`horizonMs`, `latencyMs`, `maxEntryDelayMs`, `maxExitDelayMs`, `benchmarkSymbol`.
Explicit nonnegative per-side costs are required: `commissionBps`, `feesBps`,
`halfSpreadBps`, `slippageBps`. No implicit zero-cost evaluation.

## Walk-Forward Rules

[walk-forward.mjs](server/experiments/walk-forward.mjs) uses expanding training
and half-open test availability windows [start, end). No row after the training
cutoff can affect fitting. It does not optimize on returns.

1. Group all rows by caller-supplied event-family ID before splitting. A family
   trains only when every copy's availability and outcome end are strictly before
   `testStart - embargoMs`. This both purges overlapping outcomes and leaves a
   pre-test time gap. Equality is excluded conservatively. This is a preceding
   embargo, not two-sided cross-validation embargo.
2. A test family is eligible only when every copy starts inside its test window
   and every outcome ends strictly before its end. Families straddling boundaries
   or the embargo are excluded entirely, not partly admitted to training/test.
   Global family membership is used only for conservative exclusions, never fit
   features. Unknown duplicates are not discovered automatically.
3. Keep the earliest row in each eligible family, breaking equal-time ties by
   ID, so copies do not multiply fitting or reported support. Return selected
   training/test IDs, excluded family IDs, and collapsed-duplicate count.
4. Fit a symmetric absolute score threshold to training sentiment macro-F1
   only. Above/equal +threshold is positive, below/equal -threshold negative,
   otherwise neutral. Sort candidate thresholds ascending; ties retain the
   smallest. Empty training throws; empty test produces null summary accuracy.
5. Freeze that threshold for the fold. Report confusion matrix, per-class
   precision/recall/F1/support, macro-F1, always-neutral and training-majority
   baselines. Majority ties use negative, neutral, positive order. Earlier test
   rows may enter a later training window only after their outcomes and embargo
   have elapsed. Folds are dependent, not independent samples.

No rolling hyperparameter search, fitted text preprocessing, return-trained
threshold, uncertainty interval, multiple-testing correction, untouched final
holdout management, or pretrained training-overlap verification is implemented.
Predeclare choices and reserve an untouched holdout outside this runner.

## Return Observations

[run.mjs](server/experiments/run.mjs) reuses the existing price joiner. Entry is
the first point **strictly after** availability + processing latency, within the
entry tolerance. Exit is the first point at/after entry + elapsed horizon within
exit tolerance. No interpolation or silent horizon expansion. Invalid/missing
points are skipped, not zeroed. Market prices must match both timestamps exactly;
missing market returns remain null. Report requested, matched and skipped joins.

[return-metrics.mjs](server/experiments/return-metrics.mjs) intentionally supports
only long (positive fitted sentiment) or cash (negative/neutral). That mapping is
a toy predeclared hypothesis, not a financial meaning of sentiment or a validated
BUY/SELL rule. No shorts, borrowing, leverage, concurrent positions, or orders.

For raw return `r = exit / entry - 1`, let `c` be the sum of the four per-side
basis-point assumptions divided by 10,000. With one unit of entry capital:
gross long return is `r`; round-trip cost fraction is `c * (2 + r)` because exit
notional changes with price; net is `r - c * (2 + r)`. Cash return and cost are
zero. Capital exhaustion under these assumptions throws instead of pretending
the account can keep trading. Costs are percentage assumptions, not a broker fee
schedule, measured spread, or executable quote simulation.

Sort by entry then ID; retain one window at a time and one record per family.
Overlapping windows (including cash windows) and repeat families are reported as
skips. Exit-time equality with the next entry is allowed. All baselines use the
same retained windows. This greedy policy does not select on future returns.

Report compounded gross/net strategy equity, realized-close peak-to-trough
maximum drawdown, trade count, turnover (sum of entry + exit notionals relative
to each trade's starting capital), and held-time exposure over first entry to
last exit. Initial equity is 1; an empty ledger stays 1 with zero drawdown, but
has no evidence and null exposure. Drawdown omits intratrade/overnight marks.
No-trade stays flat; always-long holds each selected symbol window; matched-market
holds the benchmark for each same window with the same percentage cost model.
These are event-window baselines, **not** continuous buy-and-hold. One missing
market window makes aggregate market return/drawdown null, not a smaller silent
denominator. Raw excess return is asset raw minus matched market raw, not alpha.
Each fold restarts capital; no combined out-of-sample portfolio is reported.

Price timestamps must already represent executable availability. No calendar,
session/holiday/DST/halts handling, corporate actions, feed/adjustment consistency
audit, stale-price detection beyond tolerances, delisting/survivorship correction,
point-in-time universe, exchange rights validation, cash interest, taxes, market
impact, or partial fills. Synthetic tests validate arithmetic, not these gaps.

## External FinBERT Contract

Reviewed official [model API](https://huggingface.co/api/models/ProsusAI/finbert)
and [pinned model card](https://huggingface.co/ProsusAI/finbert/blob/0bc2ac10dda6929bcb1f77ccc43c7ec5c424f031/README.md)
on 2026-10-30. API revision: `0bc2ac10dda6929bcb1f77ccc43c7ec5c424f031`.
Weights: **CC BY-NC-SA 4.0**, restricting commercial use. Financial PhraseBank:
CC BY-NC-SA 3.0; Reuters TRC2 has separate access conditions. The
[code license](https://github.com/ProsusAI/finBERT/blob/master/LICENSE) is
Apache-2.0 and does not clear weights, training data, input text, or commercial
use. No model files were downloaded and no inference/ONNX conversion was run.
This source review is not legal advice or a use-specific permission decision.

[finbert-import.mjs](server/experiments/finbert-import.mjs) accepts a JSON object:

- `schemaVersion: 1`, `execution: "external-local"`.
- `provenance`: nonblank `modelId`, 40-hex `modelRevision`, `tokenizerId`, 40-hex
  `tokenizerRevision`, 64-hex `weightsSha256`, `license`, HTTPS `licenseUrl` and
  `sourceUrl`, `conversionProvenance` (explicitly state none if unconverted),
  `producer` (include engine/version), timezone-aware `generatedAt`.
- `provenance.labelMapping`: a permutation of positive, negative, neutral,
  explicitly mapping the three probability array positions. No inferred order.
- `provenance.rights`: literal `cleared: true`, nonblank `reviewedBy`,
  timezone-aware `reviewedAt`, `purpose`, `decisionReference`,
  `inputDataPermission`. Missing/uncleared rights fail closed.
- `predictions`: exactly one per event with matching `id`, `inputSha256` of exact
  UTF-8 text bytes, and three finite probabilities in [0, 1] summing to 1 within
  1e-6. Missing, extra, duplicate, stale-text and malformed predictions fail.

The importer returns argmax labels and signed positive-minus-negative scores,
plus a copy of provenance. The walk-forward runner fits thresholds on these
signed scores; argmax labels are not its threshold predictions. Probability
ties use positive, negative, neutral order. These are sentiment scores, not
probabilities of returns. Test provenance is explicitly fictional and cannot be
used as a real artifact clearance. Revision/digest fields and rights are caller
attestations: the importer cannot verify files it never opens or legal rights.
Generated time is provenance, not proof of historical model/input availability.
Independently verify historical training cutoffs and content versions before
any real study. There is no weights cache, model service, or download path.

## Local SEC Parsers

[sec-local.mjs](server/experiments/sec-local.mjs) implements:

- `parseSubmissions(jsonText, { observedAt })`: official `filings.recent` parallel
  arrays, aligned lengths, normalized 10-digit CIK, accession, filing/report
  dates, acceptance timestamp, observed timestamp, form and primary document.
  Required column names match the [official submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
  It does not follow older-history files or use current ticker mappings as
  historical identity. Accession's CIK prefix may belong to a filing agent.
- `parse8KSubmission(filing)`: 8-K/8-K/A item-code extraction from that metadata,
  preserved identity/times, explicit amendment flag. Missing item codes yield an
  empty list, not an inferred category. No HTML/exhibit/body parsing, event-date
  inference, press-release matching, amendment linkage, or legal classification.
- `parseForm4(xmlText, metadata)`: standalone ownership XML with externally
  supplied accession, issuer CIK, accepted/observed times, optionally form.
  Rejects mismatched CIK/form. Preserves owner identity/roles, dates, transaction
  codes, direct/indirect and acquired/disposed indicators, decimal-string
  quantities/prices (missing stays null), derivative flag, footnotes/references,
  raw document and raw transaction fields. Preserves 10b5-1 flag as reported,
  not as verified plan compliance. Does not connect amendments or infer intent.

All three return `sentiment: null`. A sale, award, exercise, or 8-K item is not
intrinsically bullish/bearish. An acceptance time or transaction date is not
proof of first public availability; observation must be supplied and cannot
precede acceptance. Tests use independently invented official-shaped local
[submissions JSON](server/fixtures/sec-submissions-synthetic.json) and
[ownership XML](server/fixtures/sec-form4-synthetic.xml), not actual SEC filings
or a full XSD/form-instructions conformance corpus.

Input limits: 1 MiB per JSON/XML document, 5,000 submissions/transaction/footnote
rows, 40 nested XML tags, 20,000 XML nodes. Uses the existing fast-xml-parser with
entity processing disabled; rejects DTD/entity declarations before parsing,
malformed XML, unsafe property names, dangling footnotes and duplicate identities.
Built-in XML entity escapes remain literal; never render raw parser output as
trusted HTML. Supported formats are deliberately narrow; unsupported structures
must be reviewed, not silently interpreted as investment signals.

**No live SEC adapter exists.** No setting can enable fetching in these modules.
A future adapter requires an owner-approved **public identifying User-Agent
with an actual owner contact address**, not a fabricated/shared placeholder,
plus caching, backoff and an aggregate rate below the SEC's current 10 req/s
ceiling. See [official fair-access guidance](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data).
The owner's public contact is not supplied here. No submission/data endpoint
was fetched for these experiments; only public documentation/model metadata
was consulted. Live collection, SEC deadline/legal-form audit, dissemination
measurement, and data rights review remain deferred. Readiness remains false.