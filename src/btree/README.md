# OPFS B-Tree

A high-performance B-tree implementation using the Origin Private File System (OPFS) for persistent storage in the browser.

## Features

- 🚀 **High Performance**: Optimized B-tree implementation with configurable order
- 💾 **Persistent Storage**: Uses OPFS for reliable, browser-based file storage
- 🔄 **Async API**: Non-blocking operations using Web Workers
- 🎯 **Type Safety**: Full TypeScript support with generics
- 📦 **Flexible Serialization**: Built-in and custom serializers for any data type
- 💪 **Advanced Features**: Range queries, bulk loading, transactions, and more
- 🛡️ **Reliability**: Checksums, verification, and crash recovery

## Installation

```bash
npm install opfs-btree
```

## Quick Start

```typescript
import { BTree, NumberSerializer, StringSerializer } from "btree";

// Create a B-tree with number keys and string values
const tree = await BTree.openOrCreate({
  name: "my-index",
  keySerializer: new NumberSerializer(),
  valueSerializer: new StringSerializer(),
});

// Insert data
await tree.insert(1, "Hello");
await tree.insert(2, "World");

// Search
const value = await tree.search(1); // 'Hello'

// Range query
const range = await tree.range(0, 10); // [[1, 'Hello'], [2, 'World']]

// Clean up
await tree.close();
```

## API Reference

### Creating a B-Tree

```typescript
const tree = await BTree.create<K, V>(config: BTreeConfig<K, V>);
```

Configuration options:

- `name`: Unique identifier for the B-tree file
- `order`: B-tree order (default: 128)
- `keySerializer`: Serializer for keys
- `valueSerializer`: Serializer for values
- `cacheSize`: Number of nodes to cache (default: 1000)
- `writeMode`: 'write-through' or 'write-back' (default: 'write-through')
- `enableTransactionLog`: Enable crash recovery (default: false)
- `compareKeys`: Custom key comparison function

### Basic Operations

```typescript
// Insert
await tree.insert(key: K, value: V): Promise<void>

// Search
await tree.search(key: K): Promise<V | null>

// Delete
await tree.delete(key: K): Promise<boolean>

// Range query
await tree.range(start: K, end: K, options?: RangeOptions): Promise<Array<[K, V]>>

// Get all entries
await tree.entries(): Promise<Array<[K, V]>>

// Clear all data
await tree.clear(): Promise<void>

// Get statistics
await tree.stats(): Promise<BTreeStats>
```

### Bulk Operations

```typescript
// Bulk load data
const data: Array<[K, V]> = [...];
await tree.bulkLoad(data, {
  sorted: true,
  batchSize: 1000,
  onProgress: (loaded, total) => {
    console.log(`Progress: ${loaded}/${total}`);
  }
});
```

### Serializers

Built-in serializers:

- `NumberSerializer` - 64-bit floating point numbers
- `Int32Serializer` - 32-bit integers
- `StringSerializer` - UTF-8 strings
- `BooleanSerializer` - Boolean values
- `BigIntSerializer` - Arbitrary precision integers
- `JSONSerializer` - Any JSON-serializable object

Custom serializer example:

```typescript
class DateSerializer implements Serializer<Date> {
  serialize(value: Date): Uint8Array {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value.getTime(), true);
    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array): Date {
    const timestamp = new DataView(buffer.buffer).getFloat64(0, true);
    return new Date(timestamp);
  }

  size(value: Date): number {
    return 8;
  }
}
```

### Composite Keys

```typescript
interface UserKey {
  category: string;
  id: number;
}

const keySerializer = new CompositeSerializer<UserKey>([
  { key: "category", serializer: new StringSerializer() },
  { key: "id", serializer: new NumberSerializer() },
]);

const tree = await BTree.create<UserKey, string>({
  name: "composite-index",
  keySerializer,
  valueSerializer: new StringSerializer(),
  compareKeys: (a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    return catCmp !== 0 ? catCmp : a.id - b.id;
  },
});
```

### Persistence

```typescript
// Check if tree exists
const exists = await BTree.exists("my-index");

// Open existing tree
const tree = await BTree.open({
  name: "my-index",
  keySerializer: new NumberSerializer(),
  valueSerializer: new StringSerializer(),
});

// Delete tree file
await BTree.destroy("my-index");
```

## Performance Considerations

1. **Order Selection**: Higher order (128-256) for sequential access, lower order (32-64) for random access
2. **Cache Size**: Increase for better read performance at the cost of memory
3. **Write Mode**: Use 'write-back' for better write performance with periodic flushes
4. **Bulk Loading**: Always use bulk load for large datasets with sorted data when possible

## Browser Compatibility

Requires browsers with OPFS support:

- Chrome 86+
- Edge 86+
- Safari 15.2+
- Firefox (behind flag)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT License - see LICENSE file for details
