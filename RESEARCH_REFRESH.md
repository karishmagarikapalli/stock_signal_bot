# Research Refresh

Reviewed: 2026-10-31 (UTC). Official public sources below were checked during
this review; quotas, licensing, entitlements, and prices can change. This note
supersedes conflicting claims in [RESEARCH.md](RESEARCH.md), not the supported
runtime description in [ARCHITECTURE.md](ARCHITECTURE.md). No return, accuracy,
latency, or profitability claim is established.

## Decision And Implementation Status

Keep the headline experiment dry until data rights, independent evaluation,
delivery security, and operational review are complete. No repository readiness
variable was enabled, secret read, real alert sent, or investment action taken.

Implemented: an offline JavaScript evaluator using the existing VADER package,
an always-neutral baseline, independently authored synthetic labels, confusion
matrices/per-class precision/recall/F1 and macro-F1, and timestamped price joins.
Also implemented: a fail-closed Actions delivery gate. Not implemented: FinBERT
inference, real-price backtesting, SEC ingestion, or a statistical-arbitrage engine.

Offline extension reviewed 2026-10-30: [OFFLINE_EXPERIMENTS.md](OFFLINE_EXPERIMENTS.md)
specifies the isolated executable walk-forward, costs/drawdown/baselines,
external FinBERT score-import contract, and local official-shaped SEC fixture
parsers. These additions supersede the earlier slice's missing-control notes
only to the extent explicitly documented there. They do not implement FinBERT
inference, live SEC collection, or real-data validation; readiness stays false.

## Data Access Is Not A License

| Source | Current published access | Research restriction |
| --- | --- | --- |
| [Finnhub pricing](https://finnhub.io/pricing) | Free 60 calls/minute; personal use; advertises company news and one-year history | Dataset entitlements vary; table checkmarks do not extract reliably. Confirm the specific endpoint and retention/display/analysis rights. No latency SLA inferred. |
| [Marketaux pricing](https://www.marketaux.com/pricing) | Free 100 requests/day, three articles/request | Not unlimited collection or full-article rights. Confirm analysis, retention, and redistribution terms before archiving. |
| [Alpha Vantage support](https://www.alphavantage.co/support/#api-key) and [API documentation](https://www.alphavantage.co/documentation/#dailyadj) | General free allowance 25 requests/day; daily raw compact output is limited; daily adjusted/intraday endpoints marked premium | Do not assume the quota grants premium endpoints. Full history and realtime/delayed entitlements differ. Terms page could not be meaningfully extracted: rights audit incomplete. |
| [Alpaca market data](https://docs.alpaca.markets/docs/about-market-data-api) | Basic: IEX realtime, 30 websocket symbols, 200 historical calls/minute, history since 2016, latest-15-minute historical restriction; paid consolidated plan listed at $99/month | IEX is not consolidated US trading. Confirm personal/nonprofessional status and exchange agreements. API access does not confer redistribution rights. |

The runtime's existing Google News/Yahoo RSS access is not a clearance for model
training, long-term archiving, scoring, or republication. [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
restrict automated collection and separately condition RSS display on supplied
content, attribution, source links, and other restrictions. [Google terms](https://policies.google.com/terms)
require respect for access restrictions and third-party rights; publishers own
their content. Do not fetch licensed full articles. Record a per-source permission
decision before any real collection/evaluation pipeline. This review is not legal advice.

[Alpaca historical bars](https://docs.alpaca.markets/reference/stockbars) require
pagination (sorted by symbol then time; limit is not per-symbol), explicit feed
and adjustment choice. Default adjustment is raw. Its `asof` symbol mapping is
not a point-in-time revision guarantee. Never mix raw and adjusted series or
IEX and consolidated prices without documenting the difference. Exchange terms
linked from [disclosures](https://alpaca.markets/disclosures) still need review;
the API specification's license does not license underlying market data.

## Sentiment Benchmark Plan

[VADER upstream](https://github.com/cjhutto/vaderSentiment) is MIT-licensed,
lexicon/rule based and developed for social-media sentiment, not financial
return prediction. The existing JavaScript port is already installed. Compound
scores range from -1 to 1, with conventional positive >= 0.05 and negative <=
-0.05 thresholds. They are not calibrated probabilities of price moves.

[FinBERT code](https://github.com/ProsusAI/finBERT) is Apache-2.0, but its
[model card](https://huggingface.co/ProsusAI/finbert) separately identifies model
weights as CC BY-NC-SA 4.0 and Financial PhraseBank as CC BY-NC-SA 3.0; Reuters
TRC2 has separate access conditions. Do not treat the repository license as
permission for commercial weights/data use. Pin and recheck the exact artifact,
revision, tokenizer, label mapping, conversion provenance, and license before
downloading. No model was downloaded or benchmarked here.

[Transformers.js](https://huggingface.co/docs/transformers.js/en/index) provides
local ONNX inference options, including CPU/WASM and quantization; a compatible,
licensed FinBERT artifact is a separate prerequisite, not established here.
Use the existing JS runtime if that gate clears; no Python service is required
for this scaffold. An unavailable or incompatible model should remain deferred.

Pre-register a representative, rights-cleared financial-headline sample with
independent human labels, annotation guidelines, disagreement adjudication,
language/source coverage, and event IDs. Annotators must not see model predictions
or future returns. Include neutral/ambiguous/negated statements. Record training
overlap risk for pretrained models. Compare always-neutral and training-majority
baselines, VADER, and only then a license-cleared local model. Report held-out
macro-F1, per-class support/precision/recall, confusion matrices, missing cases,
CPU latency and memory on named hardware. Sentiment labels and subsequent-return
labels answer different questions; do not substitute one for the other.

## Real-Time And Price Evaluation Protocol

Store source publication time, first-seen time, retrieval time, revisions,
source/event IDs, and exact content version, subject to permission. For filings,
also store SEC acceptance and observed dissemination times. Use timezone-aware
UTC and retain original timezone metadata. Historical publication timestamps
alone do not prove that the system could have observed the event then.

1. Freeze universe, features, thresholds, horizons, entry latency, and costs on
   training data. Group syndicated/duplicate headlines and related filings as
   one event family; do not split copies across train and test.
2. Use chronological train/validation/test or walk-forward folds, purging events
   whose outcome windows overlap evaluation boundaries and applying an embargo.
   Fit all preprocessing, pair selection, and calibration on training only.
   [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
   documents temporal ordering and gaps; its comparable-duration folds assume
   equally spaced samples, so irregular events need time-based boundaries.
3. Enter only after first availability plus realistic processing/execution
   latency. A bar stamped at its opening time may contain future information;
   normalize bar end/availability or use genuinely executable quotes. Apply
   exchange sessions, holidays, daylight saving, halts, and after-hours rules.
4. Predeclare intraday and multi-session horizons. Use consistently adjusted
   prices, corporate actions, historical symbol/entity mappings, delisted names,
   and aligned benchmark timestamps. Raw return is exit/entry - 1; excess return
   here is raw return minus same-window market return, not risk-model alpha.
5. Unknown/nonpositive/nonfinite/stale prices are missing, never zero. Report
   skipped counts/reasons, unmatched market returns, and denominator attrition.
   Do not interpolate across missing sessions, backfill from future bars, or
   silently expand the horizon to obtain an outcome.
6. Report gross and net results with commissions, fees, spread, slippage,
   market impact assumptions, and short borrow/availability where relevant.
   Compare market/no-trade baselines, turnover, drawdown and exposure, not just
   directional hit rate. Use dependence-aware/block uncertainty estimates and
   correct for tried models, thresholds, universes, and horizons. Keep a final
   untouched holdout. Reject unstable or cost-sensitive results.

### Executable Offline Slice

From the repository root:

```powershell
pnpm research:evaluate server/fixtures/research-synthetic.json
pnpm exec vitest run server/research-evaluation.test.ts
```

[server/research-evaluation.mjs](server/research-evaluation.mjs) reads only the
supplied local JSON, not dotenv, ingestion, RSS, or ntfy. Each event supplies
`id`, `symbol`, `text`, independent `label`, and timezone-aware `availableAt`.
Each price supplies `symbol`, `at`, and numeric positive `price` (unknown values
are skipped, not coerced). Duplicate symbol/timestamp pairs fail validation.

Entry is the first point strictly after availability within `maxEntryDelayMs`;
exit is the first point at or after entry plus each `horizonsMs`, within
`maxExitDelayMs`. Defaults: one hour/24 elapsed hours, entry tolerance one minute,
exit tolerance zero. Missing/invalid entry or exit produces a skipped record;
missing exact-time benchmark prices yield null market/excess returns. Input
arrays are sorted chronologically, never used to fit/tune a model. Metrics use
all three classes; absent-class F1 is zero, empty-set summary metrics null.

The checked-in fixture is invented and intentionally obvious. Its scores only
test plumbing. It is not representative held-out evidence. This slice has no
calendar, bar-availability/revision model, latency beyond supplied timestamps,
corporate-action processing, fees, trade simulation, confidence intervals, or
walk-forward training. Use normalized permitted inputs and implement those
controls before drawing real-data conclusions. Elapsed 24h is not one trading
session. Returns are observations, not simulated executable P&L.

## SEC Form 4 And 8-K Research

[SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
offer public submissions/XBRL JSON without API keys and nightly bulk files.
XBRL company facts are not a Form 4 ownership XML parser. [EDGAR access guidance](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)
requires a declared identifying User-Agent and an aggregate maximum of ten
requests/second; stay below that with caching, bounded polling, retry/backoff,
and a real contact address supplied outside this repository. No SEC requests
were integrated into ingestion.

EDGAR acceptance is not always immediate public dissemination: cutoff rules can
defer some filings until the next business day. Nightly indexes are not realtime
feeds. Record first-seen versions; amendments, deletions, ticker mapping changes,
and index corrections must not rewrite earlier knowledge in a backtest.

[Form 4 investor bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-69):
most reportable transactions are disclosed within two business days, not on the
transaction date itself. Preserve issuer CIK, owner identity/role, accession,
transaction date/code, direct/indirect ownership, quantities/prices, derivative
status and footnotes. P/S indicate purchases/sales on an exchange or from/to
another person, not necessarily exclusively open-market trades. Separate A
(awards), M (exercise/conversion), F (exercise price/tax withholding), gifts and
other codes. Inspect 10b5-1 plan indicators and amendments under current form
instructions before inference; parser details remain unimplemented/unverified.
Insiders also sell for liquidity/diversification. A filing is not a buy/sell rule.

[8-K investor bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read-8):
most disclosures are due within four business days, with earlier deadlines and
exceptions. Items 1.01, 2.02, 4.02, 5.02, 7.01 and 8.01 cover very different
events; an officer change or material agreement is not intrinsically directional.
Use item-aware extraction, original exhibits, context, amendment links, and
human-reviewed labels. An earlier press release may be the true first public
event; avoid counting its later filing as independent surprise. Exact form
instructions/deadline exceptions need verification before building a parser;
PDF extraction failed during this review, so no complete legal-form audit is claimed.

## Statistical Arbitrage: Paper Only

Retain [STATISTICAL_ARBITRAGE_RESEARCH.md](STATISTICAL_ARBITRAGE_RESEARCH.md) as a
proposal, not an implemented strategy. Its Python library examples are research
references, not a new supported runtime. Start only after permission for aligned
daily adjusted histories, delisted entities, and needed retention is confirmed.
No brokerage orders or ntfy strategy alerts belong in this experiment.

Predefine a small same-sector universe; select pairs and estimate hedge ratios
on training windows only. Correlation is not cointegration. [Engle-Granger reference](https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.coint.html)
tests the null of no cointegration, assumes I(1) inputs, and has numerical/gap
caveats. Use a proven validated implementation rather than inventing a JS test.
Investigate stationarity assumptions and structural breaks before testing spreads.

Correct for searching many pairs/windows ([multiple-testing methods](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html),
including dependence assumptions). Walk forward with frozen out-of-sample rules,
training-only normalization, turnover and dollar/beta exposure limits, max holding
periods, drawdown stops, realistic fees/spreads/slippage, and both legs' borrow
availability/cost. Reject fragile pair stability, unavailable shorts, or net
results erased by costs. No profitable-pair or market-neutrality claim follows
from an in-sample p-value. This task adds no cointegration or paper-trading engine.

## Alert Readiness And Notification Security

[Workflow](.github/workflows/ingestion.yml) now resolves delivery through
[server/alert-readiness.mjs](server/alert-readiness.mjs). A schedule may publish
only when repository variable `LIVE_ALERTS_READY` is exactly `true` and secret
`NTFY_TOPIC` is nonblank. Manual dispatch additionally requires explicit
`dry_run=false`. Missing, malformed, or unrecognized inputs fail dry. Hourly
minute-17 schedule and thresholds 0.5 / 5 / 3 are unchanged. Readiness is an
operator attestation, not automatic certification by these tests.

Do not set readiness now. First clear source/model rights, independently review
real-data evaluation, review notification privacy and failure handling, and
authorize a controlled delivery test. Local `DRY_RUN=0` is separate and is not
protected by this Actions gate. Never put secrets in documentation or logs.

[ntfy publishing](https://docs.ntfy.sh/publish/) and [configuration](https://docs.ntfy.sh/config/):
unguessable public topics are not authentication or confidentiality. Properly
secured hosting/ACLs and publishing credentials are needed for private use;
current ingestion does not implement authentication headers. Do not put an
access token into the topic. Hosted limits are service-dependent (documented
defaults include 250 messages/day and a 4096-byte message size); verify current
plan limits before rollout. HTTP acceptance does not guarantee device delivery.
[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
distinguishes Boolean inputs from strings; scheduled jobs can be delayed and
are not a realtime market-data service. Cache deduplication remains best-effort.