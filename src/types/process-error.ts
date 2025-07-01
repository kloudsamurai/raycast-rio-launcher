/**
 * Process error class for Rio Launcher
 */

import { isValidNumber } from "../utils/type-guards";
import { RioLauncherError } from "./errors";

// Constants for error handling
const UNIX_SIGNAL_EXIT_CODE_THRESHOLD = 128;

export class ProcessError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      pid?: number;
      exitCode?: number;
      signal?: string;
      command?: string;
      stderr?: string;
    },
  ) {
    super(message, "PROCESS_ERROR", {
      ...options,
      recoverable: isValidNumber(options?.exitCode) && options.exitCode < UNIX_SIGNAL_EXIT_CODE_THRESHOLD,
      context: {
        pid: options?.pid,
        exitCode: options?.exitCode,
        signal: options?.signal,
        command: options?.command,
      },
      technicalDetails: options?.stderr,
      userMessage: "Rio process error",
    });
  }
}
