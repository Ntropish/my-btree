/**
 * Simple nanoid implementation
 * utils/nanoid.ts
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function nanoid(size = 21): string {
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));

  while (size--) {
    // Using & 63 is faster than % 64
    id += ALPHABET[bytes[size] & 63];
  }

  return id;
}
