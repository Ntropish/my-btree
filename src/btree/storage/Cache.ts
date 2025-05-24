/**
 * LRU Cache implementation for B-tree nodes
 */

export interface CacheEntry<T> {
  value: T;
  dirty?: boolean;
  accessCount: number;
  lastAccess: number;
}

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessList: K[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(
    private capacity: number,
    private onEvict?: (key: K, entry: CacheEntry<V>) => void | Promise<void>
  ) {}

  /**
   * Get a value from the cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;

    // Update access order
    this.updateAccessOrder(key);

    // Update entry metadata
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  async set(key: K, value: V, dirty = false): Promise<void> {
    // Check if key already exists
    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      existing.dirty = dirty || existing.dirty;
      this.updateAccessOrder(key);
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.capacity) {
      await this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      dirty,
      accessCount: 1,
      lastAccess: Date.now(),
    });

    this.accessList.push(key);
  }

  /**
   * Mark an entry as dirty
   */
  markDirty(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * Mark an entry as clean
   */
  markClean(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.dirty = false;
    }
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete an entry from the cache
   */
  async delete(key: K): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Call eviction handler if needed
    if (this.onEvict && entry.dirty) {
      await this.onEvict(key, entry);
    }

    this.cache.delete(key);
    this.removeFromAccessList(key);

    return true;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    // Write back all dirty entries
    if (this.onEvict) {
      const dirtyEntries = Array.from(this.cache.entries()).filter(
        ([_, entry]) => entry.dirty
      );

      for (const [key, entry] of dirtyEntries) {
        await this.onEvict(key, entry);
      }
    }

    this.cache.clear();
    this.accessList = [];
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get all dirty entries
   */
  getDirtyEntries(): Array<[K, V]> {
    return Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.dirty)
      .map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Flush all dirty entries
   */
  async flush(): Promise<void> {
    if (!this.onEvict) return;

    const dirtyEntries = this.getDirtyEntries();

    for (const [key, _] of dirtyEntries) {
      const entry = this.cache.get(key)!;
      await this.onEvict(key, entry);
      entry.dirty = false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate,
    };
  }

  /**
   * Get all entries (for debugging)
   */
  entries(): Array<[K, CacheEntry<V>]> {
    return Array.from(this.cache.entries());
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: K): void {
    this.removeFromAccessList(key);
    this.accessList.push(key);
  }

  /**
   * Remove key from access list
   */
  private removeFromAccessList(key: K): void {
    const index = this.accessList.indexOf(key);
    if (index !== -1) {
      this.accessList.splice(index, 1);
    }
  }

  /**
   * Evict least recently used entry
   */
  private async evictLRU(): Promise<void> {
    if (this.accessList.length === 0) return;

    const lruKey = this.accessList[0];
    const entry = this.cache.get(lruKey);

    if (!entry) return;

    // Call eviction handler
    if (this.onEvict && entry.dirty) {
      await this.onEvict(lruKey, entry);
    }

    this.cache.delete(lruKey);
    this.accessList.shift();
    this.stats.evictions++;
  }
}

/**
 * Write-through cache that immediately persists changes
 */
export class WriteThroughCache<K, V> extends LRUCache<K, V> {
  constructor(
    capacity: number,
    private persist: (key: K, value: V) => Promise<void>
  ) {
    super(capacity);
  }

  async set(key: K, value: V): Promise<void> {
    // Persist immediately
    await this.persist(key, value);

    // Then cache
    await super.set(key, value, false);
  }
}

/**
 * Write-back cache that batches writes
 */
export class WriteBackCache<K, V> extends LRUCache<K, V> {
  private flushTimer?: NodeJS.Timeout;
  private flushInterval = 5000; // 5 seconds

  constructor(
    capacity: number,
    private persist: (entries: Array<[K, V]>) => Promise<void>
  ) {
    super(capacity, async (key, entry) => {
      await this.persist([[key, entry.value]]);
    });

    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushInterval);
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();
    await this.clear();
  }

  async flush(): Promise<void> {
    const dirtyEntries = this.getDirtyEntries();

    if (dirtyEntries.length > 0) {
      await this.persist(dirtyEntries);

      // Mark all as clean
      for (const [key, _] of dirtyEntries) {
        this.markClean(key);
      }
    }
  }
}
