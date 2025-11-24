/**
 * Truth Social API Client
 * Fetches posts from Truth Social (Trump's social media platform)
 * and analyzes them for stock market signals
 */

import axios, { AxiosInstance } from "axios";

export interface TruthSocialPost {
  id: string;
  content: string;
  createdAt: string;
  likes: number;
  reposts: number;
  replies: number;
  url: string;
  author: string;
  mentions: string[];
  sentiment?: number;
}

export interface StockMention {
  symbol: string;
  sentiment: number;
  context: string;
  confidence: number;
}

export class TruthSocialClient {
  private client: AxiosInstance;
  private baseUrl = "https://truthsocial.com/api/v1";
  private requestCount = 0;
  private lastRequestTime = 0;
  private rateLimitDelay = 1000; // 1 second between requests

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "User-Agent": "Stock-Signal-Bot/1.0",
      },
    });
  }

  /**
   * Respect rate limits
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch recent posts from a user
   * Note: Truth Social API requires authentication for some endpoints
   * This implementation uses public endpoints where available
   */
  async fetchUserPosts(username: string, limit: number = 20): Promise<TruthSocialPost[]> {
    try {
      await this.respectRateLimit();

      // Truth Social API endpoint for user posts
      const response = await this.client.get(`/accounts/lookup?acct=${username}`);
      const accountId = response.data.id;

      // Fetch statuses (posts) for the account
      const statusResponse = await this.client.get(`/accounts/${accountId}/statuses`, {
        params: {
          limit,
          exclude_replies: false,
          exclude_reblogs: false,
        },
      });

      return statusResponse.data.map((post: any) => ({
        id: post.id,
        content: post.content,
        createdAt: post.created_at,
        likes: post.favourites_count,
        reposts: post.reblogs_count,
        replies: post.replies_count,
        url: post.url,
        author: username,
        mentions: this.extractMentions(post.content),
      }));
    } catch (error) {
      console.error("[TruthSocial] Error fetching posts:", error);
      return [];
    }
  }

  /**
   * Extract stock symbols and mentions from post content
   */
  private extractMentions(content: string): string[] {
    const mentions: string[] = [];

    // Match @mentions
    const atMentions = content.match(/@[\w]+/g) || [];
    mentions.push(...atMentions.map(m => m.substring(1)));

    // Match $SYMBOL (stock ticker format)
    const tickerMentions = content.match(/\$[A-Z]{1,5}/g) || [];
    mentions.push(...tickerMentions.map(m => m.substring(1)));

    return mentions;
  }

  /**
   * Analyze post sentiment for stock mentions
   */
  async analyzePostSentiment(post: TruthSocialPost): Promise<StockMention[]> {
    const stockMentions: StockMention[] = [];
    const symbols = this.extractStockSymbols(post.content);

    for (const symbol of symbols) {
      const sentiment = this.calculateSentiment(post.content);
      const confidence = this.calculateConfidence(post);

      stockMentions.push({
        symbol,
        sentiment,
        context: post.content,
        confidence,
      });
    }

    return stockMentions;
  }

  /**
   * Extract stock symbols from post content
   */
  private extractStockSymbols(content: string): string[] {
    const symbols: string[] = [];

    // Match $SYMBOL format
    const tickerMatches = content.match(/\$([A-Z]{1,5})/g) || [];
    symbols.push(...tickerMatches.map(m => m.substring(1)));

    // Common stock references
    const commonStocks: Record<string, string> = {
      apple: "AAPL",
      microsoft: "MSFT",
      tesla: "TSLA",
      amazon: "AMZN",
      google: "GOOGL",
      meta: "META",
      nvidia: "NVDA",
      intel: "INTC",
      amd: "AMD",
      bitcoin: "BTC",
      ethereum: "ETH",
    };

    for (const [keyword, symbol] of Object.entries(commonStocks)) {
      if (content.toLowerCase().includes(keyword)) {
        symbols.push(symbol);
      }
    }

    // Remove duplicates
    const uniqueSymbols: string[] = [];
    const seen = new Map<string, boolean>();
    for (const symbol of symbols) {
      if (!seen.has(symbol)) {
        uniqueSymbols.push(symbol);
        seen.set(symbol, true);
      }
    }
    return uniqueSymbols;
  }

  /**
   * Calculate sentiment score from post content
   * Returns value between -1 (very negative) and +1 (very positive)
   */
  private calculateSentiment(content: string): number {
    const lowerContent = content.toLowerCase();

    // Positive indicators
    const positiveWords = [
      "great",
      "excellent",
      "amazing",
      "fantastic",
      "wonderful",
      "buy",
      "bullish",
      "strong",
      "growth",
      "success",
      "profit",
      "win",
      "best",
      "love",
      "support",
      "surge",
      "rally",
    ];

    // Negative indicators
    const negativeWords = [
      "bad",
      "terrible",
      "awful",
      "horrible",
      "disaster",
      "sell",
      "bearish",
      "weak",
      "decline",
      "loss",
      "fail",
      "worst",
      "hate",
      "oppose",
      "crash",
      "plunge",
      "concern",
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lowerContent.includes(word)) {
        positiveCount++;
      }
    }

    for (const word of negativeWords) {
      if (lowerContent.includes(word)) {
        negativeCount++;
      }
    }

    const totalWords = positiveCount + negativeCount;
    if (totalWords === 0) {
      return 0;
    }

    return (positiveCount - negativeCount) / totalWords;
  }

  /**
   * Calculate confidence score based on post engagement
   * Higher engagement = higher confidence
   */
  private calculateConfidence(post: TruthSocialPost): number {
    // Normalize engagement metrics
    const engagementScore =
      (post.likes + post.reposts * 2 + post.replies) / (post.likes + post.reposts + post.replies + 1);

    // Cap at 0.95 (never 100% certain)
    return Math.min(0.95, 0.5 + engagementScore * 0.45);
  }

  /**
   * Get posts mentioning specific stocks
   */
  async getPostsForSymbols(
    username: string,
    symbols: string[],
    limit: number = 50
  ): Promise<Map<string, TruthSocialPost[]>> {
    const posts = await this.fetchUserPosts(username, limit);
    const symbolPosts = new Map<string, TruthSocialPost[]>();

    for (const symbol of symbols) {
      symbolPosts.set(
        symbol,
        posts.filter(post => {
          const extractedSymbols = this.extractStockSymbols(post.content);
          return extractedSymbols.includes(symbol);
        })
      );
    }

    return symbolPosts;
  }

  /**
   * Get API usage stats
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      rateLimitDelay: this.rateLimitDelay,
      lastRequestTime: this.lastRequestTime,
    };
  }
}

/**
 * Create a singleton Truth Social client
 */
let client: TruthSocialClient | null = null;

export function getTruthSocialClient(): TruthSocialClient {
  if (!client) {
    client = new TruthSocialClient();
  }
  return client;
}
