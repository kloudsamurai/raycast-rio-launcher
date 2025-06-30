import { exec, spawn } from "child_process";
import { promisify } from "util";
import { PathManager } from "./path-manager";

const execAsync = promisify(exec);

export interface ExecuteOptions {
  shell?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface SpawnOptions extends ExecuteOptions {
  onData?: (data: string) => void;
  onError?: (error: string) => void;
}

export class CommandExecutor {
  private pathManager: PathManager;

  constructor() {
    this.pathManager = PathManager.getInstance();
  }

  async execute(command: string, options: ExecuteOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const shell = options.shell || this.pathManager.getDefaultShell();
    const env = {
      ...process.env,
      PATH: this.pathManager.buildFullPath(),
      ...options.env,
    };

    try {
      const result = await execAsync(command, {
        shell,
        env,
        timeout: options.timeout,
      });
      return result;
    } catch (error) {
      throw new Error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  spawnProcess(command: string, args: string[], options: SpawnOptions = {}): Promise<number> {
    return new Promise((resolve, reject) => {
      const shell = options.shell || this.pathManager.getDefaultShell();
      const env = {
        ...process.env,
        PATH: this.pathManager.buildFullPath(),
        ...options.env,
      };

      const child = spawn(command, args, { shell, env });

      if (options.onData) {
        child.stdout.on("data", (data) => options.onData!(data.toString()));
        child.stderr.on("data", (data) => options.onData!(data.toString()));
      }

      if (options.onError) {
        child.on("error", (error) => options.onError!(error.message));
      }

      child.on("close", (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }

  async checkCommand(command: string): Promise<boolean> {
    try {
      await this.execute(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }
}
