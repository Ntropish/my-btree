/**
 * Custom error classes
 * utils/errors.ts
 */

/**
 * Base error class for B-tree operations
 */
export class BTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BTreeError";
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileError extends BTreeError {
  constructor(message: string, public readonly operation: string) {
    super(`File ${operation} failed: ${message}`);
    this.name = "FileError";
  }
}

/**
 * Error thrown when node operations fail
 */
export class NodeError extends BTreeError {
  constructor(message: string, public readonly nodeOffset: number) {
    super(`Node error at offset ${nodeOffset}: ${message}`);
    this.name = "NodeError";
  }
}

/**
 * Error thrown when serialization fails
 */
export class SerializationError extends BTreeError {
  constructor(message: string, public readonly type: "key" | "value") {
    super(`${type} serialization failed: ${message}`);
    this.name = "SerializationError";
  }
}

/**
 * Error thrown when tree structure is corrupted
 */
export class CorruptionError extends BTreeError {
  constructor(message: string) {
    super(`Tree corruption detected: ${message}`);
    this.name = "CorruptionError";
  }
}

/**
 * Error thrown when tree is not initialized
 */
export class NotInitializedError extends BTreeError {
  constructor() {
    super("B-tree not initialized");
    this.name = "NotInitializedError";
  }
}
