# Stock Signal Bot

A standalone headline-sentiment experiment. The supported runtime is
[server/ingestion.mjs](server/ingestion.mjs), optionally launched repeatedly by
[server/scheduler.mjs](server/scheduler.mjs). It reads public Google News and
Yahoo Finance RSS feeds, scores headlines locally with VADER, and can publish
BUY or SELL alerts through ntfy. No news API keys or database are required.

This is not a validated trading strategy. Sentiment-derived confidence is a
heuristic, not a probability of investment returns. There are no measured
profitability, accuracy, latency, or cost guarantees.

## Setup

Use Node.js 20.19+ (or a current supported LTS) and pnpm 10.4.1. Run commands
from this repository. On Windows, bypass a mismatched global pnpm shim:

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm install --frozen-lockfile
```

Repository-local `.dev.vars` loads before legacy `.env`; existing process
variables win over both. `.env.local` is not loaded. See
[.dev.vars.example](.dev.vars.example) for safe placeholders. The local file
is ignored by Git and defaults to `DRY_RUN=1`. No global environment changes
are needed. Replace the placeholder topic before enabling delivery.

```powershell
# Fetch and score without publishing. This command does access public RSS.
$env:DRY_RUN = '1'
node server/ingestion.mjs --symbols AAPL,MSFT,NVDA

# One cycle, also available as pnpm dev
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm dev --symbols AAPL,MSFT,NVDA

# Repeated cycles, also available as pnpm start (default interval: 1800 seconds)
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm start --interval 1800 --symbols AAPL,MSFT,NVDA
```

For real delivery, review source rights and notification security before explicitly
setting `DRY_RUN=0`. A random public topic is not authentication or privacy.
Sensitive data requires secured hosting/ACLs; ingestion currently has no
authentication-header support. The Actions readiness gate does not protect local runs.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DRY_RUN` | unset in code; `1` in local example | `1` skips publishing and dedup timestamp updates |
| `NTFY_TOPIC` | none | Required unless dry-running |
| `NTFY_SERVER` | `https://ntfy.sh` | Publishing server |
| `LOOKBACK_HOURS` | `24` | Headline age limit |
| `BUY_THRESHOLD` | `0.35` | Absolute average sentiment needed for BUY/SELL |
| `MIN_AGREEING_SOURCES` | `2` | Distinct publisher labels agreeing with average direction |
| `MIN_SCORED_HEADLINES` | `3` | Minimum non-neutral headlines |
| `DEDUP_WINDOW_MINUTES` | `60` | Repeat-alert suppression window |
| `SIGNAL_STATE_FILE` | `.signal-state.json` | State path, relative to working directory |

Tune these variables, not the retained TypeScript signal engine. Insufficient
evidence produces no signal, not a HOLD alert. Publisher labels are not proof of
independent reporting. RSS availability and third-party quotas can change.

## Validation

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm check
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm test
```

The default check covers standalone Node syntax and TypeScript test typing;
JavaScript is included for module inference but is not strict `checkJs`-checked.
Default tests exercise the readiness gate, offline research evaluation, scoring,
RSS degradation, and actual non-dry HTTP delivery
to loopback-only fake servers in child Node processes. They do not contact live
services or use real credentials.

## Offline Research

See [RESEARCH_REFRESH.md](RESEARCH_REFRESH.md) for the dated official-source
review, model/data licensing gates, SEC and paper-only statistical-arbitrage plans.
Run the synthetic evaluator without feeds, local configuration, or notifications:

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm research:evaluate server/fixtures/research-synthetic.json
```

Labels are independently supplied; missing prices are skipped, never zeroed.
Synthetic metrics validate plumbing only, not real sentiment accuracy or returns.

Deeper experiments are isolated under [server/experiments/run.mjs](server/experiments/run.mjs):
chronological grouped/purged walk-forward fitting, cost-aware long/cash return
observations and baselines, externally supplied FinBERT score imports, and local
SEC submissions/Form 4/8-K metadata parsers. See
[OFFLINE_EXPERIMENTS.md](OFFLINE_EXPERIMENTS.md) for exact contracts and gaps.

```powershell
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm research:test
npm.cmd exec --yes --package=pnpm@10.4.1 -- pnpm research:walk-forward server/fixtures/walk-forward-synthetic.json
```

No FinBERT weights/inference, live SEC collector, real-data backtest, alert,
trade, or readiness enablement is implemented by these experiments.

## Deployment And Legacy Code

See [DEPLOYMENT.md](DEPLOYMENT.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
The existing Actions workflow runs the selected ingestion script. Scheduled
runs stay dry unless `LIVE_ALERTS_READY` is exactly `true` and `NTFY_TOPIC` is
nonblank. Manual runs additionally require explicit `dry_run=false`; they default
to dry. Readiness has not been enabled by this change. Thresholds remain 0.5 / 5 / 3.

The remaining `client/`, Express/tRPC code, database schema, API clients,
TypeScript domain services, and their tests are preserved legacy/research code,
not a supported web product. The legacy server entrypoint and HTTP context
creation fail closed. There is no supported web build or web startup command.
`pnpm test:legacy` and `pnpm check:legacy` are diagnostic-only checks for that
retained code; they are not standalone release gates. Frontend-only dependencies
remain where preserved files still import them.

## Disclaimer

For educational and personal use. This is not financial advice. Do your own
research and comply with feed, hosting, and notification service terms.
