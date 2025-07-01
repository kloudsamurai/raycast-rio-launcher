/**
 * Telemetry service for tracking usage and performance metrics
 */

import { LocalStorage, environment } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { ITelemetryService } from "../types/services";
import { getEventBus } from "./EventBus";
import { randomUUID } from "crypto";
import { isDefinedString, isDefinedObject, isDefined, isValidNumber, getErrorCode } from "../utils/type-guards";

const TELEMETRY_STORAGE_KEY = "rio-telemetry-events";
const SESSION_STORAGE_KEY = "rio-telemetry-session";
const TELEMETRY_ENABLED_KEY = "rio-telemetry-enabled";
const MAX_STORED_EVENTS = 1000;
const BATCH_SIZE = 50;
// eslint-disable-next-line no-magic-numbers
const MINUTES_IN_MS = 5 * 60 * 1000;
const FLUSH_INTERVAL_MS = MINUTES_IN_MS; // 5 minutes
const AVERAGE_DIVISOR = 2;

// Define telemetry types since they're not in ../types/services
export interface ITelemetryEvent {
  id: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface ITelemetryMetric {
  name: string;
  value: number;
  unit?: string;
  timestamp: string;
}

export interface ITelemetryContext {
  raycastVersion: string;
  extensionName: string;
  commandName: string;
  isDevelopment: boolean;
  os: {
    platform: string;
    arch: string;
    version: string;
  };
  timestamp: string;
}

interface IStoredEvent extends ITelemetryEvent {
  timestamp: string;
  sessionId: string;
  context: ITelemetryContext;
}

export class TelemetryService extends BaseService implements ITelemetryService {
  private readonly sessionId: string;
  private readonly context: ITelemetryContext;
  private events: IStoredEvent[] = [];
  private readonly metrics: Map<string, ITelemetryMetric> = new Map();
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private isEnabled: boolean = true;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(options?: IServiceOptions) {
    super("TelemetryService", options);
    this.sessionId = randomUUID();
    this.context = this.buildContext();
  }

  protected async onInitialize(): Promise<void> {
    try {
      // Load telemetry preference
      const enabled: unknown = await LocalStorage.getItem(TELEMETRY_ENABLED_KEY);
      this.isEnabled = enabled !== false;

      // Load stored events
      await this.loadStoredEvents();

      // Set up event listeners
      this.setupEventListeners();

      // Start session
      await this.startSession();

      // Schedule periodic flush
      this.scheduleFlush();
    } catch (error: unknown) {
      this.log("error", "Failed to initialize telemetry", error);
      // Continue with telemetry disabled
      this.isEnabled = false;
    }
  }

  protected async onCleanup(): Promise<void> {
    // Flush remaining events
    if (isDefined(this.flushTimer)) {
      clearInterval(this.flushTimer);
    }

    await this.flush();
    await this.endSession();

    this.events = [];
    this.metrics.clear();
  }

  /**
   * Track an event
   */
  async trackEvent(name: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const eventProperties: Record<string, unknown> = properties ?? {};
    const event: IStoredEvent = {
      id: randomUUID(),
      name,
      properties: eventProperties,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      context: this.context,
    };

    this.events.push(event);
    this.log("debug", `Event tracked: ${name}`, properties);

    // Emit to event bus for real-time processing
    this.eventBus.emit("telemetry:event", { event });
    // Event emitted successfully

    // Check if we should flush
    if (this.events.length >= BATCH_SIZE) {
      await this.flush();
    }
  }

  /**
   * Track a metric
   */
  async trackMetric(name: string, value: number, unit?: string): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const metric: ITelemetryMetric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
    };

    // Update aggregated metrics
    const existing: ITelemetryMetric | undefined = this.metrics.get(name);
    if (isDefined(existing)) {
      existing.value = (existing.value + value) / AVERAGE_DIVISOR; // Simple average
      existing.timestamp = metric.timestamp;
    } else {
      this.metrics.set(name, metric);
    }

    this.log("debug", `Metric tracked: ${name}`, { value, unit });

    // Track as event for persistence
    await this.trackEvent("metric", { name, value, unit });
  }

  /**
   * Get events
   */
  async getEvents(filter?: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<ITelemetryEvent[]> {
    let filtered = [...this.events];

    if (isDefinedString(filter?.name)) {
      filtered = filtered.filter((e: IStoredEvent) => e.name === filter.name);
    }

    if (isDefinedObject(filter?.startDate)) {
      const start = filter.startDate.toISOString();
      filtered = filtered.filter((e: IStoredEvent) => e.timestamp >= start);
    }

    if (isDefinedObject(filter?.endDate)) {
      const end = filter.endDate.toISOString();
      filtered = filtered.filter((e: IStoredEvent) => e.timestamp <= end);
    }

    if (isValidNumber(filter?.limit)) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * Get metrics
   */
  async getMetrics(): Promise<ITelemetryMetric[]> {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear telemetry data
   */
  async clearData(): Promise<void> {
    this.events = [];
    this.metrics.clear();
    await LocalStorage.removeItem(TELEMETRY_STORAGE_KEY);
    this.log("info", "Telemetry data cleared");
  }

  /**
   * Set telemetry enabled/disabled
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    await LocalStorage.setItem(TELEMETRY_ENABLED_KEY, enabled);

    if (!enabled) {
      await this.clearData();
    }

    this.log("info", `Telemetry ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Export telemetry data
   */
  async exportData(): Promise<string> {
    const data: Record<string, unknown> = {
      sessionId: this.sessionId,
      context: this.context,
      events: this.events,
      metrics: Array.from(this.metrics.values()),
      exported: new Date().toISOString(),
    };

    const jsonIndentSpaces = 2;
    return JSON.stringify(data, null, jsonIndentSpaces);
  }

  /**
   * Flush events
   */
  async flush(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    try {
      // Store events locally
      await this.storeEvents();

      // In production, would send to telemetry endpoint
      if (environment.isDevelopment) {
        this.log("debug", `Flushed ${this.events.length} events`);
      }

      // Clear flushed events
      this.events = [];
    } catch (error: unknown) {
      this.log("error", "Failed to flush telemetry", error);
    }
  }

  /**
   * Private helper methods
   */

  private buildContext(): ITelemetryContext {
    return {
      raycastVersion: environment.raycastVersion,
      extensionName: environment.extensionName,
      commandName: environment.commandName,
      isDevelopment: environment.isDevelopment,
      os: {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private setupEventListeners(): void {
    // Track command executions
    this.eventBus.on(
      "rio:launched",
      ({ process }: { process: { pid: number; workingDirectory: string; profile: string } }) => {
        (async (): Promise<void> => {
          await this.trackEvent("rio_launched", {
            pid: process.pid,
            workingDirectory: process.workingDirectory,
            profile: process.profile,
          });
        })().catch((error: unknown) => {
          this.log("error", "Failed to track rio_launched event", error);
        });
      },
    );

    // Track configuration changes
    this.eventBus.on("config:changed", ({ changes }: { config: unknown; changes: { path: string }[] }) => {
      (async (): Promise<void> => {
        await this.trackEvent("config_changed", {
          changeCount: changes.length,
          paths: changes.map((c: { path: string }) => c.path),
        });
      })().catch((error: unknown) => {
        this.log("error", "Failed to track config_changed event", error);
      });
    });

    // Track errors
    this.eventBus.on("error:occurred", ({ error, service }: { error: unknown; service: string }) => {
      (async (): Promise<void> => {
        await this.trackEvent("error_occurred", {
          service,
          error: error instanceof Error ? error.message : "Unknown error",
          code: getErrorCode(error),
          recoverable: "recoverable" in (error as object) ? (error as { recoverable: unknown }).recoverable : false,
        });
      })().catch((err: unknown) => {
        this.log("error", "Failed to track error_occurred event", err);
      });
    });

    // Track performance
    this.eventBus.on("performance:measured", ({ operation, duration }: { operation: string; duration: number }) => {
      (async (): Promise<void> => {
        await this.trackMetric(`performance_${String(operation)}`, duration, "ms");
      })().catch((error: unknown) => {
        this.log("error", "Failed to track performance metric", error);
      });
    });
  }

  private async startSession(): Promise<void> {
    await LocalStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      id: this.sessionId,
      started: new Date().toISOString(),
    }));

    await this.trackEvent("session_started", {
      context: this.context,
    });
  }

  private async endSession(): Promise<void> {
    const sessionStr: string | undefined = await LocalStorage.getItem<string>(SESSION_STORAGE_KEY);
    if (isDefinedString(sessionStr)) {
      try {
        const session = JSON.parse(sessionStr) as { id: string; started: string };
        const duration = Date.now() - new Date(session.started).getTime();
        await this.trackEvent("session_ended", {
          duration,
          eventCount: this.events.length,
        });
      } catch {
        // Ignore parse errors
      }
    }

    await LocalStorage.removeItem(SESSION_STORAGE_KEY);
  }

  private async loadStoredEvents(): Promise<void> {
    try {
      const stored: string | undefined = await LocalStorage.getItem<string>(TELEMETRY_STORAGE_KEY);
      if (isDefinedString(stored)) {
        const events: IStoredEvent[] = JSON.parse(stored) as IStoredEvent[];
        this.events = events.slice(-MAX_STORED_EVENTS);
      }
    } catch (error: unknown) {
      this.log("error", "Failed to load stored events", error);
    }
  }

  private async storeEvents(): Promise<void> {
    const allEvents = [...this.events];
    const toStore = allEvents.slice(-MAX_STORED_EVENTS);
    await LocalStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(toStore));
  }

  private scheduleFlush(): void {
    // Flush every 5 minutes
    this.flushTimer = setInterval(() => {
      this.flush().catch((error: unknown) => {
        this.log("error", "Scheduled flush failed", error);
      });
    }, FLUSH_INTERVAL_MS);
  }
}
