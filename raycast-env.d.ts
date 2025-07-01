/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `launch-rio` command */
  export type LaunchRio = ExtensionPreferences & {}
  /** Preferences accessible in the `launch-advanced` command */
  export type LaunchAdvanced = ExtensionPreferences & {}
  /** Preferences accessible in the `configure-rio` command */
  export type ConfigureRio = ExtensionPreferences & {}
  /** Preferences accessible in the `configure-advanced` command */
  export type ConfigureAdvanced = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-sessions` command */
  export type ManageSessions = ExtensionPreferences & {}
  /** Preferences accessible in the `menu-bar` command */
  export type MenuBar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `launch-rio` command */
  export type LaunchRio = {}
  /** Arguments passed to the `launch-advanced` command */
  export type LaunchAdvanced = {}
  /** Arguments passed to the `configure-rio` command */
  export type ConfigureRio = {}
  /** Arguments passed to the `configure-advanced` command */
  export type ConfigureAdvanced = {}
  /** Arguments passed to the `manage-sessions` command */
  export type ManageSessions = {}
  /** Arguments passed to the `menu-bar` command */
  export type MenuBar = {}
}

