/**
 * Dependency error class for Rio Launcher
 */

import { isNonEmptyString, isDefined } from "../utils/type-guards";

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

export class DependencyError extends RioLauncherError {
  constructor(
    dependency: string,
    message: string,
    options?: {
      cause?: Error;
      version?: string;
      requiredVersion?: string;
      installCommand?: string;
    },
  ) {
    super(message, "DEPENDENCY_ERROR", {
      ...options,
      recoverable: true,
      context: {
        dependency,
        version: options?.version,
        requiredVersion: options?.requiredVersion,
      },
      userMessage: `Failed to ${message.toLowerCase()} ${dependency}`,
      actions: isNonEmptyString(options?.installCommand)
        ? [
            {
              title: `Install ${dependency}`,
              action: async () => {
                // Implementation would execute install command
              },
            },
          ]
        : undefined,
    });
  }
}
