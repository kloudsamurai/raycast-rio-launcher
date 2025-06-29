import { showToast, Toast } from "@raycast/api";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { homedir, platform } from "os";
import { join, delimiter } from "path";

const execAsync = promisify(exec);

export interface DependencyConfig {
  name: string;
  checkCommand: string;
  installCommand: string;
  installMessage: string;
}

export interface CargoPackageConfig {
  name: string;
  packageName: string;
  binaryName: string;
}

export class DependencyInstaller {
  private getSystemPaths(): string[] {
    const isWindows = platform() === "win32";

    if (isWindows) {
      // Windows system paths
      return [
        "C:\\Windows\\System32",
        "C:\\Windows",
        "C:\\Windows\\System32\\Wbem",
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\",
        process.env.PROGRAMFILES || "C:\\Program Files",
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      ];
    } else {
      // Unix-like system paths (macOS, Linux)
      return [
        "/bin",
        "/usr/bin",
        "/usr/local/bin",
        "/sbin",
        "/usr/sbin",
        "/opt/homebrew/bin", // macOS M1
        "/opt/local/bin", // MacPorts
        "/usr/local/sbin",
      ];
    }
  }

  private async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      // Build PATH with system paths first, then user's PATH
      const systemPaths = this.getSystemPaths();
      const existingPath = process.env.PATH || "";
      const pathSeparator = delimiter;

      // Filter out non-existent paths and join
      const validSystemPaths = systemPaths.filter((p) => existsSync(p));
      const fullPath = [...validSystemPaths, existingPath].join(pathSeparator);

      const result = await execAsync(command, {
        shell: process.env.SHELL || (platform() === "win32" ? "cmd.exe" : "/bin/sh"),
        env: {
          ...process.env,
          PATH: fullPath,
        },
      });
      return result;
    } catch (error) {
      throw new Error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async isCommandAvailable(command: string): Promise<boolean> {
    // For Rust/Cargo, check the actual binary locations
    if (command === "rustc" || command === "cargo") {
      const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
      const rustPath = join(cargoHome, "bin", command);
      return existsSync(rustPath);
    }

    // For other commands, try which
    try {
      await this.executeCommand(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  private async isCargoPackageInstalled(binaryName: string): Promise<boolean> {
    const binaryPath = join(homedir(), ".cargo", "bin", binaryName);
    return existsSync(binaryPath);
  }

  async checkAndInstallDependency(config: DependencyConfig): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${config.name}...`,
    });

    try {
      const isInstalled = await this.isCommandAvailable(config.checkCommand);

      // Debug: Show what was detected
      if (isInstalled) {
        toast.style = Toast.Style.Success;
        toast.title = `${config.name} is already installed`;
        return true;
      }

      if (!isInstalled) {
        toast.title = config.installMessage;
        toast.message = "This may take a few minutes...";

        await this.executeCommand(config.installCommand);

        toast.style = Toast.Style.Success;
        toast.title = `${config.name} installed successfully`;
        return true;
      }

      // This should never be reached due to early return above
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = `Failed to install ${config.name}`;
      toast.message = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }

  async checkAndInstallRust(): Promise<boolean> {
    return this.checkAndInstallDependency({
      name: "Rust",
      checkCommand: "rustc",
      installCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      installMessage: "Installing Rust...",
    });
  }

  async checkAndInstallCargo(): Promise<boolean> {
    return this.checkAndInstallDependency({
      name: "Cargo",
      checkCommand: "cargo",
      installCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      installMessage: "Installing Cargo...",
    });
  }

  async checkAndInstallCargoPackage(config: CargoPackageConfig): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${config.name}...`,
    });

    try {
      const isInstalled = await this.isCargoPackageInstalled(config.binaryName);

      if (!isInstalled) {
        toast.style = Toast.Style.Animated;
        toast.title = `Installing ${config.name}`;
        toast.message = "Preparing installation...";

        // Ensure cargo is in PATH
        const cargoPath = join(homedir(), ".cargo", "bin");
        const env = { ...process.env, PATH: `${cargoPath}:${process.env.PATH}` };

        // Use spawn to get real-time output
        await new Promise<void>((resolve, reject) => {
          const child = spawn("cargo", ["install", config.packageName], { env });

          let lastUpdate = Date.now();
          let outputBuffer = "";
          let downloadCount = 0;
          let compileCount = 0;

          const updateToast = (data: string) => {
            outputBuffer += data;
            const now = Date.now();

            // Update toast every 1 second for smoother animation
            if (now - lastUpdate > 1000) {
              const lines = outputBuffer.split("\n").filter((line) => line.trim());
              const recentLines = lines.slice(-5); // Check last 5 lines for better coverage

              // Parse cargo output for progress
              for (const line of recentLines) {
                if (line.includes("Downloading")) {
                  downloadCount++;
                  toast.message = `📦 Downloading dependencies... (${downloadCount})`;
                } else if (line.includes("Downloaded")) {
                  toast.message = `✅ Downloaded ${downloadCount} dependencies`;
                } else if (line.includes("Compiling")) {
                  const match = line.match(/Compiling (\S+) v([\d.]+)/);
                  compileCount++;
                  if (match) {
                    toast.message = `🔨 Compiling ${match[1]} v${match[2]} (${compileCount})`;
                  } else {
                    toast.message = `🔨 Compiling... (${compileCount})`;
                  }
                } else if (line.includes("Building")) {
                  const match = line.match(/Building \[([^\]]+)\]/);
                  if (match) {
                    toast.message = `🏗️ Building [${match[1]}]`;
                  } else {
                    toast.message = "🏗️ Building...";
                  }
                } else if (line.includes("Finished")) {
                  toast.message = "✨ Finishing up...";
                } else if (line.includes("Installing")) {
                  const match = line.match(/Installing (.+) to/);
                  if (match) {
                    toast.message = `📥 Installing ${match[1]}...`;
                  } else {
                    toast.message = "📥 Installing binary...";
                  }
                }
              }

              lastUpdate = now;
              outputBuffer = lines.slice(-10).join("\n"); // Keep only recent lines to prevent memory issues
            }
          };

          child.stdout.on("data", (data) => updateToast(data.toString()));
          child.stderr.on("data", (data) => updateToast(data.toString()));

          child.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Installation failed with exit code ${code}`));
            }
          });

          child.on("error", (error) => {
            reject(error);
          });
        });

        toast.style = Toast.Style.Success;
        toast.title = `${config.name} installed successfully`;
        return true;
      }

      toast.style = Toast.Style.Success;
      toast.title = `${config.name} is already installed`;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = `Failed to install ${config.name}`;
      toast.message = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }

  async ensureRustToolchain(): Promise<boolean> {
    try {
      // Check and install Rust/Cargo (they come together)
      await this.checkAndInstallRust();

      // Ensure cargo is available after installation
      const cargoPath = join(homedir(), ".cargo", "bin");
      process.env.PATH = `${cargoPath}:${process.env.PATH}`;

      return true;
    } catch (error) {
      throw new Error(`Failed to setup Rust toolchain: ${error}`);
    }
  }
}
