import { showToast, Toast } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";

export interface DependencyConfig {
  name: string;
  checkCommand: string;
  installCommand: string;
  installMessage: string;
}

export class DependencyChecker {
  private commandExecutor: CommandExecutor;

  constructor() {
    this.commandExecutor = new CommandExecutor();
  }

  async isCommandAvailable(command: string): Promise<boolean> {
    if (command === "rustc" || command === "cargo") {
      const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
      const rustPath = join(cargoHome, "bin", command);
      return existsSync(rustPath);
    }

    return this.commandExecutor.checkCommand(command);
  }

  async checkAndInstall(config: DependencyConfig): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${config.name}...`,
    });

    try {
      const isInstalled = await this.isCommandAvailable(config.checkCommand);

      if (isInstalled) {
        toast.style = Toast.Style.Success;
        toast.title = `${config.name} is already installed`;
        return true;
      }

      toast.title = config.installMessage;
      toast.message = "This may take a few minutes...";

      await this.commandExecutor.execute(config.installCommand);

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
