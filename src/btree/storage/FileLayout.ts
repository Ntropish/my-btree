/**
 * OPFS B-Tree File Layout
 *
 * File Structure:
 * [Header Block - 512 bytes]
 * [Node Block 0 - Variable size]
 * [Node Block 1 - Variable size]
 * ...
 * [Node Block N - Variable size]
 *
 * All offsets are in bytes from the beginning of the file
 */

export const MAGIC_NUMBER = 0x42545245; // 'BTRE' in hex
export const FILE_VERSION = 1;
export const HEADER_SIZE = 512; // bytes
export const MIN_NODE_SIZE = 256; // minimum node size in bytes

/**
 * File Header Structure (512 bytes total)
 */
export interface FileHeader {
  // Identification (16 bytes)
  magicNumber: number; // 4 bytes - 0x42545245 ('BTRE')
  version: number; // 4 bytes - File format version
  checksum: number; // 4 bytes - Header checksum
  _reserved1: number; // 4 bytes - Reserved for future use

  // B-Tree Configuration (16 bytes)
  order: number; // 4 bytes - B-tree order (degree)
  keySize: number; // 4 bytes - Fixed key size (0 for variable)
  valueSize: number; // 4 bytes - Fixed value size (0 for variable)
  nodeSize: number; // 4 bytes - Fixed node size in bytes

  // Tree State (24 bytes)
  rootOffset: number; // 8 bytes - Root node file offset
  nodeCount: number; // 8 bytes - Total number of nodes
  height: number; // 4 bytes - Tree height
  _reserved2: number; // 4 bytes - Reserved

  // Free Space Management (16 bytes)
  freeListHead: number; // 8 bytes - First free node offset
  totalFileSize: number; // 8 bytes - Total file size in bytes

  // Metadata (32 bytes)
  createdAt: number; // 8 bytes - Creation timestamp
  modifiedAt: number; // 8 bytes - Last modification timestamp
  transactionId: number; // 8 bytes - Last transaction ID
  flags: number; // 8 bytes - Feature flags

  // Serializer Configuration (32 bytes)
  keySerializerType: string; // 16 bytes - Key serializer identifier
  valueSerializerType: string; // 16 bytes - Value serializer identifier

  // Reserved for future use (remaining bytes to 512)
  _reserved: Uint8Array; // 376 bytes
}

/**
 * Node Types
 */
export enum NodeType {
  Internal = 0,
  Leaf = 1,
}

/**
 * Node Header Structure (64 bytes)
 */
export interface NodeHeader {
  // Node Identification (16 bytes)
  type: NodeType; // 1 byte - Node type
  isDeleted: boolean; // 1 byte - Deletion flag
  keyCount: number; // 2 bytes - Number of keys
  checksum: number; // 4 bytes - Node checksum
  nodeId: number; // 8 bytes - Unique node identifier

  // Tree Structure (32 bytes)
  parentOffset: number; // 8 bytes - Parent node offset
  leftSiblingOffset: number; // 8 bytes - Left sibling offset (for leaves)
  rightSiblingOffset: number; // 8 bytes - Right sibling offset (for leaves)
  _reserved1: number; // 8 bytes - Reserved

  // Metadata (16 bytes)
  createdAt: number; // 8 bytes - Creation timestamp
  modifiedAt: number; // 8 bytes - Last modification timestamp
}

/**
 * Node Layout in File
 */
export interface NodeLayout {
  header: NodeHeader; // 64 bytes
  // For internal nodes: [child_offset_0][key_0][child_offset_1][key_1]...[child_offset_n]
  // For leaf nodes: [key_0][value_0][key_1][value_1]...[key_n][value_n]
  data: Uint8Array; // Variable size
}

/**
 * Free Node Structure (reuses deleted node space)
 */
export interface FreeNode {
  header: NodeHeader; // Header with isDeleted = true
  nextFreeOffset: number; // 8 bytes - Next free node in list
  size: number; // 8 bytes - Size of this free block
}

/**
 * Calculate required node size
 */
export function calculateNodeSize(
  order: number,
  keySize: number,
  valueSize: number,
  isLeaf: boolean
): number {
  const headerSize = 64;

  if (isLeaf) {
    // Leaf: header + (order-1) * (key + value)
    const maxKeys = order - 1;
    return headerSize + maxKeys * (keySize + valueSize);
  } else {
    // Internal: header + order * child_offset + (order-1) * key
    const maxKeys = order - 1;
    const maxChildren = order;
    return headerSize + maxChildren * 8 + maxKeys * keySize;
  }
}

/**
 * Alignment utilities
 */
export function alignToNodeSize(offset: number, nodeSize: number): number {
  return Math.ceil(offset / nodeSize) * nodeSize;
}

/**
 * Buffer allocation sizes
 */
export const BUFFER_SIZES = {
  HEADER: HEADER_SIZE,
  NODE_HEADER: 64,
  OFFSET: 8,
  KEY_COUNT: 2,
  CHECKSUM: 4,
} as const;

/**
 * File operation modes
 */
export enum FileMode {
  ReadOnly = "readonly",
  ReadWrite = "readwrite",
}

/**
 * Transaction log entry (for crash recovery)
 */
export interface TransactionLogEntry {
  transactionId: number;
  timestamp: number;
  operation: "insert" | "delete" | "update";
  nodeOffset: number;
  oldData?: Uint8Array;
  newData?: Uint8Array;
}
