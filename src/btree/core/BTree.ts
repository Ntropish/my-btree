import {
  type BTreeConfig,
  type BTreeStats,
  type RangeOptions,
  DEFAULT_ORDER,
  DEFAULT_CACHE_SIZE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_WRITE_MODE,
  defaultCompareKeys,
  DEFAULT_TRANSACTION_LOG,
} from "../BTreeConfig";
import { OPFSManager } from "../opfs/OPFSManager";
import { BTreeNode, type NodeId } from "./BTreeNode";

// Special Block IDs
const METADATA_BLOCK_ID: NodeId = 0; // Block 0 for tree metadata

interface BTreeMetadata {
  version: number; // For future format changes
  order: number;
  pageSize: number;
  rootNodeId: NodeId;
  keySerializerName: string; // For validation, store name of serializer
  valueSerializerName: string;
  creationTimestamp: number;
  // ... other metadata like free block list head, total entries etc.
}

export class BTree<K, V> {
  private config: Required<BTreeConfig<K, V>>;
  private opfsManager: OPFSManager;
  private nodeCache: Map<NodeId, BTreeNode<K, V>>; // Simple LRU would be better
  private metadata: BTreeMetadata | null = null;
  private compareKeys: (a: K, b: K) => number;

  // Cache statistics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Private constructor, use static create/open methods
  private constructor(
    config: Required<BTreeConfig<K, V>>,
    opfsManager: OPFSManager
  ) {
    this.config = config;
    this.opfsManager = opfsManager;
    this.nodeCache = new Map();
    this.compareKeys = config.compareKeys || defaultCompareKeys;
  }

  private async initializeNewTree(): Promise<void> {
    const rootNode = new BTreeNode<K, V>(1, this.config.order, true); // Root is initially leaf, ID 1
    // Block 0 for metadata, Block 1 for initial root.
    this.metadata = {
      version: 1,
      order: this.config.order,
      pageSize: this.config.pageSize,
      rootNodeId: rootNode.id, // Root node starts at block 1
      keySerializerName: this.config.keySerializer.constructor.name,
      valueSerializerName: this.config.valueSerializer.constructor.name,
      creationTimestamp: Date.now(),
    };

    await this.writeNode(rootNode);
    await this.writeMetadata();
  }

  private async loadMetadata(): Promise<void> {
    const buffer = await this.opfsManager.readBlockSync(METADATA_BLOCK_ID);
    // Crude deserialization for metadata (JSON for simplicity here, binary would be better)
    try {
      const jsonString = new TextDecoder().decode(
        buffer.slice(0, buffer.indexOf(0))
      ); // Find null terminator
      this.metadata = JSON.parse(jsonString) as BTreeMetadata;

      // Validate config against loaded metadata
      if (this.metadata.order !== this.config.order) {
        console.warn(
          `BTree loaded with order ${this.metadata.order}, config specified ${this.config.order}. Using loaded order.`
        );
        this.config.order = this.metadata.order;
      }
      if (this.metadata.pageSize !== this.config.pageSize) {
        console.warn(
          `BTree loaded with pageSize ${this.metadata.pageSize}, config specified ${this.config.pageSize}. Using loaded pageSize.`
        );
        this.config.pageSize = this.metadata.pageSize;
      }
      // TODO: Add more checks (serializers, etc.)
    } catch (e) {
      throw new Error(
        "Failed to parse BTree metadata. File might be corrupt or not a BTree file."
      );
    }
  }

  private async writeMetadata(): Promise<void> {
    if (!this.metadata) throw new Error("Metadata not initialized.");
    const jsonString = JSON.stringify(this.metadata);
    const buffer = new Uint8Array(this.config.pageSize);
    const encoded = new TextEncoder().encode(jsonString);
    buffer.set(encoded); // Leaves rest of buffer as zeros (includes null terminator if string fits)
    this.opfsManager.writeBlockSync(METADATA_BLOCK_ID, buffer);
  }

  async getNode(nodeId: NodeId): Promise<BTreeNode<K, V>> {
    if (this.config.cacheSize > 0 && this.nodeCache.has(nodeId)) {
      this.cacheHits++;
      const cachedNode = this.nodeCache.get(nodeId)!;
      // LRU: Move to most recently used by deleting and re-setting
      this.nodeCache.delete(nodeId);
      this.nodeCache.set(nodeId, cachedNode);
      return cachedNode;
    }

    if (this.config.cacheSize > 0) {
      this.cacheMisses++;
    }

    const buffer = this.opfsManager.readBlockSync(nodeId); // Switched to async as it's more typical
    const node = BTreeNode.deserialize<K, V>(
      nodeId,
      this.config.order, // order is needed for BTreeNode logic like isFull, split points
      buffer,
      this.config.keySerializer,
      this.config.valueSerializer
    );

    if (this.config.cacheSize > 0) {
      if (this.nodeCache.size >= this.config.cacheSize) {
        // Evict least recently used (first item in Map iteration order)
        const lruNodeId = this.nodeCache.keys().next().value;
        if (lruNodeId) {
          const lruNodeToEvict = this.nodeCache.get(lruNodeId);
          if (
            this.config.writeMode === "write-back" &&
            lruNodeToEvict &&
            lruNodeToEvict.isDirty
          ) {
            // Check .isDirty
            // console.log(`[CACHE EVICT] Writing dirty node ${lruNodeId} before eviction.`);
            await this.writeNodeInternal(lruNodeToEvict, false); // Internal write, don't re-add to cache here
          }
          this.nodeCache.delete(lruNodeId);
        }
      }
      this.nodeCache.set(nodeId, node);
    }
    return node;
  }

  // Renamed your original writeNode to writeNodeInternal to avoid recursion issues if called from getNode
  private async writeNodeInternal(
    node: BTreeNode<K, V>,
    updateCacheLogic: boolean
  ): Promise<void> {
    const buffer = node.serialize(
      this.config.keySerializer,
      this.config.valueSerializer,
      this.config.pageSize
    );
    await this.opfsManager.writeBlockSync(node.id, buffer); // Switched to async
    node.markClean(); // Node is now persisted, so it's clean

    if (updateCacheLogic && this.config.cacheSize > 0) {
      // If in cache, remove and re-add to mark as most recently used and update its instance
      if (this.nodeCache.has(node.id)) {
        this.nodeCache.delete(node.id);
      }
      this.nodeCache.set(node.id, node);
      // Ensure cache size constraint after adding
      while (this.nodeCache.size > this.config.cacheSize) {
        const lruNodeId = this.nodeCache.keys().next().value;
        // Note: Evicting here. If the evicted node was dirty, it should have been written
        // by the write-back logic in getNode's eviction or during explicit flush.
        // For simplicity, we assume node being evicted here (if not 'node' itself) is clean or handled.
        if (lruNodeId && lruNodeId !== node.id) {
          // Don't evict the node we just wrote and cached
          const nodeToEvict = this.nodeCache.get(lruNodeId);
          // Defensive write if write-back and dirty, though ideally covered elsewhere
          if (
            this.config.writeMode === "write-back" &&
            nodeToEvict &&
            nodeToEvict.isDirty
          ) {
            // console.warn(`[CACHE OVERFLOW] Writing dirty node ${lruNodeId} during writeNode overflow.`);
            // await this.writeNodeInternal(nodeToEvict, false); // Avoid recursion
          }
          this.nodeCache.delete(lruNodeId);
        } else if (
          lruNodeId === node.id &&
          this.nodeCache.size > this.config.cacheSize
        ) {
          // This case should not happen if logic is correct (we just added 'node').
          // If it does, means cache size is likely 0 or 1 and we are overfilling.
          // This indicates a potential flaw if we are evicting the node we just added due to size 1 cache.
        }
      }
    }
  }

  // Public writeNode that application logic (like insert/delete) will call
  public async writeNode(node: BTreeNode<K, V>): Promise<void> {
    if (this.config.writeMode === "write-through") {
      await this.writeNodeInternal(node, true);
    } else if (this.config.writeMode === "write-back") {
      node.markDirty(); // Mark as dirty, will be written by flush or eviction
      // Ensure it's in cache if cache is enabled
      if (this.config.cacheSize > 0) {
        if (this.nodeCache.has(node.id)) {
          this.nodeCache.delete(node.id); // Remove to re-add as MRU
        }
        this.nodeCache.set(node.id, node);
        // Eviction logic if cache overflows after adding/updating dirty node
        while (this.nodeCache.size > this.config.cacheSize) {
          const lruNodeId = this.nodeCache.keys().next().value;
          if (lruNodeId) {
            const lruNodeToEvict = this.nodeCache.get(lruNodeId);
            if (lruNodeToEvict && lruNodeToEvict.isDirty) {
              // console.log(`[CACHE EVICT DIRTY] Writing dirty node ${lruNodeId} from writeNode due to overflow.`);
              await this.writeNodeInternal(lruNodeToEvict, false); // Write it before evicting
            }
            this.nodeCache.delete(lruNodeId);
          }
        }
      } else {
        // No cache, write-back implies it should be written eventually.
        // This scenario is odd (write-back with no cache).
        // For now, assume if no cache, write-back behaves like write-through.
        await this.writeNodeInternal(node, false);
      }
    }
  }

  public static async create<K, V>(
    userConfig: BTreeConfig<K, V>
  ): Promise<BTree<K, V>> {
    if (!userConfig.name) {
      throw new Error("BTree name is required.");
    }

    if (!userConfig.keySerializer) {
      throw new Error("Key serializer is required.");
    }

    if (!userConfig.valueSerializer) {
      throw new Error("Value serializer is required.");
    }

    const config: Required<BTreeConfig<K, V>> = {
      ...userConfig,
      order: userConfig.order ?? DEFAULT_ORDER,
      cacheSize: userConfig.cacheSize ?? DEFAULT_CACHE_SIZE,
      pageSize: userConfig.pageSize ?? DEFAULT_PAGE_SIZE,
      writeMode: userConfig.writeMode ?? DEFAULT_WRITE_MODE,
      enableTransactionLog:
        userConfig.enableTransactionLog ?? DEFAULT_TRANSACTION_LOG,
      compareKeys: userConfig.compareKeys || defaultCompareKeys,
    };

    if (await OPFSManager.storeExists(config.name)) {
      throw new Error(
        `BTree store "${config.name}" already exists. Use BTree.open() or BTree.destroy() first.`
      );
    }

    const opfsManager = new OPFSManager(
      config.name,
      config.pageSize,
      typeof WorkerGlobalScope !== "undefined" &&
        self instanceof WorkerGlobalScope
    );
    await opfsManager.open(); // Create the file

    const tree = new BTree<K, V>(config, opfsManager);
    await tree.initializeNewTree();
    return tree;
  }

  public static async open<K, V>(
    userConfig: BTreeConfig<K, V> // Key/Value serializers and compareKeys are vital for opening
  ): Promise<BTree<K, V>> {
    const config: Required<BTreeConfig<K, V>> = {
      order: DEFAULT_ORDER, // Will be overridden by metadata
      cacheSize: DEFAULT_CACHE_SIZE,
      pageSize: DEFAULT_PAGE_SIZE, // Will be overridden by metadata
      writeMode: DEFAULT_WRITE_MODE,
      enableTransactionLog: DEFAULT_TRANSACTION_LOG,
      compareKeys: defaultCompareKeys as (a: K, b: K) => number,
      ...userConfig,
    };

    if (!(await OPFSManager.storeExists(config.name))) {
      throw new Error(
        `BTree store "${config.name}" does not exist. Use BTree.create().`
      );
    }

    const opfsManager = new OPFSManager(
      config.name,
      config.pageSize,
      typeof WorkerGlobalScope !== "undefined" &&
        self instanceof WorkerGlobalScope
    );
    await opfsManager.open();

    const tree = new BTree<K, V>(config, opfsManager);
    await tree.loadMetadata(); // This will also update config.order and config.pageSize from file
    return tree;
  }

  public static async openOrCreate<K, V>(
    userConfig: BTreeConfig<K, V>
  ): Promise<BTree<K, V>> {
    if (await OPFSManager.storeExists(userConfig.name)) {
      return await BTree.open(userConfig);
    } else {
      return await BTree.create(userConfig);
    }
  }

  private async flushDirtyNodes(): Promise<void> {
    if (this.config.writeMode !== "write-back") return;

    // console.log(`[FLUSH] Flushing ${this.nodeCache.size} cached nodes for dirty ones.`);
    for (const node of this.nodeCache.values()) {
      if (node.isDirty) {
        // Check the .isDirty property
        // console.log(`[FLUSH] Writing dirty node ${node.id}.`);
        await this.writeNodeInternal(node, false); // Use internal write, don't affect LRU order during flush
      }
    }
  }

  async close(): Promise<void> {
    if (!this.metadata) {
      // Already closed or never opened
      // console.warn("[BTree] Close called on an already closed or uninitialized tree.");
      return;
    }
    // console.log("[BTree] Closing tree...");
    await this.flushDirtyNodes(); // Flush any pending writes if in write-back mode
    await this.opfsManager.flush(); // Ensure OPFSManager flushes its OS-level cache
    await this.opfsManager.close();

    this.nodeCache.clear();
    this.metadata = null; // Mark as closed/uninitialized
    this.cacheHits = 0;
    this.cacheMisses = 0;
    // console.log("[BTree] Tree closed.");
  }

  static async destroy(name: string): Promise<void> {
    await OPFSManager.deleteStore(name);
  }

  static async exists(name: string): Promise<boolean> {
    return OPFSManager.storeExists(name);
  }

  // --- Public API Methods (Placeholders) ---

  async insert(key: K, value: V): Promise<void> {
    if (!this.metadata) throw new Error("Tree not initialized or closed.");
    // TODO: Implement B-Tree insertion logic
    // 1. Find appropriate leaf node.
    // 2. If leaf node has space, insert and write node.
    // 3. If leaf node is full, split it, insert, update parent, write nodes.
    //    This may cascade splits up the tree.
    console.log(`Insert: ${key} -> ${value}`);
    // Example: const root = await this.getNode(this.metadata.rootNodeId);
    // ... complex logic ...
    // await this.writeNode(modifiedNode);
    throw new Error("Insert not implemented");
  }

  async search(key: K): Promise<V | null> {
    if (!this.metadata) throw new Error("Tree not initialized or closed.");
    let currentNode = await this.getNode(this.metadata.rootNodeId);

    while (true) {
      const index = currentNode.findKeyIndex(key, this.compareKeys);

      if (
        index < currentNode.entries.length &&
        this.compareKeys(currentNode.entries[index].key, key) === 0
      ) {
        // Key found
        if (currentNode.isLeaf) {
          return currentNode.entries[index].value!; // Value should exist in leaf
        } else {
          // Key found in internal node. In some B-Tree variants, values are only in leaves.
          // If values can be in internal nodes, return it. Otherwise, means key exists,
          // but need to traverse to leaf for actual value (if this variant stores values with keys in internal nodes)
          // For now, assuming values are only in leaves for this search logic.
          // Or, if this key is used as a separator, its associated value might be "to the right"
          // This needs clarification based on BTree variant.
          // For a typical B-Tree where internal nodes only guide search:
          currentNode = await this.getNode(
            currentNode.entries[index].childNodeId!
          ); // This is not quite right for B+ tree like search
          // where keys are duplicated.
          // Let's assume internal node keys also could have values (not B+ tree)
          // Or this implies key found, but it's a separator.
          // Simpler B-Tree: if key found in internal, it's there.
          // But for OP's API: tree.search(1) => 'Hello' suggests values ARE associated with keys.
          throw new Error(
            "Search logic for internal nodes with values needs refinement or clear B-Tree variant definition."
          );
        }
      }

      // Key not found at current entry, check if we need to go deeper
      if (currentNode.isLeaf) {
        return null; // Key not found
      } else {
        // Determine which child to follow.
        // If key at `index` is > our search key, or index is end of entries, child is entries[index].childNodeId
        // If key at `index-1` < our search key, child is entries[index-1].rightMost or entries[index].childNodeId
        // This logic from findKeyIndex needs to be carefully used.
        // findKeyIndex returns insertion point `idx`. Child to follow is associated with key `entries[idx-1]`
        // or if `idx` is 0, the "leftmost" child of that node.

        // Placeholder for traversal:
        // childNodeId = ... determine from index and node.isLeaf ...
        // currentNode = await this.getNode(childNodeId);

        // A common way:
        let childToFollowId: NodeId;
        if (index === currentNode.entries.length) {
          // Key is greater than all keys in node
          childToFollowId = currentNode.rightmostChildNodeId!;
        } else {
          // Key is less than or equal to entries[index].key
          childToFollowId = currentNode.entries[index].childNodeId!; // Child to the left of entries[index].key
        }
        if (!childToFollowId) return null; // Should not happen in a well-formed tree unless leaf.
        currentNode = await this.getNode(childToFollowId);
      }
    }
  }

  async delete(key: K): Promise<boolean> {
    // TODO: Implement B-Tree deletion logic
    // This is the most complex operation, involving merging/rebalancing.
    console.log(`Delete: ${key}`);
    throw new Error("Delete not implemented");
  }

  async range(
    startKey: K,
    endKey: K,
    options?: RangeOptions<K>
  ): Promise<Array<[K, V]>> {
    // TODO: Implement B-Tree range query
    console.log(`Range: ${startKey} - ${endKey}`, options);
    throw new Error("Range not implemented");
  }

  async clear(): Promise<void> {
    // TODO: Clear all data - effectively re-initialize or mark all blocks as free.
    // Simplest: close, delete file, re-create with initializeNewTree.
    await this.opfsManager.close();
    await OPFSManager.deleteStore(this.config.name);
    await this.opfsManager.open();
    await this.initializeNewTree();
    this.nodeCache.clear();
  }

  async stats(): Promise<BTreeStats> {
    if (!this.metadata) {
      // console.error("[BTree] Stats called on uninitialized or closed tree.");
      throw new Error("Tree not initialized or closed.");
    }

    let numNodes = 0;
    let numEntries = 0;
    let calculatedHeight = 0;

    if (this.metadata.rootNodeId) {
      const queue: Array<{ nodeId: NodeId; level: number }> = [];
      queue.push({ nodeId: this.metadata.rootNodeId, level: 1 });
      const visited = new Set<NodeId>();
      visited.add(this.metadata.rootNodeId);

      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        numNodes++;
        calculatedHeight = Math.max(calculatedHeight, current.level);

        const node = await this.getNode(current.nodeId); // Uses cache
        numEntries += node.entries.length;

        if (!node.isLeaf) {
          // Iterate through all conceptual child pointers.
          // This depends on how BTreeNode stores childNodeIds.
          // Assuming BTreeNode.getAllChildNodeIds() returns all valid child IDs.
          const childIds = node.getAllChildNodeIds(); // You'll need to implement this in BTreeNode
          for (const childId of childIds) {
            if (childId && !visited.has(childId)) {
              visited.add(childId);
              queue.push({ nodeId: childId, level: current.level + 1 });
            }
          }
        }
      }
    }

    return {
      order: this.config.order,
      height: calculatedHeight,
      numNodes: numNodes,
      numEntries: numEntries,
      cacheSize: this.config.cacheSize,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      fileSize: await this.opfsManager.getFileSize(),
      pageSize: this.config.pageSize,
    };
  }

  async entries(): Promise<Array<[K, V]>> {
    //
    if (!this.metadata) throw new Error("Tree not initialized or closed.");
    const results: Array<[K, V]> = [];
    if (this.metadata.rootNodeId) {
      await this.collectEntriesRecursive(
        await this.getNode(this.metadata.rootNodeId),
        results
      );
    }
    return results;
  }

  // Recursive helper for collecting entries
  private async collectEntriesRecursive(
    node: BTreeNode<K, V>,
    results: Array<[K, V]>
  ): Promise<void> {
    if (node.isLeaf) {
      //
      for (const entry of node.entries) {
        // As per BTreeNode.ts, values are only in leaf nodes.
        if (entry.value !== undefined) {
          results.push([entry.key, entry.value]);
        }
      }
    } else {
      // Internal node
      // Traversal: Child0, Key0, Child1, Key1, ..., KeyN-1, ChildN
      // entries[i].childNodeId is Child_i (keys < entries[i].key)
      // rightmostChildNodeId is Child_N (keys > entries[N-1].key)
      for (let i = 0; i < node.entries.length; i++) {
        if (node.entries[i].childNodeId !== undefined) {
          await this.collectEntriesRecursive(
            await this.getNode(node.entries[i].childNodeId!),
            results
          );
        }
        // In a B-Tree where values are only in leaves, internal keys are just for structure.
        // So, we don't add `node.entries[i]` itself to results here.
        // The search logic implies we only pull values from leaves.
        // If BTree required internal node values, we'd add here:
        // if (node.entries[i].value !== undefined) results.push([node.entries[i].key, node.entries[i].value!]);
      }
      // Process the rightmost child
      if (node.rightmostChildNodeId !== undefined) {
        //
        await this.collectEntriesRecursive(
          await this.getNode(node.rightmostChildNodeId),
          results
        );
      }
    }
  }

  // TODO: Bulk load, transactions, etc.
}
