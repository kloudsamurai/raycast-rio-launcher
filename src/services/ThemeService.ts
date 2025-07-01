/**
 * Theme service for managing Rio terminal themes
 */

import { LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IThemeService } from "../types/services";
import type { IRioTheme } from "../types/rio";
import { ValidationError } from "../types/errors";
import { getEventBus } from "./EventBus";
import type { ConfigurationService } from "./ConfigurationService";
import { randomUUID } from "crypto";
import { isDefined, isDefinedString } from "../utils/type-guards";

const THEMES_STORAGE_KEY = "rio-themes";
const CURRENT_THEME_KEY = "rio-current-theme";

export class ThemeService extends BaseService implements IThemeService {
  private readonly themes: Map<string, IRioTheme> = new Map();
  private currentThemeId: string | null = null;
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private configService?: ConfigurationService;

  constructor(
    options?: IServiceOptions & {
      configService?: ConfigurationService;
    },
  ) {
    super("ThemeService", options);
    if (isDefined(options) && "configService" in options && isDefined(options.configService)) {
      this.configService = options.configService;
    }
  }

  protected async onInitialize(): Promise<void> {
    // Load themes first - config service is optional
    await this.loadThemes();
    await this.loadCurrentTheme();

    // Create default themes if none exist
    if (this.themes.size === 0) {
      await this.createDefaultThemes();
    }

    // Try to get config service but don't fail if not available
    try {
      if (!isDefined(this.configService)) {
        const { getServiceRegistry } = await import("./base/ServiceRegistry");
        const registry = getServiceRegistry();
        this.configService = await registry.get<ConfigurationService>("configuration");
      }
    } catch {
      // Config service is optional for theme service
      this.log("warn", "Could not get configuration service - theme sync disabled");
    }
  }

  protected async onCleanup(): Promise<void> {
    this.themes.clear();
    this.currentThemeId = null;
  }

  /**
   * Get all themes
   */
  async getThemes(): Promise<IRioTheme[]> {
    return Array.from(this.themes.values());
  }

  /**
   * Get a specific theme - returns current theme if not found
   */
  async getTheme(id: string): Promise<IRioTheme> {
    const theme = this.themes.get(id);
    if (isDefined(theme)) {
      return theme;
    }

    // Always return current theme as fallback - themes always exist
    return this.getCurrentTheme();
  }

  /**
   * Get current theme
   */
  async getCurrentTheme(): Promise<IRioTheme> {
    if (!isDefinedString(this.currentThemeId)) {
      // Return first theme as default
      const themes = Array.from(this.themes.values());
      const firstTheme = themes[0];
      return isDefined(firstTheme) ? firstTheme : this.createDefaultTheme();
    }

    const theme = this.themes.get(this.currentThemeId);
    if (!isDefined(theme)) {
      return this.createDefaultTheme();
    }

    return theme;
  }

  /**
   * Set current theme
   */
  async setTheme(id: string): Promise<void> {
    const theme = this.themes.get(id);
    if (!isDefined(theme)) {
      throw new ValidationError("Theme not found", {
        field: "id",
        value: id,
      });
    }

    this.currentThemeId = id;
    await LocalStorage.setItem(CURRENT_THEME_KEY, id);

    // Apply theme to configuration
    if (!isDefined(this.configService)) {
      throw new Error("Configuration service not initialized");
    }
    const config = await this.configService.loadConfig();
    const updatedConfig = {
      ...config,
      colors: theme.colors,
      cursor: theme.cursor,
      window: { ...config.window, ...theme.window },
    };

    await this.configService.updateConfig(updatedConfig);
    this.eventBus.emit("theme:changed", { theme });

    this.log("info", `Theme changed to '${theme.name}'`);
  }

  /**
   * Create a new theme
   */
  async createTheme(theme: Omit<IRioTheme, "id">): Promise<IRioTheme> {
    const newTheme: IRioTheme = {
      ...theme,
      id: randomUUID(),
    };

    this.themes.set(newTheme.id, newTheme);
    await this.saveThemes();

    this.log("info", `Theme '${newTheme.name}' created`);
    return newTheme;
  }

  /**
   * Update a theme
   */
  async updateTheme(id: string, updates: Partial<IRioTheme>): Promise<void> {
    const theme = this.themes.get(id);
    if (!isDefined(theme)) {
      throw new ValidationError("Theme not found", {
        field: "id",
        value: id,
      });
    }

    const updatedTheme: IRioTheme = {
      ...theme,
      ...updates,
      id, // Ensure ID doesn't change
    };

    this.themes.set(id, updatedTheme);
    await this.saveThemes();

    this.log("info", `Theme '${updatedTheme.name}' updated`);
  }

  /**
   * Delete a theme
   */
  async deleteTheme(id: string): Promise<void> {
    const theme = this.themes.get(id);
    if (!isDefined(theme)) {
      throw new ValidationError("Theme not found", {
        field: "id",
        value: id,
      });
    }

    // Don't allow deleting the last theme
    if (this.themes.size === 1) {
      throw new ValidationError("Cannot delete the last theme");
    }

    // If this is the current theme, clear current
    if (this.currentThemeId === id) {
      this.currentThemeId = null;
      await LocalStorage.removeItem(CURRENT_THEME_KEY);
    }

    this.themes.delete(id);
    await this.saveThemes();

    this.log("info", `Theme '${theme.name}' deleted`);
  }

  /**
   * Import a theme
   */
  async importTheme(_path: string): Promise<IRioTheme> {
    // Implementation would read theme from file
    throw new Error("Not implemented");
  }

  /**
   * Export a theme
   */
  async exportTheme(_id: string, _path: string): Promise<void> {
    // Implementation would write theme to file
    throw new Error("Not implemented");
  }

  /**
   * Preview a theme
   */
  async previewTheme(_theme: IRioTheme): Promise<string> {
    // Implementation would generate a preview image
    return "";
  }

  /**
   * Private helper methods
   */

  private async loadThemes(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(THEMES_STORAGE_KEY);
      if (isDefinedString(stored)) {
        const themes: IRioTheme[] = JSON.parse(stored) as IRioTheme[];
        for (const theme of themes) {
          this.themes.set(theme.id, theme);
        }
      }
    } catch {
      this.log("error", "Failed to load themes");
    }
  }

  private async saveThemes(): Promise<void> {
    const themes = Array.from(this.themes.values());
    await LocalStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(themes));
  }

  private async loadCurrentTheme(): Promise<void> {
    try {
      const themeId = await LocalStorage.getItem<string>(CURRENT_THEME_KEY);
      if (isDefinedString(themeId) && this.themes.has(themeId)) {
        this.currentThemeId = themeId;
      }
    } catch {
      this.log("error", "Failed to load current theme");
    }
  }

  private createDefaultTheme(): IRioTheme {
    return {
      id: "default",
      name: "Default",
      colors: {
        background: "#000000",
        foreground: "#FFFFFF",
      },
    };
  }

  private async createDefaultThemes(): Promise<void> {
    const defaultThemes: Omit<IRioTheme, "id">[] = [
      {
        name: "Dark",
        author: "Rio Terminal",
        colors: {
          background: "#1e1e2e",
          foreground: "#cdd6f4",
          cursor: "#f5e0dc",
          selection_background: "#585b70",
          selection_foreground: "#cdd6f4",
          // Base colors
          black: "#45475a",
          red: "#f38ba8",
          green: "#a6e3a1",
          yellow: "#f9e2af",
          blue: "#89b4fa",
          magenta: "#f5c2e7",
          cyan: "#94e2d5",
          white: "#bac2de",
          // Bright colors
          bright_black: "#585b70",
          bright_red: "#f38ba8",
          bright_green: "#a6e3a1",
          bright_yellow: "#f9e2af",
          bright_blue: "#89b4fa",
          bright_magenta: "#f5c2e7",
          bright_cyan: "#94e2d5",
          bright_white: "#a6adc8",
        },
      },
      {
        name: "Light",
        author: "Rio Terminal",
        colors: {
          background: "#eff1f5",
          foreground: "#4c4f69",
          cursor: "#dc8a78",
          selection_background: "#acb0be",
          selection_foreground: "#4c4f69",
          // Base colors
          black: "#5c5f77",
          red: "#d20f39",
          green: "#40a02b",
          yellow: "#df8e1d",
          blue: "#1e66f5",
          magenta: "#ea76cb",
          cyan: "#179299",
          white: "#acb0be",
          // Bright colors
          bright_black: "#6c6f85",
          bright_red: "#d20f39",
          bright_green: "#40a02b",
          bright_yellow: "#df8e1d",
          bright_blue: "#1e66f5",
          bright_magenta: "#ea76cb",
          bright_cyan: "#179299",
          bright_white: "#bcc0cc",
        },
      },
      {
        name: "Solarized Dark",
        author: "Ethan Schoonover",
        colors: {
          background: "#002b36",
          foreground: "#839496",
          cursor: "#839496",
          selection_background: "#073642",
          selection_foreground: "#93a1a1",
          // Base colors
          black: "#073642",
          red: "#dc322f",
          green: "#859900",
          yellow: "#b58900",
          blue: "#268bd2",
          magenta: "#d33682",
          cyan: "#2aa198",
          white: "#eee8d5",
          // Bright colors
          bright_black: "#002b36",
          bright_red: "#cb4b16",
          bright_green: "#586e75",
          bright_yellow: "#657b83",
          bright_blue: "#839496",
          bright_magenta: "#6c71c4",
          bright_cyan: "#93a1a1",
          bright_white: "#fdf6e3",
        },
      },
    ];

    for (const themeData of defaultThemes) {
      await this.createTheme(themeData);
    }

    // Set first theme as current
    const themes = Array.from(this.themes.values());
    if (themes.length > 0) {
      await this.setTheme(themes[0].id);
    }
  }
}
