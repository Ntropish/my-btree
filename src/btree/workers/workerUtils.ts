// Utilities for interacting with the BTreeWorker

/**
 * The main BTree class that users interact with.
 * It delegates operations to a Web Worker.
 */
import type { BTreeConfig, BTreeStats, RangeOptions } from "../BTreeConfig";
import type { Serializer } from "../serializers/Serializer"; // For type only

// Default compare function for keys
const defaultCompareKeys = (a: any, b: any) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

// This class will be the public-facing API that uses the worker.
// It needs to mirror the BTree methods but wrap them in postMessageToWorker.

export class BTreeProxy<K, V> {
  private config: BTreeConfig<K, V>; // Store original config for reference

  private constructor(config: BTreeConfig<K, V>) {
    this.config = config; // Keep for reference, e.g., name
  }

  // Helper to pass config, ensuring serializers are serializable or reconstructible by name.
  // This is a known challenge with Web Workers and complex objects.
  // For now, we might pass serializer names if they are known built-ins.
  private getSerializableConfig(config: BTreeConfig<K, V>): any {
    return {
      // Pass only relevant BTreeConfig properties
      name: config.name,
      order: config.order,
      pageSize: config.pageSize,
      cacheSize: config.cacheSize,
      writeMode: config.writeMode,
      enableTransactionLog: config.enableTransactionLog,
      // Serializers by name
      keySerializer: config.keySerializer.constructor.name,
      valueSerializer: config.valueSerializer.constructor.name,
      // compareKeys identified
      compareKeys:
        config.compareKeys === defaultCompareKeys || !config.compareKeys // Check if it IS effectively the default
          ? "defaultCompareKeys"
          : // If it's a function but not defaultCompareKeys, pass its name or a generic name
          typeof config.compareKeys === "function"
          ? config.compareKeys.name || "customCompareKeys"
          : undefined,
    };
  }

  static async create<K, V>(
    config: BTreeConfig<K, V>
  ): Promise<BTreeProxy<K, V>> {
    const proxy = new BTreeProxy<K, V>(config);
    await postMessageToWorker("create", {
      config: proxy.getSerializableConfig(config),
    });
    return proxy;
  }

  static async open<K, V>(
    config: BTreeConfig<K, V>
  ): Promise<BTreeProxy<K, V>> {
    const proxy = new BTreeProxy<K, V>(config);
    await postMessageToWorker("open", {
      config: proxy.getSerializableConfig(config),
    });
    return proxy;
  }

  static async openOrCreate<K, V>(
    config: BTreeConfig<K, V>
  ): Promise<BTreeProxy<K, V>> {
    const proxy = new BTreeProxy<K, V>(config);
    await postMessageToWorker("openOrCreate", {
      config: proxy.getSerializableConfig(config),
    });
    return proxy;
  }

  async insert(key: K, value: V): Promise<void> {
    return postMessageToWorker("insert", { key, value });
  }

  async search(key: K): Promise<V | null> {
    return postMessageToWorker<V | null>("search", { key });
  }

  async delete(key: K): Promise<boolean> {
    return postMessageToWorker<boolean>("delete", { key });
  }

  async range(
    startKey: K,
    endKey: K,
    options?: Omit<RangeOptions<K>, "startKey" | "endKey">
  ): Promise<Array<[K, V]>> {
    return postMessageToWorker<Array<[K, V]>>("range", {
      startKey,
      endKey,
      options,
    });
  }

  async entries(): Promise<Array<[K, V]>> {
    return postMessageToWorker<Array<[K, V]>>("entries");
  }

  async clear(): Promise<void> {
    return postMessageToWorker("clear");
  }

  async stats(): Promise<BTreeStats> {
    return postMessageToWorker<BTreeStats>("stats");
  }

  async close(): Promise<void> {
    await postMessageToWorker("close");
    // Optionally terminate the worker if this BTree instance is the only user
    // terminateWorker(); // Be careful with this if multiple BTreeProxies might share a worker.
  }

  static async destroy(name: string): Promise<void> {
    return postMessageToWorker("destroy", { name });
  }

  static async exists(name: string): Promise<boolean> {
    return postMessageToWorker<boolean>("exists", { name });
  }
}

// Store pending promises for worker messages
const pendingPromises = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();
let messageIdCounter = 0;
let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    console.log(
      "[MAIN_THREAD_UTILS] Attempting to create new Worker instance..."
    );
    try {
      // Try to construct the worker with the *full BTreeWorker.ts from response #19*
      // (the one with BTree logic, imports, and detailed logging)
      // NOT the ultra-minimal worker script itself.
      // The goal is to see if *this specific worker file* fails to load.
      const url = new URL("./BTreeWorker.js", import.meta.url);

      console.log("[MAIN_THREAD_UTILS] Worker URL constructed:", url.href);
      // Create the worker instance
      workerInstance = new Worker(url.href, {
        type: "module",
        name: "BTreeWorker", // Optional: name for debugging in browser devtools
      });
      console.log(
        "[MAIN_THREAD_UTILS] new Worker() call completed. Worker instance (potentially) created."
      );

      workerInstance.onmessage = (event: MessageEvent) => {
        // ... (your existing onmessage handler with detailed logging)
        const { messageId, status, payload, error, stack, details } =
          event.data;
        console.log(
          `[MAIN_THREAD_UTILS] Message received from worker: Status: ${status}, ID: ${messageId}, Payload:`,
          payload,
          `Error:`,
          error,
          `Details:`,
          details
        );

        if (messageId && pendingPromises.has(messageId)) {
          const promiseCallbacks = pendingPromises.get(messageId)!;
          if (status === "success") {
            promiseCallbacks.resolve(payload);
          } else {
            const err = new Error(
              error || "Unknown worker error from postMessage"
            );
            err.stack = stack || err.stack;
            // @ts-ignore
            err.details = details;
            promiseCallbacks.reject(err);
          }
          pendingPromises.delete(messageId);
        } else if (
          [
            "worker_ready",
            "worker_minimal_ready",
            "worker_script_started_phase1",
            "worker_onmessage_assigned",
            "critical_startup_error",
            "critical_error",
            "unhandled_rejection",
          ].includes(status)
        ) {
          console.log(
            `[MAIN_THREAD_UTILS] Worker direct status message: ${status}`,
            payload || error || details
          );
        } else {
          console.warn(
            "[MAIN_THREAD_UTILS] Received worker message without matching ID or known status type:",
            event.data
          );
        }
      };

      workerInstance.onerror = (event: Event | ErrorEvent) => {
        console.error(
          "[MAIN_THREAD_UTILS] workerInstance.onerror triggered. Event:",
          event
        );
        let message =
          "Worker errored or terminated unexpectedly (worker.onerror).";
        if (event instanceof ErrorEvent) {
          message = `Worker ErrorEvent (worker.onerror): "${event.message}" at <span class="math-inline">\{event\.filename\}\:</span>{event.lineno}:${event.colno}`;
        }
        pendingPromises.forEach((callbacks) => {
          callbacks.reject(new Error(message));
        });
        pendingPromises.clear();
      };
      console.log(
        "[MAIN_THREAD_UTILS] Worker event listeners (onmessage, onerror) attached."
      );
    } catch (e: any) {
      console.error(
        "[MAIN_THREAD_UTILS] CRITICAL ERROR DURING `new Worker(...)` CALL:",
        e.message,
        e.stack,
        e
      );
      // If new Worker() itself fails, all pending promises should be rejected.
      pendingPromises.forEach((callbacks) => {
        callbacks.reject(
          new Error(`Failed to instantiate worker: ${e.message}`)
        );
      });
      pendingPromises.clear();
      workerInstance = null; // Ensure we don't try to use a failed instance
      throw e; // Re-throw to make it clear that worker creation failed
    }
  }
  return workerInstance;
}

export function postMessageToWorker<T = any>(
  action: string,
  payload?: any
): Promise<T> {
  const worker = getWorker();
  const messageId = `msg-${messageIdCounter++}`;

  return new Promise<T>((resolve, reject) => {
    pendingPromises.set(messageId, { resolve, reject });
    worker.postMessage({ action, payload, messageId });
  });
}

export function terminateWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    pendingPromises.forEach((p) => p.reject("Worker terminated."));
    pendingPromises.clear();
    workerInstance = null;
  }
}
