/**
 * Core B-Tree implementation
 */

import { FileManager } from "./FileManager";
import { NodeManager } from "./NodeManager";
import type {
  BTreeConfig,
  BTreeNode,
  BTreeStats,
  SearchResult,
  RangeOptions,
  BulkLoadOptions,
} from "../types/btree";

export class BTreeCore<K, V> {
  private rootOffset: number = 0;
  private height: number = 0;
  private keyCount: number = 0;
  private readonly order: number;
  private readonly compareKeys: (a: K, b: K) => number;
  private readonly fileManager: FileManager;
  private readonly nodeManager: NodeManager<K, V>;

  constructor(
    fileManager: FileManager,
    nodeManager: NodeManager<K, V>,
    config: BTreeConfig<K, V>
  ) {
    this.fileManager = fileManager;
    this.nodeManager = nodeManager;
    this.order = config.order || 128;
    this.compareKeys = config.compareKeys || this.defaultCompare;
  }

  /**
   * Initialize the B-tree
   */
  async initialize(): Promise<void> {
    const header = this.fileManager.getHeader();

    if (header.rootOffset === 0) {
      // Create root node
      const root = await this.nodeManager.createNode(true);
      this.rootOffset = root.offset;
      this.height = 1;

      // Update header
      this.fileManager.updateHeader({
        rootOffset: this.rootOffset,
        height: this.height,
      });
    } else {
      // Load existing tree state
      this.rootOffset = header.rootOffset;
      this.height = header.height;
      // TODO: Calculate key count by traversing tree
    }
  }

  /**
   * Insert a key-value pair
   */
  async insert(key: K, value: V): Promise<void> {
    // Check if root needs to split
    const root = await this.nodeManager.readNode(this.rootOffset);

    if (root.keys.length === this.order - 1) {
      // Root is full, need to split
      const newRoot = await this.nodeManager.createNode(false);
      newRoot.childOffsets = [this.rootOffset];

      // Split the old root
      const { medianKey, newNode } = await this.splitChild(newRoot, 0, root);

      // Update new root
      newRoot.keys.push(medianKey);
      newRoot.childOffsets!.push(newNode.offset);
      await this.nodeManager.writeNode(newRoot);

      // Update root reference
      this.rootOffset = newRoot.offset;
      this.height++;

      this.fileManager.updateHeader({
        rootOffset: this.rootOffset,
        height: this.height,
      });

      // Continue insertion in new root
      await this.insertNonFull(newRoot, key, value);
    } else {
      // Root has space
      await this.insertNonFull(root, key, value);
    }

    this.keyCount++;
  }

  /**
   * Search for a key
   */
  async search(key: K): Promise<V | null> {
    const result = await this.searchNode(this.rootOffset, key);
    return result.value;
  }

  /**
   * Delete a key
   */
  async delete(key: K): Promise<boolean> {
    const deleted = await this.deleteFromNode(this.rootOffset, key);

    if (deleted) {
      this.keyCount--;

      // Check if root is empty and has children
      const root = await this.nodeManager.readNode(this.rootOffset);
      if (
        root.keys.length === 0 &&
        !root.isLeaf &&
        root.childOffsets!.length > 0
      ) {
        // Make the only child the new root
        this.rootOffset = root.childOffsets![0];
        this.height--;

        this.fileManager.updateHeader({
          rootOffset: this.rootOffset,
          height: this.height,
        });

        // TODO: Free the old root node
      }
    }

    return deleted;
  }

  /**
   * Range query
   */
  async range(
    start: K,
    end: K,
    options?: RangeOptions
  ): Promise<Array<[K, V]>> {
    const results: Array<[K, V]> = [];
    const includeStart = options?.includeStart ?? true;
    const includeEnd = options?.includeEnd ?? false;
    const limit = options?.limit ?? Infinity;

    await this.rangeTraverse(
      this.rootOffset,
      start,
      end,
      includeStart,
      includeEnd,
      results,
      limit
    );

    if (options?.reverse) {
      results.reverse();
    }

    return results;
  }

  /**
   * Get all entries
   */
  async entries(): Promise<Array<[K, V]>> {
    const results: Array<[K, V]> = [];
    await this.inorderTraverse(this.rootOffset, results);
    return results;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    // Create new root
    const root = await this.nodeManager.createNode(true);
    this.rootOffset = root.offset;
    this.height = 1;
    this.keyCount = 0;

    // Update header
    this.fileManager.updateHeader({
      rootOffset: this.rootOffset,
      height: this.height,
      nodeCount: 1,
    });

    // Clear cache
    await this.nodeManager.clearCache();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<BTreeStats> {
    const header = this.fileManager.getHeader();
    const cacheStats = this.nodeManager.getCacheStats();

    return {
      nodeCount: header.nodeCount,
      height: this.height,
      keyCount: this.keyCount,
      fileSize: header.totalFileSize,
      cacheHitRate: cacheStats.hitRate,
      cachedNodes: cacheStats.size,
    };
  }

  /**
   * Bulk load data
   */
  async bulkLoad(
    data: Array<[K, V]>,
    options?: BulkLoadOptions
  ): Promise<void> {
    const sorted = options?.sorted ?? false;
    const batchSize = options?.batchSize ?? 1000;
    const onProgress = options?.onProgress;

    // Sort data if not already sorted
    if (!sorted) {
      data.sort((a, b) => this.compareKeys(a[0], b[0]));
    }

    // Clear existing data
    await this.clear();

    // Bulk load using bottom-up approach
    let processed = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, Math.min(i + batchSize, data.length));

      for (const [key, value] of batch) {
        await this.insert(key, value);
      }

      processed += batch.length;
      if (onProgress) {
        onProgress(processed, data.length);
      }
    }
  }

  /**
   * Verify tree integrity
   */
  async verify(): Promise<boolean> {
    try {
      // Verify structure
      const { valid, minKey, maxKey } = await this.verifyNode(
        this.rootOffset,
        null,
        null
      );

      if (!valid) return false;

      // Verify node count
      const actualNodeCount = await this.countNodes(this.rootOffset);
      const header = this.fileManager.getHeader();

      return actualNodeCount === header.nodeCount;
    } catch (error) {
      console.error("Verification error:", error);
      return false;
    }
  }

  /**
   * Close the B-tree
   */
  async close(): Promise<void> {
    await this.nodeManager.flush();
    await this.fileManager.close();
  }

  /**
   * Insert into a non-full node
   */
  private async insertNonFull(
    node: BTreeNode<K, V>,
    key: K,
    value: V
  ): Promise<void> {
    let i = node.keys.length - 1;

    if (node.isLeaf) {
      // Find position and insert
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }

      // Check if key already exists
      if (i >= 0 && this.compareKeys(key, node.keys[i]) === 0) {
        // Update existing value
        node.values![i] = value;
      } else {
        // Insert new key-value
        node.keys.splice(i + 1, 0, key);
        node.values!.splice(i + 1, 0, value);
      }

      await this.nodeManager.writeNode(node);
    } else {
      // Find child to insert into
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }
      i++;

      const childOffset = node.childOffsets![i];
      const child = await this.nodeManager.readNode(childOffset);

      if (child.keys.length === this.order - 1) {
        // Child is full, split it
        const { medianKey, newNode } = await this.splitChild(node, i, child);

        // Insert median key into parent
        node.keys.splice(i, 0, medianKey);
        node.childOffsets!.splice(i + 1, 0, newNode.offset);
        await this.nodeManager.writeNode(node);

        // Determine which child to insert into
        if (this.compareKeys(key, medianKey) > 0) {
          i++;
        }
      }

      // Recurse into appropriate child
      const targetChild = await this.nodeManager.readNode(
        node.childOffsets![i]
      );
      await this.insertNonFull(targetChild, key, value);
    }
  }

  /**
   * Split a full child node
   */
  private async splitChild(
    parent: BTreeNode<K, V>,
    childIndex: number,
    child: BTreeNode<K, V>
  ): Promise<{ medianKey: K; newNode: BTreeNode<K, V> }> {
    const t = Math.floor(this.order / 2);
    const medianIndex = t - 1;

    // Create new node (sibling)
    const newNode = await this.nodeManager.createNode(child.isLeaf);
    newNode.parentOffset = parent.offset;

    // Move half the keys to new node
    const medianKey = child.keys[medianIndex];

    if (child.isLeaf) {
      // For leaf nodes, copy keys and values
      newNode.keys = child.keys.splice(medianIndex + 1);
      newNode.values = child.values!.splice(medianIndex + 1);

      // Update sibling pointers
      newNode.rightSiblingOffset = child.rightSiblingOffset;
      child.rightSiblingOffset = newNode.offset;
      newNode.leftSiblingOffset = child.offset;
    } else {
      // For internal nodes, move keys and child pointers
      newNode.keys = child.keys.splice(medianIndex + 1);
      newNode.childOffsets = child.childOffsets!.splice(medianIndex + 1);

      // Remove median key from child
      child.keys.pop();

      // Update parent pointers of moved children
      for (const childOffset of newNode.childOffsets!) {
        const movedChild = await this.nodeManager.readNode(childOffset);
        movedChild.parentOffset = newNode.offset;
        await this.nodeManager.writeNode(movedChild);
      }
    }

    // Write both nodes
    await this.nodeManager.writeNode(child);
    await this.nodeManager.writeNode(newNode);

    return { medianKey, newNode };
  }

  /**
   * Search for a key in a node
   */
  private async searchNode(
    nodeOffset: number,
    key: K
  ): Promise<SearchResult<K, V>> {
    const node = await this.nodeManager.readNode(nodeOffset);

    // Binary search for key
    let left = 0;
    let right = node.keys.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = this.compareKeys(key, node.keys[mid]);

      if (cmp === 0) {
        // Found key
        return {
          value: node.isLeaf ? node.values![mid] : null,
          node,
          index: mid,
        };
      } else if (cmp < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Key not found in this node
    if (node.isLeaf) {
      return { value: null, node, index: left };
    }

    // Search in appropriate child
    return await this.searchNode(node.childOffsets![left], key);
  }

  /**
   * Delete a key from a node
   */
  private async deleteFromNode(nodeOffset: number, key: K): Promise<boolean> {
    const node = await this.nodeManager.readNode(nodeOffset);

    // Find key index
    let keyIndex = this.findKeyIndex(node, key);

    if (
      keyIndex < node.keys.length &&
      this.compareKeys(node.keys[keyIndex], key) === 0
    ) {
      // Key found in this node
      if (node.isLeaf) {
        // Simple deletion from leaf
        node.keys.splice(keyIndex, 1);
        node.values!.splice(keyIndex, 1);
        await this.nodeManager.writeNode(node);
        return true;
      } else {
        // Delete from internal node
        return await this.deleteFromInternalNode(node, keyIndex);
      }
    } else if (!node.isLeaf) {
      // Key might be in subtree
      const isInSubtree =
        keyIndex < node.keys.length &&
        this.compareKeys(key, node.keys[keyIndex]) < 0;
      const childOffset =
        node.childOffsets![isInSubtree ? keyIndex : keyIndex + 1];

      // Ensure child has enough keys before recursing
      const child = await this.nodeManager.readNode(childOffset);
      if (child.keys.length <= Math.floor(this.order / 2) - 1) {
        await this.fixChildBeforeDelete(node, keyIndex);
        // Re-read node as it might have changed
        return await this.deleteFromNode(nodeOffset, key);
      }

      return await this.deleteFromNode(childOffset, key);
    }

    return false; // Key not found
  }

  /**
   * Delete from internal node
   */
  private async deleteFromInternalNode(
    node: BTreeNode<K, V>,
    keyIndex: number
  ): Promise<boolean> {
    const key = node.keys[keyIndex];
    const leftChildOffset = node.childOffsets![keyIndex];
    const rightChildOffset = node.childOffsets![keyIndex + 1];

    const leftChild = await this.nodeManager.readNode(leftChildOffset);
    const rightChild = await this.nodeManager.readNode(rightChildOffset);

    const t = Math.floor(this.order / 2);

    if (leftChild.keys.length >= t) {
      // Get predecessor
      const pred = await this.getPredecessor(leftChild);
      node.keys[keyIndex] = pred.key;
      await this.nodeManager.writeNode(node);
      return await this.deleteFromNode(leftChildOffset, pred.key);
    } else if (rightChild.keys.length >= t) {
      // Get successor
      const succ = await this.getSuccessor(rightChild);
      node.keys[keyIndex] = succ.key;
      await this.nodeManager.writeNode(node);
      return await this.deleteFromNode(rightChildOffset, succ.key);
    } else {
      // Merge with right child
      await this.mergeNodes(node, keyIndex);
      return await this.deleteFromNode(leftChildOffset, key);
    }
  }

  /**
   * Fix child before deletion
   */
  private async fixChildBeforeDelete(
    parent: BTreeNode<K, V>,
    childIndex: number
  ): Promise<void> {
    const t = Math.floor(this.order / 2);

    // Try borrowing from left sibling
    if (childIndex > 0) {
      const leftSibling = await this.nodeManager.readNode(
        parent.childOffsets![childIndex - 1]
      );
      if (leftSibling.keys.length >= t) {
        await this.borrowFromLeft(parent, childIndex);
        return;
      }
    }

    // Try borrowing from right sibling
    if (childIndex < parent.keys.length) {
      const rightSibling = await this.nodeManager.readNode(
        parent.childOffsets![childIndex + 1]
      );
      if (rightSibling.keys.length >= t) {
        await this.borrowFromRight(parent, childIndex);
        return;
      }
    }

    // Merge with sibling
    if (childIndex < parent.keys.length) {
      await this.mergeNodes(parent, childIndex);
    } else {
      await this.mergeNodes(parent, childIndex - 1);
    }
  }

  /**
   * Range traversal
   */
  private async rangeTraverse(
    nodeOffset: number,
    start: K,
    end: K,
    includeStart: boolean,
    includeEnd: boolean,
    results: Array<[K, V]>,
    limit: number
  ): Promise<void> {
    if (results.length >= limit) return;

    const node = await this.nodeManager.readNode(nodeOffset);

    if (node.isLeaf) {
      // Process leaf node
      for (let i = 0; i < node.keys.length && results.length < limit; i++) {
        const key = node.keys[i];
        const startCmp = this.compareKeys(key, start);
        const endCmp = this.compareKeys(key, end);

        if (
          (startCmp > 0 || (startCmp === 0 && includeStart)) &&
          (endCmp < 0 || (endCmp === 0 && includeEnd))
        ) {
          results.push([key, node.values![i]]);
        } else if (endCmp > 0) {
          break; // Past end range
        }
      }
    } else {
      // Process internal node
      for (let i = 0; i <= node.keys.length && results.length < limit; i++) {
        // Check if we should traverse this child
        if (i === 0 || this.compareKeys(start, node.keys[i - 1]) <= 0) {
          if (
            i === node.keys.length ||
            this.compareKeys(end, node.keys[i]) >= 0
          ) {
            await this.rangeTraverse(
              node.childOffsets![i],
              start,
              end,
              includeStart,
              includeEnd,
              results,
              limit
            );
          }
        }
      }
    }
  }

  /**
   * In-order traversal
   */
  private async inorderTraverse(
    nodeOffset: number,
    results: Array<[K, V]>
  ): Promise<void> {
    const node = await this.nodeManager.readNode(nodeOffset);

    if (node.isLeaf) {
      for (let i = 0; i < node.keys.length; i++) {
        results.push([node.keys[i], node.values![i]]);
      }
    } else {
      for (let i = 0; i < node.keys.length; i++) {
        await this.inorderTraverse(node.childOffsets![i], results);
        // We don't include internal node keys in results
      }
      await this.inorderTraverse(node.childOffsets![node.keys.length], results);
    }
  }

  /**
   * Verify node integrity
   */
  private async verifyNode(
    nodeOffset: number,
    minKey: K | null,
    maxKey: K | null
  ): Promise<{ valid: boolean; minKey: K | null; maxKey: K | null }> {
    const node = await this.nodeManager.readNode(nodeOffset);

    // Check key order
    for (let i = 1; i < node.keys.length; i++) {
      if (this.compareKeys(node.keys[i - 1], node.keys[i]) >= 0) {
        return { valid: false, minKey: null, maxKey: null };
      }
    }

    // Check key bounds
    if (minKey !== null && node.keys.length > 0) {
      if (this.compareKeys(node.keys[0], minKey) < 0) {
        return { valid: false, minKey: null, maxKey: null };
      }
    }

    if (maxKey !== null && node.keys.length > 0) {
      if (this.compareKeys(node.keys[node.keys.length - 1], maxKey) > 0) {
        return { valid: false, minKey: null, maxKey: null };
      }
    }

    const nodeMinKey = node.keys.length > 0 ? node.keys[0] : null;
    const nodeMaxKey =
      node.keys.length > 0 ? node.keys[node.keys.length - 1] : null;

    if (!node.isLeaf) {
      // Verify children
      for (let i = 0; i <= node.keys.length; i++) {
        const childMinKey = i > 0 ? node.keys[i - 1] : minKey;
        const childMaxKey = i < node.keys.length ? node.keys[i] : maxKey;

        const childResult = await this.verifyNode(
          node.childOffsets![i],
          childMinKey,
          childMaxKey
        );

        if (!childResult.valid) {
          return { valid: false, minKey: null, maxKey: null };
        }
      }
    }

    return { valid: true, minKey: nodeMinKey, maxKey: nodeMaxKey };
  }

  /**
   * Count total nodes
   */
  private async countNodes(nodeOffset: number): Promise<number> {
    const node = await this.nodeManager.readNode(nodeOffset);
    let count = 1;

    if (!node.isLeaf) {
      for (const childOffset of node.childOffsets!) {
        count += await this.countNodes(childOffset);
      }
    }

    return count;
  }

  /**
   * Helper methods
   */
  private findKeyIndex(node: BTreeNode<K, V>, key: K): number {
    let index = 0;
    while (
      index < node.keys.length &&
      this.compareKeys(node.keys[index], key) < 0
    ) {
      index++;
    }
    return index;
  }

  private async getPredecessor(
    node: BTreeNode<K, V>
  ): Promise<{ key: K; value: V }> {
    while (!node.isLeaf) {
      const lastChildOffset = node.childOffsets![node.childOffsets!.length - 1];
      node = await this.nodeManager.readNode(lastChildOffset);
    }
    return {
      key: node.keys[node.keys.length - 1],
      value: node.values![node.values!.length - 1],
    };
  }

  private async getSuccessor(
    node: BTreeNode<K, V>
  ): Promise<{ key: K; value: V }> {
    while (!node.isLeaf) {
      node = await this.nodeManager.readNode(node.childOffsets![0]);
    }
    return {
      key: node.keys[0],
      value: node.values![0],
    };
  }

  private async borrowFromLeft(
    parent: BTreeNode<K, V>,
    childIndex: number
  ): Promise<void> {
    // Implementation for borrowing from left sibling
    // TODO: Implement
  }

  private async borrowFromRight(
    parent: BTreeNode<K, V>,
    childIndex: number
  ): Promise<void> {
    // Implementation for borrowing from right sibling
    // TODO: Implement
  }

  private async mergeNodes(
    parent: BTreeNode<K, V>,
    keyIndex: number
  ): Promise<void> {
    // Implementation for merging nodes
    // TODO: Implement
  }

  private defaultCompare(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}
