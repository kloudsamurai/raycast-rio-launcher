/**
 * Proper Map implementation that returns null instead of undefined
 */
export class ProperMap<K, V> {
  private readonly map: Map<K, V> = new Map<K, V>();

  set(key: K, value: V): this {
    this.map.set(key, value);
    return this;
  }

  get(key: K): V | null {
    return this.map.get(key) ?? null;
  }

  getOrCreate(key: K, factory: () => V): V {
    const existing: V | undefined = this.map.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const newValue: V = factory();
    this.map.set(key, newValue);
    return newValue;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  // Iterator methods for 'for...of' loops
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
