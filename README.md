# Stock Signal Bot

A real-time stock market notification system that analyzes news from multiple legitimate sources, generates trading signals with multi-source corroboration, and sends instant push notifications with minimal latency.

## Features

- **Multi-Source News Aggregation**: Fetches news from Finnhub and MarketAux
- **Sentiment Analysis**: AI-powered sentiment scoring with confidence metrics
- **Signal Corroboration**: Requires 2+ sources before generating alerts to prevent false positives
- **Real-Time Notifications**: Push notifications via ntfy.sh with <5 second latency
- **Signal Deduplication**: Prevents alert spam with intelligent deduplication
- **Admin Dashboard**: Monitor signals, alerts, and API usage in real-time
- **100% Free**: No subscription fees, uses only free tier APIs

## Architecture

```
Data Sources (Finnhub, MarketAux)
           ↓
    Ingestion Service
           ↓
   Signal Engine (Corroboration)
           ↓
   Notification Service (ntfy.sh)
           ↓
     User Device (Push Notification)
```

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- API keys for:
  - **Finnhub**: https://finnhub.io/register (free tier: 60 calls/minute)
  - **MarketAux**: https://www.marketaux.com/ (free tier: 100 requests/day)
  - **ntfy.sh**: No registration needed, just pick a topic name

### Installation

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/stock_signal_bot.git
cd stock_signal_bot
pnpm install

# Configure environment variables
# Create .env.local with your API keys:
# FINNHUB_API_KEY=your_key_here
# MARKETAUX_API_KEY=your_key_here
# NTFY_TOPIC=stock-signals-your-username
```

### Test Locally

```bash
# Run the ingestion service once
node server/ingestion.mjs --symbols AAPL,MSFT,GOOGL

# You should see:
# [Ingestion] Processing AAPL...
# [Ingestion] Signal generated for AAPL: BUY
# [Ingestion] Notification sent for AAPL: BUY
```

Check your ntfy.sh topic for the notification:
```
https://ntfy.sh/stock-signals-your-username
```

### Deploy to GitHub Actions (Recommended)

1. Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/stock_signal_bot.git
git push -u origin main
```

2. Add GitHub Secrets:
   - Go to Settings → Secrets and variables → Actions
   - Add: `FINNHUB_API_KEY`, `MARKETAUX_API_KEY`, `NTFY_TOPIC`

3. Create `.github/workflows/ingestion.yml`:
```yaml
name: Stock Signal Ingestion
on:
  schedule:
    - cron: '*/2 * * * *'  # Every 2 minutes
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: pnpm install
      - run: node server/ingestion.mjs --symbols AAPL,MSFT,GOOGL,TSLA,AMZN
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          MARKETAUX_API_KEY: ${{ secrets.MARKETAUX_API_KEY }}
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
```

4. Enable workflows in GitHub Actions tab

## Configuration

### Watched Symbols

Edit the symbols list in your deployment:

**GitHub Actions:**
```yaml
run: node server/ingestion.mjs --symbols AAPL,MSFT,NVDA,TSLA,AMD
```

**Self-hosted:**
```bash
node server/scheduler.mjs --interval 120 --symbols AAPL,MSFT,NVDA
```

### Signal Parameters

Edit `server/services/signalEngine.ts`:

```typescript
private minConfidenceThreshold = 0.6;  // Minimum confidence to generate signal
private minSourcesRequired = 2;         // Require 2+ sources for corroboration
private deduplicationWindow = 60 * 60 * 1000;  // 1 hour deduplication window
```

## API Limits

| Service | Free Tier | Limit |
|---------|-----------|-------|
| Finnhub | 60 calls/minute | Real-time news, earnings, analyst ratings |
| MarketAux | 100 requests/day | Sentiment analysis, multi-source aggregation |
| ntfy.sh | 250 messages/day | Push notifications |

## Signal Types

- **BUY**: Positive sentiment (>0.6) from 2+ sources
- **SELL**: Negative sentiment (<-0.6) from 2+ sources
- **HOLD**: Neutral sentiment or insufficient data

## Latency Breakdown

- Data fetch: ~2 seconds (Finnhub + MarketAux)
- Processing: ~1 second (sentiment analysis, signal generation)
- Notification: ~1 second (ntfy.sh)
- **Total: ~4 seconds** from news discovery to push notification

## Troubleshooting

### No Notifications Received

1. Check ntfy topic: https://ntfy.sh/YOUR_TOPIC
2. Verify API keys in environment variables
3. Check logs:
   - GitHub Actions: View in Actions tab
   - Self-hosted: `pm2 logs stock-signal-bot`

### Rate Limit Errors

- Reduce number of symbols
- Increase execution interval
- Use GitHub Actions (free 2,000 minutes/month)

### Database Connection Issues

Ensure `DATABASE_URL` is correct and accessible

## Project Structure

```
stock_signal_bot/
├── client/                 # React frontend
│   └── src/
│       ├── pages/
│       │   ├── Home.tsx    # Landing page
│       │   └── Dashboard.tsx # Signal monitoring dashboard
│       └── App.tsx
├── server/                 # Node.js backend
│   ├── apis/
│   │   ├── finnhub.ts      # Finnhub API client
│   │   ├── marketaux.ts    # MarketAux API client
│   │   └── ntfy.ts         # ntfy.sh notification client
│   ├── services/
│   │   ├── signalEngine.ts # Core signal generation logic
│   │   └── ingestionService.ts # Data ingestion orchestration
│   ├── ingestion.mjs       # Standalone ingestion script
│   ├── scheduler.mjs       # Scheduler for continuous execution
│   └── db.ts               # Database helpers
├── drizzle/                # Database schema
│   └── schema.ts
└── DEPLOYMENT.md           # Detailed deployment guide
```

## Testing

Run the test suite:

```bash
pnpm test
```

Run specific tests:

```bash
pnpm test -- server/services/signalEngine.test.ts
```

## Performance Tips

1. **Reduce symbols**: Fewer stocks = faster processing
2. **Increase interval**: 5-10 minutes instead of 2 minutes
3. **Filter by market cap**: Only monitor high-volume stocks
4. **Cache news**: Store recent articles to avoid re-processing

## Security

- Never commit API keys to Git - use environment variables
- Use HTTPS for all API calls (already configured)
- Rotate API keys periodically
- Monitor API usage for abuse
- Use private GitHub repo to protect configuration

## Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| Finnhub API | Free | 60 calls/minute |
| MarketAux API | Free | 100 requests/day |
| ntfy.sh | Free | Unlimited notifications |
| GitHub Actions | Free | 2,000 minutes/month |
| Database | Free | Manus free tier |
| **Total** | **$0/month** | Completely free |

## Roadmap

- [ ] Add more data sources (RSS feeds, SEC EDGAR, earnings transcripts)
- [ ] Implement machine learning for signal accuracy improvement
- [ ] Add portfolio tracking and performance metrics
- [ ] Support for multiple notification channels (SMS, email, Slack)
- [ ] Advanced filtering (market cap, sector, volatility)
- [ ] Historical signal backtesting

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is for personal use only. Ensure you comply with the terms of service for all APIs used.

## Support

For issues or questions:

- Check the [DEPLOYMENT.md](./DEPLOYMENT.md) guide
- Review API documentation:
  - Finnhub: https://finnhub.io/docs/api
  - MarketAux: https://www.marketaux.com/docs
  - ntfy.sh: https://ntfy.sh/docs

## Disclaimer

This tool is for educational and personal use only. It does not provide financial advice. Always do your own research before making investment decisions. Past performance does not guarantee future results.

---

**Made with ❤️ for real-time market analysis**
