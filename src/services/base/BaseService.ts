/**
 * Base service class implementing common functionality
 */

import { showToast, Toast } from "@raycast/api";
import { EventEmitter } from "events";
import { RioLauncherError, ValidationError } from "../../types/errors";
import type { ITelemetryService } from "../../types/services";
import { NoOpTelemetryService } from "./NoOpTelemetryService";
import { isDefinedObject } from "../../utils/type-guards";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_DELAY,
  DEFAULT_MAX_DELAY,
  DEFAULT_BACKOFF_FACTOR,
} from "./BaseServiceConstants";

export interface IServiceOptions {
  telemetry?: ITelemetryService;
  debug?: boolean;
}

export abstract class BaseService extends EventEmitter {
  protected initialized: boolean = false;
  protected initializing: boolean = false;
  protected telemetry: ITelemetryService;
  protected debug: boolean = false;
  protected serviceName: string;

  constructor(serviceName: string, options?: IServiceOptions) {
    super();
    this.serviceName = serviceName;
    this.telemetry = options?.telemetry ?? new NoOpTelemetryService();
    this.debug = options?.debug ?? false;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve();
    }

    if (this.initializing) {
      // Wait for initialization to complete
      return new Promise((resolve: () => void) => {
        this.once("initialized", resolve);
      });
    }

    return this.performInitialization();
  }

  /**
   * Perform the actual initialization logic
   */
  private async performInitialization(): Promise<void> {
    this.initializing = true;

    try {
      this.log("info", `Initializing ${this.serviceName}...`);
      await this.onInitialize();
      this.initialized = true;
      this.emit("initialized");
      this.log("info", `${this.serviceName} initialized successfully`);
    } catch (error) {
      this.log("error", `Failed to initialize ${this.serviceName}`, error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Cleanup the service
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.log("info", `Cleaning up ${this.serviceName}...`);
      await this.onCleanup();
      this.initialized = false;
      this.removeAllListeners();
      this.log("info", `${this.serviceName} cleaned up successfully`);
    } catch (error) {
      this.log("error", `Failed to cleanup ${this.serviceName}`, error);
      throw error;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the service is initialized before proceeding
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized && !this.initializing) {
      await this.initialize();
    } else if (this.initializing) {
      await new Promise((resolve: () => void) => {
        this.once("initialized", resolve);
      });
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract onInitialize(): Promise<void>;
  protected abstract onCleanup(): Promise<void>;

  /**
   * Error handling
   */
  protected async handleError(error: unknown, userMessage?: string): Promise<void> {
    const rioError = this.normalizeError(error);

    // Log the error
    this.log("error", rioError.message, rioError);

    // Track in telemetry if enabled
    if (this.telemetry.isEnabled()) {
      await this.telemetry.trackError(rioError, {
        service: this.serviceName,
        ...rioError.context,
      });
    }

    // Show user-friendly toast
    await showToast({
      style: Toast.Style.Failure,
      title: userMessage ?? rioError.userMessage ?? "An error occurred",
      message: this.debug ? (rioError.technicalDetails ?? rioError.message) : undefined,
      primaryAction:
        isDefinedObject(rioError.actions) && rioError.actions.length > 0
          ? {
              title: rioError.actions[0].title,
              onAction: (): void => {
                const action = rioError.actions[0].action;
                if (action.constructor.name === "AsyncFunction") {
                  (action as () => Promise<void>)().catch((actionError: unknown) => {
                    console.error("Action failed:", actionError);
                  });
                } else {
                  (action as () => void)();
                }
              },
            }
          : undefined,
    });
  }

  /**
   * Normalize errors to RioLauncherError
   */
  protected normalizeError(error: unknown): RioLauncherError {
    if (error instanceof RioLauncherError) {
      // Safe to return as it's already the correct type
      return error;
    }

    if (error instanceof Error) {
      return new ValidationError(error.message, {
        cause: error,
      });
    }

    // Convert any unknown error to RioLauncherError
    const errorMessage = this.getErrorMessage(error);
    return new ValidationError(errorMessage, {
      suggestion: "Please check the operation and try again",
    });
  }

  /**
   * Extract error message from unknown error type
   */
  private getErrorMessage(error: unknown): string {
    if (typeof error === "string") {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (isDefinedObject(error) && "message" in error && typeof error.message === "string") {
      return error.message;
    }
    return "An unknown error occurred";
  }

  /**
   * Logging
   */
  protected log(level: "info" | "warn" | "error" | "debug", message: string, data?: unknown): void {
    if (level === "debug" && !this.debug) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.serviceName}] ${message}`;

    switch (level) {
      case "error":
        console.error(logMessage, data);
        break;
      case "warn":
        console.warn(logMessage, data);
        break;
      case "info":
        // Use console.error for info to comply with eslint rules
        console.error(logMessage, data);
        break;
      case "debug":
        // Use console.error for debug to comply with eslint rules
        console.error(logMessage, data);
        break;
      default:
        throw new Error(`Unknown log level: ${String(level)}`);
    }
  }

  /**
   * Performance tracking
   */
  protected async trackPerformance<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - start;

      this.log("debug", `${operation} completed in ${duration}ms`);

      if (this.telemetry.isEnabled()) {
        await this.telemetry.trackPerformance(`${this.serviceName}.${operation}`, duration);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.log("error", `${operation} failed after ${duration}ms`, error);
      throw error;
    }
  }

  /**
   * Event tracking
   */
  protected async trackEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
    if (this.telemetry.isEnabled()) {
      await this.telemetry.trackEvent(`${this.serviceName}.${event}`, {
        ...properties,
        service: this.serviceName,
      });
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  protected async retry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      shouldRetry?: (error: unknown, attempt: number) => boolean;
    } = {},
  ): Promise<T> {
    const retryConfig = this.validateRetryOptions(options);
    return this.executeRetryLoop(operation, retryConfig);
  }

  /**
   * Validate and normalize retry options
   */
  private validateRetryOptions(options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  }): {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    shouldRetry: (error: unknown, attempt: number) => boolean;
  } {
    return {
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialDelay: options.initialDelay ?? DEFAULT_INITIAL_DELAY,
      maxDelay: options.maxDelay ?? DEFAULT_MAX_DELAY,
      backoffFactor: options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR,
      shouldRetry: options.shouldRetry ?? ((): boolean => true),
    };
  }

  /**
   * Execute retry loop with exponential backoff
   */
  private async executeRetryLoop<T>(
    operation: () => Promise<T>,
    config: {
      maxRetries: number;
      initialDelay: number;
      maxDelay: number;
      backoffFactor: number;
      shouldRetry: (error: unknown, attempt: number) => boolean;
    },
  ): Promise<T> {
    let lastError: unknown;
    let delay = config.initialDelay;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (this.shouldStopRetrying(error, attempt, config)) {
          throw error;
        }

        this.logRetryAttempt(attempt, config.maxRetries, delay, error);
        await this.delayRetry(delay);
        delay = this.calculateNextDelay(delay, config.backoffFactor, config.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Determine if retrying should stop
   */
  private shouldStopRetrying(
    error: unknown,
    attempt: number,
    config: { maxRetries: number; shouldRetry: (error: unknown, attempt: number) => boolean },
  ): boolean {
    return attempt === config.maxRetries || !config.shouldRetry(error, attempt);
  }

  /**
   * Log retry attempt
   */
  private logRetryAttempt(attempt: number, maxRetries: number, delay: number, error: unknown): void {
    this.log("warn", `Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, error);
  }

  /**
   * Delay retry with promise
   */
  private async delayRetry(delay: number): Promise<void> {
    return new Promise((resolve: () => void) => {
      setTimeout(() => {
        resolve();
      }, delay);
    });
  }

  /**
   * Calculate next delay with exponential backoff
   */
  private calculateNextDelay(currentDelay: number, backoffFactor: number, maxDelay: number): number {
    return Math.min(currentDelay * backoffFactor, maxDelay);
  }

  /**
   * Debounce function calls
   */
  protected debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number,
  ): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
      if (isDefinedObject(timeout)) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        func(...args);
      }, wait);
    };
  }

  /**
   * Throttle function calls
   */
  protected throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }
}

// Re-export the base service interface
export type { IBaseService } from "../../types/services";
