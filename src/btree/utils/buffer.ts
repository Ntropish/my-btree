/**
 * Buffer utilities
 * utils/buffer.ts
 */

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }

  return result;
}

/**
 * Compare two Uint8Arrays
 */
export function compareBuffers(a: Uint8Array, b: Uint8Array): number {
  const minLength = Math.min(a.length, b.length);

  for (let i = 0; i < minLength; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }

  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

/**
 * Create a buffer filled with a value
 */
export function createBuffer(size: number, fillValue = 0): Uint8Array {
  const buffer = new Uint8Array(size);
  if (fillValue !== 0) {
    buffer.fill(fillValue);
  }
  return buffer;
}
