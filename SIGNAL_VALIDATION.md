# Signal Validation & Performance Tracking Guide

## Overview

The Stock Signal Bot now includes a comprehensive signal validation and performance tracking system that measures the accuracy of generated signals against actual price movements. This enables continuous improvement of the signal generation engine through data-driven analysis.

## Signal Validation Framework

### How It Works

1. **Signal Generation**: The system generates BUY/SELL/HOLD signals with confidence scores
2. **Entry Tracking**: Records the entry price and timestamp when the signal is generated
3. **Exit Tracking**: After a holding period (default 5 days), records the exit price
4. **Validation**: Compares actual price movement against signal prediction
5. **Metrics**: Calculates accuracy, win rate, profit factor, and other performance metrics

### Validation Logic

```typescript
// A signal is "winning" if:
// - BUY signal: price increased
// - SELL signal: price decreased
// - HOLD signal: price movement < 2%

// Profit/Loss calculation:
// profitLoss = exitPrice - entryPrice
// priceChangePercent = (profitLoss / entryPrice) * 100
```

## Performance Metrics

### Key Metrics

| Metric | Definition | Interpretation |
|--------|-----------|-----------------|
| **Win Rate** | % of signals that were correct | Higher is better (target: >60%) |
| **Profit Factor** | Avg profit / Avg loss | Higher is better (target: >1.5x) |
| **Average Profit** | Mean return on winning signals | Measure of upside potential |
| **Average Loss** | Mean loss on losing signals | Measure of downside risk |
| **Confidence vs Accuracy** | Correlation between confidence score and actual accuracy | Validates confidence calculation |

### Signal Type Analysis

The system tracks accuracy separately for each signal type:

- **BUY signals**: Should have >70% accuracy
- **SELL signals**: Should have >65% accuracy (harder to predict)
- **HOLD signals**: Should have >50% accuracy (neutral signals are inherently uncertain)

### Source Performance

Each data source is ranked by reliability:

```
Reliability Score = Accuracy × Average Confidence

Example:
- Source A: 80% accuracy, 0.85 avg confidence → 0.68 reliability
- Source B: 70% accuracy, 0.75 avg confidence → 0.525 reliability
```

Higher reliability sources receive more weight in multi-source corroboration.

## Using the Validation System

### API Endpoints

#### Get Performance Metrics
```bash
curl http://localhost:3000/api/trpc/analytics.getPerformanceMetrics?input={"days":30}
```

Response includes:
- Total signals and win rate
- Average profit/loss
- Profit factor
- Best and worst signals
- Confidence vs accuracy correlation

#### Get Accuracy by Signal Type
```bash
curl http://localhost:3000/api/trpc/analytics.getAccuracyByType?input={"days":30}
```

Response shows accuracy breakdown for BUY/SELL/HOLD signals.

#### Get Source Performance
```bash
curl http://localhost:3000/api/trpc/analytics.getSourcePerformance?input={"days":30}
```

Response ranks data sources by reliability and accuracy.

#### Get Top/Worst Signals
```bash
curl http://localhost:3000/api/trpc/analytics.getTopSignals?input={"limit":10,"days":30}
curl http://localhost:3000/api/trpc/analytics.getWorstSignals?input={"limit":10,"days":30}
```

#### Generate Performance Report
```bash
curl http://localhost:3000/api/trpc/analytics.generateReport?input={"days":30}
```

Returns a formatted text report with analysis and recommendations.

## Interpreting Results

### Confidence vs Accuracy Correlation

This analysis shows whether your confidence scores are calibrated correctly:

```
Confidence Range | Accuracy | Interpretation
0.60-0.70        | 55%      | Low confidence = low accuracy ✓
0.70-0.80        | 68%      | Medium confidence = medium accuracy ✓
0.80-0.90        | 78%      | High confidence = high accuracy ✓
0.90+            | 91%      | Very high confidence = very high accuracy ✓
```

**Good calibration**: Confidence scores accurately predict accuracy.
**Poor calibration**: Confidence scores don't match actual accuracy (requires tuning).

### Win Rate Interpretation

- **>70%**: Excellent signal quality
- **60-70%**: Good signal quality
- **50-60%**: Acceptable but needs improvement
- **<50%**: Poor signal quality, requires investigation

### Profit Factor Interpretation

- **>2.0x**: Excellent risk/reward ratio
- **1.5-2.0x**: Good risk/reward ratio
- **1.0-1.5x**: Acceptable but tight
- **<1.0x**: Losing money, requires investigation

## Improving Signal Accuracy

### 1. Analyze Source Performance

Identify which data sources have the highest reliability:

```
High Reliability Sources (>0.65):
- SEC Insider Trading (80% accuracy)
- Trump's Truth Social Posts (75% accuracy)

Low Reliability Sources (<0.50):
- MarketAux Sentiment (65% accuracy)
```

**Action**: Increase weight on high-reliability sources, decrease weight on low-reliability sources.

### 2. Adjust Confidence Thresholds

If your confidence scores are poorly calibrated:

```
Current: Minimum confidence = 0.60
Issue: 0.60-0.70 confidence signals only 55% accurate

Solution: Raise minimum confidence to 0.70
Result: Filter out low-quality signals
```

### 3. Optimize by Signal Type

If one signal type has poor accuracy:

```
Current: BUY 78%, SELL 75%, HOLD 42%
Issue: HOLD signals are unreliable

Solution: Disable HOLD signals or require higher confidence
Result: Focus on high-accuracy BUY/SELL signals
```

### 4. Analyze Worst Signals

Review signals with largest losses:

```
Worst Signal: INTC SELL @ $35 → $32 (-8.6%)
Confidence: 65%
Source: MarketAux

Analysis: Low confidence + unreliable source
Action: Exclude MarketAux sentiment for tech stocks
```

### 5. Holding Period Optimization

Analyze optimal holding periods:

```
Current: 5 days average holding
Analysis:
- 1-3 days: 72% accuracy (quick wins)
- 4-7 days: 68% accuracy (medium term)
- 8+ days: 55% accuracy (long term)

Action: Reduce holding period to 3 days for better accuracy
```

## Advanced Analysis

### Confidence Calibration

To check if confidence scores are well-calibrated:

1. Group signals by confidence level (0.6-0.7, 0.7-0.8, etc.)
2. Calculate actual accuracy for each group
3. Compare with confidence level

**Expected**: Accuracy ≈ Confidence (±5%)

**If accuracy < confidence**: Overconfident signals
**If accuracy > confidence**: Underconfident signals

### Profit Factor Analysis

To understand your risk/reward profile:

```
Profit Factor = Average Profit / Average Loss

Example:
- Average Profit: $3.20 per signal
- Average Loss: $1.80 per signal
- Profit Factor: 1.78x

Interpretation: For every $1 lost, you make $1.78
```

### Drawdown Analysis

To measure maximum consecutive losses:

```
Winning streak: 5 signals in a row
Losing streak: 3 signals in a row
Max drawdown: -8.6% (single worst signal)

Risk management: Set stop-loss at -10% to prevent large losses
```

## Integration with Signal Generation

The validation system feeds back into signal generation:

```
1. Generate signal with initial confidence
2. Track actual performance
3. Calculate accuracy for that signal type + source
4. Adjust future confidence scores based on historical accuracy
5. Increase weight on high-performing sources
6. Decrease weight on low-performing sources
```

## Real-World Example

### Scenario: Trump's Posts as Data Source

**Initial Setup**:
- Truth Social posts analyzed for stock mentions
- Sentiment calculated from post content
- Initial confidence: 0.75 (same as other sources)

**After 30 Days**:
- 8 signals generated from Truth Social
- 6 winning signals (75% accuracy)
- Average confidence: 0.88

**Analysis**:
- Reliability score: 0.66 (0.75 × 0.88)
- Outperforming Finnhub (0.59) and MarketAux (0.49)
- High confidence + high accuracy = well-calibrated

**Action**:
- Increase weight on Truth Social signals
- Use as primary corroboration source
- Require only 1 additional source (instead of 2) if Truth Social agrees

## Monitoring Dashboard

The admin dashboard displays real-time performance metrics:

- **Win Rate Gauge**: Current win rate with trend
- **Profit Factor Chart**: Risk/reward ratio over time
- **Source Reliability Ranking**: Top performing sources
- **Confidence vs Accuracy Plot**: Calibration visualization
- **Signal Type Breakdown**: Accuracy by type
- **Recent Signals Table**: Latest signals with outcomes

## Best Practices

1. **Review metrics weekly**: Track trends and identify issues early
2. **Validate with real money**: Paper trading doesn't capture real market conditions
3. **Adjust thresholds gradually**: Large changes can destabilize the system
4. **Document changes**: Keep a changelog of confidence/weight adjustments
5. **Test before deploying**: Use backtesting to validate changes
6. **Monitor for data quality**: Check that price data is accurate
7. **Account for market conditions**: Adjust thresholds for volatility changes

## Troubleshooting

### Low Win Rate (<50%)

**Possible causes**:
- Confidence thresholds too low
- Poor quality data sources
- Market conditions changed
- Holding period too long

**Solutions**:
1. Increase minimum confidence to 0.75+
2. Remove low-reliability sources
3. Reduce holding period to 3 days
4. Add market condition filters

### Poor Confidence Calibration

**Possible causes**:
- Confidence calculation formula is wrong
- Data sources are inconsistent
- Market conditions changed

**Solutions**:
1. Review confidence calculation logic
2. Validate data source quality
3. Adjust confidence formula weights
4. Add market volatility adjustment

### High Profit Factor but Low Win Rate

**Possible causes**:
- Few big winners, many small losers
- Asymmetric risk/reward

**Solutions**:
1. This is actually good! Keep it.
2. Focus on consistency (win rate)
3. Consider position sizing based on confidence

## References

- **Signal Validator**: `server/services/signalValidator.ts`
- **Analytics Router**: `server/routers/analytics.ts`
- **Performance Dashboard**: `client/src/pages/Dashboard.tsx`
- **Test Suite**: `server/services/signalValidator.test.ts`

---

**Last Updated**: November 2025
**Version**: 1.0.0
