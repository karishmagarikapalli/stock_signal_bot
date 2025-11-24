/**
 * Signal Validator & Performance Tracker
 * Validates signal accuracy against actual price movements
 * and tracks performance metrics over time
 */

export interface SignalValidation {
  signalId: number;
  stockSymbol: string;
  signalType: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
  entryTime: Date;
  exitPrice?: number;
  exitTime?: Date;
  holdingPeriodDays?: number;
  priceChangePercent?: number;
  profitLoss?: number;
  isWinning?: boolean;
  confidence: number;
}

export interface PerformanceMetrics {
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  winRate: number;
  averageProfit: number;
  averageLoss: number;
  profitFactor: number;
  averageHoldingDays: number;
  bestSignal: SignalValidation | null;
  worstSignal: SignalValidation | null;
  confidenceVsAccuracy: Map<number, number>;
}

export interface SourcePerformance {
  sourceName: string;
  signalsGenerated: number;
  accuracyRate: number;
  averageConfidence: number;
  profitFactor: number;
  reliability: number;
}

export class SignalValidator {
  /**
   * Validate a signal against actual price movement
   */
  validateSignal(
    validation: SignalValidation,
    currentPrice: number,
    holdingDays: number = 5
  ): SignalValidation {
    const exitPrice = currentPrice;
    const priceChange = exitPrice - validation.entryPrice;
    const priceChangePercent = (priceChange / validation.entryPrice) * 100;

    // Determine if signal was correct
    let isWinning = false;
    if (validation.signalType === "BUY" && priceChange > 0) {
      isWinning = true;
    } else if (validation.signalType === "SELL" && priceChange < 0) {
      isWinning = true;
    } else if (validation.signalType === "HOLD" && Math.abs(priceChange) < 2) {
      isWinning = true;
    }

    return {
      ...validation,
      exitPrice,
      exitTime: new Date(),
      holdingPeriodDays: holdingDays,
      priceChangePercent,
      profitLoss: priceChange,
      isWinning,
    };
  }

  /**
   * Calculate performance metrics from validated signals
   */
  calculateMetrics(validatedSignals: SignalValidation[]): PerformanceMetrics {
    if (validatedSignals.length === 0) {
      return {
        totalSignals: 0,
        winningSignals: 0,
        losingSignals: 0,
        winRate: 0,
        averageProfit: 0,
        averageLoss: 0,
        profitFactor: 0,
        averageHoldingDays: 0,
        bestSignal: null,
        worstSignal: null,
        confidenceVsAccuracy: new Map(),
      };
    }

    const winningSignals = validatedSignals.filter(s => s.isWinning);
    const losingSignals = validatedSignals.filter(s => !s.isWinning);

    const winRate = winningSignals.length / validatedSignals.length;

    const totalProfit = winningSignals.reduce((sum, s) => sum + (s.profitLoss || 0), 0);
    const totalLoss = losingSignals.reduce((sum, s) => sum + Math.abs(s.profitLoss || 0), 0);

    const averageProfit = winningSignals.length > 0 ? totalProfit / winningSignals.length : 0;
    const averageLoss = losingSignals.length > 0 ? totalLoss / losingSignals.length : 0;

    const profitFactor = averageLoss > 0 ? averageProfit / averageLoss : averageProfit > 0 ? 1 : 0;

    const averageHoldingDays =
      validatedSignals.reduce((sum, s) => sum + (s.holdingPeriodDays || 0), 0) /
      validatedSignals.length;

    // Find best and worst signals
    const bestSignal = validatedSignals.reduce((best, current) => {
      const currentProfit = current.profitLoss || 0;
      const bestProfit = best.profitLoss || 0;
      return currentProfit > bestProfit ? current : best;
    });

    const worstSignal = validatedSignals.reduce((worst, current) => {
      const currentProfit = current.profitLoss || 0;
      const worstProfit = worst.profitLoss || 0;
      return currentProfit < worstProfit ? current : worst;
    });

    // Calculate confidence vs accuracy correlation
    const confidenceVsAccuracy = new Map<number, number>();
    const confidenceBuckets = new Map<number, { correct: number; total: number }>();

    for (const signal of validatedSignals) {
      const confidenceBucket = Math.floor(signal.confidence * 10) / 10;
      if (!confidenceBuckets.has(confidenceBucket)) {
        confidenceBuckets.set(confidenceBucket, { correct: 0, total: 0 });
      }

      const bucket = confidenceBuckets.get(confidenceBucket)!;
      bucket.total++;
      if (signal.isWinning) {
        bucket.correct++;
      }
    }

    confidenceBuckets.forEach((bucket, confidence) => {
      confidenceVsAccuracy.set(confidence, bucket.correct / bucket.total);
    });

    return {
      totalSignals: validatedSignals.length,
      winningSignals: winningSignals.length,
      losingSignals: losingSignals.length,
      winRate,
      averageProfit,
      averageLoss,
      profitFactor,
      averageHoldingDays,
      bestSignal,
      worstSignal,
      confidenceVsAccuracy,
    };
  }

  /**
   * Calculate performance metrics by source
   */
  calculateSourceMetrics(
    validatedSignals: SignalValidation[],
    sourceMap: Map<number, string>
  ): SourcePerformance[] {
    const sourceMetrics = new Map<string, SourcePerformance>();

    for (const signal of validatedSignals) {
      const sourceName = sourceMap.get(signal.signalId) || "Unknown";

      if (!sourceMetrics.has(sourceName)) {
        sourceMetrics.set(sourceName, {
          sourceName,
          signalsGenerated: 0,
          accuracyRate: 0,
          averageConfidence: 0,
          profitFactor: 0,
          reliability: 0,
        });
      }

      const metric = sourceMetrics.get(sourceName)!;
      metric.signalsGenerated++;
    }

    // Calculate accuracy and confidence for each source
    for (const signal of validatedSignals) {
      const sourceName = sourceMap.get(signal.signalId) || "Unknown";
      const metric = sourceMetrics.get(sourceName)!;

      // Update accuracy rate
      const currentAccuracy = metric.accuracyRate * (metric.signalsGenerated - 1);
      metric.accuracyRate =
        (currentAccuracy + (signal.isWinning ? 1 : 0)) / metric.signalsGenerated;

      // Update average confidence
      const currentConfidence = metric.averageConfidence * (metric.signalsGenerated - 1);
      metric.averageConfidence = (currentConfidence + signal.confidence) / metric.signalsGenerated;
    }

    // Calculate reliability score (accuracy * confidence)
    sourceMetrics.forEach(metric => {
      metric.reliability = metric.accuracyRate * metric.averageConfidence;
    });

    const result: SourcePerformance[] = [];
    sourceMetrics.forEach(metric => {
      result.push(metric);
    });
    return result.sort((a, b) => b.reliability - a.reliability);
  }

  /**
   * Get signals by confidence level
   */
  getSignalsByConfidence(
    validatedSignals: SignalValidation[],
    minConfidence: number,
    maxConfidence: number
  ): SignalValidation[] {
    return validatedSignals.filter(
      s => s.confidence >= minConfidence && s.confidence <= maxConfidence
    );
  }

  /**
   * Get signals by performance
   */
  getTopPerformingSignals(validatedSignals: SignalValidation[], limit: number = 10) {
    return validatedSignals
      .sort((a, b) => (b.profitLoss || 0) - (a.profitLoss || 0))
      .slice(0, limit);
  }

  /**
   * Get worst performing signals
   */
  getWorstPerformingSignals(validatedSignals: SignalValidation[], limit: number = 10) {
    return validatedSignals
      .sort((a, b) => (a.profitLoss || 0) - (b.profitLoss || 0))
      .slice(0, limit);
  }

  /**
   * Analyze signal accuracy by type
   */
  analyzeBySignalType(validatedSignals: SignalValidation[]) {
    const byType = {
      BUY: { total: 0, winning: 0, accuracy: 0 },
      SELL: { total: 0, winning: 0, accuracy: 0 },
      HOLD: { total: 0, winning: 0, accuracy: 0 },
    };

    for (const signal of validatedSignals) {
      const type = signal.signalType;
      byType[type].total++;
      if (signal.isWinning) {
        byType[type].winning++;
      }
    }

    for (const type of ["BUY", "SELL", "HOLD"] as const) {
      if (byType[type].total > 0) {
        byType[type].accuracy = byType[type].winning / byType[type].total;
      }
    }

    return byType;
  }

  /**
   * Generate performance report
   */
  generateReport(metrics: PerformanceMetrics): string {
    const report = `
=== SIGNAL PERFORMANCE REPORT ===

Total Signals Analyzed: ${metrics.totalSignals}
Winning Signals: ${metrics.winningSignals}
Losing Signals: ${metrics.losingSignals}

Performance Metrics:
- Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
- Average Profit: ${metrics.averageProfit.toFixed(2)}%
- Average Loss: ${metrics.averageLoss.toFixed(2)}%
- Profit Factor: ${metrics.profitFactor.toFixed(2)}x
- Average Holding Period: ${metrics.averageHoldingDays.toFixed(1)} days

Best Signal:
- Symbol: ${metrics.bestSignal?.stockSymbol}
- Type: ${metrics.bestSignal?.signalType}
- Profit/Loss: ${metrics.bestSignal?.priceChangePercent?.toFixed(2)}%
- Confidence: ${metrics.bestSignal?.confidence.toFixed(2)}

Worst Signal:
- Symbol: ${metrics.worstSignal?.stockSymbol}
- Type: ${metrics.worstSignal?.signalType}
- Profit/Loss: ${metrics.worstSignal?.priceChangePercent?.toFixed(2)}%
- Confidence: ${metrics.worstSignal?.confidence.toFixed(2)}

Confidence vs Accuracy:
${Array.from(metrics.confidenceVsAccuracy.entries())
  .map(([conf, acc]) => `- ${(conf * 100).toFixed(0)}% confidence: ${(acc * 100).toFixed(1)}% accuracy`)
  .join("\n")}
`;

    return report;
  }
}

/**
 * Create a singleton validator
 */
let validator: SignalValidator | null = null;

export function getSignalValidator(): SignalValidator {
  if (!validator) {
    validator = new SignalValidator();
  }
  return validator;
}
