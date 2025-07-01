/**
 * Dependency error class for Rio Launcher
 */

import { isNonEmptyString } from "../utils/type-guards";
import { RioLauncherError } from "./errors";

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
