/**
 * Network error class for Rio Launcher
 */

import { isDefined } from "../utils/type-guards";
import { RioLauncherError, type IErrorAction } from "./errors";

export class NetworkError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      url?: string;
      statusCode?: number;
      method?: string;
      timeout?: boolean;
    },
  ) {
    const retryAction: IErrorAction = {
      title: "Retry",
      action: async () => {
        // Implementation would retry the request
      },
      style: "primary",
    };

    super(message, "NETWORK_ERROR", {
      ...options,
      recoverable: true,
      context: {
        url: options?.url,
        statusCode: options?.statusCode,
        method: options?.method,
        timeout: options?.timeout,
      },
      userMessage: isDefined(options?.timeout) && options.timeout ? "Request timed out" : "Network error occurred",
      actions: [retryAction],
    });
  }
}
