/**
 * Node Manager - handles node I/O and caching
 */

import { FileManager } from "./FileManager";
import { type BTreeNode } from "../types/btree";
import { type NodeHeader, NodeType, BUFFER_SIZES } from "../storage/FileLayout";
import type { Serializer } from "../storage/Serializer";
import {
  LRUCache,
  WriteThroughCache,
  WriteBackCache,
  type CacheStats,
} from "../storage/Cache";
import { calculateCRC32 } from "../utils/checksum";

export class NodeManager<K, V> {
  private cache: LRUCache<number, BTreeNode<K, V>>;
  private nextNodeId = 1;

  constructor(
    fileManager: FileManager,
    keySerializer: Serializer<K>,
    valueSerializer: Serializer<V>,
    cacheSize: number,
    writeMode: "write-through" | "write-back"
  ) {
    // Create appropriate cache based on write mode
    if (writeMode === "write-through") {
      this.cache = new WriteThroughCache<number, BTreeNode<K, V>>(
        cacheSize,
        async (offset, node) => {
          await this.writeNodeToFile(offset, node);
        }
      );
    } else {
      this.cache = new WriteBackCache<number, BTreeNode<K, V>>(
        cacheSize,
        async (entries) => {
          for (const [offset, node] of entries) {
            await this.writeNodeToFile(offset, node);
          }
        }
      );
    }
  }

  /**
   * Create a new node
   */
  async createNode(isLeaf: boolean): Promise<BTreeNode<K, V>> {
    const nodeSize = this.calculateNodeSize(isLeaf);
    const offset = await this.fileManager.allocateNode(nodeSize);

    const node: BTreeNode<K, V> = {
      offset,
      isLeaf,
      keys: [],
      values: isLeaf ? [] : undefined,
      childOffsets: isLeaf ? undefined : [],
      parentOffset: 0,
      leftSiblingOffset: undefined,
      rightSiblingOffset: undefined,
    };

    // Add to cache
    await this.cache.set(offset, node, true);

    return node;
  }

  /**
   * Read a node from cache or file
   */
  async readNode(offset: number): Promise<BTreeNode<K, V>> {
    // Check cache first
    const cached = this.cache.get(offset);
    if (cached) {
      return cached;
    }

    // Read from file
    const node = await this.readNodeFromFile(offset);

    // Add to cache
    await this.cache.set(offset, node, false);

    return node;
  }

  /**
   * Write a node to cache (and optionally to file)
   */
  async writeNode(node: BTreeNode<K, V>): Promise<void> {
    await this.cache.set(node.offset, node, true);
  }

  /**
   * Delete a node
   */
  async deleteNode(offset: number): Promise<void> {
    const node = await this.readNode(offset);
    const nodeSize = this.calculateNodeSize(node.isLeaf);

    // Remove from cache
    await this.cache.delete(offset);

    // Free space in file
    await this.fileManager.freeNode(offset, nodeSize);
  }

  /**
   * Flush all cached changes to disk
   */
  async flush(): Promise<void> {
    await this.cache.flush();
  }

  /**
   * Clear the cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Close the node manager
   */
  async close(): Promise<void> {
    await this.flush();
    if (this.cache instanceof WriteBackCache) {
      await (this.cache as WriteBackCache<number, BTreeNode<K, V>>).close();
    }
  }

  /**
   * Read node from file
   */
  private async readNodeFromFile(offset: number): Promise<BTreeNode<K, V>> {
    // Read header first
    const headerBuffer = this.fileManager.read(
      offset,
      BUFFER_SIZES.NODE_HEADER
    );
    const header = this.deserializeNodeHeader(headerBuffer);

    // Calculate data size
    const dataSize = this.calculateNodeDataSize(
      header.type === NodeType.Leaf,
      header.keyCount
    );

    // Read data
    const dataBuffer = this.fileManager.read(
      offset + BUFFER_SIZES.NODE_HEADER,
      dataSize
    );

    // Verify checksum
    const calculatedChecksum = calculateCRC32(dataBuffer);
    if (calculatedChecksum !== header.checksum) {
      throw new Error(`Node checksum mismatch at offset ${offset}`);
    }

    // Deserialize node
    return this.deserializeNode(offset, header, dataBuffer);
  }

  /**
   * Write node to file
   */
  private async writeNodeToFile(
    offset: number,
    node: BTreeNode<K, V>
  ): Promise<void> {
    // Create header
    const header: NodeHeader = {
      type: node.isLeaf ? NodeType.Leaf : NodeType.Internal,
      isDeleted: false,
      keyCount: node.keys.length,
      checksum: 0, // Will be calculated
      nodeId: this.nextNodeId++,
      parentOffset: node.parentOffset,
      leftSiblingOffset: node.leftSiblingOffset || 0,
      rightSiblingOffset: node.rightSiblingOffset || 0,
      _reserved1: 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    // Serialize data
    const dataBuffer = this.serializeNodeData(node);

    // Calculate checksum
    header.checksum = calculateCRC32(dataBuffer);

    // Serialize header
    const headerBuffer = this.serializeNodeHeader(header);

    // Write to file
    this.fileManager.write(offset, headerBuffer);
    this.fileManager.write(offset + BUFFER_SIZES.NODE_HEADER, dataBuffer);
  }

  /**
   * Serialize node header
   */
  private serializeNodeHeader(header: NodeHeader): Uint8Array {
    const buffer = new ArrayBuffer(BUFFER_SIZES.NODE_HEADER);
    const view = new DataView(buffer);
    let offset = 0;

    // Node Identification (16 bytes)
    view.setUint8(offset, header.type);
    offset += 1;
    view.setUint8(offset, header.isDeleted ? 1 : 0);
    offset += 1;
    view.setUint16(offset, header.keyCount, true);
    offset += 2;
    view.setUint32(offset, header.checksum, true);
    offset += 4;
    view.setBigUint64(offset, BigInt(header.nodeId), true);
    offset += 8;

    // Tree Structure (32 bytes)
    view.setBigUint64(offset, BigInt(header.parentOffset), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(header.leftSiblingOffset), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(header.rightSiblingOffset), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(header._reserved1), true);
    offset += 8;

    // Metadata (16 bytes)
    view.setBigUint64(offset, BigInt(header.createdAt), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(header.modifiedAt), true);
    offset += 8;

    return new Uint8Array(buffer);
  }

  /**
   * Deserialize node header
   */
  private deserializeNodeHeader(buffer: Uint8Array): NodeHeader {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    let offset = 0;

    return {
      // Node Identification
      type: view.getUint8(offset) as NodeType,
      isDeleted: view.getUint8(offset + 1) !== 0,
      keyCount: view.getUint16(offset + 2, true),
      checksum: view.getUint32(offset + 4, true),
      nodeId: Number(view.getBigUint64(offset + 8, true)),

      // Tree Structure
      parentOffset: Number(view.getBigUint64(offset + 16, true)),
      leftSiblingOffset: Number(view.getBigUint64(offset + 24, true)),
      rightSiblingOffset: Number(view.getBigUint64(offset + 32, true)),
      _reserved1: Number(view.getBigUint64(offset + 40, true)),

      // Metadata
      createdAt: Number(view.getBigUint64(offset + 48, true)),
      modifiedAt: Number(view.getBigUint64(offset + 56, true)),
    };
  }

  /**
   * Serialize node data
   */
  private serializeNodeData(node: BTreeNode<K, V>): Uint8Array {
    const buffers: Uint8Array[] = [];
    let totalSize = 0;

    if (node.isLeaf) {
      // Serialize keys and values
      for (let i = 0; i < node.keys.length; i++) {
        const keyBuffer = this.keySerializer.serialize(node.keys[i]);
        const valueBuffer = this.valueSerializer.serialize(node.values![i]);

        // Add size prefixes if variable length
        if (!this.keySerializer.fixedSize) {
          const sizeBuffer = new ArrayBuffer(4);
          new DataView(sizeBuffer).setUint32(0, keyBuffer.length, true);
          buffers.push(new Uint8Array(sizeBuffer));
          totalSize += 4;
        }

        buffers.push(keyBuffer);
        totalSize += keyBuffer.length;

        if (!this.valueSerializer.fixedSize) {
          const sizeBuffer = new ArrayBuffer(4);
          new DataView(sizeBuffer).setUint32(0, valueBuffer.length, true);
          buffers.push(new Uint8Array(sizeBuffer));
          totalSize += 4;
        }

        buffers.push(valueBuffer);
        totalSize += valueBuffer.length;
      }
    } else {
      // Serialize child offsets and keys
      for (let i = 0; i < node.childOffsets!.length; i++) {
        const offsetBuffer = new ArrayBuffer(8);
        new DataView(offsetBuffer).setBigUint64(
          0,
          BigInt(node.childOffsets![i]),
          true
        );
        buffers.push(new Uint8Array(offsetBuffer));
        totalSize += 8;

        if (i < node.keys.length) {
          const keyBuffer = this.keySerializer.serialize(node.keys[i]);

          if (!this.keySerializer.fixedSize) {
            const sizeBuffer = new ArrayBuffer(4);
            new DataView(sizeBuffer).setUint32(0, keyBuffer.length, true);
            buffers.push(new Uint8Array(sizeBuffer));
            totalSize += 4;
          }

          buffers.push(keyBuffer);
          totalSize += keyBuffer.length;
        }
      }
    }

    // Combine all buffers
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }

    return result;
  }

  /**
   * Deserialize node
   */
  private deserializeNode(
    nodeOffset: number,
    header: NodeHeader,
    dataBuffer: Uint8Array
  ): BTreeNode<K, V> {
    const node: BTreeNode<K, V> = {
      offset: nodeOffset,
      isLeaf: header.type === NodeType.Leaf,
      keys: [],
      values: header.type === NodeType.Leaf ? [] : undefined,
      childOffsets: header.type === NodeType.Leaf ? undefined : [],
      parentOffset: header.parentOffset,
      leftSiblingOffset: header.leftSiblingOffset || undefined,
      rightSiblingOffset: header.rightSiblingOffset || undefined,
    };

    let offset = 0;

    if (node.isLeaf) {
      // Deserialize keys and values
      for (let i = 0; i < header.keyCount; i++) {
        // Read key
        let keySize: number;
        if (this.keySerializer.fixedSize) {
          keySize = this.keySerializer.fixedSize;
        } else {
          const view = new DataView(
            dataBuffer.buffer,
            dataBuffer.byteOffset + offset,
            4
          );
          keySize = view.getUint32(0, true);
          offset += 4;
        }

        const keyBuffer = dataBuffer.slice(offset, offset + keySize);
        node.keys.push(this.keySerializer.deserialize(keyBuffer));
        offset += keySize;

        // Read value
        let valueSize: number;
        if (this.valueSerializer.fixedSize) {
          valueSize = this.valueSerializer.fixedSize;
        } else {
          const view = new DataView(
            dataBuffer.buffer,
            dataBuffer.byteOffset + offset,
            4
          );
          valueSize = view.getUint32(0, true);
          offset += 4;
        }

        const valueBuffer = dataBuffer.slice(offset, offset + valueSize);
        node.values!.push(this.valueSerializer.deserialize(valueBuffer));
        offset += valueSize;
      }
    } else {
      // Deserialize child offsets and keys
      const childCount = header.keyCount + 1;

      for (let i = 0; i < childCount; i++) {
        // Read child offset
        const view = new DataView(
          dataBuffer.buffer,
          dataBuffer.byteOffset + offset,
          8
        );
        node.childOffsets!.push(Number(view.getBigUint64(0, true)));
        offset += 8;

        if (i < header.keyCount) {
          // Read key
          let keySize: number;
          if (this.keySerializer.fixedSize) {
            keySize = this.keySerializer.fixedSize;
          } else {
            const sizeView = new DataView(
              dataBuffer.buffer,
              dataBuffer.byteOffset + offset,
              4
            );
            keySize = sizeView.getUint32(0, true);
            offset += 4;
          }

          const keyBuffer = dataBuffer.slice(offset, offset + keySize);
          node.keys.push(this.keySerializer.deserialize(keyBuffer));
          offset += keySize;
        }
      }
    }

    return node;
  }

  /**
   * Calculate node size
   */
  private calculateNodeSize(isLeaf: boolean): number {
    const header = this.fileManager.getHeader();
    const order = header.order;

    if (header.nodeSize > 0) {
      return header.nodeSize;
    }

    // Calculate based on order and serializer sizes
    const headerSize = BUFFER_SIZES.NODE_HEADER;

    if (isLeaf) {
      const maxKeys = order - 1;
      const keySize = this.keySerializer.fixedSize || 100; // Estimate for variable
      const valueSize = this.valueSerializer.fixedSize || 100; // Estimate for variable
      const keySizePrefix = this.keySerializer.fixedSize ? 0 : 4;
      const valueSizePrefix = this.valueSerializer.fixedSize ? 0 : 4;

      return (
        headerSize +
        maxKeys * (keySize + valueSize + keySizePrefix + valueSizePrefix)
      );
    } else {
      const maxKeys = order - 1;
      const maxChildren = order;
      const keySize = this.keySerializer.fixedSize || 100; // Estimate for variable
      const keySizePrefix = this.keySerializer.fixedSize ? 0 : 4;

      return headerSize + maxChildren * 8 + maxKeys * (keySize + keySizePrefix);
    }
  }

  /**
   * Calculate node data size based on actual content
   */
  private calculateNodeDataSize(isLeaf: boolean, keyCount: number): number {
    if (isLeaf) {
      // For leaf nodes: keys + values
      const keySize = this.keySerializer.fixedSize || 100; // Max estimate
      const valueSize = this.valueSerializer.fixedSize || 100; // Max estimate
      const keySizePrefix = this.keySerializer.fixedSize ? 0 : 4;
      const valueSizePrefix = this.valueSerializer.fixedSize ? 0 : 4;

      return keyCount * (keySize + valueSize + keySizePrefix + valueSizePrefix);
    } else {
      // For internal nodes: child offsets + keys
      const childCount = keyCount + 1;
      const keySize = this.keySerializer.fixedSize || 100; // Max estimate
      const keySizePrefix = this.keySerializer.fixedSize ? 0 : 4;

      return childCount * 8 + keyCount * (keySize + keySizePrefix);
    }
  }
}
