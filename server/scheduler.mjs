#!/usr/bin/env node

/**
 * Stock Signal Bot Scheduler
 * Runs the ingestion service at regular intervals
 * 
 * Usage:
 *   node server/scheduler.mjs --interval 1800 --symbols AAPL,MSFT,NVDA
 * 
 * Environment variables:
 *   Selected ingestion reads local .dev.vars then legacy .env; process env wins.
 *   NTFY_TOPIC - ntfy topic for notifications (not required with DRY_RUN=1)
 *   DRY_RUN - "1" to score without publishing
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
let interval = 1800; // 30 minutes; feeds are keyless, this just keeps us polite to Google/Yahoo
let symbols = ['AAPL', 'MSFT', 'NVDA'];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--interval') {
    interval = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--symbols') {
    symbols = args[i + 1].split(',').map(s => s.trim().toUpperCase());
    i++;
  }
}

console.log(`[Scheduler] Starting Stock Signal Bot Scheduler`);
console.log(`[Scheduler] Interval: ${interval} seconds`);
console.log(`[Scheduler] Symbols: ${symbols.join(', ')}`);
console.log(`[Scheduler] First run starts immediately...`);

/**
 * Run the ingestion service
 */
async function runIngestion() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'ingestion.mjs'),
      '--symbols', symbols.join(','),
    ], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });

    child.on('error', (error) => {
      console.error('[Scheduler] Error running ingestion:', error);
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[Scheduler] Ingestion completed successfully');
        resolve(code);
      } else {
        console.error(`[Scheduler] Ingestion failed with code ${code}`);
        reject(new Error(`Ingestion exited with code ${code}`));
      }
    });
  });
}

/**
 * Main scheduler loop
 */
async function main() {
  // Run immediately on startup
  try {
    await runIngestion();
  } catch (error) {
    console.error('[Scheduler] Initial ingestion failed:', error);
  }

  // Schedule recurring runs
  setInterval(async () => {
    console.log(`[Scheduler] Running ingestion cycle at ${new Date().toISOString()}`);
    try {
      await runIngestion();
    } catch (error) {
      console.error('[Scheduler] Ingestion cycle failed:', error);
    }
  }, interval * 1000);

  console.log(`[Scheduler] Scheduler is running. Next cycle in ${interval} seconds.`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Scheduler] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Scheduler] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the scheduler
main().catch((error) => {
  console.error('[Scheduler] Fatal error:', error);
  process.exit(1);
});
