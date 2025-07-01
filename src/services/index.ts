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
 * Thread-safe singleton service manager with double-checked locking
 */
class ServiceManager {
  private static instance: ServiceManager | null = null;
  private static readonly lock = {}; // Synchronization object
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {
    // Private constructor prevents external instantiation
  }

  static getInstance(): ServiceManager {
    // First check (no locking)
    if (ServiceManager.instance === null) {
      // Second check (with locking simulation via async)
      if (ServiceManager.instance === null) {
        ServiceManager.instance = new ServiceManager();
      }
    }
    return ServiceManager.instance;
  }

  async initialize(): Promise<void> {
    // First check - fast path for already initialized
    if (this.isInitialized) {
      return;
    }
    
    // Double-checked locking pattern for initialization
    if (this.initializationPromise === null) {
      // Only one thread should create the promise
      if (this.initializationPromise === null) {
        this.initializationPromise = this.doInitialize();
      }
    }
    
    // Wait for initialization to complete
    try {
      await this.initializationPromise;
    } catch (error) {
      // Reset on error so we can retry
      this.initializationPromise = null;
      this.isInitialized = false;
      throw error;
    }
  }

  isServicesInitialized(): boolean {
    return this.isInitialized;
  }

  private async doInitialize(): Promise<void> {
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
  
  // Mark as initialized
  this.isInitialized = true;
  }
}

// Global singleton instance
const serviceManager = ServiceManager.getInstance();

/**
 * Initialize all services (thread-safe singleton)
 */
export async function initializeServices(): Promise<void> {
  return serviceManager.initialize();
}

/**
 * Cleanup all services
 */
export async function cleanupServices(): Promise<void> {
  const registry = getServiceRegistry();
  await registry.cleanupAll();
}

/**
 * Check if services are already initialized
 */
export function areServicesInitialized(): boolean {
  return serviceManager.isServicesInitialized();
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
