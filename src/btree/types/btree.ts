/**
 * Core B-Tree type definitions
 */

import { Serializer } from "../storage/Serializer";

/**
 * B-Tree configuration options
 */
export interface BTreeConfig<K, V> {
  /** Unique name for the B-tree file */
  name: string;

  /** B-tree order (minimum degree) - defaults to 128 */
  order?: number;

  /** Key serializer */
  keySerializer: Serializer<K>;

  /** Value serializer */
  valueSerializer: Serializer<V>;

  /** Cache size in number of nodes - defaults to 1000 */
  cacheSize?: number;

  /** Write mode - 'write-through' or 'write-back' */
  writeMode?: "write-through" | "write-back";

  /** Enable transaction log for crash recovery */
  enableTransactionLog?: boolean;

  /** Custom comparison function for keys */
  compareKeys?: (a: K, b: K) => number;
}

/**
 * B-Tree statistics
 */
export interface BTreeStats {
  /** Total number of nodes */
  nodeCount: number;

  /** Tree height */
  height: number;

  /** Total number of keys */
  keyCount: number;

  /** File size in bytes */
  fileSize: number;

  /** Cache hit rate */
  cacheHitRate: number;

  /** Number of nodes in cache */
  cachedNodes: number;
}

/**
 * B-Tree node interface
 */
export interface BTreeNode<K, V> {
  /** Node offset in file */
  offset: number;

  /** Whether this is a leaf node */
  isLeaf: boolean;

  /** Keys stored in this node */
  keys: K[];

  /** Values (only for leaf nodes) */
  values?: V[];

  /** Child node offsets (only for internal nodes) */
  childOffsets?: number[];

  /** Parent node offset */
  parentOffset: number;

  /** Sibling offsets for efficient range queries */
  leftSiblingOffset?: number;
  rightSiblingOffset?: number;
}

/**
 * Search result
 */
export interface SearchResult<K, V> {
  /** Found value */
  value: V | null;

  /** Node where key was found/should be */
  node: BTreeNode<K, V>;

  /** Index within the node */
  index: number;
}

/**
 * Range query options
 */
export interface RangeOptions {
  /** Include start key in results */
  includeStart?: boolean;

  /** Include end key in results */
  includeEnd?: boolean;

  /** Maximum number of results */
  limit?: number;

  /** Reverse order */
  reverse?: boolean;
}

/**
 * Cursor for iterating through the tree
 */
export interface BTreeCursor<K, V> {
  /** Get current key-value pair */
  current(): [K, V] | null;

  /** Move to next entry */
  next(): boolean;

  /** Move to previous entry */
  previous(): boolean;

  /** Check if cursor is valid */
  valid(): boolean;

  /** Close the cursor */
  close(): void;
}

/**
 * Transaction interface for batch operations
 */
export interface BTreeTransaction<K, V> {
  /** Insert a key-value pair */
  insert(key: K, value: V): void;

  /** Delete a key */
  delete(key: K): void;

  /** Commit the transaction */
  commit(): Promise<void>;

  /** Rollback the transaction */
  rollback(): Promise<void>;
}

/**
 * Bulk loading options
 */
export interface BulkLoadOptions {
  /** Whether input is already sorted */
  sorted?: boolean;

  /** Batch size for processing */
  batchSize?: number;

  /** Progress callback */
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Recovery options
 */
export interface RecoveryOptions {
  /** Force recovery even if file appears valid */
  force?: boolean;

  /** Attempt to recover partial data */
  partial?: boolean;

  /** Progress callback */
  onProgress?: (step: string, progress: number) => void;
}
