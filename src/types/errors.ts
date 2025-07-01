/**
 * Error type definitions for comprehensive error handling
 */

import { isDefined } from "../utils/type-guards";

// Base error class with additional context
export abstract class RioLauncherError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly userMessage?: string;
  public readonly technicalDetails?: string;
  public readonly helpUrl?: string;
  public readonly actions?: IErrorAction[];

  constructor(
    message: string,
    code: string,
    options?: {
      cause?: Error;
      recoverable?: boolean;
      userMessage?: string;
      technicalDetails?: string;
      helpUrl?: string;
      context?: Record<string, unknown>;
      actions?: IErrorAction[];
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();

    this.initializeErrorProperties(options);
    this.setupErrorCause(options);
    this.setupStackTrace();
  }

  private initializeErrorProperties(options?: {
    recoverable?: boolean;
    userMessage?: string;
    technicalDetails?: string;
    helpUrl?: string;
    context?: Record<string, unknown>;
    actions?: IErrorAction[];
  }): void {
    this.recoverable = options?.recoverable ?? false;
    this.userMessage = options?.userMessage;
    this.technicalDetails = options?.technicalDetails;
    this.helpUrl = options?.helpUrl;
    this.context = options?.context;
    this.actions = options?.actions;
  }

  private setupErrorCause(options?: { cause?: Error }): void {
    if (isDefined(options?.cause)) {
      this.cause = options.cause;
    }
  }

  private setupStackTrace(): void {
    // Maintains proper stack trace for where our error was thrown
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const captureStackTrace = Error.captureStackTrace as
      | ((targetObject: object, constructorOpt: Function) => void)
      | undefined;
    if (isDefined(captureStackTrace)) {
      captureStackTrace(this, this.constructor);
    }
  }
}

export interface IErrorAction {
  title: string;
  action: () => void | Promise<void>;
  style?: "default" | "primary" | "destructive";
}

// Re-export error classes from separate files to maintain API compatibility
export { DependencyError } from "./dependency-error";
export { ProcessError } from "./process-error";
export { FileSystemError } from "./filesystem-error";
export { ConfigurationError } from "./config-errors";
export { ValidationError } from "./validation-error";
export { NetworkError } from "./network-errors";
export { TimeoutError } from "./timeout-error";
export { PermissionError } from "./permission-errors";
export { StateError } from "./state-error";

// Import for type guards
import { DependencyError } from "./dependency-error";
import { ProcessError } from "./process-error";
import { FileSystemError } from "./filesystem-error";
import { ConfigurationError } from "./config-errors";
import { NetworkError } from "./network-errors";

// Error boundary helper
export interface IErrorInfo {
  componentStack: string;
  errorBoundary?: boolean;
  errorBoundaryKey?: string;
}

// Error recovery strategies
export enum RecoveryStrategy {
  RETRY = "retry",
  RESET = "reset",
  FALLBACK = "fallback",
  IGNORE = "ignore",
  REPORT = "report",
}

export interface IErrorRecovery {
  strategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
  fallbackValue?: unknown;
  onRecover?: (error: RioLauncherError) => void | Promise<void>;
}

// Error reporting
export interface IErrorReport {
  error: RioLauncherError;
  context: Record<string, unknown>;
  systemInfo: {
    platform: string;
    version: string;
    raycastVersion: string;
    extensionVersion: string;
  };
  userActions: string[];
  timestamp: Date;
}

// Type guard functions
export function isDependencyError(error: unknown): error is DependencyError {
  return error instanceof DependencyError;
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

export function isProcessError(error: unknown): error is ProcessError {
  return error instanceof ProcessError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof FileSystemError;
}

export function isRecoverableError(error: unknown): boolean {
  return error instanceof RioLauncherError && error.recoverable;
}
