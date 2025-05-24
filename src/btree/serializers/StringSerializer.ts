import { type Serializer } from "./Serializer";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Serializes strings using UTF-8 encoding.
 * Note: This serializer produces variable-length output.
 * When used in fixed-size node structures, strings might need to be padded or handled
 * with a separate length prefix. For simplicity here, it serializes to its natural length.
 */
export class StringSerializer implements Serializer<string> {
  serialize(value: string): Uint8Array {
    return textEncoder.encode(value);
  }

  deserialize(buffer: Uint8Array, offset = 0): string {
    // If the buffer is a slice, it's fine. If it's the original larger buffer,
    // this will decode the whole remaining part unless length is known.
    // In practice, when deserializing a node, the specific length of the string
    // would be known (e.g., from metadata or until end of allocated space for it).
    return textDecoder.decode(buffer.subarray(offset));
  }
}
