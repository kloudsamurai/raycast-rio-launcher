/**
 * Notification service for system notifications and alerts
 */

import { Toast, showHUD, Alert, confirmAlert, Icon, LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { INotificationService, INotification } from "../types/services";
import { getEventBus } from "./EventBus";
import { isDefinedString, isDefinedObject, isDefined } from "../utils/type-guards";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const NOTIFICATION_HISTORY_KEY = "rio-notification-history";
const MAX_HISTORY_SIZE = 100;

type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface INotificationHistoryItem extends INotification {
  timestamp: string;
  read: boolean;
}

interface INotificationOptions {
  title: string;
  message?: string;
  priority?: NotificationPriority;
  sound?: boolean;
  timeout?: number;
  style?: "info" | "success" | "warning" | "error";
  primaryAction?: {
    title: string;
    onAction: () => Promise<void> | void;
  };
  secondaryAction?: {
    title: string;
    onAction: () => Promise<void> | void;
  };
}

export class NotificationService extends BaseService implements INotificationService {
  private notificationHistory: INotificationHistoryItem[] = [];
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private readonly activeToasts: Map<string, Toast> = new Map();

  constructor(options?: IServiceOptions) {
    super("NotificationService", options);
  }

  protected async onInitialize(): Promise<void> {
    // Load notification history
    await this.loadHistory();

    // Set up event listeners
    this.setupEventListeners();
  }

  protected async onCleanup(): Promise<void> {
    // Hide all active toasts
    for (const [_id, toast] of this.activeToasts) {
      await toast.hide();
    }
    this.activeToasts.clear();

    // Save history
    await this.saveHistory();
  }

  /**
   * Show a notification
   */
  async showNotification(notification: INotification): Promise<void> {
    const id: string = notification.id ?? Date.now().toString();

    try {
      // Determine notification method based on type
      if (notification.type === "info") {
        await this.showToast(id, notification.title, notification);
      } else {
        await this.showToast(id, notification.title, notification);
      }

      // Add to history
      await this.addToHistory({
        ...notification,
        id,
        timestamp: new Date().toISOString(),
        read: false,
      });

      // Emit event
      try {
        this.eventBus.emit("notification:shown", { id, notification });
      } catch (emitError: unknown) {
        this.log("error", "Failed to emit notification:shown event", emitError);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to show notification", { error, title: notification.title });
        throw error;
      } else {
        const unknownError = new Error("Unknown notification error");
        this.log("error", "Failed to show notification", { error: unknownError, title: notification.title });
        throw unknownError;
      }
    }
  }

  /**
   * Update a notification
   */
  async updateNotification(id: string, updates: Partial<INotificationOptions>): Promise<void> {
    const toast = this.activeToasts.get(id);
    if (!isDefinedObject(toast)) {
      this.log("warn", `Toast ${id} not found for update`);
      return;
    }

    const typedUpdates = updates;
    if (isDefinedString(typedUpdates.title)) {
      toast.title = typedUpdates.title;
    }
    if (isDefinedString(typedUpdates.message)) {
      toast.message = typedUpdates.message;
    }
    if (typedUpdates.style !== undefined) {
      toast.style = this.mapToastStyle(typedUpdates.style);
    }
  }

  /**
   * Hide a notification
   */
  async hideNotification(id: string): Promise<void> {
    const toast = this.activeToasts.get(id);
    if (isDefinedObject(toast)) {
      await toast.hide();
      this.activeToasts.delete(id);
    }
  }

  /**
   * Show a confirmation dialog
   */
  async showConfirmation(
    title: string,
    message: string,
    options?: {
      primaryAction?: string;
      cancelAction?: string;
      destructive?: boolean;
    },
  ): Promise<boolean> {
    try {
      const alertConfig = this.buildAlertConfig(title, message, options);
      const result = await confirmAlert(alertConfig);
      return result;
    } catch (error: unknown) {
      this.handleConfirmationError(error, title);
      return false;
    }
  }

  private buildAlertConfig(
    title: string,
    message: string,
    options?: {
      primaryAction?: string;
      cancelAction?: string;
      destructive?: boolean;
    },
  ): Alert.Options {
    return {
      title,
      message,
      icon: options?.destructive === true ? Icon.ExclamationMark : Icon.QuestionMark,
      primaryAction: {
        title: options?.primaryAction ?? "Confirm",
        style: options?.destructive === true ? Alert.ActionStyle.Destructive : Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: options?.cancelAction ?? "Cancel",
      },
    };
  }

  private handleConfirmationError(error: unknown, title: string): void {
    if (error instanceof Error) {
      this.log("error", "Failed to show confirmation", { error, title });
    } else {
      this.log("error", "Failed to show confirmation", { error: new Error("Unknown error"), title });
    }
  }

  /**
   * Get notification history
   */
  async getHistory(limit?: number): Promise<INotificationHistoryItem[]> {
    const items: INotificationHistoryItem[] =
      typeof limit === "number" ? this.notificationHistory.slice(-limit) : this.notificationHistory;
    return items.sort((a: INotificationHistoryItem, b: INotificationHistoryItem) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  }

  /**
   * Clear notification history
   */
  async clearHistory(): Promise<void> {
    this.notificationHistory = [];
    await this.saveHistory();
    this.log("info", "Notification history cleared");
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<void> {
    const item = this.notificationHistory.find((n: INotificationHistoryItem) => n.id === id);
    if (isDefinedObject(item)) {
      item.read = true;
      await this.saveHistory();
    }
  }

  /**
   * Private helper methods
   */

  private async showToast(id: string, title: string, options?: INotificationOptions): Promise<void> {
    const toast = new Toast({
      style: this.mapToastStyle(options?.style ?? "info"),
      title,
      message: options?.message,
      primaryAction: isDefinedObject(options?.primaryAction)
        ? {
            title: options.primaryAction.title,
            onAction: () => {
              (async (): Promise<void> => {
                await options.primaryAction.onAction();
              })().catch((error: unknown) => {
                this.log("error", "Failed to execute primary action", error);
              });
            },
          }
        : undefined,
      secondaryAction: isDefinedObject(options?.secondaryAction)
        ? {
            title: options.secondaryAction.title,
            onAction: () => {
              (async (): Promise<void> => {
                await options.secondaryAction.onAction();
              })().catch((error: unknown) => {
                this.log("error", "Failed to execute secondary action", error);
              });
            },
          }
        : undefined,
    });

    await toast.show();
    this.activeToasts.set(id, toast);

    // Auto-hide after timeout
    if (typeof options?.timeout === "number") {
      setTimeout(() => {
        this.hideNotification(id).catch((error: unknown) => {
          this.log("error", "Failed to auto-hide notification", error);
        });
      }, options.timeout);
    }
  }

  private async showHUD(title: string, options?: INotificationOptions): Promise<void> {
    await showHUD(title);

    // HUD auto-hides, but we can emit an event after timeout
    if (typeof options?.timeout === "number") {
      setTimeout(() => {
        try {
          this.eventBus.emit("notification:hidden", { title });
        } catch (emitError: unknown) {
          this.log("error", "Failed to emit notification:hidden event", emitError);
        }
      }, options.timeout);
    }
  }

  private async showSystemNotification(title: string, options?: INotificationOptions): Promise<void> {
    // Use macOS notification center
    const script = `
      osascript -e 'display notification "${options?.message ?? ""}" with title "${title}"${options?.sound === true ? ' sound name "default"' : ""}'
    `;

    try {
      await execAsync(script);
    } catch (error: unknown) {
      // Fallback to toast
      if (error instanceof Error) {
        this.log("warn", "System notification failed, falling back to toast", error);
      }
      await this.showToast(Date.now().toString(), title, options);
    }
  }

  private mapToastStyle(style: INotificationOptions["style"]): Toast.Style {
    switch (style) {
      case "success":
        return Toast.Style.Success;
      case "error":
        return Toast.Style.Failure;
      case "info":
      case "warning":
      case undefined:
        return Toast.Style.Success;
      default: {
        const exhaustiveCheck: never = style;
        throw new Error(`Unhandled notification style: ${String(exhaustiveCheck)}`);
      }
    }
  }

  private setupEventListeners(): void {
    // Listen for important events that might need notifications
    this.eventBus.on("rio:launched", (event: unknown) => {
      (async (): Promise<void> => {
        if (typeof event === "object" && event !== null && "process" in event) {
          const typedEvent = event as { process: { error?: unknown } };
          if (isDefined(typedEvent.process.error)) {
            await this.showNotification({
              title: "Rio Launch Failed",
              type: "error",
              message: typedEvent.process.error instanceof Error ? typedEvent.process.error.message : "Unknown error",
            });
          }
        }
      })().catch((error: unknown) => {
        this.log("error", "Failed to handle event", error);
      });
    });

    this.eventBus.on("config:invalid", (event: unknown) => {
      (async (): Promise<void> => {
        if (typeof event === "object" && event !== null && "errors" in event) {
          const typedEvent = event as { errors: unknown[] };
          const errorCount = Array.isArray(typedEvent.errors) ? typedEvent.errors.length : 0;
          await this.showNotification({
            title: "Invalid Configuration",
            type: "error",
            message: `${errorCount} validation error${errorCount > 1 ? "s" : ""} found`,
          });
        }
      })().catch((error: unknown) => {
        this.log("error", "Failed to handle event", error);
      });
    });

    this.eventBus.on("dependency:missing", (event: unknown) => {
      (async (): Promise<void> => {
        if (typeof event === "object" && event !== null && "dependency" in event) {
          const typedEvent = event as { dependency: { displayName: string } };
          await this.showNotification({
            title: `${typedEvent.dependency.displayName} Required`,
            type: "error",
            message: "This dependency is required for Rio to function properly",
          });
        }
      })().catch((error: unknown) => {
        this.log("error", "Failed to handle event", error);
      });
    });

    this.eventBus.on("update:available", (event: unknown) => {
      (async (): Promise<void> => {
        if (typeof event === "object" && event !== null && "version" in event) {
          const typedEvent = event as { version: string };
          await this.showNotification({
            title: "Update Available",
            type: "info",
            message: `Rio ${typedEvent.version} is now available`,
          });
        }
      })().catch((error: unknown) => {
        this.log("error", "Failed to handle event", error);
      });
    });
  }

  private async loadHistory(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(NOTIFICATION_HISTORY_KEY);
      if (isDefinedString(stored)) {
        this.notificationHistory = JSON.parse(stored) as INotificationHistoryItem[];
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load notification history", error);
      } else {
        this.log("error", "Failed to load notification history", new Error("Unknown error"));
      }
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const toSave = this.notificationHistory.slice(-MAX_HISTORY_SIZE);
      await LocalStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(toSave));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save notification history", error);
      } else {
        this.log("error", "Failed to save notification history", new Error("Unknown error"));
      }
    }
  }

  private async addToHistory(item: INotificationHistoryItem): Promise<void> {
    this.notificationHistory.push(item);

    // Trim to max size
    if (this.notificationHistory.length > MAX_HISTORY_SIZE) {
      this.notificationHistory = this.notificationHistory.slice(-MAX_HISTORY_SIZE);
    }

    await this.saveHistory();
  }
}
