/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** undefined - Enable AI-powered suggestions for commands and configurations */
  "enableAISuggestions": boolean,
  /** undefined - Help improve the extension by sending anonymous usage data */
  "enableTelemetry": boolean,
  /** undefined - Show additional debugging information in logs */
  "enableDebugMode": boolean,
  /** undefined - Display the number of running Rio processes in the menu bar */
  "showCountInMenuBar": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `launch-rio` command */
  export type LaunchRio = ExtensionPreferences & {}
  /** Preferences accessible in the `configure-rio` command */
  export type ConfigureRio = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-sessions` command */
  export type ManageSessions = ExtensionPreferences & {}
  /** Preferences accessible in the `menu-bar` command */
  export type MenuBar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `launch-rio` command */
  export type LaunchRio = {}
  /** Arguments passed to the `configure-rio` command */
  export type ConfigureRio = {}
  /** Arguments passed to the `manage-sessions` command */
  export type ManageSessions = {}
  /** Arguments passed to the `menu-bar` command */
  export type MenuBar = {}
}

