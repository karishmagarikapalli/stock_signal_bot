# Standalone Architecture

## Selected Runtime

[server/ingestion.mjs](server/ingestion.mjs) owns supported behavior.
[server/ingestion.next.mjs](server/ingestion.next.mjs) is an unselected legacy
variant, not an alternate supported runtime.

```text
Google News RSS + Yahoo Finance RSS
  -> headline filtering and deduplication
  -> local VADER sentiment
  -> headline-count and publisher-agreement gates
  -> BUY/SELL candidate
  -> repeat-alert suppression
  -> ntfy HTTP POST (or dry-run log)
  -> local JSON dedup state
```

`pnpm dev` runs one ingestion cycle. `pnpm start` runs the scheduler, which launches
the selected script immediately and on a fixed interval (default 1800 seconds).
No HTTP listener, frontend build, database, OAuth, Forge runtime, or paid news API
is part of this path.

## Configuration And State

Before reading settings, ingestion loads repository-root `.dev.vars`, then legacy
`.env` with dotenv. Existing process variables are never overridden. Dotenv output
is quiet. Local files are ignored, and the checked-in example has placeholders and
`DRY_RUN=1`. Configuration is local, not installed in a global environment.

State loads from `SIGNAL_STATE_FILE`, defaulting to working-directory-relative
`.signal-state.json`. Missing or unreadable state falls back to an empty object.
The `lastAlerts` map stores successful notification times by `symbol:signalType`.
State is written at cycle completion, including dry-runs. Only successful non-dry
delivery advances alert timestamps. Writes are not transactional or locked.

## Headline Processing

For each symbol, Google and Yahoo feeds are fetched concurrently with
`Promise.allSettled`; one failing feed does not discard the other. Requests have a
ten-second timeout. Google publisher suffixes are stripped before scoring.
Normalized duplicate titles, recognized holdings-report noise, and headlines
older than the lookback window are skipped.

VADER compound scores with absolute value below `0.05` are discarded as neutral.
The remaining scores are averaged. Distinct publisher labels with scores agreeing
with the average's sign are counted; labels do not establish editorial independence.

Default signal gates require at least three scored headlines, two agreeing
publishers, and absolute average sentiment at least `0.35`. Positive averages yield
BUY and negative averages SELL; insufficient evidence yields no signal. Confidence
is `min(0.95, 0.5 + abs(sentiment) * 0.5)`, a heuristic, not calibrated predictive
accuracy. There is no HOLD notification or database-backed signal record.

## Notification Delivery

The top three direction-agreeing headlines form the message body. The ntfy topic is
URL-encoded. HTTP `Title` is plain ASCII (`BUY Signal: SYMBOL` or SELL); directional
icons are requested with ASCII ntfy tag names. Priority is high only when confidence
is greater than `0.8`. Response status 200 means success; other statuses, HTTP errors,
and transport exceptions return false. Failed delivery does not advance dedup state.

`DRY_RUN=1` logs the proposed message and skips POST entirely. Cycle-level errors are
logged; delivery failure does not force a nonzero process exit or retry. Public RSS
and notification services may be delayed, unavailable, or rate-limited.

## Validation Boundaries

Default `pnpm test` covers ingestion, the Actions readiness resolver, and offline
research evaluation. Child Node tests use real
loopback HTTP fake servers for non-dry BUY/SELL delivery and failure cases; scoring
and RSS failure tests remain offline. Default `pnpm check` checks the standalone,
readiness, and evaluation scripts' syntax and TypeScript test typing. Modules participate in
inference with `allowJs`, but strict `checkJs` checking is not enabled.

The Actions workflow now uses `server/alert-readiness.mjs`: schedules require exact
repository variable `LIVE_ALERTS_READY=true` and a nonblank topic secret to permit
delivery. Manual runs additionally require explicit `dry_run=false`; defaults and
missing inputs fail dry. Readiness was not enabled. Schedule and 0.5 / 5 / 3 gates
are unchanged; state is cached best-effort. Local runs do not use this resolver.

`server/research-evaluation.mjs` is a separate local-JSON CLI, never imported by
ingestion. It compares independent sentiment labels with a neutral baseline and
VADER, and joins strictly post-availability entries to bounded future horizons.
Unknown prices are skipped; absent aligned benchmarks remain null. Its synthetic
fixture and tests do not establish live-service or business performance. See
[RESEARCH_REFRESH.md](RESEARCH_REFRESH.md) for limitations and unimplemented plans.

## Preserved Legacy Code

The React client, Express/tRPC scaffold, Drizzle schema and migrations, database
helpers, domain API clients and TypeScript services, and legacy tests remain for
research and possible future migration. They are not used by the selected runtime.
The unused Manus OAuth SDK, Forge helpers, storage proxy, and Manus/map components
were removed. Remaining importers no longer reference those helpers. The legacy
server entrypoint and HTTP context creation throw rather than start an
unauthenticated server. The Forge owner-notification RPC and Vite runtime plugin
are removed.

There is no supported web build or web start command. `test:legacy` and
`check:legacy` are diagnostic-only. Dependencies still imported by preserved code
are retained; removing the entire client or rewriting domain services is outside
this conservative deletion set. Remaining legacy UI claims are not product claims
for the standalone experiment.
