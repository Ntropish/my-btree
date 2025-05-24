import { type Serializer } from "../serializers/Serializer";

// Placeholder for Node ID type (could be number for block ID)
export type NodeId = number;

export interface BTreeNodeEntry<K, V> {
  key: K;
  value?: V; // Only in leaf nodes
  childNodeId?: NodeId; // Only in internal nodes (points to left child of key)
}

export class BTreeNode<K, V> {
  id: NodeId; // The block ID where this node is stored
  isLeaf: boolean;
  entries: BTreeNodeEntry<K, V>[];
  // For internal nodes, one more child pointer than keys
  // This can be the rightmost child, not associated with a specific key in `entries`.
  rightmostChildNodeId?: NodeId;

  public isDirty: boolean = false; // For write-back cache

  // Max number of keys: order - 1. Min keys: ceil(order/2) - 1 (except root)
  // Max children: order. Min children: ceil(order/2) (except root)
  private order: number; // Max number of children

  constructor(id: NodeId, order: number, isLeaf: boolean) {
    this.id = id;
    this.order = order;
    this.isLeaf = isLeaf;
    this.entries = [];
  }

  // Example: check if node is full (max keys = order - 1)
  isFull(): boolean {
    return this.entries.length >= this.order - 1;
  }

  // Example: check if node has minimum entries
  hasMinimumEntries(): boolean {
    // Root can have fewer, other nodes need ceil(order/2)-1 keys, so ceil(order/2) entries/children
    const minKeys = Math.ceil(this.order / 2) - 1;
    return this.entries.length >= minKeys;
  }

  /**
   * Finds the index where the key is or should be inserted.
   * @param key The key to search for.
   * @param compareKeys The key comparison function.
   * @returns The index i such that all entries[j].key < key for j < i,
   * and all entries[j].key >= key for j >= i.
   * Or, if key is found, returns -(index + 1) for binary search like indication.
   * Simpler: returns index of first key >= given key, or entries.length if all are smaller.
   */
  findKeyIndex(key: K, compareKeys: (a: K, b: K) => number): number {
    let low = 0;
    let high = this.entries.length - 1;
    let index = this.entries.length;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cmp = compareKeys(this.entries[mid].key, key);
      if (cmp < 0) {
        low = mid + 1;
      } else if (cmp > 0) {
        index = mid; // Potential insertion point or match
        high = mid - 1;
      } else {
        return mid; // Exact match
      }
    }
    return index; // Insertion point if not found
  }

  // TODO: Implement actual serialization and deserialization
  // These will be complex and need to handle variable key/value sizes,
  // pointers (node IDs), and node metadata within a fixed-size page.

  /**
   * Serializes the node into a Uint8Array for storage.
   * @param keySerializer Serializer for keys.
   * @param valueSerializer Serializer for values.
   * @param pageSize The fixed size of the page this node must fit into.
   * @returns A Uint8Array representing the serialized node.
   */
  serialize(
    keySerializer: Serializer<K>,
    valueSerializer: Serializer<V>,
    pageSize: number
  ): Uint8Array {
    // Implementation Details:
    // 1. Header: isLeaf (1 byte), numEntries (e.g., 2 bytes)
    // 2. Pointers/NodeIDs area (for internal nodes)
    // 3. Key/Value data area (packed, potentially with offsets)
    // This needs careful planning for variable sized data within a fixed page.
    // For now, a placeholder:
    const buffer = new Uint8Array(pageSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    view.setUint8(offset, this.isLeaf ? 1 : 0);
    offset += 1;
    view.setUint16(offset, this.entries.length, true);
    offset += 2;
    // view.setUint32(offset, this.id, true); // id might not need to be in payload if blockId is implicit
    // offset += 4;

    // Serialize entries... this part is tricky with variable sizes.
    // A common approach: write all fixed-size parts first, then variable parts,
    // using offsets or by carefully managing a "free space pointer" within the page.

    // For simplicity, imagine this is just a placeholder.
    // A real implementation would iterate `this.entries` and `this.rightmostChildNodeId`.
    console.warn(
      "BTreeNode.serialize is a placeholder and needs full implementation."
    );
    return buffer;
  }

  /**
   * Deserializes data from a Uint8Array into a BTreeNode instance.
   * @param id The block ID for this node.
   * @param order The order of the B-Tree.
   * @param buffer The Uint8Array containing the node's data.
   * @param keySerializer Serializer for keys.
   * @param valueSerializer Serializer for values.
   * @returns A BTreeNode instance.
   */
  static deserialize<K, V>(
    id: NodeId,
    order: number,
    buffer: Uint8Array,
    keySerializer: Serializer<K>,
    valueSerializer: Serializer<V>
  ): BTreeNode<K, V> {
    const view = new DataView(buffer.buffer);
    let offset = 0;

    const isLeaf = view.getUint8(offset) === 1;
    offset += 1;
    const numEntries = view.getUint16(offset, true);
    offset += 2;
    // const nodeId = view.getUint32(offset, true); // If id was part of payload
    // offset += 4;

    const node = new BTreeNode<K, V>(id, order, isLeaf);

    // Deserialize entries...
    // This would involve reading keys, and values (if leaf) or childNodeIds (if internal).
    console.warn(
      "BTreeNode.deserialize is a placeholder and needs full implementation."
    );
    // Example of reading one entry (highly simplified):
    // if (numEntries > 0) {
    //   // Assume key, then value/childId
    // }
    node.entries = []; // Placeholder

    return node;
  }

  // In BTreeNode.ts (Conceptual)
  public getAllChildNodeIds(): NodeId[] {
    if (this.isLeaf) return [];
    const ids: NodeId[] = [];
    // This highly depends on your BTreeNode structure for children.
    // If childNodeIds is a flat array: C0, K0, C1, K1, C2 ... Kn, Cn+1
    // Then this.childNodeIds would be the array to return.
    // If child pointers are mixed with entries or only rightmostChildNodeId exists:
    this.entries.forEach((entry) => {
      if (entry.childNodeId) ids.push(entry.childNodeId);
    });
    if (this.rightmostChildNodeId) {
      ids.push(this.rightmostChildNodeId);
    }
    // Ensure no duplicates if structure could cause them, though it shouldn't for valid B-Trees.
    // More robustly, if you have a dedicated `this.childNodeIds: NodeId[]` array in BTreeNode:
    // return this.childNodeIds.filter(id => id !== undefined && id !== null);
    return ids; // Placeholder - adjust to your actual BTreeNode child pointer storage.
  }

  public markDirty(): void {
    this.isDirty = true;
  }

  public markClean(): void {
    this.isDirty = false;
  }
}
