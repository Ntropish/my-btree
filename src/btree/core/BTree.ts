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
    const buffer = await this.opfsManager.readBlock(METADATA_BLOCK_ID);
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
    await this.opfsManager.writeBlock(METADATA_BLOCK_ID, buffer);
  }

  private async getNode(nodeId: NodeId): Promise<BTreeNode<K, V>> {
    if (this.nodeCache.has(nodeId)) {
      // TODO: Implement proper LRU cache behavior (move to front)
      return this.nodeCache.get(nodeId)!;
    }

    const buffer = this.opfsManager.readBlockSync(nodeId);
    const node = BTreeNode.deserialize<K, V>(
      nodeId,
      this.config.order,
      buffer,
      this.config.keySerializer,
      this.config.valueSerializer
    );

    if (this.nodeCache.size >= this.config.cacheSize) {
      // TODO: Implement proper LRU cache eviction
      const firstKey = this.nodeCache.keys().next().value;
      this.nodeCache.delete(firstKey);
    }
    this.nodeCache.set(nodeId, node);
    return node;
  }

  private async writeNode(node: BTreeNode<K, V>): Promise<void> {
    const buffer = node.serialize(
      this.config.keySerializer,
      this.config.valueSerializer,
      this.config.pageSize
    );
    await this.opfsManager.writeBlock(node.id, buffer);
    this.nodeCache.set(node.id, node); // Update cache
  }

  public static async create<K, V>(
    userConfig: BTreeConfig<K, V>
  ): Promise<BTree<K, V>> {
    const config: Required<BTreeConfig<K, V>> = {
      order: DEFAULT_ORDER,
      cacheSize: DEFAULT_CACHE_SIZE,
      pageSize: DEFAULT_PAGE_SIZE,
      writeMode: DEFAULT_WRITE_MODE,
      enableTransactionLog: DEFAULT_TRANSACTION_LOG,
      compareKeys: defaultCompareKeys as (a: K, b: K) => number, // Cast needed if K is generic
      ...userConfig,
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
    try {
      return await BTree.open(userConfig);
    } catch (e) {
      if (e instanceof Error && e.message.includes("does not exist")) {
        return await BTree.create(userConfig);
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    // TODO: Flush write-back cache if implemented
    if (this.config.writeMode === "write-back") {
      // await this.flushDirtyNodes();
    }
    await this.opfsManager.flush(); // Ensure OPFSManager flushes its state
    await this.opfsManager.close();
    this.nodeCache.clear();
    this.metadata = null;
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

  async entries(): Promise<Array<[K, V]>> {
    // TODO: Implement iteration over all entries
    throw new Error("Entries not implemented");
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
    if (!this.metadata) throw new Error("Tree not initialized or closed.");
    // TODO: Calculate actual height, numNodes, numEntries, etc.
    return {
      order: this.config.order,
      height: -1, // Placeholder
      numNodes: -1, // Placeholder
      numEntries: -1, // Placeholder
      cacheSize: this.config.cacheSize,
      cacheHits: 0, // Placeholder
      cacheMisses: 0, // Placeholder
      fileSize: await this.opfsManager.getFileSize(),
      pageSize: this.config.pageSize,
    };
  }

  // TODO: Bulk load, transactions, etc.
}
