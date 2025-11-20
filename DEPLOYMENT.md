# Stock Signal Bot - Deployment Guide

## Overview

This guide explains how to set up and deploy the Stock Signal Bot for continuous, real-time monitoring of stock market signals with minimal latency.

---

## Prerequisites

- **Node.js 18+** installed
- **Git** for version control
- **GitHub account** (for Actions-based scheduling)
- API keys for:
  - Finnhub (free at https://finnhub.io/register)
  - MarketAux (free at https://www.marketaux.com/)
  - ntfy.sh topic (free, no registration needed)

---

## Step 1: Get API Keys

### Finnhub API Key
1. Visit https://finnhub.io/register
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Free tier: 60 API calls/minute, real-time news

### MarketAux API Key
1. Visit https://www.marketaux.com/
2. Click "GET FREE API KEY"
3. Sign up and copy your API key
4. Free tier: 100 requests/day, sentiment analysis

### ntfy.sh Topic
1. No registration needed
2. Choose any topic name (e.g., `stock-signals-YOUR_USERNAME`)
3. Download the ntfy app on your phone:
   - **Android**: https://play.google.com/store/apps/details?id=io.ntfy.android
   - **iOS**: Use web app at https://ntfy.sh or webhooks

---

## Step 2: Local Setup

### Clone and Install

```bash
cd /path/to/stock_signal_bot
pnpm install
```

### Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# API Keys
FINNHUB_API_KEY=your_finnhub_key_here
MARKETAUX_API_KEY=your_marketaux_key_here
NTFY_TOPIC=stock-signals-your-username

# Database (already configured for you)
DATABASE_URL=mysql://user:password@host/database

# App Configuration
VITE_APP_TITLE=Stock Signal Bot
VITE_APP_LOGO=https://example.com/logo.png
```

### Test the Ingestion Service

```bash
# Test with default symbols (AAPL, MSFT, GOOGL, TSLA, AMZN)
node server/ingestion.mjs

# Test with custom symbols
node server/ingestion.mjs --symbols AAPL,MSFT,NVDA
```

You should see output like:
```
[Ingestion] Processing AAPL...
[Ingestion] AAPL: Finnhub=5, MarketAux=3
[Ingestion] Signal generated for AAPL: BUY
[Ingestion] Notification sent for AAPL: BUY
```

Check your ntfy app for the notification!

---

## Step 3: Deployment Options

### Option A: GitHub Actions (Recommended for Free Tier)

GitHub Actions allows you to run scheduled jobs for free.

#### Setup:

1. Push your code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/stock_signal_bot.git
git push -u origin main
```

2. Create `.github/workflows/ingestion.yml`:

```yaml
name: Stock Signal Ingestion

on:
  schedule:
    # Run every 2 minutes
    - cron: '*/2 * * * *'
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run ingestion
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          MARKETAUX_API_KEY: ${{ secrets.MARKETAUX_API_KEY }}
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: node server/ingestion.mjs --symbols AAPL,MSFT,GOOGL,TSLA,AMZN
```

3. Add secrets to GitHub:
   - Go to Settings → Secrets and variables → Actions
   - Add: `FINNHUB_API_KEY`, `MARKETAUX_API_KEY`, `NTFY_TOPIC`, `DATABASE_URL`

4. Enable workflows:
   - Go to Actions tab
   - Click "I understand my workflows, go ahead and enable them"

**Advantages:**
- Completely free
- No server to maintain
- Automatic retries on failure
- Easy to monitor via GitHub UI

**Limitations:**
- GitHub Actions has a 5-minute minimum interval (can use 2-minute via workflow_dispatch)
- May experience slight delays during peak hours

---

### Option B: Heroku (Free Tier Deprecated)

Heroku's free tier is no longer available, but you can use paid dynos ($7/month).

---

### Option C: Self-Hosted (VPS)

If you have a VPS or home server:

```bash
# Install PM2 for process management
npm install -g pm2

# Start the scheduler
pm2 start server/scheduler.mjs --name "stock-signal-bot" -- --interval 120 --symbols AAPL,MSFT,GOOGL,TSLA,AMZN

# Save PM2 config
pm2 save

# Enable startup on reboot
pm2 startup
```

---

## Step 4: Monitor and Maintain

### Check Notification History

Visit https://ntfy.sh/YOUR_TOPIC to see all notifications.

### View Signals in Database

The web dashboard (at https://3000-your-domain.manus.space) will show:
- Recent signals generated
- Alert history
- API usage statistics
- Watched stocks

### Adjust Parameters

Edit `server/services/signalEngine.ts` to tune:
- `minConfidenceThreshold` - Minimum confidence to generate signal (default: 0.6)
- `minSourcesRequired` - Minimum sources for corroboration (default: 2)
- `deduplicationWindow` - Time window to prevent duplicate alerts (default: 1 hour)

### Add/Remove Stocks

Modify the symbols list in your deployment:

**GitHub Actions:**
```yaml
run: node server/ingestion.mjs --symbols AAPL,MSFT,NVDA,TSLA,AMD
```

**Self-hosted:**
```bash
pm2 restart stock-signal-bot -- --symbols AAPL,MSFT,NVDA,TSLA,AMD
```

---

## Troubleshooting

### No Notifications Received

1. **Check ntfy topic**: Visit https://ntfy.sh/YOUR_TOPIC
2. **Verify API keys**: Ensure all keys are correct in environment variables
3. **Check logs**: 
   - GitHub Actions: View in Actions tab
   - Self-hosted: `pm2 logs stock-signal-bot`

### Rate Limit Errors

- Finnhub: 60 calls/minute (free tier) - reduce number of symbols or increase interval
- MarketAux: 100 requests/day (free tier) - reduce symbols or increase interval

### Database Connection Issues

Ensure `DATABASE_URL` is correct and database is accessible.

---

## Performance Optimization

### Latency Targets

- **Data fetch**: ~2 seconds (Finnhub + MarketAux)
- **Processing**: ~1 second (sentiment analysis, signal generation)
- **Notification**: ~1 second (ntfy.sh)
- **Total**: ~4 seconds from news discovery to notification

### Optimization Tips

1. **Reduce symbols**: Fewer symbols = faster processing
2. **Increase interval**: 5-10 minutes instead of 2 minutes for lower latency
3. **Filter by market cap**: Only monitor high-volume stocks
4. **Cache news**: Store recent articles to avoid re-processing

---

## Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| **Finnhub API** | Free | 60 calls/minute, real-time news |
| **MarketAux API** | Free | 100 requests/day, sentiment analysis |
| **ntfy.sh** | Free | Unlimited notifications |
| **GitHub Actions** | Free | 2,000 minutes/month included |
| **Database** | Free/Paid | Manus provides free tier |
| **Total** | **$0/month** | Completely free for personal use |

---

## Next Steps

1. **Test locally** with `node server/ingestion.mjs`
2. **Deploy to GitHub Actions** for continuous monitoring
3. **Monitor signals** via ntfy app and web dashboard
4. **Tune parameters** based on signal accuracy
5. **Add more data sources** (RSS feeds, SEC filings, earnings transcripts)

---

## Support

For issues or questions:
- Check logs: GitHub Actions or PM2
- Review database: Web dashboard
- Test API keys: Use curl to test endpoints directly
- Consult documentation: Finnhub, MarketAux, ntfy.sh

---

## Security Notes

- **Never commit API keys** to Git - use environment variables
- **Use HTTPS** for all API calls (already configured)
- **Rotate API keys** periodically
- **Monitor API usage** to detect abuse
- **Use private GitHub repo** to protect configuration

---

## License

This project is for personal use only. Ensure you comply with the terms of service for all APIs used.
