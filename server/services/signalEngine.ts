import {
  createSignal,
  createAlert,
  getRecentSignals,
  getNewsItemsByStock,
} from "../db";
import { NtfyClient } from "../apis/ntfy";

/**
 * Signal Engine
 * Analyzes news and market data to generate trading signals with corroboration
 */

export interface SignalInput {
  stockId: number;
  stockSymbol: string;
  stockName: string;
  newsItems: Array<{
    id: number;
    title: string;
    sentiment: number;
    source: string;
  }>;
  sentimentAverage: number;
  sourceCount: number;
  eventType: "news" | "earnings" | "upgrade" | "downgrade" | "filing";
  priceAtSignal?: number;
}

export interface GeneratedSignal {
  type: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  sources: number[];
}

export class SignalEngine {
  private deduplicationWindow = 60 * 60 * 1000; // 1 hour
  private minConfidenceThreshold = 0.6;
  private minSourcesRequired = 2; // Require corroboration from 2+ sources

  /**
   * Generate a signal based on input data
   */
  generateSignal(input: SignalInput): GeneratedSignal | null {
    // Validate inputs
    if (input.sourceCount < this.minSourcesRequired) {
      console.log(
        `[SignalEngine] Insufficient sources (${input.sourceCount}/${this.minSourcesRequired}) for ${input.stockSymbol}`
      );
      return null;
    }

    // Determine signal type based on sentiment and event type
    let signalType: "BUY" | "SELL" | "HOLD" = "HOLD";
    let confidence = 0;
    let reasoning = "";

    // News-based signals
    if (input.eventType === "news") {
      if (input.sentimentAverage > 0.6) {
        signalType = "BUY";
        confidence = Math.min(0.95, 0.5 + input.sentimentAverage * 0.5);
        reasoning = `Positive sentiment (${(input.sentimentAverage * 100).toFixed(0)}%) from ${input.sourceCount} sources`;
      } else if (input.sentimentAverage < -0.6) {
        signalType = "SELL";
        confidence = Math.min(0.95, 0.5 + Math.abs(input.sentimentAverage) * 0.5);
        reasoning = `Negative sentiment (${(input.sentimentAverage * 100).toFixed(0)}%) from ${input.sourceCount} sources`;
      } else {
        signalType = "HOLD";
        confidence = 0.5;
        reasoning = `Neutral sentiment (${(input.sentimentAverage * 100).toFixed(0)}%) - no clear direction`;
      }
    }

    // Earnings-based signals
    if (input.eventType === "earnings") {
      signalType = "HOLD";
      confidence = 0.6;
      reasoning = "Earnings event detected - awaiting market reaction";
    }

    // Upgrade/downgrade signals
    if (input.eventType === "upgrade") {
      signalType = "BUY";
      confidence = 0.75;
      reasoning = `Analyst upgrade detected from ${input.sourceCount} sources`;
    }

    if (input.eventType === "downgrade") {
      signalType = "SELL";
      confidence = 0.75;
      reasoning = `Analyst downgrade detected from ${input.sourceCount} sources`;
    }

    // Check confidence threshold
    if (confidence < this.minConfidenceThreshold) {
      console.log(
        `[SignalEngine] Confidence too low (${confidence.toFixed(2)}) for ${input.stockSymbol}`
      );
      return null;
    }

    return {
      type: signalType,
      confidence,
      reasoning,
      sources: [], // Will be populated with source IDs
    };
  }

  /**
   * Check for duplicate signals within the deduplication window
   */
  async checkForDuplicate(
    stockId: number,
    signalType: "BUY" | "SELL" | "HOLD"
  ): Promise<{ isDuplicate: boolean; duplicateOfId?: number }> {
    const recentSignals = await getRecentSignals(1); // Check last hour

    const duplicate = recentSignals.find(
      s =>
        s.stockId === stockId &&
        s.signalType === signalType &&
        Date.now() - s.createdAt.getTime() < this.deduplicationWindow
    );

    if (duplicate) {
      return { isDuplicate: true, duplicateOfId: duplicate.id };
    }

    return { isDuplicate: false };
  }

  /**
   * Create and send a signal alert
   */
  async createAndAlertSignal(
    input: SignalInput,
    signal: GeneratedSignal,
    sourceIds: number[],
    ntfyClient: NtfyClient
  ): Promise<{ signalId: number; alertId: number } | null> {
    try {
      // Check for duplicates
      const duplicate = await this.checkForDuplicate(input.stockId, signal.type);
      if (duplicate.isDuplicate) {
        console.log(
          `[SignalEngine] Duplicate ${signal.type} signal for ${input.stockSymbol} (of #${duplicate.duplicateOfId}); skipping`
        );
        return null;
      }

      // Create the signal in database
      const dbSignal = await createSignal({
        stockId: input.stockId,
        signalType: signal.type,
        confidence: signal.confidence,
        sources: sourceIds,
        newsItemIds: input.newsItems.map(n => n.id),
        reasoning: signal.reasoning,
        sentimentAverage: input.sentimentAverage,
        priceAtSignal: input.priceAtSignal,
      });

      // Send notification
      const notificationSent = await ntfyClient.sendStockSignal(
        input.stockSymbol,
        signal.type,
        signal.confidence,
        signal.reasoning,
        input.priceAtSignal
      );

      if (!notificationSent) {
        console.warn(`[SignalEngine] Failed to send notification for signal ${dbSignal.id}`);
      }

      // Create alert record
      const alert = await createAlert({
        signalId: dbSignal.id,
        title: `${signal.type} Signal: ${input.stockSymbol}`,
        message: signal.reasoning,
        priority: signal.confidence > 0.8 ? "high" : "default",
        ntfyTopic: ntfyClient.getTopic(),
      });

      return {
        signalId: dbSignal.id,
        alertId: alert.id,
      };
    } catch (error) {
      console.error("[SignalEngine] Error creating signal:", error);
      return null;
    }
  }

  /**
   * Calculate composite sentiment from multiple sources
   */
  calculateCompositeSentiment(sentiments: number[]): number {
    if (sentiments.length === 0) return 0;

    // Weight more recent/reliable sources higher
    const weighted = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;

    // Apply smoothing to avoid extreme values
    return Math.max(-1, Math.min(1, weighted));
  }

  /**
   * Validate signal quality
   */
  validateSignalQuality(signal: GeneratedSignal, sourceCount: number): boolean {
    // Check minimum confidence
    if (signal.confidence < this.minConfidenceThreshold) {
      return false;
    }

    // Check minimum sources for corroboration
    if (sourceCount < this.minSourcesRequired) {
      return false;
    }

    // Check reasoning is not empty
    if (!signal.reasoning || signal.reasoning.trim().length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Get signal statistics
   */
  getStats(): {
    minConfidenceThreshold: number;
    minSourcesRequired: number;
    deduplicationWindow: number;
  } {
    return {
      minConfidenceThreshold: this.minConfidenceThreshold,
      minSourcesRequired: this.minSourcesRequired,
      deduplicationWindow: this.deduplicationWindow,
    };
  }
}

/**
 * Create a singleton signal engine
 */
let signalEngine: SignalEngine | null = null;

export function getSignalEngine(): SignalEngine {
  if (!signalEngine) {
    signalEngine = new SignalEngine();
  }
  return signalEngine;
}
