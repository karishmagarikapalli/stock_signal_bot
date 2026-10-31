# Standalone Deployment

Only [server/ingestion.mjs](server/ingestion.mjs) and its optional
[server/scheduler.mjs](server/scheduler.mjs) launcher are supported. Do not deploy
the preserved Express/tRPC server, UI, or database scaffold. Its server entrypoint
and authentication context are disabled; no replacement web authentication is
provided.

## Local Setup

Use Node.js 20.19+ or a current supported LTS. From the repository root:

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm install --frozen-lockfile
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm check
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm test
```

Use ignored repository-local `.dev.vars` for configuration; safe defaults are in
[.dev.vars.example](.dev.vars.example). Process environment takes precedence,
then `.dev.vars`, then legacy `.env`. These files are resolved relative to the
ingestion module's repository, even when launched from another working directory.
Global environment changes and `.env.local` are not needed.

The local default is `DRY_RUN=1`. Dry-running still fetches live public RSS and
writes the state file, but does not send notifications or advance dedup timestamps.

```powershell
$env:DRY_RUN = '1'
node server/ingestion.mjs --symbols AAPL,MSFT,NVDA
```

To enable delivery, first replace the topic placeholder locally, then explicitly
set `DRY_RUN=0`. Keep topic names and any credentials out of Git and logs. Public
ntfy topics offer no access control; use a secured server when privacy matters.
No Finnhub, MarketAux, OAuth, Forge, or database configuration is used by ingestion.

## Repeated Local Runs

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm start --interval 1800 --symbols AAPL,MSFT,NVDA
```

The scheduler runs one cycle immediately, then every 1800 seconds by default.
Use a process supervisor appropriate to your host. Run from a stable working
directory, because the default `.signal-state.json` path is working-directory
relative. Set `SIGNAL_STATE_FILE` to a persistent absolute path when necessary.
Do not run overlapping schedulers against the same state file: writes are not
locked, and interval callbacks do not prevent overlapping cycles.

## Existing GitHub Actions Workflow

The preserved [.github/workflows/ingestion.yml](.github/workflows/ingestion.yml):

- Uses Node 20, pnpm 10.4.1, and frozen-lockfile installation.
- Runs hourly at minute 17; schedules publish only with exact `LIVE_ALERTS_READY=true` and a nonblank topic secret.
- Defaults manual executions to dry-run; delivery additionally requires explicit `dry_run=false`.
- Uses `NTFY_TOPIC` from Actions secrets for publishing.
- Selects `AAPL,MSFT,NVDA,TSLA,SPY` unless manual symbols are supplied.
- Overrides thresholds to `0.5`, five scored headlines, and three agreeing publishers.
- Restores and saves dedup state through Actions cache.

The gate reads the repository variable `LIVE_ALERTS_READY` and secret `NTFY_TOPIC`
without logging the topic. Missing/malformed inputs and unrecognized events fail
dry. No readiness variable was enabled by this change. Do not enable it until the
rights, evaluation, and security gates in [RESEARCH_REFRESH.md](RESEARCH_REFRESH.md)
are reviewed. The variable is an operator attestation, not a measured readiness score.

| Event | Readiness exactly `true` + nonblank topic | Manual `dry_run` | Result |
| --- | --- | --- | --- |
| Schedule | No | Any | Dry |
| Schedule | Yes | Not applicable | Delivery permitted |
| Manual | No | Any | Dry |
| Manual | Yes | Explicit `false` | Delivery permitted |
| Manual | Yes | True/missing/malformed | Dry |
| Other | Any | Any | Dry |

This is only an Actions gate, not a local `DRY_RUN=0` safeguard. A secret topic in
GitHub is not an ntfy access-control rule. Random public topic names do not
provide authentication/privacy, and ingestion has no authentication-header support.
Do not enable a private authenticated deployment without implementing that support.

Cache restoration is best-effort, not durable transactional storage. Actions scheduling
can be delayed and concurrent runs can race; neither exact timing nor automatic
delivery retries are guaranteed.

## Monitoring And Limitations

Read ingestion logs for feed failures, headline counts, signals, duplicate skips,
and notification results. A failed delivery returns false and does not update its
dedup timestamp. It does not make the entire cycle exit unsuccessfully or trigger
an automatic retry. HTTP 200 is the current success criterion.

No alert can be normal: thresholds, neutral filtering, and duplicate suppression
may eliminate every candidate. Check configuration locally without exposing secret
values. For quota or feed errors, reduce symbols or increase the interval and
consult the service's current terms. There are no promised latency, hosting-cost,
accuracy, or investment-return figures.

Legacy tests and type checks remain available as diagnostic-only
`pnpm test:legacy` and `pnpm check:legacy`. They do not certify a deployable web app.
