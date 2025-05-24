/**
 * Manages direct interactions with an OPFS file for the B-Tree.
 * Handles file operations, and reading/writing blocks/pages.
 * This class is intended to be used internally by the BTree.
 */
export class OPFSManager {
  private fileHandle: FileSystemFileHandle | null = null;
  private accessHandle: FileSystemSyncAccessHandle | null = null; // For use in Worker
  private fileName: string;
  private pageSize: number;
  private isWorkerContext: boolean;

  constructor(
    fileName: string,
    pageSize: number,
    isWorkerContext: boolean = false
  ) {
    this.fileName = fileName;
    this.pageSize = pageSize;
    this.isWorkerContext = isWorkerContext;
  }

  private async getDirectory(): Promise<FileSystemDirectoryHandle> {
    return navigator.storage.getDirectory();
  }

  async open(): Promise<void> {
    if (this.isWorkerContext && this.accessHandle) return;
    if (!this.isWorkerContext && this.fileHandle) return;

    const rootDir = await this.getDirectory();
    this.fileHandle = await rootDir.getFileHandle(this.fileName, {
      create: true,
    });

    if (this.isWorkerContext) {
      // Synchronous access handle for workers
      // @ts-ignore createSyncAccessHandle is not yet in all standard TS lib files
      // but should be available if 'WebWorker' lib is included and OPFS is supported.
      this.accessHandle = await this.fileHandle.createSyncAccessHandle();
    }
  }

  async close(): Promise<void> {
    if (this.accessHandle) {
      // @ts-ignore
      await this.accessHandle.close();
      this.accessHandle = null;
    }
    this.fileHandle = null; // The file handle itself doesn't have an explicit close in the async API for the handle object itself
  }

  async ensureFileOpen(): Promise<void> {
    if (this.isWorkerContext) {
      if (!this.accessHandle) await this.open();
    } else {
      if (!this.fileHandle) await this.open();
    }
  }

  // Methods for worker (synchronous)
  readBlockSync(blockId: number): Uint8Array {
    if (!this.accessHandle)
      throw new Error("OPFSManager (sync): File not open or not in worker.");
    const buffer = new Uint8Array(this.pageSize);
    // @ts-ignore
    const readBytes = this.accessHandle.read(buffer, {
      at: blockId * this.pageSize,
    });
    if (readBytes < this.pageSize) {
      // This might happen if we read a partially written block or end of file.
      // Depending on strategy, could be an error or expected.
      // For simplicity, we expect full blocks or zeroed regions.
    }
    return buffer;
  }

  writeBlockSync(blockId: number, data: Uint8Array): void {
    if (!this.accessHandle)
      throw new Error("OPFSManager (sync): File not open or not in worker.");
    if (data.byteLength > this.pageSize) {
      throw new Error(
        `Data size (${data.byteLength}) exceeds page size (${this.pageSize}).`
      );
    }
    // @ts-ignore
    this.accessHandle.write(data, { at: blockId * this.pageSize });
  }

  // Methods for main thread (asynchronous)
  async readBlock(blockId: number): Promise<Uint8Array> {
    if (this.isWorkerContext) throw new Error("Use readBlockSync in worker");
    if (!this.fileHandle) throw new Error("OPFSManager: File not open.");

    // To read a specific block, we need to read a slice of the file.
    const file = await this.fileHandle.getFile();
    const offset = blockId * this.pageSize;
    if (offset + this.pageSize > file.size) {
      // Reading beyond EOF, might return a shorter slice or throw.
      // For B-Tree, often implies creating a new block or reading an uninitialized one.
      // For now, let's assume we expect it to exist or we handle empty reads.
      // This could be an empty/zeroed block if allocated but not fully written.
      const emptyBlock = new Uint8Array(this.pageSize);
      // If we read past what's physically there, slice will return less.
      const slice = file.slice(offset, offset + this.pageSize);
      const buffer = await slice.arrayBuffer();
      emptyBlock.set(new Uint8Array(buffer)); // Copy what was read
      return emptyBlock;
    }
    const slice = file.slice(offset, offset + this.pageSize);
    return new Uint8Array(await slice.arrayBuffer());
  }

  async writeBlock(blockId: number, data: Uint8Array): Promise<void> {
    if (this.isWorkerContext) throw new Error("Use writeBlockSync in worker");
    if (!this.fileHandle) throw new Error("OPFSManager: File not open.");
    if (data.byteLength > this.pageSize) {
      throw new Error(
        `Data size (${data.byteLength}) exceeds page size (${this.pageSize}).`
      );
    }

    const writable = await this.fileHandle.createWritable();
    await writable.write({
      type: "write",
      position: blockId * this.pageSize,
      data,
    });
    await writable.close();
  }

  async flush(): Promise<void> {
    if (this.isWorkerContext && this.accessHandle) {
      // @ts-ignore
      await this.accessHandle.flush();
    }
    // For async writable, close() typically ensures data is flushed.
    // If further explicit flush is needed for FileSystemFileHandle, it would be through its writable stream.
  }

  async getFileSize(): Promise<number> {
    if (this.isWorkerContext && this.accessHandle) {
      // @ts-ignore
      return this.accessHandle.getSize();
    }
    if (this.fileHandle) {
      const file = await this.fileHandle.getFile();
      return file.size;
    }
    return 0;
  }

  static async deleteStore(name: string): Promise<void> {
    const rootDir = await navigator.storage.getDirectory();
    try {
      await rootDir.removeEntry(name);
    } catch (error: any) {
      if (error.name === "NotFoundError") {
        // File not found, which is fine for a delete operation
        return;
      }
      throw error;
    }
  }

  static async storeExists(name: string): Promise<boolean> {
    const rootDir = await navigator.storage.getDirectory();
    try {
      await rootDir.getFileHandle(name);
      return true;
    } catch (error: any) {
      if (error.name === "NotFoundError") {
        return false;
      }
      throw error; // Other errors should be propagated
    }
  }
}
