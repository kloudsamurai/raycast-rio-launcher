/**
 * Process service for managing Rio terminal processes
 */

import { spawn, exec } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { getSelectedFinderItems, open, WindowManagement } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IProcessService, IRioLaunchOptions } from "../types/services";
import type { IRioProcess } from "../types/rio";
import type { IProcessInfo } from "../types/system";
import { ProcessError, FileSystemError } from "../types/errors";
import { getEventBus } from "./EventBus";
import type { ConfigurationService } from "./ConfigurationService";
import type { ProfileService } from "./ProfileService";
import { isDefinedString, isDefinedObject, isNonEmptyString } from "../utils/type-guards";
import { ProperMap } from "../utils/ProperMap";

// Constants for magic numbers
const PROCESS_TERMINATION_DELAY = 1000;
const PROCESS_MONITOR_INTERVAL = 5000;
const ASYNC_CALLBACK_INTERVAL = 1000;
const MAX_SAFE_PID = 2147483647;
const PROCESS_INFO_OFFSET_FROM_END = -4;
const CPU_USAGE_FIELD_OFFSET = 4;
const MEMORY_USAGE_FIELD_OFFSET = 3;
const STATE_FIELD_OFFSET = 2;

// Service registry interface for better type safety
interface IServiceRegistry {
  get: <T>(serviceName: string) => Promise<T>;
}

export class ProcessService extends BaseService implements IProcessService {
  private readonly processes: ProperMap<number, IRioProcess> = new ProperMap();
  private readonly processMonitors: ProperMap<number, ReturnType<typeof setInterval>> = new ProperMap();
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private configService: ConfigurationService | null = null;
  private profileService: ProfileService | null = null;

  constructor(
    options?: IServiceOptions & {
      configService?: ConfigurationService;
      profileService?: ProfileService;
    },
  ) {
    super("ProcessService", options);
    this.configService = options?.configService ?? null;
    this.profileService = options?.profileService ?? null;
  }

  protected async onInitialize(): Promise<void> {
    // Initialize services if not provided
    if (this.configService === null) {
      const registry: IServiceRegistry = await import("./base/ServiceRegistry").then(
        (m: { getServiceRegistry: () => IServiceRegistry }) => m.getServiceRegistry(),
      );
      this.configService = await registry.get<ConfigurationService>("configuration");
    }

    if (this.profileService === null) {
      const registry: IServiceRegistry = await import("./base/ServiceRegistry").then(
        (m: { getServiceRegistry: () => IServiceRegistry }) => m.getServiceRegistry(),
      );
      this.profileService = await registry.get<ProfileService>("profile");
    }

    // Scan for existing Rio processes
    await this.scanExistingProcesses();
  }

  protected async onCleanup(): Promise<void> {
    // Stop all monitors
    for (const monitor of this.processMonitors.values()) {
      clearInterval(monitor);
    }
    this.processMonitors.clear();
    this.processes.clear();
  }

  /**
   * Launch Rio with specified options
   */
  async launchRio(options: IRioLaunchOptions | null): Promise<IRioProcess> {
    return this.trackPerformance("launchRio", async () => {
      try {
        // Get Rio path
        const rioPath = this.getRioPath();
        if (!existsSync(rioPath)) {
          throw new FileSystemError("Rio not found", {
            path: rioPath,
            operation: "read",
            code: "ENOENT",
          });
        }

        // Build launch arguments
        const args = await this.buildLaunchArgs(options);
        const cwd = await this.getWorkingDirectory(options);

        // Log launch details
        this.log("info", `Launching Rio from ${rioPath}`, {
          args,
          cwd,
        });

        // Rio is a CLI binary, not a macOS .app bundle, so we use spawn
        const env = await this.buildEnvironment(options);
        const childProcess = spawn(rioPath, args, {
          cwd,
          env,
          detached: true,
          stdio: 'ignore',
        });

        if (childProcess.error) {
          throw new ProcessError("Failed to spawn Rio process", {
            cause: childProcess.error,
          });
        }

        if (!childProcess.pid) {
          throw new ProcessError("Rio process did not start (no PID)");
        }

        childProcess.unref();
        this.log("info", `Rio launched with PID: ${childProcess.pid}`);

        this.log("info", "Rio launched successfully");
        
        // Use the actual PID from the child process
        const processPid = childProcess.pid;

        // Create Rio process object
        const rioProcess: IRioProcess = {
          pid: processPid,
          windowId: `rio-${processPid}`,
          title:
            isDefinedString(options?.profile) && isNonEmptyString(options.profile)
              ? `Rio - ${options.profile}`
              : "Rio Terminal",
          workingDirectory: cwd,
          startTime: new Date(),
          isActive: true,
        };

        // Track process
        this.processes.set(rioProcess.pid, rioProcess);

        // Start monitoring
        this.startProcessMonitoring(rioProcess);

        // Emit event
        const eventBus = this.eventBus;
        try {
          eventBus.emit("rio:launched", { process: rioProcess });
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.log("error", "Failed to emit rio:launched event", error);
          } else {
            this.log("error", "Failed to emit rio:launched event", new Error(String(error)));
          }
        }

        // Track telemetry
        await this.trackEvent("launch", {
          profile: options?.profile ?? undefined,
          hasCommand: isDefinedString(options?.command),
          hasEnvironment: isDefinedObject(options?.environment),
        });

        return rioProcess;
      } catch (error: unknown) {
        await this.handleError(error, "Failed to launch Rio");
        throw error;
      }
    });
  }

  /**
   * Get all Rio processes
   */
  async getRioProcesses(): Promise<IRioProcess[]> {
    await this.scanExistingProcesses();
    return Array.from(this.processes.values());
  }

  /**
   * Kill a Rio process
   */
  async killProcess(pid: number): Promise<void> {
    return this.trackPerformance("killProcess", async (): Promise<void> => {
      try {
        const rioProcess: IRioProcess | null = this.processes.get(pid);
        if (rioProcess === null) {
          throw new ProcessError("Process not found", { pid });
        }

        // Validate PID and check if process exists
        const safePid: number = parseInt(pid.toString(), 10);
        if (!Number.isInteger(safePid) || safePid <= 0 || safePid > MAX_SAFE_PID) {
          throw new ProcessError("Invalid process ID", { pid });
        }

        // Check if process exists before attempting to kill
        try {
          process.kill(safePid, 0); // Signal 0 checks existence without killing
        } catch (error: unknown) {
          if (error instanceof Error && "code" in error) {
            const systemError = error as Error & { code: string };
            if (systemError.code === "ESRCH") {
              throw new ProcessError("Process does not exist", { pid: safePid });
            } else if (systemError.code === "EPERM") {
              throw new ProcessError("Permission denied to terminate process", { pid: safePid });
            }
          }
          throw new ProcessError("Failed to check process status", {
            cause: error instanceof Error ? error : new Error(String(error)),
            pid: safePid,
          });
        }

        // Kill the process
        try {
          process.kill(safePid, "SIGTERM");
        } catch (error: unknown) {
          throw new ProcessError("Failed to terminate process", {
            cause: error instanceof Error ? error : new Error(String(error)),
            pid: safePid,
          });
        }

        // Wait a bit and force kill if needed
        await new Promise<void>((resolve: () => void): void => {
          setTimeout(resolve, PROCESS_TERMINATION_DELAY);
        });

        try {
          process.kill(safePid, 0); // Check if still alive
          process.kill(safePid, "SIGKILL"); // Force kill
        } catch {
          // Process already dead - expected behavior
        }

        // Clean up tracking
        this.processes.delete(pid);
        const monitor: ReturnType<typeof setInterval> | null = this.processMonitors.get(pid);
        if (monitor !== null) {
          clearInterval(monitor);
          this.processMonitors.delete(pid);
        }

        // Emit event
        const eventBusRef = this.eventBus;
        try {
          eventBusRef.emit("rio:terminated", { pid });
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.log("error", "Failed to emit rio:terminated event", error);
          } else {
            this.log("error", "Failed to emit rio:terminated event", new Error(String(error)));
          }
        }

        this.log("info", `Rio process ${pid} terminated`);
      } catch (error: unknown) {
        throw new ProcessError("Failed to kill process", {
          cause: error instanceof Error ? error : new Error(String(error)),
          pid,
        });
      }
    });
  }

  /**
   * Attach to an existing Rio process
   */
  async attachToProcess(pid: number): Promise<void> {
    const rioProcess: IRioProcess | null = this.processes.get(pid);
    if (rioProcess === null) {
      throw new ProcessError("Process not found", { pid });
    }

    try {
      // Since Rio is a CLI app, we can't use Window Management API
      // Instead, we'll use AppleScript to bring Rio to front
      const script = `
        tell application "System Events"
          set frontProcess to first process whose unix id is ${pid}
          set frontmost of frontProcess to true
        end tell
      `;
      
      await new Promise<void>((resolve, reject) => {
        exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (error) => {
          if (error) {
            reject(new ProcessError("Failed to focus Rio window", { cause: error, pid }));
          } else {
            resolve();
          }
        });
      });
      
      this.log("info", `Focused Rio process: PID ${pid}`);
    } catch (error) {
      throw new ProcessError("Failed to attach to process", {
        cause: error instanceof Error ? error : new Error(String(error)),
        pid,
      });
    }
  }

  /**
   * Get detailed process information
   */
  async getProcessInfo(pid: number): Promise<IProcessInfo> {
    return new Promise<IProcessInfo>(
      (resolve: (value: IProcessInfo) => void, reject: (error: ProcessError) => void) => {
        exec(`ps -p ${pid} -o pid,comm,args,ppid,%cpu,%mem,state,etime`, (error: Error | null, stdout: string) => {
          if (error !== null) {
            reject(
              new ProcessError("Failed to get process info", {
                cause: error,
                pid,
              }),
            );
            return;
          }

          const lines: string[] = stdout.trim().split("\n");
          if (lines.length < 2) {
            reject(new ProcessError("Process not found", { pid }));
            return;
          }

          const parts: string[] = lines[1].trim().split(/\s+/);
          const [pidStr, name, ...rest] = parts;

          const processInfo: IRioProcess | null = this.processes.get(pid);
          resolve({
            pid: parseInt(pidStr, 10),
            name: isDefinedString(name) ? name : "",
            command: isDefinedString(name) ? name : "",
            arguments: rest.slice(0, PROCESS_INFO_OFFSET_FROM_END), // Remove last 4 fields
            workingDirectory: isDefinedString(processInfo?.workingDirectory) ? processInfo.workingDirectory : "",
            environment: {}, // Would need more complex parsing
            startTime: isDefinedObject(processInfo?.startTime) ? processInfo.startTime : new Date(),
            cpuUsage: parseFloat(
              isDefinedString(rest[rest.length - CPU_USAGE_FIELD_OFFSET])
                ? rest[rest.length - CPU_USAGE_FIELD_OFFSET]
                : "0",
            ),
            memoryUsage: parseFloat(
              isDefinedString(rest[rest.length - MEMORY_USAGE_FIELD_OFFSET])
                ? rest[rest.length - MEMORY_USAGE_FIELD_OFFSET]
                : "0",
            ),
            state: this.mapProcessState(
              isDefinedString(rest[rest.length - STATE_FIELD_OFFSET])
                ? rest[rest.length - STATE_FIELD_OFFSET]
                : "unknown",
            ),
          });
        });
      },
    );
  }

  /**
   * Monitor a process for changes
   */
  monitorProcess(pid: number, callback: (info: IProcessInfo) => void): () => void {
    const interval: ReturnType<typeof setInterval> = setInterval((): void => {
      (async (): Promise<void> => {
        try {
          const info: IProcessInfo = await this.getProcessInfo(pid);
          callback(info);
        } catch {
          // Process likely dead, stop monitoring
          clearInterval(interval);
          this.processMonitors.delete(pid);
        }
      })().catch(() => {
        // Ignore async errors in monitoring
      });
    }, ASYNC_CALLBACK_INTERVAL);

    this.processMonitors.set(pid, interval);

    // Return cleanup function
    return (): void => {
      clearInterval(interval);
      this.processMonitors.delete(pid);
    };
  }

  /**
   * Private helper methods
   */

  private getRioPath(): string {
    return join(homedir(), ".cargo", "bin", "rio");
  }

  private async buildLaunchArgs(options: IRioLaunchOptions | null): Promise<string[]> {
    const args: string[] = [];

    if (isDefinedObject(options)) {
      // Add working directory if specified
      if (isDefinedString(options.workingDirectory) && isNonEmptyString(options.workingDirectory)) {
        args.push("--working-directory", options.workingDirectory);
      }

      // Add command if specified
      if (isDefinedString(options.command) && isNonEmptyString(options.command)) {
        args.push("-e", options.command);
        if (isDefinedObject(options.args) && Array.isArray(options.args)) {
          args.push(...options.args);
        }
      }

      // Add window bounds if specified
      if (isDefinedObject(options.windowBounds)) {
        const windowBounds: { x?: number; y?: number; width?: number; height?: number } = options.windowBounds as {
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        };
        if (typeof windowBounds.x === "number" && typeof windowBounds.y === "number") {
          args.push("--position", `${windowBounds.x},${windowBounds.y}`);
        }
        if (typeof windowBounds.width === "number" && typeof windowBounds.height === "number") {
          args.push("--dimensions", `${windowBounds.width}x${windowBounds.height}`);
        }
      }
    }

    return args;
  }

  private async buildEnvironment(options: IRioLaunchOptions | null): Promise<Record<string, string>> {
    const envEntries: [string, string][] = Object.entries(process.env).filter(
      ([, value]: [string, string | undefined]): value is [string, string] => isDefinedString(value),
    ) as [string, string][];
    const env: Record<string, string> = Object.fromEntries(envEntries);

    if (isDefinedObject(options)) {
      // Add custom environment variables
      if (isDefinedObject(options.environment)) {
        Object.assign(env, options.environment);
      }

      // Add profile environment if specified
      if (isDefinedString(options.profile) && isDefinedObject(this.profileService)) {
        const profile = await this.profileService.getProfile(options.profile);
        if (isDefinedObject(profile) && isDefinedObject(profile.environment)) {
          Object.assign(env, profile.environment);
        }
      }
    }

    // Add cargo bin to PATH
    const cargoPath: string = join(homedir(), ".cargo", "bin");
    const currentPath: string | undefined = env.PATH;
    if (isDefinedString(currentPath) && currentPath !== "" && !currentPath.includes(cargoPath)) {
      env.PATH = `${cargoPath}:${currentPath}`;
    }

    return env;
  }

  private async getWorkingDirectory(options?: IRioLaunchOptions | null): Promise<string> {
    // Priority: options > Finder selection > home directory
    if (
      isDefinedObject(options) &&
      isDefinedString(options.workingDirectory) &&
      isNonEmptyString(options.workingDirectory)
    ) {
      return options.workingDirectory;
    }

    // Try to get from Finder
    try {
      const finderItems = await getSelectedFinderItems();
      if (finderItems.length > 0) {
        const firstItem = finderItems[0];
        if (isDefinedObject(firstItem) && isDefinedString(firstItem.path) && existsSync(firstItem.path)) {
          const stat = await import("fs/promises").then(
            async (m: { stat: (path: string) => Promise<{ isDirectory: () => boolean }> }) => m.stat(firstItem.path),
          );
          const isDirectory: boolean = stat.isDirectory();
          return isDirectory ? firstItem.path : join(firstItem.path, "..");
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("debug", "Could not get Finder selection", error);
      }
    }

    return homedir();
  }

  private async scanExistingProcesses(): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      // Look for the actual Rio binary process
      exec("ps aux | grep -E '[/]rio$' | awk '{print $2}'", (error: Error | null, stdout: string) => {
        if (error !== null) {
          // No Rio processes found
          resolve();
          return;
        }

        const pids: number[] = stdout
          .trim()
          .split("\n")
          .filter((line: string) => line.length > 0)
          .map((pid: string) => parseInt(pid, 10))
          .filter((pid: number) => !Number.isNaN(pid));

        // Clear and update tracked processes
        this.processes.clear();
        
        for (const pid of pids) {
          const rioProcess: IRioProcess = {
            pid,
            windowId: `rio-${pid}`,
            title: "Rio Terminal",
            workingDirectory: homedir(),
            startTime: new Date(),
            isActive: true,
          };
          this.processes.set(pid, rioProcess);
        }
        
        this.log("info", `Found ${this.processes.size} Rio process(es)`);
        resolve();
      });
    });
  }

  private startProcessMonitoring(rioProcess: IRioProcess): void {
    const checkInterval: ReturnType<typeof setInterval> = setInterval((): void => {
      (async (): Promise<void> => {
        try {
          // Check if process is still alive
          process.kill(rioProcess.pid, 0);
        } catch {
          // Process is dead
          this.processes.delete(rioProcess.pid);
          clearInterval(checkInterval);
          this.processMonitors.delete(rioProcess.pid);

          // Emit event
          const eventBusInstance = this.eventBus;
          try {
            eventBusInstance.emit("rio:terminated", {
              pid: rioProcess.pid,
              exitCode: 0,
            });
          } catch (emitError: unknown) {
            if (emitError instanceof Error) {
              this.log("error", "Failed to emit rio:terminated event", emitError);
            } else {
              this.log("error", "Failed to emit rio:terminated event", new Error(String(emitError)));
            }
          }
        }
      })().catch(() => {
        // Ignore async errors in monitoring
      });
    }, PROCESS_MONITOR_INTERVAL); // Check every 5 seconds

    this.processMonitors.set(rioProcess.pid, checkInterval);
  }

  private mapProcessState(state: string): IProcessInfo["state"] {
    switch (state.toUpperCase()) {
      case "R":
      case "S":
        return "running";
      case "T":
        return "stopped";
      case "Z":
        return "zombie";
      default:
        return "sleeping";
    }
  }
}
