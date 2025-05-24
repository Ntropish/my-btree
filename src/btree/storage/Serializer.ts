// storage/Serializer.ts
export interface Serializer<T> {
  /** Serialize value to bytes */
  serialize(value: T): Uint8Array;

  /** Deserialize bytes to value */
  deserialize(buffer: Uint8Array): T;

  /** Get size of serialized value (can be estimated) */
  size(value: T): number;

  /** Whether this serializer produces fixed-size output */
  readonly fixedSize?: number;
}
