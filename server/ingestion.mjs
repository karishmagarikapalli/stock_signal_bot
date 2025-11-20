#!/usr/bin/env node

/**
 * Stock Signal Bot Ingestion Script
 * Fetches news from multiple sources and generates trading signals
 * 
 * Usage:
 *   node ingestion.mjs --symbols AAPL,MSFT,GOOGL
 * 
 * Environment variables:
 *   FINNHUB_API_KEY - Finnhub API key (required)
 *   MARKETAUX_API_KEY - MarketAux API key (required)
 *   NTFY_TOPIC - ntfy.sh topic for notifications (required)
 *   DATABASE_URL - Database connection string (required)
 */

import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Parse command line arguments
const args = process.argv.slice(2);
let symbols = ['AAPL', 'MSFT', 'GOOGL'];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--symbols') {
    symbols = args[i + 1].split(',').map(s => s.trim().toUpperCase());
    i++;
  }
}

// Validate environment variables
const requiredEnvVars = ['FINNHUB_API_KEY', 'MARKETAUX_API_KEY', 'NTFY_TOPIC'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingEnvVars.length > 0) {
  console.error(`[Ingestion] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const MARKETAUX_API_KEY = process.env.MARKETAUX_API_KEY;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

console.log(`[Ingestion] Starting ingestion for symbols: ${symbols.join(', ')}`);

/**
 * Fetch news from Finnhub
 */
async function fetchFinnhubNews(symbol) {
  try {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    const response = await axios.get('https://finnhub.io/api/v1/company-news', {
      params: {
        symbol,
        from,
        to,
        token: FINNHUB_API_KEY,
      },
      timeout: 10000,
    });

    return response.data || [];
  } catch (error) {
    console.error(`[Ingestion] Error fetching Finnhub news for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch news from MarketAux
 */
async function fetchMarketAuxNews(symbol) {
  try {
    const response = await axios.get('https://api.marketaux.com/v1/news/all', {
      params: {
        api_token: MARKETAUX_API_KEY,
        entities: symbol,
        limit: 5,
        page: 1,
      },
      timeout: 10000,
    });

    return response.data?.data || [];
  } catch (error) {
    console.error(`[Ingestion] Error fetching MarketAux news for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Calculate composite sentiment
 */
function calculateSentiment(articles) {
  if (articles.length === 0) return 0;

  let totalSentiment = 0;
  for (const article of articles) {
    if (article.entities && article.entities.length > 0) {
      const entityScores = article.entities.map(e => e.sentiment_score);
      const articleSentiment = entityScores.reduce((a, b) => a + b, 0) / entityScores.length;
      totalSentiment += articleSentiment;
    }
  }

  return totalSentiment / articles.length;
}

/**
 * Generate signal
 */
function generateSignal(sentiment, sourceCount) {
  if (sourceCount < 2) return null;

  let signalType = 'HOLD';
  let confidence = 0;
  let reasoning = '';

  if (sentiment > 0.6) {
    signalType = 'BUY';
    confidence = Math.min(0.95, 0.5 + sentiment * 0.5);
    reasoning = `Positive sentiment (${(sentiment * 100).toFixed(0)}%) from ${sourceCount} sources`;
  } else if (sentiment < -0.6) {
    signalType = 'SELL';
    confidence = Math.min(0.95, 0.5 + Math.abs(sentiment) * 0.5);
    reasoning = `Negative sentiment (${(sentiment * 100).toFixed(0)}%) from ${sourceCount} sources`;
  } else {
    signalType = 'HOLD';
    confidence = 0.5;
    reasoning = `Neutral sentiment (${(sentiment * 100).toFixed(0)}%) - no clear direction`;
  }

  if (confidence < 0.6) return null;

  return { signalType, confidence, reasoning };
}

/**
 * Send notification
 */
async function sendNotification(symbol, signal) {
  try {
    const emoji = {
      BUY: '📈',
      SELL: '📉',
      HOLD: '➡️',
    };

    const title = `${emoji[signal.signalType]} ${signal.signalType} Signal: ${symbol}`;
    const message = `
Confidence: ${(signal.confidence * 100).toFixed(0)}%
Reasoning: ${signal.reasoning}
`.trim();

    const headers = {
      'X-Title': title,
      'X-Priority': signal.confidence > 0.8 ? 'high' : 'default',
      'X-Tags': `${signal.signalType.toLowerCase()},stock,${symbol.toLowerCase()}`,
    };

    const response = await axios.put(
      `https://ntfy.sh/${NTFY_TOPIC}`,
      message,
      { headers, timeout: 10000 }
    );

    console.log(`[Ingestion] Notification sent for ${symbol}: ${signal.signalType}`);
    return response.status === 200;
  } catch (error) {
    console.error(`[Ingestion] Error sending notification for ${symbol}:`, error.message);
    return false;
  }
}

/**
 * Main ingestion function
 */
async function main() {
  let totalSignals = 0;
  let totalAlerts = 0;

  for (const symbol of symbols) {
    console.log(`[Ingestion] Processing ${symbol}...`);

    try {
      // Fetch news from both sources
      const finnhubNews = await fetchFinnhubNews(symbol);
      const marketauxNews = await fetchMarketAuxNews(symbol);

      console.log(
        `[Ingestion] ${symbol}: Finnhub=${finnhubNews.length}, MarketAux=${marketauxNews.length}`
      );

      // Calculate sentiment
      const sentiment = calculateSentiment(marketauxNews);

      // Generate signal
      const signal = generateSignal(sentiment, 2);

      if (signal) {
        console.log(`[Ingestion] Signal generated for ${symbol}: ${signal.signalType}`);
        totalSignals++;

        // Send notification
        const sent = await sendNotification(symbol, signal);
        if (sent) totalAlerts++;
      } else {
        console.log(`[Ingestion] No signal for ${symbol} (sentiment: ${sentiment.toFixed(2)})`);
      }
    } catch (error) {
      console.error(`[Ingestion] Error processing ${symbol}:`, error.message);
    }
  }

  console.log(
    `[Ingestion] Cycle complete: ${totalSignals} signals generated, ${totalAlerts} alerts sent`
  );
  process.exit(0);
}

// Run the ingestion
main().catch((error) => {
  console.error('[Ingestion] Fatal error:', error);
  process.exit(1);
});
