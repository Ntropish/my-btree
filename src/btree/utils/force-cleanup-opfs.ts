/**
 * Utility to force cleanup of OPFS handles
 * Place this in a separate file or at the top of your app
 */

export async function forceCleanupOPFS(fileName: string) {
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

// Call this before initializing the B-tree
export async function ensureCleanState() {
  await forceCleanupOPFS("showcase-btree");
}
