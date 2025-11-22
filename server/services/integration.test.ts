import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignalEngine } from "./signalEngine";
import axios from "axios";

// Mock axios for ntfy.sh notifications
vi.mock("axios");

describe("Stock Signal Bot - Integration Tests", () => {
  let signalEngine: SignalEngine;

  beforeEach(() => {
    signalEngine = new SignalEngine();
    vi.clearAllMocks();
  });

  describe("End-to-End Signal Generation Flow", () => {
    it("should generate BUY signal from positive news sentiment", () => {
      // Simulate news from two sources
      const finnhubNews = [
        {
          id: 1,
          headline: "Apple beats Q4 earnings expectations",
          summary: "Apple reported strong earnings with revenue growth",
          source: "Finnhub",
          url: "https://example.com/1",
          image: "",
          category: "earnings",
          datetime: Math.floor(Date.now() / 1000),
          related: "AAPL",
        },
      ];

      const marketauxNews = [
        {
          uuid: "uuid1",
          title: "Apple Stock Surges on Earnings Beat",
          description: "Strong quarterly results drive investor confidence",
          keywords: "AAPL,earnings,positive",
          snippet: "Apple's earnings beat expectations...",
          url: "https://example.com/2",
          image_url: "",
          language: "en",
          published_at: new Date().toISOString(),
          source: "MarketAux",
          relevance_score: 0.95,
          entities: [
            {
              symbol: "AAPL",
              name: "Apple Inc.",
              exchange: "NASDAQ",
              exchange_long: "NASDAQ",
              country: "US",
              type: "equity",
              industry: "Technology",
              match_score: 1.0,
              sentiment_score: 0.85,
              highlights: [
                {
                  highlight: "earnings beat",
                  sentiment: 0.85,
                  highlighted_in: "title",
                },
              ],
            },
          ],
          similar: [],
        },
      ];

      // Calculate sentiment
      const sentiments = marketauxNews
        .flatMap(article =>
          article.entities.map(e => e.sentiment_score)
        );
      const compositeSentiment = signalEngine.calculateCompositeSentiment(sentiments);

      // Generate signal
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          ...finnhubNews.map((n, i) => ({
            id: i,
            title: n.headline,
            sentiment: 0,
            source: "Finnhub",
          })),
          ...marketauxNews.map((n, i) => ({
            id: finnhubNews.length + i,
            title: n.title,
            sentiment: sentiments[i] || 0,
            source: "MarketAux",
          })),
        ],
        sentimentAverage: compositeSentiment,
        sourceCount: 2,
        eventType: "news",
      });

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("BUY");
      expect(signal?.confidence).toBeGreaterThan(0.75);
      expect(signal?.reasoning).toContain("Positive sentiment");
    });

    it("should generate SELL signal from negative news sentiment", () => {
      const marketauxNews = [
        {
          uuid: "uuid2",
          title: "Apple Faces Supply Chain Disruptions",
          description: "Manufacturing challenges impact production",
          keywords: "AAPL,supply,negative",
          snippet: "Apple's supply chain faces challenges...",
          url: "https://example.com/3",
          image_url: "",
          language: "en",
          published_at: new Date().toISOString(),
          source: "MarketAux",
          relevance_score: 0.9,
          entities: [
            {
              symbol: "AAPL",
              name: "Apple Inc.",
              exchange: "NASDAQ",
              exchange_long: "NASDAQ",
              country: "US",
              type: "equity",
              industry: "Technology",
              match_score: 1.0,
              sentiment_score: -0.75,
              highlights: [
                {
                  highlight: "supply chain challenges",
                  sentiment: -0.75,
                  highlighted_in: "description",
                },
              ],
            },
          ],
          similar: [],
        },
      ];

      const sentiments = marketauxNews
        .flatMap(article =>
          article.entities.map(e => e.sentiment_score)
        );
      const compositeSentiment = signalEngine.calculateCompositeSentiment(sentiments);

      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: marketauxNews.map((n, i) => ({
          id: i,
          title: n.title,
          sentiment: sentiments[i] || 0,
          source: "MarketAux",
        })),
        sentimentAverage: compositeSentiment,
        sourceCount: 2,
        eventType: "news",
      });

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("SELL");
      expect(signal?.confidence).toBeGreaterThan(0.6);
      expect(signal?.reasoning).toContain("Negative sentiment");
    });

    it("should reject signal without sufficient source corroboration", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple news", sentiment: 0.8, source: "Finnhub" },
        ],
        sentimentAverage: 0.8,
        sourceCount: 1, // Only one source - insufficient
        eventType: "news",
      });

      expect(signal).toBeNull();
    });

    it("should validate signal quality before alerting", () => {
      const highQualitySignal = {
        type: "BUY" as const,
        confidence: 0.85,
        reasoning: "Strong positive sentiment from 2 sources",
        sources: [1, 2],
      };

      const isValid = signalEngine.validateSignalQuality(highQualitySignal, 2);
      expect(isValid).toBe(true);
    });

    it("should reject low-confidence signal", () => {
      const lowConfidenceSignal = {
        type: "BUY" as const,
        confidence: 0.4, // Below 0.6 threshold
        reasoning: "Weak signal",
        sources: [1, 2],
      };

      const isValid = signalEngine.validateSignalQuality(lowConfidenceSignal, 2);
      expect(isValid).toBe(false);
    });
  });

  describe("Sentiment Analysis Accuracy", () => {
    it("should correctly weight multiple sentiment scores", () => {
      const sentiments = [0.9, 0.8, 0.7, 0.85];
      const composite = signalEngine.calculateCompositeSentiment(sentiments);

      const expected = (0.9 + 0.8 + 0.7 + 0.85) / 4;
      expect(composite).toBeCloseTo(expected, 2);
    });

    it("should handle extreme sentiment values", () => {
      const sentiments = [-1, -0.5, 0.5, 1];
      const composite = signalEngine.calculateCompositeSentiment(sentiments);

      expect(composite).toBeGreaterThanOrEqual(-1);
      expect(composite).toBeLessThanOrEqual(1);
    });

    it("should identify mixed sentiment correctly", () => {
      const sentiments = [0.7, -0.3, 0.5];
      const composite = signalEngine.calculateCompositeSentiment(sentiments);

      const expected = (0.7 - 0.3 + 0.5) / 3;
      expect(composite).toBeCloseTo(expected, 2);
    });
  });

  describe("Signal Type Determination", () => {
    it("should correctly classify analyst upgrades", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Goldman Sachs upgrades AAPL", sentiment: 0.5, source: "Finnhub" },
          { id: 2, title: "AAPL upgrade from major analyst", sentiment: 0.5, source: "MarketAux" },
        ],
        sentimentAverage: 0.5,
        sourceCount: 2,
        eventType: "upgrade",
      });

      expect(signal?.type).toBe("BUY");
      expect(signal?.confidence).toBe(0.75);
    });

    it("should correctly classify analyst downgrades", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Morgan Stanley downgrades AAPL", sentiment: -0.5, source: "Finnhub" },
          { id: 2, title: "AAPL downgrade from analyst", sentiment: -0.5, source: "MarketAux" },
        ],
        sentimentAverage: -0.5,
        sourceCount: 2,
        eventType: "downgrade",
      });

      expect(signal?.type).toBe("SELL");
      expect(signal?.confidence).toBe(0.75);
    });

    it("should handle earnings events", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [
          { id: 1, title: "Apple earnings announcement", sentiment: 0, source: "Finnhub" },
          { id: 2, title: "AAPL Q4 earnings release", sentiment: 0, source: "MarketAux" },
        ],
        sentimentAverage: 0,
        sourceCount: 2,
        eventType: "earnings",
      });

      expect(signal?.type).toBe("HOLD");
      expect(signal?.reasoning).toContain("Earnings event");
    });
  });

  describe("Confidence Score Calculation", () => {
    it("should increase confidence with stronger sentiment", () => {
      const weakSignal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 0.65,
        sourceCount: 2,
        eventType: "news",
      });

      const strongSignal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 0.95,
        sourceCount: 2,
        eventType: "news",
      });

      expect(weakSignal?.confidence || 0).toBeLessThan(strongSignal?.confidence || 0);
    });

    it("should cap maximum confidence at 0.95", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 1.0, // Perfect sentiment
        sourceCount: 2,
        eventType: "news",
      });

      expect(signal?.confidence).toBeLessThanOrEqual(0.95);
    });

    it("should set minimum confidence at 0.6 for valid signals", () => {
      const signal = signalEngine.generateSignal({
        stockId: 1,
        stockSymbol: "AAPL",
        stockName: "Apple Inc.",
        newsItems: [],
        sentimentAverage: 0.61, // Just above threshold
        sourceCount: 2,
        eventType: "news",
      });

      expect(signal?.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe("Data Quality and Validation", () => {
    it("should require non-empty reasoning for valid signals", () => {
      const signalWithoutReasoning = {
        type: "BUY" as const,
        confidence: 0.8,
        reasoning: "", // Empty
        sources: [1, 2],
      };

      const isValid = signalEngine.validateSignalQuality(signalWithoutReasoning, 2);
      expect(isValid).toBe(false);
    });

    it("should handle missing sentiment data gracefully", () => {
      const sentiments: number[] = [];
      const composite = signalEngine.calculateCompositeSentiment(sentiments);

      expect(composite).toBe(0);
    });

    it("should handle null/undefined values in sentiment array", () => {
      const sentiments = [0.5, 0, 0.3];
      const composite = signalEngine.calculateCompositeSentiment(sentiments);

      expect(composite).toBeCloseTo(0.267, 2);
    });
  });

  describe("Engine Statistics", () => {
    it("should provide accurate engine configuration", () => {
      const stats = signalEngine.getStats();

      expect(stats.minConfidenceThreshold).toBe(0.6);
      expect(stats.minSourcesRequired).toBe(2);
      expect(stats.deduplicationWindow).toBe(60 * 60 * 1000); // 1 hour
    });
  });
});
