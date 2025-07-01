/**
 * File system error class for Rio Launcher
 */

import { isDefined } from "../utils/type-guards";
import { RioLauncherError } from "./errors";

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
