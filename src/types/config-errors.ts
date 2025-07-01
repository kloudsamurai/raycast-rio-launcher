/**
 * Configuration error class for Rio Launcher
 */

import { RioLauncherError, type IErrorAction } from "./errors";
import type { ValidationError } from "./validation-error";

export class ConfigurationError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      configPath?: string;
      configKey?: string;
      invalidValue?: unknown;
      validationErrors?: ValidationError[];
    },
  ) {
    const resetConfigAction: IErrorAction = {
      title: "Reset to Default",
      action: async () => {
        // Implementation would reset config
      },
    };

    const openConfigAction: IErrorAction = {
      title: "Open Config",
      action: async () => {
        // Implementation would open config file
      },
    };

    super(message, "CONFIGURATION_ERROR", {
      ...options,
      recoverable: true,
      context: {
        configPath: options?.configPath,
        configKey: options?.configKey,
        invalidValue: options?.invalidValue,
        validationErrors: options?.validationErrors,
      },
      userMessage: "Configuration error detected",
      actions: [resetConfigAction, openConfigAction],
    });
  }
}
