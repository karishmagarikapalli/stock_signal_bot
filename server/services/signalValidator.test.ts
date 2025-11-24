import { describe, it, expect, beforeEach } from "vitest";
import { SignalValidator, SignalValidation, PerformanceMetrics } from "./signalValidator";

describe("SignalValidator", () => {
  let validator: SignalValidator;

  beforeEach(() => {
    validator = new SignalValidator();
  });

  describe("validateSignal", () => {
    it("should correctly validate a winning BUY signal", () => {
      const signal: SignalValidation = {
        signalId: 1,
        stockSymbol: "AAPL",
        signalType: "BUY",
        entryPrice: 100,
        confidence: 0.85,
      };

      const validated = validator.validateSignal(signal, 105, 5);

      expect(validated.exitPrice).toBe(105);
      expect(validated.priceChangePercent).toBeCloseTo(5, 1);
      expect(validated.isWinning).toBe(true);
      expect(validated.profitLoss).toBe(5);
    });

    it("should correctly validate a losing BUY signal", () => {
      const signal: SignalValidation = {
        signalId: 1,
        stockSymbol: "AAPL",
        signalType: "BUY",
        entryPrice: 100,
        confidence: 0.85,
      };

      const validated = validator.validateSignal(signal, 95, 5);

      expect(validated.exitPrice).toBe(95);
      expect(validated.priceChangePercent).toBeCloseTo(-5, 1);
      expect(validated.isWinning).toBe(false);
      expect(validated.profitLoss).toBe(-5);
    });

    it("should correctly validate a winning SELL signal", () => {
      const signal: SignalValidation = {
        signalId: 1,
        stockSymbol: "AAPL",
        signalType: "SELL",
        entryPrice: 100,
        confidence: 0.75,
      };

      const validated = validator.validateSignal(signal, 95, 5);

      expect(validated.isWinning).toBe(true);
      expect(validated.profitLoss).toBe(-5);
    });

    it("should correctly validate a HOLD signal", () => {
      const signal: SignalValidation = {
        signalId: 1,
        stockSymbol: "AAPL",
        signalType: "HOLD",
        entryPrice: 100,
        confidence: 0.6,
      };

      const validated = validator.validateSignal(signal, 101, 5);

      expect(validated.isWinning).toBe(true); // Small movement is acceptable for HOLD
      expect(validated.priceChangePercent).toBeCloseTo(1, 1);
    });
  });

  describe("calculateMetrics", () => {
    it("should calculate correct win rate", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.85,
          exitPrice: 105,
          priceChangePercent: 5,
          profitLoss: 5,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.75,
          exitPrice: 95,
          priceChangePercent: -5,
          profitLoss: -5,
          isWinning: false,
        },
        {
          signalId: 3,
          stockSymbol: "GOOGL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.8,
          exitPrice: 110,
          priceChangePercent: 10,
          profitLoss: 10,
          isWinning: true,
        },
      ];

      const metrics = validator.calculateMetrics(signals);

      expect(metrics.totalSignals).toBe(3);
      expect(metrics.winningSignals).toBe(2);
      expect(metrics.losingSignals).toBe(1);
      expect(metrics.winRate).toBeCloseTo(0.667, 2);
    });

    it("should calculate correct profit factor", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.85,
          profitLoss: 10,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.75,
          profitLoss: -5,
          isWinning: false,
        },
      ];

      const metrics = validator.calculateMetrics(signals);

      expect(metrics.averageProfit).toBe(10);
      expect(metrics.averageLoss).toBe(5);
      expect(metrics.profitFactor).toBe(2);
    });

    it("should identify best and worst signals", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.85,
          profitLoss: 50,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.75,
          profitLoss: -30,
          isWinning: false,
        },
      ];

      const metrics = validator.calculateMetrics(signals);

      expect(metrics.bestSignal?.signalId).toBe(1);
      expect(metrics.bestSignal?.profitLoss).toBe(50);
      expect(metrics.worstSignal?.signalId).toBe(2);
      expect(metrics.worstSignal?.profitLoss).toBe(-30);
    });

    it("should handle empty signal list", () => {
      const metrics = validator.calculateMetrics([]);

      expect(metrics.totalSignals).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.bestSignal).toBeNull();
    });
  });

  describe("calculateSourceMetrics", () => {
    it("should calculate source reliability correctly", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.9,
          profitLoss: 10,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.8,
          profitLoss: -5,
          isWinning: false,
        },
      ];

      const sourceMap = new Map<number, string>([
        [1, "Finnhub"],
        [2, "MarketAux"],
      ]);

      const metrics = validator.calculateSourceMetrics(signals, sourceMap);

      expect(metrics.length).toBe(2);
      const finnhubMetric = metrics.find(m => m.sourceName === "Finnhub");
      expect(finnhubMetric?.accuracyRate).toBe(1);
      expect(finnhubMetric?.reliability).toBeGreaterThan(0.8);
    });

    it("should rank sources by reliability", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.95,
          profitLoss: 10,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.5,
          profitLoss: -10,
          isWinning: false,
        },
      ];

      const sourceMap = new Map<number, string>([
        [1, "HighReliability"],
        [2, "LowReliability"],
      ]);

      const metrics = validator.calculateSourceMetrics(signals, sourceMap);

      expect(metrics[0].sourceName).toBe("HighReliability");
      expect(metrics[1].sourceName).toBe("LowReliability");
    });
  });

  describe("getSignalsByConfidence", () => {
    it("should filter signals by confidence range", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.95,
          profitLoss: 10,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.75,
          profitLoss: 5,
          isWinning: true,
        },
        {
          signalId: 3,
          stockSymbol: "GOOGL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.6,
          profitLoss: -5,
          isWinning: false,
        },
      ];

      const filtered = validator.getSignalsByConfidence(signals, 0.7, 0.95);

      expect(filtered.length).toBe(2);
      expect(filtered[0].signalId).toBe(1);
      expect(filtered[1].signalId).toBe(2);
    });
  });

  describe("analyzeBySignalType", () => {
    it("should calculate accuracy by signal type", () => {
      const signals: SignalValidation[] = [
        {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.85,
          profitLoss: 10,
          isWinning: true,
        },
        {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.75,
          profitLoss: -5,
          isWinning: false,
        },
        {
          signalId: 3,
          stockSymbol: "GOOGL",
          signalType: "SELL",
          entryPrice: 100,
          confidence: 0.8,
          profitLoss: -10,
          isWinning: true,
        },
      ];

      const analysis = validator.analyzeBySignalType(signals);

      expect(analysis.BUY.total).toBe(2);
      expect(analysis.BUY.winning).toBe(1);
      expect(analysis.BUY.accuracy).toBeCloseTo(0.5, 1);
      expect(analysis.SELL.total).toBe(1);
      expect(analysis.SELL.winning).toBe(1);
      expect(analysis.SELL.accuracy).toBe(1);
    });
  });

  describe("generateReport", () => {
    it("should generate a formatted performance report", () => {
      const metrics: PerformanceMetrics = {
        totalSignals: 10,
        winningSignals: 7,
        losingSignals: 3,
        winRate: 0.7,
        averageProfit: 5,
        averageLoss: 2,
        profitFactor: 2.5,
        averageHoldingDays: 5,
        bestSignal: {
          signalId: 1,
          stockSymbol: "AAPL",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.95,
          profitLoss: 20,
          priceChangePercent: 20,
          isWinning: true,
        },
        worstSignal: {
          signalId: 2,
          stockSymbol: "MSFT",
          signalType: "BUY",
          entryPrice: 100,
          confidence: 0.6,
          profitLoss: -10,
          priceChangePercent: -10,
          isWinning: false,
        },
        confidenceVsAccuracy: new Map([
          [0.6, 0.5],
          [0.8, 0.8],
          [0.9, 0.95],
        ]),
      };

      const report = validator.generateReport(metrics);

      expect(report).toContain("SIGNAL PERFORMANCE REPORT");
      expect(report).toContain("Total Signals Analyzed: 10");
      expect(report).toContain("Win Rate: 70.00%");
      expect(report).toContain("Profit Factor: 2.50x");
      expect(report).toContain("AAPL");
      expect(report).toContain("MSFT");
    });
  });
});
