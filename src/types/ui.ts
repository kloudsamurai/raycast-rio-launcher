/**
 * UI-related type definitions for Raycast components
 */

import type { Icon, Color, Image } from "@raycast/api";

// Bookmark Types
export interface IBookmark {
  path: string;
  name: string;
  icon: Icon;
}

// Export alias for backward compatibility
export type Bookmark = IBookmark;

// List View Types
export interface IListSection<T> {
  id: string;
  title: string;
  icon?: Image.ImageLike;
  items: T[];
  subtitle?: string;
}

export interface IListItemMetadata {
  icon?: Image.ImageLike;
  tintColor?: Color;
  tooltip?: string;
  tagList?: ITag[];
  accessories?: IAccessory[];
}

export interface ITag {
  value: string;
  color?: Color;
  icon?: Image.ImageLike;
}

export interface IAccessory {
  text?: string;
  icon?: Image.ImageLike;
  tooltip?: string;
  date?: Date;
  tag?: ITag;
}

// Export aliases for backward compatibility
export type Tag = ITag;
export type Accessory = IAccessory;

// Form Types
export interface IFormField {
  id: string;
  title: string;
  placeholder?: string;
  info?: string;
  error?: string;
  storeValue?: boolean;
}

export type FormValues = Record<string, unknown>;

export type FormValidation = Record<string, (value: unknown) => string | undefined>;

// Grid View Types
export interface IGridSection<T> {
  id: string;
  title?: string;
  subtitle?: string;
  aspectRatio?: "1" | "3/2" | "2/3" | "4/3" | "3/4" | "16/9" | "9/16";
  columns?: number;
  items: T[];
}

export interface IGridItemContent {
  value: Image.ImageLike | Color;
  tooltip?: string;
}

// Detail View Types
export interface IDetailMetadata {
  sections: IDetailSection[];
}

export interface IDetailSection {
  title?: string;
  items: DetailMetadataItem[];
}

export type DetailMetadataItem = IDetailLabel | IDetailLink | IDetailTagList | IDetailSeparator;

export interface IDetailLabel {
  type: "label";
  title: string;
  text?: string;
  icon?: Image.ImageLike;
}

export interface IDetailLink {
  type: "link";
  title: string;
  target: string;
  text: string;
}

export interface IDetailTagList {
  type: "tagList";
  title: string;
  tags: ITag[];
}

export interface IDetailSeparator {
  type: "separator";
}

// Export aliases for backward compatibility
export type DetailLabel = IDetailLabel;
export type DetailLink = IDetailLink;
export type DetailTagList = IDetailTagList;
export type DetailSeparator = IDetailSeparator;

// Action Types
export interface IActionConfig {
  title: string;
  icon?: Icon;
  shortcut?: IKeyboardShortcut;
  onAction: () => void | Promise<void>;
}

export interface IKeyboardShortcut {
  modifiers: ("cmd" | "ctrl" | "opt" | "shift")[];
  key: string;
}

// Export alias for backward compatibility
export type KeyboardShortcut = IKeyboardShortcut;

// Toast Types
export interface IToastConfig {
  title: string;
  message?: string;
  style: "success" | "failure" | "animated";
  primaryAction?: IToastAction;
  secondaryAction?: IToastAction;
}

export interface IToastAction {
  title: string;
  shortcut?: IKeyboardShortcut;
  onAction: () => void | Promise<void>;
}

// Export alias for backward compatibility
export type ToastAction = IToastAction;

// Alert Types
export interface IAlertConfig {
  title: string;
  message?: string;
  icon?: Icon;
  primaryAction?: IAlertAction;
  dismissAction?: IAlertAction;
  rememberUserChoice?: boolean;
}

export interface IAlertAction {
  title: string;
  style?: "default" | "destructive";
  onAction?: () => void | Promise<void>;
}

// Export alias for backward compatibility
export type AlertAction = IAlertAction;

// Navigation Types
export interface INavigationState {
  searchText: string;
  isLoading: boolean;
  selectedItemId?: string;
}

// Theme Types for UI
export interface IUITheme {
  primaryColor: Color;
  accentColor: Color;
  backgroundColor: Color;
  textColor: Color;
  errorColor: Color;
  warningColor: Color;
  successColor: Color;
}

// Loading States
export interface ILoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

// Error States
export interface IErrorState {
  hasError: boolean;
  error?: Error;
  errorMessage?: string;
  recoveryAction?: () => void | Promise<void>;
}

// Menu Bar Types
export interface IMenuBarSection {
  id: string;
  title?: string;
  items: IMenuBarItem[];
}

export interface IMenuBarItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: Image.ImageLike;
  shortcut?: IKeyboardShortcut;
  onAction?: () => void | Promise<void>;
  submenu?: IMenuBarSection;
}

// Export alias for backward compatibility
export type MenuBarItem = IMenuBarItem;
export type MenuBarSection = IMenuBarSection;

// Preference Types for UI
export interface IUIPreferences {
  theme?: "auto" | "light" | "dark";
  density?: "comfortable" | "compact";
  animations?: boolean;
  soundEffects?: boolean;
  showTips?: boolean;
  defaultView?: "list" | "grid" | "detail";
}
