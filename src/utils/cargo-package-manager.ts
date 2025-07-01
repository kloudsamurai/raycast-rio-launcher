import { showToast, Toast } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";
import { isDefined, isNonEmptyString } from "./type-guards";

// Constants for magic numbers
const TOAST_UPDATE_INTERVAL = 1000;
const RECENT_LINES_COUNT = -5;
const OUTPUT_BUFFER_LINES = -10;

export interface ICargoPackageConfig {
  name: string;
  packageName: string;
  binaryName: string;
}

export class CargoPackageManager {
  private readonly commandExecutor: CommandExecutor;

  constructor() {
    this.commandExecutor = new CommandExecutor();
  }

  private async isPackageInstalled(binaryName: string): Promise<boolean> {
    const binaryPath = join(homedir(), ".cargo", "bin", binaryName);
    return existsSync(binaryPath);
  }

  private processDownloadLine(line: string, downloadCount: number): { message: string; count: number } {
    if (line.includes("Downloading")) {
      const newCount = downloadCount + 1;
      return { message: `📦 Downloading dependencies... (${newCount})`, count: newCount };
    }
    if (line.includes("Downloaded")) {
      return { message: `✅ Downloaded ${downloadCount} dependencies`, count: downloadCount };
    }
    return { message: "", count: downloadCount };
  }

  private processCompileLine(line: string, compileCount: number): { message: string; count: number } {
    if (line.includes("Compiling")) {
      const match = /Compiling (\S+) v([\d.]+)/.exec(line);
      const newCount = compileCount + 1;
      if (isDefined(match)) {
        return { message: `🔨 Compiling ${match[1]} v${match[2]} (${newCount})`, count: newCount };
      }
      return { message: `🔨 Compiling... (${newCount})`, count: newCount };
    }
    return { message: "", count: compileCount };
  }

  private processBuildLine(line: string): string {
    if (line.includes("Building")) {
      const match = /Building \[([^\]]+)\]/.exec(line);
      if (isDefined(match)) {
        return `🏗️ Building [${match[1]}]`;
      }
      return "🏗️ Building...";
    }
    return "";
  }

  private processInstallLine(line: string): string {
    if (line.includes("Installing")) {
      const match = /Installing (.+) to/.exec(line);
      if (isDefined(match)) {
        return `📥 Installing ${match[1]}...`;
      }
      return "📥 Installing binary...";
    }
    return "";
  }

  private processFinishLine(line: string): string {
    if (line.includes("Finished")) {
      return "✨ Finishing up...";
    }
    return "";
  }

  private processCargoOutputLines(
    lines: string[],
    toast: Toast,
    counters: { downloadCount: number; compileCount: number },
  ): void {
    for (const line of lines) {
      const downloadResult = this.processDownloadLine(line, counters.downloadCount);
      if (isNonEmptyString(downloadResult.message)) {
        toast.message = downloadResult.message;
        counters.downloadCount = downloadResult.count;
        continue;
      }

      const compileResult = this.processCompileLine(line, counters.compileCount);
      if (isNonEmptyString(compileResult.message)) {
        toast.message = compileResult.message;
        counters.compileCount = compileResult.count;
        continue;
      }

      const buildMessage = this.processBuildLine(line);
      if (isNonEmptyString(buildMessage)) {
        toast.message = buildMessage;
        continue;
      }

      const finishMessage = this.processFinishLine(line);
      if (isNonEmptyString(finishMessage)) {
        toast.message = finishMessage;
        continue;
      }

      const installMessage = this.processInstallLine(line);
      if (isNonEmptyString(installMessage)) {
        toast.message = installMessage;
      }
    }
  }

  async installPackage(config: ICargoPackageConfig): Promise<boolean> {
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

      const updateToast = (data: string): void => {
        outputBuffer += data;
        const now = Date.now();

        if (now - lastUpdate > TOAST_UPDATE_INTERVAL) {
          const lines = outputBuffer.split("\n").filter((line: string) => isNonEmptyString(line.trim()));
          const recentLines = lines.slice(RECENT_LINES_COUNT);

          const counters = { downloadCount, compileCount };
          this.processCargoOutputLines(recentLines, toast, counters);
          downloadCount = counters.downloadCount;
          compileCount = counters.compileCount;

          lastUpdate = now;
          outputBuffer = lines.slice(OUTPUT_BUFFER_LINES).join("\n");
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
