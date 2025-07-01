/**
 * Timeout error class for Rio Launcher
 */

import { isDefined } from "../utils/type-guards";

// Base error class with additional context
abstract class RioLauncherError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly userMessage?: string;
  public readonly technicalDetails?: string;
  public readonly helpUrl?: string;
  public readonly actions?: Array<{
    title: string;
    action: () => void | Promise<void>;
    style?: "default" | "primary" | "destructive";
  }>;

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
      actions?: Array<{
        title: string;
        action: () => void | Promise<void>;
        style?: "default" | "primary" | "destructive";
      }>;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();

    this.recoverable = options?.recoverable ?? false;
    this.userMessage = options?.userMessage;
    this.technicalDetails = options?.technicalDetails;
    this.helpUrl = options?.helpUrl;
    this.context = options?.context;
    this.actions = options?.actions;

    if (isDefined(options?.cause)) {
      this.cause = options.cause;
    }

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

interface IErrorAction {
  title: string;
  action: () => void | Promise<void>;
  style?: "default" | "primary" | "destructive";
}

export class TimeoutError extends RioLauncherError {
  constructor(
    operation: string,
    timeoutMs: number,
    options?: {
      cause?: Error;
    },
  ) {
    const retryAction: IErrorAction = {
      title: "Retry",
      action: async () => {
        // Implementation would retry
      },
      style: "primary",
    };

    const increaseTimeoutAction: IErrorAction = {
      title: "Increase Timeout",
      action: async () => {
        // Implementation would adjust timeout
      },
    };

    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, "TIMEOUT_ERROR", {
      ...options,
      recoverable: true,
      context: {
        operation,
        timeoutMs,
      },
      userMessage: "Operation timed out",
      actions: [retryAction, increaseTimeoutAction],
    });
  }
}
