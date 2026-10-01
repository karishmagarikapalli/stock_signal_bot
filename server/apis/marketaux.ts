import axios, { AxiosInstance } from "axios";

/**
 * MarketAux API Client
 * Handles sentiment analysis and multi-source news aggregation
 */

export interface MarketAuxEntity {
  symbol: string;
  name: string;
  exchange?: string;
  exchange_long?: string;
  country: string;
  type: string;
  industry: string;
  match_score: number;
  sentiment_score: number;
  highlights: Array<{
    highlight: string;
    sentiment: number;
    highlighted_in: string;
  }>;
}

export interface MarketAuxArticle {
  uuid: string;
  title: string;
  description: string;
  keywords: string;
  snippet: string;
  url: string;
  image_url: string;
  language: string;
  published_at: string;
  source: string;
  relevance_score?: number;
  entities: MarketAuxEntity[];
  similar: any[];
}

export interface MarketAuxNewsResponse {
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
  };
  data: MarketAuxArticle[];
}

export class MarketAuxClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = "https://api.marketaux.com/v1";
  private requestCount = 0;
  private lastResetDay = Date.now();
  private dailyLimit = 100; // Free tier limit

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * Check if we can make a request (rate limiting)
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastReset = now - this.lastResetDay;

    // Reset counter every 24 hours
    if (timeSinceLastReset > 86400000) {
      this.requestCount = 0;
      this.lastResetDay = now;
    }

    // MarketAux free tier: 100 requests/day
    if (this.requestCount >= this.dailyLimit) {
      const waitTime = 86400000 - timeSinceLastReset;
      console.log(`[MarketAux] Daily limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastResetDay = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Search for news articles
   */
  async searchNews(
    query: string,
    limit: number = 3,
    page: number = 1,
    language: string = "en"
  ): Promise<MarketAuxNewsResponse> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/news/all", {
        params: {
          api_token: this.apiKey,
          search: query,
          limit,
          page,
          language,
        },
      });

      return response.data || { meta: { found: 0, returned: 0, limit, page }, data: [] };
    } catch (error) {
      console.error("[MarketAux] Error searching news:", error);
      return { meta: { found: 0, returned: 0, limit, page }, data: [] };
    }
  }

  /**
   * Get news for a specific entity (stock symbol)
   */
  async getEntityNews(
    entity: string,
    limit: number = 3,
    page: number = 1
  ): Promise<MarketAuxNewsResponse> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/news/all", {
        params: {
          api_token: this.apiKey,
          symbols: entity,
          filter_entities: true,
          language: "en",
          limit,
          page,
        },
      });

      return response.data || { meta: { found: 0, returned: 0, limit, page }, data: [] };
    } catch (error) {
      console.error(`[MarketAux] Error fetching news for entity ${entity}:`, error);
      return { meta: { found: 0, returned: 0, limit, page }, data: [] };
    }
  }

  /**
   * Extract sentiment from articles
   * Returns average sentiment score and per-entity sentiment
   */
  extractSentiment(articles: MarketAuxArticle[]): {
    averageSentiment: number;
    entitySentiments: Map<string, number>;
    articleCount: number;
  } {
    if (articles.length === 0) {
      return {
        averageSentiment: 0,
        entitySentiments: new Map(),
        articleCount: 0,
      };
    }

    let totalSentiment = 0;
    const entitySentiments = new Map<string, number[]>();

    for (const article of articles) {
      // Calculate article sentiment from entities
      if (article.entities && article.entities.length > 0) {
        const entityScores = article.entities.map(e => e.sentiment_score);
        const articleSentiment = entityScores.reduce((a, b) => a + b, 0) / entityScores.length;
        totalSentiment += articleSentiment;

        // Track per-entity sentiment
        for (const entity of article.entities) {
          if (!entitySentiments.has(entity.symbol)) {
            entitySentiments.set(entity.symbol, []);
          }
          entitySentiments.get(entity.symbol)!.push(entity.sentiment_score);
        }
      }
    }

    // Calculate averages
    const averageSentiment = totalSentiment / articles.length;

    const entityAverageSentiments = new Map<string, number>();
    entitySentiments.forEach((scores: number[], symbol: string) => {
      const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      entityAverageSentiments.set(symbol, avg);
    });

    return {
      averageSentiment,
      entitySentiments: entityAverageSentiments,
      articleCount: articles.length,
    };
  }

  /**
   * Identify high-sentiment articles for a symbol
   */
  getHighSentimentArticles(
    articles: MarketAuxArticle[],
    symbol: string,
    threshold: number = 0.6
  ): MarketAuxArticle[] {
    return articles.filter(article => {
      const entity = article.entities.find(e => e.symbol === symbol);
      return entity && entity.sentiment_score >= threshold;
    });
  }

  /**
   * Get request count for monitoring
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Get remaining requests for the day
   */
  getRemainingRequests(): number {
    return Math.max(0, this.dailyLimit - this.requestCount);
  }
}

/**
 * Create a singleton MarketAux client
 */
let marketauxClient: MarketAuxClient | null = null;

export function getMarketAuxClient(apiKey: string): MarketAuxClient {
  if (!marketauxClient) {
    marketauxClient = new MarketAuxClient(apiKey);
  }
  return marketauxClient;
}
