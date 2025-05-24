/**
 * OPFS File Manager for B-Tree storage
 */

import {
  type FileHeader,
  MAGIC_NUMBER,
  FILE_VERSION,
  HEADER_SIZE,
} from "../storage/FileLayout";
import type { BTreeConfig } from "../types/btree";
import { calculateCRC32 } from "../utils/checksum";

export class FileManager {
  private fileHandle: FileSystemFileHandle | null = null;
  private syncHandle: FileSystemSyncAccessHandle | null = null;
  private header: FileHeader | null = null;
  private isOpen = false;
  private fileName: string;
  private _isOpen = false;

  constructor(fileName: string) {
    this.fileName = fileName;
  }

  /**
   * Create a new B-tree file
   */
  async create<K, V>(config: BTreeConfig<K, V>): Promise<void> {
    console.log("FileManager: Creating B-tree file");
    try {
      // Get OPFS root
      const root = await navigator.storage.getDirectory();

      // Create or get file handle
      this.fileHandle = await root.getFileHandle(this.fileName, {
        create: true,
      });

      // Get sync access handle
      this.syncHandle = await this.fileHandle.createSyncAccessHandle();

      // Initialize header
      this.header = this.createHeader(config);

      // Write header to file
      await this.writeHeader();

      // Flush to ensure header is written
      await this.flush();

      this._isOpen = true;
      console.log("FileManager: File created successfully");
    } catch (error) {
      throw new Error(`Failed to create B-tree file: ${error}`);
    }
  }

  /**
   * Open an existing B-tree file
   */
  async open(): Promise<void> {
    console.log("FileManager: Opening B-tree file");
    try {
      // Get OPFS root
      const root = await navigator.storage.getDirectory();

      // Get existing file handle
      this.fileHandle = await root.getFileHandle(this.fileName, {
        create: false,
      });

      // Get sync access handle
      this.syncHandle = await this.fileHandle.createSyncAccessHandle();

      // Read and validate header
      this.header = await this.readHeader();

      this._isOpen = true;
    } catch (error) {
      throw new Error(`Failed to open B-tree file: ${error}`);
    }
  }

  /**
   * Close the file
   */
  async close(): Promise<void> {
    if (this.syncHandle) {
      await this.flush();
      this.syncHandle.close();
      this.syncHandle = null;
    }

    this.fileHandle = null;
    this.header = null;
    this.isOpen = false;
  }

  /**
   * Read data from file
   */
  read(offset: number, length: number): Uint8Array {
    if (!this.syncHandle) {
      throw new Error("File not open");
    }

    const buffer = new Uint8Array(length);
    const bytesRead = this.syncHandle.read(buffer, { at: offset });

    if (bytesRead !== length) {
      throw new Error(`Read error: expected ${length} bytes, got ${bytesRead}`);
    }

    return buffer;
  }

  /**
   * Write data to file
   */
  write(offset: number, data: Uint8Array): void {
    if (!this.syncHandle) {
      throw new Error("File not open");
    }

    const bytesWritten = this.syncHandle.write(data, { at: offset });

    if (bytesWritten !== data.length) {
      throw new Error(
        `Write error: expected ${data.length} bytes, wrote ${bytesWritten}`
      );
    }

    // Update file size in header if needed
    if (this.header) {
      const endOffset = offset + data.length;
      if (endOffset > this.header.totalFileSize) {
        this.header.totalFileSize = endOffset;
        this.header.modifiedAt = Date.now();
      }
    }
  }

  /**
   * Allocate space for a new node
   */
  async allocateNode(size: number): Promise<number> {
    if (!this.header) {
      throw new Error("File not initialized");
    }

    let offset: number;

    // Check free list first
    if (this.header.freeListHead !== 0) {
      // TODO: Implement free list allocation
      // For now, always allocate at end
    }

    // Allocate at end of file
    offset = this.header.totalFileSize;
    this.header.totalFileSize += size;
    this.header.nodeCount++;
    this.header.modifiedAt = Date.now();

    // Ensure file is large enough
    if (this.syncHandle) {
      this.syncHandle.truncate(this.header.totalFileSize);
    }

    return offset;
  }

  /**
   * Free a node
   */
  async freeNode(offset: number, size: number): Promise<void> {
    if (!this.header) {
      throw new Error("File not initialized");
    }

    // TODO: Add to free list
    // For now, just decrement node count
    this.header.nodeCount--;
    this.header.modifiedAt = Date.now();
  }

  /**
   * Flush changes to disk
   */
  async flush(): Promise<void> {
    if (!this.syncHandle) return;

    // Write updated header
    if (this.header) {
      await this.writeHeader();
    }

    // Flush to disk
    this.syncHandle.flush();
  }

  /**
   * Get file header
   */
  getHeader(): FileHeader {
    if (!this.header) {
      throw new Error("File not initialized");
    }
    return this.header;
  }

  /**
   * Update header
   */
  updateHeader(updates: Partial<FileHeader>): void {
    if (!this.header) {
      throw new Error("File not initialized");
    }

    Object.assign(this.header, updates);
    this.header.modifiedAt = Date.now();
  }

  /**
   * Check if a file exists
   */
  static async exists(fileName: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle(fileName, { create: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file
   */
  static async destroy(fileName: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileName);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Create a new header
   */
  private createHeader<K, V>(config: BTreeConfig<K, V>): FileHeader {
    const now = Date.now();

    return {
      // Identification
      magicNumber: MAGIC_NUMBER,
      version: FILE_VERSION,
      checksum: 0, // Will be calculated when writing
      _reserved1: 0,

      // B-Tree Configuration
      order: config.order || 128,
      keySize: config.keySerializer.fixedSize || 0,
      valueSize: config.valueSerializer.fixedSize || 0,
      nodeSize: 0, // Will be calculated based on order and serializers

      // Tree State
      rootOffset: 0,
      nodeCount: 0,
      height: 0,
      _reserved2: 0,

      // Free Space Management
      freeListHead: 0,
      totalFileSize: HEADER_SIZE,

      // Metadata
      createdAt: now,
      modifiedAt: now,
      transactionId: 0,
      flags: 0,

      // Serializer Configuration
      keySerializerType: config.keySerializer.constructor.name.padEnd(16, "\0"),
      valueSerializerType: config.valueSerializer.constructor.name.padEnd(
        16,
        "\0"
      ),

      // Reserved
      _reserved: new Uint8Array(376),
    };
  }

  /**
   * Write header to file
   */
  private async writeHeader(): Promise<void> {
    if (!this.header || !this.syncHandle) {
      throw new Error("Cannot write header: file not open");
    }

    const buffer = new ArrayBuffer(HEADER_SIZE);
    const view = new DataView(buffer);
    let offset = 0;

    // Identification (16 bytes)
    view.setUint32(offset, this.header.magicNumber, true);
    offset += 4;
    view.setUint32(offset, this.header.version, true);
    offset += 4;
    view.setUint32(offset, 0, true);
    offset += 4; // Checksum placeholder
    view.setUint32(offset, this.header._reserved1, true);
    offset += 4;

    // B-Tree Configuration (16 bytes)
    view.setUint32(offset, this.header.order, true);
    offset += 4;
    view.setUint32(offset, this.header.keySize, true);
    offset += 4;
    view.setUint32(offset, this.header.valueSize, true);
    offset += 4;
    view.setUint32(offset, this.header.nodeSize, true);
    offset += 4;

    // Tree State (24 bytes)
    view.setBigUint64(offset, BigInt(this.header.rootOffset), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(this.header.nodeCount), true);
    offset += 8;
    view.setUint32(offset, this.header.height, true);
    offset += 4;
    view.setUint32(offset, this.header._reserved2, true);
    offset += 4;

    // Free Space Management (16 bytes)
    view.setBigUint64(offset, BigInt(this.header.freeListHead), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(this.header.totalFileSize), true);
    offset += 8;

    // Metadata (32 bytes)
    view.setBigUint64(offset, BigInt(this.header.createdAt), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(this.header.modifiedAt), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(this.header.transactionId), true);
    offset += 8;
    view.setBigUint64(offset, BigInt(this.header.flags), true);
    offset += 8;

    // Serializer Configuration (32 bytes)
    const encoder = new TextEncoder();
    const keySerializerBytes = encoder.encode(this.header.keySerializerType);
    const valueSerializerBytes = encoder.encode(
      this.header.valueSerializerType
    );

    new Uint8Array(buffer, offset, 16).set(keySerializerBytes.slice(0, 16));
    offset += 16;
    new Uint8Array(buffer, offset, 16).set(valueSerializerBytes.slice(0, 16));
    offset += 16;

    // Reserved (376 bytes)
    new Uint8Array(buffer, offset, 376).set(this.header._reserved);

    // Calculate and write checksum
    const headerBytes = new Uint8Array(buffer);
    const checksum = calculateCRC32(headerBytes.slice(12)); // Skip magic, version, and checksum fields
    view.setUint32(8, checksum, true);

    // Write to file
    this.write(0, headerBytes);
  }

  /**
   * Read header from file
   */
  private async readHeader(): Promise<FileHeader> {
    const buffer = this.read(0, HEADER_SIZE);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    // Read identification
    const magicNumber = view.getUint32(offset, true);
    offset += 4;
    const version = view.getUint32(offset, true);
    offset += 4;
    const checksum = view.getUint32(offset, true);
    offset += 4;
    const _reserved1 = view.getUint32(offset, true);
    offset += 4;

    // Validate magic number
    if (magicNumber !== MAGIC_NUMBER) {
      throw new Error("Invalid file format: wrong magic number");
    }

    // Validate version
    if (version !== FILE_VERSION) {
      throw new Error(`Unsupported file version: ${version}`);
    }

    // Validate checksum
    const calculatedChecksum = calculateCRC32(buffer.slice(12));
    if (checksum !== calculatedChecksum) {
      throw new Error("Header checksum mismatch: file may be corrupted");
    }

    // Read rest of header
    const header: FileHeader = {
      magicNumber,
      version,
      checksum,
      _reserved1,

      // B-Tree Configuration
      order: view.getUint32(offset, true),
      keySize: view.getUint32(offset + 4, true),
      valueSize: view.getUint32(offset + 8, true),
      nodeSize: view.getUint32(offset + 12, true),

      // Tree State
      rootOffset: Number(view.getBigUint64(offset + 16, true)),
      nodeCount: Number(view.getBigUint64(offset + 24, true)),
      height: view.getUint32(offset + 32, true),
      _reserved2: view.getUint32(offset + 36, true),

      // Free Space Management
      freeListHead: Number(view.getBigUint64(offset + 40, true)),
      totalFileSize: Number(view.getBigUint64(offset + 48, true)),

      // Metadata
      createdAt: Number(view.getBigUint64(offset + 56, true)),
      modifiedAt: Number(view.getBigUint64(offset + 64, true)),
      transactionId: Number(view.getBigUint64(offset + 72, true)),
      flags: Number(view.getBigUint64(offset + 80, true)),

      // Serializer Configuration
      keySerializerType: new TextDecoder()
        .decode(buffer.slice(offset + 88, offset + 104))
        .replace(/\0+$/, ""),
      valueSerializerType: new TextDecoder()
        .decode(buffer.slice(offset + 104, offset + 120))
        .replace(/\0+$/, ""),

      // Reserved
      _reserved: buffer.slice(offset + 120, offset + 496),
    };

    return header;
  }
}
