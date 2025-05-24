// storage/serializers/PrimitiveSerializer.ts
export class NumberSerializer implements Serializer<number> {
  readonly fixedSize = 8;

  serialize(value: number): Uint8Array {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true); // little-endian
    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array): number {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    return view.getFloat64(0, true);
  }

  size(value: number): number {
    return this.fixedSize;
  }
}

export class Int32Serializer implements Serializer<number> {
  readonly fixedSize = 4;

  serialize(value: number): Uint8Array {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, value, true);
    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array): number {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    return view.getInt32(0, true);
  }

  size(value: number): number {
    return this.fixedSize;
  }
}

export class StringSerializer implements Serializer<string> {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  serialize(value: string): Uint8Array {
    const encoded = this.encoder.encode(value);
    const buffer = new ArrayBuffer(4 + encoded.length);
    const view = new DataView(buffer);

    // Write length prefix
    view.setUint32(0, encoded.length, true);

    // Write string data
    new Uint8Array(buffer, 4).set(encoded);

    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array): string {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    const length = view.getUint32(0, true);

    const stringBytes = buffer.slice(4, 4 + length);
    return this.decoder.decode(stringBytes);
  }

  size(value: string): number {
    return 4 + this.encoder.encode(value).length;
  }
}

export class BooleanSerializer implements Serializer<boolean> {
  readonly fixedSize = 1;

  serialize(value: boolean): Uint8Array {
    return new Uint8Array([value ? 1 : 0]);
  }

  deserialize(buffer: Uint8Array): boolean {
    return buffer[0] !== 0;
  }

  size(value: boolean): number {
    return this.fixedSize;
  }
}

export class BigIntSerializer implements Serializer<bigint> {
  serialize(value: bigint): Uint8Array {
    const isNegative = value < 0n;
    const absValue = isNegative ? -value : value;

    // Convert to hex string and then to bytes
    const hex = absValue.toString(16);
    const bytes = Math.ceil(hex.length / 2);
    const buffer = new ArrayBuffer(1 + 4 + bytes);
    const view = new DataView(buffer);

    // Write sign
    view.setUint8(0, isNegative ? 1 : 0);

    // Write length
    view.setUint32(1, bytes, true);

    // Write bytes
    const byteArray = new Uint8Array(buffer, 5);
    for (let i = 0; i < bytes; i++) {
      const byteHex = hex.substr(i * 2, 2).padStart(2, "0");
      byteArray[i] = parseInt(byteHex, 16);
    }

    return new Uint8Array(buffer);
  }

  deserialize(buffer: Uint8Array): bigint {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    const isNegative = view.getUint8(0) !== 0;
    const length = view.getUint32(1, true);

    // Read bytes and convert to hex
    let hex = "";
    for (let i = 0; i < length; i++) {
      hex += buffer[5 + i].toString(16).padStart(2, "0");
    }

    const value = BigInt("0x" + hex);
    return isNegative ? -value : value;
  }

  size(value: bigint): number {
    const hex = value.toString(16);
    return 1 + 4 + Math.ceil(hex.length / 2);
  }
}
