/**
 * Permission error class for Rio Launcher
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

export class PermissionError extends RioLauncherError {
  constructor(
    resource: string,
    operation: string,
    options?: {
      cause?: Error;
      requiredPermission?: string;
    },
  ) {
    const requestPermissionAction: IErrorAction = {
      title: "Request Permission",
      action: async () => {
        // Implementation would request permission
      },
    };

    super(`Permission denied: Cannot ${operation} ${resource}`, "PERMISSION_ERROR", {
      ...options,
      recoverable: false,
      context: {
        resource,
        operation,
        requiredPermission: options?.requiredPermission,
      },
      userMessage: `Permission required to ${operation} ${resource}`,
      helpUrl: "https://docs.rio.dev/permissions",
      actions: [requestPermissionAction],
    });
  }
}
