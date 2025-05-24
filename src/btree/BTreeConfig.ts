import { type Serializer } from "./serializers/Serializer";

/**
 * Configuration options for creating or opening a B-Tree.
 */
export interface BTreeConfig<K, V> {
  /** Unique identifier for the B-tree file within OPFS. */
  name: string;
  /** B-tree order (max number of children / 2). Affects node size. Default: 128. */
  order?: number;
  /** Serializer for keys. */
  keySerializer: Serializer<K>;
  /** Serializer for values. */
  valueSerializer: Serializer<V>;
  /** Number of nodes to cache in memory. Default: 1000. */
  cacheSize?: number;
  /**
   * Write mode.
   * 'write-through': Writes pass directly to disk (safer).
   * 'write-back': Writes are cached and flushed periodically (faster, risk of data loss on crash if not handled).
   * Default: 'write-through'.
   */
  writeMode?: "write-through" | "write-back";
  /** Enable transaction log for crash recovery. Default: false. */
  enableTransactionLog?: boolean;
  /**
   * Custom key comparison function.
   * Required if keys are not primitives that can be compared with <, >, ===.
   * Should return:
   * - A negative number if a < b
   * - Zero if a === b
   * - A positive number if a > b
   */
  compareKeys?: (a: K, b: K) => number;
  /**
   * The size of pages (blocks) in bytes used for storing nodes in the OPFS file.
   * This should be large enough to hold a node of the given order.
   * If not provided, a sensible default will be calculated based on the order.
   * Default: 4096.
   */
  pageSize?: number;
}

export interface BTreeStats {
  order: number;
  height: number;
  numNodes: number;
  numEntries: number;
  cacheSize: number;
  cacheHits: number;
  cacheMisses: number;
  fileSize: number; // Size of the OPFS file in bytes
  pageSize: number;
  // ... other relevant stats
}

export interface RangeOptions<K> {
  /** The starting key for the range query (inclusive by default). */
  startKey: K;
  /** The ending key for the range query (inclusive by default). */
  endKey: K;
  /** Whether the startKey is inclusive. Default: true. */
  inclusiveStart?: boolean;
  /** Whether the endKey is inclusive. Default: true. */
  inclusiveEnd?: boolean;
  /** Maximum number of entries to return. */
  limit?: number;
  /** Number of entries to skip. */
  offset?: number;
}

// Default values for configuration
export const DEFAULT_ORDER = 128;
export const DEFAULT_CACHE_SIZE = 1000;
export const DEFAULT_WRITE_MODE: "write-through" | "write-back" =
  "write-through";
export const DEFAULT_PAGE_SIZE = 4096; // 4KB
export const DEFAULT_TRANSACTION_LOG = false;

/**
 * Provides a default key comparison function for primitive types.
 * @param a The first key.
 * @param b The second key.
 * @returns Comparison result.
 */
export function defaultCompareKeys<K>(a: K, b: K): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
