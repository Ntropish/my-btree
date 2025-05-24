// storage/serializers/CompositeSerializer.ts
export class CompositeSerializer<T> implements Serializer<T> {
  constructor(
    private fields: Array<{
      key: keyof T;
      serializer: Serializer<any>;
    }>
  ) {}

  serialize(value: T): Uint8Array {
    const buffers: Uint8Array[] = [];
    let totalSize = 0;

    for (const field of this.fields) {
      const fieldValue = value[field.key];
      const serialized = field.serializer.serialize(fieldValue);

      // Add size prefix for variable-length fields
      if (!field.serializer.fixedSize) {
        const sizeBuffer = new ArrayBuffer(4);
        new DataView(sizeBuffer).setUint32(0, serialized.length, true);
        buffers.push(new Uint8Array(sizeBuffer));
        totalSize += 4;
      }

      buffers.push(serialized);
      totalSize += serialized.length;
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

  deserialize(buffer: Uint8Array): T {
    const result = {} as T;
    let offset = 0;

    for (const field of this.fields) {
      let fieldSize: number;

      if (field.serializer.fixedSize) {
        fieldSize = field.serializer.fixedSize;
      } else {
        // Read size prefix
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
        fieldSize = view.getUint32(0, true);
        offset += 4;
      }

      const fieldBuffer = buffer.slice(offset, offset + fieldSize);
      result[field.key] = field.serializer.deserialize(fieldBuffer);
      offset += fieldSize;
    }

    return result;
  }

  size(value: T): number {
    let totalSize = 0;

    for (const field of this.fields) {
      const fieldSize = field.serializer.size(value[field.key]);
      totalSize += fieldSize;

      // Add size prefix for variable-length fields
      if (!field.serializer.fixedSize) {
        totalSize += 4;
      }
    }

    return totalSize;
  }
}
