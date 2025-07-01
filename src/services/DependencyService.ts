/**
 * Dependency service for managing Rio and related dependencies
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IDependencyService, DependencyUpdate } from "../types/services";
import type { Dependency, InstallationProgress as InstallationProgress } from "../types/system";
import { DependencyError, ProcessError, TimeoutError } from "../types/errors";
import { getEventBus } from "./EventBus";
import type { CacheService } from "./CacheService";
import { isDefinedString } from "../utils/type-guards";

export class DependencyService extends BaseService implements IDependencyService {
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private cache?: CacheService;
  private readonly dependencies: Map<string, Dependency> = new Map();

  constructor(
    options?: IServiceOptions & {
      cache?: CacheService;
    },
  ) {
    super("DependencyService", options);
    this.cache = options?.cache;
  }

  protected async onInitialize(): Promise<void> {
    // Get cache service if not provided
    if (this.cache === undefined) {
      try {
        const module = await import("./base/ServiceRegistry");
        const registry = module.getServiceRegistry();
        // Type guard for registry
        const isRegistryValid = (r: unknown): r is { get: (name: string) => Promise<unknown> } => {
          return (
            r !== null &&
            r !== undefined &&
            typeof r === "object" &&
            "get" in r &&
            typeof (r as { get?: unknown }).get === "function"
          );
        };

        if (isRegistryValid(registry)) {
          const cacheService = await registry.get("cache");
          this.cache = cacheService as CacheService;
        }
      } catch {
        // Registry or cache service might not be available
      }
    }

    // Define dependencies
    this.defineDependencies();
  }

  protected async onCleanup(): Promise<void> {
    this.dependencies.clear();
  }

  /**
   * Check all dependencies
   */
  async checkDependencies(): Promise<Record<string, Dependency>> {
    return this.trackPerformance("checkDependencies", async () => {
      const result: Record<string, Dependency> = {};

      for (const [name, dep] of this.dependencies) {
        this.eventBus.emit("dependency:checking", { dependency: name });

        const installed = await this.checkDependency(dep);
        const version = installed ? await this.getDependencyVersion(name) : null;

        result[name] = {
          ...dep,
          installed,
          version,
        };
      }

      return result;
    });
  }

  /**
   * Install a dependency
   */
  async installDependency(name: string, onProgress?: (progress: InstallationProgress) => void): Promise<void> {
    const dependency = this.dependencies.get(name);
    if (dependency === undefined) {
      throw new DependencyError(name, "Unknown dependency");
    }

    if (!isDefinedString(dependency.installCommand)) {
      throw new DependencyError(name, "No install command available");
    }

    const progress: InstallationProgress = {
      dependency: name,
      status: "pending",
      message: `Preparing to install ${dependency.displayName}...`,
    };

    onProgress?.(progress);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.eventBus.emit("dependency:installing", { dependency: name, progress });

    try {
      await this.performInstallation(dependency, progress, onProgress);
      await this.verifyAndNotifyInstallation(name, dependency, progress, onProgress);
    } catch (error: unknown) {
      await this.handleInstallationError(name, dependency, error, progress, onProgress);
    }
  }

  private async performInstallation(
    dependency: Dependency,
    progress: InstallationProgress,
    onProgress?: (progress: InstallationProgress) => void,
  ): Promise<void> {
    // Mutate the original progress object
    Object.assign(progress, {
      status: "installing" as const,
      message: `Installing ${dependency.displayName}...`,
    });
    onProgress?.(progress);

    if (!isDefinedString(dependency.installCommand)) {
      throw new Error("Install command is not defined");
    }

    await this.executeCommand(dependency.installCommand, {
      onOutput: (data: string) => {
        Object.assign(progress, { message: data.trim() });
        onProgress?.(progress);
      },
    });
  }

  private async verifyAndNotifyInstallation(
    name: string,
    dependency: Dependency,
    progress: InstallationProgress,
    onProgress?: (progress: InstallationProgress) => void,
  ): Promise<void> {
    const installed = await this.checkDependency(dependency);
    if (!installed) {
      throw new DependencyError(name, "Installation verification failed");
    }

    Object.assign(progress, {
      status: "completed" as const,
      message: `${dependency.displayName} installed successfully`,
    });
    onProgress?.(progress);

    const version = await this.getDependencyVersion(name);
    this.eventBus.emit("dependency:installed", {
      dependency: name,
      result: {
        success: true,
        dependency: name,
        version,
      },
    });
  }

  private async handleInstallationError(
    name: string,
    dependency: Dependency,
    error: unknown,
    progress: InstallationProgress,
    onProgress?: (progress: InstallationProgress) => void,
  ): Promise<void> {
    Object.assign(progress, {
      status: "failed" as const,
      error: error instanceof Error ? error : new Error(String(error)),
      message: `Failed to install ${dependency.displayName}`,
    });
    onProgress?.(progress);

    this.eventBus.emit("dependency:failed", {
      dependency: name,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    throw new DependencyError(name, "Installation failed", {
      cause: error instanceof Error ? error : new Error(String(error)),
      installCommand: dependency.installCommand,
    });
  }

  /**
   * Update a dependency
   */
  async updateDependency(name: string): Promise<void> {
    // For now, just reinstall
    await this.installDependency(name);
  }

  /**
   * Uninstall a dependency
   */
  async uninstallDependency(name: string): Promise<void> {
    throw new DependencyError(name, "Uninstall not implemented");
  }

  /**
   * Get dependency version
   */
  async getDependencyVersion(name: string): Promise<string> {
    const dependency = this.dependencies.get(name);
    if (dependency === undefined) {
      return "unknown";
    }

    // Check cache first
    const cacheKey = `dep-version-${name}`;
    const cached = await this.cache?.get<string>(cacheKey);
    if (typeof cached === "string") {
      return cached;
    }

    try {
      const version = await this.extractVersionByName(name);
      const cacheTimeMs = 3600000; // Cache for 1 hour
      await this.cache?.set(cacheKey, version, cacheTimeMs);
      return version;
    } catch {
      return "unknown";
    }
  }

  private async extractVersionByName(name: string): Promise<string> {
    const versionExtractors = {
      rust: { command: "rustc --version", pattern: /rustc (\d+\.\d+\.\d+)/ },
      cargo: { command: "cargo --version", pattern: /cargo (\d+\.\d+\.\d+)/ },
      volta: { command: "volta --version", pattern: /(\d+\.\d+\.\d+)/ },
      rio: { command: `${join(homedir(), ".cargo/bin/rio")} --version`, pattern: /rio (\d+\.\d+\.\d+)/ },
    };

    const key = name as keyof typeof versionExtractors;
    if (!(key in versionExtractors)) {
      return "unknown";
    }
    const extractor = versionExtractors[key];

    const output = await this.getCommandOutput(extractor.command);
    const match = extractor.pattern.exec(output);
    return match?.[1] ?? "unknown";
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<DependencyUpdate[]> {
    const updates: DependencyUpdate[] = [];

    // This would need to check package registries, GitHub releases, etc.
    // For now, returning empty array

    return updates;
  }

  /**
   * Private helper methods
   */

  private defineDependencies(): void {
    this.dependencies.set("rust", {
      name: "rust",
      displayName: "Rust",
      installed: false,
      checkCommand: "rustc --version",
      installCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      required: true,
    });

    this.dependencies.set("cargo", {
      name: "cargo",
      displayName: "Cargo",
      installed: false,
      checkCommand: "cargo --version",
      required: true,
    });

    this.dependencies.set("volta", {
      name: "volta",
      displayName: "Volta",
      installed: false,
      checkCommand: "volta --version",
      installCommand: "curl https://get.volta.sh | bash",
      required: false,
    });

    this.dependencies.set("rio", {
      name: "rio",
      displayName: "Rio Terminal",
      installed: false,
      path: join(homedir(), ".cargo/bin/rio"),
      installCommand: "cargo install rioterm",
      required: true,
    });
  }

  private async checkDependency(dependency: Dependency): Promise<boolean> {
    // Check by path if available
    if (isDefinedString(dependency.path)) {
      return existsSync(dependency.path);
    }

    // Check by command
    if (isDefinedString(dependency.checkCommand)) {
      try {
        await this.getCommandOutput(dependency.checkCommand);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private async executeCommand(
    command: string,
    options?: {
      onOutput?: (data: string) => void;
      timeout?: number;
    },
  ): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      const child = spawn(command, [], {
        shell: true,
        env: {
          ...process.env,
          PATH: `${join(homedir(), ".cargo/bin")}:${process.env.PATH ?? ""}`,
        },
      });

      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        options?.onOutput?.(text);
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        options?.onOutput?.(text);
      });

      child.on("error", (error: Error) => {
        reject(
          new ProcessError(`Command failed: ${command}`, {
            cause: error,
            command,
          }),
        );
      });

      child.on("exit", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new ProcessError(`Command exited with code ${code ?? "unknown"}`, {
              exitCode: code ?? undefined,
              command,
              stderr,
            }),
          );
        }
      });

      // Timeout handling
      if (typeof options?.timeout === "number") {
        const timeoutMs = options.timeout;
        setTimeout(() => {
          child.kill();
          reject(new TimeoutError(command, timeoutMs));
        }, timeoutMs);
      }
    });
  }

  private async getCommandOutput(command: string): Promise<string> {
    return new Promise<string>((resolve: (value: string) => void, reject: (error: Error) => void) => {
      const child = spawn(command, [], {
        shell: true,
        env: {
          ...process.env,
          PATH: `${join(homedir(), ".cargo/bin")}:${process.env.PATH ?? ""}`,
        },
      });

      let stdout = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.on("error", (error: Error) => {
        reject(error);
      });

      child.on("exit", (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code ?? "unknown"}`));
        }
      });
    });
  }
}
