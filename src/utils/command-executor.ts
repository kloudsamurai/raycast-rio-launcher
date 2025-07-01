import { exec, spawn } from "child_process";
import { promisify } from "util";
import { PathManager } from "./path-manager";
import { isNonEmptyString, isDefined } from "./type-guards";

const execAsync = promisify(exec);

// Allowed commands for security - extend this list as needed
const ALLOWED_COMMANDS = new Set([
  "rio",
  "git",
  "which",
  "where",
  "pgrep",
  "pkill",
  "osascript",
  "tmux",
  "screen",
  "ssh",
  "curl",
  "brew",
  "npm",
  "yarn",
  "node",
]);

// Command sanitization regex - only allow safe characters
const SAFE_COMMAND_REGEX = /^[a-zA-Z0-9\s\-_./:@]+$/;

// Default timeout constant to avoid magic numbers
const DEFAULT_TIMEOUT_MS = 30000;

export interface IExecuteOptions {
  shell?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ISpawnOptions extends IExecuteOptions {
  onData?: (data: string) => void;
  onError?: (error: string) => void;
}

export class CommandExecutor {
  private readonly pathManager: PathManager;

  constructor() {
    this.pathManager = PathManager.getInstance();
  }

  private validateCommand(command: string): void {
    if (!isNonEmptyString(command)) {
      throw new Error("Command must be a non-empty string");
    }
  }

  private validateAllowedCommand(baseCommand: string): void {
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(`Command '${baseCommand}' is not allowed`);
    }
  }

  private validateCommandSafety(command: string): void {
    if (!SAFE_COMMAND_REGEX.test(command)) {
      throw new Error("Command contains unsafe characters");
    }
  }

  async execute(command: string, options: IExecuteOptions = {}): Promise<{ stdout: string; stderr: string }> {
    // Validate and sanitize command
    this.validateCommand(command);
    this.validateCommandSafety(command);

    // Extract base command for whitelist check
    const baseCommand = command.trim().split(/\s+/)[0];
    if (!isDefined(baseCommand)) {
      throw new Error("Unable to extract base command");
    }
    this.validateAllowedCommand(baseCommand);

    const shell = options.shell ?? this.pathManager.getDefaultShell();
    const env = {
      ...process.env,
      PATH: this.pathManager.buildFullPath(),
      ...options.env,
    };

    try {
      const result = await execAsync(command, {
        shell,
        env,
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      });
      return result;
    } catch (error) {
      throw new Error(`Command '${baseCommand}' failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateSpawnArguments(args: string[]): void {
    if (!Array.isArray(args)) {
      throw new Error("Arguments must be an array");
    }

    // Validate all arguments for safety
    for (const arg of args) {
      if (!isNonEmptyString(arg) || !SAFE_COMMAND_REGEX.test(arg)) {
        throw new Error(`Unsafe argument: ${arg}`);
      }
    }
  }

  private setupProcessHandlers(
    child: ReturnType<typeof spawn>,
    options: ISpawnOptions,
    resolve: (value: number) => void,
    reject: (reason: Error) => void,
  ): void {
    if (isDefined(options.onData)) {
      child.stdout?.on("data", (data: Buffer) => {
        if (isDefined(options.onData) && isDefined(data) && typeof data.toString === "function") {
          options.onData(data.toString());
        }
      });
      child.stderr?.on("data", (data: Buffer) => {
        if (isDefined(options.onData) && isDefined(data) && typeof data.toString === "function") {
          options.onData(data.toString());
        }
      });
    }

    if (isDefined(options.onError)) {
      child.on("error", (error: Error) => {
        if (isDefined(options.onError)) {
          options.onError(error.message);
        }
      });
    }

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Process exited with code ${code ?? "unknown"}`));
      }
    });
  }

  async spawnProcess(command: string, args: string[], options: ISpawnOptions = {}): Promise<number> {
    return new Promise((resolve: (value: number) => void, reject: (reason: Error) => void) => {
      // Validate command
      this.validateCommand(command);
      this.validateAllowedCommand(command);
      this.validateSpawnArguments(args);

      const shell = options.shell ?? this.pathManager.getDefaultShell();
      const env = {
        ...process.env,
        PATH: this.pathManager.buildFullPath(),
        ...options.env,
      };

      const child = spawn(command, args, { shell, env });

      this.setupProcessHandlers(child, options, resolve, reject);
    });
  }

  async checkCommand(command: string): Promise<boolean> {
    try {
      // Validate command name
      if (!isNonEmptyString(command) || !SAFE_COMMAND_REGEX.test(command)) {
        return false;
      }

      // Use cross-platform command checking
      const checkCmd = process.platform === "win32" ? `where ${command}` : `which ${command}`;
      await this.execute(checkCmd);
      return true;
    } catch {
      return false;
    }
  }
}
