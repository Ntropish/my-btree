import React, { use, useEffect } from "react";
import { useBTreeStore } from "@/stores/bTreeStore";

export default function BTreeShowcase() {
  const btree = useBTreeStore((state) => state.btree);

  console.log({ btree });
  return (
    <div>
      <h1>B-Tree Showcase</h1>
      <p>Explore the B-Tree functionality here.</p>
      {/* Add your B-Tree showcase components here */}
    </div>
  );
}
