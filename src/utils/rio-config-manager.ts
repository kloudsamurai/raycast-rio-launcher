import { showToast, Toast } from "@raycast/api";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";
import * as toml from "@iarna/toml";
import { isDefined, getErrorMessage } from "./type-guards";

// Type for Rio configuration - can be extended as needed
type RioConfigValue = string | number | boolean | RioConfigValue[] | { [key: string]: RioConfigValue };
type RioConfigObject = Record<string, RioConfigValue>;

export class RioConfigManager {
  private readonly commandExecutor: CommandExecutor;
  private readonly configRepo: string = "git@github.com:cyrup-ai/cyrup-rioterm-config.git";
  private readonly configRepoHttps: string = "https://github.com/cyrup-ai/cyrup-rioterm-config.git";

  constructor() {
    this.commandExecutor = new CommandExecutor();
  }

  private getConfigDirectory(): string {
    const xdgConfigHome: string = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
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

        // Try SSH first, fallback to HTTPS
        try {
          toast.message = "Cloning default configuration from repository (SSH)";
          const sshCloneCommand = `git clone ${this.configRepo} "${configDir}"`;
          await this.commandExecutor.execute(sshCloneCommand);
        } catch {
          try {
            toast.message = "Cloning default configuration from repository (HTTPS)";
            const httpsCloneCommand = `git clone ${this.configRepoHttps} "${configDir}"`;
            await this.commandExecutor.execute(httpsCloneCommand);
          } catch {
            // If both fail, create a minimal default config
            await this.createDefaultConfig(configDir, configFile);

            toast.style = Toast.Style.Success;
            toast.title = "Rio configuration created";
            toast.message = "Created minimal default configuration";
            return;
          }
        }

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

      // Log error but don't just console.error - throw so caller knows it failed
      throw new Error(`Rio config setup failed: ${getErrorMessage(error)}`);
    }
  }

  private async ensureSymbolFontFallback(configFile: string): Promise<void> {
    try {
      if (!existsSync(configFile)) {
        throw new Error(`Config file does not exist: ${configFile}`);
      }

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
        } else {
          // If the regex didn't match, log a warning but don't fail
          console.warn("Could not find expected font configuration pattern to update");
        }
      }
    } catch (error) {
      // Provide better error context instead of silent failure
      throw new Error(`Failed to update Rio config with symbol font: ${getErrorMessage(error)}`);
    }
  }

  private async createDefaultConfig(configDir: string, configFile: string): Promise<void> {
    try {
      // Create config directory
      const { mkdirSync } = await import("fs");
      mkdirSync(configDir, { recursive: true });

      // Create minimal default configuration
      const defaultConfig = `# Rio Terminal Configuration
# Generated by Rio Launcher

[window]
width = 900
height = 600
decorations = "Enabled"

[fonts]
family = "SF Mono"
size = 14

[colors]
background = "#000000"
foreground = "#FFFFFF"

[cursor]
shape = "Block"
blinking = true

[performance]
disable-renderer-when-unfocused = true
`;

      writeFileSync(configFile, defaultConfig, "utf-8");
    } catch (error) {
      throw new Error(`Failed to create default config: ${getErrorMessage(error)}`);
    }
  }

  async readConfig(): Promise<RioConfigObject | null> {
    try {
      const configFile = this.getConfigFile();
      if (existsSync(configFile)) {
        const content = readFileSync(configFile, "utf-8");

        try {
          return toml.parse(content) as RioConfigObject;
        } catch (parseError) {
          throw new Error(`Failed to parse TOML config: ${getErrorMessage(parseError)}`);
        }
      }

      // Config file doesn't exist - return null but log for debugging
      console.warn(`Rio config file not found: ${configFile}`);
      return null;
    } catch (error) {
      // Don't silently return null - throw the error so callers know something went wrong
      throw new Error(`Failed to read Rio config: ${getErrorMessage(error)}`);
    }
  }

  async updateConfig(updates: RioConfigObject): Promise<void> {
    const configFile = this.getConfigFile();

    try {
      // Read existing config
      let config: RioConfigObject = {};
      if (existsSync(configFile)) {
        const content = readFileSync(configFile, "utf-8");
        config = toml.parse(content) as RioConfigObject;
      }

      // Deep merge updates
      this.deepMerge(config, updates);

      // Write back as TOML
      const tomlContent = toml.stringify(config as toml.JsonMap);
      writeFileSync(configFile, tomlContent, "utf-8");
    } catch (error) {
      throw new Error(`Failed to update Rio config: ${getErrorMessage(error)}`);
    }
  }

  getConfigValue(config: RioConfigObject, path: string): RioConfigValue | undefined {
    const keys = path.split(".");
    let value: RioConfigValue = config;

    for (const key of keys) {
      if (isDefined(value) && typeof value === "object" && !Array.isArray(value) && key in value) {
        value = (value as RioConfigObject)[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private deepMerge(target: RioConfigObject, source: RioConfigObject): RioConfigObject {
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const sourceValue = source[key];
      if (isDefined(sourceValue) && typeof sourceValue === "object" && !Array.isArray(sourceValue)) {
        // Ensure target[key] is an object
        if (!isDefined(target[key]) || typeof target[key] !== "object" || Array.isArray(target[key])) {
          target[key] = {};
        }
        this.deepMerge(target[key] as RioConfigObject, sourceValue as RioConfigObject);
      } else {
        target[key] = sourceValue;
      }
    }
    return target;
  }
}
