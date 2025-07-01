import { isNonNullObject } from "./type-guards";

export interface IRioFeature {
  id: string;
  name: string;
  description: string;
  category: "navigation" | "display" | "input" | "performance" | "integration";
  configKey?: string;
  defaultValue?: unknown;
  requiresCheck?: () => Promise<boolean>;
  applyConfig?: (enabled: boolean) => unknown;
}

export const RIO_FEATURES: IRioFeature[] = [
  // Navigation Features
  {
    id: "color-automation",
    name: "Color Automation for Navigation",
    description: "Automatically change colors based on navigation context",
    category: "navigation",
    configKey: "navigation.color_automation",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ navigation: { color_automation: enabled } }),
  },
  {
    id: "vi-mode",
    name: "Vi Mode",
    description: "Enable Vim-style navigation and editing",
    category: "navigation",
    configKey: "editor.vi_mode",
    defaultValue: false,
    applyConfig: (enabled: boolean) => ({ editor: { vi_mode: { enabled } } }),
  },
  {
    id: "split-panels",
    name: "Split Panels",
    description: "Enable terminal split panels and multiplexing",
    category: "navigation",
    configKey: "navigation.split_mode",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ navigation: { split_mode: { enabled } } }),
  },

  // Display Features
  {
    id: "hyperlinks",
    name: "Hyperlinks",
    description: "Enable clickable hyperlinks in terminal",
    category: "display",
    configKey: "renderer.hyperlinks",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ renderer: { hyperlinks: enabled } }),
  },
  {
    id: "wide-color-gamut",
    name: "Wide Color Gamut",
    description: "Enable extended color support for better visuals",
    category: "display",
    configKey: "renderer.wide_color_gamut",
    defaultValue: true,
    requiresCheck: async (): Promise<boolean> => {
      // Check if system supports wide color gamut
      return process.platform === "darwin"; // macOS generally supports it
    },
    applyConfig: (enabled: boolean) => ({ renderer: { wide_color_gamut: enabled } }),
  },
  {
    id: "sixel-protocol",
    name: "Sixel Protocol",
    description: "Enable Sixel image protocol for inline images",
    category: "display",
    configKey: "renderer.sixel",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ renderer: { sixel_enabled: enabled } }),
  },
  {
    id: "iterm2-images",
    name: "iTerm2 Image Protocol",
    description: "Enable iTerm2 image protocol for inline images",
    category: "display",
    configKey: "renderer.iterm2_images",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ renderer: { iterm2_image_protocol: enabled } }),
  },

  // Input Features
  {
    id: "ime-support",
    name: "IME Support",
    description: "Enable Input Method Editor for international languages",
    category: "input",
    configKey: "keyboard.ime",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ keyboard: { ime: enabled } }),
  },
  {
    id: "kitty-keyboard",
    name: "Kitty Keyboard Protocol",
    description: "Enable enhanced keyboard protocol for better key handling",
    category: "input",
    configKey: "keyboard.kitty_protocol",
    defaultValue: false,
    applyConfig: (enabled: boolean) => ({ keyboard: { kitty_protocol: enabled } }),
  },

  // Performance Features
  {
    id: "gpu-acceleration",
    name: "GPU Acceleration",
    description: "Use GPU for rendering (Rio is already fast!)",
    category: "performance",
    configKey: "renderer.gpu_acceleration",
    defaultValue: true,
    requiresCheck: async (): Promise<boolean> => {
      // Could check for GPU availability
      return true;
    },
    applyConfig: (enabled: boolean) => ({ renderer: { disable_hardware_acceleration: !enabled } }),
  },

  // Integration Features
  {
    id: "shell-integration",
    name: "Shell Integration",
    description: "Enable deep shell integration for better experience",
    category: "integration",
    configKey: "shell.integration",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ shell: { integration: enabled } }),
  },
  {
    id: "multi-windows",
    name: "Multi-Window Support",
    description: "Enable multiple Rio windows",
    category: "integration",
    configKey: "window.multi_window",
    defaultValue: true,
    applyConfig: (enabled: boolean) => ({ window: { multi_window: enabled } }),
  },
];

export class RioFeatureDetector {
  async detectSupportedFeatures(): Promise<Set<string>> {
    const supported = new Set<string>();

    for (const feature of RIO_FEATURES) {
      if (feature.requiresCheck !== undefined) {
        const isSupported = await feature.requiresCheck();
        if (isSupported) {
          supported.add(feature.id);
        }
      } else {
        // If no check required, assume it's supported
        supported.add(feature.id);
      }
    }

    return supported;
  }

  getDefaultEnabledFeatures(): Set<string> {
    const enabled = new Set<string>();

    for (const feature of RIO_FEATURES) {
      if (feature.defaultValue === true) {
        enabled.add(feature.id);
      }
    }

    return enabled;
  }

  buildConfigFromFeatures(enabledFeatureIds: Set<string>): unknown {
    const config: unknown = {};

    for (const feature of RIO_FEATURES) {
      if (feature.applyConfig !== undefined && enabledFeatureIds.has(feature.id)) {
        const featureConfig = feature.applyConfig(true);
        // Deep merge the configuration
        this.deepMerge(config, featureConfig);
      }
    }

    return config;
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    if (!isNonNullObject(target)) {
      return source;
    }
    if (!isNonNullObject(source)) {
      return target;
    }

    const targetObj = target as Record<string, unknown>;
    const sourceObj = source as Record<string, unknown>;

    for (const key in sourceObj) {
      if (sourceObj[key] !== null && typeof sourceObj[key] === "object" && !Array.isArray(sourceObj[key])) {
        targetObj[key] = targetObj[key] ?? {};
        this.deepMerge(targetObj[key], sourceObj[key]);
      } else {
        targetObj[key] = sourceObj[key];
      }
    }
    return target;
  }
}

// Type alias for backward compatibility
export type RioFeature = IRioFeature;
