/**
 * Main thread client for B-Tree operations
 */

import type {
  BTreeConfig,
  BTreeStats,
  RangeOptions,
  BulkLoadOptions,
} from "../types/btree";
import { MessageBridge } from "./MessageBridge";
import type { WorkerRequest, WorkerResponse } from "../types/messages";

export class BTreeClient<K, V> {
  private bridge: MessageBridge;
  private worker: Worker;
  private initialized: Promise<void>;

  constructor(config: BTreeConfig<K, V>) {
    // Create worker with proper module type
    this.worker = new Worker(
      new URL("../worker/BTreeWorker.ts", import.meta.url),
      { type: "module" }
    );

    this.bridge = new MessageBridge(this.worker);

    // Initialize the B-tree in the worker
    this.initialized = this.initialize(config);
  }

  /**
   * Initialize the B-tree in the worker
   */
  private async initialize(config: BTreeConfig<K, V>): Promise<void> {
    // Serialize the serializers to send to worker
    const serializedConfig = {
      name: config.name,
      order: config.order,
      cacheSize: config.cacheSize,
      writeMode: config.writeMode,
      enableTransactionLog: config.enableTransactionLog,
      keySerializer: {
        type: config.keySerializer.constructor.name,
        // Don't send the actual serializer instance, just its type
      },
      valueSerializer: {
        type: config.valueSerializer.constructor.name,
        // Don't send the actual serializer instance, just its type
      },
      // Serialize comparison function if provided
      compareKeys: config.compareKeys
        ? config.compareKeys.toString()
        : undefined,
      _openExisting: (config as any)._openExisting,
    };

    await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "init",
      config: serializedConfig,
    });
  }

  /**
   * Ensure initialization is complete
   */
  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  /**
   * Insert a key-value pair
   */
  async insert(key: K, value: V): Promise<void> {
    await this.ensureInitialized();

    await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "insert",
      key,
      value,
    });
  }

  /**
   * Search for a key
   */
  async search(key: K): Promise<V | null> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "search",
      key,
    });

    return response.result as V | null;
  }

  /**
   * Delete a key
   */
  async delete(key: K): Promise<boolean> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "delete",
      key,
    });

    return response.result as boolean;
  }

  /**
   * Range query
   */
  async range(
    start: K,
    end: K,
    options?: RangeOptions
  ): Promise<Array<[K, V]>> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "range",
      start,
      end,
      options,
    });

    return response.result as Array<[K, V]>;
  }

  /**
   * Get all key-value pairs
   */
  async entries(): Promise<Array<[K, V]>> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "entries",
    });

    return response.result as Array<[K, V]>;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "clear",
    });
  }

  /**
   * Get statistics
   */
  async stats(): Promise<BTreeStats> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "stats",
    });

    return response.result as BTreeStats;
  }

  /**
   * Bulk load data
   */
  async bulkLoad(
    data: Array<[K, V]>,
    options?: BulkLoadOptions
  ): Promise<void> {
    await this.ensureInitialized();

    await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "bulkLoad",
      data,
      options,
    });
  }

  /**
   * Verify tree integrity
   */
  async verify(): Promise<boolean> {
    await this.ensureInitialized();

    const response = await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "verify",
    });

    return response.result as boolean;
  }

  /**
   * Close the B-tree and cleanup resources
   */
  async close(): Promise<void> {
    await this.ensureInitialized();

    await this.bridge.send<WorkerRequest, WorkerResponse>({
      type: "close",
    });

    this.worker.terminate();
  }

  /**
   * Create a new B-tree instance
   */
  static async create<K, V>(
    config: BTreeConfig<K, V>
  ): Promise<BTreeClient<K, V>> {
    const client = new BTreeClient(config);
    await client.ensureInitialized();
    return client;
  }

  /**
   * Open an existing B-tree
   */
  static async open<K, V>(
    config: BTreeConfig<K, V>
  ): Promise<BTreeClient<K, V>> {
    return BTreeClient.create({
      ...config,
      // Add flag to indicate opening existing file
      _openExisting: true,
    } as any);
  }

  /**
   * Check if a B-tree exists
   */
  static async exists(name: string): Promise<boolean> {
    // Create a temporary worker to check existence
    const worker = new Worker(
      new URL("../worker/BTreeWorker.ts", import.meta.url),
      { type: "module" }
    );

    const bridge = new MessageBridge(worker);

    try {
      const response = await bridge.send<WorkerRequest, WorkerResponse>({
        type: "exists",
        name,
      });

      return response.result as boolean;
    } finally {
      worker.terminate();
    }
  }

  /**
   * Delete a B-tree file
   */
  static async destroy(name: string): Promise<void> {
    // Create a temporary worker to delete the file
    const worker = new Worker(
      new URL("../worker/BTreeWorker.ts", import.meta.url),
      { type: "module" }
    );

    const bridge = new MessageBridge(worker);

    try {
      await bridge.send<WorkerRequest, WorkerResponse>({
        type: "destroy",
        name,
      });
    } finally {
      worker.terminate();
    }
  }
}
