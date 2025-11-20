import axios, { AxiosInstance } from "axios";

/**
 * ntfy.sh Notification Service Client
 * Sends push notifications to user's device with minimal latency
 */

export interface NtfyNotification {
  title: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "max";
  tags?: string[];
  click?: string; // URL to open on click
  icon?: string; // Icon URL
  actions?: Array<{
    action: string;
    label: string;
    clear?: boolean;
  }>;
}

export class NtfyClient {
  private client: AxiosInstance;
  private baseUrl = "https://ntfy.sh";
  private topic: string;

  constructor(topic: string) {
    this.topic = topic;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * Send a notification
   */
  async sendNotification(notification: NtfyNotification): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };

      // Add title if provided
      if (notification.title) {
        headers["X-Title"] = notification.title;
      }

      // Add priority if provided
      if (notification.priority) {
        headers["X-Priority"] = notification.priority;
      }

      // Add tags if provided
      if (notification.tags && notification.tags.length > 0) {
        headers["X-Tags"] = notification.tags.join(",");
      }

      // Add click URL if provided
      if (notification.click) {
        headers["X-Click"] = notification.click;
      }

      // Add icon if provided
      if (notification.icon) {
        headers["X-Icon"] = notification.icon;
      }

      // Add actions if provided
      if (notification.actions && notification.actions.length > 0) {
        headers["X-Actions"] = notification.actions
          .map(a => `${a.action}, ${a.label}${a.clear ? ", clear=true" : ""}`)
          .join(";");
      }

      const response = await this.client.put(
        `/${this.topic}`,
        notification.message,
        { headers }
      );

      return response.status === 200;
    } catch (error) {
      console.error("[ntfy] Error sending notification:", error);
      return false;
    }
  }

  /**
   * Send a stock signal notification
   */
  async sendStockSignal(
    symbol: string,
    signalType: "BUY" | "SELL" | "HOLD",
    confidence: number,
    reasoning: string,
    price?: number
  ): Promise<boolean> {
    const priorityMap: Record<string, "min" | "low" | "default" | "high" | "max"> = {
      BUY: confidence > 0.8 ? "high" : "default",
      SELL: confidence > 0.8 ? "high" : "default",
      HOLD: "low",
    };

    const emoji = {
      BUY: "📈",
      SELL: "📉",
      HOLD: "➡️",
    };

    const title = `${emoji[signalType]} ${signalType} Signal: ${symbol}`;
    const message = `
Confidence: ${(confidence * 100).toFixed(0)}%
${price ? `Price: $${price.toFixed(2)}\n` : ""}
Reasoning: ${reasoning}
`.trim();

    return this.sendNotification({
      title,
      message,
      priority: priorityMap[signalType],
      tags: [signalType.toLowerCase(), "stock", symbol.toLowerCase()],
      click: `https://www.google.com/search?q=${symbol}+stock`,
    });
  }

  /**
   * Send a news alert notification
   */
  async sendNewsAlert(
    symbol: string,
    headline: string,
    sentiment: number,
    source: string
  ): Promise<boolean> {
    const sentimentEmoji = sentiment > 0.5 ? "📈" : sentiment < -0.5 ? "📉" : "📰";
    const sentimentLabel = sentiment > 0.5 ? "Positive" : sentiment < -0.5 ? "Negative" : "Neutral";

    const title = `${sentimentEmoji} News: ${symbol}`;
    const message = `
${headline}

Sentiment: ${sentimentLabel} (${(sentiment * 100).toFixed(0)}%)
Source: ${source}
`.trim();

    return this.sendNotification({
      title,
      message,
      priority: Math.abs(sentiment) > 0.7 ? "high" : "default",
      tags: [
        sentiment > 0 ? "positive" : sentiment < 0 ? "negative" : "neutral",
        "news",
        symbol.toLowerCase(),
      ],
    });
  }

  /**
   * Send a system alert
   */
  async sendSystemAlert(title: string, message: string, severity: "info" | "warning" | "error" = "info"): Promise<boolean> {
    const priorityMap = {
      info: "default" as const,
      warning: "high" as const,
      error: "max" as const,
    };

    const emojiMap = {
      info: "ℹ️",
      warning: "⚠️",
      error: "❌",
    };

    return this.sendNotification({
      title: `${emojiMap[severity]} ${title}`,
      message,
      priority: priorityMap[severity],
      tags: [severity, "system"],
    });
  }

  /**
   * Change the topic
   */
  setTopic(topic: string): void {
    this.topic = topic;
  }

  /**
   * Get current topic
   */
  getTopic(): string {
    return this.topic;
  }
}

/**
 * Create a singleton ntfy client
 */
let ntfyClient: NtfyClient | null = null;

export function getNtfyClient(topic: string): NtfyClient {
  if (!ntfyClient) {
    ntfyClient = new NtfyClient(topic);
  } else {
    ntfyClient.setTopic(topic);
  }
  return ntfyClient;
}
