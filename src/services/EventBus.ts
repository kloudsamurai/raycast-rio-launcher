/**
 * Global event bus for component communication
 */

/* eslint-disable max-classes-per-file */

import { EventEmitter } from "events";
import { BaseService, type ServiceOptions } from "./base/BaseService";

// Type imports
import type { RioConfig, RioProcess, RioSession, RioProfile, RioTheme } from "../types/rio";
import type { ConfigDiff, ValidationError, InstallationProgress, InstallationResult } from "../types/services";

// Event type definitions
export interface IEventMap {
  // Rio process events
  "rio:launched": { process: RioProcess };
  "rio:terminated": { pid: number; exitCode?: number };
  "rio:error": { error: Error; context?: unknown };

  // Configuration events
  "config:changed": { config: RioConfig; changes: ConfigDiff[] };
  "config:saved": { path: string };
  "config:validated": { valid: boolean; errors?: ValidationError[] };

  // Session events
  "session:created": { session: RioSession };
  "session:restored": { session: RioSession };
  "session:deleted": { sessionId: string };
  "session:recording:started": { sessionId: string };
  "session:recording:stopped": { sessionId: string };

  // Profile events
  "profile:selected": { profile: RioProfile };
  "profile:created": { profile: RioProfile };
  "profile:updated": { profile: RioProfile };
  "profile:deleted": { profileId: string };

  // Theme events
  "theme:changed": { theme: RioTheme };
  "theme:preview": { theme: RioTheme };

  // Dependency events
  "dependency:checking": { dependency: string };
  "dependency:installing": { dependency: string; progress: InstallationProgress };
  "dependency:installed": { dependency: string; result: InstallationResult };
  "dependency:failed": { dependency: string; error: Error };

  // UI events
  "ui:loading": { component: string; loading: boolean };
  "ui:error": { component: string; error: Error };
  "ui:toast": { message: string; type: "success" | "error" | "info" };
  "ui:navigation": { from: string; to: string };

  // Performance events
  "performance:metric": { name: string; value: number; tags?: Record<string, string> };
  "performance:slow": { operation: string; duration: number };

  // Feature events
  "feature:enabled": { feature: string };
  "feature:disabled": { feature: string };
  "feature:detected": { features: string[] };

  // Cache events
  "cache:hit": { key: string };
  "cache:miss": { key: string };
  "cache:evicted": { key: string; reason: string };

  // Network events
  "network:request": { url: string; method: string };
  "network:response": { url: string; status: number; duration: number };
  "network:error": { url: string; error: Error };
}

// Extend IEventMap to allow custom events
export type EventMap = IEventMap & Record<`custom:${string}`, unknown>;

// Typed event emitter
export interface ITypedEventEmitter<T extends Record<string, unknown>> {
  on: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => this;
  once: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => this;
  off: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => this;
  emit: <K extends keyof T>(event: K, data: T[K]) => boolean;
  listenerCount: <K extends keyof T>(event: K) => number;
  removeAllListeners: <K extends keyof T>(event?: K) => this;
}

class EventBusImpl extends EventEmitter implements ITypedEventEmitter<EventMap> {
  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event, listener);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event, data);
  }

  listenerCount<K extends keyof EventMap>(event: K): number {
    return super.listenerCount(event);
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): this {
    return super.removeAllListeners(event);
  }
}

// Constants
const DEFAULT_MAX_HISTORY_SIZE = 1000;
const DEFAULT_MAX_LISTENERS = 100;

export class EventBusService extends BaseService {
  private readonly maxHistorySize: number = DEFAULT_MAX_HISTORY_SIZE;
  private readonly eventBus: EventBusImpl;
  private eventHistory: { event: string; data: unknown; timestamp: Date }[] = [];

  constructor(options?: ServiceOptions) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super("EventBus", options);
    this.eventBus = new EventBusImpl();

    // Set max listeners to prevent warnings
    this.eventBus.setMaxListeners(DEFAULT_MAX_LISTENERS);
  }

  protected async onInitialize(): Promise<void> {
    // Setup event interceptors for logging and telemetry
    const originalEmit = this.eventBus.emit.bind(this.eventBus);

    this.eventBus.emit = <K extends keyof EventMap>(event: K, data: EventMap[K]): boolean => {
      // Log event
      this.log("debug", `Event emitted: ${String(event)}`, data);

      // Track in history
      this.addToHistory(String(event), data);

      // Track performance events
      if (String(event).startsWith("performance:")) {
        this.trackPerformanceEvent(String(event), data).catch((error: unknown) => {
          this.log("error", "Failed to track performance event", error);
        });
      }

      // Track error events
      if (String(event).includes("error")) {
        this.trackErrorEvent(String(event), data).catch((error: unknown) => {
          this.log("error", "Failed to track error event", error);
        });
      }

      // Call original emit
      return originalEmit(event, data);
    };
  }

  protected async onCleanup(): Promise<void> {
    this.eventBus.removeAllListeners();
    this.eventHistory = [];
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): () => void {
    this.eventBus.on(event, listener);

    // Return unsubscribe function
    return () => {
      this.eventBus.off(event, listener);
    };
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): void {
    this.eventBus.once(event, listener);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): void {
    this.eventBus.off(event, listener);
  }

  /**
   * Emit an event
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.eventBus.emit(event, data);
  }

  /**
   * Wait for an event
   */
  async waitFor<K extends keyof EventMap>(event: K, timeout?: number): Promise<EventMap[K]> {
    return new Promise((resolve: (value: EventMap[K]) => void, reject: (reason?: Error) => void) => {
      const timer =
        timeout !== undefined && timeout > 0
          ? setTimeout(() => {
              this.eventBus.off(event, handler);
              reject(new Error(`Timeout waiting for event: ${String(event)}`));
            }, timeout)
          : undefined;

      const handler = (data: EventMap[K]): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(data);
      };

      this.eventBus.once(event, handler);
    });
  }

  /**
   * Get event listener count
   */
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.eventBus.listenerCount(event);
  }

  /**
   * Get event history
   */
  getHistory(filter?: {
    event?: string;
    since?: Date;
    limit?: number;
  }): { event: string; data: unknown; timestamp: Date }[] {
    let history = [...this.eventHistory];

    if (filter?.event !== undefined && filter.event !== "") {
      history = history.filter(
        (item: { event: string; data: unknown; timestamp: Date }) => item.event === filter.event,
      );
    }

    if (filter?.since !== undefined) {
      history = history.filter(
        (item: { event: string; data: unknown; timestamp: Date }) => item.timestamp >= filter.since,
      );
    }

    if (filter?.limit !== undefined && filter.limit > 0) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Create a scoped event emitter
   */
  createScope(prefix: string): ScopedEventBus {
    return new ScopedEventBus(this, prefix);
  }

  private addToHistory(event: string, data: unknown): void {
    this.eventHistory.push({
      event,
      data,
      timestamp: new Date(),
    });

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private async trackPerformanceEvent(event: string, data: unknown): Promise<void> {
    if (event !== "performance:metric") {
      return;
    }

    if (data === null || data === undefined || typeof data !== "object") {
      return;
    }

    const performanceData = data as Record<string, unknown>;
    if (!("name" in performanceData) || !("value" in performanceData)) {
      return;
    }

    const { name, value } = performanceData;
    if (typeof name !== "string" || typeof value !== "number") {
      return;
    }

    await this.trackPerformance(name, value);
  }

  private async trackErrorEvent(event: string, data: unknown): Promise<void> {
    if (
      data !== null &&
      data !== undefined &&
      typeof data === "object" &&
      "error" in data &&
      data.error instanceof Error
    ) {
      const errorData = data as { error: Error; context?: unknown };
      await this.trackEvent("error", {
        event,
        error: errorData.error.message,
        stack: errorData.error.stack,
        context: errorData.context,
      });
    }
  }
}

/**
 * Scoped event bus for component-specific events
 */
export class ScopedEventBus {
  constructor(
    private readonly parent: EventBusService,
    private readonly prefix: string,
  ) {}

  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): () => void {
    const scopedEvent = `${this.prefix}:${String(event)}` as K;
    return this.parent.on(scopedEvent, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): void {
    const scopedEvent = `${this.prefix}:${String(event)}` as K;
    this.parent.once(scopedEvent, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): void {
    const scopedEvent = `${this.prefix}:${String(event)}` as K;
    this.parent.off(scopedEvent, listener);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const scopedEvent = `${this.prefix}:${String(event)}` as K;
    this.parent.emit(scopedEvent, data);
  }

  async waitFor<K extends keyof EventMap>(event: K, timeout?: number): Promise<EventMap[K]> {
    const scopedEvent = `${this.prefix}:${String(event)}` as K;
    return this.parent.waitFor(scopedEvent, timeout);
  }
}

// Singleton instance
let eventBusInstance: EventBusService | null = null;

export function getEventBus(): EventBusService {
  eventBusInstance ??= new EventBusService();
  return eventBusInstance;
}

// React hook for using event bus
export function useEventBus(): {
  on: <K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) => () => void;
  once: <K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) => void;
  off: <K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) => void;
  emit: <K extends keyof EventMap>(event: K, data: EventMap[K]) => void;
  waitFor: <K extends keyof EventMap>(event: K, timeout?: number) => Promise<EventMap[K]>;
} {
  const eventBus = getEventBus();

  return {
    on: eventBus.on.bind(eventBus),
    once: eventBus.once.bind(eventBus),
    off: eventBus.off.bind(eventBus),
    emit: eventBus.emit.bind(eventBus),
    waitFor: eventBus.waitFor.bind(eventBus),
  };
}
