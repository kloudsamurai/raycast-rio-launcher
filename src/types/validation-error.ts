/**
 * Validation error class for Rio Launcher
 */

import { RioLauncherError } from "./errors";

export class ValidationError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      field?: string;
      value?: unknown;
      rule?: string;
      suggestion?: string;
    },
  ) {
    super(message, "VALIDATION_ERROR", {
      ...options,
      recoverable: true,
      context: {
        field: options?.field,
        value: options?.value,
        rule: options?.rule,
      },
      userMessage: options?.suggestion ?? message,
    });
  }
}
