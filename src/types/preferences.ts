/**
 * Preference type definitions for Raycast extension
 */

import type { Color } from "@raycast/api";

// Extension Preferences (from Raycast manifest)
export interface IExtensionPreferences {
  // General preferences
  defaultProfile?: string;
  defaultWorkingDirectory?: string;
  launchInBackground?: boolean;

  // UI preferences
  theme?: "auto" | "light" | "dark";
  viewMode?: "list" | "grid" | "compact";
  showStatusInMenuBar?: boolean;

  // Feature toggles
  enableAISuggestions?: boolean;
  enableTelemetry?: boolean;
  enableAutoUpdate?: boolean;
  enableDebugMode?: boolean;

  // Performance preferences
  maxConcurrentDownloads?: number;
  cacheSize?: number;
  backgroundRefreshInterval?: number;

  // Security preferences
  requireConfirmationForDestructive?: boolean;
  storeCredentialsInKeychain?: boolean;

  // Developer preferences
  logLevel?: "error" | "warn" | "info" | "debug";
  showDeveloperTools?: boolean;
}

// Command-specific preferences
export interface ILaunchRioPreferences {
  alwaysUseDefaultProfile?: boolean;
  rememberLastDirectory?: boolean;
  showLaunchNotification?: boolean;
  windowPosition?: "remember" | "center" | "default";
}

export interface IConfigureRioPreferences {
  autoSaveChanges?: boolean;
  showAdvancedOptions?: boolean;
  backupBeforeChange?: boolean;
  validateOnSave?: boolean;
}

// User preferences stored locally
export interface IUserPreferences {
  // Recent items
  recentDirectories: IRecentItem[];
  recentProfiles: IRecentItem[];
  recentCommands: IRecentItem[];
  recentSSHHosts: IRecentItem[];

  // Favorites
  favoriteProfiles: string[];
  favoriteDirectories: string[];
  favoriteCommands: string[];

  // UI state
  lastSelectedView?: string;
  expandedSections: string[];
  columnWidths?: Record<string, number>;
  sortOrder?: ISortOrder;

  // Feature states
  hasSeenWelcome: boolean;
  hasCompletedTutorial: boolean;
  dismissedTips: string[];
  featureUsage: Record<string, number>;

  // Customization
  customShortcuts: Record<string, IKeyboardShortcut>;
  customColors: Record<string, Color>;
  customIcons: Record<string, string>;
}

// Export aliases for backward compatibility
export type UserPreferences = IUserPreferences;
export type RecentItem = IRecentItem;
export type SortOrder = ISortOrder;
export type KeyboardShortcut = IKeyboardShortcut;

export interface IRecentItem {
  value: string;
  label?: string;
  icon?: string;
  lastUsed: Date;
  frequency: number;
}

export interface ISortOrder {
  field: string;
  direction: "asc" | "desc";
}

export interface IKeyboardShortcut {
  modifiers: ("cmd" | "ctrl" | "opt" | "shift")[];
  key: string;
}

// Preference categories for organization
export enum PreferenceCategory {
  GENERAL = "general",
  APPEARANCE = "appearance",
  BEHAVIOR = "behavior",
  PERFORMANCE = "performance",
  SECURITY = "security",
  DEVELOPER = "developer",
  EXPERIMENTAL = "experimental",
}

// Preference metadata for dynamic forms
export interface IPreferenceMetadata {
  key: string;
  title: string;
  description?: string;
  category: PreferenceCategory;
  type: PreferenceType;
  defaultValue?: unknown;
  options?: IPreferenceOption[];
  validation?: (value: unknown) => string | undefined;
  visible?: (prefs: IExtensionPreferences) => boolean;
  requiresRestart?: boolean;
}

// Export alias for backward compatibility
export type ExtensionPreferences = IExtensionPreferences;
export type PreferenceOption = IPreferenceOption;

export type PreferenceType = "boolean" | "string" | "number" | "dropdown" | "color" | "file" | "directory" | "shortcut";

export interface IPreferenceOption {
  value: string;
  title: string;
  description?: string;
  icon?: string;
}

// Preference change tracking
export interface IPreferenceChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: Date;
  source: "user" | "sync" | "default";
}

// Export alias for backward compatibility
export type PreferenceChange = IPreferenceChange;

// Preference sync
export interface IPreferenceSyncState {
  lastSynced?: Date;
  syncEnabled: boolean;
  syncConflicts: ISyncConflict[];
  syncId?: string;
}

export interface ISyncConflict {
  key: string;
  localValue: unknown;
  remoteValue: unknown;
  localTimestamp: Date;
  remoteTimestamp: Date;
}

// Export alias for backward compatibility
export type SyncConflict = ISyncConflict;

// Preference export/import
export interface IPreferenceExport {
  version: string;
  timestamp: Date;
  preferences: IExtensionPreferences;
  userPreferences: IUserPreferences;
  profiles?: IRioProfile[];
  themes?: IRioTheme[];
}

// Type imports for completeness
import type { IRioProfile, IRioTheme } from "./rio";
