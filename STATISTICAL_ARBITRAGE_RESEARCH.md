# Statistical Arbitrage: Feasibility Note

## Recommendation

Worth a small, paper-only research prototype; not yet justified as a live signal source. Relative-value strategies can be less dependent on the overall market direction than a long-only strategy and would add a distinct research track beside this project's news-sentiment signals. That does not imply stable returns: apparent mean reversion can disappear when relationships change, and a backtest can look profitable before realistic costs.

## Best-Fit First Experiment

Test one transparent daily-frequency pairs strategy, not a broad multi-factor or intraday system:

1. Start with a small, predeclared set of liquid same-sector pairs. Do not select pairs using the eventual test period.
2. Use adjusted daily prices from a source whose terms permit the intended use. Verify split/dividend handling, missing dates, delisted securities, rate limits, and historical coverage before treating results as evidence. A free endpoint alone is not sufficient evidence of data quality or reuse rights.
3. Estimate the hedge ratio and candidate spread using only each training window. Test for cointegration with the Engle-Granger test; use a rolling or walk-forward process rather than fitting once on the full history.
4. Define spread entry, exit, and maximum holding rules before evaluating the held-out period. Include commissions, bid/ask spread, slippage, borrow availability and borrow cost, and position limits.
5. Compare net, out-of-sample performance with simple baselines and report drawdown, turnover, exposure, and sensitivity to reasonable parameter changes. Reject the idea if returns depend on one pair, one short period, or costs being nearly zero.

## Free/Open Tooling

- `pandas` for timestamp alignment, corporate-action checks, and spread calculations.
- `statsmodels` for cointegration and stationarity diagnostics; its `coint` documentation states that the Engle-Granger test's null is no cointegration and assumes both input series are I(1). Its ADF documentation states the unit-root null. These tests are diagnostics, not proof that a tradable relationship will persist.
- Keep the first simulator small and auditable in Python. Add a dedicated backtesting framework only if the experiment needs portfolio accounting that would otherwise be error-prone.

## Main Risks

- Pair selection, hedge estimation, thresholds, and universe membership can leak future information into a backtest.
- Cointegration is sample-dependent; economic relationships and market regimes change.
- Shorting introduces borrow availability, borrow costs, recalls, and potentially asymmetric losses.
- Historical free data may omit delisted names, have adjustment gaps, or restrict automated/re-distributed use.
- Daily closing prices do not guarantee execution at those prices; transaction costs can erase small spreads.
- A statistical-arbitrage strategy is not a guaranteed hedge and can lose on both legs.

## Decision Gate

Proceed to a prototype only after identifying a historical data source with acceptable terms and enough adjustment/delisting detail. Keep the experiment offline and paper-only; do not connect it to the ntfy alert workflow or a brokerage. The existing news-alert bot should remain a separate strategy until independent out-of-sample evidence supports combining them.

## References

- [statsmodels Engle-Granger cointegration test](https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.coint.html)
- [statsmodels Augmented Dickey-Fuller test](https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.adfuller.html)
