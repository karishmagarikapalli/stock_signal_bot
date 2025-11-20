import axios, { AxiosInstance } from "axios";

/**
 * Finnhub API Client
 * Handles real-time stock data, news, and market information
 */

export interface FinnhubNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  category: string;
  datetime: number;
  related: string;
}

export interface FinnhubCompanyNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  category: string;
  datetime: number;
  related: string;
}

export interface FinnhubCompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  finnhubIndustry: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
}

export interface FinnhubQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Unix timestamp
}

export interface FinnhubRecommendation {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export interface FinnhubEarningsCalendar {
  date: string;
  epsActual: number;
  epsEstimate: number;
  hour: string;
  quarter: number;
  revenueActual: number;
  revenueEstimate: number;
  symbol: string;
  year: number;
}

export class FinnhubClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = "https://finnhub.io/api/v1";
  private requestCount = 0;
  private requestsPerMinute = 0;
  private lastMinuteReset = Date.now();

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
    const timeSinceLastReset = now - this.lastMinuteReset;

    // Reset counter every minute
    if (timeSinceLastReset > 60000) {
      this.requestsPerMinute = 0;
      this.lastMinuteReset = now;
    }

    // Finnhub free tier: 60 API calls/minute
    if (this.requestsPerMinute >= 60) {
      const waitTime = 60000 - timeSinceLastReset;
      console.log(`[Finnhub] Rate limit approaching, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestsPerMinute = 0;
      this.lastMinuteReset = Date.now();
    }

    this.requestsPerMinute++;
  }

  /**
   * Get market news
   */
  async getMarketNews(category: string = "general", minId: number = 0): Promise<FinnhubNews[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/news", {
        params: {
          category,
          minId,
          token: this.apiKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error("[Finnhub] Error fetching market news:", error);
      return [];
    }
  }

  /**
   * Get company-specific news
   */
  async getCompanyNews(symbol: string, from: string, to: string): Promise<FinnhubCompanyNews[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/company-news", {
        params: {
          symbol,
          from,
          to,
          token: this.apiKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error(`[Finnhub] Error fetching news for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get company profile
   */
  async getCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile | null> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/stock/profile2", {
        params: {
          symbol,
          token: this.apiKey,
        },
      });

      return response.data || null;
    } catch (error) {
      console.error(`[Finnhub] Error fetching profile for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get stock quote
   */
  async getQuote(symbol: string): Promise<FinnhubQuote | null> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/quote", {
        params: {
          symbol,
          token: this.apiKey,
        },
      });

      return response.data || null;
    } catch (error) {
      console.error(`[Finnhub] Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get analyst recommendations
   */
  async getRecommendations(symbol: string): Promise<FinnhubRecommendation[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/stock/recommendation", {
        params: {
          symbol,
          token: this.apiKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error(`[Finnhub] Error fetching recommendations for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get earnings calendar
   */
  async getEarningsCalendar(from: string, to: string): Promise<FinnhubEarningsCalendar[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/calendar/earnings", {
        params: {
          from,
          to,
          token: this.apiKey,
        },
      });

      return response.data?.earningsCalendar || [];
    } catch (error) {
      console.error("[Finnhub] Error fetching earnings calendar:", error);
      return [];
    }
  }

  /**
   * Get upgrade/downgrade data
   */
  async getUpgradesDowngrades(symbol: string): Promise<any[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/stock/upgrade-downgrade", {
        params: {
          symbol,
          token: this.apiKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error(`[Finnhub] Error fetching upgrades/downgrades for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get SEC filings
   */
  async getSecFilings(symbol: string, form: string = ""): Promise<any[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/stock/filings", {
        params: {
          symbol,
          form: form || undefined,
          token: this.apiKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error(`[Finnhub] Error fetching SEC filings for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get company press releases
   */
  async getPressReleases(symbol: string, from: string, to: string): Promise<any[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get("/press-releases", {
        params: {
          symbol,
          from,
          to,
          token: this.apiKey,
        },
      });

      return response.data?.data || [];
    } catch (error) {
      console.error(`[Finnhub] Error fetching press releases for ${symbol}:`, error);
      return [];
    }
  }
}

/**
 * Create a singleton Finnhub client
 */
let finnhubClient: FinnhubClient | null = null;

export function getFinnhubClient(apiKey: string): FinnhubClient {
  if (!finnhubClient) {
    finnhubClient = new FinnhubClient(apiKey);
  }
  return finnhubClient;
}
