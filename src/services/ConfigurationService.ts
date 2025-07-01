/**
 * Configuration service for managing Rio terminal configurations
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, watchFile, unwatchFile } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import * as toml from "@iarna/toml";
import { LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type {
  IConfigurationService,
  IValidationResult,
  IValidationError,
  IValidationWarning,
  IConfigDiff,
} from "../types/services";
import type { IRioConfig } from "../types/rio";
import { ConfigurationError, FileSystemError } from "../types/errors";
import { getEventBus } from "./EventBus";
import { isDefinedObject, isValidNumber } from "../utils/type-guards";

// Configuration validation constants
const MIN_WINDOW_WIDTH = 100;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 72;
const MIN_FPS = 1;
const MAX_FPS = 240;
const MIN_OPACITY = 0;
const MAX_OPACITY = 1;
const MIN_SCROLL_HISTORY = 0;
const RECOMMENDED_MIN_FONT_SIZE = 10;
const RECOMMENDED_MAX_FONT_SIZE = 24;
const DEBOUNCE_DELAY = 500;
const WATCH_INTERVAL = 1000;
const CURSOR_BLINKING_INTERVAL = 800;
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_WEIGHT_REGULAR = 400;
const DEFAULT_FONT_WEIGHT_BOLD = 800;
const DEFAULT_WINDOW_WIDTH = 600;
const DEFAULT_WINDOW_HEIGHT = 400;
const DEFAULT_TARGET_FPS = 60;
const DEFAULT_SCROLL_MULTIPLIER = 3.0;
const DEFAULT_SCROLL_DIVIDER = 1.0;
const DEFAULT_LINE_HEIGHT = 1.0;
const DEFAULT_PADDING = 0;

export class ConfigurationService extends BaseService implements IConfigurationService {
  private readonly configPath: string;
  private configCache: IRioConfig | null = null;
  private readonly configWatcher: unknown = null;
  private readonly watchCallbacks: Set<(config: IRioConfig) => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();

  // Configuration defaults based on official Rio documentation
  private readonly defaults: IRioConfig = {
    // Top-level properties
    "confirm-before-quit": true,
    "line-height": DEFAULT_LINE_HEIGHT,
    "hide-mouse-cursor-when-typing": false,
    "draw-bold-text-with-light-colors": false,
    "ignore-selection-foreground-color": false,
    "use-fork": false, // macOS: spawn, Linux/BSD: fork by default
    "working-dir": "",
    "padding-x": DEFAULT_PADDING,
    "padding-y": [DEFAULT_PADDING, DEFAULT_PADDING],
    "option-as-alt": null,
    "env-vars": [],
    theme: "",

    // Window configuration
    window: {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      mode: "Windowed",
      opacity: MAX_OPACITY,
      blur: false,
      decorations: "Enabled",
      "macos-use-unified-titlebar": false,
      "macos-use-shadow": false,
      "windows-corner-preference": "Default",
      "windows-use-undecorated-shadow": false,
      "windows-use-no-redirection-bitmap": false,
    },

    // Renderer configuration
    renderer: {
      backend: "Automatic",
      performance: "High",
      "target-fps": DEFAULT_TARGET_FPS,
      "disable-unfocused-render": false,
      "disable-occluded-render": true,
      strategy: "events",
      filters: [],
    },

    // Font configuration
    fonts: {
      size: DEFAULT_FONT_SIZE,
      family: "cascadiacode",
      features: [],
      "use-drawable-chars": true,
      "symbol-map": [],
      "disable-warnings-not-found": false,
      "additional-dirs": [],
      hinting: true,
      regular: {
        family: "cascadiacode",
        style: "Normal",
        width: "Normal",
        weight: DEFAULT_FONT_WEIGHT_REGULAR,
      },
      bold: {
        family: "cascadiacode",
        style: "Normal",
        width: "Normal",
        weight: DEFAULT_FONT_WEIGHT_BOLD,
      },
      italic: {
        family: "cascadiacode",
        style: "Italic",
        width: "Normal",
        weight: DEFAULT_FONT_WEIGHT_REGULAR,
      },
      "bold-italic": {
        family: "cascadiacode",
        style: "Italic",
        width: "Normal",
        weight: DEFAULT_FONT_WEIGHT_BOLD,
      },
      extras: [],
      emoji: { family: "" }, // Uses built-in Twemoji by default
    },

    // Navigation configuration
    navigation: {
      mode: "Bookmark",
      "use-split": true,
      "unfocused-split-opacity": 1.0,
      "open-config-with-split": false,
      "color-automation": [],
      "hide-if-single": true,
      "use-current-path": false,
    },

    // Editor configuration
    editor: {
      program: "vi",
      args: [],
    },

    // Keyboard configuration
    keyboard: {
      "disable-ctlseqs-alt": false,
      "ime-cursor-positioning": true,
    },

    // Shell configuration
    shell: {
      program: "", // Uses system default
      args: [],
    },

    // Developer configuration
    developer: {
      "log-level": "OFF",
      "enable-log-file": false,
    },

    // Colors configuration - Rio's default colors
    colors: {
      background: "#0F0D0E",
      foreground: "#F9F4DA",
      cursor: "#F712FF",
      "vi-cursor": "#12d0ff",
      tabs: "#12B5E5",
      "tabs-foreground": "#7d7d7d",
      "tabs-active": "#303030",
      "tabs-active-highlight": "#ffa133",
      "tabs-active-foreground": "#FFFFFF",
      bar: "#1b1a1a",
      "search-match-background": "#44C9F0",
      "search-match-foreground": "#FFFFFF",
      "search-focused-match-background": "#E6A003",
      "search-focused-match-foreground": "#FFFFFF",
      "selection-foreground": "#0F0D0E",
      "selection-background": "#44C9F0",
      black: "#4C4345",
      blue: "#006EE6",
      cyan: "#88DAF2",
      green: "#0BA95B",
      magenta: "#7B5EA7",
      red: "#ED203D",
      white: "#F1F1F1",
      yellow: "#FCBA28",
      "dim-black": "#1C191A",
      "dim-blue": "#0E91B7",
      "dim-cyan": "#93D4E7",
      "dim-foreground": "#ECDC8A",
      "dim-green": "#098749",
      "dim-magenta": "#624A87",
      "dim-red": "#C7102A",
      "dim-white": "#C1C1C1",
      "dim-yellow": "#E6A003",
      "light-black": "#ADA8A0",
      "light-blue": "#44C9F0",
      "light-cyan": "#7BE1FF",
      "light-foreground": "#F2EFE2",
      "light-green": "#0ED372",
      "light-magenta": "#9E88BE",
      "light-red": "#F25E73",
      "light-white": "#FFFFFF",
      "light-yellow": "#FDF170",
    },

    // Cursor configuration
    cursor: {
      shape: "block",
      blinking: false,
      "blinking-interval": CURSOR_BLINKING_INTERVAL,
    },

    // Scroll configuration
    scroll: {
      multiplier: DEFAULT_SCROLL_MULTIPLIER,
      divider: DEFAULT_SCROLL_DIVIDER,
    },

    // Title configuration
    title: {
      content: "{{ title || program }}",
      placeholder: "Rio Terminal",
    },

    // Platform-specific configuration
    platform: {
      windows: {},
      linux: {},
      macos: {},
    },
  };

  constructor(options?: IServiceOptions) {
    super("ConfigurationService", options);
    this.configPath = this.getDefaultConfigPath();
  }

  protected async onInitialize(): Promise<void> {
    // Ensure config directory exists
    const configDir = dirname(this.configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Load initial configuration
    await this.loadConfig();

    // Start watching for changes
    this.startWatching();
  }

  protected async onCleanup(): Promise<void> {
    this.stopWatching();
    this.configCache = null;
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Load configuration from disk - always returns a valid configuration
   */
  async loadConfig(): Promise<IRioConfig> {
    return this.trackPerformance("loadConfig", async () => {
      try {
        if (!existsSync(this.configPath)) {
          this.log("info", "Config file not found, creating default configuration");
          await this.createDefaultConfig();
        }

        const content = readFileSync(this.configPath, "utf-8");
        const config = toml.parse(content) as IRioConfig;

        // Validate configuration
        const validation = await this.validateConfig(config);
        if (!validation.valid) {
          this.log("warn", "Configuration validation failed", validation.errors);
          // Continue with invalid config but warn user
          this.eventBus.emit("config:validated", {
            valid: false,
            errors: validation.errors,
          });
        }

        // Cache the configuration
        this.configCache = config;

        // Store in LocalStorage for quick access
        await LocalStorage.setItem("rio-config-cache", JSON.stringify(config));

        return config;
      } catch (error) {
        this.log("error", "Failed to load configuration, using defaults", error);

        // Return default configuration on any error
        const defaultConfig = { ...this.defaults };
        this.configCache = defaultConfig;

        // Try to save the default configuration for next time
        try {
          await this.saveConfig(defaultConfig);
        } catch (saveError) {
          this.log("warn", "Failed to save default configuration", saveError);
        }

        return defaultConfig;
      }
    });
  }

  /**
   * Save configuration to disk
   */
  async saveConfig(config: IRioConfig): Promise<void> {
    return this.trackPerformance("saveConfig", async () => {
      try {
        // Validate before saving
        const validation = await this.validateConfig(config);
        if (!validation.valid) {
          throw new ConfigurationError("Invalid configuration", {
            validationErrors: validation.errors,
          });
        }

        // Create backup before saving
        await this.createBackup();

        // Convert to TOML - ensure config is serializable
        const tomlContent = toml.stringify(config);

        // Write to disk
        writeFileSync(this.configPath, tomlContent, "utf-8");

        // Update cache
        this.configCache = config;

        // Update LocalStorage
        await LocalStorage.setItem("rio-config-cache", JSON.stringify(config));

        // Emit event
        this.eventBus.emit("config:saved", { path: this.configPath });

        this.log("info", "Configuration saved successfully");
      } catch (error) {
        throw new ConfigurationError("Failed to save configuration", {
          cause: error as Error,
          configPath: this.configPath,
        });
      }
    });
  }

  /**
   * Update configuration with partial changes
   */
  async updateConfig(updates: Partial<IRioConfig>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const newConfig = this.deepMerge(currentConfig, updates);

    // Calculate diff
    const diff = this.getDiff(currentConfig, newConfig);

    // Save updated configuration
    await this.saveConfig(newConfig);

    // Emit change event
    this.eventBus.emit("config:changed", {
      config: newConfig,
      changes: diff,
    });
  }

  /**
   * Validate window configuration settings
   */
  private validateWindowConfig(config: IRioConfig, errors: IValidationError[]): void {
    if (!isDefinedObject(config.window)) {
      return;
    }

    if (isValidNumber(config.window.width) && config.window.width < MIN_WINDOW_WIDTH) {
      errors.push({
        path: "window.width",
        message: `Window width must be at least ${MIN_WINDOW_WIDTH} pixels`,
        value: config.window.width,
      });
    }

    if (
      isValidNumber(config.window.opacity) &&
      (config.window.opacity < MIN_OPACITY || config.window.opacity > MAX_OPACITY)
    ) {
      errors.push({
        path: "window.opacity",
        message: `Window opacity must be between ${MIN_OPACITY} and ${MAX_OPACITY}`,
        value: config.window.opacity,
      });
    }
  }

  /**
   * Validate font configuration settings
   */
  private validateFontConfig(config: IRioConfig, errors: IValidationError[], warnings: IValidationWarning[]): void {
    if (!isDefinedObject(config.fonts)) {
      return;
    }

    if (isValidNumber(config.fonts.size) && config.fonts.size < MIN_FONT_SIZE) {
      errors.push({
        path: "fonts.size",
        message: `Font size must be at least ${MIN_FONT_SIZE}`,
        value: config.fonts.size,
      });
    }

    if (isValidNumber(config.fonts.size) && config.fonts.size > MAX_FONT_SIZE) {
      warnings.push({
        path: "fonts.size",
        message: `Font size above ${MAX_FONT_SIZE} may cause display issues`,
        suggestion: `Consider using a size between ${RECOMMENDED_MIN_FONT_SIZE} and ${RECOMMENDED_MAX_FONT_SIZE}`,
      });
    }
  }

  /**
   * Validate renderer configuration settings
   */
  private validateRendererConfig(config: IRioConfig, errors: IValidationError[]): void {
    if (!isDefinedObject(config.renderer)) {
      return;
    }

    const targetFps: unknown = config.renderer["target-fps"];
    if (isValidNumber(targetFps) && (targetFps < MIN_FPS || targetFps > MAX_FPS)) {
      errors.push({
        path: "renderer.target-fps",
        message: `Target FPS must be between ${MIN_FPS} and ${MAX_FPS}`,
        value: targetFps,
      });
    }
  }

  /**
   * Validate scroll configuration settings
   */
  private validateScrollConfig(config: IRioConfig, errors: IValidationError[]): void {
    if (!isDefinedObject(config.scroll)) {
      return;
    }

    const history: unknown = config.scroll.history;
    if (isValidNumber(history) && history < MIN_SCROLL_HISTORY) {
      errors.push({
        path: "scroll.history",
        message: "Scroll history must be non-negative",
        value: history,
      });
    }
  }

  /**
   * Validate color configuration settings
   */
  private validateColorConfig(config: IRioConfig, errors: IValidationError[]): void {
    if (!isDefinedObject(config.colors)) {
      return;
    }

    const colorRegex = /^#[0-9A-Fa-f]{6}$/u;
    for (const key in config.colors) {
      if (Object.prototype.hasOwnProperty.call(config.colors, key)) {
        const value: unknown = config.colors[key];
        if (typeof value === "string" && !colorRegex.test(value)) {
          errors.push({
            path: `colors.${key}`,
            message: "Invalid color format. Use hex format like #RRGGBB",
            value,
          });
        }
      }
    }
  }

  /**
   * Validate configuration
   */
  async validateConfig(config: IRioConfig): Promise<IValidationResult> {
    const errors: IValidationError[] = [];
    const warnings: IValidationWarning[] = [];

    // Use helper functions to validate each section
    this.validateWindowConfig(config, errors);
    this.validateFontConfig(config, errors, warnings);
    this.validateRendererConfig(config, errors);
    this.validateScrollConfig(config, errors);
    this.validateColorConfig(config, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Watch configuration file for changes
   */
  watchConfig(callback: (config: IRioConfig) => void): () => void {
    this.watchCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.watchCallbacks.delete(callback);
    };
  }

  /**
   * Export configuration to a file
   */
  async exportConfig(path: string): Promise<void> {
    try {
      const config = await this.loadConfig();
      const tomlContent = toml.stringify(config);

      // Add metadata
      const exportContent = [
        `# Rio Terminal Configuration Export`,
        `# Exported on: ${new Date().toISOString()}`,
        `# Version: 1.0`,
        ``,
        tomlContent,
      ].join("\n");

      writeFileSync(path, exportContent, "utf-8");

      this.log("info", `Configuration exported to ${path}`);
    } catch (error) {
      throw new FileSystemError("Failed to export configuration", {
        cause: error as Error,
        path,
        operation: "write",
      });
    }
  }

  /**
   * Import configuration from a file - always returns a valid configuration
   */
  async importConfig(path: string): Promise<IRioConfig> {
    try {
      if (!existsSync(path)) {
        throw new FileSystemError("Import file not found", {
          path,
          operation: "read",
          code: "ENOENT",
        });
      }

      const content = readFileSync(path, "utf-8");

      // Remove comments and metadata
      const cleanContent = content
        .split("\n")
        .filter((line: string) => !line.startsWith("#"))
        .join("\n");

      const config = toml.parse(cleanContent) as IRioConfig;

      // Validate imported configuration
      const validation = await this.validateConfig(config);
      if (!validation.valid) {
        throw new ConfigurationError("Imported configuration is invalid", {
          validationErrors: validation.errors,
        });
      }

      return config;
    } catch (error) {
      this.log("error", "Failed to import configuration, using defaults", error);

      // Return default configuration on import failure
      return { ...this.defaults };
    }
  }

  /**
   * Get configuration differences
   */
  getDiff(original: IRioConfig, modified: IRioConfig): IConfigDiff[] {
    const diffs: IConfigDiff[] = [];

    const checkRemovedKeys = (
      record1: Record<string, unknown>,
      record2: Record<string, unknown>,
      path: string,
    ): void => {
      for (const key in record1) {
        if (Object.prototype.hasOwnProperty.call(record1, key)) {
          const currentPath: string = path.length > 0 ? `${path}.${key}` : key;

          if (!(key in record2)) {
            diffs.push({
              path: currentPath,
              type: "removed",
              oldValue: record1[key],
            });
          }
        }
      }
    };

    const checkAddedAndModifiedKeys = (
      record1: Record<string, unknown>,
      record2: Record<string, unknown>,
      path: string,
      compareFunc: (obj1: unknown, obj2: unknown, path: string) => void,
    ): void => {
      for (const key in record2) {
        if (Object.prototype.hasOwnProperty.call(record2, key)) {
          const currentPath: string = path.length > 0 ? `${path}.${key}` : key;

          if (!(key in record1)) {
            diffs.push({
              path: currentPath,
              type: "added",
              newValue: record2[key],
            });
          } else if (isDefinedObject(record2[key]) && !Array.isArray(record2[key])) {
            // Recurse for objects
            compareFunc(record1[key], record2[key], currentPath);
          } else if (JSON.stringify(record1[key]) !== JSON.stringify(record2[key])) {
            diffs.push({
              path: currentPath,
              type: "modified",
              oldValue: record1[key],
              newValue: record2[key],
            });
          }
        }
      }
    };

    const compare = (obj1: unknown, obj2: unknown, path: string = ""): void => {
      if (!isDefinedObject(obj1) || !isDefinedObject(obj2)) {
        return;
      }

      const record1 = obj1 as Record<string, unknown>;
      const record2 = obj2 as Record<string, unknown>;

      checkRemovedKeys(record1, record2, path);
      checkAddedAndModifiedKeys(record1, record2, path, compare);
    };

    compare(original, modified);
    return diffs;
  }

  /**
   * Private helper methods
   */

  private getDefaultConfigPath(): string {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
    return join(xdgConfigHome, "rio", "config.toml");
  }

  private async createDefaultConfig(): Promise<void> {
    const defaultConfig: IRioConfig = {
      ...this.defaults,
    };

    await this.saveConfig(defaultConfig);
  }

  private async createBackup(): Promise<void> {
    if (!existsSync(this.configPath)) {
      return;
    }

    try {
      const backupPath = `${this.configPath}.backup`;
      const content = readFileSync(this.configPath, "utf-8");
      writeFileSync(backupPath, content, "utf-8");

      this.log("debug", `Configuration backup created at ${backupPath}`);
    } catch (error) {
      this.log("warn", "Failed to create configuration backup", error);
    }
  }

  private startWatching(): void {
    if (!existsSync(this.configPath)) {
      return;
    }

    watchFile(this.configPath, { interval: WATCH_INTERVAL }, () => {
      // Debounce file changes
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        const executeReload = async (): Promise<void> => {
          try {
            this.log("debug", "Configuration file changed, reloading...");
            const newConfig = await this.loadConfig();

            // Notify callbacks
            for (const callback of this.watchCallbacks) {
              try {
                callback(newConfig);
              } catch (error) {
                this.log("error", "Error in config watch callback", error);
              }
            }
          } catch (error) {
            this.log("error", "Failed to reload configuration", error);
          }
        };

        executeReload().catch((error: unknown) => {
          this.log("error", "Failed to execute reload", error);
        });
      }, DEBOUNCE_DELAY);
    });
  }

  private stopWatching(): void {
    // Clear debounce timer to prevent memory leaks
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Stop file watching
    if (existsSync(this.configPath)) {
      unwatchFile(this.configPath);
    }

    // Clear callbacks
    this.watchCallbacks.clear();
  }

  private isValidObject(value: unknown): value is Record<string, unknown> {
    return value !== null && value !== undefined && typeof value === "object";
  }

  private shouldMergeRecursively(value: unknown): boolean {
    return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
  }

  private mergeObjectProperties(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        if (this.shouldMergeRecursively(sourceValue)) {
          result[key] = this.deepMerge(result[key] ?? {}, sourceValue);
        } else {
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    if (!this.isValidObject(target)) {
      return source;
    }
    if (!this.isValidObject(source)) {
      return target;
    }

    return this.mergeObjectProperties(target, source);
  }
}
