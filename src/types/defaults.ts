/**
 * Centralized default value builders for type-safe configuration
 * This eliminates nullable types by providing sensible defaults
 */

import type { IRioConfig, IRioProfile, IRioSession, IRioTheme, IRioLaunchOptions, IProcessInfo } from "./rio";
import type { IDependency } from "./system";
import type { ISessionRecording } from "./services";

/**
 * Default Rio configuration - always returns a complete, valid configuration
 */
export function createDefaultRioConfig(): IRioConfig {
  return {
    // Top-level properties
    "confirm-before-quit": true,
    "line-height": 1.0,
    "hide-mouse-cursor-when-typing": false,
    "draw-bold-text-with-light-colors": false,
    "ignore-selection-foreground-color": false,
    "use-fork": false,
    "working-dir": "",
    "padding-x": 0,
    "padding-y": [0, 0],
    "option-as-alt": null,
    "env-vars": [],
    theme: "",

    // Window configuration
    window: {
      width: 600,
      height: 400,
      mode: "Windowed",
      opacity: 1.0,
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
      "target-fps": 60,
      "disable-unfocused-render": false,
      "disable-occluded-render": true,
      strategy: "events",
      filters: [],
    },

    // Font configuration
    fonts: {
      size: 14,
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
        weight: 400,
      },
      bold: {
        family: "cascadiacode",
        style: "Normal",
        width: "Normal",
        weight: 800,
      },
      italic: {
        family: "cascadiacode",
        style: "Italic",
        width: "Normal",
        weight: 400,
      },
      "bold-italic": {
        family: "cascadiacode",
        style: "Italic",
        width: "Normal",
        weight: 800,
      },
      extras: [],
      emoji: { family: "" },
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
      program: "",
      args: [],
    },

    // Developer configuration
    developer: {
      "log-level": "OFF",
      "enable-log-file": false,
    },

    // Colors configuration
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
      "blinking-interval": 800,
    },

    // Scroll configuration
    scroll: {
      multiplier: 3.0,
      divider: 1.0,
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
}

/**
 * Default profile with sensible configuration
 */
export function createDefaultProfile(): IRioProfile {
  return {
    id: "default",
    name: "Default Profile",
    config: {},
  };
}

/**
 * Default launch options with all optional properties set to sensible defaults
 */
export function createDefaultLaunchOptions(overrides: Partial<IRioLaunchOptions> = {}): IRioLaunchOptions {
  return {
    attachToSession: false,
    ...overrides,
  };
}

/**
 * Default session for when a session ID is not found
 */
export function createDefaultSession(id: string = "default"): IRioSession {
  return {
    id,
    name: "Default Session",
    windowIds: [],
    createdAt: new Date(),
    lastAccessedAt: new Date(),
  };
}

/**
 * Default theme with Rio's standard color scheme
 */
export function createDefaultTheme(): IRioTheme {
  return {
    id: "default",
    name: "Default Theme",
    colors: createDefaultRioConfig().colors,
  };
}

/**
 * Default process info for when process details cannot be found
 */
export function createDefaultProcessInfo(pid: number): IProcessInfo {
  return {
    pid,
    name: "unknown",
    command: "unknown",
    arguments: [],
    workingDirectory: process.cwd(),
    environment: {},
    startTime: new Date(),
    state: "running",
  };
}

/**
 * Default dependency status
 */
export function createDefaultDependency(name: string): IDependency {
  return {
    name,
    displayName: name,
    installed: false,
    required: false,
  };
}

/**
 * Default session recording for when recording is not found
 */
export function createDefaultSessionRecording(sessionId: string): ISessionRecording {
  return {
    sessionId,
    startTime: new Date(),
    events: [],
    size: 0,
  };
}

/**
 * Default cache stats when cache is empty or unavailable
 */
export function createDefaultCacheStats(): { size: number; hits: number; misses: number; evictions: number } {
  return {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
  };
}

/**
 * Build a complete launch options object from partial input
 */
export function buildLaunchOptions(partial: Partial<IRioLaunchOptions> = {}): IRioLaunchOptions {
  const defaults = createDefaultLaunchOptions();
  return { ...defaults, ...partial };
}

/**
 * Build a complete profile object from partial input
 */
export function buildProfile(partial: Partial<IRioProfile>, id?: string): IRioProfile {
  const defaults = createDefaultProfile();
  return {
    ...defaults,
    ...partial,
    id: id ?? partial.id ?? defaults.id,
  };
}
