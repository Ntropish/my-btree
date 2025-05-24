/**
 * Worker message type definitions
 */

import {
  BTreeConfig,
  BTreeStats,
  RangeOptions,
  BulkLoadOptions,
} from "./btree";

// Base message types
export interface BTreeMessage {
  id: string;
  type: string;
}

export interface BTreeResponse extends BTreeMessage {
  error?: string;
  result?: any;
}

// Worker request messages
export type WorkerRequest =
  | InitRequest
  | InsertRequest
  | SearchRequest
  | DeleteRequest
  | RangeRequest
  | EntriesRequest
  | ClearRequest
  | StatsRequest
  | BulkLoadRequest
  | VerifyRequest
  | CloseRequest
  | ExistsRequest
  | DestroyRequest;

// Worker response types
export interface WorkerResponse extends BTreeResponse {
  type: WorkerRequest["type"];
}

// Individual request types
export interface InitRequest extends BTreeMessage {
  type: "init";
  config: SerializedBTreeConfig;
}

export interface InsertRequest extends BTreeMessage {
  type: "insert";
  key: any;
  value: any;
}

export interface SearchRequest extends BTreeMessage {
  type: "search";
  key: any;
}

export interface DeleteRequest extends BTreeMessage {
  type: "delete";
  key: any;
}

export interface RangeRequest extends BTreeMessage {
  type: "range";
  start: any;
  end: any;
  options?: RangeOptions;
}

export interface EntriesRequest extends BTreeMessage {
  type: "entries";
}

export interface ClearRequest extends BTreeMessage {
  type: "clear";
}

export interface StatsRequest extends BTreeMessage {
  type: "stats";
}

export interface BulkLoadRequest extends BTreeMessage {
  type: "bulkLoad";
  data: Array<[any, any]>;
  options?: BulkLoadOptions;
}

export interface VerifyRequest extends BTreeMessage {
  type: "verify";
}

export interface CloseRequest extends BTreeMessage {
  type: "close";
}

export interface ExistsRequest extends BTreeMessage {
  type: "exists";
  name: string;
}

export interface DestroyRequest extends BTreeMessage {
  type: "destroy";
  name: string;
}

// Serialized config for passing to worker
export interface SerializedBTreeConfig {
  name: string;
  order?: number;
  keySerializer: {
    type: string;
    config?: any;
  };
  valueSerializer: {
    type: string;
    config?: any;
  };
  cacheSize?: number;
  writeMode?: "write-through" | "write-back";
  enableTransactionLog?: boolean;
  compareKeys?: string; // Serialized function
  _openExisting?: boolean;
}

// Progress event types
export interface ProgressEvent extends BTreeMessage {
  type: "progress";
  operation: string;
  current: number;
  total: number;
  message?: string;
}

// Error types
export interface ErrorEvent extends BTreeMessage {
  type: "error";
  error: string;
  code?: string;
  details?: any;
}
