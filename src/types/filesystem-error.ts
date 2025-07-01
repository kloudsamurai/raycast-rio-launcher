/**
 * File system error class for Rio Launcher
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

export class FileSystemError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      path?: string;
      operation?: "read" | "write" | "delete" | "create" | "move";
      code?: string;
    },
  ) {
    super(message, "FILESYSTEM_ERROR", {
      ...options,
      recoverable: isDefined(options?.code) && options.code !== "EACCES" && options.code !== "EPERM",
      context: {
        path: options?.path,
        operation: options?.operation,
        systemCode: options?.code,
      },
      userMessage: `Cannot ${options?.operation ?? "access"} file`,
      helpUrl: options?.code === "EACCES" ? "https://docs.rio.dev/permissions" : undefined,
    });
  }
}
