import { showToast, Toast } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";

export class RioConfigManager {
  private commandExecutor: CommandExecutor;
  private readonly configRepo = "git@github.com:/cyrup-ai/cyrup-rioterm-config";

  constructor() {
    this.commandExecutor = new CommandExecutor();
  }

  private getConfigDirectory(): string {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgConfigHome, "rio");
  }

  private getConfigFile(): string {
    return join(this.getConfigDirectory(), "config.toml");
  }

  async ensureConfig(): Promise<void> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Checking Rio configuration...",
    });

    try {
      const configDir = this.getConfigDirectory();
      const configFile = this.getConfigFile();

      if (!existsSync(configDir) || !existsSync(configFile)) {
        toast.title = "Setting up Rio configuration...";
        toast.message = "Cloning default configuration from repository";

        const cloneCommand = `git clone ${this.configRepo} "${configDir}"`;
        await this.commandExecutor.execute(cloneCommand);

        toast.style = Toast.Style.Success;
        toast.title = "Rio configuration installed";
        toast.message = "Default configuration has been set up";
      } else {
        toast.style = Toast.Style.Success;
        toast.title = "Rio configuration found";
      }

      // Update the config to include symbol font fallback
      await this.ensureSymbolFontFallback(configFile);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to setup Rio configuration";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      console.error("Rio config setup failed:", error);
    }
  }

  private async ensureSymbolFontFallback(configFile: string): Promise<void> {
    try {
      const { readFileSync, writeFileSync } = await import("fs");
      const configContent = readFileSync(configFile, "utf-8");

      // Check if Symbols Nerd Font is already in extras
      if (!configContent.includes("Symbols Nerd Font")) {
        // Find the extras line and update it
        const updatedConfig = configContent.replace(
          /extras = \[{ family = "Noto Sans TC" }\]/,
          'extras = [{ family = "Noto Sans TC" }, { family = "Symbols Nerd Font" }]',
        );

        if (updatedConfig !== configContent) {
          writeFileSync(configFile, updatedConfig, "utf-8");
        }
      }
    } catch (error) {
      // Best effort - don't fail if we can't update the config
      console.error("Failed to update Rio config with symbol font:", error);
    }
  }
}
