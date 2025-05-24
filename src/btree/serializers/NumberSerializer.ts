import { type Serializer } from "./Serializer";

/**
 * Serializes JavaScript numbers (64-bit floating point)
 */
export class NumberSerializer implements Serializer<number> {
  // public readonly fixedSize = 8;

  serialize(value: number): Uint8Array {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true); // true for little-endian
    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array, offset = 0): number {
    if (buffer.byteLength - offset < 8) {
      throw new Error("Buffer too small to deserialize number.");
    }
    const dataView = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    return dataView.getFloat64(0, true); // true for little-endian
  }
}
