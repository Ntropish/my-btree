// storage/serializers/JSONSerializer.ts
export class JSONSerializer<T> implements Serializer<T> {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  serialize(value: T): Uint8Array {
    const json = JSON.stringify(value);
    return this.encoder.encode(json);
  }

  deserialize(buffer: Uint8Array): T {
    const json = this.decoder.decode(buffer);
    return JSON.parse(json);
  }

  size(value: T): number {
    return this.encoder.encode(JSON.stringify(value)).length;
  }
}
