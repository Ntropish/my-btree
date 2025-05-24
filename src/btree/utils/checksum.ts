/**
 * Checksum utilities
 * utils/checksum.ts
 */

// CRC32 lookup table
const CRC32_TABLE = new Uint32Array(256);

// Initialize CRC32 table
(() => {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC32_TABLE[i] = c;
  }
})();

/**
 * Calculate CRC32 checksum
 */
export function calculateCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}
