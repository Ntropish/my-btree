/**
 * OPFS B-Tree Library
 *
 * High-performance B-tree implementation using OPFS for persistent storage
 */

// Re-export main client class
export { BTreeClient as BTree } from "./client/BTreeClient";

// Export types
export type {
  BTreeConfig,
  BTreeStats,
  BTreeNode,
  SearchResult,
  RangeOptions,
  BTreeCursor,
  BTreeTransaction,
  BulkLoadOptions,
  RecoveryOptions,
} from "./types/btree";

// Export serializers
export {
  type Serializer,
  NumberSerializer,
  Int32Serializer,
  StringSerializer,
  BooleanSerializer,
  BigIntSerializer,
  JSONSerializer,
  CompositeSerializer,
} from "./storage/serializers";

// Export errors
export {
  BTreeError,
  FileError,
  NodeError,
  SerializationError,
  CorruptionError,
  NotInitializedError,
} from "./utils/errors";

// Version
export const VERSION = "0.1.0";
