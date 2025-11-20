import { eq, and, desc, gte, lte, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  stocks,
  newsItems,
  signals,
  alerts,
  newsSources,
  apiRateLimits,
  signalHistory,
  Stock,
  NewsItem,
  Signal,
  Alert,
  NewsSource,
  ApiRateLimit,
  SignalHistory,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// USER FUNCTIONS
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// STOCK FUNCTIONS
// ============================================================================

export async function getOrCreateStock(symbol: string, name: string, sector?: string, industry?: string): Promise<Stock> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(stocks).where(eq(stocks.symbol, symbol)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(stocks).values({
    symbol,
    name,
    sector: sector || null,
    industry: industry || null,
    isActive: true,
  });

  const result = await db.select().from(stocks).where(eq(stocks.symbol, symbol)).limit(1);
  return result[0];
}

export async function getStockBySymbol(symbol: string): Promise<Stock | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(stocks).where(eq(stocks.symbol, symbol)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActiveStocks(): Promise<Stock[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(stocks).where(eq(stocks.isActive, true));
}

// ============================================================================
// NEWS SOURCE FUNCTIONS
// ============================================================================

export async function getOrCreateNewsSource(
  name: string,
  url: string,
  category: string,
  reliabilityScore?: number
): Promise<NewsSource> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(newsSources).where(eq(newsSources.name, name)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(newsSources).values({
    name,
    url,
    category,
    reliabilityScore: reliabilityScore?.toString() || "0.8",
    isActive: true,
  });

  const result = await db.select().from(newsSources).where(eq(newsSources.name, name)).limit(1);
  return result[0];
}

export async function getActiveSources(): Promise<NewsSource[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(newsSources).where(eq(newsSources.isActive, true));
}

// ============================================================================
// NEWS ITEM FUNCTIONS
// ============================================================================

export async function createNewsItem(item: {
  externalId: string;
  title: string;
  description?: string;
  content?: string;
  url: string;
  sourceId: number;
  publishedAt: Date;
  sentimentScore?: number;
  sentimentSource?: string;
  keywords?: string[];
  entities?: Array<{ symbol: string; name: string; sentiment?: number }>;
}): Promise<NewsItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(newsItems).values({
    externalId: item.externalId,
    title: item.title,
    description: item.description || null,
    content: item.content || null,
    url: item.url,
    sourceId: item.sourceId,
    publishedAt: item.publishedAt,
    sentimentScore: item.sentimentScore ? item.sentimentScore.toString() : null,
    sentimentSource: item.sentimentSource || null,
    keywords: item.keywords ? JSON.stringify(item.keywords) : null,
    entities: item.entities ? JSON.stringify(item.entities) : null,
    isProcessed: false,
  });

  const result = await db.select().from(newsItems).where(eq(newsItems.externalId, item.externalId)).limit(1);
  return result[0];
}

export async function getUnprocessedNewsItems(limit: number = 100): Promise<NewsItem[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(newsItems)
    .where(eq(newsItems.isProcessed, false))
    .orderBy(desc(newsItems.publishedAt))
    .limit(limit);
}

export async function markNewsItemProcessed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(newsItems).set({ isProcessed: true }).where(eq(newsItems.id, id));
}

export async function getNewsItemsByStock(stockId: number, hours: number = 24): Promise<NewsItem[]> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return db.select()
    .from(newsItems)
    .where(gte(newsItems.publishedAt, since))
    .orderBy(desc(newsItems.publishedAt));
}

// ============================================================================
// SIGNAL FUNCTIONS
// ============================================================================

export async function createSignal(signal: {
  stockId: number;
  signalType: "BUY" | "SELL" | "HOLD";
  confidence: number;
  sources: number[];
  newsItemIds?: number[];
  reasoning?: string;
  sentimentAverage?: number;
  priceAtSignal?: number;
}): Promise<Signal> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(signals).values({
    stockId: signal.stockId,
    signalType: signal.signalType,
    confidence: signal.confidence.toString(),
    sources: JSON.stringify(signal.sources),
    newsItemIds: signal.newsItemIds ? JSON.stringify(signal.newsItemIds) : null,
    reasoning: signal.reasoning || null,
    sentimentAverage: signal.sentimentAverage ? signal.sentimentAverage.toString() : null,
    priceAtSignal: signal.priceAtSignal ? signal.priceAtSignal.toString() : null,
    isAlerted: false,
    isDuplicate: false,
  });

  const result = await db.select().from(signals).orderBy(desc(signals.id)).limit(1);
  return result[0];
}

export async function getRecentSignals(hours: number = 1): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return db.select()
    .from(signals)
    .where(gte(signals.createdAt, since))
    .orderBy(desc(signals.createdAt));
}

export async function getUnalerredSignals(): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(signals)
    .where(and(eq(signals.isAlerted, false), eq(signals.isDuplicate, false)))
    .orderBy(desc(signals.createdAt));
}

export async function markSignalAlerted(id: number, alertId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(signals).set({ isAlerted: true, alertSentAt: new Date() }).where(eq(signals.id, id));
}

export async function markSignalAsDuplicate(id: number, duplicateOfId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(signals).set({ isDuplicate: true, duplicateOfId }).where(eq(signals.id, id));
}

// ============================================================================
// ALERT FUNCTIONS
// ============================================================================

export async function createAlert(alert: {
  signalId: number;
  title: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "max";
  ntfyTopic?: string;
}): Promise<Alert> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(alerts).values({
    signalId: alert.signalId,
    title: alert.title,
    message: alert.message,
    priority: alert.priority || "default",
    ntfyTopic: alert.ntfyTopic || null,
    delivered: true,
  });

  const result = await db.select().from(alerts).orderBy(desc(alerts.id)).limit(1);
  return result[0];
}

export async function getRecentAlerts(hours: number = 24): Promise<Alert[]> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return db.select()
    .from(alerts)
    .where(gte(alerts.sentAt, since))
    .orderBy(desc(alerts.sentAt));
}

// ============================================================================
// API RATE LIMIT FUNCTIONS
// ============================================================================

export async function getOrCreateRateLimit(
  apiName: string,
  dailyLimit: number,
  minuteLimit: number
): Promise<ApiRateLimit> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(apiRateLimits).where(eq(apiRateLimits.apiName, apiName)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(apiRateLimits).values({
    apiName,
    dailyLimit,
    minuteLimit,
    requestsToday: 0,
    requestsThisMinute: 0,
  });

  const result = await db.select().from(apiRateLimits).where(eq(apiRateLimits.apiName, apiName)).limit(1);
  return result[0];
}

export async function canMakeRequest(apiName: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const limit = await db.select().from(apiRateLimits).where(eq(apiRateLimits.apiName, apiName)).limit(1);
  if (limit.length === 0) return true;

  const current = limit[0];
  return current.requestsToday < current.dailyLimit && current.requestsThisMinute < current.minuteLimit;
}

export async function recordRequest(apiName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get current values
  const current = await db.select().from(apiRateLimits).where(eq(apiRateLimits.apiName, apiName)).limit(1);
  if (current.length === 0) return;

  // Increment counters
  await db.update(apiRateLimits)
    .set({
      requestsToday: current[0].requestsToday + 1,
      requestsThisMinute: current[0].requestsThisMinute + 1,
    })
    .where(eq(apiRateLimits.apiName, apiName));
}

// ============================================================================
// SIGNAL HISTORY FUNCTIONS
// ============================================================================

export async function createSignalHistory(history: {
  signalId: number;
  stockSymbol: string;
  signalType: "BUY" | "SELL" | "HOLD";
  priceAtSignal: number;
}): Promise<SignalHistory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(signalHistory).values({
    signalId: history.signalId,
    stockSymbol: history.stockSymbol,
    signalType: history.signalType,
    priceAtSignal: history.priceAtSignal.toString(),
  });

  const result = await db.select().from(signalHistory).orderBy(desc(signalHistory.id)).limit(1);
  return result[0];
}
