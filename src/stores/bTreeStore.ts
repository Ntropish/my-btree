/**
 * Zustand store for managing B-Tree instance
 */

import { create } from "zustand";
import {
  BTree,
  NumberSerializer,
  StringSerializer,
  type BTreeStats,
} from "../btree";

type Entry = [number, string];

// Force cleanup utility
async function forceCleanupOPFS(fileName: string) {
  try {
    const root = await navigator.storage.getDirectory();

    // Try to remove the file entirely
    try {
      await root.removeEntry(fileName);
      console.log(`Removed file: ${fileName}`);
    } catch (e) {
      console.log(`File ${fileName} doesn't exist or couldn't be removed:`, e);
    }

    // Give the browser time to release handles
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error("Error during OPFS cleanup:", error);
  }
}

interface BTreeStore {
  // State
  btree: BTree<number, string> | null;
  loading: boolean;
  initialized: boolean;
  entries: Entry[];
  stats: BTreeStats | null;
  error: string | null;

  // Search state
  searchResult: string | null;
  rangeResults: Entry[];

  // Progress state
  bulkLoadProgress: number;

  // Actions
  insert: (key: number, value: string) => Promise<void>;
  search: (key: number) => Promise<void>;
  delete: (key: number) => Promise<void>;
  range: (
    start: number,
    end: number,
    includeStart?: boolean,
    includeEnd?: boolean
  ) => Promise<void>;
  clear: () => Promise<void>;
  bulkLoad: () => Promise<void>;
  verify: () => Promise<void>;
  refreshData: () => Promise<void>;

  // Setters
  setSearchResult: (result: string | null) => void;
  setRangeResults: (results: Entry[]) => void;
  setError: (error: string | null) => void;
}

export const useBTreeStore = create<BTreeStore>((set, get) => {
  // Start initialization
  (async () => {
    set({ loading: true, error: null });
    let btreeProxy: BTree<number, string> | null = null;

    try {
      // Force cleanup to ensure no stale handles
      await forceCleanupOPFS("showcase-btree");

      // Create new instance
      console.log("Creating new B-tree instance...");
      btreeProxy = await BTree.openOrCreate<number, string>({
        name: "showcase-btree",
        keySerializer: new NumberSerializer(),
        valueSerializer: new StringSerializer(),
        order: 32,
        cacheSize: 100,
      });

      console.log("B-tree created successfully");

      // Think about setting up close event listeners here

      set({
        btree: btreeProxy,
        initialized: true,
        loading: false,
      });

      // Initial data refresh
      await get().refreshData();
    } catch (error) {
      console.error("Failed to initialize B-tree:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize B-tree",
        loading: false,
        initialized: false,
      });
    } finally {
      set({ loading: false });
    }
  })();

  return {
    // Initial state
    btree: null,
    loading: false,
    initialized: false,
    entries: [],
    stats: null,
    error: null,
    searchResult: null,
    rangeResults: [],
    bulkLoadProgress: 0,

    // Insert operation
    insert: async (key: number, value: string) => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        await btree.insert(key, value);
        await get().refreshData();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Insert failed",
        });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Search operation
    search: async (key: number) => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        const result = await btree.search(key);
        set({ searchResult: result });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Search failed",
        });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Delete operation
    delete: async (key: number) => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        const deleted = await btree.delete(key);
        if (!deleted) {
          throw new Error(`Key ${key} not found`);
        }
        await get().refreshData();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Delete failed",
        });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Range query
    range: async (
      start: number,
      end: number,
      includeStart = true,
      includeEnd = true
    ) => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        const results = await btree.range(start, end, {
          includeStart,
          includeEnd,
        });
        set({ rangeResults: results });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Range query failed",
        });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Clear all data
    clear: async () => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        await btree.clear();
        await get().refreshData();
        set({ searchResult: null, rangeResults: [] });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Clear failed" });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Bulk load demo data
    bulkLoad: async () => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null, bulkLoadProgress: 0 });

      try {
        // Generate demo data
        const demoData: Array<[number, string]> = [];
        const words = [
          "apple",
          "banana",
          "cherry",
          "date",
          "elderberry",
          "fig",
          "grape",
          "honeydew",
        ];

        for (let i = 0; i < 100; i++) {
          const word = words[Math.floor(Math.random() * words.length)];
          demoData.push([i * 10, `${word}_${i}`]);
        }

        await btree.bulkLoad(demoData, {
          sorted: true,
          onProgress: (loaded, total) => {
            set({ bulkLoadProgress: (loaded / total) * 100 });
          },
        });

        await get().refreshData();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Bulk load failed",
        });
        throw error;
      } finally {
        set({ loading: false, bulkLoadProgress: 0 });
      }
    },

    // Verify tree integrity
    verify: async () => {
      const { btree } = get();
      if (!btree) {
        set({ error: "B-tree not initialized" });
        return;
      }

      set({ loading: true, error: null });

      try {
        const isValid = await btree.verify();
        if (!isValid) {
          throw new Error("Tree integrity check failed");
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Verification failed",
        });
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    // Refresh data and stats
    refreshData: async () => {
      const { btree } = get();
      if (!btree) return;

      try {
        const [allEntries, treeStats] = await Promise.all([
          btree.entries(),
          btree.stats(),
        ]);

        set({ entries: allEntries, stats: treeStats });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to refresh data",
        });
      }
    },

    // Setters
    setSearchResult: (result) => set({ searchResult: result }),
    setRangeResults: (results) => set({ rangeResults: results }),
    setError: (error) => set({ error }),
  };
});
