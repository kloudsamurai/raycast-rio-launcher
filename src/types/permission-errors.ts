/**
 * Permission error class for Rio Launcher
 */

import { RioLauncherError, type IErrorAction } from "./errors";

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
