import {
  getOrCreateStock,
  getOrCreateNewsSource,
  createNewsItem,
  getUnprocessedNewsItems,
  markNewsItemProcessed,
  createSignalHistory,
  getStockBySymbol,
} from "../db";
import { getFinnhubClient, FinnhubNews } from "../apis/finnhub";
import { getMarketAuxClient, MarketAuxArticle } from "../apis/marketaux";
import { getNtfyClient } from "../apis/ntfy";
import { getSignalEngine, SignalInput } from "./signalEngine";

/**
 * Data Ingestion Service
 * Fetches news from multiple sources, processes it, and generates signals
 */

export interface IngestionConfig {
  finnhubApiKey: string;
  marketauxApiKey: string;
  ntfyTopic: string;
  watchedSymbols: string[];
  hoursToLookBack: number;
}

export class IngestionService {
  private config: IngestionConfig;
  private finnhubClient: any;
  private marketauxClient: any;
  private ntfyClient: any;
  private signalEngine: any;

  constructor(config: IngestionConfig) {
    this.config = config;
    this.finnhubClient = getFinnhubClient(config.finnhubApiKey);
    this.marketauxClient = getMarketAuxClient(config.marketauxApiKey);
    this.ntfyClient = getNtfyClient(config.ntfyTopic);
    this.signalEngine = getSignalEngine();
  }

  /**
   * Run a complete ingestion cycle
   */
  async runIngestionCycle(): Promise<{
    newsItemsProcessed: number;
    signalsGenerated: number;
    alertsSent: number;
  }> {
    console.log("[IngestionService] Starting ingestion cycle...");

    const stats = {
      newsItemsProcessed: 0,
      signalsGenerated: 0,
      alertsSent: 0,
    };

    try {
      // Fetch news for each watched symbol
      for (const symbol of this.config.watchedSymbols) {
        console.log(`[IngestionService] Processing symbol: ${symbol}`);

        try {
          const stock = await getOrCreateStock(symbol, symbol);

          // Fetch from Finnhub
          const finnhubNews = await this.fetchFinnhubNews(symbol);
          console.log(`[IngestionService] Fetched ${finnhubNews.length} articles from Finnhub`);

          // Fetch from MarketAux
          const marketauxNews = await this.fetchMarketAuxNews(symbol);
          console.log(`[IngestionService] Fetched ${marketauxNews.length} articles from MarketAux`);

          // Process news and generate signals
          const result = await this.processNewsAndGenerateSignals(
            stock.id,
            symbol,
            finnhubNews,
            marketauxNews
          );

          stats.newsItemsProcessed += result.newsProcessed;
          stats.signalsGenerated += result.signalsGenerated;
          stats.alertsSent += result.alertsSent;
        } catch (error) {
          console.error(`[IngestionService] Error processing ${symbol}:`, error);
        }
      }

      console.log("[IngestionService] Ingestion cycle complete:", stats);
      return stats;
    } catch (error) {
      console.error("[IngestionService] Fatal error in ingestion cycle:", error);
      await this.ntfyClient.sendSystemAlert(
        "Ingestion Service Error",
        `Error during ingestion cycle: ${error}`,
        "error"
      );
      throw error;
    }
  }

  /**
   * Fetch news from Finnhub
   */
  private async fetchFinnhubNews(symbol: string): Promise<FinnhubNews[]> {
    try {
      const from = new Date(Date.now() - this.config.hoursToLookBack * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const to = new Date().toISOString().split("T")[0];

      const news = await this.finnhubClient.getCompanyNews(symbol, from, to);
      return news || [];
    } catch (error) {
      console.error(`[IngestionService] Error fetching Finnhub news for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Fetch news from MarketAux
   */
  private async fetchMarketAuxNews(symbol: string): Promise<MarketAuxArticle[]> {
    try {
      const response = await this.marketauxClient.getEntityNews(symbol, 5, 1);
      return response.data || [];
    } catch (error) {
      console.error(`[IngestionService] Error fetching MarketAux news for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Process news and generate signals
   */
  private async processNewsAndGenerateSignals(
    stockId: number,
    symbol: string,
    finnhubNews: FinnhubNews[],
    marketauxNews: MarketAuxArticle[]
  ): Promise<{
    newsProcessed: number;
    signalsGenerated: number;
    alertsSent: number;
  }> {
    const stats = {
      newsProcessed: 0,
      signalsGenerated: 0,
      alertsSent: 0,
    };

    try {
      // Get or create news sources
      const finnhubSource = await getOrCreateNewsSource(
        "Finnhub",
        "https://finnhub.io",
        "news",
        0.9
      );
      const marketauxSource = await getOrCreateNewsSource(
        "MarketAux",
        "https://marketaux.com",
        "news",
        0.85
      );

      // Store Finnhub news
      const finnhubNewsIds: number[] = [];
      for (const article of finnhubNews) {
        try {
          const newsItem = await createNewsItem({
            externalId: `finnhub-${article.id}`,
            title: article.headline,
            description: article.summary,
            url: article.url,
            sourceId: finnhubSource.id,
            publishedAt: new Date(article.datetime * 1000),
            sentimentSource: "finnhub",
          });
          finnhubNewsIds.push(newsItem.id);
          stats.newsProcessed++;
        } catch (error) {
          console.warn(`[IngestionService] Error storing Finnhub article:`, error);
        }
      }

      // Store MarketAux news and extract sentiment for this symbol only
      const marketauxNewsIds: number[] = [];
      const sentiments: number[] = [];
      const scoredSources: Array<{ source: string; score: number }> = [];

      for (const article of marketauxNews) {
        try {
          const entity = (article.entities || []).find(
            e => e.symbol?.toUpperCase() === symbol.toUpperCase() && typeof e.sentiment_score === "number"
          );
          const articleSentiment = entity?.sentiment_score;

          const newsItem = await createNewsItem({
            externalId: `marketaux-${article.uuid}`,
            title: article.title,
            description: article.description,
            content: article.snippet,
            url: article.url,
            sourceId: marketauxSource.id,
            publishedAt: new Date(article.published_at),
            sentimentScore: articleSentiment,
            sentimentSource: "marketaux",
            entities: article.entities.map(e => ({
              symbol: e.symbol,
              name: e.name,
              sentiment: e.sentiment_score,
            })),
          });

          marketauxNewsIds.push(newsItem.id);
          if (articleSentiment !== undefined) {
            sentiments.push(articleSentiment);
            scoredSources.push({ source: article.source, score: articleSentiment });
          }
          stats.newsProcessed++;
        } catch (error) {
          console.warn(`[IngestionService] Error storing MarketAux article:`, error);
        }
      }

      // Generate signal if we have sufficient data
      if (finnhubNewsIds.length > 0 && sentiments.length > 0) {
        const compositeSentiment = this.signalEngine.calculateCompositeSentiment(sentiments);
        const direction = Math.sign(compositeSentiment);
        const agreeingSources = new Set(
          scoredSources.filter(s => direction !== 0 && Math.sign(s.score) === direction).map(s => s.source)
        ).size;

        const signalInput: SignalInput = {
          stockId,
          stockSymbol: symbol,
          stockName: symbol,
          newsItems: [
            ...finnhubNews.map((n, i) => ({
              id: finnhubNewsIds[i],
              title: n.headline,
              sentiment: 0, // Finnhub doesn't provide sentiment
              source: "Finnhub",
            })),
            ...marketauxNews.map((n, i) => ({
              id: marketauxNewsIds[i],
              title: n.title,
              sentiment: n.entities?.find(e => e.symbol?.toUpperCase() === symbol.toUpperCase())?.sentiment_score ?? 0,
              source: "MarketAux",
            })),
          ],
          sentimentAverage: compositeSentiment,
          sourceCount: agreeingSources, // distinct publishers agreeing on direction
          eventType: "news",
        };

        // Generate signal
        const signal = this.signalEngine.generateSignal(signalInput);

        if (signal && this.signalEngine.validateSignalQuality(signal, agreeingSources)) {
          // Create and alert signal
          const result = await this.signalEngine.createAndAlertSignal(
            signalInput,
            signal,
            [finnhubSource.id, marketauxSource.id],
            this.ntfyClient
          );

          if (result) {
            stats.signalsGenerated++;
            stats.alertsSent++;

            // Create signal history for tracking
            await createSignalHistory({
              signalId: result.signalId,
              stockSymbol: symbol,
              signalType: signal.type,
              priceAtSignal: 0, // Would fetch from API in production
            });
          }
        }
      }

      return stats;
    } catch (error) {
      console.error("[IngestionService] Error processing news:", error);
      return stats;
    }
  }

  /**
   * Get ingestion statistics
   */
  getStats(): {
    watchedSymbols: number;
    hoursToLookBack: number;
    ntfyTopic: string;
  } {
    return {
      watchedSymbols: this.config.watchedSymbols.length,
      hoursToLookBack: this.config.hoursToLookBack,
      ntfyTopic: this.config.ntfyTopic,
    };
  }
}

/**
 * Create a singleton ingestion service
 */
let ingestionService: IngestionService | null = null;

export function getIngestionService(config: IngestionConfig): IngestionService {
  if (!ingestionService) {
    ingestionService = new IngestionService(config);
  }
  return ingestionService;
}
