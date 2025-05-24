// This file will run in a Web Worker.
// It will instantiate the BTree and handle operations via messages.

import { BTree } from "../core/BTree";
import { type BTreeConfig } from "../BTreeConfig";
// Import serializers that might be needed if not passed directly
import { NumberSerializer } from "../serializers/NumberSerializer";
import { StringSerializer } from "../serializers/StringSerializer";
// Add other serializers as needed, or make them configurable

let tree: BTree<any, any> | null = null;

interface WorkerMessage {
  action: string;
  payload?: any;
  messageId: string;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { action, payload, messageId } = event.data;
  // ADD detailed logging inside the worker
  console.log(`[WORKER] Received: ${action} (ID: ${messageId})`, payload);

  try {
    let result: any = null;
    switch (action) {
      case "create":
        console.log("[WORKER] Action: create");
        if (tree) {
          console.log("[WORKER] Closing existing tree before create...");
          await tree.close();
        }
        const createConfig = payload.config as BTreeConfig<any, any>;
        console.log(
          "[WORKER] Create config received:",
          JSON.stringify(createConfig)
        );

        // Robust Serializer Reconstruction (Example - needs more work)
        // This is still a major weak point and needs a proper factory or registration mechanism
        if (createConfig.keySerializer === "NumberSerializer") {
          createConfig.keySerializer = new NumberSerializer();
        } else if (createConfig.keySerializer === "StringSerializer") {
          createConfig.keySerializer = new StringSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown keySerializer name: ${createConfig.keySerializer}`
          );
        }

        if (createConfig.valueSerializer === "StringSerializer") {
          createConfig.valueSerializer = new StringSerializer();
        } else if (createConfig.valueSerializer === "NumberSerializer") {
          createConfig.valueSerializer = new NumberSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown valueSerializer name: ${createConfig.valueSerializer}`
          );
        }
        console.log("[WORKER] Serializers reconstructed for create.");

        tree = await BTree.create(createConfig);
        result = `BTree "${payload.config.name}" created.`;
        console.log("[WORKER] BTree.create successful.");
        break;

      case "open":
        console.log("[WORKER] Action: open");
        if (tree) {
          console.log("[WORKER] Closing existing tree before open...");
          await tree.close();
        }
        const openConfig = payload.config as BTreeConfig<any, any>;
        console.log(
          "[WORKER] Open config received:",
          JSON.stringify(openConfig)
        );

        // Robust Serializer Reconstruction (Example)
        if (openConfig.keySerializer === "NumberSerializer") {
          openConfig.keySerializer = new NumberSerializer();
        } else if (openConfig.keySerializer === "StringSerializer") {
          openConfig.keySerializer = new StringSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown keySerializer name for open: ${openConfig.keySerializer}`
          );
        }

        if (openConfig.valueSerializer === "StringSerializer") {
          openConfig.valueSerializer = new StringSerializer();
        } else if (openConfig.valueSerializer === "NumberSerializer") {
          openConfig.valueSerializer = new NumberSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown valueSerializer name for open: ${openConfig.valueSerializer}`
          );
        }
        console.log("[WORKER] Serializers reconstructed for open.");

        tree = await BTree.open(openConfig);
        result = `BTree "${payload.config.name}" opened.`;
        console.log("[WORKER] BTree.open successful.");
        break;

      case "openOrCreate":
        console.log("[WORKER] Action: openOrCreate");
        if (tree) {
          console.log("[WORKER] Closing existing tree before openOrCreate...");
          await tree.close();
        }
        const openOrCreateConfig = payload.config as BTreeConfig<any, any>;
        console.log(
          "[WORKER] OpenOrCreate config received:",
          JSON.stringify(openOrCreateConfig)
        );
        // Robust Serializer Reconstruction (Example)
        if (openOrCreateConfig.keySerializer === "NumberSerializer") {
          openOrCreateConfig.keySerializer = new NumberSerializer();
        } else if (openOrCreateConfig.keySerializer === "StringSerializer") {
          openOrCreateConfig.keySerializer = new StringSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown keySerializer name for openOrCreate: ${openOrCreateConfig.keySerializer}`
          );
        }

        if (openOrCreateConfig.valueSerializer === "StringSerializer") {
          openOrCreateConfig.valueSerializer = new StringSerializer();
        } else if (openOrCreateConfig.valueSerializer === "NumberSerializer") {
          openOrCreateConfig.valueSerializer = new NumberSerializer();
        } else {
          throw new Error(
            `[WORKER] Unknown valueSerializer name for openOrCreate: ${openOrCreateConfig.valueSerializer}`
          );
        }
        console.log("[WORKER] Serializers reconstructed for openOrCreate.");
        tree = await BTree.openOrCreate(openOrCreateConfig);
        result = `BTree "${payload.config.name}" opened or created.`;
        console.log("[WORKER] BTree.openOrCreate successful.");
        break;

      // ... other cases ...
      // Wrap calls to tree methods in console logs
      case "insert":
        console.log("[WORKER] Action: insert", payload);
        if (!tree) throw new Error("[WORKER] Tree not initialized for insert.");
        await tree.insert(payload.key, payload.value);
        result = "Insert successful";
        console.log("[WORKER] Insert successful.");
        break;

      case "search":
        console.log("[WORKER] Action: search", payload);
        if (!tree) throw new Error("[WORKER] Tree not initialized for search.");
        result = await tree.search(payload.key);
        console.log("[WORKER] Search result:", result);
        break;

      case "close":
        console.log("[WORKER] Action: close");
        if (tree) {
          await tree.close();
          tree = null;
          result = "Tree closed.";
          console.log("[WORKER] Tree closed.");
        } else {
          result = "No tree to close.";
          console.log("[WORKER] No tree to close.");
        }
        break;

      case "destroy":
        console.log("[WORKER] Action: destroy", payload);
        await BTree.destroy(payload.name);
        if (tree && tree["config"] && tree["config"].name === payload.name) {
          // Access config safely
          tree = null;
        }
        result = `Tree "${payload.name}" destroyed.`;
        console.log("[WORKER] Tree destroyed.");
        break;

      case "exists":
        console.log("[WORKER] Action: exists", payload);
        result = await BTree.exists(payload.name);
        console.log("[WORKER] Exists result:", result);
        break;

      case "entries":
        console.log("[WORKER] Action: entries");
        if (!tree)
          throw new Error("[WORKER] Tree not initialized for entries.");
        result = await tree.entries();
        console.log("[WORKER] Entries result:", result);
        break;

      default:
        console.error(`[WORKER] Unknown action: ${action}`);
        throw new Error(`Unknown action: ${action}`);
    }
    self.postMessage({ messageId, status: "success", payload: result });
  } catch (error: any) {
    // Ensure detailed error information is posted back
    console.error(
      `[WORKER] Error processing action ${action} (ID: ${messageId}):`,
      error.message,
      error.stack,
      error
    );
    self.postMessage({
      messageId,
      status: "error",
      error: `Worker internal error: ${error.message}`, // Prepend context
      stack: error.stack,
      details: JSON.stringify(error, Object.getOwnPropertyNames(error)), // Attempt to serialize more error details
    });
  }
};

// Catch top-level unhandled promise rejections in the worker, if any
self.addEventListener("unhandledrejection", (event) => {
  console.error("[WORKER] Unhandled Promise Rejection:", event.reason);
  // Optionally, post a message back to the main thread about this critical failure
  // self.postMessage({ status: 'critical_error', error: 'Unhandled rejection', details: event.reason });
});

console.log("[WORKER] BTreeWorker.ts loaded and event listener attached.");
self.postMessage({ status: "worker_ready" }); // Ensure this is sent after setup
