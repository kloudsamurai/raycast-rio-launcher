/**
 * Rio Terminal specific type definitions
 * Based on official Rio documentation: https://rioterm.com/docs/config
 */

import type { Color } from "@raycast/api";

// Rio Configuration Types - matches Rio's actual config schema
export interface IRioConfig {
  // Top-level configuration properties
  "confirm-before-quit": boolean;
  "line-height": number;
  "hide-mouse-cursor-when-typing": boolean;
  "draw-bold-text-with-light-colors": boolean;
  "ignore-selection-foreground-color": boolean;
  "use-fork": boolean;
  "working-dir": string;
  "padding-x": number;
  "padding-y": [number, number];
  "option-as-alt": "left" | "right" | "both" | null;
  "env-vars": string[];
  theme: string;

  // Section-based configuration
  window: IRioWindowConfig;
  renderer: IRioRendererConfig;
  fonts: IRioFontConfig;
  navigation: IRioNavigationConfig;
  editor: IRioEditorConfig;
  keyboard: IRioKeyboardConfig;
  shell: IRioShellConfig;
  developer: IRioDeveloperConfig;
  colors: IRioColorConfig;
  cursor: IRioCursorConfig;
  scroll: IRioScrollConfig;
  title: IRioTitleConfig;
  platform: IRioPlatformConfig;
}

export interface IRioWindowConfig {
  width: number;
  height: number;
  mode: "Windowed" | "Maximized" | "Fullscreen";
  opacity: number;
  blur: boolean;
  decorations: "Enabled" | "Disabled" | "Transparent" | "Buttonless";
  "background-image"?: {
    path: string;
    opacity: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  "macos-use-unified-titlebar": boolean;
  "macos-use-shadow": boolean;
  "windows-corner-preference": "Default" | "DoNotRound" | "Round" | "RoundSmall";
  "windows-use-undecorated-shadow": boolean;
  "windows-use-no-redirection-bitmap": boolean;
}

export interface IRioRendererConfig {
  backend: "Automatic" | "GL" | "Vulkan" | "Metal" | "DX12" | "WebGPU";
  performance: "High" | "Low";
  "target-fps": number;
  "disable-unfocused-render": boolean;
  "disable-occluded-render": boolean;
  strategy: "events" | "game";
  filters: string[];
}

export interface IRioFontConfig {
  size: number;
  family: string;
  features: string[];
  "use-drawable-chars": boolean;
  "symbol-map": {
    start: string;
    end: string;
    "font-family": string;
  }[];
  "disable-warnings-not-found": boolean;
  "additional-dirs": string[];
  hinting: boolean;
  regular: IRioFontVariant;
  bold: IRioFontVariant;
  italic: IRioFontVariant;
  "bold-italic": IRioFontVariant;
  extras: { family: string }[];
  emoji: { family: string };
}

export interface IRioFontVariant {
  family: string;
  style: string;
  width: string;
  weight: number;
}

export interface IRioNavigationConfig {
  mode: "Bookmark" | "NativeTab" | "BottomTab" | "TopTab" | "Plain";
  "use-split": boolean;
  "unfocused-split-opacity": number;
  "open-config-with-split": boolean;
  "color-automation": {
    program?: string;
    path?: string;
    color: string;
  }[];
  "hide-if-single": boolean;
  "use-current-path": boolean;
}

export interface IRioEditorConfig {
  program: string;
  args: string[];
}

export interface IRioKeyboardConfig {
  "disable-ctlseqs-alt": boolean;
  "ime-cursor-positioning": boolean;
}

export interface IRioShellConfig {
  program: string;
  args: string[];
}

export interface IRioDeveloperConfig {
  "log-level": "OFF" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";
  "enable-log-file": boolean;
}

export interface IRioTitleConfig {
  content: string;
  placeholder: string;
}

export interface IRioPlatformConfig {
  windows: Partial<Pick<IRioConfig, "shell" | "navigation" | "renderer" | "window">>;
  linux: Partial<Pick<IRioConfig, "shell" | "navigation" | "renderer" | "window">>;
  macos: Partial<Pick<IRioConfig, "shell" | "navigation" | "renderer" | "window">>;
}

export interface IRioColorConfig {
  // Basic colors
  background: string;
  foreground: string;

  // Cursor colors
  cursor: string;
  "vi-cursor": string;

  // Navigation colors
  tabs: string;
  "tabs-foreground": string;
  "tabs-active": string;
  "tabs-active-highlight": string;
  "tabs-active-foreground": string;
  bar: string;

  // Search colors
  "search-match-background": string;
  "search-match-foreground": string;
  "search-focused-match-background": string;
  "search-focused-match-foreground": string;

  // Selection colors
  "selection-foreground": string;
  "selection-background": string;

  // Regular ANSI colors
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;

  // Dim colors
  "dim-black": string;
  "dim-blue": string;
  "dim-cyan": string;
  "dim-foreground": string;
  "dim-green": string;
  "dim-magenta": string;
  "dim-red": string;
  "dim-white": string;
  "dim-yellow": string;

  // Light colors
  "light-black": string;
  "light-blue": string;
  "light-cyan": string;
  "light-foreground": string;
  "light-green": string;
  "light-magenta": string;
  "light-red": string;
  "light-white": string;
  "light-yellow": string;
}

export interface IRioCursorConfig {
  shape: "block" | "underline" | "beam";
  blinking: boolean;
  "blinking-interval": number;
}

export interface IRioScrollConfig {
  multiplier: number;
  divider: number;
}

// Rio Process and Session Types
export interface IRioProcess {
  pid: number;
  windowId: string;
  title: string;
  workingDirectory: string;
  startTime: Date;
  isActive: boolean;
}

export interface IRioSession {
  id: string;
  name: string;
  windowIds: string[];
  createdAt: Date;
  lastAccessedAt: Date;
  profile?: IRioProfile;
}

// Export aliases for backward compatibility
export type RioProcess = IRioProcess;
export type RioSession = IRioSession;

export interface IRioProfile {
  id: string;
  name: string;
  icon?: string;
  color?: Color;
  config: Partial<IRioConfig>;
  environment?: Record<string, string>;
  workingDirectory?: string;
  shellCommand?: string;
  shellArgs?: string[];
}

// Export alias for backward compatibility
export type RioProfile = IRioProfile;

// Rio Feature Types (matching the existing feature system)
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

// Rio Theme Types
export interface IRioTheme {
  id: string;
  name: string;
  author?: string;
  colors: IRioColorConfig;
  cursor?: IRioCursorConfig;
  window?: Partial<IRioWindowConfig>;
}

// Export alias for backward compatibility
export type RioTheme = IRioTheme;

// Rio Command Types
export interface IRioCommand {
  id: string;
  command: string;
  description?: string;
  icon?: string;
  category?: string;
  aliases?: string[];
  requiresSudo?: boolean;
}

// Rio Launch Options
export interface IRioLaunchOptions {
  profile?: string;
  workingDirectory?: string;
  command?: string;
  args?: string[];
  environment?: Record<string, string>;
  windowBounds?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  sessionId?: string;
  attachToSession?: boolean;
}

// Command execution type for AI service
export interface IRioAICommand {
  command: string;
  description?: string;
  workingDirectory: string;
  timestamp: string;
}

// Error type for AI service
export interface IRioError extends Error {
  code?: string;
  context?: Record<string, unknown>;
}
