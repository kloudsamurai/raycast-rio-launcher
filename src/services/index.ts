/**
 * Service initialization and registration
 */

import { getServiceRegistry } from "./base/ServiceRegistry";
import { EventBusService } from "./EventBus";
import { ConfigurationService } from "./ConfigurationService";
import { ProcessService } from "./ProcessService";
import { ProfileService } from "./ProfileService";
import { SessionService } from "./SessionService";
import { DependencyService } from "./DependencyService";
import { ThemeService } from "./ThemeService";
import { TelemetryService } from "./TelemetryService";
import { CacheService } from "./CacheService";
import { AIService } from "./AIService";
import { SSHService } from "./SSHService";
import { MultiplexerService } from "./MultiplexerService";
import { NotificationService } from "./NotificationService";
import { getPreferenceValues } from "@raycast/api";
import type { ExtensionPreferences } from "../types/preferences";
import { isDefined } from "../utils/type-guards";

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<void> {
  const registry = getServiceRegistry();
  const preferences = getPreferenceValues<ExtensionPreferences>();

  // Register EventBus first (no dependencies)
  registry.registerClass("eventBus", EventBusService, {
    singleton: true,
    args: [{ debug: preferences.enableDebugMode }],
  });

  // Register Cache service (depends on EventBus)
  registry.registerClass("cache", CacheService, {
    singleton: true,
    dependencies: ["eventBus"],
  });

  // Register Telemetry service (depends on EventBus)
  registry.registerClass("telemetry", TelemetryService, {
    singleton: true,
    dependencies: ["eventBus"],
    args: [{ enabled: preferences.enableTelemetry }],
  });

  // Register Configuration service
  registry.registerClass("configuration", ConfigurationService, {
    singleton: true,
    dependencies: ["eventBus", "telemetry"],
  });

  // Register Profile service
  registry.registerClass("profile", ProfileService, {
    singleton: true,
    dependencies: ["eventBus", "telemetry"],
  });

  // Register Theme service
  registry.registerClass("theme", ThemeService, {
    singleton: true,
    dependencies: ["eventBus", "telemetry"],
  });

  // Register Process service
  registry.registerClass("process", ProcessService, {
    singleton: true,
    dependencies: ["eventBus", "configuration", "profile", "telemetry"],
  });

  // Register Session service
  registry.registerClass("session", SessionService, {
    singleton: true,
    dependencies: ["eventBus", "process", "profile", "telemetry"],
  });

  // Register Dependency service
  registry.registerClass("dependency", DependencyService, {
    singleton: true,
    dependencies: ["eventBus", "telemetry", "cache"],
  });

  // Register AI service
  if (isDefined(preferences.enableAISuggestions) && preferences.enableAISuggestions) {
    registry.registerClass("ai", AIService, {
      singleton: true,
      dependencies: ["eventBus", "telemetry", "cache"],
    });
  }

  // Register SSH service
  registry.registerClass("ssh", SSHService, {
    singleton: true,
    dependencies: ["eventBus", "telemetry"],
  });

  // Register Multiplexer service
  registry.registerClass("multiplexer", MultiplexerService, {
    singleton: true,
    dependencies: ["eventBus", "process", "telemetry"],
  });

  // Register Notification service
  registry.registerClass("notification", NotificationService, {
    singleton: true,
    dependencies: ["eventBus"],
  });

  // Initialize all singleton services
  await registry.initializeAll();
}

/**
 * Cleanup all services
 */
export async function cleanupServices(): Promise<void> {
  const registry = getServiceRegistry();
  await registry.cleanupAll();
}

// Re-export commonly used services
export { getEventBus } from "./EventBus";
export { getServiceRegistry } from "./base/ServiceRegistry";

// Re-export all services
export * from "./base/BaseService";
export * from "./base/ServiceRegistry";
export * from "./EventBus";
export * from "./ConfigurationService";
export * from "./ProcessService";
export * from "./ProfileService";
export * from "./DependencyService";
export * from "./CacheService";
export * from "./SessionService";
export * from "./ThemeService";
export * from "./TelemetryService";
export * from "./NotificationService";
export * from "./AIService";
export * from "./SSHService";
export * from "./MultiplexerService";
