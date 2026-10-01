#!/usr/bin/env node

/**
 * Stock Signal Bot ingestion script. Free and open sources only: no API keys.
 *
 * News:       Google News RSS + Yahoo Finance RSS (public feeds)
 * Sentiment:  VADER, run locally (MIT-licensed lexicon model)
 * Alerts:     ntfy (open source; ntfy.sh or self-hosted)
 *
 * Usage:
 *   node server/ingestion.mjs --symbols AAPL,MSFT,NVDA
 *
 * Environment variables (shell or .env):
 *   NTFY_TOPIC            - ntfy topic to publish to (required; pick something hard to guess)
 *   NTFY_SERVER           - ntfy server URL (default https://ntfy.sh)
 *   LOOKBACK_HOURS        - only score headlines newer than this (default 24)
 *   BUY_THRESHOLD         - average sentiment needed for BUY; SELL uses the negative (default 0.35)
 *   MIN_AGREEING_SOURCES  - distinct publishers that must agree on direction (default 2)
 *   MIN_SCORED_HEADLINES  - non-neutral headlines required before a signal (default 3)
 *   DEDUP_WINDOW_MINUTES  - suppress repeat alerts for the same symbol+signal (default 60)
 *   SIGNAL_STATE_FILE     - where dedup state is stored (default ./.signal-state.json)
 *   DRY_RUN               - "1" to log signals without sending notifications
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import vader from 'vader-sentiment';

const args = process.argv.slice(2);
let symbols = ['AAPL', 'MSFT', 'NVDA'];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--symbols') {
    symbols = args[i + 1].split(',').map((s) => s.trim().toUpperCase());
    i++;
  }
}

const DRY_RUN = process.env.DRY_RUN === '1';
const NTFY_TOPIC = process.env.NTFY_TOPIC;
if (!NTFY_TOPIC && !DRY_RUN) {
  console.error('[Ingestion] Missing NTFY_TOPIC (or set DRY_RUN=1)');
  process.exit(1);
}

const NTFY_SERVER = (process.env.NTFY_SERVER ?? 'https://ntfy.sh').replace(/\/$/, '');
const LOOKBACK_MS = Number(process.env.LOOKBACK_HOURS ?? 24) * 60 * 60 * 1000;
const BUY_THRESHOLD = Number(process.env.BUY_THRESHOLD ?? 0.35);
const MIN_AGREEING_SOURCES = Number(process.env.MIN_AGREEING_SOURCES ?? 2);
const MIN_SCORED_HEADLINES = Number(process.env.MIN_SCORED_HEADLINES ?? 3);
const DEDUP_WINDOW_MS = Number(process.env.DEDUP_WINDOW_MINUTES ?? 60) * 60 * 1000;
const STATE_FILE = path.resolve(process.env.SIGNAL_STATE_FILE ?? '.signal-state.json');
const NEUTRAL_BAND = 0.05; // VADER's own neutral cutoff for the compound score

const http = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': 'stock-signal-bot/1.0 (+https://github.com/karishmagarikapalli/stock_signal_bot)' },
});
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const state = loadState();
state.lastAlerts ??= {};

function asArray(x) {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

async function fetchRss(url, publisherOf) {
  const { data } = await http.get(url, { responseType: 'text' });
  const items = asArray(xml.parse(data)?.rss?.channel?.item);
  return items.map((item) => ({
    title: String(item.title ?? '').trim(),
    link: String(item.link ?? ''),
    publishedAt: new Date(item.pubDate ?? 0),
    publisher: publisherOf(item),
  }));
}

async function fetchGoogleNews(symbol) {
  const q = encodeURIComponent(`${symbol} stock`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  return fetchRss(url, (item) => {
    const source = item.source;
    return (typeof source === 'object' ? source['#text'] : source) || hostOf(item.link);
  }).then((items) =>
    // Google News appends " - Publisher" to titles; strip it so scoring sees only the headline.
    items.map((i) => ({ ...i, title: i.title.replace(/\s+-\s+[^-]+$/, '') })),
  );
}

async function fetchYahooFinance(symbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  return fetchRss(url, (item) => hostOf(item.link));
}

async function fetchHeadlines(symbol) {
  const results = await Promise.allSettled([fetchGoogleNews(symbol), fetchYahooFinance(symbol)]);
  const headlines = [];
  const seen = new Set();
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[Ingestion] ${['Google News', 'Yahoo Finance'][i]} feed failed for ${symbol}: ${r.reason?.message}`);
      return;
    }
    for (const h of r.value) {
      const key = h.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key) || Date.now() - h.publishedAt.getTime() > LOOKBACK_MS) continue;
      seen.add(key);
      headlines.push(h);
    }
  });
  return headlines;
}

/**
 * Score headlines locally; neutral headlines are dropped so they don't dilute the average.
 */
function scoreHeadlines(headlines) {
  const scored = headlines
    .map((h) => ({ ...h, score: vader.SentimentIntensityAnalyzer.polarity_scores(h.title).compound }))
    .filter((h) => Math.abs(h.score) >= NEUTRAL_BAND);
  if (scored.length === 0) return { sentiment: 0, agreeingSources: 0, scored };
  const sentiment = scored.reduce((sum, h) => sum + h.score, 0) / scored.length;
  const direction = Math.sign(sentiment);
  const agreeingSources = new Set(scored.filter((h) => Math.sign(h.score) === direction).map((h) => h.publisher)).size;
  return { sentiment, agreeingSources, scored };
}

function generateSignal(sentiment, agreeingSources, scoredCount) {
  if (agreeingSources < MIN_AGREEING_SOURCES || scoredCount < MIN_SCORED_HEADLINES) return null;
  if (Math.abs(sentiment) < BUY_THRESHOLD) return null;

  const signalType = sentiment > 0 ? 'BUY' : 'SELL';
  const confidence = Math.min(0.95, 0.5 + Math.abs(sentiment) * 0.5);
  const reasoning = `${sentiment > 0 ? 'Positive' : 'Negative'} headline sentiment (${sentiment.toFixed(2)}) across ${scoredCount} headlines from ${agreeingSources} agreeing publishers`;
  return { signalType, confidence, reasoning };
}

async function sendNotification(symbol, signal, topHeadlines) {
  const emojiTag = { BUY: 'chart_with_upwards_trend', SELL: 'chart_with_downwards_trend' }[signal.signalType];
  const message = [
    `Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
    signal.reasoning,
    '',
    ...topHeadlines.map((h) => `• ${h.title} (${h.publisher})`),
  ].join('\n');

  if (DRY_RUN) {
    console.log(`[Ingestion] DRY_RUN: would notify ${symbol} ${signal.signalType}\n${message}`);
    return true;
  }
  try {
    const response = await http.post(`${NTFY_SERVER}/${encodeURIComponent(NTFY_TOPIC)}`, message, {
      headers: {
        Title: `${signal.signalType} Signal: ${symbol}`,
        Priority: signal.confidence > 0.8 ? 'high' : 'default',
        Tags: `${emojiTag},${symbol.toLowerCase()}`,
      },
    });
    console.log(`[Ingestion] Notification sent for ${symbol}: ${signal.signalType}`);
    return response.status === 200;
  } catch (error) {
    console.error(`[Ingestion] Error sending notification for ${symbol}:`, error.message);
    return false;
  }
}

async function main() {
  console.log(`[Ingestion] Starting ingestion for symbols: ${symbols.join(', ')}${DRY_RUN ? ' (dry run)' : ''}`);
  let totalSignals = 0;
  let totalAlerts = 0;

  for (const symbol of symbols) {
    try {
      const headlines = await fetchHeadlines(symbol);
      const { sentiment, agreeingSources, scored } = scoreHeadlines(headlines);
      console.log(
        `[Ingestion] ${symbol}: ${headlines.length} headlines, ${scored.length} non-neutral, sentiment ${sentiment.toFixed(2)}, agreeing publishers ${agreeingSources}`,
      );

      const signal = generateSignal(sentiment, agreeingSources, scored.length);
      if (!signal) continue;
      totalSignals++;

      const key = `${symbol}:${signal.signalType}`;
      const last = state.lastAlerts[key];
      if (last && Date.now() - last < DEDUP_WINDOW_MS) {
        console.log(`[Ingestion] Duplicate ${key} within dedup window; not alerting`);
        continue;
      }

      const top = scored
        .filter((h) => Math.sign(h.score) === Math.sign(sentiment))
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, 3);
      if (await sendNotification(symbol, signal, top)) {
        totalAlerts++;
        if (!DRY_RUN) state.lastAlerts[key] = Date.now();
      }
    } catch (error) {
      console.error(`[Ingestion] Error processing ${symbol}:`, error.message);
    }
  }

  console.log(`[Ingestion] Cycle complete: ${totalSignals} signals, ${totalAlerts} alerts sent`);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

main().catch((error) => {
  console.error('[Ingestion] Fatal error:', error);
  process.exit(1);
});
