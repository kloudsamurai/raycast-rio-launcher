import { showToast, Toast } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";

export interface CargoPackageConfig {
  name: string;
  packageName: string;
  binaryName: string;
}

export class CargoPackageManager {
  private commandExecutor: CommandExecutor;

  constructor() {
    this.commandExecutor = new CommandExecutor();
  }

  private async isPackageInstalled(binaryName: string): Promise<boolean> {
    const binaryPath = join(homedir(), ".cargo", "bin", binaryName);
    return existsSync(binaryPath);
  }

  async installPackage(config: CargoPackageConfig): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${config.name}...`,
    });

    try {
      const isInstalled = await this.isPackageInstalled(config.binaryName);

      if (isInstalled) {
        toast.style = Toast.Style.Success;
        toast.title = `${config.name} is already installed`;
        return true;
      }

      toast.style = Toast.Style.Animated;
      toast.title = `Installing ${config.name}`;
      toast.message = "Preparing installation...";

      const cargoPath = join(homedir(), ".cargo", "bin");
      const env = { PATH: `${cargoPath}:${process.env.PATH}` };

      let lastUpdate = Date.now();
      let outputBuffer = "";
      let downloadCount = 0;
      let compileCount = 0;

      const updateToast = (data: string) => {
        outputBuffer += data;
        const now = Date.now();

        if (now - lastUpdate > 1000) {
          const lines = outputBuffer.split("\n").filter((line) => line.trim());
          const recentLines = lines.slice(-5);

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
          outputBuffer = lines.slice(-10).join("\n");
        }
      };

      await this.commandExecutor.spawnProcess("cargo", ["install", config.packageName], {
        env,
        onData: updateToast,
      });

      toast.style = Toast.Style.Success;
      toast.title = `${config.name} installed successfully`;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = `Failed to install ${config.name}`;
      toast.message = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }
}
