import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stocks table - tracks stocks being monitored
 */
export const stocks = mysqlTable("stocks", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 100 }),
  industry: varchar("industry", { length: 100 }),
  marketCap: varchar("marketCap", { length: 50 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Stock = typeof stocks.$inferSelect;
export type InsertStock = typeof stocks.$inferInsert;

/**
 * News sources table - tracks legitimate news sources for corroboration
 */
export const newsSources = mysqlTable("newsSources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  url: varchar("url", { length: 500 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 'news', 'sec', 'earnings', 'analyst'
  reliabilityScore: decimal("reliabilityScore", { precision: 3, scale: 2 }).default("0.8"), // 0-1
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NewsSource = typeof newsSources.$inferSelect;
export type InsertNewsSource = typeof newsSources.$inferInsert;

/**
 * Raw news items table - stores news articles for analysis
 */
export const newsItems = mysqlTable("newsItems", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 255 }).notNull().unique(), // UUID from API
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"),
  url: varchar("url", { length: 500 }).notNull(),
  sourceId: int("sourceId").notNull(), // FK to newsSources
  publishedAt: timestamp("publishedAt").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  sentimentScore: decimal("sentimentScore", { precision: 3, scale: 2 }), // -1 to 1
  sentimentSource: varchar("sentimentSource", { length: 50 }), // 'marketaux', 'finnhub', 'manual'
  keywords: json("keywords"), // Array of extracted keywords
  entities: json("entities"), // Array of {symbol, name, sentiment}
  isProcessed: boolean("isProcessed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NewsItem = typeof newsItems.$inferSelect;
export type InsertNewsItem = typeof newsItems.$inferInsert;

/**
 * Signals table - detected trading signals from analysis
 */
export const signals = mysqlTable("signals", {
  id: int("id").autoincrement().primaryKey(),
  stockId: int("stockId").notNull(), // FK to stocks
  signalType: mysqlEnum("signalType", ["BUY", "SELL", "HOLD"]).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(), // 0-1
  sources: json("sources").notNull(), // Array of source IDs that contributed
  newsItemIds: json("newsItemIds"), // Array of news IDs that triggered signal
  reasoning: text("reasoning"), // Explanation of signal
  sentimentAverage: decimal("sentimentAverage", { precision: 3, scale: 2 }),
  priceAtSignal: decimal("priceAtSignal", { precision: 10, scale: 2 }),
  isAlerted: boolean("isAlerted").default(false).notNull(),
  alertSentAt: timestamp("alertSentAt"),
  isDuplicate: boolean("isDuplicate").default(false).notNull(),
  duplicateOfId: int("duplicateOfId"), // FK to signals (if duplicate)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

/**
 * Alerts table - tracks notifications sent to user
 */
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  signalId: int("signalId").notNull(), // FK to signals
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  priority: mysqlEnum("priority", ["min", "low", "default", "high", "max"]).default("default").notNull(),
  notificationService: varchar("notificationService", { length: 50 }).default("ntfy").notNull(),
  ntfyTopic: varchar("ntfyTopic", { length: 255 }), // Topic for ntfy.sh
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  delivered: boolean("delivered").default(true).notNull(),
  deliveryError: text("deliveryError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

/**
 * Signal history table - tracks signal performance over time
 */
export const signalHistory = mysqlTable("signalHistory", {
  id: int("id").autoincrement().primaryKey(),
  signalId: int("signalId").notNull(), // FK to signals
  stockSymbol: varchar("stockSymbol", { length: 10 }).notNull(),
  signalType: mysqlEnum("signalType", ["BUY", "SELL", "HOLD"]).notNull(),
  priceAtSignal: decimal("priceAtSignal", { precision: 10, scale: 2 }).notNull(),
  priceAfter1h: decimal("priceAfter1h", { precision: 10, scale: 2 }),
  priceAfter24h: decimal("priceAfter24h", { precision: 10, scale: 2 }),
  priceAfter7d: decimal("priceAfter7d", { precision: 10, scale: 2 }),
  returnPercent1h: decimal("returnPercent1h", { precision: 6, scale: 2 }),
  returnPercent24h: decimal("returnPercent24h", { precision: 6, scale: 2 }),
  returnPercent7d: decimal("returnPercent7d", { precision: 6, scale: 2 }),
  isAccurate: boolean("isAccurate"), // True if signal direction was correct
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SignalHistory = typeof signalHistory.$inferSelect;
export type InsertSignalHistory = typeof signalHistory.$inferInsert;

/**
 * API rate limit tracking table - prevents exceeding API quotas
 */
export const apiRateLimits = mysqlTable("apiRateLimits", {
  id: int("id").autoincrement().primaryKey(),
  apiName: varchar("apiName", { length: 50 }).notNull().unique(), // 'finnhub', 'marketaux'
  requestsToday: int("requestsToday").default(0).notNull(),
  requestsThisMinute: int("requestsThisMinute").default(0).notNull(),
  dailyLimit: int("dailyLimit").notNull(),
  minuteLimit: int("minuteLimit").notNull(),
  lastResetDay: timestamp("lastResetDay").defaultNow().notNull(),
  lastResetMinute: timestamp("lastResetMinute").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
export type InsertApiRateLimit = typeof apiRateLimits.$inferInsert;
