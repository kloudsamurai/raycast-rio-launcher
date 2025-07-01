/**
 * Service registry for dependency injection and lifecycle management
 */

import type { BaseService } from "./BaseService";
import { RioLauncherError } from "../../types/errors";
import { isDefined, assertIsDefined } from "../../utils/type-guards";

type ServiceConstructor<T extends BaseService> = new (...args: unknown[]) => T;
type ServiceFactory<T extends BaseService> = () => T | Promise<T>;

interface IServiceRegistration<T extends BaseService = BaseService> {
  service: T | null;
  factory: ServiceFactory<T>;
  singleton: boolean;
  dependencies: string[];
  initializing: boolean;
  initPromise: Promise<void> | null;
}

export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private readonly services: Map<string, IServiceRegistration> = new Map();
  private initializationOrder: string[] = [];

  private constructor() {
    // Private constructor to enforce singleton pattern
    return;
  }

  static getInstance(): ServiceRegistry {
    if (!isDefined(ServiceRegistry.instance)) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service
   */
  register<T extends BaseService>(
    name: string,
    factory: ServiceFactory<T>,
    options: {
      singleton?: boolean;
      dependencies?: string[];
    } = {},
  ): void {
    const { singleton = true, dependencies = [] } = options;

    if (this.services.has(name)) {
      throw new RioLauncherError(`Service '${name}' is already registered`, "SERVICE_ALREADY_REGISTERED");
    }

    this.services.set(name, {
      service: null,
      factory,
      singleton,
      dependencies,
      initializing: false,
      initPromise: null,
    });

    // Update initialization order based on dependencies
    this.updateInitializationOrder();
  }

  /**
   * Register a service class
   */
  registerClass<T extends BaseService>(
    name: string,
    ServiceClass: ServiceConstructor<T>,
    options: {
      singleton?: boolean;
      dependencies?: string[];
      args?: unknown[];
    } = {},
  ): void {
    const { args = [] } = options;

    this.register(name, () => new ServiceClass(...args), options);
  }

  /**
   * Get a service instance - throws if service cannot be created or initialized
   */
  async get<T extends BaseService>(name: string): Promise<T> {
    const registration = this.services.get(name);

    if (!isDefined(registration)) {
      throw new RioLauncherError(`Service '${name}' is not registered`, "SERVICE_NOT_FOUND");
    }

    // For singletons, return existing instance or create new one
    if (registration.singleton) {
      if (isDefined(registration.service)) {
        return registration.service as T;
      }

      if (registration.initializing && isDefined(registration.initPromise)) {
        await registration.initPromise;
        assertIsDefined(registration.service);
        return registration.service as T;
      }

      // Create and initialize singleton
      registration.initializing = true;
      registration.initPromise = this.createAndInitializeService(name, registration);

      await registration.initPromise;
      assertIsDefined(registration.service);
      return registration.service as T;
    }

    // For non-singletons, always create new instance
    const service = await registration.factory();
    assertIsDefined(service);
    await this.initializeServiceWithDependencies(service, registration.dependencies);
    return service as T;
  }

  /**
   * Get a service synchronously (must already be initialized) - throws if not available
   */
  getSync<T extends BaseService>(name: string): T {
    const registration = this.services.get(name);

    if (!isDefined(registration)) {
      throw new RioLauncherError(`Service '${name}' is not registered`, "SERVICE_NOT_FOUND");
    }

    if (!isDefined(registration.service)) {
      throw new RioLauncherError(`Service '${name}' is not initialized`, "SERVICE_NOT_INITIALIZED");
    }

    return registration.service as T;
  }

  /**
   * Safely get a service that may not be initialized
   */
  tryGetSync<T extends BaseService>(name: string): T | null {
    const registration = this.services.get(name);
    return (registration?.service as T | null) ?? null;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Check if a service is initialized
   */
  isInitialized(name: string): boolean {
    const registration = this.services.get(name);
    return isDefined(registration?.service);
  }

  /**
   * Initialize all registered singleton services
   */
  async initializeAll(): Promise<void> {
    // Initialize services in dependency order
    for (const name of this.initializationOrder) {
      const registration = this.services.get(name);
      if (isDefined(registration) && registration.singleton && !isDefined(registration.service)) {
        await this.get(name);
      }
    }
  }

  /**
   * Cleanup all services
   */
  async cleanupAll(): Promise<void> {
    // Cleanup in reverse initialization order
    const reverseOrder = [...this.initializationOrder].reverse();

    for (const name of reverseOrder) {
      const registration = this.services.get(name);
      if (isDefined(registration?.service)) {
        try {
          await registration.service.cleanup();
        } catch (error) {
          console.error(`Failed to cleanup service '${name}':`, error);
        }
      }
    }

    // Clear all services
    this.services.clear();
    this.initializationOrder = [];
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get service registration info
   */
  getServiceInfo(name: string): {
    registered: boolean;
    initialized: boolean;
    singleton: boolean;
    dependencies: string[];
  } | null {
    const registration = this.services.get(name);

    if (!isDefined(registration)) {
      return null;
    }

    return {
      registered: true,
      initialized: isDefined(registration.service),
      singleton: registration.singleton,
      dependencies: registration.dependencies,
    };
  }

  /**
   * Create and initialize a service with its dependencies
   */
  private async createAndInitializeService(name: string, registration: IServiceRegistration): Promise<void> {
    try {
      // Initialize dependencies first
      for (const dep of registration.dependencies) {
        await this.get(dep);
      }

      // Create service instance
      const service = await registration.factory();
      // Atomic update: assign service instance
      Object.assign(registration, { service });

      // Initialize the service
      await service.initialize();
    } catch (error) {
      // Atomic update: reset service to null on error
      Object.assign(registration, { service: null });
      throw new RioLauncherError(`Failed to initialize service '${name}'`, "SERVICE_INITIALIZATION_FAILED", {
        cause: error as Error,
        context: { service: name },
      });
    } finally {
      // Atomic update: reset initialization state
      Object.assign(registration, {
        initializing: false,
        initPromise: null,
      });
    }
  }

  /**
   * Initialize a non-singleton service with dependencies
   */
  private async initializeServiceWithDependencies(service: BaseService, dependencies: string[]): Promise<void> {
    // Ensure dependencies are initialized
    for (const dep of dependencies) {
      await this.get(dep);
    }

    // Initialize the service
    await service.initialize();
  }

  /**
   * Update initialization order based on dependencies
   */
  private updateInitializationOrder(): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }

      if (visiting.has(name)) {
        throw new RioLauncherError(`Circular dependency detected involving service '${name}'`, "CIRCULAR_DEPENDENCY");
      }

      visiting.add(name);

      const registration = this.services.get(name);
      if (isDefined(registration)) {
        for (const dep of registration.dependencies) {
          if (!this.services.has(dep)) {
            throw new RioLauncherError(
              `Service '${name}' depends on unregistered service '${dep}'`,
              "MISSING_DEPENDENCY",
            );
          }
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Visit all services
    for (const name of this.services.keys()) {
      visit(name);
    }

    this.initializationOrder = order;
  }
}

// Export singleton instance getter
export const getServiceRegistry = ServiceRegistry.getInstance;
