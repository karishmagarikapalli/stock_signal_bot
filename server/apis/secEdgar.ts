/**
 * SEC EDGAR API Client
 * Fetches insider trading data (Form 4 filings) and other SEC documents
 * Insider buying/selling can be a strong signal for stock movements
 */

import axios, { AxiosInstance } from "axios";

export interface InsiderTrade {
  cik: string;
  companyName: string;
  symbol: string;
  filingDate: string;
  reportDate: string;
  insiderName: string;
  insiderTitle: string;
  transactionType: "buy" | "sell";
  quantity: number;
  price: number;
  value: number;
  sharesOwned: number;
  url: string;
}

export interface InsiderActivity {
  symbol: string;
  buyCount: number;
  sellCount: number;
  netBuys: number;
  totalBuyValue: number;
  totalSellValue: number;
  sentiment: number;
  confidence: number;
}

export class SECEdgarClient {
  private client: AxiosInstance;
  private baseUrl = "https://data.sec.gov/api/xquery";
  private requestCount = 0;
  private lastRequestTime = 0;
  private rateLimitDelay = 1000; // SEC requires 1 second between requests

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "User-Agent": "Stock-Signal-Bot/1.0 (contact: your-email@example.com)",
      },
    });
  }

  /**
   * Respect SEC rate limits
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Get CIK (Central Index Key) for a company symbol
   */
  async getCompanyCIK(symbol: string): Promise<string | null> {
    try {
      await this.respectRateLimit();

      const response = await this.client.get(
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=&dateb=&owner=exclude&count=100&search_text=`
      );

      // Parse CIK from response (this is a simplified approach)
      const cikMatch = response.data.match(/CIK=(\d+)/);
      return cikMatch ? cikMatch[1] : null;
    } catch (error) {
      console.error("[SEC] Error fetching CIK:", error);
      return null;
    }
  }

  /**
   * Fetch recent Form 4 filings (insider trades)
   * Form 4 is filed within 2 business days of insider transaction
   */
  async fetchForm4Filings(cik: string, limit: number = 50): Promise<InsiderTrade[]> {
    try {
      await this.respectRateLimit();

      const response = await this.client.get(
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=exclude&count=${limit}`
      );

      // Parse filings from response
      const trades: InsiderTrade[] = [];

      // This is a simplified parser - in production, use a proper HTML parser
      const filingRegex =
        /href="([^"]*?\/0001\d+-\d+-\d+[^"]*?)"[^>]*>([^<]+)<\/a>/g;
      let match;

      while ((match = filingRegex.exec(response.data)) !== null) {
        const url = match[1];
        const date = match[2];

        // Parse the filing to extract trade details
        const tradeDetails = await this.parseForm4Filing(url, cik);
        if (tradeDetails) {
          trades.push(...tradeDetails);
        }
      }

      return trades;
    } catch (error) {
      console.error("[SEC] Error fetching Form 4 filings:", error);
      return [];
    }
  }

  /**
   * Parse individual Form 4 filing
   */
  private async parseForm4Filing(url: string, cik: string): Promise<InsiderTrade[]> {
    try {
      await this.respectRateLimit();

      const response = await this.client.get(url);
      const trades: InsiderTrade[] = [];

      // Extract transaction data from XML/HTML
      // This is simplified - actual Form 4 parsing requires proper XML parsing
      const transactionRegex =
        /<transactionType>([^<]+)<\/transactionType>.*?<quantity>(\d+)<\/quantity>.*?<price>([\d.]+)<\/price>/g;

      let match;
      while ((match = transactionRegex.exec(response.data)) !== null) {
        const transactionType = match[1].toLowerCase().includes("sell") ? "sell" : "buy";
        const quantity = parseInt(match[2]);
        const price = parseFloat(match[3]);

        trades.push({
          cik,
          companyName: "",
          symbol: "",
          filingDate: new Date().toISOString(),
          reportDate: new Date().toISOString(),
          insiderName: "",
          insiderTitle: "",
          transactionType,
          quantity,
          price,
          value: quantity * price,
          sharesOwned: 0,
          url,
        });
      }

      return trades;
    } catch (error) {
      console.error("[SEC] Error parsing Form 4 filing:", error);
      return [];
    }
  }

  /**
   * Analyze insider activity for a symbol
   */
  async analyzeInsiderActivity(symbol: string, days: number = 30): Promise<InsiderActivity> {
    const cik = await this.getCompanyCIK(symbol);
    if (!cik) {
      return {
        symbol,
        buyCount: 0,
        sellCount: 0,
        netBuys: 0,
        totalBuyValue: 0,
        totalSellValue: 0,
        sentiment: 0,
        confidence: 0,
      };
    }

    const trades = await this.fetchForm4Filings(cik, 100);

    // Filter trades from last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentTrades = trades.filter(t => new Date(t.reportDate) > cutoffDate);

    let buyCount = 0;
    let sellCount = 0;
    let totalBuyValue = 0;
    let totalSellValue = 0;

    for (const trade of recentTrades) {
      if (trade.transactionType === "buy") {
        buyCount++;
        totalBuyValue += trade.value;
      } else {
        sellCount++;
        totalSellValue += trade.value;
      }
    }

    const netBuys = buyCount - sellCount;

    // Calculate sentiment
    // Insider buying is bullish, selling is bearish
    const totalTrades = buyCount + sellCount;
    let sentiment = 0;
    if (totalTrades > 0) {
      sentiment = (buyCount - sellCount) / totalTrades;
    }

    // Calculate confidence based on number of trades and value
    const confidence = Math.min(0.95, Math.max(0.5, totalTrades / 20));

    return {
      symbol,
      buyCount,
      sellCount,
      netBuys,
      totalBuyValue,
      totalSellValue,
      sentiment,
      confidence,
    };
  }

  /**
   * Get insider activity for multiple symbols
   */
  async getInsiderActivityBatch(
    symbols: string[],
    days: number = 30
  ): Promise<Map<string, InsiderActivity>> {
    const activities = new Map<string, InsiderActivity>();

    for (const symbol of symbols) {
      const activity = await this.analyzeInsiderActivity(symbol, days);
      activities.set(symbol, activity);
    }

    return activities;
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
 * Create a singleton SEC Edgar client
 */
let client: SECEdgarClient | null = null;

export function getSECEdgarClient(): SECEdgarClient {
  if (!client) {
    client = new SECEdgarClient();
  }
  return client;
}
