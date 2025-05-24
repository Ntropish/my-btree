/**
 * Interface for serializing and deserializing keys and values.
 */
export interface Serializer<T> {
  /**
   * Serializes the given value into a Uint8Array.
   * @param value The value to serialize.
   * @returns A Uint8Array representing the serialized value.
   */
  serialize(value: T): Uint8Array;

  /**
   * Deserializes the given Uint8Array back into a value of type T.
   * @param buffer The Uint8Array to deserialize.
   * @param offset The offset in the buffer to start deserializing from.
   * @returns The deserialized value.
   */
  deserialize(buffer: Uint8Array, offset?: number): T;

  /**
   * Optional: Returns the size in bytes of the serialized value.
   * If not implemented, the size is assumed to be variable.
   * For fixed-size serializers, this can optimize space allocation.
   * @param value The value whose serialized size is to be determined.
   * @returns The size in bytes, or undefined if variable or unknown.
   */
  // fixedSize?: number; // Alternative for truly fixed size, known without value
}
