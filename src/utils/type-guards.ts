/**
 * Type guard utilities for strict null checking
 * Based on TypeScript best practices for eliminating undefined/null states
 */

// Utility type to remove undefined from a type
export type NonUndefined<T> = T extends undefined ? never : T;

/**
 * Type guard to check if value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/**
 * Type guard for nullable string checks - ensures string is defined (not null/undefined)
 */
export function isDefinedString(value: string | null | undefined): value is string {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if string is not null, undefined, or empty
 */
export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Type guard for nullable object checks - ensures object is defined
 */
export function isDefinedObject<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for nullable boolean checks - ensures boolean is defined
 */
export function isDefinedBoolean(value: boolean | null | undefined): value is boolean {
  return value !== null && value !== undefined;
}

/**
 * Type guard for any value checks - checks if value is a non-null object
 */
export function isNonNullObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

/**
 * Basic truthiness check (returns boolean)
 */
export function checkTruthy(value: unknown): boolean {
  return Boolean(value);
}

/**
 * Type guard to check if value is a valid number (not NaN, null, or undefined)
 */
export function isValidNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Assertion function to ensure value is defined
 */
export function assertIsDefined<T>(value: T | null | undefined): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Value is null or undefined");
  }
}

/**
 * Assertion function to ensure string is non-empty
 */
export function assertIsNonEmptyString(value: string | null | undefined): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new Error("String is null, undefined, or empty");
  }
}

/**
 * Safe getter that returns null instead of undefined for Map.get()
 */
export function safeMapGet<K, V>(map: Map<K, V>, key: K): V | null {
  return map.get(key) ?? null;
}

/**
 * Safe property access with explicit null handling
 */
export function safeAccess<T, K extends keyof T>(obj: T | null | undefined, key: K): T[K] | null {
  if (obj === null || obj === undefined) {
    return null;
  }
  return obj[key];
}

/**
 * Safe array access with bounds checking
 */
export function safeArrayGet<T>(array: T[] | null | undefined, index: number): T | null {
  if (!Array.isArray(array) || index < 0 || index >= array.length) {
    return null;
  }
  return array[index];
}

/**
 * Type guard for checking if array is non-empty
 */
export function isNonEmptyArray<T>(array: T[] | null | undefined): array is T[] {
  return Array.isArray(array) && array.length > 0;
}

/**
 * Type guard for checking if object has required properties
 */
export function hasRequiredProperties<T extends Record<string, unknown>>(
  obj: unknown,
  requiredKeys: string[],
): obj is T {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;
  return requiredKeys.every((key: string) => key in record && record[key] !== undefined);
}

/**
 * Service-specific type guards
 */
import type { IRioConfig, IRioProfile, IRioTheme, IRioProcess, IRioSession } from "../types/rio";
import type { IProcessInfo, IFileSystemItem } from "../types/system";

export function isValidRioConfig(obj: unknown): obj is IRioConfig {
  return hasRequiredProperties(obj, [
    "window",
    "renderer",
    "fonts",
    "navigation",
    "editor",
    "keyboard",
    "shell",
    "developer",
    "colors",
    "cursor",
    "scroll",
    "title",
    "platform",
  ]);
}

export function isValidRioProfile(obj: unknown): obj is IRioProfile {
  return hasRequiredProperties(obj, ["id", "name", "config"]);
}

export function isValidRioTheme(obj: unknown): obj is IRioTheme {
  return hasRequiredProperties(obj, ["id", "name", "colors"]);
}

export function isValidRioProcess(obj: unknown): obj is IRioProcess {
  return hasRequiredProperties(obj, ["pid", "windowId", "title", "workingDirectory", "startTime", "isActive"]);
}

export function isValidRioSession(obj: unknown): obj is IRioSession {
  return hasRequiredProperties(obj, ["id", "name", "windowIds", "createdAt", "lastAccessedAt"]);
}

export function isValidProcessInfo(obj: unknown): obj is IProcessInfo {
  return hasRequiredProperties(obj, [
    "pid",
    "name",
    "command",
    "arguments",
    "workingDirectory",
    "environment",
    "startTime",
    "state",
  ]);
}

export function isValidFileSystemItem(obj: unknown): obj is IFileSystemItem {
  return hasRequiredProperties(obj, ["path", "name", "type", "isHidden"]);
}

/**
 * Service error handling utilities
 */
export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return isDefined(value) ? value : defaultValue;
}

export async function withDefaultAsync<T>(promise: Promise<T | null | undefined>, defaultValue: T): Promise<T> {
  return promise.then((value: T | null | undefined) => withDefault(value, defaultValue));
}

/**
 * Boolean expression safety for strict-boolean-expressions rule
 */
export function isTruthy<T>(value: T | null | undefined): value is NonNullable<T> {
  return Boolean(value);
}

export function isFalsy<T>(value: T | null | undefined): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Array filter helper that removes null/undefined and narrows types
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined);
}

/**
 * Promise result handling
 */
export async function safePromise<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Map operations with type safety
 */
export class SafeMap<K, V> extends Map<K, V> {
  safeGet(key: K): V | null {
    return super.get(key) ?? null;
  }

  getOrDefault(key: K, defaultValue: V): V {
    return super.get(key) ?? defaultValue;
  }

  safeSet(key: K, value: V | null | undefined): this {
    if (isDefined(value)) {
      super.set(key, value);
    }
    return this;
  }
}

/**
 * Safe error handling utilities with type guards
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function getErrorCode(error: unknown): string | null {
  if (error instanceof Error && "code" in error) {
    return typeof error.code === "string" ? error.code : null;
  }
  return null;
}

export function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return "UnknownError";
}

export function getErrorStack(error: unknown): string | null {
  if (error instanceof Error) {
    return error.stack ?? null;
  }
  return null;
}
