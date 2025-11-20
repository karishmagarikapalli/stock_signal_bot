# Stock Signal Bot - Research & Architecture

## Phase 1: Data Sources & Notification Services Research

### Executive Summary

This document outlines the recommended architecture for a real-time stock market notification system that analyzes legitimate news and social media sources to generate buy/sell signals with minimal delay.

---

## 1. Data Sources Analysis

### 1.1 Financial Data & News APIs

#### **Finnhub** [Primary Choice]
- **Free Tier**: 60 API calls/minute, 1 year of historical news, real-time updates
- **Real-Time Capabilities**: 
  - WebSocket support for real-time market data (50 symbols on free tier)
  - Real-time company news feed
  - Real-time earnings calendar updates
  - Real-time upgrade/downgrade alerts
- **Data Coverage**: US market focus on free tier, global on paid
- **Key Features**:
  - Company news (1 year historical + real-time)
  - Press releases (20 years + real-time)
  - Earnings calendar with real-time updates
  - Upgrade/downgrade recommendations
  - SEC filings with sentiment analysis
- **Latency**: Minimal (WebSocket-based real-time)
- **Corroboration Value**: Provides multiple signal types (news, earnings, analyst recommendations)

#### **MarketAux** [Secondary Choice]
- **Free Tier**: 100 requests daily, 3 articles per request
- **Real-Time Capabilities**: Instant news access from 5,000+ sources
- **Data Coverage**: 80+ global markets, 30+ languages
- **Key Features**:
  - Comprehensive sentiment analysis per article
  - Entity-level sentiment scoring
  - 200,000+ tracked entities
  - Multi-source aggregation
  - Highlights showing sentiment context
- **Latency**: Instant access to news
- **Corroboration Value**: Sentiment analysis helps validate signals across multiple sources

#### **Alpha Vantage** [Supplementary]
- **Free Tier**: 5 requests/minute (previously 500/day, now reduced)
- **Real-Time Capabilities**: Real-time stock prices, OHLC data
- **Data Coverage**: US market
- **Limitation**: Rate limits are restrictive for real-time monitoring
- **Use Case**: Historical data validation, supplementary price checks

### 1.2 Social Media & Alternative Data

**X/Twitter API** [Consideration]
- Requires paid tier ($100+/month) for real-time streaming
- Free tier has severe limitations
- **Recommendation**: Use RSS feeds from verified financial accounts as free alternative

**Reddit/Financial Communities** [Consideration]
- Free access via RSS or web scraping
- High noise-to-signal ratio
- **Recommendation**: Monitor specific subreddits (r/stocks, r/investing) but with heavy filtering

### 1.3 Recommended Multi-Source Strategy

For **robust corroboration**, the system should aggregate signals from:

1. **Finnhub** (Primary):
   - Real-time news feed
   - Earnings calendar events
   - Analyst recommendations (upgrade/downgrade)
   - Company filings with sentiment

2. **MarketAux** (Secondary):
   - Sentiment analysis validation
   - Multi-source news aggregation
   - Entity-level sentiment scoring

3. **Supplementary**:
   - Financial RSS feeds (Yahoo Finance, Seeking Alpha)
   - SEC EDGAR filings (free, real-time)
   - Earnings transcripts (free via Seeking Alpha)

---

## 2. Notification Services Analysis

### **ntfy.sh** [Recommended]
- **Free Tier Limits**:
  - 250 daily messages (sufficient for personal use)
  - 60 requests/visitor at once, refill at 1 request/5 seconds
  - 4,096 bytes per message
  - 2 MB attachment limit
  - No authentication required (topic is password)
- **Supported Platforms**: 
  - Web app (with Markdown support)
  - Android app (native notifications)
  - iOS (via webhooks)
  - Email (limited to title)
  - Webhook integration
- **Latency**: Immediate delivery
- **API**: Simple HTTP PUT/POST
- **Advantages**:
  - 100% free, open-source
  - No sign-up required
  - Supports priority levels (max, high, default, low, min)
  - Markdown formatting support
  - Can be self-hosted if needed
  - Extremely low latency
- **Implementation**: Single HTTP request with headers

### Alternative Notification Services

**OneSignal** (Free tier with limitations)
- 30,000 subscribers on free tier
- Overkill for personal use

**Pushover** (Paid, ~$5 one-time)
- Professional-grade but requires payment

**Email/SMS** (Twilio)
- Twilio free tier very limited
- Not suitable for high-frequency alerts

---

## 3. Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Ingestion Layer                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Finnhub API     │  │  MarketAux API   │  │ RSS Feeds  │ │
│  │  (Real-time)     │  │  (Sentiment)     │  │ (SEC/News) │ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                  Data Processing Layer                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  • Parse and normalize data from multiple sources            │
│  • Extract entities (company names, symbols)                 │
│  • Aggregate sentiment scores                                │
│  • Detect duplicate/correlated signals                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   Decision Engine Layer                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  • Corroboration logic (require 2+ sources)                  │
│  • Sentiment threshold evaluation                            │
│  • Rules-based signal generation (BUY/SELL/HOLD)            │
│  • Deduplication (prevent duplicate alerts)                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                 Notification Layer                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  • ntfy.sh push notifications                                │
│  • Priority-based delivery                                   │
│  • Message formatting with context                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Corroboration Strategy

To ensure **robust signals**, implement multi-source validation:

| Signal Type | Primary Source | Validation Source | Threshold |
|---|---|---|---|
| **News-based** | Finnhub news | MarketAux sentiment | Sentiment score > 0.6 |
| **Earnings** | Finnhub calendar | SEC EDGAR | Confirmed event |
| **Analyst** | Finnhub recommendations | Upgrade/downgrade count | 2+ upgrades/downgrades |
| **Sentiment** | MarketAux | Finnhub news volume | Consistent across sources |

---

## 4. Technology Stack

| Component | Technology | Reasoning |
|---|---|---|
| **Runtime** | Node.js + TypeScript | Fast, async-friendly, good for real-time |
| **Scheduler** | GitHub Actions (free) or node-cron | Runs every 1-5 minutes for near real-time |
| **Database** | SQLite (local) or MySQL (cloud) | Track signals, avoid duplicates, store history |
| **API Clients** | axios + node-fetch | HTTP requests to Finnhub, MarketAux |
| **Sentiment Analysis** | MarketAux API (built-in) | No ML model training needed |
| **Notifications** | ntfy.sh HTTP API | Simple, free, reliable |
| **Hosting** | GitHub Actions (free) or Vercel (free tier) | No server costs |
| **Repository** | GitHub | Free, integrates with Actions |

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up GitHub repository
- [ ] Create Node.js project with TypeScript
- [ ] Implement Finnhub API client
- [ ] Set up SQLite database for signal tracking
- [ ] Create basic signal detection logic

### Phase 2: Multi-Source Integration (Week 2)
- [ ] Add MarketAux API integration
- [ ] Implement sentiment analysis aggregation
- [ ] Add corroboration logic (require 2+ sources)
- [ ] Implement deduplication system

### Phase 3: Notifications (Week 3)
- [ ] Integrate ntfy.sh
- [ ] Test push notifications
- [ ] Add priority-based alerts
- [ ] Implement message formatting

### Phase 4: Deployment & Optimization (Week 4)
- [ ] Deploy to GitHub Actions (scheduled runs)
- [ ] Optimize for latency
- [ ] Add monitoring and logging
- [ ] Create documentation

---

## 6. Key Constraints & Considerations

### Latency Optimization
- **Target**: <5 minutes from news discovery to notification
- **Strategy**: 
  - Run scheduled jobs every 1-2 minutes
  - Use WebSocket for real-time Finnhub data
  - Cache recent signals to avoid duplicate alerts

### Free Tier Limitations
- **Finnhub**: 60 API calls/minute (sufficient for ~30 stocks)
- **MarketAux**: 100 requests/day (sufficient for validation)
- **ntfy.sh**: 250 messages/day (sufficient for personal use)

### Robustness Requirements
- **Multi-source corroboration**: Require signals from 2+ sources before alerting
- **Sentiment validation**: Ensure sentiment scores align with signal direction
- **Duplicate prevention**: Track recent alerts to avoid spamming

---

## 7. Recommended Next Steps

1. **Initialize project structure** with TypeScript + Node.js
2. **Create Finnhub API client** with WebSocket support
3. **Implement basic signal detection** (keyword matching + sentiment)
4. **Add MarketAux for corroboration** and sentiment validation
5. **Integrate ntfy.sh** for notifications
6. **Deploy to GitHub Actions** with 2-minute interval

---

## References

- Finnhub API Documentation: https://finnhub.io/docs/api
- MarketAux API Documentation: https://www.marketaux.com/
- ntfy.sh Documentation: https://docs.ntfy.sh/
- Alpha Vantage API: https://www.alphavantage.co/
