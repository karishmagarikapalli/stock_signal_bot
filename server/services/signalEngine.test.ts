import { describe, it, expect, beforeEach } from "vitest";
import { SignalEngine } from "./signalEngine";

describe("SignalEngine", () => {
  let engine: SignalEngine;

  beforeEach(() => {
    engine = new SignalEngine();
  });

  describe("generateSignal", () => {
    it("should generate a BUY signal for positive sentiment above 0.6", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple beats earnings", sentiment: 0.8, source: "Finnhub" },
        ],
        sentimentAverage: 0.75,
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("BUY");
      expect(signal?.confidence).toBeGreaterThan(0.6);
      expect(signal?.confidence).toBeLessThanOrEqual(0.95);
      expect(signal?.reasoning).toContain("Positive sentiment");
    });

    it("should generate a SELL signal for negative sentiment below -0.6", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple misses earnings", sentiment: -0.8, source: "Finnhub" },
        ],
        sentimentAverage: -0.75,
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("SELL");
      expect(signal?.confidence).toBeGreaterThan(0.6);
      expect(signal?.reasoning).toContain("Negative sentiment");
    });

    it("should return null for neutral sentiment with low confidence", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple news", sentiment: 0.1, source: "Finnhub" },
        ],
        sentimentAverage: 0.1,
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).toBeNull();
    });

    it("should return null if sources are insufficient", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple news", sentiment: 0.8, source: "Finnhub" },
        ],
        sentimentAverage: 0.8,
        sourceCount: 1, // Only 1 source
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).toBeNull();
    });

    it("should return null if confidence is below threshold", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple news", sentiment: -0.1, source: "Finnhub" },
        ],
        sentimentAverage: -0.1,
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).toBeNull();
    });

    it("should generate BUY signal for analyst upgrade", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Goldman upgrades AAPL", sentiment: 0.5, source: "Finnhub" },
        ],
        sentimentAverage: 0.5,
        sourceCount: 2,
        eventType: "upgrade" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("BUY");
      expect(signal?.confidence).toBe(0.75);
      expect(signal?.reasoning).toContain("Analyst upgrade");
    });

    it("should generate SELL signal for analyst downgrade", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Morgan Stanley downgrades AAPL", sentiment: -0.5, source: "Finnhub" },
        ],
        sentimentAverage: -0.5,
        sourceCount: 2,
        eventType: "downgrade" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("SELL");
      expect(signal?.confidence).toBe(0.75);
      expect(signal?.reasoning).toContain("Analyst downgrade");
    });
  });

  describe("calculateCompositeSentiment", () => {
    it("should calculate average sentiment correctly", () => {
      const sentiments = [0.8, 0.6, 0.7];
      const result = engine.calculateCompositeSentiment(sentiments);

      expect(result).toBeCloseTo(0.7, 2);
    });

    it("should return 0 for empty array", () => {
      const result = engine.calculateCompositeSentiment([]);

      expect(result).toBe(0);
    });

    it("should clamp values between -1 and 1", () => {
      const sentiments = [2, 3, 4]; // Values > 1
      const result = engine.calculateCompositeSentiment(sentiments);

      expect(result).toBeLessThanOrEqual(1);
      expect(result).toBeGreaterThanOrEqual(-1);
    });

    it("should handle negative sentiments", () => {
      const sentiments = [-0.8, -0.6, -0.7];
      const result = engine.calculateCompositeSentiment(sentiments);

      expect(result).toBeCloseTo(-0.7, 2);
    });

    it("should handle mixed sentiments", () => {
      const sentiments = [0.5, -0.3, 0.2];
      const result = engine.calculateCompositeSentiment(sentiments);

      expect(result).toBeCloseTo(0.133, 2);
    });
  });

  describe("validateSignalQuality", () => {
    it("should validate high-quality signal", () => {
      const signal = {
        type: "BUY" as const,
        confidence: 0.8,
        reasoning: "Strong positive sentiment from multiple sources",
        sources: [],
      };

      const isValid = engine.validateSignalQuality(signal, 2);

      expect(isValid).toBe(true);
    });

    it("should reject signal with low confidence", () => {
      const signal = {
        type: "BUY" as const,
        confidence: 0.4, // Below threshold
        reasoning: "Weak signal",
        sources: [],
      };

      const isValid = engine.validateSignalQuality(signal, 2);

      expect(isValid).toBe(false);
    });

    it("should reject signal with insufficient sources", () => {
      const signal = {
        type: "BUY" as const,
        confidence: 0.8,
        reasoning: "Good reasoning",
        sources: [],
      };

      const isValid = engine.validateSignalQuality(signal, 1); // Only 1 source

      expect(isValid).toBe(false);
    });

    it("should reject signal with empty reasoning", () => {
      const signal = {
        type: "BUY" as const,
        confidence: 0.8,
        reasoning: "", // Empty
        sources: [],
      };

      const isValid = engine.validateSignalQuality(signal, 2);

      expect(isValid).toBe(false);
    });

    it("should reject signal with whitespace-only reasoning", () => {
      const signal = {
        type: "BUY" as const,
        confidence: 0.8,
        reasoning: "   ", // Only whitespace
        sources: [],
      };

      const isValid = engine.validateSignalQuality(signal, 2);

      expect(isValid).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return engine statistics", () => {
      const stats = engine.getStats();

      expect(stats).toHaveProperty("minConfidenceThreshold");
      expect(stats).toHaveProperty("minSourcesRequired");
      expect(stats).toHaveProperty("deduplicationWindow");
      expect(stats.minConfidenceThreshold).toBe(0.6);
      expect(stats.minSourcesRequired).toBe(2);
      expect(stats.deduplicationWindow).toBe(60 * 60 * 1000); // 1 hour
    });
  });

  describe("confidence calculation", () => {
    it("should increase confidence with stronger sentiment", () => {
      const input1 = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 0.65, // Just above threshold
        sourceCount: 2,
        eventType: "news" as const,
      };

      const input2 = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 0.95, // Very strong
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal1 = engine.generateSignal(input1);
      const signal2 = engine.generateSignal(input2);

      expect(signal1?.confidence).toBeLessThan(signal2?.confidence || 0);
    });

    it("should cap confidence at 0.95", () => {
      const input = {
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 1.0, // Perfect sentiment
        sourceCount: 2,
        eventType: "news" as const,
      };

      const signal = engine.generateSignal(input);

      expect(signal?.confidence).toBeLessThanOrEqual(0.95);
    });
  });
});
