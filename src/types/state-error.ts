/**
 * State error class for Rio Launcher
 */

import { RioLauncherError, type IErrorAction } from "./errors";

export class StateError extends RioLauncherError {
  constructor(
    message: string,
    options?: {
      expectedState?: string;
      actualState?: string;
      component?: string;
    },
  ) {
    const resetStateAction: IErrorAction = {
      title: "Reset State",
      action: async () => {
        // Implementation would reset state
      },
    };

    super(message, "STATE_ERROR", {
      ...options,
      recoverable: true,
      context: {
        expectedState: options?.expectedState,
        actualState: options?.actualState,
        component: options?.component,
      },
      userMessage: "Invalid state detected",
      actions: [resetStateAction],
    });
  }
}
