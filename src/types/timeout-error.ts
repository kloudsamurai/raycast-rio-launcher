/**
 * Timeout error class for Rio Launcher
 */

import { RioLauncherError, type IErrorAction } from "./errors";

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
