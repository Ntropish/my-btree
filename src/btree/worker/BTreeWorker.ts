/**
 * Web Worker implementation for B-Tree operations
 */

import { BTreeCore } from "./BTreeCore";
import { FileManager } from "./FileManager";
import { NodeManager } from "./NodeManager";
import {
  WorkerRequest,
  WorkerResponse,
  SerializedBTreeConfig,
} from "../types/messages";
import { BTreeConfig, BTreeStats } from "../types/btree";
import { Serializer } from "../storage/Serializer";
import * as Serializers from "../storage/serializers";

// Global B-tree instance
let btree: BTreeCore<any, any> | null = null;
let fileManager: FileManager | null = null;
let nodeManager: NodeManager<any, any> | null = null;

/**
 * Handle incoming messages from the main thread
 */
self.addEventListener("message", async (event) => {
  const request = event.data as WorkerRequest;

  try {
    const response = await handleRequest(request);
    self.postMessage(response);
  } catch (error) {
    const errorResponse: WorkerResponse = {
      id: request.id,
      type: request.type,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errorResponse);
  }
});

/**
 * Route requests to appropriate handlers
 */
async function handleRequest(request: WorkerRequest): Promise<WorkerResponse> {
  const baseResponse = {
    id: request.id,
    type: request.type,
  };

  switch (request.type) {
    case "init":
      return { ...baseResponse, result: await handleInit(request) };

    case "insert":
      return {
        ...baseResponse,
        result: await handleInsert(request.key, request.value),
      };

    case "search":
      return { ...baseResponse, result: await handleSearch(request.key) };

    case "delete":
      return { ...baseResponse, result: await handleDelete(request.key) };

    case "range":
      return {
        ...baseResponse,
        result: await handleRange(request.start, request.end, request.options),
      };

    case "entries":
      return { ...baseResponse, result: await handleEntries() };

    case "clear":
      return { ...baseResponse, result: await handleClear() };

    case "stats":
      return { ...baseResponse, result: await handleStats() };

    case "bulkLoad":
      return {
        ...baseResponse,
        result: await handleBulkLoad(request.data, request.options),
      };

    case "verify":
      return { ...baseResponse, result: await handleVerify() };

    case "close":
      return { ...baseResponse, result: await handleClose() };

    case "exists":
      return { ...baseResponse, result: await handleExists(request.name) };

    case "destroy":
      return { ...baseResponse, result: await handleDestroy(request.name) };

    default:
      throw new Error(`Unknown request type: ${(request as any).type}`);
  }
}

/**
 * Initialize the B-tree
 */
async function handleInit(request: WorkerRequest): Promise<boolean> {
  if (request.type !== "init") throw new Error("Invalid request type");

  const config = request.config;

  try {
    // Clean up any existing instance
    if (btree) {
      await btree.close();
      btree = null;
    }
    if (nodeManager) {
      await nodeManager.close();
      nodeManager = null;
    }
    if (fileManager) {
      await fileManager.close();
      fileManager = null;
    }

    // Deserialize serializers
    const keySerializer = deserializeSerializer(config.keySerializer);
    const valueSerializer = deserializeSerializer(config.valueSerializer);

    // Deserialize comparison function if provided
    let compareKeys: ((a: any, b: any) => number) | undefined;
    if (config.compareKeys) {
      compareKeys = new Function("return " + config.compareKeys)();
    }

    // Create full config
    const fullConfig: BTreeConfig<any, any> = {
      name: config.name,
      order: config.order || 128,
      keySerializer,
      valueSerializer,
      cacheSize: config.cacheSize || 1000,
      writeMode: config.writeMode || "write-through",
      enableTransactionLog: config.enableTransactionLog || false,
      compareKeys,
    };

    // Initialize components
    fileManager = new FileManager(fullConfig.name);

    if (config._openExisting) {
      await fileManager.open();
    } else {
      await fileManager.create(fullConfig);
    }

    // Make sure fileManager is initialized
    if (!fileManager.isOpen) {
      throw new Error("FileManager failed to open");
    }

    nodeManager = new NodeManager(
      fileManager,
      fullConfig.keySerializer,
      fullConfig.valueSerializer,
      fullConfig.cacheSize!,
      fullConfig.writeMode!
    );

    btree = new BTreeCore(fileManager, nodeManager, fullConfig);

    await btree.initialize();

    return true;
  } catch (error) {
    // Clean up on error
    if (btree) {
      btree = null;
    }
    if (nodeManager) {
      nodeManager = null;
    }
    if (fileManager) {
      try {
        await fileManager.close();
      } catch (e) {
        // Ignore close errors
      }
      fileManager = null;
    }

    throw error;
  }
}

/**
 * Insert a key-value pair
 */
async function handleInsert(key: any, value: any): Promise<boolean> {
  if (!btree) throw new Error("B-tree not initialized");

  await btree.insert(key, value);
  return true;
}

/**
 * Search for a key
 */
async function handleSearch(key: any): Promise<any> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.search(key);
}

/**
 * Delete a key
 */
async function handleDelete(key: any): Promise<boolean> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.delete(key);
}

/**
 * Range query
 */
async function handleRange(
  start: any,
  end: any,
  options?: any
): Promise<Array<[any, any]>> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.range(start, end, options);
}

/**
 * Get all entries
 */
async function handleEntries(): Promise<Array<[any, any]>> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.entries();
}

/**
 * Clear all data
 */
async function handleClear(): Promise<boolean> {
  if (!btree) throw new Error("B-tree not initialized");

  await btree.clear();
  return true;
}

/**
 * Get statistics
 */
async function handleStats(): Promise<BTreeStats> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.getStats();
}

/**
 * Bulk load data
 */
async function handleBulkLoad(data: any[], options?: any): Promise<boolean> {
  if (!btree) throw new Error("B-tree not initialized");

  await btree.bulkLoad(data, options);
  return true;
}

/**
 * Verify tree integrity
 */
async function handleVerify(): Promise<boolean> {
  if (!btree) throw new Error("B-tree not initialized");

  return await btree.verify();
}

/**
 * Close the B-tree
 */
async function handleClose(): Promise<boolean> {
  if (btree) {
    await btree.close();
    btree = null;
  }

  if (nodeManager) {
    await nodeManager.close();
    nodeManager = null;
  }

  if (fileManager) {
    await fileManager.close();
    fileManager = null;
  }

  return true;
}

/**
 * Check if a B-tree exists
 */
async function handleExists(name: string): Promise<boolean> {
  return await FileManager.exists(name);
}

/**
 * Destroy a B-tree file
 */
async function handleDestroy(name: string): Promise<boolean> {
  await FileManager.destroy(name);
  return true;
}

/**
 * Deserialize a serializer from config
 */
function deserializeSerializer(config: {
  type: string;
  config?: any;
}): Serializer<any> {
  switch (config.type) {
    case "NumberSerializer":
      return new Serializers.NumberSerializer();

    case "Int32Serializer":
      return new Serializers.Int32Serializer();

    case "StringSerializer":
      return new Serializers.StringSerializer();

    case "BooleanSerializer":
      return new Serializers.BooleanSerializer();

    case "BigIntSerializer":
      return new Serializers.BigIntSerializer();

    case "JSONSerializer":
      return new Serializers.JSONSerializer();

    case "CompositeSerializer":
      // Reconstruct composite serializer
      if (config.config && config.config.fields) {
        const fields = config.config.fields.map((field: any) => ({
          key: field.key,
          serializer: deserializeSerializer(field.serializer),
        }));
        return new Serializers.CompositeSerializer(fields);
      }
      throw new Error("Invalid CompositeSerializer config");

    default:
      throw new Error(`Unknown serializer type: ${config.type}`);
  }
}

// Export for TypeScript
export type { WorkerRequest, WorkerResponse };
