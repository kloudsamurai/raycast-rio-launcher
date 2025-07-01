/**
 * Cache service for performance optimization
 */

import { Cache } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { ICacheService, CacheStats } from "../types/services";
import { getEventBus } from "./EventBus";
import { isDefinedString, isDefined, isValidNumber } from "../utils/type-guards";

interface ICacheEntry<T> {
  value: T;
  expiry?: number;
  created: number;
  accessed: number;
  hits: number;
}

export class CacheService extends BaseService implements ICacheService {
  private readonly cache: Cache;
  private readonly memoryCache: Map<string, ICacheEntry<unknown>> = new Map();
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private readonly stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  // Configuration constants - Magic numbers allowed for configuration defaults
  // eslint-disable-next-line no-magic-numbers
  private static readonly DEFAULT_MAX_SIZE_NUMBER: number = 100;
  // eslint-disable-next-line no-magic-numbers
  private static readonly MINUTE_IN_SECONDS: number = 60;
  // eslint-disable-next-line no-magic-numbers
  private static readonly MILLISECONDS_PER_SECOND: number = 1000;
  private static readonly DEFAULT_MAX_MEMORY_CACHE_SIZE: number = CacheService.DEFAULT_MAX_SIZE_NUMBER;
  private static readonly DEFAULT_CLEANUP_INTERVAL_MS: number =
    CacheService.MINUTE_IN_SECONDS * CacheService.MILLISECONDS_PER_SECOND; // 1 minute

  private readonly maxMemoryCacheSize: number = CacheService.DEFAULT_MAX_MEMORY_CACHE_SIZE;
  private readonly cleanupInterval: number = CacheService.DEFAULT_CLEANUP_INTERVAL_MS;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: IServiceOptions) {
    super("CacheService", options);
    this.cache = new Cache();
  }

  protected async onInitialize(): Promise<void> {
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupInterval);

    // Load stats from persistent cache
    await this.loadStats();
  }

  protected async onCleanup(): Promise<void> {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Save stats
    await this.saveStats();

    this.memoryCache.clear();
  }

  /**
   * Get a value from cache with optional default
   */
  async get<T>(key: string, defaultValue?: T): Promise<T | null>;
  async get<T>(key: string, defaultValue: T): Promise<T>;
  async get<T>(key: string, defaultValue?: T): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (isDefined(memEntry)) {
      // Check expiry
      if (isValidNumber(memEntry.expiry) && memEntry.expiry < Date.now()) {
        this.memoryCache.delete(key);
        this.incrementStatsEvictions();
        this.emitEventSafe("cache:evicted", { key, reason: "expired" });
      } else {
        // Cache hit
        memEntry.accessed = Date.now();
        memEntry.hits++;
        this.incrementStatsHits();
        this.emitEventSafe("cache:hit", { key });
        return memEntry.value as T;
      }
    }

    // Check persistent cache
    try {
      const stored = this.cache.get(key);
      if (isDefinedString(stored)) {
        const entry: ICacheEntry<T> = JSON.parse(stored) as ICacheEntry<T>;

        // Check expiry
        if (isValidNumber(entry.expiry) && entry.expiry < Date.now()) {
          this.cache.remove(key);
          this.incrementStatsEvictions();
          this.emitEventSafe("cache:evicted", { key, reason: "expired" });
          this.incrementStatsMisses();
          this.emitEventSafe("cache:miss", { key });
          return null;
        }

        // Promote to memory cache
        this.addToMemoryCache(key, entry);

        this.incrementStatsHits();
        this.emitEventSafe("cache:hit", { key });
        return entry.value;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", `Failed to get cache key ${key}`, error);
      } else {
        this.log("error", `Failed to get cache key ${key}`, new Error("Unknown error"));
      }
    }

    // Cache miss
    this.incrementStatsMisses();
    this.emitEventSafe("cache:miss", { key });
    return defaultValue ?? null;
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const entry: ICacheEntry<T> = {
      value,
      created: Date.now(),
      accessed: Date.now(),
      hits: 0,
      expiry: isValidNumber(ttl) ? Date.now() + ttl : undefined,
    };

    // Add to memory cache
    this.addToMemoryCache(key, entry);

    // Persist to disk cache
    try {
      this.cache.set(key, JSON.stringify(entry));
      this.incrementStatsSize();
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", `Failed to set cache key ${key}`, error);
      } else {
        this.log("error", `Failed to set cache key ${key}`, new Error("Unknown error"));
      }
      // Remove from memory cache if persistence fails
      this.memoryCache.delete(key);
      throw error;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);

    try {
      if (this.cache.has(key)) {
        this.cache.remove(key);
        this.decrementStatsSize();
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", `Failed to delete cache key ${key}`, error);
      } else {
        this.log("error", `Failed to delete cache key ${key}`, new Error("Unknown error"));
      }
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    try {
      this.cache.clear();
      (this.stats as { evictions: number; size: number }).evictions += (this.stats as { size: number }).size;
      this.setStatsSize(0);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to clear cache", error);
      } else {
        this.log("error", "Failed to clear cache", new Error("Unknown error"));
      }
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    // Check memory cache
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (isDefined(entry)) {
        if (!isValidNumber(entry.expiry) || entry.expiry >= Date.now()) {
          return true;
        }
      }
    }

    // Check persistent cache
    try {
      if (this.cache.has(key)) {
        const stored = this.cache.get(key);
        if (isDefinedString(stored)) {
          const entry: ICacheEntry<unknown> = JSON.parse(stored) as ICacheEntry<unknown>;
          return !isValidNumber(entry.expiry) || entry.expiry >= Date.now();
        }
      }
    } catch (error: unknown) {
      this.log("error", `Failed to check cache key ${key}`, error);
    }

    return false;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Private helper methods
   */

  private incrementStatsHits(): void {
    (this.stats as { hits: number }).hits++;
  }

  private incrementStatsMisses(): void {
    (this.stats as { misses: number }).misses++;
  }

  private incrementStatsEvictions(): void {
    (this.stats as { evictions: number }).evictions++;
  }

  private incrementStatsSize(): void {
    (this.stats as { size: number }).size++;
  }

  private decrementStatsSize(): void {
    (this.stats as { size: number }).size--;
  }

  private setStatsSize(value: number): void {
    (this.stats as { size: number }).size = value;
  }

  private emitEventSafe(event: string, data: unknown): void {
    (this.eventBus as { emit: (event: string, data: unknown) => Promise<void> }).emit(event, data).catch(() => {
      // Ignore event emission errors
    });
  }

  private addToMemoryCache<T>(key: string, entry: ICacheEntry<T>): void {
    // Check memory cache size limit
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      // Evict least recently used
      let lruKey: string | null = null;
      let lruAccessed = Date.now();

      for (const [k, v] of this.memoryCache) {
        if (v.accessed < lruAccessed) {
          lruKey = k;
          lruAccessed = v.accessed;
        }
      }

      if (isDefinedString(lruKey)) {
        this.memoryCache.delete(lruKey);
        this.incrementStatsEvictions();
        this.emitEventSafe("cache:evicted", { key: lruKey, reason: "lru" });
      }
    }

    this.memoryCache.set(key, entry);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Clean memory cache
    for (const [key, entry] of this.memoryCache) {
      if (isValidNumber(entry.expiry) && entry.expiry < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.memoryCache.delete(key);
      this.incrementStatsEvictions();
      this.emitEventSafe("cache:evicted", { key, reason: "expired" });
    }

    // Note: We don't clean persistent cache here as it's too expensive
    // Expired entries are cleaned on access
  }

  private async loadStats(): Promise<void> {
    try {
      const stored = this.cache.get("_cache_stats");
      if (isDefinedString(stored)) {
        this.parseAndUpdateStats(stored);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load cache stats", error);
      } else {
        this.log("error", "Failed to load cache stats", new Error("Unknown error"));
      }
    }
  }

  private parseAndUpdateStats(stored: string): void {
    try {
      const parsedData: unknown = JSON.parse(stored);
      if (typeof parsedData === "object" && parsedData !== null) {
        this.updateStatsFromCandidate(parsedData as Record<string, unknown>);
      }
    } catch {
      // Ignore parsing errors, keep default stats
    }
  }

  private updateStatsFromCandidate(candidateStats: Record<string, unknown>): void {
    if (
      typeof candidateStats.size === "number" &&
      typeof candidateStats.hits === "number" &&
      typeof candidateStats.misses === "number" &&
      typeof candidateStats.evictions === "number"
    ) {
      // Update individual properties since stats is readonly
      (this.stats as { size: number }).size = candidateStats.size;
      (this.stats as { hits: number }).hits = candidateStats.hits;
      (this.stats as { misses: number }).misses = candidateStats.misses;
      (this.stats as { evictions: number }).evictions = candidateStats.evictions;
    }
  }

  private async saveStats(): Promise<void> {
    try {
      this.cache.set("_cache_stats", JSON.stringify(this.stats));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save cache stats", error);
      } else {
        this.log("error", "Failed to save cache stats", new Error("Unknown error"));
      }
    }
  }
}

// Decorator for caching method results
export function cached(
  ttl?: number,
): (target: unknown, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
  return function (target: unknown, propertyName: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const method: (...args: unknown[]) => Promise<unknown> = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      const m: { getServiceRegistry: () => Promise<{ get: <T>(name: string) => Promise<T> }> } = (await import(
        "./base/ServiceRegistry"
      )) as { getServiceRegistry: () => Promise<{ get: <T>(name: string) => Promise<T> }> };
      const registry = await m.getServiceRegistry();
      const cacheService: CacheService = await registry.get<CacheService>("cache");

      const cacheKey = `${(target as { constructor: { name: string } }).constructor.name}.${propertyName}:${JSON.stringify(args)}`;

      // Try to get from cache
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Execute method and cache result
      const result = await method.apply(this, args);
      await cacheService.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}
